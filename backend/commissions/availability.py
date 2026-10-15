from datetime import datetime, time, timedelta
from zoneinfo import ZoneInfo

from rest_framework.response import Response
from rest_framework.views import APIView
from django.db.models import Q
from django.utils import timezone

from users.models import User
from .models import CommissionRequest

CALENDAR_ZONE = ZoneInfo('Asia/Manila')
ACTIVE_STATUSES = ('IN_PROGRESS', 'STAGE_1', 'STAGE_2', 'STAGE_3')

def reserved():
    return Q(status__in=ACTIVE_STATUSES) | Q(status='AWAITING_FUNDS', funding_due_at__gt=timezone.now())


def calendar_day(deadline):
    return deadline.astimezone(CALENDAR_ZONE).date()


def conflicts(artist_id, deadline, exclude=None):
    day = calendar_day(deadline)
    start = datetime.combine(day, time.min, tzinfo=CALENDAR_ZONE)
    rows = CommissionRequest.objects.filter(
        reserved(), artist_id=artist_id,
        deadline__gte=start, deadline__lt=start + timedelta(days=1),
    )
    if exclude is not None:
        rows = rows.exclude(pk=exclude)
    return rows.exists()


class ArtistAvailabilityView(APIView):
    """Public availability only; no commission or buyer details are exposed."""
    def get(self, request, artist_id):
        if not User.objects.filter(pk=artist_id, role=User.Role.ARTIST).exists():
            return Response({'error': 'Artist not found.'}, status=404)
        deadlines = CommissionRequest.objects.filter(
            reserved(), artist_id=artist_id,
        ).values_list('deadline', flat=True)
        return Response({
            'artist_id': artist_id, 'timezone': 'Asia/Manila',
            'booked_dates': sorted({calendar_day(value).isoformat() for value in deadlines}),
        })
