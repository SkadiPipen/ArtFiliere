from django.db import models

from users.models import User


class ArtistApplication(models.Model):
    class ApprovalStatus(models.TextChoices):
        PENDING = "pending", "Pending HR Approval"
        APPROVED = "approved", "Approved"
        REJECTED = "rejected", "Rejected"

    user = models.OneToOneField(
        User,
        on_delete=models.CASCADE,
        related_name="artist_application"
    )
    hourly_rate = models.DecimalField(max_digits=10, decimal_places=2)
    tin_number = models.CharField(max_length=20, blank=True, null=True)
    bio = models.TextField(blank=True, null=True)

    # Documents
    # Stored as data URIs for the local/demo workflow. Production should use
    # private object storage and save only protected file references here.
    bir_certificate = models.TextField()
    bir_certificate_name = models.CharField(max_length=255, blank=True, default="")
    sworn_declaration = models.TextField()
    sworn_declaration_name = models.CharField(max_length=255, blank=True, default="")
    portfolio = models.JSONField(default=list)

    status = models.CharField(
        max_length=20,
        choices=ApprovalStatus.choices,
        default=ApprovalStatus.PENDING
    )
    # NOTE: added to fix a latent bug -- SubmitArtistApplicationView.patch()
    # already sets/saves this field, but it didn't exist on the original
    # model, which would raise a FieldError the first time an application
    # was rejected.
    rejection_reason = models.CharField(max_length=500, blank=True, default="")

    submitted_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    def __str__(self):
        return f"Artist Application for {self.user.email} Status: ({self.status})"


class ArtistApplicationLog(models.Model):
    class Action(models.TextChoices):
        SUBMITTED = "submitted", "Submitted"
        APPROVED = "approved", "Approved"
        REJECTED = "rejected", "Rejected"

    application = models.ForeignKey(
        ArtistApplication, on_delete=models.CASCADE, related_name="logs"
    )
    actor = models.ForeignKey(
        User, on_delete=models.SET_NULL, null=True, related_name="artist_application_logs"
    )
    action = models.CharField(max_length=20, choices=Action.choices)
    previous_status = models.CharField(max_length=20, blank=True, default="")
    new_status = models.CharField(max_length=20, blank=True, default="")
    reason = models.CharField(max_length=500, blank=True, default="")
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        ordering = ["-created_at"]
