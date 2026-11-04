from django.db import models


class ModeratorApplication(models.Model):
    user = models.ForeignKey('User', on_delete=models.PROTECT, related_name='moderator_applications', null=True, blank=True)
    email = models.EmailField(default='')
    requested_role = models.CharField(max_length=30, choices=[('creative_moderator', 'Creative moderator'), ('customer_support', 'Customer service moderator'), ('driver', 'Driver')])
    application_details = models.JSONField(default=dict, blank=True)
    education = models.CharField(max_length=250)
    motivation = models.TextField(max_length=3000)
    profile_snapshot = models.JSONField(default=dict)
    documents = models.JSONField(default=list)
    status = models.CharField(max_length=20, default='pending', choices=[('pending', 'Pending review'), ('under_review', 'Under review'), ('sent_to_admin', 'Sent to admin'), ('approved', 'Approved'), ('rejected', 'Rejected')])
    assigned_to = models.ForeignKey('User', on_delete=models.PROTECT, null=True, blank=True, related_name='assigned_moderator_applications')
    submitted_by = models.ForeignKey('User', on_delete=models.PROTECT, related_name='submitted_moderator_applications')
    submitted_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)
    version = models.PositiveIntegerField(default=1)

    class Meta:
        ordering = ['-submitted_at']
        constraints = [
            models.UniqueConstraint(fields=['user'], condition=models.Q(status__in=['pending', 'under_review', 'sent_to_admin', 'approved']), name='one_open_moderator_application'),
            models.UniqueConstraint(fields=['email'], condition=models.Q(status__in=['pending', 'under_review', 'sent_to_admin', 'approved']) & ~models.Q(email=''), name='one_open_moderator_email'),
        ]


class ModeratorApplicationReview(models.Model):
    application = models.ForeignKey(ModeratorApplication, on_delete=models.PROTECT, related_name='reviews')
    actor = models.ForeignKey('User', on_delete=models.PROTECT)
    action = models.CharField(max_length=30)
    note = models.TextField(blank=True, max_length=2000)
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        ordering = ['created_at', 'pk']


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
    profile_image = models.TextField(blank=True, default='')
    cover_image = models.TextField(blank=True, default='')
    bio = models.TextField(blank=True, null=True, default=None, max_length=2000)
    is_banned = models.BooleanField(default=False)
    driver_deactivated = models.BooleanField(default=False)
    suspended_until = models.DateTimeField(null=True, blank=True)

    @property
    def access_restricted(self):
        from django.utils import timezone
        return self.is_banned or self.driver_deactivated or bool(self.suspended_until and self.suspended_until > timezone.now())

    class RoyaltyStatus(models.TextChoices):
        YES = "yes", "Yes"
        NO = "no", "No"

    wants_royalty = models.CharField(
        max_length=3,
        choices=RoyaltyStatus.choices,
        default=RoyaltyStatus.NO,
    )

    @property
    def royalty_enabled(self):
        from django.utils import timezone
        return not self.access_restricted and (ResellerApplication.objects.filter(user=self, status='approved', permit_expires_on__gte=timezone.localdate()).exists() or RoyaltyApplication.objects.filter(user=self, status='approved', permit_expires_on__gte=timezone.localdate()).exists())

    @property
    def reseller_verified(self):
        from django.utils import timezone
        return not self.access_restricted and ResellerApplication.objects.filter(user=self, status='approved').filter(models.Q(permit_expires_on__isnull=True) | models.Q(permit_expires_on__gte=timezone.localdate())).exists()

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


class RoyaltyApplication(models.Model):
    permit_details = models.JSONField(default=dict, blank=True)
    business_permit_name = models.CharField(max_length=180, blank=True)
    class Status(models.TextChoices):
        PENDING = 'pending', 'Pending'
        APPROVED = 'approved', 'Approved'
        REJECTED = 'rejected', 'Rejected'

    user = models.OneToOneField(User, on_delete=models.CASCADE, related_name='royalty_application')
    business_permit_image = models.TextField()
    permit_expires_on = models.DateField()
    status = models.CharField(max_length=12, choices=Status.choices, default=Status.PENDING)
    submitted_at = models.DateTimeField(auto_now_add=True)
    reviewed_at = models.DateTimeField(null=True, blank=True)
    reviewed_by = models.ForeignKey(User, on_delete=models.SET_NULL, null=True, blank=True, related_name='royalty_reviews')
    review_note = models.CharField(max_length=1000, blank=True, default='')


class ResellerApplication(models.Model):
    business_permit = models.TextField(blank=True)
    business_permit_name = models.CharField(max_length=180, blank=True)
    permit_details = models.JSONField(default=dict, blank=True)
    permit_expires_on = models.DateField(null=True, blank=True)
    user = models.ForeignKey(User, on_delete=models.PROTECT, related_name='reseller_applications')
    tin_number = models.CharField(max_length=12)
    bir_certificate = models.TextField()
    bir_certificate_name = models.CharField(max_length=180)
    sworn_declaration = models.TextField(blank=True)
    sworn_declaration_name = models.CharField(max_length=180, blank=True)
    status = models.CharField(max_length=12, default='pending', choices=[('pending', 'Pending'), ('approved', 'Approved'), ('rejected', 'Rejected'), ('revoked', 'Revoked')])
    submitted_at = models.DateTimeField(auto_now_add=True)
    reviewed_at = models.DateTimeField(null=True)
    reviewed_by = models.ForeignKey(User, null=True, on_delete=models.PROTECT, related_name='+')
    review_note = models.CharField(max_length=1000, blank=True)

    class Meta:
        constraints = [models.UniqueConstraint(fields=['user'], condition=models.Q(status__in=['pending', 'approved']), name='one_active_reseller_application')]


class ResellerReview(models.Model):
    application = models.ForeignKey(ResellerApplication, on_delete=models.PROTECT, related_name='reviews')
    actor = models.ForeignKey(User, on_delete=models.PROTECT, related_name='+')
    action = models.CharField(max_length=12)
    note = models.CharField(max_length=1000, blank=True)
    created_at = models.DateTimeField(auto_now_add=True)


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


