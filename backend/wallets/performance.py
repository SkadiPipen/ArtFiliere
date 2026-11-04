"""Dated admin performance metrics from recorded payment and funding events."""
from datetime import datetime, time, timedelta
from decimal import Decimal
from zoneinfo import ZoneInfo
from django.db.models import Sum, Count, Q, Exists, OuterRef
from django.db.models.functions import TruncDate, Coalesce
from django.utils import timezone
from rest_framework.response import Response
from authentication.views import AuthenticatedAPIView
from authentication.permissions import IsPlatformAdmin
from commissions.models import CommissionRequest
from messaging.models import Message, RoyaltyReceipt
from .auction_delivery import AUCTION_MESSAGE
from .models import PaymentSession
from .analytics import admin_analytics

CHANNELS = ('shop', 'auction', 'commission', 'royalty')
REPORT_ZONE = ZoneInfo('Asia/Manila')


def performance(days, today=None):
    today = today or timezone.localdate(timezone=REPORT_ZONE)
    starts = today - timedelta(days=days - 1)
    end = today + timedelta(days=1)
    payments = PaymentSession.objects.filter(status__in=['paid', 'refunded'], is_simulated=False)
    commissions = CommissionRequest.objects.filter(flow_version=2, funded_at__isnull=False)

    def daily(query, timestamp, value, start, stop):
        begin = datetime.combine(start, time.min, tzinfo=REPORT_ZONE)
        finish = datetime.combine(stop, time.min, tzinfo=REPORT_ZONE)
        return {row['day']: row for row in query.filter(**{timestamp + '__gte': begin, timestamp + '__lt': finish})
                .annotate(day=TruncDate(timestamp, tzinfo=REPORT_ZONE)).values('day')
                .annotate(amount=Sum(value), count=Count('pk')).order_by('day')}

    auction_messages = Message.objects.filter(agreement_id=OuterRef('agreement_id'), sender__isnull=True, body=AUCTION_MESSAGE)
    payments = payments.annotate(auction_record=Exists(auction_messages))
    auction_filter = Q(auction_record=True) | Q(artwork__sale_type__iexact='auction')
    shop_payments = payments.exclude(auction_filter)
    auction_payments = payments.filter(auction_filter)
    earned_commissions = commissions.filter(status='COMPLETE', asset__isnull=False)
    royalty_receipts = RoyaltyReceipt.objects.filter(period__status__in=['funded', 'paid'])
    royalties = royalty_receipts.filter(period__status='paid').annotate(
        recognized_at=Coalesce('period__funding__released_at', 'period__paid_at', 'created_at'))

    def series(start, stop):
        collected = {
            'shop': daily(shop_payments, 'paid_at', 'gross_amount', start, stop),
            'auction': daily(auction_payments, 'paid_at', 'gross_amount', start, stop),
            'commission': daily(commissions, 'funded_at', 'time_duration', start, stop),
            'royalty': daily(royalty_receipts, 'created_at', 'amount', start, stop),
        }
        earnings = {
            'shop': daily(shop_payments.filter(status='paid'), 'paid_at', 'platform_fee', start, stop),
            'auction': daily(auction_payments.filter(status='paid'), 'paid_at', 'platform_fee', start, stop),
            'commission': daily(earned_commissions, 'asset__created_at', 'platform_fee', start, stop),
            'royalty': daily(royalties, 'recognized_at', 'platform_fee', start, stop),
        }
        artist_royalties = daily(royalties, 'recognized_at', 'period__amount', start, stop)
        rows = []
        for offset in range(days):
            day = start + timedelta(days=offset)
            row = {'date': str(day)}
            for channel in CHANNELS:
                row[channel] = str(collected[channel].get(day, {}).get('amount', Decimal(0)))
                row[channel + '_count'] = collected[channel].get(day, {}).get('count', 0)
                fees = earnings[channel].get(day, {}).get('amount', Decimal(0))
                row[channel + '_earnings'] = str(fees)
            row['artist_royalties'] = str(artist_royalties.get(day, {}).get('amount', Decimal(0)))
            row['total'] = str(sum(Decimal(row[channel]) for channel in collected))
            row['total_earnings'] = str(sum(Decimal(row[channel + '_earnings']) for channel in collected))
            rows.append(row)
        return rows

    def channel_summary(rows, channel):
        total = sum((Decimal(row[channel]) for row in rows), Decimal(0))
        fees = sum((Decimal(row[channel + '_earnings']) for row in rows), Decimal(0))
        count = sum(row[channel + '_count'] for row in rows)
        return {'collected': str(total), 'earnings': str(fees), 'payments': count,
                'artist_royalties': str(sum((Decimal(row['artist_royalties']) for row in rows), Decimal(0))) if channel == 'royalty' else '0.00',
                'average_payment': str((total / count).quantize(Decimal('.01'))) if count else '0.00'}

    def summary(rows):
        channels = {channel: channel_summary(rows, channel) for channel in CHANNELS}
        total = sum((Decimal(value['collected']) for value in channels.values()), Decimal(0))
        count = sum(value['payments'] for value in channels.values())
        return {'collected': str(total), 'earnings': str(sum((Decimal(value['earnings']) for value in channels.values()), Decimal(0))),
                'payments': count, 'shop_payments': channels['shop']['payments'], 'auction_payments': channels['auction']['payments'],
                'funded_commissions': channels['commission']['payments'],
                'average_payment': str((total / count).quantize(Decimal('.01'))) if count else '0.00'}

    rows = series(starts, end)
    previous = series(starts - timedelta(days=days), starts)
    return {'as_of': timezone.now().isoformat(), 'timezone': 'Asia/Manila', 'days': days,
            'starts_on': str(starts), 'ends_on': str(today), 'series': rows,
            'summary': summary(rows), 'previous': summary(previous), 'overview': admin_analytics(),
            'channel_summaries': {channel: {'current': channel_summary(rows, channel), 'previous': channel_summary(previous, channel)} for channel in CHANNELS},
            'channels': {channel: channel_summary(rows, channel)['collected'] for channel in CHANNELS},
            'undated_shop_payments': payments.filter(paid_at__isnull=True).count(),
            'undated_completed_commissions': commissions.filter(status='COMPLETE', asset__isnull=True).count()}


class AdminPerformanceView(AuthenticatedAPIView):
    permission_classes = [IsPlatformAdmin]
    def get(self, request):
        try:
            days = int(request.query_params.get('days', '30'))
        except (TypeError, ValueError):
            return Response({'error': 'Choose 7, 30, or 90 days.'}, status=400)
        if days not in (7, 30, 90):
            return Response({'error': 'Choose 7, 30, or 90 days.'}, status=400)
        response = Response(performance(days))
        response['Cache-Control'] = 'private, no-store'
        return response
