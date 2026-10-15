import secrets
from decimal import Decimal
import requests
from django.conf import settings
from django.db import transaction
from django.db.models import Q
from django.utils import timezone
from rest_framework.exceptions import PermissionDenied, ValidationError, NotFound
from rest_framework.response import Response
from authentication.views import AuthenticatedAPIView
from users.models import ActivityLog
from wallets.models import SupportTicket, WalletAccount
from .models import CommissionRequest, CommissionRefund, CommissionLedger
from .lifecycle import Conflict, money, notify, apply_payout


class CommissionReviewsView(AuthenticatedAPIView):
    def staff(self, request):
        user = self.get_request_user(request)
        if not user or user.role not in ('customer_support', 'platform_admin'):
            raise PermissionDenied('Customer Service or administrator access required.')
        return user

    def get(self, request):
        self.staff(request)
        rows = CommissionRequest.objects.filter(Q(disputed=True) | Q(milestones__payout_status__in=['FAILED', 'REVERSED', 'REJECTED', 'RETRY_PENDING', 'RECONCILE']), flow_version=2).select_related('buyer', 'artist').distinct()
        return Response([{'id': c.pk, 'title': c.title, 'buyer': c.buyer.username, 'artist': c.artist.username,
            'status': c.status, 'held_amount': str(c.held_amount),
            'tickets': [{'id': t.pk, 'details': t.details, 'status': t.status} for t in SupportTicket.objects.filter(commission=c)],
            'refunds': [{'id': r.pk, 'amount': str(r.amount), 'status': r.status, 'reason': r.reason} for r in c.refunds.all()],
            'payouts': [{'id': m.pk, 'stage': m.milestone_number, 'status': m.payout_status, 'amount': str(m.amount)} for m in c.milestones.all()]} for c in rows])

    @transaction.atomic
    def post(self, request, pk):
        staff = self.staff(request)
        c = CommissionRequest.objects.select_for_update().filter(pk=pk, flow_version=2).first()
        if not c: raise NotFound('Commission not found.')
        if staff.pk in (c.buyer_id, c.artist_id): raise PermissionDenied('You cannot resolve your own commission.')
        reason = str(request.data.get('reason', '')).strip()
        if not 5 <= len(reason) <= 4000: raise ValidationError('Record a decision reason (5 to 4000 characters).')
        action = request.data.get('action')
        if action == 'resume':
            if c.status == 'CANCELLED': raise Conflict('A cancelled commission cannot resume. Reconcile remaining funds and create a new agreement.')
            if c.refunds.filter(status__in=['AUTHORIZED', 'PROCESSING', 'RECONCILE', 'CONFIG_REQUIRED']).exists(): raise Conflict('Resolve pending refunds first.')
            c.disputed = False; c.save()
            SupportTicket.objects.filter(commission=c).exclude(status__in=['resolved', 'closed']).update(status='resolved')
            for user in (c.buyer, c.artist): notify(c, user, 'Commission dispute resolved', reason)
        elif action in ('wallet_credit', 'refund'):
            if not c.disputed or not c.funded_at: raise Conflict('A funded commission must be under review before compensation.')
            if c.milestones.filter(payout_status__in=['PROCESSING', 'RETRY_PENDING', 'RECONCILE']).exists(): raise Conflict('Reconcile in-flight payouts before refunding.')
            if c.refunds.filter(status__in=['AUTHORIZED', 'PROCESSING', 'RECONCILE', 'CONFIG_REQUIRED']).exists(): raise Conflict('A refund is already pending. Reconcile that authorization before creating another.')
            amount = money(request.data.get('amount'))
            if amount <= 0 or amount > c.held_amount: raise ValidationError('Compensation cannot exceed unreleased funds.')
            reference = f'commission-refund-{c.pk}-{secrets.token_hex(8)}'
            refund = CommissionRefund.objects.create(commission=c, authorized_by=staff, amount=amount, reason=reason, reference=reference)
            if action == 'wallet_credit':
                wallet, _ = WalletAccount.objects.get_or_create(user=c.buyer)
                wallet = WalletAccount.objects.select_for_update().get(pk=wallet.pk)
                wallet.available_balance += amount; wallet.save()
                c.held_amount -= amount; c.status = 'CANCELLED'; c.save()
                refund.status = 'WALLET_CREDITED'; refund.save()
                CommissionLedger.objects.create(commission=c, reference=reference, kind='REFUND_WALLET_CREDIT', amount=amount)
                notify(c, c.buyer, 'Commission wallet credit authorized', f'PHP {amount} credited to your wallet. {reason}')
            else:
                payment_request = c.funding_payload.get('payment_request_id')
                if not payment_request or not settings.XENDIT_SECRET_KEY:
                    refund.status = 'CONFIG_REQUIRED'; refund.save()
                    ActivityLog.objects.create(user=staff, action='commission_resolution', description=f'Commission #{c.pk}: refund authorized, provider configuration required. {reason}', reference_type='commission', reference_id=c.pk)
                    return Response({'status': refund.status, 'detail': 'Refund authorized. A verified original Xendit payment_request_id is required for provider processing.'})
                try:
                    response = requests.post('https://api.xendit.co/refunds', auth=(settings.XENDIT_SECRET_KEY, ''), timeout=20,
                        headers={'idempotency-key': reference},
                        json={'reference_id': reference, 'payment_request_id': payment_request, 'currency': 'PHP', 'amount': float(amount), 'reason': 'REQUESTED_BY_CUSTOMER'})
                    response.raise_for_status(); data = response.json()
                    refund.provider_id = data['id']; refund.status = 'PROCESSING'; refund.save()
                    apply_refund(refund, data)
                except (requests.RequestException, KeyError, ValueError):
                    refund.status = 'RECONCILE'; refund.save()
        elif action == 'process_authorized_refund':
            refund = c.refunds.filter(pk=request.data.get('refund_id'), status='CONFIG_REQUIRED').first()
            payment_request = c.funding_payload.get('payment_request_id')
            if not refund or not payment_request or not settings.XENDIT_SECRET_KEY:
                raise Conflict('An existing authorization and verified original payment request ID are required.')
            if refund.amount > c.held_amount or c.milestones.filter(payout_status__in=['PROCESSING', 'RETRY_PENDING', 'RECONCILE']).exists():
                raise Conflict('Reconcile holding funds and payouts first.')
            try:
                response = requests.post('https://api.xendit.co/refunds', auth=(settings.XENDIT_SECRET_KEY, ''), timeout=20,
                    headers={'idempotency-key': refund.reference}, json={'reference_id': refund.reference, 'payment_request_id': payment_request,
                        'currency': 'PHP', 'amount': float(refund.amount), 'reason': 'REQUESTED_BY_CUSTOMER'})
                response.raise_for_status(); data = response.json()
                refund.provider_id = data['id']; refund.status = 'PROCESSING'; refund.save(); apply_refund(refund, data)
            except (requests.RequestException, KeyError, ValueError):
                refund.status = 'RECONCILE'; refund.save()
        elif action == 'reconcile_refund':
            refund = c.refunds.filter(pk=request.data.get('refund_id')).first()
            if not refund or not settings.XENDIT_SECRET_KEY: raise Conflict('Select an existing provider refund and configure Xendit.')
            provider_id = refund.provider_id or str(request.data.get('provider_id', '')).strip()
            if not provider_id or not provider_id.startswith('rfd-') or len(provider_id) > 100 or any(char not in 'abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789-' for char in provider_id):
                raise ValidationError('Enter the Xendit refund ID from the matching provider record. Never resubmit an uncertain refund.')
            try:
                response = requests.get(f'https://api.xendit.co/refunds/{provider_id}', auth=(settings.XENDIT_SECRET_KEY, ''), timeout=20)
                response.raise_for_status(); data = response.json()
            except (requests.RequestException, ValueError):
                raise Conflict('Provider reconciliation unavailable; no funds were changed.')
            if data.get('reference_id') != refund.reference or data.get('payment_request_id') != c.funding_payload.get('payment_request_id') or money(data.get('amount')) != refund.amount or data.get('currency') != 'PHP':
                raise ValidationError('Provider refund does not match this authorization.')
            refund.provider_id = provider_id; refund.save(update_fields=['provider_id'])
            apply_refund(refund, data)
        elif action in ('reconcile_payout', 'retry_failed_payout'):
            m = c.milestones.filter(pk=request.data.get('milestone_id')).first()
            provider_id = m.payout_provider_id or str(request.data.get('provider_id', '')).strip() if m else ''
            if not m or not settings.XENDIT_SECRET_KEY or not provider_id.startswith('po-') or len(provider_id) > 100 or any(char not in 'abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789-' for char in provider_id): raise Conflict('Enter the matching provider payout ID to reconcile.')
            try:
                response = requests.get(f'https://api.xendit.co/v3/payouts/{provider_id}', auth=(settings.XENDIT_SECRET_KEY, ''), headers={'api-version': '2025-09-01'}, timeout=20)
                response.raise_for_status(); data = response.json()
            except (requests.RequestException, ValueError): raise Conflict('Payout reconciliation unavailable; no funds were changed.')
            if data.get('reference_id') != m.payout_reference or data.get('source_currency') != 'PHP' or Decimal(str(data.get('source_amount', -1))) != m.amount * 100: raise ValidationError('Provider payout does not match.')
            m.payout_provider_id = provider_id; m.save(update_fields=['payout_provider_id']); apply_payout(m, data)
            m.refresh_from_db()
            if action == 'retry_failed_payout':
                if c.disputed: raise Conflict('Resolve the dispute before retrying payouts.')
                if m.payout_status not in ('FAILED', 'REJECTED', 'REVERSED'): raise Conflict('Only a verified terminal failure may use a new payout reference.')
                m.payout_reference = ''; m.payout_payload = {}; m.payout_provider_id = ''; m.payout_status = 'NOT_REQUESTED'; m.save()
                from .lifecycle import attempt_payout
                transaction.on_commit(lambda: attempt_payout(m.pk))
        else: raise ValidationError('Choose resume, wallet_credit, refund or reconcile_payout.')
        ActivityLog.objects.create(user=staff, action='commission_resolution', description=f'Commission #{c.pk}: {action}. {reason}', reference_type='commission', reference_id=c.pk)
        return Response({'status': 'Saved', 'held_amount': str(c.held_amount)})


@transaction.atomic
def apply_refund(refund, data):
    c = CommissionRequest.objects.select_for_update().get(pk=refund.commission_id)
    refund.refresh_from_db()
    if (data.get('id') != refund.provider_id or data.get('reference_id') != refund.reference
        or data.get('payment_request_id') != c.funding_payload.get('payment_request_id')
        or data.get('currency') != 'PHP' or money(data.get('amount')) != refund.amount):
        raise ValidationError('Refund details do not match.')
    if data.get('status') == 'SUCCEEDED' and refund.status != 'SUCCEEDED':
        _, created = CommissionLedger.objects.get_or_create(reference=refund.reference, defaults={'commission': c, 'kind': 'PROVIDER_REFUND', 'amount': refund.amount})
        if created:
            if refund.amount > c.held_amount: raise Conflict('Refund exceeds holding balance.')
            c.held_amount -= refund.amount; c.status = 'CANCELLED'; c.save()
        refund.status = 'SUCCEEDED'; refund.save()
        notify(c, c.buyer, 'Commission refund completed', f'PHP {refund.amount} refunded by Xendit.')
    elif data.get('status') == 'FAILED' and refund.status != 'SUCCEEDED':
        refund.status = 'FAILED'; refund.save()
