from authentication.views import AuthenticatedAPIView
from authentication.permissions import IsAuthenticatedUser
from .portfolio import artist_portfolio
from rest_framework.views import APIView
from rest_framework.response import Response
from rest_framework import status
from rest_framework.permissions import AllowAny
from django.db.models import Avg, Count, Q
from django.db.models.functions import Coalesce
from fulfillment.models import PurchaseReview

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
        application = getattr(artist, 'artist_application', None)
        return Response(
            {
                "id": artist.id,
                "name": f"{artist.first_name} {artist.last_name}".strip() or artist.username,
                "username": artist.username,
                "bio": getattr(application, "bio", "") or "",
                "profile_image": artist.profile_image,
                "cover_image": artist.cover_image,
                "is_accepting_commissions": artist.is_accepting_commissions,
                "artworks": ArtworkSerializer(artworks, many=True).data,
                "portfolio": artist_portfolio(artist),
            }
        )


class ArtistDirectoryView(APIView):
    """Public, availability-first artist directory for commission buyers."""

    permission_classes = [AllowAny]

    def get(self, request):
        sort = request.query_params.get("sort", "recommended")
        if sort not in {"recommended", "rating", "completed", "new"}:
            return Response({"error": "Unsupported artist sort."}, status=status.HTTP_400_BAD_REQUEST)

        open_only = request.query_params.get("open_only", "true").lower() not in {"false", "0", "no"}
        artists = User.objects.filter(role=User.Role.ARTIST)
        if open_only:
            artists = artists.filter(is_accepting_commissions=True)
        artists = artists.select_related("artist_application").annotate(
            completed_commissions=Count(
                "artist_commissions",
                filter=Q(artist_commissions__status="COMPLETE"),
                distinct=True,
            ),
        )

        rating_rows = PurchaseReview.objects.filter(Q(payment__status='paid') | Q(commission__status='COMPLETE')).annotate(artist_pk=Coalesce('payment__artist_id', 'commission__artist_id')).values('artist_pk').annotate(average_rating=Avg('artist_rating'), rating_count=Count('pk'))
        rating_stats = {row['artist_pk']: row for row in rating_rows}
        records = []
        for artist in artists:
            application = getattr(artist, "artist_application", None)
            stats = rating_stats.get(artist.pk, {})
            rating = float(stats['average_rating']) if stats.get('average_rating') is not None else None
            records.append({
                "id": artist.id,
                "name": f"{artist.first_name} {artist.last_name}".strip() or artist.username,
                "username": artist.username,
                "bio": application.bio if application else "",
                "average_rating": rating,
                "rating_count": stats.get('rating_count', 0),
                "completed_commissions": artist.completed_commissions,
                "is_accepting_commissions": artist.is_accepting_commissions,
                "joined_at": artist.created_at.isoformat(),
            })

        if sort == "rating":
            records.sort(key=lambda item: (item["average_rating"] is not None, item["average_rating"] or 0, item["rating_count"]), reverse=True)
        elif sort == "completed":
            records.sort(key=lambda item: (item["completed_commissions"], item["average_rating"] or 0), reverse=True)
        elif sort == "new":
            records.sort(key=lambda item: item["joined_at"], reverse=True)
        else:
            # Availability is already required; then reward verified rating,
            # completed work, and enough review volume to be meaningful.
            records.sort(key=lambda item: ((item["average_rating"] or 0) * min(item["rating_count"], 5), item["completed_commissions"], item["rating_count"]), reverse=True)

        return Response(records)


class MyPortfolioView(AuthenticatedAPIView):
    permission_classes = [IsAuthenticatedUser]

    def get(self, request):
        artist = self.get_request_user(request)
        return Response(artist_portfolio(artist, own=True))
