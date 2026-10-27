from rest_framework import serializers

from .models import Artwork
from .categories import CATEGORIES, category_ids


class ArtworkSerializer(serializers.ModelSerializer):
    categories = serializers.SerializerMethodField()
    category_labels = serializers.SerializerMethodField()
    artist_name = serializers.SerializerMethodField()
    similarity_matches = serializers.SerializerMethodField()
    is_sold = serializers.SerializerMethodField()
    auction_request = serializers.SerializerMethodField()
    provenance = serializers.SerializerMethodField()
    average_rating = serializers.SerializerMethodField()
    review_count = serializers.SerializerMethodField()

    def review_summary(self, artwork):
        if not hasattr(artwork, '_review_summary'):
            from django.db.models import Avg, Count
            from fulfillment.models import PurchaseReview
            artwork._review_summary = PurchaseReview.objects.filter(payment__artwork=artwork, payment__status='paid').aggregate(average=Avg('artwork_rating'), count=Count('id'))
        return artwork._review_summary

    def get_average_rating(self, artwork):
        value = self.review_summary(artwork)['average']
        return round(float(value), 1) if value is not None else None

    def get_review_count(self, artwork):
        return self.review_summary(artwork)['count']

    class Meta:
        model = Artwork
        fields = [
            "id",
            "artist_id",
            "artist_name",
            "title",
            "description",
            "category",
            "categories",
            "category_labels",
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
            "provenance",
            "average_rating",
            "review_count",
        ]
        extra_kwargs = {
            'sale_type': {'required': False},
            'bid_increment': {'required': False},
            'starting_time': {'required': False},
            'end_time': {'required': False},
        }
        read_only_fields = ["id", "artist_id", "status", "decline_reason", "created_at"]

    def get_categories(self, artwork):
        return [key for key in artwork.categories if key in CATEGORIES] if artwork.categories else category_ids(artwork.category)

    def get_category_labels(self, artwork):
        return [CATEGORIES[key]['label'] for key in self.get_categories(artwork)]

    def get_artist_name(self, artwork):
        return (
            f"{artwork.artist.first_name} {artwork.artist.last_name}".strip()
            or artwork.artist.username
        )

    def get_provenance(self, artwork):
        from blockchain.models import ProvenanceListing
        link = ProvenanceListing.objects.select_related('record__credited_creator', 'record__current_owner').filter(artwork=artwork).first()
        if not link:
            return None
        record = link.record
        return {'artwork_id': str(record.pk), 'created_by': record.credited_creator.username,
                'creator_account_id': record.credited_creator_id,
                'current_owner': record.current_owner.username if record.registered_at else None,
                'creator_verified': record.creator_verified, 'disputed': record.disputed}

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
            link = getattr(artwork, 'provenance_listing', None)
            if link and link.record.registered_at and link.record.current_owner_id != artwork.artist_id:
                return True
            if hasattr(artwork, 'auction_listings') and artwork.auction_listings.filter(status='SETTLED').exists():
                return True
            paid_sales = artwork.payment_sessions.filter(status='paid')
            from .availability import blocks_public_listing
            return (artwork.art_type == 'physical' and paid_sales.exists()) or any(
                blocks_public_listing(payment.agreement)
                for payment in paid_sales.filter(agreement__exclusivity__in=['exclusive', 'sole']).select_related('agreement')
            )
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
