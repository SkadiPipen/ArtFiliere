from rest_framework.response import Response
from rest_framework import status
from rest_framework.permissions import AllowAny

from authentication.views import AuthenticatedAPIView
from authentication.permissions import IsArtist, IsCreativeModerator
from users.models import User
from .models import Artwork, ArtworkReviewLog, ArtworkSimilarityMatch
from .serializers import ArtworkSerializer
from .tagging import generate_tags
from django.db import IntegrityError
from .hashing import (
    calculate_feature_match_score,
    calculate_color_similarity_score,
    calculate_phash_distance,
    compute_difference_hash,
    compute_edge_hash,
    compute_perceptual_hash,
    compute_sha256,
    is_review_worthy,
    similarity_confidence,
)
from django.utils import timezone


class ArtworkView(AuthenticatedAPIView):
    def get_permissions(self):
        if self.request.method == "POST":
            return [IsArtist()]
        return [AllowAny()]

    def get(self, request):
        user = self.get_request_user(request)
        mine = request.query_params.get("mine") == "1"
        artworks = Artwork.objects.select_related("artist")

        if mine:
            if not user:
                return Response(
                    {"error": "Authentication is required."},
                    status=status.HTTP_401_UNAUTHORIZED,
                )
            artworks = artworks.filter(artist=user)
        elif user and user.role == User.Role.CREATIVE_MODERATOR:
            artworks = artworks.all()
        else:
            artworks = artworks.filter(status=Artwork.Status.APPROVED)

        return Response(ArtworkSerializer(
            artworks, many=True,
            context={"include_similarity": bool(user and user.role == User.Role.CREATIVE_MODERATOR)},
        ).data)

    def post(self, request):
        user = self.get_request_user(request)
        required = ["title", "description", "category", "price", "image_data"]
        missing = [field for field in required if not request.data.get(field)]
        if missing:
            return Response(
                {"error": f"Missing required artwork fields: {', '.join(missing)}"},
                status=status.HTTP_400_BAD_REQUEST,
            )

        try:
            sha256_hash = compute_sha256(request.data["image_data"])
            perceptual_hash = compute_perceptual_hash(request.data["image_data"])
            difference_hash = compute_difference_hash(request.data["image_data"])
            edge_hash = compute_edge_hash(request.data["image_data"])
        except ValueError:
            return Response(
            {"error": "The uploaded image could not be processed."},
            status=status.HTTP_400_BAD_REQUEST,
        )

        # Tier 1 anti-plagiarism check: exact file match. Checked up front
        # (rather than relying only on the DB unique constraint) so we can
        # tell the artist which existing artwork it duplicates.
        duplicate = (
            Artwork.objects.filter(sha256_hash=sha256_hash)
            .select_related("artist")
            .first()
        )
        if duplicate:
            return Response(
                {
                    "error": "This exact image has already been uploaded to the platform.",
                    "duplicate_artwork_id": duplicate.id,
                },
                status=status.HTTP_409_CONFLICT,
            )

        try:
            artwork = Artwork.objects.create(
                artist=user,
                title=request.data["title"].strip(),
                description=request.data["description"].strip(),
                category=request.data["category"].strip(),
                price=request.data["price"],
                image_data=request.data["image_data"],
                sha256_hash=sha256_hash,
                perceptual_hash=perceptual_hash,
                difference_hash=difference_hash,
                edge_hash=edge_hash,
            )
        except IntegrityError:
            # Safety net for a race condition: two identical uploads hitting
            # this view at nearly the same instant, both passing the check
            # above before either had committed. The DB's unique constraint
            # catches what the pre-check couldn't.
            return Response(
                {
                    "error": "This exact image has already been uploaded to the platform."
                },
                status=status.HTTP_409_CONFLICT,
            )

        _create_similarity_matches(artwork)
        ArtworkReviewLog.objects.create(
            artwork=artwork, actor=user, action="submitted", new_status=artwork.status
        )
        payload = ArtworkSerializer(artwork, context={"include_similarity": True}).data
        if artwork.similarity_matches.filter(review_status=ArtworkSimilarityMatch.ReviewStatus.PENDING).exists():
            payload["similarity_review_required"] = True
            payload["message"] = "Your artwork was submitted and is awaiting similarity review before it can be approved."
        return Response(payload, status=status.HTTP_201_CREATED)


class ArtworkTagSuggestionView(AuthenticatedAPIView):
    permission_classes = [IsArtist]

    def post(self, request):
        description = (request.data.get("description") or "").strip()
        if len(description) < 20:
            return Response(
                {"error": "Add a more detailed description before generating tags."},
                status=status.HTTP_400_BAD_REQUEST,
            )
        try:
            return Response({"tags": generate_tags(description)})
        except RuntimeError as error:
            return Response(
                {"error": str(error)}, status=status.HTTP_503_SERVICE_UNAVAILABLE
            )


class ArtworkReviewView(AuthenticatedAPIView):
    permission_classes = [IsCreativeModerator]

    def patch(self, request, artwork_id):
        moderator = self.get_request_user(request)

        review_status = request.data.get("status")
        if review_status not in {Artwork.Status.APPROVED, Artwork.Status.DECLINED}:
            return Response(
                {"error": "Status must be approved or declined."},
                status=status.HTTP_400_BAD_REQUEST,
            )

        reason = (request.data.get("decline_reason") or "").strip()
        if review_status == Artwork.Status.DECLINED and not reason:
            return Response(
                {"error": "A reason is required when declining artwork."},
                status=status.HTTP_400_BAD_REQUEST,
            )

        try:
            artwork = Artwork.objects.select_related("artist").get(id=artwork_id)
        except Artwork.DoesNotExist:
            return Response(
                {"error": "Artwork not found."}, status=status.HTTP_404_NOT_FOUND
            )

        if review_status == Artwork.Status.APPROVED:
            matches = artwork.similarity_matches.all()
            if matches.filter(review_status=ArtworkSimilarityMatch.ReviewStatus.CONFIRMED_COPY).exists():
                return Response(
                    {"error": "This artwork has a confirmed internal copy match and cannot be approved."},
                    status=status.HTTP_409_CONFLICT,
                )
            if matches.filter(review_status=ArtworkSimilarityMatch.ReviewStatus.PENDING).exists():
                return Response(
                    {"error": "Resolve all possible duplicate matches before approving this artwork."},
                    status=status.HTTP_409_CONFLICT,
                )

        previous_status = artwork.status
        artwork.status = review_status
        artwork.decline_reason = (
            reason if review_status == Artwork.Status.DECLINED else ""
        )
        artwork.save(update_fields=["status", "decline_reason", "updated_at"])

        ArtworkReviewLog.objects.create(
            artwork=artwork,
            actor=moderator,
            action=review_status,
            previous_status=previous_status,
            new_status=review_status,
            reason=reason,
        )

        message = (
            "Your artwork has been approved and is now visible to buyers."
            if review_status == Artwork.Status.APPROVED
            else f"Your artwork was declined. Reason: {reason}"
        )

        # Local import avoids a circular import between artworks and notifications
        from notifications.models import UserNotification

        UserNotification.objects.create(
            user=artwork.artist,
            artwork=artwork,
            title=f"Artwork {review_status}",
            message=message,
        )

        return Response(ArtworkSerializer(artwork, context={"include_similarity": True}).data)


class ArtworkSimilarityReviewView(AuthenticatedAPIView):
    permission_classes = [IsCreativeModerator]

    def patch(self, request, match_id):
        review_status = request.data.get("review_status")
        if review_status not in {
            ArtworkSimilarityMatch.ReviewStatus.CONFIRMED_COPY,
            ArtworkSimilarityMatch.ReviewStatus.NOT_A_COPY,
        }:
            return Response({"error": "review_status must be confirmed_copy or not_a_copy."}, status=status.HTTP_400_BAD_REQUEST)
        try:
            match = ArtworkSimilarityMatch.objects.get(id=match_id)
        except ArtworkSimilarityMatch.DoesNotExist:
            return Response({"error": "Similarity match not found."}, status=status.HTTP_404_NOT_FOUND)
        match.review_status = review_status
        match.review_note = (request.data.get("review_note") or "").strip()[:500]
        match.reviewed_by = self.get_request_user(request)
        match.reviewed_at = timezone.now()
        match.save(update_fields=["review_status", "review_note", "reviewed_by", "reviewed_at"])
        return Response({"id": match.id, "review_status": match.review_status})


def _create_similarity_matches(artwork):
    """Save only high-confidence candidates for moderator review.

    This runs synchronously for the project-scale catalogue. Move it to a job
    queue before the catalogue becomes large.
    """
    references = Artwork.objects.exclude(id=artwork.id).exclude(perceptual_hash__isnull=True).exclude(difference_hash__isnull=True).exclude(edge_hash__isnull=True)
    for reference in references.iterator():
        try:
            phash_distance = calculate_phash_distance(artwork.perceptual_hash, reference.perceptual_hash)
            dhash_distance = calculate_phash_distance(artwork.difference_hash, reference.difference_hash)
            edge_hash_distance = calculate_phash_distance(artwork.edge_hash, reference.edge_hash)
        except ValueError:
            continue
        # Avoid costly feature matching for clearly unrelated images.
        if phash_distance > 14 and dhash_distance > 16 and edge_hash_distance > 10:
            continue
        feature_score = calculate_feature_match_score(artwork.image_data, reference.image_data)
        color_score = calculate_color_similarity_score(artwork.image_data, reference.image_data)
        confidence = similarity_confidence(phash_distance, dhash_distance, feature_score, edge_hash_distance)
        if is_review_worthy(phash_distance, dhash_distance, feature_score, confidence, edge_hash_distance):
            ArtworkSimilarityMatch.objects.get_or_create(
                artwork=artwork,
                reference_artwork=reference,
                defaults={
                    "phash_distance": phash_distance,
                    "dhash_distance": dhash_distance,
                    "edge_hash_distance": edge_hash_distance,
                    "feature_match_score": feature_score,
                    "color_similarity_score": color_score,
                    "confidence_score": confidence,
                },
            )
