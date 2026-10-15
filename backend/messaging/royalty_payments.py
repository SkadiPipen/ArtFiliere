"""Xendit tokens only: never accept bank details or payment tokens from clients."""
import secrets
import uuid
from decimal import Decimal, InvalidOperation
import requests
from django.conf import settings
from django.db import transaction
from django.db.models import F
from django.utils import timezone
from rest_framework.response import Response
from rest_framework.decorators import api_view, permission_classes
from rest_framework.permissions import AllowAny
from authentication.views import AuthenticatedAPIView
from authentication.permissions import IsAuthenticatedUser
from .models import Agreement, RoyaltyMandate, RoyaltyPeriod, RoyaltyReceipt
from .royalties import ensure_periods


def provider(method, path, **kwargs):
    response = requests.request(method, 'https://api.xendit.co' + path,
        auth=(settings.XENDIT_SECRET_KEY, ''), timeout=25,
        headers={'api-version': '2024-11-11'}, **kwargs)
    response.raise_for_status()
    return response.json()


class RoyaltyMandateView(AuthenticatedAPIView):
    permission_classes = [IsAuthenticatedUser]

    @transaction.atomic
    def post(self, request, agreement_id):
        user = self.get_request_user(request)
        agreement = Agreement.objects.select_for_update().filter(pk=agreement_id, buyer=user, status='accepted').first()
        if not agreement or agreement.compensation_type not in ('royalty', 'hybrid') or not agreement.artist_signed_at or not agreement.buyer_signed_at or not agreement.compensation_terms.get('reporting_policy'):
            return Response({'error': 'A signed royalty agreement with structured reporting terms is required.'}, status=409)
        mandate = RoyaltyMandate.objects.filter(agreement=agreement).first()
        action = request.data.get('action')
        if action == 'revoke':
            if mandate:
                mandate.status, mandate.revoked_at = 'revoked', timezone.now()
                mandate.save()
            return Response({'status': 'revoked'})
        if action == 'refresh' and mandate and mandate.status != 'revoked' and mandate.session_id:
            try:
                data = provider('GET', '/sessions/' + mandate.session_id)
            except (requests.RequestException, ValueError):
                return Response({'error': 'Unable to confirm payment authorization. Try again.'}, status=502)
            if (data.get('payment_session_id') != mandate.session_id or data.get('reference_id') != mandate.reference
                    or data.get('session_type') != 'SAVE' or data.get('currency') != 'PHP'):
                return Response({'error': 'Payment authorization did not match this agreement.'}, status=409)
            if data.get('status') == 'COMPLETED' and data.get('payment_token_id'):
                mandate.token_id, mandate.status = data['payment_token_id'], 'active'
                mandate.save()
            elif data.get('status') in ('EXPIRED', 'CANCELED'):
                mandate.status = 'expired'
                mandate.save(update_fields=['status'])
            return Response({'status': mandate.status})
        if action != 'link' or request.data.get('consent') is not True:
            return Response({'error': 'Explicit authorization is required to link a payment method.'}, status=400)
        if not settings.ROYALTY_COLLECTION_ENABLED or not settings.XENDIT_SECRET_KEY or not settings.ROYALTY_PAYMENT_CHANNELS:
            return Response({'error': 'Automatic collection is not configured for this merchant yet.'}, status=409)
        if mandate and mandate.status == 'active':
            return Response({'status': 'active'})
        if mandate and mandate.status == 'pending' and mandate.checkout_url:
            return Response({'status': 'pending', 'url': mandate.checkout_url})
        reference = 'royalty-save-' + uuid.uuid4().hex
        payload = {'reference_id': reference, 'session_type': 'SAVE', 'mode': 'PAYMENT_LINK', 'amount': 0,
            'currency': 'PHP', 'country': 'PH', 'allowed_payment_channels': settings.ROYALTY_PAYMENT_CHANNELS,
            'customer': {'reference_id': f'royaltybuyer{user.pk}', 'type': 'INDIVIDUAL', 'email': user.email,
                'individual_detail': {'given_names': user.first_name or user.username, 'surname': user.last_name or user.username}},
            'description': f'Authorize variable royalties for agreement {agreement.pk} after artist approval',
            'success_return_url': settings.ROYALTY_RETURN_URL, 'cancel_return_url': settings.ROYALTY_RETURN_URL}
        if not settings.ROYALTY_RETURN_URL.startswith('https://'):
            return Response({'error': 'Configure the HTTPS royalty return URL before linking.'}, status=409)
        try:
            data = provider('POST', '/sessions', json=payload)
            session_id, url = data['payment_session_id'], data['payment_link_url']
        except (requests.RequestException, ValueError, KeyError):
            return Response({'error': 'Xendit could not start payment authorization.'}, status=502)
        RoyaltyMandate.objects.update_or_create(agreement=agreement, defaults={'reference': reference, 'session_id': session_id,
            'checkout_url': url, 'token_id': '', 'status': 'pending', 'consented_at': timezone.now(), 'revoked_at': None})
        return Response({'status': 'pending', 'url': url})


def reconcile(period_id, data):
    with transaction.atomic():
        period = RoyaltyPeriod.objects.select_for_update().select_related('agreement').get(pk=period_id)
        try:
            amount = Decimal(str(data.get('request_amount', '-1')))
        except (InvalidOperation, TypeError):
            raise ValueError('Invalid royalty payment amount.') from None
        if (data.get('reference_id') != f'af-royalty-{period.pk}' or data.get('currency') != 'PHP'
                or not amount.is_finite() or amount != period.amount
                or not period.provider_request_id or data.get('payment_request_id') != period.provider_request_id):
            raise ValueError('Royalty payment details do not match.')
        if period.status == 'paid':
            return
        if period.status not in ('collecting', 'collection_failed'):
            raise ValueError('This royalty has not been submitted for collection.')
        if data.get('status') == 'SUCCEEDED':
            payment_id = data.get('latest_payment_id')
            if not payment_id:
                raise ValueError('A successful provider payment ID is required.')
            _, created = RoyaltyReceipt.objects.get_or_create(period=period, defaults={'amount': period.amount, 'provider_payment_id': payment_id})
            if created:
                from wallets.models import WalletAccount
                wallet, _ = WalletAccount.objects.get_or_create(user=period.agreement.artist)
                WalletAccount.objects.filter(pk=wallet.pk).update(available_balance=F('available_balance') + period.amount)
            period.status, period.paid_at, period.collection_error = 'paid', timezone.now(), ''
        elif data.get('status') in ('FAILED', 'EXPIRED', 'CANCELED'):
            period.status = 'collection_failed'
            period.collection_error = 'The payment provider could not collect this royalty. Contact support before any retry.'
        period.save()


def collect(period_id):
    if not settings.ROYALTY_COLLECTION_ENABLED:
        return
    with transaction.atomic():
        period = RoyaltyPeriod.objects.select_for_update().select_related('agreement').get(pk=period_id)
        if period.status != 'approved' or period.due_on > timezone.localdate() or not period.amount or not period.approved_at:
            return
        # Same lock as mandate revocation. A previously initiated charge can still settle after revocation.
        mandate = RoyaltyMandate.objects.select_for_update().filter(agreement=period.agreement, status='active').first()
        if not mandate or not mandate.token_id or mandate.revoked_at:
            return
        period.status = 'collecting'
        period.save(update_fields=['status'])
        token = mandate.token_id
    # Commit the claim BEFORE sending; ambiguous requests must never be retried automatically.
    try:
        data = provider('POST', '/v3/payment_requests', json={
            'reference_id': f'af-royalty-{period.pk}', 'type': 'PAY', 'payment_token_id': token,
            'country': 'PH', 'currency': 'PHP', 'request_amount': float(period.amount), 'capture_method': 'AUTOMATIC',
            'channel_properties': settings.ROYALTY_CHANNEL_PROPERTIES,
            'description': f'Approved royalty report {period.pk} for {period.starts_on} to {period.ends_on}'})
        request_id = data['payment_request_id']
        RoyaltyPeriod.objects.filter(pk=period.pk).update(provider_request_id=request_id)
        reconcile(period.pk, data)
    except (requests.RequestException, ValueError, KeyError):
        RoyaltyPeriod.objects.filter(pk=period.pk).update(collection_error='Collection requires reconciliation with Xendit. No automatic retry will be made.')


@api_view(['POST'])
@permission_classes([AllowAny])
def royalty_payment_webhook(request):
    expected = settings.XENDIT_WEBHOOK_TOKEN
    if not expected or not secrets.compare_digest(request.headers.get('x-callback-token', ''), expected):
        return Response(status=403)
    data = request.data.get('data', {})
    if not isinstance(data, dict):
        return Response(status=400)
    reference = data.get('reference_id', '')
    if not isinstance(reference, str) or not reference.startswith('af-royalty-'):
        return Response({'received': True})
    try:
        period = RoyaltyPeriod.objects.get(pk=int(reference.removeprefix('af-royalty-')))
        # Re-fetch the provider record; callbacks never directly credit money.
        request_id = period.provider_request_id or data.get('payment_request_id')
        if not isinstance(request_id, str) or not request_id.startswith('pr-') or '/' in request_id:
            raise ValueError()
        verified = provider('GET', '/v3/payment_requests/' + request_id)
        if not period.provider_request_id and period.status == 'collecting':
            if verified.get('reference_id') != reference:
                raise ValueError()
            RoyaltyPeriod.objects.filter(pk=period.pk, provider_request_id='').update(provider_request_id=request_id)
        reconcile(period.pk, verified)
    except (ValueError, RoyaltyPeriod.DoesNotExist):
        return Response(status=400)
    except requests.RequestException:
        return Response(status=503)
    return Response({'received': True})
