import secrets

from django.db import models
from django.db.models import Q

from artworks.models import Artwork
from users.models import User


def sale_verification_code():
    return f"AF-SALE-{secrets.token_hex(6).upper()}"
class SupportTicket(models.Model):
    class Status(models.TextChoices):
        OPEN = 'open', 'Open'
        IN_PROGRESS = 'in_progress', 'In progress'
        AWAITING_CUSTOMER = 'awaiting_customer', 'Awaiting your reply'
        RESOLVED = 'resolved', 'Resolved'
        CLOSED = 'closed', 'Closed'

    requester = models.ForeignKey(User, on_delete=models.PROTECT, related_name='support_tickets')
    assigned_to = models.ForeignKey(User, null=True, blank=True, on_delete=models.PROTECT, related_name='assigned_support_tickets')
    transfer_to = models.ForeignKey(User, null=True, blank=True, on_delete=models.SET_NULL, related_name='incoming_support_transfers')
    concern = models.CharField(max_length=60)
    payment = models.ForeignKey('PaymentSession', null=True, blank=True, on_delete=models.PROTECT)
    artwork = models.ForeignKey(Artwork, null=True, blank=True, on_delete=models.PROTECT)
    commission = models.ForeignKey('commissions.CommissionRequest', null=True, blank=True, on_delete=models.PROTECT)
    auction = models.ForeignKey('auctions.AuctionListing', null=True, blank=True, on_delete=models.PROTECT)
    details = models.TextField(max_length=4000)
    evidence = models.TextField(blank=True, max_length=2000)
    image_data = models.TextField(blank=True)
    status = models.CharField(max_length=24, choices=Status.choices, default=Status.OPEN)
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        ordering = ['-updated_at', '-pk']


class SupportReply(models.Model):
    ticket = models.ForeignKey(SupportTicket, on_delete=models.CASCADE, related_name='replies')
    sender = models.ForeignKey(User, on_delete=models.PROTECT)
    message = models.TextField(max_length=4000)
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        ordering = ['created_at', 'pk']


class AccountModerationRequest(models.Model):
    ticket = models.ForeignKey(SupportTicket, on_delete=models.PROTECT, related_name='account_requests')
    target = models.ForeignKey(User, on_delete=models.PROTECT, related_name='account_moderation_requests')
    requested_by = models.ForeignKey(User, on_delete=models.PROTECT, related_name='requested_account_actions')
    action = models.CharField(max_length=12, choices=[('suspend', 'Suspend'), ('ban', 'Ban'), ('restore', 'Restore access')])
    duration_days = models.PositiveSmallIntegerField(null=True, blank=True)
    reason = models.TextField(max_length=4000)
    status = models.CharField(max_length=12, default='pending', choices=[('pending', 'Pending'), ('approved', 'Approved'), ('rejected', 'Rejected')])
    reviewed_by = models.ForeignKey(User, on_delete=models.PROTECT, related_name='reviewed_account_actions', null=True, blank=True)
    review_note = models.TextField(blank=True, max_length=4000)
    created_at = models.DateTimeField(auto_now_add=True)
    reviewed_at = models.DateTimeField(null=True, blank=True)
    revoked_at = models.DateTimeField(null=True, blank=True)
    revoked_by = models.ForeignKey(User, on_delete=models.PROTECT, null=True, blank=True, related_name='reversed_ticket_restrictions')
    reversal_reason = models.TextField(blank=True)

    class Meta:
        ordering = ['-created_at']
        constraints = [models.UniqueConstraint(fields=['target'], condition=Q(status='pending'), name='one_pending_moderation_request')]


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
    is_simulated = models.BooleanField(default=False)
    artwork_png = models.BinaryField(null=True, blank=True)
    checkout_url = models.URLField(max_length=2000, blank=True, default="")
    xendit_session_id = models.CharField(max_length=80, blank=True, default="")
    xendit_payment_id = models.CharField(max_length=80, blank=True, default="")
    status = models.CharField(max_length=20, choices=Status.choices, default=Status.PENDING)
    paid_at = models.DateTimeField(null=True, blank=True)
    created_at = models.DateTimeField(auto_now_add=True)
    verification_code = models.CharField(max_length=24, unique=True, default=sale_verification_code, editable=False)


class CancellationReturnRequest(models.Model):
    class RequestType(models.TextChoices):
        REFUND = 'refund', 'Refund'
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
    counterpart_decision = models.CharField(max_length=12, default='pending')
    counterpart_note = models.TextField(blank=True, default='')
    responded_by = models.ForeignKey(User, on_delete=models.PROTECT, null=True, blank=True, related_name='transaction_request_responses')
    responded_at = models.DateTimeField(null=True, blank=True)

    class Meta:
        ordering = ["-created_at"]
        constraints = [models.UniqueConstraint(fields=["payment_session", "requester", "request_type"], condition=Q(status="pending"), name="unique_open_request_type")]


class IncidentReport(models.Model):
    reporter = models.ForeignKey(User, on_delete=models.PROTECT, related_name='incident_reports')
    reported_user = models.ForeignKey(User, on_delete=models.PROTECT, null=True, blank=True, related_name='reports_received')
    payment = models.ForeignKey(PaymentSession, on_delete=models.PROTECT, null=True, blank=True, related_name='incident_reports')
    category = models.CharField(max_length=20, default='incident')
    title = models.CharField(max_length=150)
    description = models.TextField()
    evidence = models.TextField(blank=True, default='')
    status = models.CharField(max_length=20, default='open')
    resolution = models.TextField(blank=True, default='')
    reviewed_by = models.ForeignKey(User, on_delete=models.PROTECT, null=True, blank=True, related_name='reports_reviewed')
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)


class ReportAttachment(models.Model):
    report = models.ForeignKey(IncidentReport, on_delete=models.CASCADE, related_name='attachments', null=True, blank=True)
    appeal = models.ForeignKey('RestrictionAppeal', on_delete=models.CASCADE, related_name='attachments', null=True, blank=True)
    name = models.CharField(max_length=200)
    content_type = models.CharField(max_length=100)
    content = models.BinaryField()
    size = models.PositiveIntegerField()


class AccountActionRequest(models.Model):
    report = models.ForeignKey(IncidentReport, on_delete=models.PROTECT, related_name='account_actions')
    target = models.ForeignKey(User, on_delete=models.PROTECT, related_name='account_action_requests')
    initiated_by = models.ForeignKey(User, on_delete=models.PROTECT, related_name='initiated_account_actions')
    action = models.CharField(max_length=12)
    reason = models.TextField()
    duration_days = models.PositiveSmallIntegerField(null=True, blank=True)
    status = models.CharField(max_length=12, default='pending')
    reviewed_by = models.ForeignKey(User, on_delete=models.PROTECT, null=True, blank=True, related_name='approved_account_actions')
    review_note = models.TextField(blank=True, default='')
    reviewed_at = models.DateTimeField(null=True, blank=True)
    expires_at = models.DateTimeField(null=True, blank=True)
    created_at = models.DateTimeField(auto_now_add=True)
    revoked_at = models.DateTimeField(null=True, blank=True)
    revoked_by = models.ForeignKey(User, on_delete=models.PROTECT, null=True, blank=True, related_name='reversed_report_restrictions')
    reversal_reason = models.TextField(blank=True)

    class Meta:
        constraints = [models.UniqueConstraint(fields=['target'], condition=Q(status='pending'), name='one_pending_account_action')]


class RestrictionAppeal(models.Model):
    user = models.ForeignKey(User, on_delete=models.PROTECT, related_name='restriction_appeals')
    source = models.CharField(max_length=10)
    restriction_id = models.PositiveIntegerField()
    explanation = models.TextField()
    links = models.JSONField(default=list)
    status = models.CharField(max_length=20, default='pending')
    recommendation = models.CharField(max_length=20, blank=True)
    moderator_note = models.TextField(blank=True)
    recommended_by = models.ForeignKey(User, on_delete=models.PROTECT, null=True, blank=True, related_name='recommended_restriction_appeals')
    decision_note = models.TextField(blank=True)
    decided_by = models.ForeignKey(User, on_delete=models.PROTECT, null=True, blank=True, related_name='decided_restriction_appeals')
    created_at = models.DateTimeField(auto_now_add=True)
    decided_at = models.DateTimeField(null=True, blank=True)

    class Meta:
        constraints = [models.UniqueConstraint(fields=['user', 'source', 'restriction_id'], condition=Q(status__in=['pending', 'recommended']), name='one_open_restriction_appeal')]


class FinancialAuthorization(models.Model):
    report = models.ForeignKey(IncidentReport, on_delete=models.PROTECT, related_name='financial_authorizations')
    payment = models.ForeignKey(PaymentSession, on_delete=models.PROTECT, related_name='financial_authorizations')
    recipient = models.ForeignKey(User, on_delete=models.PROTECT, related_name='financial_authorizations_received')
    authorized_by = models.ForeignKey(User, on_delete=models.PROTECT, related_name='financial_authorizations_given')
    kind = models.CharField(max_length=20, choices=[('refund', 'Refund'), ('wallet_credit', 'Wallet credit')])
    amount = models.DecimalField(max_digits=12, decimal_places=2)
    reason = models.TextField()
    status = models.CharField(max_length=20, default='authorized')
    created_at = models.DateTimeField(auto_now_add=True)


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
