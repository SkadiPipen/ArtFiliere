from django.db import models
from django.conf import settings
from django.utils import timezone

class AuctionListing(models.Model):
    STATUS_CHOICES = [
        ('PENDING_APPROVAL', 'Pending Approval'),
        ('ACTIVE', 'Active'),
        ('ENDED', 'Ended'),
        ('SETTLED', 'Settled'),
        ('CANCELLED', 'Cancelled'),
    ]

    artist = models.ForeignKey(settings.AUTH_USER_MODEL, on_delete=models.CASCADE, related_name="auction_listings")
    artwork = models.ForeignKey('artworks.Artwork', on_delete=models.CASCADE, related_name='auction_listings')

    starting_bid = models.DecimalField(max_digits=12, decimal_places=2)
    current_bid = models.DecimalField(max_digits=12, decimal_places=2)
    bid_increment = models.DecimalField(max_digits=10, decimal_places=2, default=100.00)

    start_time = models.DateTimeField(default=timezone.now)
    end_time = models.DateTimeField()

    status = models.CharField(max_length=20, choices=STATUS_CHOICES, default='ACTIVE')
    highest_bidder = models.ForeignKey(settings.AUTH_USER_MODEL, on_delete=models.SET_NULL, null=True, blank=True, related_name='winning_bids')
    is_physical = models.BooleanField(default=False)
    created_at = models.DateTimeField(auto_now_add=True)

    def is_expired(self):
        return timezone.now() >= self.end_time

    def __str__(self):
        return f"Auction #{self.id} - {self.artwork.title} (Current: Php{self.current_bid})"


class Bid(models.Model):
    auction = models.ForeignKey(AuctionListing, on_delete=models.CASCADE, related_name='bids')
    bidder = models.ForeignKey(settings.AUTH_USER_MODEL, on_delete=models.CASCADE, related_name='placed_bids')
    amount = models.DecimalField(max_digits=12, decimal_places=2)
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        ordering = ['-amount', '-created_at']

    def __str__(self):
        return f"Php{self.amount} on {self.auction.id} by {self.bidder.username}"