from django.db import models
from django.conf import settings
from django.utils import timezone

class CommissionRequest(models.Model):
    STATUS_CHOICES = [
        ('NEGOTIATING', 'Negotiating proposal'),
        ('SIGNING', 'Awaiting signatures'),
        ('AWAITING_FUNDS', 'Awaiting upfront funding'),
        ('PENDING', 'Pending Artist Acceptance'),
        ('IN_PROGRESS', 'In Progress / Negotiating'),
        ('STAGE_1', 'Stage 1 (Sketch / Initial)'),
        ('STAGE_2', 'Stage 2 (Rendering / Detailing)'),
        ('STAGE_3', 'Stage 3 (Final Revision)'),
        ('COMPLETE', 'Complete'),
        ('CANCELLED', 'Cancelled'),
    ]

    commission_req_id = models.BigAutoField(primary_key=True)
    buyer = models.ForeignKey('users.User', on_delete=models.CASCADE, related_name='buyer_commissions')
    artist = models.ForeignKey('users.User', on_delete=models.CASCADE, related_name='artist_commissions')
    title = models.CharField(max_length=100)
    subject = models.CharField(max_length=200, blank=True, default='')
    style = models.CharField(max_length=80, blank=True, default='')
    description = models.TextField(blank=True, null=True)
    art_type = models.CharField(max_length=20, default='Physical')  # Physical or Digital
    tags = models.CharField(max_length=255, blank=True, null=True)
    time_duration = models.DecimalField(max_digits=12, decimal_places=2, default=0.00)
    deadline = models.DateTimeField()
    is_rush_job = models.BooleanField(default=False)
    created_at = models.DateTimeField(default=timezone.now)
    status = models.CharField(max_length=20, choices=STATUS_CHOICES, default='PENDING')
    accepted_at = models.DateTimeField(null=True, blank=True)
    flow_version = models.PositiveSmallIntegerField(default=1)
    agreement = models.OneToOneField('messaging.Agreement', null=True, blank=True, on_delete=models.PROTECT, related_name='commission_contract')
    locked_terms = models.JSONField(default=dict, blank=True)
    funding_due_at = models.DateTimeField(null=True, blank=True)
    funded_at = models.DateTimeField(null=True, blank=True)
    funding_reference = models.CharField(max_length=100, blank=True)
    funding_provider_id = models.CharField(max_length=100, blank=True)
    funding_url = models.TextField(blank=True)
    funding_payload = models.JSONField(default=dict, blank=True)
    held_amount = models.DecimalField(max_digits=12, decimal_places=2, default=0)
    platform_fee = models.DecimalField(max_digits=12, decimal_places=2, default=0)
    disputed = models.BooleanField(default=False)
    courier_tracking = models.CharField(max_length=500, blank=True)
    delivered_at = models.DateTimeField(null=True, blank=True)

    def save(self, *args, **kwargs):
        if self.pk and self.flow_version == 2:
            previous = type(self).objects.filter(pk=self.pk).first()
            if previous and previous.agreement_id:
                fields = ('buyer_id', 'artist_id', 'art_type', 'title', 'subject', 'style', 'description', 'locked_terms', 'agreement_id', 'time_duration', 'deadline', 'platform_fee')
                # Normalize database Decimal/date values before comparison.
                if any((getattr(previous, f) != getattr(self, f)) if f == 'locked_terms' else
                       str(getattr(previous, f)) != str(getattr(self, f)) for f in fields):
                    from django.core.exceptions import ValidationError
                    raise ValidationError('Signed commission terms are locked.')
        super().save(*args, **kwargs)

    # Cancellation & Refund Feedback
    cancel_reason = models.CharField(max_length=255, blank=True, null=True)
    cancel_feedback = models.TextField(blank=True, null=True)
    refund_amount = models.DecimalField(max_digits=12, decimal_places=2, default=0.00)
    cancelled_at_stage = models.IntegerField(null=True, blank=True)

    def current_progress(self):
        latest = self.photos.filter(photo_type='PROGRESS').order_by('-progress_percentage').first()
        return latest.progress_percentage if latest else 0

    def __str__(self):
        return f"Commission #{self.commission_req_id} - {self.title}"


class CommissionMilestone(models.Model):
    milestone_id = models.BigAutoField(primary_key=True)
    commission_req = models.ForeignKey(CommissionRequest, on_delete=models.CASCADE, related_name='milestones')
    milestone_number = models.IntegerField()  # 1, 2, or 3
    stage_label = models.CharField(max_length=50, default='Stage 1')
    status = models.CharField(max_length=20, default='PENDING')  # PENDING, READY_TO_PAY, PAID
    percentage = models.IntegerField()  # e.g. 33, 33, 34
    amount = models.DecimalField(max_digits=12, decimal_places=2, default=0.00)
    paid_at = models.DateTimeField(null=True, blank=True)
    approved_at = models.DateTimeField(null=True, blank=True)
    review_due_at = models.DateTimeField(null=True, blank=True)
    delivery_ready_at = models.DateTimeField(null=True, blank=True)
    revision_comment = models.TextField(blank=True)
    revision_requested_at = models.DateTimeField(null=True, blank=True)
    revision_reply = models.TextField(blank=True)
    revision_replied_at = models.DateTimeField(null=True, blank=True)
    payout_reference = models.CharField(max_length=100, blank=True)
    payout_provider_id = models.CharField(max_length=100, blank=True)
    payout_status = models.CharField(max_length=30, default='NOT_REQUESTED')
    payout_payload = models.JSONField(default=dict, blank=True)
    payout_error = models.TextField(blank=True)

    class Meta:
        constraints = [models.UniqueConstraint(fields=['commission_req', 'milestone_number'], name='unique_commission_stage')]


class CommissionPhoto(models.Model):
    PHOTO_TYPE_CHOICES = [
        ('REFERENCE', 'Reference (Buyer)'),
        ('PROGRESS', 'Progress Track (Artist)'),
    ]

    photo_id = models.BigAutoField(primary_key=True)
    commission_req = models.ForeignKey(CommissionRequest, on_delete=models.CASCADE, related_name='photos')
    image_url = models.TextField()
    photo_type = models.CharField(max_length=20, choices=PHOTO_TYPE_CHOICES, default='REFERENCE')
    stage_number = models.IntegerField(default=1)  # 1, 2, or 3
    progress_percentage = models.IntegerField(default=33)
    caption = models.CharField(max_length=255, blank=True, null=True)
    uploaded_at = models.DateTimeField(auto_now_add=True)


class CommissionMessage(models.Model):
    commission = models.ForeignKey(CommissionRequest, on_delete=models.CASCADE, related_name='workspace_messages')
    sender = models.ForeignKey('users.User', on_delete=models.PROTECT)
    body = models.TextField()
    created_at = models.DateTimeField(auto_now_add=True)


class CommissionAccessDecision(models.Model):
    commission = models.ForeignKey(CommissionRequest, on_delete=models.CASCADE, related_name='access_decisions')
    restriction_key = models.CharField(max_length=255)
    approved = models.BooleanField(default=False)
    note = models.TextField()
    reviewed_by = models.ForeignKey('users.User', on_delete=models.PROTECT)
    created_at = models.DateTimeField(auto_now_add=True)


class CommissionProposal(models.Model):
    commission = models.ForeignKey(CommissionRequest, on_delete=models.CASCADE, related_name='proposals')
    proposer = models.ForeignKey('users.User', on_delete=models.PROTECT)
    version = models.PositiveIntegerField()
    terms = models.JSONField()
    status = models.CharField(max_length=20, default='PROPOSED')
    created_at = models.DateTimeField(auto_now_add=True)

    def save(self, *args, **kwargs):
        if self.pk:
            previous = type(self).objects.get(pk=self.pk)
            if previous.terms != self.terms or previous.version != self.version or previous.proposer_id != self.proposer_id:
                from django.core.exceptions import ValidationError
                raise ValidationError('Create a new proposal version instead of changing its terms.')
        super().save(*args, **kwargs)

    class Meta:
        constraints = [models.UniqueConstraint(fields=['commission', 'version'], name='unique_commission_proposal_version')]


class CommissionSubmission(models.Model):
    milestone = models.ForeignKey(CommissionMilestone, on_delete=models.PROTECT, related_name='submissions')
    uploader = models.ForeignKey('users.User', on_delete=models.PROTECT)
    filename = models.CharField(max_length=200)
    content_type = models.CharField(max_length=100)
    content = models.BinaryField()
    sha256 = models.CharField(max_length=64)
    cid = models.CharField(max_length=200, blank=True)
    caption = models.TextField(blank=True)
    final_original = models.BooleanField(default=False)
    uploaded_at = models.DateTimeField(auto_now_add=True)


class CommissionPayoutProfile(models.Model):
    artist = models.OneToOneField('users.User', on_delete=models.PROTECT)
    recipient = models.JSONField(default=dict)
    updated_at = models.DateTimeField(auto_now=True)


class CommissionLedger(models.Model):
    commission = models.ForeignKey(CommissionRequest, on_delete=models.PROTECT, related_name='ledger')
    reference = models.CharField(max_length=120, unique=True)
    kind = models.CharField(max_length=30)
    amount = models.DecimalField(max_digits=12, decimal_places=2)
    created_at = models.DateTimeField(auto_now_add=True)


class CommissionAsset(models.Model):
    commission = models.OneToOneField(CommissionRequest, on_delete=models.PROTECT, related_name='asset')
    original_artist = models.ForeignKey('users.User', on_delete=models.PROTECT, related_name='created_commission_assets')
    owner = models.ForeignKey('users.User', on_delete=models.PROTECT, related_name='owned_commission_assets')
    submission = models.ForeignKey(CommissionSubmission, on_delete=models.PROTECT)
    license_terms = models.JSONField()
    record_hash = models.CharField(max_length=64)
    created_at = models.DateTimeField(auto_now_add=True)


class CommissionResale(models.Model):
    asset = models.ForeignKey(CommissionAsset, on_delete=models.PROTECT, related_name='resales')
    artwork = models.OneToOneField('artworks.Artwork', on_delete=models.PROTECT, related_name='commission_resale')
    seller = models.ForeignKey('users.User', on_delete=models.PROTECT)
    royalty_amount = models.DecimalField(max_digits=12, decimal_places=2, default=0)
    payment = models.OneToOneField('wallets.PaymentSession', null=True, blank=True, on_delete=models.PROTECT)
    settled_at = models.DateTimeField(null=True, blank=True)
    payout_reference = models.CharField(max_length=100, blank=True)
    payout_provider_id = models.CharField(max_length=100, blank=True)
    payout_status = models.CharField(max_length=30, default='NOT_REQUESTED')
    payout_payload = models.JSONField(default=dict, blank=True)


class CommissionRefund(models.Model):
    commission = models.ForeignKey(CommissionRequest, on_delete=models.PROTECT, related_name='refunds')
    authorized_by = models.ForeignKey('users.User', on_delete=models.PROTECT)
    amount = models.DecimalField(max_digits=12, decimal_places=2)
    reason = models.TextField()
    reference = models.CharField(max_length=100, unique=True)
    provider_id = models.CharField(max_length=100, blank=True)
    status = models.CharField(max_length=30, default='AUTHORIZED')
    created_at = models.DateTimeField(auto_now_add=True)


class CommissionProof(models.Model):
    commission = models.ForeignKey(CommissionRequest, on_delete=models.PROTECT, related_name='proofs')
    submission = models.OneToOneField(CommissionSubmission, null=True, blank=True, on_delete=models.PROTECT, related_name='proof')
    asset = models.OneToOneField(CommissionAsset, null=True, blank=True, on_delete=models.PROTECT, related_name='proof')
    record_hash = models.CharField(max_length=64)
    registry_id = models.CharField(max_length=78, unique=True)
    transaction_hash = models.CharField(max_length=66, blank=True)
    block_number = models.PositiveBigIntegerField(null=True, blank=True)
    status = models.CharField(max_length=20, default='PENDING')
    error = models.TextField(blank=True)
