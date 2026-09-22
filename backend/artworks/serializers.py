from rest_framework import serializers

from .models import Artwork


class ArtworkSerializer(serializers.ModelSerializer):
    artist_name = serializers.SerializerMethodField()
    similarity_matches = serializers.SerializerMethodField()

    class Meta:
        model = Artwork
        fields = [
            "id",
            "artist_id",
            "artist_name",
            "title",
            "description",
            "category",
            "art_type",
            "price",
            "image_data",
            "status",
            "decline_reason",
            "created_at",
            "similarity_matches",
        ]
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
