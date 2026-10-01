from django.db import models
from artworks.models import Artwork


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
