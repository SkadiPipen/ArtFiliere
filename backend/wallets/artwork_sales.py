"""Calendar week/month artwork purchases, split by listing format."""
from datetime import datetime, time, timedelta
from decimal import Decimal
from zoneinfo import ZoneInfo

from django.db.models import Count, Sum
from django.db.models.functions import Lower, TruncDate
from django.utils import timezone

from .models import PaymentSession

REPORT_ZONE = ZoneInfo('Asia/Manila')


def artwork_sales(now=None):
    now = now or timezone.now()
    today = timezone.localdate(now, REPORT_ZONE)
    starts = {'week': today - timedelta(days=today.weekday()), 'month': today.replace(day=1)}
    begin = datetime.combine(min(starts.values()), time.min, tzinfo=REPORT_ZONE)
    paid = PaymentSession.objects.filter(status='paid', is_simulated=False, paid_at__gte=begin, paid_at__lte=now)
    grouped = paid.annotate(day=TruncDate('paid_at', tzinfo=REPORT_ZONE), format=Lower('artwork__art_type')).values('day', 'format').annotate(count=Count('pk'), collected=Sum('gross_amount'))
    buckets = {(r['day'], r['format']): r for r in grouped}
    result = {'timezone': 'Asia/Manila', 'as_of': now.isoformat(),
              'definition': 'Paid purchase transactions, including auctions; repeat digital licenses count separately. Excludes simulated, pending, refunded and undated payments. Commissions are reported separately.'}
    for period, start in starts.items():
        rows = []
        for offset in range((today - start).days + 1):
            day = start + timedelta(days=offset)
            row = {'date': day.isoformat()}
            for kind in ['digital', 'physical']:
                value = buckets.get((day, kind), {})
                row[kind] = value.get('count', 0)
                row[kind + '_collected'] = str(value.get('collected', Decimal(0)))
            row['total'] = row['digital'] + row['physical']
            rows.append(row)
        summary = {kind: sum(row[kind] for row in rows) for kind in ['digital', 'physical', 'total']}
        summary['collected'] = str(sum((Decimal(row[kind + '_collected']) for row in rows for kind in ['digital', 'physical']), Decimal(0)))
        result[period] = {'starts_on': str(start), 'ends_on': str(today), 'series': rows, 'summary': summary}
    result['undated_paid_purchases'] = PaymentSession.objects.filter(status='paid', is_simulated=False, paid_at__isnull=True).count()
    return result
