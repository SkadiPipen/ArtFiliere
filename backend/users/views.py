from rest_framework.views import APIView
from rest_framework.response import Response
from rest_framework import status
from .models import User, ArtistApplication

class SubmitArtistApplicationView(APIView):
    def post(self, request):
        firebase_uid = request.data.get("firebase_uid")

        try:
            user = User.objects.get(firebase_uid=firebase_uid)
        except User.DoesNotExist:
            return Response({"error": "User not found in database."}, status=status.HTTP_404_NOT_FOUND)

        # Create or update application
        application, created = ArtistApplication.objects.update_or_create(
            user=user,
            defaults={
                "hourly_rate": request.data.get("hourly_rate"),
                "tin_number": request.data.get("tinNum"),
                "bio": request.data.get("bio"),
                "bir_certificate": request.data.get("birCertificate"),
                "sworn_declaration": request.data.get("swornDeclaration"),
                "portfolio": request.data.get("portfolio", []),
                "status": ArtistApplication.ApprovalStatus.PENDING,
            }
        )

        return Response(
            {
                "message": "Application submitted successfully.",
                "status": application.status
            },
            status=status.HTTP_201_CREATED
        )