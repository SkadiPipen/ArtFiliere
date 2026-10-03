import hmac
import os
import uuid
from decimal import Decimal, ROUND_HALF_UP, InvalidOperation

import requests
from django.conf import settings
from django.db import IntegrityError, transaction
from django.utils import timezone
from django.views.decorators.csrf import csrf_exempt
from rest_framework import status
from rest_framework.decorators import api_view, permission_classes
from rest_framework.permissions import AllowAny
from rest_framework.response import Response

from authentication.views import AuthenticatedAPIView
from authentication.permissions import IsPlatformAdmin
from artworks.models import Artwork
from users.models import ActivityLog, User
from messaging.models import Agreement
from cart.models import CartItem
from fulfillment.services import fulfill_payment, physical, png_bytes
from .models import CancellationReturnRequest, PaymentSession, WalletAccount, WalletLedgerEntry
from blockchain.proofs import record_sale_proof

PLATFORM_FEE_RATE = Decimal("0.10")


class WalletView(AuthenticatedAPIView):
    def get(self, request):
        user = self.get_request_user(request)
        if not user:
            return Response({"error": "Authentication is required."}, status=status.HTTP_401_UNAUTHORIZED)
        wallet = WalletAccount.objects.filter(user=user).first()
        if not wallet and getattr(user, 'view_only', False):
            return Response({'currency': 'PHP', 'pending_balance': '0.00', 'available_balance': '0.00', 'paid_out_balance': '0.00', 'entries': []})
        if not wallet:
            wallet, _ = WalletAccount.objects.get_or_create(user=user)
        entries = wallet.entries.select_related("payment_session__artwork")[:30]
        return Response({
            "currency": wallet.currency,
            "pending_balance": str(wallet.pending_balance),
            "available_balance": str(wallet.available_balance),
            "paid_out_balance": str(wallet.paid_out_balance),
            "entries": [{
                "id": entry.id, "type": entry.entry_type, "amount": str(entry.amount),
                "artwork_title": entry.payment_session.artwork.title,
                "created_at": entry.created_at.isoformat(),
            } for entry in entries],
        })

def create_delivery_and_notify(payment):
    # Triggers delivery order creation for physical artworks upon payment confirmation.
    # 50 base for first 2km. 15/km for succeeding distance and +40 for priority
    print(">>> [DEBUG] create_delivery_and_notify triggered for payment:", payment.id)
    artwork = payment.artwork
    agreement = getattr(payment, "agreement", None)

    raw_art_type = (
        getattr(artwork, "art_type", None)
        or getattr(artwork, "artwork_type", None)
        or getattr(artwork, "category", None)
        or ""
    )
    art_type_str = str(raw_art_type).upper()
    
    agreement_delivery_type = str(getattr(agreement, "delivery_type", "")).upper() if agreement else ""

    physical_keywords = ["PHYSICAL", "PAINTING", "SCULPTURE", "TRADITIONAL", "CRAFT", "CANVAS"]
    is_physical = (
        "PHYSICAL" in agreement_delivery_type
        or any(kw in art_type_str for kw in physical_keywords)
        or (art_type_str and "DIGITAL" not in art_type_str)
    )

    if not is_physical:
        print(">>> [DEBUG] Digital artwork detected. Bypassing delivery.")
        return None

    buyer = payment.buyer
    artist = payment.artist

    delivery_details = getattr(agreement, "delivery_details", {}) or {}
    if not isinstance(delivery_details, dict):
        delivery_details = {}

    buyer_profile = getattr(buyer, "profile", None)
    buyer_address = (
        delivery_details.get("delivery_address")
        or getattr(agreement, "delivery_address", None)
        or getattr(payment, "delivery_address", None)
        or getattr(buyer, "delivery_address", None)
        or getattr(buyer_profile, "delivery_address", None)
        or getattr(buyer_profile, "address", None)
        or getattr(buyer, "address", None)
        or "Cebu"
    )

    is_priority = bool(
        delivery_details.get("is_priority")
        or getattr(agreement, "is_priority", False)
        or getattr(payment, "is_priority", False)
    )

    try:
        distance_km = float(delivery_details.get("distance_km") or 5.0)
    except (ValueError, TypeError):
        distance_km = 5.0

    from delivery.views import create_delivery_and_notify_driver_order
    delivery_order = create_delivery_and_notify_driver_order(
        buyer_id=buyer.id,
        address=buyer_address,
        payment_method="ONLINE",
        artwork_title=artwork.title if artwork else "Physical Artwork Asset",
        price=float(payment.gross_amount or 0.0),
        is_physical=True,
        is_priority=is_priority,
        distance_km=distance_km
    )
    print(f">>> [DEBUG] Successfully generated Delivery Order #{delivery_order.id}")

    return delivery_order

class ArtworkCheckoutView(AuthenticatedAPIView):
    def post(self, request, artwork_id):
        buyer = self.get_request_user(request)
        if not buyer:
            return Response({"error": "Authentication is required."}, status=status.HTTP_401_UNAUTHORIZED)
        return Response({"error": "Negotiate a contract and obtain both parties' acceptance before checkout."}, status=409)


class AgreementCheckoutView(AuthenticatedAPIView):
    """Creates a checkout only after both parties have accepted the same agreement revision."""
    def get(self, request, agreement_id):
        from .auction_delivery import checkout_context
        buyer = self.get_request_user(request)
        if not buyer:
            return Response({'error': 'Authentication is required.'}, status=401)
        agreement = Agreement.objects.select_related('buyer').filter(pk=agreement_id, buyer=buyer).first()
        if not agreement:
            return Response({'error': 'Agreement not found.'}, status=404)
        return Response(checkout_context(agreement))

    @transaction.atomic
    def post(self, request, agreement_id):
        buyer = self.get_request_user(request)
        if not buyer:
            return Response({"error": "Authentication is required."}, status=401)
        agreement = Agreement.objects.select_for_update(of=("self",)).select_related("artwork", "artist", "buyer").filter(id=agreement_id).first()
        if not agreement or agreement.buyer_id != buyer.id:
            return Response({"error": "Agreement not found."}, status=404)
        if agreement.status != Agreement.Status.ACCEPTED or not agreement.buyer_accepted_at or not agreement.artist_accepted_at:
            return Response({"error": "Both parties must accept the agreement before payment."}, status=409)
        if not agreement.artist_signed_at or not agreement.buyer_signed_at or not agreement.artist_signature_image or not agreement.buyer_signature_image:
            return Response({"error": "Both parties must sign the agreement before checkout."}, status=409)
        if not agreement.artwork_id:
            return Response({"error": "An artwork must be attached to the agreement before payment."}, status=400)
        if agreement.artwork.status != Artwork.Status.APPROVED or agreement.artwork.artist_id != agreement.artist_id or agreement.artist_id == buyer.id:
            return Response({"error": "Artwork is unavailable for this purchase."}, status=409)
        existing = PaymentSession.objects.filter(agreement=agreement, status__in=[PaymentSession.Status.PENDING, PaymentSession.Status.PAID]).first()
        if existing and existing.is_simulated and existing.status == PaymentSession.Status.PAID:
            return Response({"simulated": True, "purchase_id": existing.id})
        if existing and existing.status == PaymentSession.Status.PENDING and existing.checkout_url:
            return Response({"checkout_url": existing.checkout_url, "reference_id": existing.reference_id})
        if existing:
            return Response({"error": "This agreement already has an active payment.", "reference_id": existing.reference_id}, status=409)
        simulate = settings.DEBUG and getattr(settings, "ENABLE_SIMULATED_CHECKOUT", False)
        if not simulate and not getattr(settings, "XENDIT_SECRET_KEY", ""):
            return Response({"error": "Payments are not configured yet. Please contact support before trying checkout again."}, status=503)

        if physical(agreement.artwork) != (agreement.delivery_type == 'physical'):
            return Response({"error": "Artwork delivery type changed. A new agreement is required."}, status=409)
        from .auction_delivery import auction_agreement, verify_delivery
        is_auction = auction_agreement(agreement)
        if agreement.delivery_type == 'physical' and is_auction:
            try:
                details, fee = verify_delivery(agreement, request.data.get('delivery_quote'))
            except ValueError as error:
                return Response({'error': str(error), 'delivery_required': True}, status=400)
            agreement.delivery_details = details
            agreement.delivery_fee = fee
            agreement.save(update_fields=['delivery_details', 'delivery_fee'])
        elif agreement.delivery_type == 'physical' and not agreement.delivery_details:
            return Response({"error": "This physical agreement has no delivery details. Please negotiate a new agreement."}, status=409)
        artwork_png = None
        if agreement.delivery_type == 'digital':
            try:
                artwork_png = png_bytes(agreement.artwork)
            except ValueError as error:
                return Response({"error": str(error)}, status=409)
        gross = agreement.price + agreement.delivery_fee if is_auction else agreement.price
        artwork_amount = gross - agreement.delivery_fee
        platform_fee = (artwork_amount - artwork_amount / (Decimal("1") + PLATFORM_FEE_RATE)).quantize(Decimal("0.01"), rounding=ROUND_HALF_UP)
        session = PaymentSession.objects.create(
            reference_id=f"agreement_{agreement.id}_{uuid.uuid4().hex[:16]}", buyer=buyer, artist=agreement.artist,
            artwork=agreement.artwork, agreement=agreement, gross_amount=gross,
            platform_fee=platform_fee, artist_amount=artwork_amount-platform_fee, artwork_png=artwork_png,
        )
        if simulate:
            session.is_simulated = True
            session.status = PaymentSession.Status.PAID
            session.paid_at = timezone.now()
            session.save(update_fields=['is_simulated', 'status', 'paid_at'])
            fulfill_payment(session)
            record_sale_proof(session)
            CartItem.objects.filter(cart__buyer=buyer, listing_id=agreement.artwork_id).delete()
            ActivityLog.objects.create(user=buyer, action='checkout_simulated', description='Test checkout completed. No money was charged.', reference_type='payment_session', reference_id=session.id)
            return Response({'simulated': True, 'purchase_id': session.id}, status=201)
        try:
            payload = {
                "reference_id": session.reference_id, "session_type": "PAY", "mode": "PAYMENT_LINK",
                "amount": float(gross), "currency": "PHP", "country": "PH",
                "description": f"ArtFiliere agreement payment: {agreement.artwork.title}",
                "capture_method": "AUTOMATIC", "allow_save_payment_method": "DISABLED",
                "customer": {"reference_id": uuid.uuid4().hex, "type": "INDIVIDUAL",
                             "individual_detail": {"given_names": buyer.first_name or buyer.username,
                                                   "surname": buyer.last_name}},
            }
            if settings.XENDIT_RETURN_URL:
                payload['success_return_url'] = settings.XENDIT_RETURN_URL
                payload['cancel_return_url'] = settings.XENDIT_RETURN_URL
            response = requests.post("https://api.xendit.co/sessions", auth=(settings.XENDIT_SECRET_KEY, ""), timeout=20, json=payload)
            result = response.json()
            if not response.ok:
                if response.status_code < 500:
                    session.status = PaymentSession.Status.EXPIRED
                    session.save(update_fields=['status'])
                raise RuntimeError('Xendit rejected the API key permissions. Enable payment/session permissions for the development secret key.' if response.status_code in (401, 403) else 'Xendit could not create checkout. Check the account payment settings.')
            if not isinstance(result, dict) or not result.get('payment_session_id') or not str(result.get('payment_link_url', '')).startswith('https://'):
                raise RuntimeError('Xendit did not return a valid checkout link.')
        except (requests.RequestException, ValueError, RuntimeError) as error:
            # An uncertain network result may already have created a provider session.
            # Keep its reference to avoid creating a second charge on a blind retry.
            return Response({'error': str(error) if isinstance(error, RuntimeError) else 'Checkout could not be opened. Contact support with this reference if it remains pending.', 'reference_id': session.reference_id}, status=502)
        session.xendit_session_id = result.get("payment_session_id", "")
        session.checkout_url = result.get("payment_link_url", "")
        session.save(update_fields=["xendit_session_id", "checkout_url"])
        ActivityLog.objects.create(user=buyer, action="payment_started", description=f"Started payment for agreement #{agreement.id}.", reference_type="payment_session", reference_id=session.id)
        try:
            create_delivery_and_notify(session)
        except Exception as err:
            print(">>> [DEBUG] Error triggering delivery order:", err)
        return Response({"checkout_url": result.get("payment_link_url"), "reference_id": session.reference_id}, status=201)


class ActivityHistoryView(AuthenticatedAPIView):
    def get(self, request):
        user = self.get_request_user(request)
        logs = user.activity_logs.all()[:100]
        return Response([{"id": log.id, "action": log.action, "description": log.description, "reference_type": log.reference_type, "reference_id": log.reference_id, "created_at": log.created_at.isoformat()} for log in logs])


class CancellationReturnRequestView(AuthenticatedAPIView):
    def get(self, request):
        user = self.get_request_user(request)
        rows = CancellationReturnRequest.objects.filter(requester=user).select_related("payment_session__artwork")
        return Response([serialize_request(row) for row in rows])

    def post(self, request, payment_id):
        user = self.get_request_user(request)
        payment = PaymentSession.objects.filter(id=payment_id).first()
        if not payment or user.id not in {payment.buyer_id, payment.artist_id}:
            return Response({"error": "Transaction not found."}, status=404)
        request_type = request.data.get("request_type")
        reason = (request.data.get("reason") or "").strip()
        if request_type not in CancellationReturnRequest.RequestType.values or not reason:
            return Response({"error": "A request type and reason are required."}, status=400)
        row, created = CancellationReturnRequest.objects.get_or_create(payment_session=payment, requester=user, request_type=request_type, defaults={"reason": reason})
        if not created:
            return Response({"error": "You already submitted this request for the transaction."}, status=409)
        ActivityLog.objects.create(user=user, action=f"{request_type}_requested", description=f"Requested {request_type} for transaction #{payment.id}.", reference_type="payment_session", reference_id=payment.id)
        return Response(serialize_request(row), status=201)


def serialize_request(row):
    return {"id": row.id, "type": row.request_type, "reason": row.reason, "status": row.status, "admin_note": row.admin_note, "payment_id": row.payment_session_id, "artwork": row.payment_session.artwork.title, "created_at": row.created_at.isoformat()}


class PlatformAdminWalletView(AuthenticatedAPIView):
    permission_classes = [IsPlatformAdmin]

    def get(self, request):
        payments = PaymentSession.objects.filter(is_simulated=False).select_related("artist", "buyer", "artwork").order_by("-created_at")[:100]
        wallets = WalletAccount.objects.all()
        return Response({
            "summary": {
                "held_artist_earnings": str(sum((wallet.pending_balance for wallet in wallets), Decimal("0"))),
                "available_artist_earnings": str(sum((wallet.available_balance for wallet in wallets), Decimal("0"))),
                "platform_fees": str(sum((payment.platform_fee for payment in payments if payment.status == PaymentSession.Status.PAID), Decimal("0"))),
            },
            "payments": [{
                "id": payment.id, "reference_id": payment.reference_id, "status": payment.status,
                "artwork": payment.artwork.title, "artist": payment.artist.username, "buyer": payment.buyer.username,
                "gross_amount": str(payment.gross_amount), "artist_amount": str(payment.artist_amount), "platform_fee": str(payment.platform_fee),
                "paid_at": payment.paid_at.isoformat() if payment.paid_at else None,
                "can_release": payment.status == PaymentSession.Status.PAID and not payment.ledger_entries.filter(entry_type=WalletLedgerEntry.EntryType.SALE_AVAILABLE).exists() and not payment.incident_reports.filter(status__in=['open', 'under_review']).exists() and not payment.cancellation_requests.filter(status__in=['pending', 'approved']).exists() and not payment.financial_authorizations.filter(status='authorized').exists(),
            } for payment in payments],
        })

    def post(self, request, payment_id):
        action = request.data.get("action")
        if action not in {"release", "refund"}:
            return Response({"error": "action must be release or refund."}, status=status.HTTP_400_BAD_REQUEST)
        with transaction.atomic():
            try:
                payment = PaymentSession.objects.select_for_update().select_related("artist").get(id=payment_id, status=PaymentSession.Status.PAID, is_simulated=False)
            except PaymentSession.DoesNotExist:
                return Response({"error": "Paid transaction not found."}, status=status.HTTP_404_NOT_FOUND)
            wallet = WalletAccount.objects.select_for_update().get(user=payment.artist)
            if action == "release":
                if payment.incident_reports.filter(status__in=['open', 'under_review']).exists() or payment.cancellation_requests.filter(status__in=['pending', 'approved']).exists() or payment.financial_authorizations.filter(status='authorized').exists():
                    return Response({'error': 'Resolve open reports, transaction requests, and pending compensation authorizations before releasing funds.'}, status=409)
                if WalletLedgerEntry.objects.filter(payment_session=payment, entry_type=WalletLedgerEntry.EntryType.SALE_AVAILABLE).exists():
                    return Response({"error": "Funds have already been released."}, status=status.HTTP_409_CONFLICT)
                WalletLedgerEntry.objects.create(wallet=wallet, payment_session=payment, entry_type=WalletLedgerEntry.EntryType.SALE_AVAILABLE, amount=payment.artist_amount)
                wallet.pending_balance -= payment.artist_amount
                wallet.available_balance += payment.artist_amount
            else:
                if WalletLedgerEntry.objects.filter(payment_session=payment, entry_type=WalletLedgerEntry.EntryType.SALE_AVAILABLE).exists():
                    return Response({"error": "Available funds need a payout/refund workflow; do not reverse them here."}, status=status.HTTP_409_CONFLICT)
                WalletLedgerEntry.objects.create(wallet=wallet, payment_session=payment, entry_type=WalletLedgerEntry.EntryType.REFUND_REVERSAL, amount=-payment.artist_amount)
                wallet.pending_balance -= payment.artist_amount
                payment.status = PaymentSession.Status.REFUNDED
                payment.save(update_fields=["status"])
            wallet.save(update_fields=["pending_balance", "available_balance", "updated_at"])
        return Response({"message": f"Funds {action}d successfully."})


class PlatformAdminRequestView(AuthenticatedAPIView):
    permission_classes = [IsPlatformAdmin]

    def get(self, request):
        rows = CancellationReturnRequest.objects.select_related("requester", "payment_session__artwork").all()[:100]
        return Response([{**serialize_request(row), "requester": row.requester.username} for row in rows])

    @transaction.atomic
    def patch(self, request, request_id):
        decision = request.data.get("status")
        if decision not in {CancellationReturnRequest.Status.APPROVED, CancellationReturnRequest.Status.DECLINED}:
            return Response({"error": "status must be approved or declined."}, status=400)
        row = CancellationReturnRequest.objects.select_for_update().filter(id=request_id, status=CancellationReturnRequest.Status.PENDING).first()
        if not row:
            return Response({"error": "Pending request not found."}, status=404)
        if decision == 'approved' and row.request_type == 'cancellation' and row.counterpart_decision != 'accepted':
            return Response({'error': 'The other party must accept the cancellation before approval.'}, status=409)
        row.status, row.admin_note, row.reviewed_by, row.reviewed_at = decision, (request.data.get("admin_note") or "").strip(), self.get_request_user(request), timezone.now()
        row.save(update_fields=["status", "admin_note", "reviewed_by", "reviewed_at"])
        ActivityLog.objects.create(user=row.requester, action=f"{row.request_type}_{decision}", description=f"Your {row.request_type} request for transaction #{row.payment_session_id} was {decision}.", reference_type="payment_session", reference_id=row.payment_session_id)
        return Response(serialize_request(row))


class PlatformAdminUserView(AuthenticatedAPIView):
    permission_classes = [IsPlatformAdmin]

    def get(self, request):
        return Response([{"id": user.id, "email": user.email, "username": user.username, "role": user.role, "wallet": str(user.wallet.available_balance) if hasattr(user, "wallet") else "0.00"} for user in User.objects.all().order_by("email")])

    def patch(self, request, user_id):
        admin = self.get_request_user(request)
        role = request.data.get("role")
        if role not in User.Role.values:
            return Response({"error": "Invalid role."}, status=400)
        target = User.objects.filter(id=user_id).first()
        if not target:
            return Response({"error": "User not found."}, status=404)
        if target.id == admin.id and role != User.Role.PLATFORM_ADMIN:
            return Response({"error": "You cannot remove your own platform-admin access."}, status=409)
        target.role = role
        target.save(update_fields=["role"])
        ActivityLog.objects.create(user=target, action="role_changed", description=f"Your account role was changed to {target.get_role_display()}.", reference_type="user", reference_id=target.id)
        return Response({"id": target.id, "role": target.role})


def apply_xendit_status(payment_id, data):
    if not isinstance(data, dict):
        raise ValueError('Invalid payment response.')
    session_id = data.get('payment_session_id') or data.get('id')
    if data.get('payment_session_id') and data.get('id') and data['payment_session_id'] != data['id']:
        raise ValueError('Conflicting payment session IDs.')
    with transaction.atomic():
        payment = PaymentSession.objects.select_for_update().select_related('artist').get(pk=payment_id, is_simulated=False)
        try:
            amount = Decimal(str(data.get('amount', '')))
        except InvalidOperation:
            raise ValueError('Payment amount is missing or invalid.')
        if (not amount.is_finite() or amount != payment.gross_amount or data.get('currency') != 'PHP'
                or data.get('reference_id') != payment.reference_id or data.get('session_type') != 'PAY'
                or not payment.xendit_session_id or session_id != payment.xendit_session_id):
            raise ValueError('Payment details do not match this purchase.')
        if payment.status != PaymentSession.Status.PENDING:
            return payment.status
        provider_status = data.get('status')
        if provider_status in ('EXPIRED', 'CANCELED'):
            payment.status = PaymentSession.Status.EXPIRED
            payment.save(update_fields=['status'])
        elif provider_status == 'COMPLETED':
            wallet, _ = WalletAccount.objects.get_or_create(user=payment.artist)
            wallet = WalletAccount.objects.select_for_update().get(pk=wallet.pk)
            WalletLedgerEntry.objects.create(wallet=wallet, payment_session=payment, entry_type=WalletLedgerEntry.EntryType.SALE_HELD, amount=payment.artist_amount)
            wallet.pending_balance += payment.artist_amount
            wallet.save(update_fields=['pending_balance', 'updated_at'])
            payment.status = PaymentSession.Status.PAID
            payment.xendit_payment_id = data.get('payment_id') or ''
            payment.paid_at = timezone.now()
            payment.save(update_fields=['status', 'xendit_payment_id', 'paid_at'])
            fulfill_payment(payment)
            record_sale_proof(payment)
            CartItem.objects.filter(cart__buyer=payment.buyer, listing_id=payment.artwork_id).delete()
            ActivityLog.objects.create(user=payment.buyer, action='payment_completed', description=f'Payment for {payment.artwork.title} was confirmed by Xendit.', reference_type='payment_session', reference_id=payment.id)
            ActivityLog.objects.create(user=payment.artist, action='sale_paid', description=f'Payment for {payment.artwork.title} is held pending completion.', reference_type='payment_session', reference_id=payment.id)
        return payment.status


class PaymentStatusView(AuthenticatedAPIView):
    def post(self, request, payment_id):
        buyer = self.get_request_user(request)
        if not buyer:
            return Response({'error': 'Please log in.'}, status=401)
        payment = PaymentSession.objects.filter(pk=payment_id, buyer=buyer).first()
        if not payment:
            return Response({'error': 'Purchase not found.'}, status=404)
        if payment.is_simulated or payment.status != PaymentSession.Status.PENDING:
            return Response({'status': payment.status})
        if not payment.xendit_session_id:
            return Response({'error': 'Checkout creation is unresolved. Contact support with reference ' + payment.reference_id}, status=409)
        try:
            response = requests.get('https://api.xendit.co/sessions/' + payment.xendit_session_id,
                                    auth=(settings.XENDIT_SECRET_KEY, ''), timeout=15)
            if not response.ok:
                return Response({'error': 'Unable to check Xendit payment status. Please try again.'}, status=502)
            state = apply_xendit_status(payment.id, response.json())
            return Response({'status': state})
        except (requests.RequestException, ValueError, TypeError):
            return Response({'error': 'Payment could not be verified. Please try again.'}, status=502)


@csrf_exempt
@api_view(['POST'])
@permission_classes([AllowAny])
def xendit_payment_session_webhook(request):
    expected = settings.XENDIT_WEBHOOK_TOKEN
    if not expected or not hmac.compare_digest(request.headers.get('x-callback-token', ''), expected):
        return Response({'error': 'Invalid webhook token.'}, status=401)
    if request.data.get('event') not in ('payment_session.completed', 'payment_session.expired', 'payment_session.canceled'):
        return Response({'received': True})
    data = request.data.get('data')
    if not isinstance(data, dict):
        return Response({'error': 'Invalid payload.'}, status=400)
    if data.get('session_type') == 'SAVE':
        return Response({'received': True, 'ignored': 'Payment-method saving session.'})
    payment = PaymentSession.objects.filter(reference_id=data.get('reference_id', ''), is_simulated=False).first()
    if not payment:
        return Response({'error': 'Unknown payment reference.'}, status=404)
    try:
        apply_xendit_status(payment.id, data)
    except ValueError as error:
        return Response({'error': str(error)}, status=400)
    return Response({'received': True})


class CustomerSupportRequestView(AuthenticatedAPIView):
    from authentication.permissions import IsCustomerSupport
    permission_classes = [IsCustomerSupport]

    def get(self, request):
        rows = CancellationReturnRequest.objects.select_related("requester", "payment_session__artwork").all()[:100]
        return Response([{**serialize_request(row), "requester": row.requester.username} for row in rows])

    @transaction.atomic
    def patch(self, request, request_id):
        decision = request.data.get("status")
        if decision not in {CancellationReturnRequest.Status.APPROVED, CancellationReturnRequest.Status.DECLINED}:
            return Response({"error": "status must be approved or declined."}, status=400)
        note = request.data.get('admin_note', '')
        if not isinstance(note, str) or not 10 <= len(note.strip()) <= 2000:
            return Response({'error': 'Enter a decision note between 10 and 2000 characters.'}, status=400)
        row = CancellationReturnRequest.objects.select_for_update().filter(id=request_id, status=CancellationReturnRequest.Status.PENDING).first()
        if not row:
            return Response({"error": "Pending request not found."}, status=404)
        row.status, row.admin_note, row.reviewed_by, row.reviewed_at = decision, (request.data.get("admin_note") or "").strip(), self.get_request_user(request), timezone.now()
        row.save(update_fields=["status", "admin_note", "reviewed_by", "reviewed_at"])
        ActivityLog.objects.create(user=row.requester, action=f"{row.request_type}_{decision}", description=f"Your {row.request_type} request for transaction #{row.payment_session_id} was {decision}.", reference_type="payment_session", reference_id=row.payment_session_id)
        return Response(serialize_request(row))
