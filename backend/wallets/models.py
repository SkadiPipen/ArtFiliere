from django.db import models
from django.db.models import Q

from artworks.models import Artwork
from users.models import User


class WalletAccount(models.Model):
    """Display balance derived from immutable ledger entries; never accept client edits."""
    user = models.OneToOneField(User, on_delete=models.CASCADE, related_name="wallet")
    currency = models.CharField(max_length=3, default="PHP")
    pending_balance = models.DecimalField(max_digits=12, decimal_places=2, default=0)
    available_balance = models.DecimalField(max_digits=12, decimal_places=2, default=0)
    paid_out_balance = models.DecimalField(max_digits=12, decimal_places=2, default=0)
    updated_at = models.DateTimeField(auto_now=True)


class PaymentSession(models.Model):
    class Status(models.TextChoices):
        PENDING = "pending", "Pending"
        PAID = "paid", "Paid"
        EXPIRED = "expired", "Expired"
        REFUNDED = "refunded", "Refunded"

    reference_id = models.CharField(max_length=64, unique=True)
    buyer = models.ForeignKey(User, on_delete=models.PROTECT, related_name="purchases")
    artist = models.ForeignKey(User, on_delete=models.PROTECT, related_name="sales")
    artwork = models.ForeignKey(Artwork, on_delete=models.PROTECT, related_name="payment_sessions")
    agreement = models.ForeignKey("messaging.Agreement", on_delete=models.PROTECT, related_name="payment_sessions", null=True, blank=True)
    gross_amount = models.DecimalField(max_digits=12, decimal_places=2)
    platform_fee = models.DecimalField(max_digits=12, decimal_places=2)
    artist_amount = models.DecimalField(max_digits=12, decimal_places=2)
    xendit_session_id = models.CharField(max_length=80, blank=True, default="")
    xendit_payment_id = models.CharField(max_length=80, blank=True, default="")
    status = models.CharField(max_length=20, choices=Status.choices, default=Status.PENDING)
    paid_at = models.DateTimeField(null=True, blank=True)
    created_at = models.DateTimeField(auto_now_add=True)


class CancellationReturnRequest(models.Model):
    class RequestType(models.TextChoices):
        CANCELLATION = "cancellation", "Cancellation"
        RETURN = "return", "Return"

    class Status(models.TextChoices):
        PENDING = "pending", "Pending review"
        APPROVED = "approved", "Approved"
        DECLINED = "declined", "Declined"

    payment_session = models.ForeignKey(PaymentSession, on_delete=models.PROTECT, related_name="cancellation_requests")
    requester = models.ForeignKey(User, on_delete=models.PROTECT, related_name="cancellation_requests")
    request_type = models.CharField(max_length=20, choices=RequestType.choices)
    reason = models.TextField()
    status = models.CharField(max_length=20, choices=Status.choices, default=Status.PENDING)
    admin_note = models.TextField(blank=True, default="")
    reviewed_by = models.ForeignKey(User, on_delete=models.PROTECT, null=True, blank=True, related_name="reviewed_cancellation_requests")
    created_at = models.DateTimeField(auto_now_add=True)
    reviewed_at = models.DateTimeField(null=True, blank=True)

    class Meta:
        ordering = ["-created_at"]
        constraints = [models.UniqueConstraint(fields=["payment_session", "requester", "request_type"], condition=Q(status="pending"), name="unique_open_request_type")]


class WalletLedgerEntry(models.Model):
    class EntryType(models.TextChoices):
        SALE_HELD = "sale_held", "Sale held"
        SALE_AVAILABLE = "sale_available", "Sale available"
        PAYOUT = "payout", "Payout"
        REFUND_REVERSAL = "refund_reversal", "Refund reversal"

    wallet = models.ForeignKey(WalletAccount, on_delete=models.PROTECT, related_name="entries")
    payment_session = models.ForeignKey(PaymentSession, on_delete=models.PROTECT, related_name="ledger_entries")
    entry_type = models.CharField(max_length=30, choices=EntryType.choices)
    amount = models.DecimalField(max_digits=12, decimal_places=2)
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        ordering = ["-created_at"]
        constraints = [models.UniqueConstraint(fields=["payment_session", "entry_type"], name="unique_wallet_payment_entry")]
