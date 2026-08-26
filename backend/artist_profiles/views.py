from rest_framework.views import APIView
from rest_framework.response import Response
from rest_framework import status
from rest_framework.permissions import AllowAny

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
                "artworks": ArtworkSerializer(artworks, many=True).data,
            }
        )
