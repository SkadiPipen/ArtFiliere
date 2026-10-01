from rest_framework.views import APIView
from rest_framework.response import Response
from rest_framework import status
from rest_framework.permissions import AllowAny
from django.db.models import Avg, Count, Q

from users.models import User
from artworks.models import Artwork
from artworks.serializers import ArtworkSerializer


class ArtistProfileView(APIView):
    permission_classes = [AllowAny]

    def get(self, request, artist_id):
        try:
            artist = User.objects.get(id=artist_id, role=User.Role.ARTIST)
        except User.DoesNotExist:
            return Response({"error": "Artist not found."}, status=status.HTTP_404_NOT_FOUND)

        artworks = artist.artworks.filter(status=Artwork.Status.APPROVED)
        return Response(
            {
                "id": artist.id,
                "name": f"{artist.first_name} {artist.last_name}".strip() or artist.username,
                "username": artist.username,
                "bio": getattr(artist.artist_application, "bio", "") or "",
                "is_accepting_commissions": artist.is_accepting_commissions,
                "artworks": ArtworkSerializer(artworks, many=True).data,
            }
        )


class ArtistDirectoryView(APIView):
    """Public, availability-first artist directory for commission buyers."""

    permission_classes = [AllowAny]

    def get(self, request):
        sort = request.query_params.get("sort", "recommended")
        if sort not in {"recommended", "rating", "completed", "new", "price"}:
            return Response({"error": "Unsupported artist sort."}, status=status.HTTP_400_BAD_REQUEST)

        artists = User.objects.filter(
            role=User.Role.ARTIST,
            is_accepting_commissions=True,
        ).select_related("artist_application").annotate(
            average_rating=Avg(
                "artworks__payment_sessions__review__artist_rating",
                filter=Q(artworks__payment_sessions__status="paid"),
            ),
            rating_count=Count(
                "artworks__payment_sessions__review",
                filter=Q(artworks__payment_sessions__status="paid"),
                distinct=True,
            ),
            completed_commissions=Count(
                "artist_commissions",
                filter=Q(artist_commissions__status="COMPLETE"),
                distinct=True,
            ),
        )

        records = []
        for artist in artists:
            application = getattr(artist, "artist_application", None)
            hourly_rate = application.hourly_rate if application else None
            rating = float(artist.average_rating) if artist.average_rating is not None else None
            records.append({
                "id": artist.id,
                "name": f"{artist.first_name} {artist.last_name}".strip() or artist.username,
                "username": artist.username,
                "bio": application.bio if application else "",
                "hourly_rate": str(hourly_rate) if hourly_rate is not None else None,
                "average_rating": rating,
                "rating_count": artist.rating_count,
                "completed_commissions": artist.completed_commissions,
                "is_accepting_commissions": True,
                "joined_at": artist.created_at.isoformat(),
            })

        if sort == "rating":
            records.sort(key=lambda item: (item["average_rating"] is not None, item["average_rating"] or 0, item["rating_count"]), reverse=True)
        elif sort == "completed":
            records.sort(key=lambda item: (item["completed_commissions"], item["average_rating"] or 0), reverse=True)
        elif sort == "new":
            records.sort(key=lambda item: item["joined_at"], reverse=True)
        elif sort == "price":
            records.sort(key=lambda item: float(item["hourly_rate"]) if item["hourly_rate"] is not None else float("inf"))
        else:
            # Availability is already required; then reward verified rating,
            # completed work, and enough review volume to be meaningful.
            records.sort(key=lambda item: ((item["average_rating"] or 0) * min(item["rating_count"], 5), item["completed_commissions"], item["rating_count"]), reverse=True)

        return Response(records)
