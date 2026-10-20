"""Hosted royalty payments: verified receipt -> held balance -> admin release."""
import uuid
from decimal import Decimal, InvalidOperation
import requests
from django.conf import settings
from django.db import transaction
from django.db.models import F, Q
from django.utils import timezone
from rest_framework.response import Response
from authentication.views import AuthenticatedAPIView
from authentication.permissions import IsAuthenticatedUser, IsPlatformAdmin
from .models import RoyaltyPeriod, RoyaltyFunding, RoyaltyReceipt
from .royalty_payments import provider


def apply_session(funding_id, data):
    with transaction.atomic():
        period_id = RoyaltyFunding.objects.values_list('period_id', flat=True).get(pk=funding_id)
        period = RoyaltyPeriod.objects.select_for_update().select_related('agreement').get(pk=period_id)
        funding = RoyaltyFunding.objects.select_for_update().get(pk=funding_id)
        try:
            amount = Decimal(str(data.get('amount')))
        except (InvalidOperation, TypeError, ValueError):
            raise ValueError('Invalid payment amount.')
        if (not amount.is_finite() or amount != funding.amount or amount != period.amount
                or data.get('payment_session_id') != funding.session_id or data.get('reference_id') != funding.reference
                or data.get('currency') != 'PHP' or data.get('session_type') != 'PAY'):
            raise ValueError('Payment details do not match this royalty report.')
        if funding.status in ('held', 'released'):
            return
        if data.get('status') == 'COMPLETED':
            payment_id = data.get('payment_id')
            if not isinstance(payment_id, str) or not payment_id:
                raise ValueError('A verified provider payment ID is required.')
            _, created = RoyaltyReceipt.objects.get_or_create(period=period, defaults={'amount': funding.amount, 'provider_payment_id': payment_id})
            if not created:
                raise ValueError('This report already has a different receipt. Manual reconciliation is required.')
            from wallets.models import WalletAccount
            wallet, _ = WalletAccount.objects.get_or_create(user=period.agreement.artist)
            WalletAccount.objects.filter(pk=wallet.pk).update(pending_balance=F('pending_balance') + funding.amount)
            funding.status, funding.paid_at = 'held', timezone.now()
            period.status, period.paid_at = 'funded', funding.paid_at
            period.history.append({'action': 'payment_held', 'at': funding.paid_at.isoformat(), 'amount': str(funding.amount)})
            funding.save(); period.save()
        elif data.get('status') in ('EXPIRED', 'CANCELED'):
            funding.status = 'expired'; funding.save(update_fields=['status'])


class RoyaltyCheckoutView(AuthenticatedAPIView):
    permission_classes = [IsAuthenticatedUser]

    def post(self, request, period_id):
        user = self.get_request_user(request)
        with transaction.atomic():
            period = RoyaltyPeriod.objects.select_for_update().select_related('agreement').filter(pk=period_id, agreement__buyer=user).first()
            if not period:
                return Response({'error': 'Royalty report not found.'}, status=404)
            if period.terms.get('review_mode') != 'admin_held' or period.status not in ('submitted', 'funded') or period.amount is None or period.amount <= 0:
                return Response({'error': 'Submit a positive royalty report before payment.'}, status=409)
            funding = RoyaltyFunding.objects.filter(period=period).first()
            action = request.data.get('action', 'pay')
            if funding and funding.status in ('held', 'released'):
                return Response({'status': funding.status})
            if action == 'refresh':
                if not funding or not funding.session_id:
                    return Response({'error': 'No payment session to verify.'}, status=409)
            elif action == 'pay':
                if funding:
                    if funding.status == 'pending' and funding.checkout_url:
                        return Response({'url': funding.checkout_url, 'status': 'pending'})
                    return Response({'error': 'Payment already initiated. Refresh its status or contact support; no duplicate payment will be created.'}, status=409)
                if not settings.XENDIT_SECRET_KEY:
                    return Response({'error': 'Xendit payment credentials are not configured.'}, status=503)
                funding = RoyaltyFunding.objects.create(period=period, amount=period.amount, reference='af-royalty-report-' + uuid.uuid4().hex)
            else:
                return Response({'error': 'Choose pay or refresh.'}, status=400)
        # Persist the unique claim before any external request. Ambiguous failures
        # must be reconciled, never retried with a new payment reference.
        try:
            if action == 'refresh':
                apply_session(funding.pk, provider('GET', '/sessions/' + funding.session_id))
                funding.refresh_from_db()
                return Response({'status': funding.status})
            payload = {'reference_id': funding.reference, 'session_type': 'PAY', 'mode': 'PAYMENT_LINK',
                'amount': float(funding.amount), 'currency': 'PHP', 'country': 'PH', 'capture_method': 'AUTOMATIC',
                'allow_save_payment_method': 'DISABLED', 'description': f'Royalty report #{period.pk}; funds held until admin verification'}
            return_url = settings.ROYALTY_RETURN_URL or settings.XENDIT_RETURN_URL
            if return_url.startswith('https://'):
                payload.update(success_return_url=return_url, cancel_return_url=return_url)
            data = provider('POST', '/sessions', json=payload)
            session_id, url = data.get('payment_session_id'), data.get('payment_link_url')
            if not isinstance(session_id, str) or not session_id.startswith('ps-') or not isinstance(url, str) or not url.startswith('https://'):
                raise ValueError('Invalid payment session.')
            RoyaltyFunding.objects.filter(pk=funding.pk).update(session_id=session_id, checkout_url=url, status='pending')
            return Response({'url': url, 'status': 'pending'}, status=201)
        except (requests.RequestException, ValueError):
            return Response({'error': 'Payment needs verification. Refresh payment status or contact support before retrying.', 'reference': funding.reference}, status=502)


class RoyaltyAdminReviewView(AuthenticatedAPIView):
    permission_classes = [IsPlatformAdmin]

    def get(self, request):
        from .royalties import period_data, royalty_title
        periods = RoyaltyPeriod.objects.filter(terms__review_mode='admin_held', status__in=['submitted', 'funded', 'rejected']).select_related('agreement__artwork', 'agreement__buyer', 'agreement__artist').order_by('due_on')
        response = Response([dict(period_data(p, self.get_request_user(request)), buyer=p.agreement.buyer.username, artist=p.agreement.artist.username) for p in periods])
        response['Cache-Control'] = 'private, no-store'
        return response

    @transaction.atomic
    def post(self, request, period_id):
        admin = self.get_request_user(request)
        period = RoyaltyPeriod.objects.select_for_update().select_related('agreement').filter(pk=period_id, terms__review_mode='admin_held').first()
        if not period:
            return Response({'error': 'Report not found.'}, status=404)
        action, note = request.data.get('action'), request.data.get('note', '')
        if not isinstance(note, str) or len(note) > 1000 or action not in ('release', 'reject') or (action == 'reject' and not note.strip()):
            return Response({'error': 'Choose release or reject. Rejection requires a reason.'}, status=400)
        funding = RoyaltyFunding.objects.select_for_update().filter(period=period).first()
        if period.status in ('paid', 'zero_due'):
            return Response({'status': period.status})
        if admin.pk in (period.agreement.artist_id, period.agreement.buyer_id):
            return Response({'error': 'A different administrator must review this transaction.'}, status=403)
        if action == 'reject':
            if funding:
                return Response({'error': 'Payment has been initiated. Funds remain held; resolve payment or refund with support before changing the report.'}, status=409)
            if period.status != 'submitted':
                return Response({'error': 'Only submitted reports can be rejected.'}, status=409)
            period.status = 'rejected'
        elif period.amount == 0 and period.status == 'submitted':
            period.status = 'zero_due'
        else:
            if not funding or funding.status != 'held' or period.status != 'funded':
                return Response({'error': 'Verified buyer payment must be held before release.'}, status=409)
            if admin.pk in (period.agreement.artist_id, period.agreement.buyer_id):
                return Response({'error': 'A different administrator must review a transaction in which you are a party.'}, status=403)
            from wallets.models import WalletAccount
            wallet = WalletAccount.objects.select_for_update().get(user=period.agreement.artist)
            if wallet.pending_balance < funding.amount:
                return Response({'error': 'Held balance mismatch. Contact support for reconciliation.'}, status=409)
            wallet.pending_balance -= funding.amount; wallet.available_balance += funding.amount
            wallet.save(update_fields=['pending_balance', 'available_balance'])
            funding.status, funding.released_at, funding.reviewed_by, funding.review_note = 'released', timezone.now(), admin, note.strip()
            funding.save(); period.status = 'paid'
        period.review_note = note.strip(); period.approved_at = timezone.now() if action == 'release' else None
        period.history.append({'action': 'admin_' + action, 'at': timezone.now().isoformat(), 'reviewer': admin.pk, 'note': note.strip()})
        period.save()
        return Response({'status': period.status})
