from rest_framework import serializers

from .models import Artwork


class ArtworkSerializer(serializers.ModelSerializer):
    artist_name = serializers.SerializerMethodField()
    similarity_matches = serializers.SerializerMethodField()
    is_sold = serializers.SerializerMethodField()
    auction_request = serializers.SerializerMethodField()

    class Meta:
        model = Artwork
        fields = [
            "id",
            "artist_id",
            "artist_name",
            "title",
            "description",
            "category",
            "tags",
            "art_type",
            "price",
            "image_data",
            "additional_images",
            "status",
            "decline_reason",
            "created_at",
            "similarity_matches",
            # added for auc
            "sale_type",
            "bid_increment",
            "starting_time",
            "end_time",
            "artist",
            "is_sold",
            "hours",
            "hourly_rate",
            "material_cost",
            "auction_request",
        ]
        extra_kwargs = {
            'sale_type': {'required': False},
            'bid_increment': {'required': False},
            'starting_time': {'required': False},
            'end_time': {'required': False},
        }
        read_only_fields = ["id", "artist_id", "status", "decline_reason", "created_at"]

    def get_artist_name(self, artwork):
        return (
            f"{artwork.artist.first_name} {artwork.artist.last_name}".strip()
            or artwork.artist.username
        )

    def get_similarity_matches(self, artwork):
        if not self.context.get("include_similarity"):
            return []
        matches = artwork.similarity_matches.select_related("reference_artwork__artist")[:5]
        return [{
            "id": match.id,
            "reference_artwork_id": match.reference_artwork_id,
            "reference_title": match.reference_artwork.title,
            "reference_artist_name": self.get_artist_name(match.reference_artwork),
            "reference_image_data": match.reference_artwork.image_data,
            "confidence_score": match.confidence_score,
            "phash_distance": match.phash_distance,
            "dhash_distance": match.dhash_distance,
            "edge_hash_distance": match.edge_hash_distance,
            "feature_match_score": match.feature_match_score,
            "color_similarity_score": match.color_similarity_score,
            "review_status": match.review_status,
        } for match in matches]

    def get_is_sold(self, artwork):
        try:
            if hasattr(artwork, 'auction_listings') and artwork.auction_listings.filter(status='SETTLED').exists():
                return True
            paid_sales = artwork.payment_sessions.filter(status='paid')
            return artwork.art_type == 'physical' and paid_sales.exists() or paid_sales.filter(
                agreement__exclusivity__in=['exclusive', 'sole']
            ).exists()
        except Exception:
            return False

    def get_auction_request(self, artwork):
        if not self.context.get("include_similarity"):
            return None
        auction = artwork.auction_listings.order_by("-id").first()
        if not auction:
            return None
        return {
            "id": auction.id,
            "status": auction.status,
            "starting_bid": str(auction.starting_bid),
            "current_bid": str(auction.current_bid),
            "bid_increment": str(auction.bid_increment),
            "start_time": auction.start_time.isoformat() if auction.start_time else None,
            "end_time": auction.end_time.isoformat() if auction.end_time else None,
            "license_type": auction.license_type,
            "exclusivity": auction.exclusivity,
            "delivery_type": auction.delivery_type,
            "terms": auction.terms_snapshot,
            "template_name": auction.agreement_template.name if auction.agreement_template else "",
            'signed_document': auction.signed_document,
            'signed_document_hash': auction.signed_document_hash,
            'artist_signature': auction.artist_signature,
            'artist_signed_at': auction.artist_signed_at,
            'artist_signature_image': auction.artist_signature_image if self.context.get('include_similarity') else '',
        }
