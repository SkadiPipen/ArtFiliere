import hmac
import os
import uuid
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
from users.models import User
from .models import PaymentSession, WalletAccount, WalletLedgerEntry

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
        return Response({"checkout_url": payload.get("payment_link_url"), "reference_id": session.reference_id}, status=status.HTTP_201_CREATED)


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
    return Response({"received": True})
