from django.db import models
from django.conf import settings
from django.utils import timezone

class AuctionListing(models.Model):
    STATUS_CHOICES = [
        ('PENDING_APPROVAL', 'Pending Approval'),
        ('ACTIVE', 'Active'),
        ('SCHEDULED', 'Scheduled'),
        ('ENDED', 'Ended'),
        ('SETTLED', 'Settled'),
        ('PAYMENT_PENDING', 'Winner Payment Pending'),
        ('BACKUP_OFFER', 'Runner-up Offer Pending'),
        ('FORFEITED', 'Winner Forfeited'),
        ('CANCELLED', 'Cancelled'),
    ]

    artist = models.ForeignKey('users.User', on_delete=models.CASCADE, related_name="auction_listings", null=True, blank=True)
    artwork = models.ForeignKey('artworks.Artwork', on_delete=models.CASCADE, related_name='auction_listings')

    starting_bid = models.DecimalField(max_digits=12, decimal_places=2)
    current_bid = models.DecimalField(max_digits=12, decimal_places=2)
    bid_increment = models.DecimalField(max_digits=10, decimal_places=2, default=100.00)

    start_time = models.DateTimeField(default=timezone.now)
    end_time = models.DateTimeField()

    status = models.CharField(max_length=20, choices=STATUS_CHOICES, default='ACTIVE')
    highest_bidder = models.ForeignKey('users.User', on_delete=models.SET_NULL, null=True, blank=True, related_name='winning_bids')
    is_physical = models.BooleanField(default=False)
    license_type = models.CharField(max_length=30, default='personal')
    exclusivity = models.CharField(max_length=30, default='non_exclusive')
    delivery_type = models.CharField(max_length=30, default='digital')
    terms_snapshot = models.TextField(blank=True, default='')
    signed_document = models.TextField(blank=True, default='')
    signed_document_hash = models.CharField(max_length=64, blank=True, default='')
    artist_signature = models.CharField(max_length=200, blank=True, default='')
    artist_signature_image = models.TextField(blank=True, default='')
    artist_signed_at = models.DateTimeField(null=True, blank=True)
    agreement_template = models.ForeignKey(
        'messaging.AgreementTemplate', on_delete=models.SET_NULL,
        null=True, blank=True, related_name='auction_listings'
    )
    payment_deadline = models.DateTimeField(null=True, blank=True)
    winning_bid = models.DecimalField(max_digits=12, decimal_places=2, null=True, blank=True)
    winner_forfeited_at = models.DateTimeField(null=True, blank=True)
    backup_bidder = models.ForeignKey('users.User', on_delete=models.SET_NULL, null=True, blank=True, related_name='backup_auction_offers')
    backup_offer_expires_at = models.DateTimeField(null=True, blank=True)
    created_at = models.DateTimeField(auto_now_add=True)

    def is_expired(self):
        return timezone.now() >= self.end_time

    def save(self, *args, **kwargs):
        if self.pk:
            original = type(self).objects.filter(pk=self.pk).first()
            if original and original.artist_signed_at:
                locked = ('artist_id', 'artwork_id', 'license_type', 'exclusivity', 'delivery_type', 'terms_snapshot', 'signed_document', 'signed_document_hash', 'artist_signature', 'artist_signature_image', 'artist_signed_at')
                if any(getattr(original, field) != getattr(self, field) for field in locked):
                    from django.core.exceptions import ValidationError
                    raise ValidationError('Signed auction license terms cannot be changed. Submit a new auction for review.')
        super().save(*args, **kwargs)

    def __str__(self):
        return f"Auction #{self.id} - {self.artwork.title} (Current: Php{self.current_bid})"


class Bid(models.Model):
    auction = models.ForeignKey(AuctionListing, on_delete=models.CASCADE, related_name='bids')
    bidder = models.ForeignKey('users.User', on_delete=models.CASCADE, related_name='placed_bids')
    amount = models.DecimalField(max_digits=12, decimal_places=2)
    created_at = models.DateTimeField(auto_now_add=True)
    terms_accepted_at = models.DateTimeField(null=True, blank=True)

    class Meta:
        ordering = ['-amount', '-created_at']

    def __str__(self):
        return f"Php{self.amount} on {self.auction.id} by {getattr(self.bidder, 'username', 'User')}"
