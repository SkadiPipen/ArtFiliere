from django.db import models
from django.conf import settings
from django.utils import timezone

class CommissionRequest(models.Model):
    TYPE_CHOICES = [
        ('EXCLUSIVE', 'Exclusive'),
        ('NON_EXCLUSIVE', 'Non-exclusive'),
        ('SOLE', 'Sole'),
    ]

    STATUS_CHOICES = [
        ('PENDING', 'Pending'),
        ('IN_PROGRESS', 'In-progress'),
        ('COMPLETE', 'Complete'),
        ('CANCELLED', 'Cancelled'),
    ]

    commission_req_id = models.BigAutoField(primary_key=True)
    buyer = models.ForeignKey(settings.AUTH_USER_MODEL, on_delete=models.CASCADE, related_name='buyer_commissions')
    artist = models.ForeignKey(settings.AUTH_USER_MODEL, on_delete=models.CASCADE, related_name='artist_commissions')
    title = models.CharField(max_length=100)
    description = models.TextField(blank=True, null=True)
    art_type = models.CharField(max_length=20, default='Physical')  # Physical or Digital
    tags = models.CharField(max_length=255, blank=True, null=True)  # e.g., 'Modern, Art Pop'
    time_duration = models.DecimalField(max_digits=12, decimal_places=2, default=0.00)
    deadline = models.DateTimeField()
    is_rush_job = models.BooleanField(default=False)
    created_at = models.DateTimeField(default=timezone.now)
    status = models.CharField(max_length=20, choices=STATUS_CHOICES, default='PENDING')

    def current_progress(self):
        """Calculate highest progress percentage from uploaded process photos"""
        latest = self.photos.filter(photo_type='PROGRESS').order_by('-progress_percentage').first()
        return latest.progress_percentage if latest else 0

    def __str__(self):
        return f"Commission #{self.commission_req_id} - {self.title}"


class CommissionMilestone(models.Model):
    milestone_id = models.BigAutoField(primary_key=True)
    commission_req = models.ForeignKey(CommissionRequest, on_delete=models.CASCADE, related_name='milestones')
    milestone_number = models.DecimalField(max_digits=5, decimal_places=2)
    status = models.CharField(max_length=20, default='PENDING')
    percentage = models.IntegerField()
    amount = models.IntegerField()
    paid_at = models.DateTimeField(null=True, blank=True)


class CommissionPhoto(models.Model):
    PHOTO_TYPE_CHOICES = [
        ('REFERENCE', 'Reference (Buyer)'),
        ('PROGRESS', 'Progress Track (Artist)'),
    ]

    photo_id = models.BigAutoField(primary_key=True)
    commission_req = models.ForeignKey(CommissionRequest, on_delete=models.CASCADE, related_name='photos')
    image_url = models.TextField()  # base64 or storage url
    photo_type = models.CharField(max_length=20, choices=PHOTO_TYPE_CHOICES, default='REFERENCE')
    progress_percentage = models.IntegerField(default=0)  # e.g. 33, 66, 100
    caption = models.CharField(max_length=100, blank=True, null=True)
    uploaded_at = models.DateTimeField(auto_now_add=True)