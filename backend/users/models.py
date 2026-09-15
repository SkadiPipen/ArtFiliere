from django.db import models


class User(models.Model):
    firebase_uid = models.CharField(
        max_length=128,
        unique=True
    )

    email = models.EmailField(
        unique=True
    )

    username = models.CharField(
        max_length=150,
        unique=True
    )

    first_name = models.CharField(
        max_length=150
    )

    middle_name = models.CharField(
        max_length=150,
        blank=True
    )

    last_name = models.CharField(
        max_length=150
    )

    date_of_birth = models.DateField()

    contact_number = models.CharField(
        max_length=20
    )

    class RoyaltyStatus(models.TextChoices):
        YES = "yes", "Yes"
        NO = "no", "No"

    wants_royalty = models.CharField(
        max_length=3,
        choices=RoyaltyStatus.choices,
        default=RoyaltyStatus.NO,
    )

    royalty_proof = models.FileField(
        upload_to="royalty_proofs/",
        blank=True,
        null=True,
    )

    created_at = models.DateTimeField(
        auto_now_add=True
    )

    # Added: tracks user authorization
    class Role(models.TextChoices):
        BUYER = "buyer", "Buyer"
        ARTIST = "artist", "Artist"
        HR = "hr", "HR"
        CREATIVE_MODERATOR = "creative_moderator", "Creative Moderator"
        PLATFORM_ADMIN = "platform_admin", "Platform Admin"

    role = models.CharField(
        max_length=20,
        choices=Role.choices,
        default=Role.BUYER
    ) 

    def __str__(self):
        return self.email


class Address(models.Model):
    user = models.OneToOneField(
        User,
        on_delete=models.CASCADE,
        related_name="address",
    )

    region = models.CharField(max_length=150)
    province = models.CharField(max_length=150)
    city = models.CharField(max_length=150)
    postal_code = models.CharField(max_length=10)
    barangay = models.CharField(max_length=150)
    street = models.CharField(max_length=255)

    def __str__(self):
        return f"{self.street}, {self.barangay}, {self.city}"


class ActivityLog(models.Model):
    """A user-visible audit trail.  Records are created by the server only."""
    user = models.ForeignKey(User, on_delete=models.CASCADE, related_name="activity_logs")
    action = models.CharField(max_length=80)
    description = models.CharField(max_length=255)
    reference_type = models.CharField(max_length=50, blank=True, default="")
    reference_id = models.PositiveIntegerField(null=True, blank=True)
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        ordering = ["-created_at"]


