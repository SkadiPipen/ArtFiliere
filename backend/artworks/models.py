from django.db import models

from users.models import User


class Artwork(models.Model):
    class Status(models.TextChoices):
        PENDING = "pending", "Pending"
        APPROVED = "approved", "Approved"
        DECLINED = "declined", "Declined"

    artist = models.ForeignKey(User, on_delete=models.CASCADE, related_name="artworks")
    title = models.CharField(max_length=200)
    description = models.TextField()
    category = models.CharField(max_length=100)
    price = models.DecimalField(max_digits=10, decimal_places=2)
    image_data = models.TextField()
    status = models.CharField(
        max_length=20, choices=Status.choices, default=Status.PENDING
    )
    decline_reason = models.CharField(max_length=500, blank=True, default="")
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    # auction
    sale_type = models.CharField(max_length=50, default='DIRECT')
    bid_increment = models.DecimalField(max_digits=10, decimal_places=2, null=True, blank=True, default=100.00)
    starting_time = models.DateTimeField(null=True, blank=True)
    end_time = models.DateTimeField(null=True, blank=True)

    sha256_hash = models.CharField(
        max_length=64,
        unique=True,
        blank=True,
        null=True,
        help_text="SHA-256 hex digest of the uploaded image, for exact-duplicate detection.",
    )

    perceptual_hash = models.CharField(
        max_length=64,
        blank=True,
        null=True,
        help_text="Perceptual hash used for visually similar image detection.",
    )
    difference_hash = models.CharField(
        max_length=64,
        blank=True,
        null=True,
        help_text="Difference hash used alongside pHash for visual similarity detection.",
    )
    edge_hash = models.CharField(
        max_length=64,
        blank=True,
        null=True,
        help_text="Edge-only perceptual hash used to detect recoloured copies.",
    )

    class Meta:
        ordering = ["-created_at"]

    def __str__(self):
        return self.title


class ArtworkReviewLog(models.Model):
    artwork = models.ForeignKey(Artwork, on_delete=models.CASCADE, related_name="review_logs")
    actor = models.ForeignKey(
        User, on_delete=models.SET_NULL, null=True, related_name="artwork_review_logs"
    )
    action = models.CharField(max_length=20)
    previous_status = models.CharField(max_length=20, blank=True, default="")
    new_status = models.CharField(max_length=20, blank=True, default="")
    reason = models.CharField(max_length=500, blank=True, default="")
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        ordering = ["-created_at"]


class ArtworkSimilarityMatch(models.Model):
    """A reviewable visual-similarity finding, not a plagiarism verdict."""

    class ReviewStatus(models.TextChoices):
        PENDING = "pending", "Pending review"
        CONFIRMED_COPY = "confirmed_copy", "Confirmed copy"
        NOT_A_COPY = "not_a_copy", "Not a copy"

    artwork = models.ForeignKey(Artwork, on_delete=models.CASCADE, related_name="similarity_matches")
    reference_artwork = models.ForeignKey(Artwork, on_delete=models.CASCADE, related_name="referenced_by_similarity_matches")
    phash_distance = models.PositiveSmallIntegerField()
    dhash_distance = models.PositiveSmallIntegerField()
    edge_hash_distance = models.PositiveSmallIntegerField(default=64)
    feature_match_score = models.FloatField(default=0)
    color_similarity_score = models.FloatField(default=0)
    confidence_score = models.FloatField()
    review_status = models.CharField(max_length=20, choices=ReviewStatus.choices, default=ReviewStatus.PENDING)
    reviewed_by = models.ForeignKey(User, on_delete=models.SET_NULL, null=True, blank=True, related_name="reviewed_similarity_matches")
    review_note = models.CharField(max_length=500, blank=True, default="")
    created_at = models.DateTimeField(auto_now_add=True)
    reviewed_at = models.DateTimeField(null=True, blank=True)

    class Meta:
        ordering = ["-confidence_score", "-created_at"]
        constraints = [models.UniqueConstraint(fields=["artwork", "reference_artwork"], name="unique_artwork_similarity_match")]
