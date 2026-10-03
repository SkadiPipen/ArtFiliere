from decimal import Decimal, InvalidOperation
from rest_framework.response import Response
from rest_framework import status
from rest_framework.permissions import AllowAny

from authentication.views import AuthenticatedAPIView
from authentication.permissions import IsArtist, IsCreativeModerator
from users.models import User
from .models import Artwork, ArtworkReviewLog, ArtworkSimilarityMatch
from .serializers import ArtworkSerializer
from .tagging import generate_tags, validate_final_tags
from django.db import IntegrityError, transaction
from django.db.models import Avg, Q
from rest_framework.views import APIView
from fulfillment.models import PurchaseReview
from .hashing import (
    calculate_feature_match_score,
    calculate_color_similarity_score,
    calculate_phash_distance,
    compute_difference_hash,
    compute_edge_hash,
    compute_perceptual_hash,
    compute_sha256,
    is_review_worthy,
    load_image,
    similarity_confidence,
)
from django.utils import timezone
from django.utils.dateparse import parse_datetime


class ArtworkView(AuthenticatedAPIView):
    def get_permissions(self):
        if self.request.method == "POST":
            return [IsArtist()]
        return [AllowAny()]

    def get(self, request, artwork_id=None):
        if artwork_id:
            try:
                artwork = Artwork.objects.select_related("artist").get(id=artwork_id)
                user = self.get_request_user(request)
                include_sim = bool(user and user.role == User.Role.CREATIVE_MODERATOR)
                return Response(ArtworkSerializer(artwork, context={"include_similarity": include_sim}).data)
            except Artwork.DoesNotExist:
                return Response({"error": "Artwork not found."}, status=status.HTTP_404_NOT_FOUND)

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
            # One-of-one works disappear from the public catalogue after a
            # completed platform payment. Non-exclusive digital licences stay
            # available because they may be sold to more than one buyer.
            sold_one_of_one = (
                Q(art_type="physical", payment_sessions__status="paid")
                | Q(payment_sessions__status="paid", payment_sessions__agreement__exclusivity__in=["exclusive", "sole"])
                | Q(auction_listings__status="SETTLED")
            )
            artworks = artworks.filter(status=Artwork.Status.APPROVED).exclude(sold_one_of_one).distinct()

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
            final_tags = validate_final_tags(
                request.data.get("selected_ai_tags", []),
                request.data.get("custom_tags", []),
            )
        except ValueError as error:
            return Response({"error": str(error)}, status=status.HTTP_400_BAD_REQUEST)

        sale_type = request.data.get("sale_type", "Direct Sell")
        art_type = request.data.get("art_type")
        if art_type not in ("digital", "physical"):
            return Response({"error": "Choose a valid artwork type."}, status=status.HTTP_400_BAD_REQUEST)

        auction_template = None
        auction_terms = ""
        auction_license_type = "personal"
        auction_exclusivity = "non_exclusive"
        auction_delivery_type = art_type
        auction_start_time = None
        auction_end_time = None
        if sale_type == "Auction":
            from messaging.models import AgreementTemplate

            if request.data.get("auction_terms_confirmed") is not True:
                return Response(
                    {"error": "Review and confirm the auction Terms & Agreements before submitting."},
                    status=status.HTTP_400_BAD_REQUEST,
                )
            auction_terms = (request.data.get("auction_terms") or "").strip()
            if not auction_terms:
                return Response({"error": "Auction agreement terms are required."}, status=status.HTTP_400_BAD_REQUEST)
            if len(auction_terms) > 12000:
                return Response({"error": "Auction agreement terms must be 12,000 characters or fewer."}, status=status.HTTP_400_BAD_REQUEST)
            auction_license_type = request.data.get("auction_license_type", "personal")
            auction_exclusivity = request.data.get("auction_exclusivity", "non_exclusive")
            auction_delivery_type = request.data.get("auction_delivery_type", art_type)
            valid = {
                "auction_license_type": {"personal", "commercial"},
                "auction_exclusivity": {"non_exclusive", "exclusive", "sole"},
                "auction_delivery_type": {"digital", "physical"},
            }
            selected = {
                "auction_license_type": auction_license_type,
                "auction_exclusivity": auction_exclusivity,
                "auction_delivery_type": auction_delivery_type,
            }
            if any(value not in valid[field] for field, value in selected.items()):
                return Response({"error": "Choose valid auction agreement options."}, status=status.HTTP_400_BAD_REQUEST)
            auction_template = AgreementTemplate.objects.filter(
                id=request.data.get("auction_agreement_template_id"), is_active=True
            ).first()
            if not auction_template:
                return Response({"error": "The selected platform agreement template is unavailable. Refresh and try again."}, status=status.HTTP_400_BAD_REQUEST)
            auction_start_time = parse_datetime(request.data.get("starting_time") or "")
            auction_end_time = parse_datetime(request.data.get("end_time") or "")
            if not auction_start_time or not auction_end_time:
                return Response({"error": "Choose both an auction start and end date."}, status=status.HTTP_400_BAD_REQUEST)
            if timezone.is_naive(auction_start_time):
                auction_start_time = timezone.make_aware(auction_start_time)
            if timezone.is_naive(auction_end_time):
                auction_end_time = timezone.make_aware(auction_end_time)
            if auction_start_time.date() < timezone.localdate():
                return Response({"error": "The auction start date cannot be before today."}, status=status.HTTP_400_BAD_REQUEST)
            if auction_end_time <= auction_start_time:
                return Response({"error": "The auction end date must be later than the start date."}, status=status.HTTP_400_BAD_REQUEST)

        try:
            if sale_type == "Auction":
                # An auction begins at an artist-chosen bid. Its price is not
                # derived from the artist's production hours.
                listing_price = Decimal(str(request.data.get("starting_bid") or request.data["price"]))
                if not listing_price.is_finite() or listing_price <= 0 or listing_price > Decimal("99999999.99"):
                    raise ValueError()
                listing_price = listing_price.quantize(Decimal("0.01"))
                hours = None
                rate = None
                materials = Decimal("0")
            else:
                hours = Decimal(str(request.data.get("hours", "")))
                rate = Decimal(str(request.data.get("hourly_rate", "")))
                materials = Decimal(str(request.data.get("material_cost", "0")))
                if not all(x.is_finite() for x in (hours, rate, materials)) or hours <= 0 or rate <= 0 or materials < 0 or hours > 999999 or rate > 99999999 or materials > 99999999:
                    raise ValueError()
                if any(value != value.quantize(Decimal("0.01")) for value in (hours, rate, materials)):
                    raise ValueError()
                if art_type == "digital":
                    materials = Decimal("0")
                cost = hours * rate + materials
                listing_price = (cost * Decimal("1.1")).quantize(Decimal("0.01"))
                if listing_price > Decimal("99999999.99"):
                    raise ValueError()
        except (InvalidOperation, ValueError):
            message = "Enter a valid starting bid." if sale_type == "Auction" else "Enter valid hours, hourly rate, material costs, and artwork type."
            return Response({"error": message}, status=status.HTTP_400_BAD_REQUEST)

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

        additional_images = request.data.get("additional_images", [])
        if not isinstance(additional_images, list) or len(additional_images) > 3:
            return Response(
                {"error": "Upload up to three additional artwork images."},
                status=status.HTTP_400_BAD_REQUEST,
            )
        try:
            # Gallery images help buyers inspect the work. The cover image alone
            # remains the item used for similarity checks and blockchain proof.
            for gallery_image in additional_images:
                load_image(gallery_image)
        except (TypeError, ValueError):
            return Response(
                {"error": "One of the additional images could not be processed."},
                status=status.HTTP_400_BAD_REQUEST,
            )

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

        bid_increment = request.data.get("bid_increment") or 100.00
        starting_time = auction_start_time if sale_type == "Auction" else request.data.get("starting_time") or None
        end_time = auction_end_time if sale_type == "Auction" else request.data.get("end_time") or None

        try:
            artwork = Artwork.objects.create(
                artist=user,
                title=request.data["title"].strip(),
                description=request.data["description"].strip(),
                category=request.data["category"].strip(),
                tags=final_tags,
                price=listing_price,
                hours=hours,
                hourly_rate=rate,
                material_cost=materials,
                art_type=art_type,
                image_data=request.data["image_data"],
                additional_images=additional_images,
                sha256_hash=sha256_hash,
                perceptual_hash=perceptual_hash,
                difference_hash=difference_hash,
                edge_hash=edge_hash,
                sale_type=sale_type,
                bid_increment=bid_increment,
                starting_time=starting_time,
                end_time=end_time,
            )
        except IntegrityError:
            return Response(
                {
                    "error": "This exact image has already been uploaded to the platform."
                },
                status=status.HTTP_409_CONFLICT,
            )

        category_str = str(artwork.category or "").upper()
        sale_type_str = str(sale_type or "").upper()
        if "AUCTION" in sale_type_str or "AUCTION" in category_str:
            from datetime import timedelta
            from django.utils import timezone
            from django.utils.dateparse import parse_datetime
            from auctions.models import AuctionListing

            now = timezone.now()

            raw_start = artwork.starting_time 
            if isinstance(raw_start, str): 
                start_time = parse_datetime(raw_start) or now
            else: 
                start_time = raw_start or now 
                
            if timezone.is_naive(start_time): 
                start_time = timezone.make_aware(start_time) 
                
            raw_end = artwork.end_time 
            if isinstance(raw_end, str): 
                end_time = parse_datetime(raw_end) or (start_time + timedelta(days=3)) 
            else: 
                end_time = raw_end or (start_time + timedelta(days=3)) 
                
            if timezone.is_naive(end_time): 
                end_time = timezone.make_aware(end_time) 

            increment = artwork.bid_increment or 100.00
            start_bid = float(artwork.price)

            AuctionListing.objects.update_or_create(
                artwork_id=artwork.id,
                defaults={
                    "artist_id": artwork.artist_id or getattr(artwork.artist, 'id', None),
                    "starting_bid": start_bid,
                    "current_bid": start_bid,
                    "bid_increment": float(increment),
                    "start_time": start_time,
                    "end_time": end_time,
                    # The listing exists so its configuration is retained, but
                    # it cannot be discovered or bid on until moderation.
                    "status": "PENDING_APPROVAL",
                    "is_physical": artwork.art_type == "physical",
                    "license_type": auction_license_type,
                    "exclusivity": auction_exclusivity,
                    "delivery_type": auction_delivery_type,
                    "terms_snapshot": auction_terms,
                    "agreement_template": auction_template,
                },
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


class ArtworkReviewsView(APIView):
    """Public, verified-purchase feedback for one artwork; no reviewer contact data."""

    def get(self, request, artwork_id):
        if not Artwork.objects.filter(id=artwork_id, status=Artwork.Status.APPROVED).exists():
            return Response({"error": "Artwork not found."}, status=status.HTTP_404_NOT_FOUND)
        reviews = PurchaseReview.objects.filter(
            payment__artwork_id=artwork_id,
            payment__status="paid",
        ).select_related("payment__buyer").order_by("-created_at")
        summary = reviews.aggregate(average=Avg("artwork_rating"))
        return Response({
            "average_rating": round(float(summary["average"]), 1) if summary["average"] is not None else None,
            "review_count": reviews.count(),
            "reviews": [{
                "rating": review.artwork_rating,
                "comment": review.artwork_comment or review.comment,
                "reviewer": (review.payment.buyer.first_name or "Verified buyer").strip(),
                "created_at": review.created_at.isoformat(),
                "verified_purchase": True,
            } for review in reviews[:20]],
        })


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


class AuctionAgreementDefaultsView(AuthenticatedAPIView):
    """Returns the editable platform template used to start an auction agreement."""

    permission_classes = [IsArtist]

    def get(self, request):
        from messaging.models import AgreementTemplate

        template = AgreementTemplate.objects.filter(is_active=True).order_by("-updated_at").first()
        if not template:
            return Response(
                {"error": "No active platform agreement template is configured."},
                status=status.HTTP_409_CONFLICT,
            )
        return Response({"id": template.id, "name": template.name, "body": template.body})


class ArtworkReviewView(AuthenticatedAPIView):
    permission_classes = [IsCreativeModerator]

    @transaction.atomic
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
            artwork = Artwork.objects.select_for_update(of=("self",)).select_related("artist").get(id=artwork_id)
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

        # Blockchain is proof of the approved artwork only. A node failure must
        # never undo a valid moderation decision; it is recorded for retry.
        blockchain_result = None
        if review_status == Artwork.Status.APPROVED and artwork.sha256_hash:
            from django.conf import settings
            from django.utils import timezone
            from blockchain.models import BlockchainTransaction
            from blockchain.service import BlockchainError, register_artwork

            existing_proof = artwork.blockchain_transactions.filter(
                operation="artwork_registration", status=BlockchainTransaction.Status.CONFIRMED
            ).exists()
            if not existing_proof:
                proof = BlockchainTransaction.objects.create(
                    artwork=artwork,
                    network=settings.BLOCKCHAIN_NETWORK,
                    operation="artwork_registration",
                )
                try:
                    result = register_artwork(artwork.id, artwork.sha256_hash)
                    proof.transaction_hash = result["transaction_hash"]
                    proof.block_number = result["block_number"]
                    proof.status = BlockchainTransaction.Status.CONFIRMED
                    proof.confirmed_at = timezone.now()
                    proof.save()
                    blockchain_result = {"status": "confirmed", **result}
                except BlockchainError as error:
                    proof.status = BlockchainTransaction.Status.FAILED
                    proof.error_message = str(error)
                    proof.save()
                    blockchain_result = {"status": "failed", "error": str(error)}

        # Live auction upon approval
        if review_status == Artwork.Status.APPROVED:
            from datetime import timedelta
            from django.utils import timezone
            from auctions.models import AuctionListing

            category_str = str(getattr(artwork, "category", "")).upper()
            sale_type = str(getattr(artwork, "sale_type", "")).upper()

            is_auction = "AUCTION" in sale_type or "AUCTION" in category_str
            is_physical = "PHYSICAL" in category_str or getattr(artwork, "art_type", "") == "physical"

            if is_auction:
                starting_price = float(artwork.price)
                now = timezone.now()

                # Artist choice for auc if chosen
                start_time = getattr(artwork, "starting_time", None) or now
                end_time = getattr(artwork, "end_time", None) or (start_time + timedelta(days=3))
                increment = getattr(artwork, "bid_increment", None) or 100.00

                initial_status = "ACTIVE" if start_time <= now else "SCHEDULED"

                auction, created = AuctionListing.objects.get_or_create(
                    artwork=artwork,
                    defaults={
                        "artist": artwork.artist,
                        "starting_bid": starting_price,
                        "current_bid": starting_price,
                        "bid_increment": float(increment),
                        "start_time": start_time,
                        "end_time": end_time,
                        "status": initial_status,
                        "is_physical": is_physical,
                    },
                )
                if not created and auction.status == "PENDING_APPROVAL":
                    auction.status = initial_status
                    auction.start_time = start_time
                    auction.end_time = end_time
                    auction.save(update_fields=["status", "start_time", "end_time"])
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

        if previous_status == Artwork.Status.DECLINED:
            from wallets.models import SupportTicket, SupportReply

            appeals = SupportTicket.objects.select_for_update().filter(
                artwork=artwork, requester=artwork.artist, concern="rejected_artwork",
            ).exclude(status__in=[SupportTicket.Status.RESOLVED, SupportTicket.Status.CLOSED])
            for appeal in appeals:
                SupportReply.objects.create(
                    ticket=appeal, sender=moderator,
                    message=("Your appeal was accepted. " if review_status == Artwork.Status.APPROVED else "Your appeal was declined. ") + message,
                )
                appeal.status = SupportTicket.Status.RESOLVED
                appeal.save(update_fields=["status", "updated_at"])

        response_data = ArtworkSerializer(artwork, context={"include_similarity": True}).data
        if blockchain_result is not None:
            response_data["blockchain"] = blockchain_result
        return Response(response_data)


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
