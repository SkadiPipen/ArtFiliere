from django.db import models
from django.conf import settings
from django.utils import timezone

class CommissionRequest(models.Model):
    STATUS_CHOICES = [
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
