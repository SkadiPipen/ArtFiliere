"""Explicitly accepted, separately funded additions to the final-stage scope."""
import secrets
from datetime import timedelta
from decimal import Decimal
import requests
from django.conf import settings
from django.db import transaction
from django.utils import timezone
from django.utils.dateparse import parse_datetime
from rest_framework.exceptions import ValidationError, PermissionDenied
from rest_framework.response import Response
from messaging.platform_defaults import included_fee
from wallets.models import WalletAccount, SupportTicket
from .models import CommissionExtraRevision, CommissionLedger, CommissionRequest

ACTIVE = ['REQUESTED', 'QUOTED', 'AWAITING_PAYMENT', 'FUNDED', 'SUBMITTED', 'RECONCILE']


def rows(c):
    return list(c.extra_revisions.order_by('pk').values('id', 'status', 'request', 'scope', 'amount', 'artist_amount', 'platform_fee', 'held_amount', 'due_at', 'response_due_at', 'accepted_at', 'funded_at', 'approved_at', 'created_at', 'submission_id', 'source_submission_id', 'payment_reference'))


def resume_review(c, extra):
    m = c.milestones.get(milestone_number=3)
    if m.status == 'SUBMITTED':
        m.review_due_at = max(m.review_due_at or timezone.now(), extra.previous_review_due_at or timezone.now(), timezone.now() + timedelta(days=2))
        m.save(update_fields=['review_due_at'])


def expire_extra(c):
    from .lifecycle import notify
    for extra in c.extra_revisions.filter(status__in=['REQUESTED', 'QUOTED'], response_due_at__lte=timezone.now()):
        extra.status = 'EXPIRED'; extra.save(update_fields=['status']); resume_review(c, extra)
        for user in (c.buyer, c.artist): notify(c, user, 'Extra revision expired', 'The response deadline passed. The original final submission remains available for review.')
    # An existing invoice can still receive late payment: never silently discard it.
    for extra in c.extra_revisions.filter(status='AWAITING_PAYMENT', response_due_at__lte=timezone.now()):
        extra.status = 'RECONCILE'; extra.save(update_fields=['status'])
        c.disputed = True; c.save(update_fields=['disputed'])
        SupportTicket.objects.create(requester=c.buyer, commission=c, concern='commission_dispute', details=f'Extra revision #{extra.pk} payment deadline passed. Verify invoice expiry/payment before resuming review or refunding its separate balance.')
    if not c.disputed and c.extra_revisions.filter(status='FUNDED', due_at__lte=timezone.now()).exists():
        c.disputed = True; c.save(update_fields=['disputed'])
        SupportTicket.objects.create(requester=c.buyer, commission=c, concern='commission_dispute', details='Paid extra revision delivery is overdue. Review its separate balance and the agreed scope/deadline.')


def credit_wallet(c, extra, recipient, amount, kind):
    _, created = CommissionLedger.objects.get_or_create(reference=f'extra-{extra.pk}-{kind}', defaults={'commission': c, 'kind': kind, 'amount': amount})
    if created:
        wallet, _ = WalletAccount.objects.get_or_create(user=recipient)
        wallet = WalletAccount.objects.select_for_update().get(pk=wallet.pk)
        wallet.available_balance += amount; wallet.save(update_fields=['available_balance'])


def handle(c, user, request):
    from .lifecycle import Conflict, check_frozen, money, notify
    action = request.data['action']; artist = user.pk == c.artist_id
    if action != 'refresh_extra_payment': check_frozen(c)
    m = c.milestones.filter(milestone_number=3).first()
    if c.status != 'STAGE_3' or not c.funded_at or not m or m.approved_at:
        raise Conflict('Extra revisions are available only during final-stage review.')
    if action == 'request_extra_revision':
        if artist: raise PermissionDenied('Only the buyer can request extra work.')
        if m.status != 'SUBMITTED' or not m.revision_requested_at or m.delivery_ready_at:
            raise Conflict('Use the included final-stage revision first. Physical changes must be requested before dispatch preparation.')
        if c.extra_revisions.filter(status__in=ACTIVE).exists(): raise Conflict('Resolve the active extra revision first.')
        source = m.submissions.order_by('-pk').first()
        if not source: raise Conflict('Review the final submission first.')
        if c.extra_revisions.filter(source_submission=source).exists(): raise Conflict('An extra revision was already requested for this submission. Review it or contact support.')
        text = str(request.data.get('comment', '')).strip()
        if not 5 <= len(text) <= 2000: raise ValidationError('Describe the new changes in 5–2000 characters.')
        CommissionExtraRevision.objects.create(commission=c, request=text, source_submission=source, previous_review_due_at=m.review_due_at, response_due_at=timezone.now()+timedelta(hours=48))
        m.review_due_at = None; m.save(update_fields=['review_due_at'])
        notify(c, c.artist, 'Extra revision requested', text)
        return None
    extra = c.extra_revisions.filter(pk=request.data.get('extra_revision_id')).first()
    if not extra or extra.status not in ACTIVE: raise Conflict('This extra revision is no longer active.')
    if action == 'quote_extra_revision':
        if not artist: raise PermissionDenied('Only the artist can set the quote.')
        if extra.status != 'REQUESTED': raise Conflict('The quote cannot be changed after sending it.')
        scope = str(request.data.get('scope', '')).strip()
        amount = money(request.data.get('amount'))
        due = parse_datetime(str(request.data.get('due_at', '')))
        if due and timezone.is_naive(due): due = timezone.make_aware(due)
        if not 5 <= len(scope) <= 2000 or amount <= 0 or not due or due <= timezone.now()+timedelta(hours=48):
            raise ValidationError('Provide the scope, a positive total price, and a completion date more than 48 hours away.')
        extra.scope = scope; extra.amount = amount
        extra.platform_fee = included_fee(amount, c.locked_terms.get('platform_fee_percent', '10.00'))
        extra.artist_amount = amount-extra.platform_fee; extra.due_at = due
        extra.status = 'QUOTED'; extra.response_due_at = min(due-timedelta(hours=24), timezone.now()+timedelta(hours=48))
        extra.save(); notify(c, c.buyer, 'Extra revision quote ready', f'PHP {amount} total, including the platform fee. One additional submission for the quoted scope; corrections to the agreement are not paid extras.')
    elif action == 'decline_extra_revision':
        if extra.status not in ['REQUESTED', 'QUOTED']: raise Conflict('A payment session exists. Contact support before cancelling.')
        extra.status = 'DECLINED'; extra.save(update_fields=['status']); resume_review(c, extra)
        notify(c, c.buyer if artist else c.artist, 'Extra revision declined', 'No charge was made. The original agreement and submission remain available.')
    elif action == 'pay_extra_revision':
        if artist: raise PermissionDenied('Only the buyer can accept and pay.')
        if extra.status not in ['QUOTED', 'AWAITING_PAYMENT']: raise Conflict('This quote is unavailable for payment.')
        if request.data.get('accept_quote') is not True: raise ValidationError('Explicitly accept the scope, total price and deadline before payment.')
        return Response({'checkout_url': checkout(c, extra)})
    elif action == 'refresh_extra_payment':
        try:
            reconcile(extra)
        except (requests.RequestException, ValueError): raise Conflict('Payment verification is unavailable. Please retry.')
    elif action == 'approve_extra_revision':
        if artist: raise PermissionDenied('Only the buyer can approve the extra submission.')
        if extra.status != 'SUBMITTED' or not extra.funded_at or not extra.submission_id: raise Conflict('Review the paid extra submission before approving.')
        if extra.held_amount != extra.amount: raise Conflict('Separate revision funds require reconciliation.')
        credit_wallet(c, extra, c.artist, extra.artist_amount, 'EXTRA_REVISION_RELEASE')
        CommissionLedger.objects.get_or_create(reference=f'extra-{extra.pk}-fee', defaults={'commission': c, 'kind': 'EXTRA_REVISION_FEE', 'amount': extra.platform_fee})
        extra.held_amount = 0; extra.approved_at = timezone.now(); extra.status = 'APPROVED'; extra.save()
        resume_review(c, extra)
        notify(c, c.artist, 'Extra revision approved', f'PHP {extra.artist_amount} is available in your platform wallet. Original milestone approval remains separate.')
    else: raise ValidationError('Unknown extra revision action.')


def reconcile(extra):
    from .lifecycle import Conflict, money
    if not extra.payment_reference or not settings.XENDIT_SECRET_KEY: raise Conflict('No payment session is available.')
    if extra.provider_id:
        result = requests.get(f'https://api.xendit.co/v2/invoices/{extra.provider_id}', auth=(settings.XENDIT_SECRET_KEY, ''), timeout=20)
        result.raise_for_status(); data = result.json()
    else:
        result = requests.get('https://api.xendit.co/v2/invoices', params={'external_id': extra.payment_reference}, auth=(settings.XENDIT_SECRET_KEY, ''), timeout=20)
        result.raise_for_status(); candidates = result.json()
        data = next((r for r in candidates if r.get('external_id') == extra.payment_reference), None) if isinstance(candidates, list) else None
        if not data: raise Conflict('Invoice creation is uncertain. Retry reconciliation; do not create another payment.')
        if data.get('currency') != 'PHP' or money(data.get('amount')) != extra.amount: raise ValidationError('Invoice does not match the accepted quote.')
        extra.provider_id = data['id']; extra.save(update_fields=['provider_id'])
    apply_payment(data)


def checkout(c, extra):
    from .lifecycle import Conflict
    if not settings.XENDIT_SECRET_KEY or not getattr(settings, 'COMMISSION_HOLDING_ENABLED', False): raise Conflict('Commission holding payments are not configured.')
    if extra.checkout_url: return extra.checkout_url
    extra.payment_reference = extra.payment_reference or f'commission-extra-{extra.pk}-{secrets.token_hex(8)}'
    extra.accepted_at = extra.accepted_at or timezone.now(); extra.status = 'AWAITING_PAYMENT'
    payload = {'external_id': extra.payment_reference, 'amount': float(extra.amount), 'currency': 'PHP', 'payer_email': c.buyer.email,
               'description': f'Extra revision #{extra.pk}: {c.title}', 'invoice_duration': max(1, int((extra.response_due_at-timezone.now()).total_seconds())),
               'success_redirect_url': f'{settings.FRONTEND_URL.rstrip("/")}/commission-detail?id={c.pk}', 'failure_redirect_url': f'{settings.FRONTEND_URL.rstrip("/")}/commission-detail?id={c.pk}'}
    extra.payment_payload = payload; extra.save()
    try:
        result = requests.get('https://api.xendit.co/v2/invoices', params={'external_id': extra.payment_reference}, auth=(settings.XENDIT_SECRET_KEY, ''), timeout=20)
        result.raise_for_status(); invoices = result.json()
        data = next((r for r in invoices if r.get('external_id') == extra.payment_reference), None) if isinstance(invoices, list) else None
        if not data:
            result = requests.post('https://api.xendit.co/v2/invoices', json=payload, auth=(settings.XENDIT_SECRET_KEY, ''), timeout=20)
            result.raise_for_status(); data = result.json()
        if data.get('external_id') != extra.payment_reference or data.get('currency') != 'PHP' or Decimal(str(data.get('amount', -1))) != extra.amount:
            return ''
        extra.provider_id = data['id']; extra.checkout_url = data['invoice_url']; extra.save()
        return extra.checkout_url
    except (requests.RequestException, KeyError, ValueError): return ''


@transaction.atomic
def apply_payment(data):
    from .lifecycle import money, Conflict, notify
    pk = CommissionExtraRevision.objects.filter(payment_reference=data.get('external_id')).values_list('commission_id', flat=True).first()
    if not pk: raise ValidationError('Unknown extra revision payment.')
    c = CommissionRequest.objects.select_for_update().get(pk=pk)
    extra = c.extra_revisions.get(payment_reference=data['external_id'])
    if data.get('id') != extra.provider_id or data.get('currency') != 'PHP' or money(data.get('amount')) != extra.amount: raise ValidationError('Extra payment details do not match.')
    if extra.funded_at: return
    if data.get('status') in ['PAID', 'SETTLED']:
        extra.funded_at = timezone.now(); extra.held_amount = extra.amount
        extra.payment_payload = {**extra.payment_payload, **({'payment_request_id': data['payment_request_id']} if data.get('payment_request_id') else {})}
        valid = extra.status == 'AWAITING_PAYMENT' and extra.response_due_at > timezone.now() and c.status == 'STAGE_3' and not c.disputed
        extra.status = 'FUNDED' if valid else 'RECONCILE'; extra.save()
        CommissionLedger.objects.get_or_create(reference=extra.payment_reference, defaults={'commission': c, 'kind': 'EXTRA_REVISION_FUNDING', 'amount': extra.amount})
        if not valid:
            c.disputed = True; c.save(update_fields=['disputed'])
            SupportTicket.objects.create(requester=c.buyer, commission=c, concern='commission_dispute', details=f'Extra revision #{extra.pk}: late or unexpected payment. Separate held balance PHP {extra.amount}; reconcile or refund before production.')
        else: notify(c, c.artist, 'Extra revision funded', 'Payment verified. Submit the agreed extra work by its quoted deadline.')
    elif data.get('status') == 'EXPIRED' and extra.status in ['AWAITING_PAYMENT', 'RECONCILE']:
        extra.status = 'EXPIRED'; extra.save(update_fields=['status']); resume_review(c, extra)
