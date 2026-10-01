import secrets

from django.db import models

from users.models import User
from artworks.models import Artwork


def agreement_verification_code():
    return f"AF-AGR-{secrets.token_hex(6).upper()}"


class DirectMessage(models.Model):
    sender = models.ForeignKey(User, on_delete=models.CASCADE, related_name="sent_messages")
    recipient = models.ForeignKey(
        User, on_delete=models.CASCADE, related_name="received_messages"
    )
    body = models.TextField()
    is_read = models.BooleanField(default=False)
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        ordering = ["created_at"]

    def __str__(self):
        return f"{self.sender_id} -> {self.recipient_id}"


class Conversation(models.Model):
    class Status(models.TextChoices):
        OPEN = "open", "Open"
        AGREED = "agreed", "Agreement accepted"
        CANCELLED = "cancelled", "Cancelled"
        COMPLETED = "completed", "Completed"

    artwork = models.ForeignKey(Artwork, on_delete=models.SET_NULL, null=True, blank=True, related_name="conversations")
    status = models.CharField(max_length=20, choices=Status.choices, default=Status.OPEN)
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)


class ConversationParticipant(models.Model):
    conversation = models.ForeignKey(Conversation, on_delete=models.CASCADE, related_name="participants")
    user = models.ForeignKey(User, on_delete=models.CASCADE, related_name="conversation_participations")
    last_read_at = models.DateTimeField(null=True, blank=True)
    joined_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        constraints = [models.UniqueConstraint(fields=["conversation", "user"], name="unique_conversation_participant")]


class AgreementTemplate(models.Model):
    name = models.CharField(max_length=120, unique=True)
    body = models.TextField(help_text="Supports safe placeholders such as {{buyer_name}}, {{artist_name}}, {{amount}}.")
    is_active = models.BooleanField(default=True)
    updated_by = models.ForeignKey(User, on_delete=models.SET_NULL, null=True, blank=True, related_name="edited_agreement_templates")
    updated_at = models.DateTimeField(auto_now=True)


class Agreement(models.Model):
    class Status(models.TextChoices):
        PROPOSED = "proposed", "Proposed"
        ACCEPTED = "accepted", "Accepted"
        CANCELLED = "cancelled", "Cancelled"

    conversation = models.ForeignKey(Conversation, on_delete=models.CASCADE, related_name="agreements")
    template = models.ForeignKey(AgreementTemplate, on_delete=models.PROTECT, related_name="agreements")
    artwork = models.ForeignKey(Artwork, on_delete=models.SET_NULL, null=True, blank=True)
    buyer = models.ForeignKey(User, on_delete=models.PROTECT, related_name="buyer_agreements")
    artist = models.ForeignKey(User, on_delete=models.PROTECT, related_name="artist_agreements")
    price = models.DecimalField(max_digits=12, decimal_places=2)
    terms_snapshot = models.TextField()
    document_snapshot = models.TextField(blank=True, default="")
    artist_signature_image = models.TextField(blank=True, default="")
    buyer_signature_image = models.TextField(blank=True, default="")
    artist_signature = models.CharField(max_length=200, blank=True, default="")
    buyer_signature = models.CharField(max_length=200, blank=True, default="")
    artist_signed_at = models.DateTimeField(null=True, blank=True)
    buyer_signed_at = models.DateTimeField(null=True, blank=True)

    delivery_fee = models.DecimalField(max_digits=10, decimal_places=2, default=0)
    delivery_details = models.JSONField(default=dict, blank=True)
    delivery_date = models.DateField(null=True, blank=True)
    revision_limit = models.PositiveSmallIntegerField(default=0)
    license_type = models.CharField(max_length=30, default="personal")
    exclusivity = models.CharField(max_length=30, default="non_exclusive")
    delivery_type = models.CharField(max_length=30, default="digital")
    compensation_type = models.CharField(max_length=30, default="one_time")
    status = models.CharField(max_length=20, choices=Status.choices, default=Status.PROPOSED)
    buyer_accepted_at = models.DateTimeField(null=True, blank=True)
    artist_accepted_at = models.DateTimeField(null=True, blank=True)
    created_at = models.DateTimeField(auto_now_add=True)
    verification_code = models.CharField(max_length=24, unique=True, default=agreement_verification_code, editable=False)


class Message(models.Model):
    class Type(models.TextChoices):
        TEXT = "text", "Text"
        AGREEMENT = "agreement", "Agreement"
        SYSTEM = "system", "System"

    conversation = models.ForeignKey(Conversation, on_delete=models.CASCADE, related_name="messages")
    sender = models.ForeignKey(User, on_delete=models.SET_NULL, null=True, blank=True, related_name="conversation_messages")
    body = models.TextField(blank=True, default="")
    message_type = models.CharField(max_length=20, choices=Type.choices, default=Type.TEXT)
    agreement = models.ForeignKey(Agreement, on_delete=models.SET_NULL, null=True, blank=True, related_name="messages")
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        ordering = ["created_at"]
