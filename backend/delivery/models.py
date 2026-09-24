from django.db import models
from django.contrib.auth.models import User

class RiderProfile(models.Model):
    user = models.OneToOneField(User, on_delete=models.CASCADE, related_name='rider_profile')
    phone = models.CharField(max_length=20)
    is_clocked_in = models.BooleanField(default=False)
    clock_in_time = models.DateTimeField(null=True, blank=True)
    clock_out_time = models.DateTimeField(null=True, blank=True)
    current_latitude = models.FloatField(null=True, blank=True)
    current_longitude = models.FloatField(null=True, blank=True)

    def __str__(self):
        return f"Rider: {self.user.get_full_name() or self.user.username}"

class Order(models.Model):
    STATUS_CHOICES = [
        ('PENDING', 'Pending Request'),
        ('ACCEPTED', 'Accepted'),
        ('ARRIVED_AT_ARTIST', 'Arrived at Artist'),
        ('PICKED_UP', 'Picked Up'),
        ('IN_TRANSIT', 'In Transit'),
        ('ARRIVED_AT_BUYER', 'Arrived at Buyer'),
        ('DELIVERED', 'Delivered'),
        ('CANCELED', 'Cancelled'),
    ]

    PAYMENT_CHOICES = [
        ('COD', 'Cash on Delivery'),
        ('PAYPAL', 'Paypal'),
        ('XENDIT', 'Xendit Online'),
    ]

    # Relational link to the e-commerce purchase
    payment = models.ForeignKey('wallets.PaymentSession', on_delete=models.SET_NULL, null=True, blank=True, related_name='delivery_orders')
    
    buyerId = models.CharField(max_length=100)
    buyer_name = models.CharField(max_length=150, blank=True, default='')
    buyer_phone = models.CharField(max_length=30, blank=True, default='')
    address = models.CharField(max_length=255)
    delivery_latitude = models.FloatField(default=10.3333)
    delivery_longitude = models.FloatField(default=123.9333)

    artist_name = models.CharField(max_length=150, blank=True, default='')
    artist_phone = models.CharField(max_length=30, blank=True, default='')
    pickup_address = models.CharField(max_length=255, blank=True, default='')
    pickup_latitude = models.FloatField(default=10.3157)
    pickup_longitude = models.FloatField(default=123.8854)

    item_name = models.CharField(max_length=200, default='Artwork Asset')
    items_count = models.IntegerField(default=1)
    distance = models.CharField(max_length=50)
    estimatedTime = models.CharField(max_length=50)
    delivery_fee = models.DecimalField(max_digits=10, decimal_places=2, default=50.00)
    is_priority = models.BooleanField(default=False)
    paymentMethod = models.CharField(max_length=20, default='PAYPAL')
    status = models.CharField(max_length=30, choices=STATUS_CHOICES, default='PENDING')
    assigned_rider = models.ForeignKey(RiderProfile, on_delete=models.SET_NULL, null=True, blank=True, related_name='orders')

    pickup_proof = models.TextField(null=True, blank=True)
    delivery_proof = models.TextField(null=True, blank=True)
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    def __str__(self):
        return f"Order #{self.id} - {self.item_name} ({self.status})"