"""Reporting periods, private evidence, and artist approval for signed licenses."""
import base64
import binascii
import calendar
from datetime import timedelta
from io import BytesIO

from PIL import Image
from django.db import transaction
from django.db.models import Q
from django.http import HttpResponse
from django.utils import timezone
from rest_framework.response import Response
from authentication.views import AuthenticatedAPIView
from authentication.permissions import IsAuthenticatedUser
from .models import Agreement, RoyaltyPeriod, RoyaltyMandate
from .royalty_rules import MONTHS, basis_for, calculate


def add_months(day, months):
    year, month = divmod(day.year * 12 + day.month - 1 + months, 12)
    return day.replace(year=year, month=month + 1, day=min(day.day, calendar.monthrange(year, month + 1)[1]))


def ensure_periods(agreement, today=None):
    terms = agreement.compensation_terms
    if (agreement.status != 'accepted' or agreement.compensation_type not in ('royalty', 'hybrid')
            or not agreement.artist_signed_at or not agreement.buyer_signed_at
            or not terms.get('reporting_policy')):
        return
    today = today or timezone.localdate()
    anchor = max(agreement.artist_signed_at, agreement.buyer_signed_at).date()
    if terms.get('reporting_policy') == 'commission_delivery_plus_7_days_artist_approval':
        commission = getattr(agreement, 'commission_contract', None)
        if not commission or commission.status != 'COMPLETE' or commission.disputed or not hasattr(commission, 'asset'):
            return
        anchor = timezone.localdate(commission.asset.created_at)
    interval = MONTHS[terms['reporting_frequency']]
    duration = terms['reporting_duration_months']
    for offset in range(0, duration, interval):
        start = add_months(anchor, offset)
        if start > today:
            break
        end = add_months(anchor, min(offset + interval, duration))
        RoyaltyPeriod.objects.get_or_create(agreement=agreement, starts_on=start,
            defaults={'ends_on': end, 'due_on': end + timedelta(days=7), 'terms': terms})


def evidence_files(raw):
    if not isinstance(raw, list) or not 1 <= len(raw) <= 3:
        raise ValueError('Attach 1 to 3 supporting images or PDF files, up to 5 MB total.')
    result, total = [], 0
    for entry in raw:
        try:
            if not isinstance(entry, dict):
                raise ValueError()
            name, uri = entry.get('name'), entry.get('data')
            if not isinstance(name, str) or not 1 <= len(name) <= 200 or not isinstance(uri, str) or len(uri) > 7 * 1024 * 1024:
                raise ValueError()
            header, encoded = uri.split(',', 1)
            mime = header.removeprefix('data:').removesuffix(';base64')
            if header != f'data:{mime};base64' or mime not in ('application/pdf', 'image/jpeg', 'image/png', 'image/webp'):
                raise ValueError()
            data = base64.b64decode(encoded, validate=True)
            total += len(data)
            if total > 5 * 1024 * 1024:
                raise ValueError()
            if mime == 'application/pdf':
                if not data.startswith(b'%PDF-') or b'%%EOF' not in data[-1024:]:
                    raise ValueError()
            else:
                with Image.open(BytesIO(data)) as image:
                    if image.width * image.height > 25000000 or image.format not in ('JPEG', 'PNG', 'WEBP'):
                        raise ValueError()
                    image.verify()
            result.append({'name': name, 'mime': mime, 'data': encoded})
        except (ValueError, TypeError, binascii.Error, OSError, Image.DecompressionBombError):
            raise ValueError('Attach valid JPEG, PNG, WebP or PDF evidence, up to 5 MB total.') from None
    return result


def royalty_title(agreement):
    commission = getattr(agreement, 'commission_contract', None)
    return agreement.artwork.title if agreement.artwork else commission.title if commission else 'Artwork'


def period_data(period, user):
    return {'id': period.pk, 'agreement_id': period.agreement_id, 'title': royalty_title(period.agreement),
            'is_buyer': period.agreement.buyer_id == user.pk, 'starts_on': str(period.starts_on), 'ends_on': str(period.ends_on),
            'due_on': str(period.due_on), 'status': period.status,
            'overdue': timezone.localdate() > period.due_on and period.status not in ('paid', 'zero_due'),
            'can_submit': timezone.localdate() >= period.ends_on and period.status in ('awaiting_report', 'rejected'),
            'terms': period.terms, 'basis': basis_for(period.terms), 'metrics': period.metrics,
            'amount': str(period.amount) if period.amount is not None else None, 'review_note': period.review_note,
            'evidence': [{'name': item['name'], 'path': f'royalties/periods/{period.pk}/evidence/{i}/'} for i, item in enumerate(period.evidence)],
            'history': [{key: value for key, value in item.items() if key != 'evidence'} for item in period.history],
            'collection_error': period.collection_error}


class RoyaltyReportsView(AuthenticatedAPIView):
    permission_classes = [IsAuthenticatedUser]

    def get(self, request, period_id=None):
        user = self.get_request_user(request)
        if period_id is not None:
            period = RoyaltyPeriod.objects.filter(Q(agreement__buyer=user) | Q(agreement__artist=user)).select_related('agreement__artwork').filter(pk=period_id).first()
            if not period:
                return Response({'error': 'Report not found.'}, status=404)
            response = Response(period_data(period, user))
            response['Cache-Control'] = 'private, no-store'
            return response
        agreements = Agreement.objects.filter(Q(buyer=user) | Q(artist=user)).filter(compensation_type__in=['royalty', 'hybrid'], status='accepted')
        licenses = []
        for agreement in agreements:
            ensure_periods(agreement)
            mandate = RoyaltyMandate.objects.filter(agreement=agreement).first()
            licenses.append({'id': agreement.pk, 'title': royalty_title(agreement),
                             'is_buyer': agreement.buyer_id == user.pk, 'configured': bool(agreement.compensation_terms.get('reporting_policy')),
                             'mandate_status': mandate.status if mandate else 'not_linked'})
        periods = RoyaltyPeriod.objects.filter(Q(agreement__buyer=user) | Q(agreement__artist=user)).select_related('agreement__artwork').order_by('-starts_on', '-pk')
        from django.conf import settings
        response = Response({'agreements': licenses, 'periods': [period_data(p, user) for p in periods],
                             'collection_enabled': settings.ROYALTY_COLLECTION_ENABLED})
        response['Cache-Control'] = 'private, no-store'
        return response

    @transaction.atomic
    def post(self, request, period_id):
        user = self.get_request_user(request)
        period = RoyaltyPeriod.objects.select_for_update(of=('self',)).select_related('agreement__artwork').filter(pk=period_id, agreement__buyer=user).first()
        if not period:
            return Response({'error': 'Report not found.'}, status=404)
        if period.status not in ('awaiting_report', 'rejected') or timezone.localdate() < period.ends_on:
            return Response({'error': 'This report is not open for submission.'}, status=409)
        try:
            metrics, amount = calculate(period.terms, request.data.get('metrics'))
            evidence = evidence_files(request.data.get('evidence'))
        except ValueError as error:
            return Response({'error': str(error)}, status=400)
        period.metrics, period.amount, period.evidence = metrics, amount, evidence
        period.status, period.submitted_at, period.review_note = 'submitted', timezone.now(), ''
        period.history.append({'action': 'submitted', 'at': period.submitted_at.isoformat(), 'metrics': metrics, 'amount': str(amount), 'evidence': evidence})
        period.save()
        return Response(period_data(period, user))

    @transaction.atomic
    def patch(self, request, period_id):
        user = self.get_request_user(request)
        period = RoyaltyPeriod.objects.select_for_update(of=('self',)).select_related('agreement__artwork').filter(pk=period_id, agreement__artist=user).first()
        if not period:
            return Response({'error': 'Report not found.'}, status=404)
        action, note = request.data.get('action'), request.data.get('note', '')
        if period.status != 'submitted':
            return Response({'error': 'Only submitted reports may be reviewed.'}, status=409)
        if action not in ('approve', 'reject') or not isinstance(note, str) or len(note) > 1000 or (action == 'reject' and not note.strip()):
            return Response({'error': 'Choose approve or reject. Rejection requires a reason (up to 1,000 characters).'}, status=400)
        period.review_note = note.strip()
        period.status = 'approved' if action == 'approve' else 'rejected'
        period.approved_at = timezone.now() if action == 'approve' else None
        if action == 'approve' and period.amount == 0:
            period.status = 'zero_due'
        period.history.append({'action': action, 'at': timezone.now().isoformat(), 'note': note.strip(), 'reviewer': user.pk})
        period.save()
        return Response(period_data(period, user))


class RoyaltyEvidenceView(AuthenticatedAPIView):
    permission_classes = [IsAuthenticatedUser]

    def get(self, request, period_id, index):
        user = self.get_request_user(request)
        period = RoyaltyPeriod.objects.filter(Q(agreement__buyer=user) | Q(agreement__artist=user)).filter(pk=period_id).first()
        if not period or index >= len(period.evidence):
            return Response({'error': 'Evidence not found.'}, status=404)
        file = period.evidence[index]
        response = HttpResponse(base64.b64decode(file['data']), content_type=file['mime'])
        response['Content-Disposition'] = 'attachment; filename="royalty-evidence.' + {'application/pdf': 'pdf', 'image/jpeg': 'jpg', 'image/png': 'png', 'image/webp': 'webp'}[file['mime']] + '"'
        response['Cache-Control'], response['X-Content-Type-Options'] = 'private, no-store', 'nosniff'
        return response
