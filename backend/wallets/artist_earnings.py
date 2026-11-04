"""Read-only artist earnings, using confirmed payment and payout records."""
import calendar
import csv
from datetime import datetime, date
from decimal import Decimal
from io import StringIO
from zoneinfo import ZoneInfo
from django.http import HttpResponse
from django.utils import timezone
from rest_framework.response import Response
from authentication.views import AuthenticatedAPIView
from .models import PaymentSession, WalletAccount
from commissions.models import CommissionRequest, CommissionResale
from messaging.models import RoyaltyPeriod

PAGE_SIZE = 4
ZERO = Decimal('0')
def money(value):
    return Decimal(str(value or 0)).quantize(Decimal('.01'))

def earnings_rows(user):
    rows = []
    def add(key, title, buyer, category, date, gross, fee, shipping, net, status, reason, reference, history=None, destination=''):
        rows.append(dict(id=key, title=title, buyer=buyer, category=category, date=timezone.localtime(date, ZoneInfo('Asia/Manila')).isoformat(), gross=str(money(gross)), fees=str(money(fee)), shipping=str(money(shipping)), net=str(money(net)), status=status, reason=reason, reference=reference, history=history or [], destination=destination, royalty_deduction=str(max(ZERO, money(gross)-money(fee)-money(shipping)-money(net))) if category in ('shop', 'auction') else '0.00'))
    for payment in PaymentSession.objects.filter(artist=user, is_simulated=False).select_related('artwork', 'buyer', 'agreement').prefetch_related('ledger_entries'):
        entries = list(payment.ledger_entries.all())
        kinds = {e.entry_type for e in entries}
        status, reason = 'awaiting_payment', 'Buyer payment has not been verified.'
        date = payment.paid_at or payment.created_at
        if payment.status == 'refunded': status, reason = 'refunded', 'Payment refunded; excluded from earnings.'
        elif payment.status == 'expired': status, reason = 'expired', 'Checkout expired without verified payment.'
        elif payment.status == 'paid':
            if 'payout' in kinds: status, reason = 'received', 'Payout recorded in the wallet ledger.'
            elif 'sale_available' in kinds: status, reason = 'available', 'Released to your platform wallet; bank/e-wallet payout is not confirmed.'
            else: status, reason = 'pending', 'Awaiting delivery, transaction approval, or payment-control release.'
            match = next((e for e in entries if e.entry_type == ('payout' if status == 'received' else 'sale_available')), None)
            if match: date = match.created_at
        shipping = payment.agreement.delivery_fee if payment.agreement else ZERO
        add(f'sale-{payment.pk}', payment.artwork.title, payment.buyer.username, 'auction' if (payment.agreement and str(payment.artwork.sale_type).lower() == 'auction') else 'shop', date, payment.gross_amount, payment.platform_fee, shipping, payment.artist_amount, status, reason, payment.reference_id,
            [dict(at=e.created_at.isoformat(), label=e.get_entry_type_display(), amount=str(e.amount)) for e in entries])
    profile = getattr(user, 'commissionpayoutprofile', None)
    recipient = profile.recipient if profile else {}
    account = str(recipient.get('account_details', {}).get('account_number', ''))
    destination = ('•••• ' + account[-4:]) if account else 'Payout recipient not configured'
    for c in CommissionRequest.objects.filter(artist=user).select_related('buyer').prefetch_related('milestones', 'refunds'):
        refunded = sum((r.amount for r in c.refunds.all() if r.status in ('SUCCEEDED', 'WALLET_CREDITED')), ZERO)
        for m in c.milestones.all():
            shipping = money(c.locked_terms.get('delivery_fee', 0)) if m.milestone_number == 3 else ZERO
            net = max(ZERO, m.amount - shipping)
            status, reason = 'awaiting_payment', 'Awaiting verified full commission funding.'
            if c.funded_at:
                status, reason = 'pending', f'Awaiting buyer approval of {m.stage_label}.'
                if m.approved_at: reason = 'Milestone approved; awaiting payout release.'
                if m.payout_status == 'SUCCEEDED': status, reason = 'received', 'Bank/e-wallet payout confirmed.'
                elif m.payout_status == 'PROCESSING': status, reason = 'processing', 'Payout submitted; awaiting provider confirmation.'
                elif m.payout_status in ('FAILED', 'REJECTED', 'REVERSED'): status, reason = 'failed', 'Payout failed or reversed; contact support.'
                elif m.payout_status in ('CONFIG_REQUIRED', 'RETRY_PENDING', 'RECONCILE'): reason = m.payout_error or 'Payout configuration or reconciliation required.'
                elif refunded and c.status == 'CANCELLED': status, reason = 'cancelled', 'Commission cancelled; see refund record. Unreleased milestones are excluded.'
            fee = money(c.platform_fee * Decimal(m.percentage) / 100)
            if m.milestone_number == 3:
                fee = c.platform_fee - sum((money(c.platform_fee * Decimal(other.percentage) / 100) for other in c.milestones.all() if other.milestone_number != 3), ZERO)
            history = [dict(at=at.isoformat(), label=label, amount='') for at, label in [(c.funded_at, 'Funding verified'), (m.approved_at, 'Milestone approved'), (m.paid_at, 'Payout confirmed')] if at]
            add(f'commission-{m.pk}', f'{c.title} · {m.stage_label}', c.buyer.username, 'commission', m.paid_at or m.approved_at or c.funded_at or c.created_at, net+shipping+fee, fee, shipping, net, status, reason, m.payout_reference or c.funding_reference or f'commission-{c.pk}', history, destination)
        if refunded:
            add(f'refund-{c.pk}', c.title + ' · Refund', c.buyer.username, 'commission', c.created_at, refunded, 0, 0, 0, 'refunded', 'Refund includes any applicable delivery charges; excluded from earnings.', f'commission-{c.pk}-refund')
    for period in RoyaltyPeriod.objects.filter(agreement__artist=user).select_related('agreement__buyer', 'agreement__artwork', 'funding', 'receipt'):
        funding = getattr(period, 'funding', None)
        receipt = getattr(period, 'receipt', None)
        status, reason = 'awaiting_payment', 'Royalty report or payment pending.'
        if funding and funding.paid_at: status, reason = 'pending', 'Verified royalty payment awaiting administrator release.'
        if funding and funding.released_at: status, reason = 'available', 'Released to platform wallet; bank/e-wallet payout is not confirmed.'
        elif receipt and not funding: status, reason = 'available', 'Royalty collection recorded; external payout is not confirmed.'
        add(f'royalty-{period.pk}', (period.agreement.artwork.title if period.agreement.artwork else 'Commercial license') + ' · Royalty', period.agreement.buyer.username, 'commercial_royalty', (funding.released_at or funding.paid_at or funding.created_at) if funding else period.paid_at or period.submitted_at or timezone.make_aware(datetime.combine(period.starts_on, datetime.min.time())), period.amount or ZERO, 0, 0, period.amount or ZERO, status, reason, funding.reference if funding else period.provider_request_id or f'royalty-{period.pk}')
    for resale in CommissionResale.objects.filter(asset__original_artist=user, payment__is_simulated=False).select_related('payment__buyer', 'artwork'):
        p = resale.payment
        if not p: continue
        status, reason = 'awaiting_payment', 'Resale payment not verified.'
        if p.status == 'refunded': status, reason = 'refunded', 'Resale royalty reversed after refund.'
        elif p.status == 'paid':
            status, reason = 'pending', 'Awaiting resale settlement and royalty release.'
            if resale.payout_status == 'SUCCEEDED': status, reason = 'received', 'Resale royalty payout confirmed.'
            elif resale.payout_status == 'PROCESSING': status, reason = 'processing', 'Royalty payout processing.'
            elif resale.payout_status in ('FAILED', 'REVERSED'): status, reason = 'failed', 'Royalty payout failed or reversed.'
            elif resale.settled_at: status, reason = 'available', 'Resale settled; payout is not confirmed.'
        add(f'resale-{resale.pk}', resale.artwork.title + ' · Resale royalty', p.buyer.username, 'resale_royalty', resale.settled_at or p.paid_at or p.created_at, resale.royalty_amount, 0, 0, resale.royalty_amount, status, reason, resale.payout_reference or p.reference_id, destination=destination)
    return sorted(rows, key=lambda r: (r['date'], r['id']), reverse=True)

class ArtistEarningsView(AuthenticatedAPIView):
    def get(self, request):
        user = self.get_request_user(request)
        if not user: return Response({'error': 'Sign in to view earnings.'}, status=401)
        if user.role in ('platform_admin', 'customer_support') and request.query_params.get('artist_id'):
            from users.models import User
            try: user = User.objects.get(pk=int(request.query_params['artist_id']), role='artist')
            except (User.DoesNotExist, ValueError): return Response({'error': 'Artist not found.'}, status=404)
        if user.role != 'artist': return Response({'error': 'Artist account required.'}, status=403)
        rows = earnings_rows(user)
        years = sorted({int(r['date'][:4]) for r in rows} | {timezone.localdate().year}, reverse=True)
        params = request.query_params
        try:
            mode = params.get('period', 'all')
            year = int(params.get('year', timezone.localdate().year))
            month = int(params.get('month', timezone.localdate().month))
            page = max(1, int(params.get('page', 1)))
            after = date.fromisoformat(params['from']) if params.get('from') else None
            before = date.fromisoformat(params['to']) if params.get('to') else None
            if after and before and after > before: raise ValueError()
            if mode not in ('all', 'monthly', 'yearly') or not 1 <= month <= 12 or not 1900 <= year <= 9999: raise ValueError()
        except ValueError: return Response({'error': 'Invalid period or page.'}, status=400)
        search = params.get('search', '').strip().casefold()
        rows = [r for r in rows if (mode == 'all' or r['date'][:4] == str(year)) and (not after or r['date'][:10] >= after.isoformat()) and (not before or r['date'][:10] <= before.isoformat()) and (mode != 'monthly' or r['date'][5:7] == f'{month:02}') and (not search or search in ' '.join([r['title'], r['buyer'], r['reference']]).casefold()) and (not params.get('category') or r['category'] == params['category']) and (not params.get('status') or r['status'] == params['status'])]
        summary = {k: str(sum((money(r['net']) for r in rows if r['status'] == k), ZERO)) for k in ['received', 'available', 'pending', 'processing', 'failed']}
        paid = [r for r in rows if r['status'] in ('received', 'available', 'pending', 'processing', 'failed')]
        summary['fees'] = str(sum((money(r['fees']) for r in paid), ZERO))
        summary['shipping'] = str(sum((money(r['shipping']) for r in paid), ZERO))
        summary['refunds'] = str(sum((money(r['gross']) for r in rows if r['status'] == 'refunded'), ZERO))
        chart = []
        for n in range(1, (calendar.monthrange(year, month)[1] if mode == 'monthly' else 12) + 1):
            prefix = f'{year}-{month:02}-{n:02}' if mode == 'monthly' else f'{year}-{n:02}'
            group = [r for r in rows if r['date'].startswith(prefix)]
            chart.append({'label': str(n) if mode == 'monthly' else calendar.month_abbr[n], **{k: str(sum((money(r['net']) for r in group if r['status'] == k), ZERO)) for k in ['received', 'available', 'pending', 'processing']}})
        if params.get('export') == 'csv':
            output = StringIO(); writer = csv.writer(output)
            columns = ['date', 'title', 'buyer', 'category', 'gross', 'fees', 'shipping', 'royalty_deduction', 'net', 'status', 'reason', 'reference']
            writer.writerow(columns)
            for row in rows:
                values = [str(row[k]) for k in columns]
                writer.writerow(["'"+v if v.lstrip().startswith(('=', '+', '-', '@')) else v for v in values])
            response = HttpResponse(output.getvalue(), content_type='text/csv; charset=utf-8'); response['Content-Disposition'] = 'attachment; filename="artist-earnings.csv"'; return response
        wallet = WalletAccount.objects.filter(user=user).first()
        page_count = max(1, (len(rows) + PAGE_SIZE - 1) // PAGE_SIZE)
        page = min(page, page_count)
        visible = rows[(page-1)*PAGE_SIZE:page*PAGE_SIZE]
        for row in visible:
            row['preview_image'] = transaction_preview(row, user)
        return Response({'summary': summary, 'chart': chart, 'count': len(rows), 'page': page, 'page_size': PAGE_SIZE, 'pages': page_count, 'results': visible, 'years': years, 'wallet': {'available': str(wallet.available_balance if wallet else ZERO), 'pending': str(wallet.pending_balance if wallet else ZERO), 'paid_out': str(wallet.paid_out_balance if wallet else ZERO)}})


def transaction_preview(row, artist):
    """Small previews only, scoped to the same artist as the earnings records."""
    import base64
    from io import BytesIO
    from PIL import Image, ImageOps
    source = None
    kind, key = row['id'].split('-', 1)
    if kind == 'sale':
        source = PaymentSession.objects.filter(pk=key, artist=artist).values_list('artwork__image_data', flat=True).first()
    elif kind in ('commission', 'refund'):
        from commissions.models import CommissionMilestone, CommissionPhoto, CommissionSubmission
        commission_id = key if kind == 'refund' else CommissionMilestone.objects.filter(pk=key, commission_req__artist=artist).values_list('commission_req_id', flat=True).first()
        if CommissionRequest.objects.filter(pk=commission_id, artist=artist).exists():
            submission = CommissionSubmission.objects.filter(milestone__commission_req_id=commission_id, content_type__startswith='image/').order_by('-uploaded_at').only('content').first()
            source = bytes(submission.content) if submission else CommissionPhoto.objects.filter(commission_req_id=commission_id).order_by('-uploaded_at').values_list('image_url', flat=True).first()
    elif kind == 'royalty':
        source = RoyaltyPeriod.objects.filter(pk=key, agreement__artist=artist).values_list('agreement__artwork__image_data', flat=True).first()
    elif kind == 'resale':
        source = CommissionResale.objects.filter(pk=key, asset__original_artist=artist).values_list('artwork__image_data', flat=True).first()
    if not source: return ''
    if isinstance(source, str):
        if not source.startswith('data:image/'):
            return source if source.startswith(('https://', 'http://')) else ''
        if len(source) > 28 * 1024 * 1024: return ''
        try: source = base64.b64decode(source.split(',', 1)[1], validate=True)
        except (ValueError, IndexError): return ''
    try:
        with Image.open(BytesIO(source)) as image:
            if image.width * image.height > 25000000: return ''
            image = ImageOps.exif_transpose(image)
            image.thumbnail((360, 360))
            output = BytesIO(); image.convert('RGB').save(output, format='JPEG', quality=78)
            return 'data:image/jpeg;base64,' + base64.b64encode(output.getvalue()).decode()
    except (OSError, ValueError, Image.DecompressionBombError): return ''
