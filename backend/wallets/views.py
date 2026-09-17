import hmac
import os
import uuid
import math
from decimal import Decimal, ROUND_HALF_UP

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
from .models import CancellationReturnRequest, PaymentSession, WalletAccount, WalletLedgerEntry

from delivery.models import Order as DeliveryOrder
from notifications.models import UserNotification
PLATFORM_FEE_RATE = Decimal("0.10")


class WalletView(AuthenticatedAPIView):
    def get(self, request):
        user = self.get_request_user(request)
        if not user:
            return Response({"error": "Authentication is required."}, status=status.HTTP_401_UNAUTHORIZED)
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

# haversine formula that calculate distance/eta
def calculate_distance_and_eta(lat1, lon1, lat2, lon2):
    """Calculates road distance and estimated motorbike delivery time using Haversine formula."""
    try:
        lat1, lon1, lat2, lon2 = map(float, [lat1, lon1, lat2, lon2])
        # Earth radius in km
        r = 6371.0
        d_lat = math.radians(lat2 - lat1)
        d_lon = math.radians(lon2 - lon1)
        a = (
            math.sin(d_lat / 2) ** 2
            + math.cos(math.radians(lat1)) * math.cos(math.radians(lat2)) * math.sin(d_lon / 2) ** 2
        )
        c = 2 * math.atan2(math.sqrt(a), math.sqrt(1 - a))
        km = r * c

        # Road detour factor ~ 1.3x straight-line distance
        road_km = round(km * 1.3, 1)
        # Assuming average inner-city motorbike delivery speed of 25 km/h + 10 min pickup buffer
        est_minutes = int(round((road_km / 25.0) * 60)) + 10

        return f"{road_km} km", f"{est_minutes} mins"
    except Exception:
        return "TBD", "Calculating..."
    
# Added helper
def create_delivery_and_notify(payment):
    print(">>> [DEBUG] create_delivery_and_notify triggered for payment:", payment.id)
    artwork = payment.artwork
    print(">>> [DEBUG] Artwork:", artwork)

    raw_art_type = (
        getattr(artwork, "artwork_type", None)
        or getattr(artwork, "category", None)
        or getattr(artwork, "type", "")
    )
    art_type_str = str(raw_art_type).upper()
    print(">>> [DEBUG] Resolved art_type:", repr(art_type_str))

    physical_keywords = ["PHYSICAL", "PAINTING", "SCULPTURE", "TRADITIONAL", "CRAFT", "CANVAS"]
    is_physical = any(kw in art_type_str for kw in physical_keywords)
    print(">>> [DEBUG] Evaluated is_physical:", is_physical)

    buyer = payment.buyer
    artist = payment.artist

    if is_physical:
        buyer_profile = getattr(buyer, "profile", None)
        buyer_address = (
            getattr(buyer, "delivery_address", None)
            or getattr(buyer_profile, "delivery_address", None)
            or getattr(buyer_profile, "address", None)
            or getattr(buyer, "address", None)
            or "Cebu City, Philippines"
        )
        buyer_lat = float(getattr(buyer_profile, "latitude", None) or getattr(buyer, "latitude", 10.3157))
        buyer_lng = float(getattr(buyer_profile, "longitude", None) or getattr(buyer, "longitude", 123.8854))

        artist_profile = getattr(artist, "artist_profile", None) or getattr(artist, "profile", None)
        artist_lat = float(getattr(artist_profile, "latitude", None) or getattr(artist, "latitude", 10.3110))
        artist_lng = float(getattr(artist_profile, "longitude", None) or getattr(artist, "longitude", 123.8910))

        dynamic_distance, dynamic_eta = calculate_distance_and_eta(
            artist_lat, artist_lng, buyer_lat, buyer_lng
        )

        payment_method = (
            getattr(payment, "payment_method", None)
            or getattr(payment, "payment_channel", None)
            or getattr(payment, "channel_code", None)
            or "XENDIT"
        )

        if hasattr(payment, "items"):
            items_count = payment.items.count()
        elif hasattr(payment, "order_items"):
            items_count = payment.order_items.count()
        else:
            items_count = 1

        raw_pm = str(payment_method).upper()
        if "PAYPAL" in raw_pm:
            safe_payment = "Paypal"
        elif "GCASH" in raw_pm:
            safe_payment = "Gcash"
        elif "MAYA" in raw_pm:
            safe_payment = "Maya"
        else:
            safe_payment = str(payment_method)[:10]

        safe_distance = str(dynamic_distance)[:10]
        safe_eta = str(dynamic_eta)[:10]

        delivery_order, _ = DeliveryOrder.objects.get_or_create(
            id=payment.id,
            defaults={
                "buyerId": buyer.id,
                "address": buyer_address,
                "paymentMethod": safe_payment,
                "distance": safe_distance,
                "estimatedTime": safe_eta,
                "items_count": items_count,
                "status": "PENDING",
            },
        )
        print(f">>> [DEBUG] Successfully created DeliveryOrder #{delivery_order.id}: {dynamic_distance}, ETA: {dynamic_eta}")

        try:
            UserNotification.objects.create(
                user=artist,
                artwork=artwork,
                title="New Sale - Prepare for Pickup",
                message=f"Order for '{artwork.title}' is paid. Track: /delivery-details?id={delivery_order.id}",
            )
            UserNotification.objects.create(
                user=buyer,
                artwork=artwork,
                title="Order Confirmed - Dispatching Rider",
                message=f"Payment received for '{artwork.title}'. Track delivery: /delivery-details?id={delivery_order.id}",
            )
        except Exception as e:
            print(">>> [DEBUG] UserNotification error (ignored):", e)

        try:
            ActivityLog.objects.create(
                user=buyer,
                action="delivery_dispatched",
                description=f"Delivery order #{delivery_order.id} generated for {artwork.title}.",
                reference_type="delivery_order",
                reference_id=delivery_order.id,
            )
        except Exception as e:
            print(">>> [DEBUG] ActivityLog error (ignored):", e)

        return delivery_order

class ArtworkCheckoutView(AuthenticatedAPIView):
    def post(self, request, artwork_id):
        buyer = self.get_request_user(request)
        if not buyer:
            return Response({"error": "Authentication is required."}, status=status.HTTP_401_UNAUTHORIZED)
        if not getattr(settings, "XENDIT_SECRET_KEY", ""):
            return Response({"error": "Xendit sandbox is not configured yet."}, status=status.HTTP_503_SERVICE_UNAVAILABLE)
        try:
            artwork = Artwork.objects.select_related("artist").get(id=artwork_id, status=Artwork.Status.APPROVED)
        except Artwork.DoesNotExist:
            return Response({"error": "Artwork is not available for purchase."}, status=status.HTTP_404_NOT_FOUND)
        if artwork.artist_id == buyer.id:
            return Response({"error": "You cannot purchase your own artwork."}, status=status.HTTP_400_BAD_REQUEST)

        gross = artwork.price
        platform_fee = (gross * PLATFORM_FEE_RATE).quantize(Decimal("0.01"), rounding=ROUND_HALF_UP)
        session = PaymentSession.objects.create(
            reference_id=f"art_{artwork.id}_{uuid.uuid4().hex[:20]}", buyer=buyer, artist=artwork.artist,
            artwork=artwork, gross_amount=gross, platform_fee=platform_fee, artist_amount=gross-platform_fee,
        )
        try:
            xendit_payload = {
                "reference_id": session.reference_id, "session_type": "PAY", "mode": "PAYMENT_LINK",
                "amount": float(gross), "currency": "PHP", "country": "PH",
                "description": f"ArtFiliere purchase: {artwork.title}",
            }
            for field in ("success_return_url", "cancel_return_url"):
                if request.data.get(field):
                    xendit_payload[field] = request.data[field]
            response = requests.post(
                "https://api.xendit.co/sessions", auth=(settings.XENDIT_SECRET_KEY, ""), timeout=20,
                json=xendit_payload,
            )
            payload = response.json()
            if not response.ok:
                raise RuntimeError(payload.get("message", "Xendit checkout could not be created."))
        except (requests.RequestException, ValueError, RuntimeError) as error:
            session.delete()
            return Response({"error": str(error)}, status=status.HTTP_502_BAD_GATEWAY)
        session.xendit_session_id = payload.get("payment_session_id", "")
        session.save(update_fields=["xendit_session_id"])

        #Call helper
        if settings.DEBUG:
            create_delivery_and_notify(session)

        return Response({"checkout_url": payload.get("payment_link_url"), "reference_id": session.reference_id}, status=status.HTTP_201_CREATED)


class AgreementCheckoutView(AuthenticatedAPIView):
    """Creates a checkout only after both parties have accepted the same agreement revision."""
    def post(self, request, agreement_id):
        buyer = self.get_request_user(request)
        agreement = Agreement.objects.select_related("artwork", "artist", "buyer").filter(id=agreement_id).first()
        if not agreement or agreement.buyer_id != buyer.id:
            return Response({"error": "Agreement not found."}, status=404)
        if agreement.status != Agreement.Status.ACCEPTED:
            return Response({"error": "Both parties must accept the agreement before payment."}, status=409)
        if not agreement.artwork_id:
            return Response({"error": "An artwork must be attached to the agreement before payment."}, status=400)
        existing = PaymentSession.objects.filter(agreement=agreement, status__in=[PaymentSession.Status.PENDING, PaymentSession.Status.PAID]).first()
        if existing:
            return Response({"error": "This agreement already has an active payment.", "reference_id": existing.reference_id}, status=409)
        if not getattr(settings, "XENDIT_SECRET_KEY", ""):
            return Response({"error": "Xendit sandbox is not configured yet."}, status=503)

        gross = agreement.price
        platform_fee = (gross * PLATFORM_FEE_RATE).quantize(Decimal("0.01"), rounding=ROUND_HALF_UP)
        session = PaymentSession.objects.create(
            reference_id=f"agreement_{agreement.id}_{uuid.uuid4().hex[:16]}", buyer=buyer, artist=agreement.artist,
            artwork=agreement.artwork, agreement=agreement, gross_amount=gross,
            platform_fee=platform_fee, artist_amount=gross-platform_fee,
        )
        try:
            payload = {
                "reference_id": session.reference_id, "session_type": "PAY", "mode": "PAYMENT_LINK",
                "amount": float(gross), "currency": "PHP", "country": "PH",
                "description": f"ArtFiliere agreement payment: {agreement.artwork.title}",
            }
            for field in ("success_return_url", "cancel_return_url"):
                if request.data.get(field):
                    payload[field] = request.data[field]
            response = requests.post("https://api.xendit.co/sessions", auth=(settings.XENDIT_SECRET_KEY, ""), timeout=20, json=payload)
            result = response.json()
            if not response.ok:
                raise RuntimeError(result.get("message", "Xendit checkout could not be created."))
        except (requests.RequestException, ValueError, RuntimeError) as error:
            session.delete()
            return Response({"error": str(error)}, status=502)
        session.xendit_session_id = result.get("payment_session_id", "")
        session.save(update_fields=["xendit_session_id"])
        ActivityLog.objects.create(user=buyer, action="payment_started", description=f"Started payment for agreement #{agreement.id}.", reference_type="payment_session", reference_id=session.id)
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
        payments = PaymentSession.objects.select_related("artist", "buyer", "artwork").order_by("-created_at")[:100]
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
                "can_release": payment.status == PaymentSession.Status.PAID and not payment.ledger_entries.filter(entry_type=WalletLedgerEntry.EntryType.SALE_AVAILABLE).exists(),
            } for payment in payments],
        })

    def post(self, request, payment_id):
        action = request.data.get("action")
        if action not in {"release", "refund"}:
            return Response({"error": "action must be release or refund."}, status=status.HTTP_400_BAD_REQUEST)
        with transaction.atomic():
            try:
                payment = PaymentSession.objects.select_for_update().select_related("artist").get(id=payment_id, status=PaymentSession.Status.PAID)
            except PaymentSession.DoesNotExist:
                return Response({"error": "Paid transaction not found."}, status=status.HTTP_404_NOT_FOUND)
            wallet = WalletAccount.objects.select_for_update().get(user=payment.artist)
            if action == "release":
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

    def patch(self, request, request_id):
        decision = request.data.get("status")
        if decision not in {CancellationReturnRequest.Status.APPROVED, CancellationReturnRequest.Status.DECLINED}:
            return Response({"error": "status must be approved or declined."}, status=400)
        row = CancellationReturnRequest.objects.filter(id=request_id, status=CancellationReturnRequest.Status.PENDING).first()
        if not row:
            return Response({"error": "Pending request not found."}, status=404)
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


@csrf_exempt
@api_view(["POST"])
@permission_classes([AllowAny])
def xendit_payment_session_webhook(request):
    expected_token = getattr(settings, "XENDIT_WEBHOOK_TOKEN", "")
    received_token = request.headers.get("x-callback-token", "")
    if not expected_token or not hmac.compare_digest(received_token, expected_token):
        return Response({"error": "Invalid webhook token."}, status=status.HTTP_401_UNAUTHORIZED)
    if request.data.get("event") != "payment_session.completed":
        return Response({"received": True})
    data = request.data.get("data", {})
    reference_id = data.get("reference_id", "")
    with transaction.atomic():
        try:
            payment = PaymentSession.objects.select_for_update().select_related("artist").get(reference_id=reference_id)
        except PaymentSession.DoesNotExist:
            return Response({"error": "Unknown payment reference."}, status=status.HTTP_404_NOT_FOUND)
        if payment.status == PaymentSession.Status.PAID:
            return Response({"received": True, "duplicate": True})
        if data.get("status") != "COMPLETED":
            return Response({"received": True})
        wallet, _ = WalletAccount.objects.select_for_update().get_or_create(user=payment.artist)
        try:
            WalletLedgerEntry.objects.create(wallet=wallet, payment_session=payment, entry_type=WalletLedgerEntry.EntryType.SALE_HELD, amount=payment.artist_amount)
        except IntegrityError:
            return Response({"received": True, "duplicate": True})
        wallet.pending_balance += payment.artist_amount
        wallet.save(update_fields=["pending_balance", "updated_at"])
        payment.status = PaymentSession.Status.PAID
        payment.xendit_payment_id = data.get("payment_id", "")
        payment.paid_at = timezone.now()
        payment.save(update_fields=["status", "xendit_payment_id", "paid_at"])
        ActivityLog.objects.create(user=payment.buyer, action="payment_completed", description=f"Payment for {payment.artwork.title} was received by ArtFiliere.", reference_type="payment_session", reference_id=payment.id)
        ActivityLog.objects.create(user=payment.artist, action="sale_paid", description=f"Payment for {payment.artwork.title} is held pending completion.", reference_type="payment_session", reference_id=payment.id)

        # delivery trigger
        create_delivery_and_notify(payment)

    return Response({"received": True})
