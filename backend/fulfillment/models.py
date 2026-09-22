from decimal import Decimal
from django.core.validators import MinValueValidator, MaxValueValidator
from django.db import models


class DeliveryRoute(models.Model):
    """Verified city routes; no guessed distances or addresses."""
    pickup_city = models.CharField(max_length=150)
    destination_city = models.CharField(max_length=150)
    distance_km = models.DecimalField(max_digits=7, decimal_places=2, validators=[MinValueValidator(Decimal('0.01'))])
    base_fare = models.DecimalField(max_digits=9, decimal_places=2, default=50, validators=[MinValueValidator(0)])
    per_km = models.DecimalField(max_digits=9, decimal_places=2, default=15, validators=[MinValueValidator(0)])
    active = models.BooleanField(default=True)

    @property
    def fee(self):
        return (self.base_fare + self.distance_km * self.per_km).quantize(Decimal('0.01'))

    def __str__(self):
        return f'{self.pickup_city} to {self.destination_city}'


class DeliveryOrder(models.Model):
    class Status(models.TextChoices):
        PENDING = 'pending', 'Awaiting rider'
        ACCEPTED = 'accepted', 'Rider assigned'
        ARRIVED_AT_ARTIST = 'arrived_at_artist', 'Arrived at artist'
        PICKED_UP = 'picked_up', 'Artwork collected'
        ARRIVED_AT_BUYER = 'arrived_at_buyer', 'Arrived at buyer'
        IN_TRANSIT = 'in_transit', 'In transit'
        DELIVERED = 'delivered', 'Delivered'

    payment = models.OneToOneField('wallets.PaymentSession', on_delete=models.PROTECT, related_name='delivery_order')
    driver = models.ForeignKey('users.User', null=True, blank=True, on_delete=models.PROTECT, limit_choices_to={'role': 'driver'})
    status = models.CharField(max_length=20, choices=Status.choices, default=Status.PENDING)
    pickup_proof = models.TextField(blank=True, default='')
    delivery_proof = models.TextField(blank=True, default='')
    timeline = models.JSONField(default=dict, blank=True)
    pickup_address = models.TextField()
    delivery_address = models.TextField()
    fee = models.DecimalField(max_digits=10, decimal_places=2)
    created_at = models.DateTimeField(auto_now_add=True)
    delivered_at = models.DateTimeField(null=True, blank=True)


class PurchaseReview(models.Model):
    payment = models.OneToOneField('wallets.PaymentSession', on_delete=models.PROTECT, related_name='review')
    artist_rating = models.PositiveSmallIntegerField(validators=[MinValueValidator(1), MaxValueValidator(5)])
    artwork_rating = models.PositiveSmallIntegerField(validators=[MinValueValidator(1), MaxValueValidator(5)])
    comment = models.TextField(blank=True, max_length=2000)
    artist_comment = models.TextField(blank=True, max_length=2000)
    artwork_comment = models.TextField(blank=True, max_length=2000)
    created_at = models.DateTimeField(auto_now_add=True)
    class Meta:
        constraints = [
            models.CheckConstraint(condition=models.Q(artist_rating__gte=1, artist_rating__lte=5), name='valid_artist_rating'),
            models.CheckConstraint(condition=models.Q(artwork_rating__gte=1, artwork_rating__lte=5), name='valid_artwork_rating'),
        ]


class RiderProfile(models.Model):
    user = models.OneToOneField('users.User', on_delete=models.CASCADE, related_name='rider_profile', limit_choices_to={'role': 'driver'})
    is_clocked_in = models.BooleanField(default=False)
    clock_in_time = models.DateTimeField(null=True, blank=True)
    clock_out_time = models.DateTimeField(null=True, blank=True)
    latitude = models.FloatField(null=True, blank=True)
    longitude = models.FloatField(null=True, blank=True)
    location_updated_at = models.DateTimeField(null=True, blank=True)
