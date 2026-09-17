from django.db import models
from django.contrib.auth.models import User

# Create your models here.
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
        ('IN_TRANSIT', 'In Transit'),
        ('DELIVERED', 'Delivered'),
        ('CANCELED', 'Cancelled'),
    ]

    PAYMENT_CHOICES = [
        ('COD', 'cash on Delivery'),
        ('PAYPAL', 'Paypal'),
    ]

    buyerId = models.CharField(max_length=100)
    address = models.CharField(max_length=255)
    items_count = models.IntegerField(default=1)
    distance = models.CharField(max_length=50)
    estimatedTime = models.CharField(max_length=50)
    paymentMethod = models.CharField(max_length=10, choices=PAYMENT_CHOICES, default='COD')
    status = models.CharField(max_length=20, choices=STATUS_CHOICES, default='PENDING')
    assigned_rider = models.ForeignKey(RiderProfile, on_delete=models.SET_NULL, null=True, blank=True, related_name='orders')
    created_at = models.DateTimeField(auto_now_add=True)

    def __str__(self):
        return f"Order #{self.id} - {self.buyerId} ({self.status})"