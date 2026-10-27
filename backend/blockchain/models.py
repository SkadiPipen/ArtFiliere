from django.db import models
from artworks.models import Artwork
import uuid
from django.db.models import Q


class BlockchainTransaction(models.Model):
    class Status(models.TextChoices):
        PENDING = "pending", "Pending"
        CONFIRMED = "confirmed", "Confirmed"
        FAILED = "failed", "Failed"
    artwork = models.ForeignKey(Artwork, on_delete=models.CASCADE, related_name="blockchain_transactions")
    operation = models.CharField(max_length=30, default="artwork_registration")
    entity_type = models.CharField(max_length=30, default="artwork")
    entity_id = models.PositiveBigIntegerField(null=True, blank=True)
    proof_hash = models.CharField(max_length=64, blank=True, default="")
    transaction_hash = models.CharField(max_length=66, blank=True, default="")
    block_number = models.PositiveBigIntegerField(null=True, blank=True)
    network = models.CharField(max_length=30)
    status = models.CharField(max_length=12, choices=Status.choices, default=Status.PENDING)
    error_message = models.TextField(blank=True, default="")
    confirmed_at = models.DateTimeField(null=True, blank=True)
    created_at = models.DateTimeField(auto_now_add=True)


class ProvenanceArtwork(models.Model):
    """One permanent identity, shared by every listing of this work."""
    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    original_artwork = models.OneToOneField(Artwork, null=True, blank=True, on_delete=models.PROTECT, related_name='provenance_origin')
    commission_asset = models.OneToOneField('commissions.CommissionAsset', null=True, blank=True, on_delete=models.PROTECT, related_name='provenance_origin')
    file_hash = models.CharField(max_length=64)
    claimed_creator = models.ForeignKey('users.User', on_delete=models.PROTECT, related_name='+')
    credited_creator = models.ForeignKey('users.User', on_delete=models.PROTECT, related_name='+')
    initial_owner = models.ForeignKey('users.User', on_delete=models.PROTECT, related_name='+')
    current_owner = models.ForeignKey('users.User', on_delete=models.PROTECT, related_name='provenance_owned')
    creator_verified = models.BooleanField(default=False)
    disputed = models.BooleanField(default=False)
    registered_at = models.DateTimeField(null=True, blank=True)
    created_at = models.DateTimeField(auto_now_add=True)

    def save(self, *args, **kwargs):
        original = type(self).objects.filter(pk=self.pk).first()
        if original and any(getattr(original, key) != getattr(self, key) for key in ('file_hash', 'claimed_creator_id', 'initial_owner_id', 'original_artwork_id', 'commission_asset_id')):
            from django.core.exceptions import ValidationError
            raise ValidationError('The original provenance claim is immutable. Append a reviewed correction.')
        super().save(*args, **kwargs)


class ProvenanceListing(models.Model):
    artwork = models.OneToOneField(Artwork, on_delete=models.PROTECT, related_name='provenance_listing')
    record = models.ForeignKey(ProvenanceArtwork, on_delete=models.PROTECT, related_name='listings')
    # A reservation survives an uncertain checkout until provider expiry is verified.
    reserved_payment = models.OneToOneField('wallets.PaymentSession', null=True, blank=True, on_delete=models.PROTECT, related_name='+')
    reserved_rights = models.JSONField(default=dict)


class ProvenanceEvent(models.Model):
    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    record = models.ForeignKey(ProvenanceArtwork, on_delete=models.PROTECT, related_name='events')
    kind = models.CharField(max_length=15, choices=[('registration', 'Registration'), ('transfer', 'Transfer'), ('review', 'Reviewed attribution')])
    reference = models.CharField(max_length=100, unique=True)
    payment = models.OneToOneField('wallets.PaymentSession', null=True, blank=True, on_delete=models.PROTECT, related_name='ownership_transfer')
    previous_owner = models.ForeignKey('users.User', null=True, blank=True, on_delete=models.PROTECT, related_name='+')
    new_owner = models.ForeignKey('users.User', null=True, blank=True, on_delete=models.PROTECT, related_name='+')
    payload = models.JSONField(default=dict)
    record_hash = models.CharField(max_length=64)
    status = models.CharField(max_length=12, default='pending', choices=BlockchainTransaction.Status.choices)
    transaction_hash = models.CharField(max_length=66, blank=True)
    signed_transaction = models.TextField(blank=True)  # Private outbox: never exposed by APIs.
    nonce = models.PositiveBigIntegerField(null=True)
    sender = models.CharField(max_length=42, blank=True)
    previous_attempts = models.JSONField(default=list)
    chain_id = models.PositiveBigIntegerField(null=True)
    contract_address = models.CharField(max_length=42, blank=True)
    block_number = models.PositiveBigIntegerField(null=True)
    error = models.TextField(blank=True)
    created_at = models.DateTimeField(auto_now_add=True)
    confirmed_at = models.DateTimeField(null=True)
    def save(self, *args, **kwargs):
        original = type(self).objects.filter(pk=self.pk).first()
        if original and any(getattr(original, key) != getattr(self, key) for key in ('record_id', 'kind', 'reference', 'payment_id', 'previous_owner_id', 'new_owner_id', 'payload', 'record_hash')):
            from django.core.exceptions import ValidationError
            raise ValidationError('Provenance history is immutable. Append a new event.')
        super().save(*args, **kwargs)
    class Meta:
        ordering = ['created_at', 'id']
        constraints = [models.UniqueConstraint(fields=['record'], condition=Q(kind='registration'), name='one_provenance_registration')]


class ProvenanceReview(models.Model):
    record = models.ForeignKey(ProvenanceArtwork, on_delete=models.PROTECT, related_name='reviews')
    requested_by = models.ForeignKey('users.User', on_delete=models.PROTECT, related_name='+')
    proposed_creator = models.ForeignKey('users.User', null=True, blank=True, on_delete=models.PROTECT, related_name='+')
    reason = models.TextField(max_length=4000)
    evidence_links = models.JSONField(default=list)
    status = models.CharField(max_length=20, default='pending')
    reviewed_by = models.ForeignKey('users.User', null=True, on_delete=models.PROTECT, related_name='+')
    decision_note = models.TextField(blank=True)
    event = models.OneToOneField(ProvenanceEvent, null=True, on_delete=models.PROTECT, related_name='review_decision')
    created_at = models.DateTimeField(auto_now_add=True)
    reviewed_at = models.DateTimeField(null=True)


class ProvenanceSigner(models.Model):
    """Serializes nonce allocation across processes using this chain's operator."""
    key = models.CharField(max_length=100, primary_key=True)
