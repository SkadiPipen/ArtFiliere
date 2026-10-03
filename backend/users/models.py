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

    date_of_birth = models.DateField(blank=True, null=True)

    contact_number = models.CharField(
        max_length=20
    )
    is_banned = models.BooleanField(default=False)
    suspended_until = models.DateTimeField(null=True, blank=True)

    @property
    def access_restricted(self):
        from django.utils import timezone
        return self.is_banned or bool(self.suspended_until and self.suspended_until > timezone.now())

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
        DRIVER = "driver", "Driver"
        CUSTOMER_SUPPORT = "customer_support", "Customer Support"
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

    # Artists opt in before appearing in the commission directory. Keeping the
    # default off prevents buyers from sending requests to unavailable artists.
    is_accepting_commissions = models.BooleanField(default=False)

    @property
    def address(self):
        # Compatibility for registration/profile and existing delivery consumers.
        return self.addresses.order_by('-is_default', 'id').first()

    def __str__(self):
        return self.email


class Address(models.Model):
    latitude = models.FloatField(null=True, blank=True)
    longitude = models.FloatField(null=True, blank=True)
    user = models.ForeignKey(
        User,
        on_delete=models.CASCADE,
        related_name="addresses",
    )

    label = models.CharField(max_length=50, default='Home')
    is_default = models.BooleanField(default=False)
    region = models.CharField(max_length=150)
    province = models.CharField(max_length=150)
    city = models.CharField(max_length=150)
    postal_code = models.CharField(max_length=10)
    barangay = models.CharField(max_length=150)
    street = models.CharField(max_length=255)

    class Meta:
        constraints = [models.UniqueConstraint(fields=['user'], condition=models.Q(is_default=True), name='one_default_address_per_user')]

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


