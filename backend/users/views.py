from rest_framework.views import APIView
from rest_framework.response import Response
from rest_framework import status
from django.db.models import Q
from .models import ArtistApplication, ArtistApplicationLog, Artwork, ArtworkReviewLog, DirectMessage, User, UserNotification
from authentication.services import verify_token
from .tagging import generate_tags

class SubmitArtistApplicationView(APIView):
    def get_request_user(self, request):
        header = request.headers.get("Authorization", "")
        if not header.startswith("Bearer "):
            return None

        try:
            decoded = verify_token(header.split(" ", 1)[1])
            return User.objects.get(firebase_uid=decoded["uid"])
        except Exception:
            return None

    def get(self, request):
        user = self.get_request_user(request)
        if not user or user.role != User.Role.HR:
            return Response({"error": "HR access is required."}, status=status.HTTP_403_FORBIDDEN)

        applications = ArtistApplication.objects.select_related("user").order_by("-submitted_at")
        return Response([
            {
                "id": application.id,
                "artist_name": f"{application.user.first_name} {application.user.last_name}".strip() or application.user.username,
                "email": application.user.email,
                "hourly_rate": str(application.hourly_rate),
                "bio": application.bio or "",
                "portfolio": application.portfolio,
                "bir_certificate": application.bir_certificate,
                "sworn_declaration": application.sworn_declaration,
                "status": application.status,
                "submitted_at": application.submitted_at.isoformat(),
            }
            for application in applications
        ])

    def post(self, request):
        firebase_uid = request.data.get("firebase_uid")
        hourly_rate = request.data.get("hourly_rate")
        tin_number = request.data.get("tinNum", "").replace("-", "")
        bir_certificate = request.data.get("birCertificate")
        sworn_declaration = request.data.get("swornDeclaration")
        portfolio = request.data.get("portfolio", [])

        if not firebase_uid:
            return Response({"error": "User identification is required."}, status=status.HTTP_400_BAD_REQUEST)

        if not all([hourly_rate, tin_number, bir_certificate, sworn_declaration]):
            return Response({"error": "Please complete all required artist registration fields."}, status=status.HTTP_400_BAD_REQUEST)

        if not tin_number.isdigit() or len(tin_number) != 9:
            return Response({"error": "Enter a valid 9-digit TIN."}, status=status.HTTP_400_BAD_REQUEST)

        if not isinstance(portfolio, list) or not portfolio:
            return Response({"error": "Add at least one artwork to your portfolio."}, status=status.HTTP_400_BAD_REQUEST)

        try:
            user = User.objects.get(firebase_uid=firebase_uid)
        except User.DoesNotExist:
            return Response({"error": "User not found in database."}, status=status.HTTP_404_NOT_FOUND)

        previous_application = ArtistApplication.objects.filter(user=user).only("status").first()

        # Create or update application
        application, created = ArtistApplication.objects.update_or_create(
            user=user,
            defaults={
                "hourly_rate": hourly_rate,
                "tin_number": tin_number,
                "bio": request.data.get("bio"),
                "bir_certificate": bir_certificate,
                "sworn_declaration": sworn_declaration,
                "portfolio": portfolio,
                "status": ArtistApplication.ApprovalStatus.PENDING,
            }
        )

        ArtistApplicationLog.objects.create(
            application=application,
            actor=user,
            action=ArtistApplicationLog.Action.SUBMITTED,
            previous_status="" if created else previous_application.status,
            new_status=application.status,
        )

        return Response(
            {
                "message": "Application submitted successfully.",
                "status": application.status
            },
            status=status.HTTP_201_CREATED
        )

    def patch(self, request, application_id):
        user = self.get_request_user(request)
        if not user or user.role != User.Role.HR:
            return Response({"error": "HR access is required."}, status=status.HTTP_403_FORBIDDEN)

        review_status = request.data.get("status")
        valid_statuses = {
            ArtistApplication.ApprovalStatus.APPROVED,
            ArtistApplication.ApprovalStatus.REJECTED,
        }
        if review_status not in valid_statuses:
            return Response({"error": "Status must be approved or rejected."}, status=status.HTTP_400_BAD_REQUEST)

        rejection_reason = (request.data.get("rejection_reason") or "").strip()
        if review_status == ArtistApplication.ApprovalStatus.REJECTED and not rejection_reason:
            return Response({"error": "A reason is required when rejecting an application."}, status=status.HTTP_400_BAD_REQUEST)

        try:
            application = ArtistApplication.objects.select_related("user").get(id=application_id)
        except ArtistApplication.DoesNotExist:
            return Response({"error": "Artist application not found."}, status=status.HTTP_404_NOT_FOUND)

        previous_status = application.status
        application.status = review_status
        application.rejection_reason = rejection_reason if review_status == ArtistApplication.ApprovalStatus.REJECTED else ""
        application.save(update_fields=["status", "rejection_reason", "updated_at"])

        if review_status == ArtistApplication.ApprovalStatus.APPROVED:
            application.user.role = User.Role.ARTIST
            application.user.save(update_fields=["role"])

        ArtistApplicationLog.objects.create(
            application=application,
            actor=user,
            action=(
                ArtistApplicationLog.Action.APPROVED
                if review_status == ArtistApplication.ApprovalStatus.APPROVED
                else ArtistApplicationLog.Action.REJECTED
            ),
            previous_status=previous_status,
            new_status=review_status,
            reason=rejection_reason,
        )

        if review_status == ArtistApplication.ApprovalStatus.APPROVED:
            notification_title = "Artist application approved"
            notification_message = "Your artist registration request has been approved. You can now use artist features."
        else:
            notification_title = "Artist application rejected"
            notification_message = f"Your artist registration request was rejected. Reason: {rejection_reason}"

        UserNotification.objects.create(
            user=application.user,
            application=application,
            title=notification_title,
            message=notification_message,
        )

        return Response({"id": application.id, "status": application.status})


class ArtistApplicationLogView(APIView):
    def get(self, request):
        user = SubmitArtistApplicationView().get_request_user(request)
        if not user or user.role != User.Role.HR:
            return Response({"error": "HR access is required."}, status=status.HTTP_403_FORBIDDEN)

        logs = ArtistApplicationLog.objects.select_related("application__user", "actor")[:100]
        return Response([
            {
                "id": log.id,
                "action": log.action,
                "previous_status": log.previous_status,
                "new_status": log.new_status,
                "reason": log.reason,
                "artist_name": f"{log.application.user.first_name} {log.application.user.last_name}".strip() or log.application.user.username,
                "actor_name": (
                    f"{log.actor.first_name} {log.actor.last_name}".strip() or log.actor.username
                ) if log.actor else "Deleted user",
                "created_at": log.created_at.isoformat(),
            }
            for log in logs
        ])


class UserNotificationView(APIView):
    def get(self, request):
        user = SubmitArtistApplicationView().get_request_user(request)
        if not user:
            return Response({"error": "Authentication is required."}, status=status.HTTP_401_UNAUTHORIZED)

        notifications = user.notifications.all()[:50]
        return Response({
            "unread_count": user.notifications.filter(is_read=False).count(),
            "notifications": [
                {
                    "id": notification.id,
                    "title": notification.title,
                    "message": notification.message,
                    "is_read": notification.is_read,
                    "created_at": notification.created_at.isoformat(),
                }
                for notification in notifications
            ],
        })

    def patch(self, request):
        user = SubmitArtistApplicationView().get_request_user(request)
        if not user:
            return Response({"error": "Authentication is required."}, status=status.HTTP_401_UNAUTHORIZED)

        notification_id = request.data.get("notification_id")
        notifications = user.notifications.filter(is_read=False)
        if notification_id:
            notifications = notifications.filter(id=notification_id)
        notifications.update(is_read=True)
        return Response({"message": "Notifications marked as read."})


def serialize_artwork(artwork):
    return {
        "id": artwork.id,
        "artist_id": artwork.artist_id,
        "artist_name": f"{artwork.artist.first_name} {artwork.artist.last_name}".strip() or artwork.artist.username,
        "title": artwork.title,
        "description": artwork.description,
        "category": artwork.category,
        "price": str(artwork.price),
        "image_data": artwork.image_data,
        "status": artwork.status,
        "decline_reason": artwork.decline_reason,
        "created_at": artwork.created_at.isoformat(),
    }


class ArtworkView(APIView):
    def get(self, request):
        user = SubmitArtistApplicationView().get_request_user(request)
        mine = request.query_params.get("mine") == "1"
        artworks = Artwork.objects.select_related("artist")
        if mine:
            if not user:
                return Response({"error": "Authentication is required."}, status=status.HTTP_401_UNAUTHORIZED)
            artworks = artworks.filter(artist=user)
        elif user and user.role == User.Role.CREATIVE_MODERATOR:
            artworks = artworks.all()
        else:
            artworks = artworks.filter(status=Artwork.Status.APPROVED)
        return Response([serialize_artwork(artwork) for artwork in artworks])

    def post(self, request):
        user = SubmitArtistApplicationView().get_request_user(request)
        if not user or user.role != User.Role.ARTIST:
            return Response({"error": "Only approved artists can submit artwork for sale."}, status=status.HTTP_403_FORBIDDEN)
        required = ["title", "description", "category", "price", "image_data"]
        missing = [field for field in required if not request.data.get(field)]
        if missing:
            return Response({"error": f"Missing required artwork fields: {', '.join(missing)}"}, status=status.HTTP_400_BAD_REQUEST)
        artwork = Artwork.objects.create(
            artist=user,
            title=request.data["title"].strip(),
            description=request.data["description"].strip(),
            category=request.data["category"].strip(),
            price=request.data["price"],
            image_data=request.data["image_data"],
        )
        ArtworkReviewLog.objects.create(artwork=artwork, actor=user, action="submitted", new_status=artwork.status)
        return Response(serialize_artwork(artwork), status=status.HTTP_201_CREATED)


class ArtworkTagSuggestionView(APIView):
    def post(self, request):
        user = SubmitArtistApplicationView().get_request_user(request)
        if not user or user.role != User.Role.ARTIST:
            return Response({"error": "Only approved artists can generate artwork tags."}, status=status.HTTP_403_FORBIDDEN)

        description = (request.data.get("description") or "").strip()
        if len(description) < 20:
            return Response({"error": "Add a more detailed description before generating tags."}, status=status.HTTP_400_BAD_REQUEST)

        try:
            return Response({"tags": generate_tags(description)})
        except RuntimeError as error:
            return Response({"error": str(error)}, status=status.HTTP_503_SERVICE_UNAVAILABLE)


class ArtworkReviewView(APIView):
    def patch(self, request, artwork_id):
        moderator = SubmitArtistApplicationView().get_request_user(request)
        if not moderator or moderator.role != User.Role.CREATIVE_MODERATOR:
            return Response({"error": "Creative Moderator access is required."}, status=status.HTTP_403_FORBIDDEN)
        review_status = request.data.get("status")
        if review_status not in {Artwork.Status.APPROVED, Artwork.Status.DECLINED}:
            return Response({"error": "Status must be approved or declined."}, status=status.HTTP_400_BAD_REQUEST)
        reason = (request.data.get("decline_reason") or "").strip()
        if review_status == Artwork.Status.DECLINED and not reason:
            return Response({"error": "A reason is required when declining artwork."}, status=status.HTTP_400_BAD_REQUEST)
        try:
            artwork = Artwork.objects.select_related("artist").get(id=artwork_id)
        except Artwork.DoesNotExist:
            return Response({"error": "Artwork not found."}, status=status.HTTP_404_NOT_FOUND)
        previous_status = artwork.status
        artwork.status = review_status
        artwork.decline_reason = reason if review_status == Artwork.Status.DECLINED else ""
        artwork.save(update_fields=["status", "decline_reason", "updated_at"])
        ArtworkReviewLog.objects.create(artwork=artwork, actor=moderator, action=review_status, previous_status=previous_status, new_status=review_status, reason=reason)
        message = "Your artwork has been approved and is now visible to buyers." if review_status == Artwork.Status.APPROVED else f"Your artwork was declined. Reason: {reason}"
        UserNotification.objects.create(user=artwork.artist, artwork=artwork, title=f"Artwork {review_status}", message=message)
        return Response(serialize_artwork(artwork))


class ArtistProfileView(APIView):
    def get(self, request, artist_id):
        try:
            artist = User.objects.get(id=artist_id, role=User.Role.ARTIST)
        except User.DoesNotExist:
            return Response({"error": "Artist not found."}, status=status.HTTP_404_NOT_FOUND)
        artworks = artist.artworks.filter(status=Artwork.Status.APPROVED)
        return Response({
            "id": artist.id,
            "name": f"{artist.first_name} {artist.last_name}".strip() or artist.username,
            "username": artist.username,
            "bio": getattr(artist.artist_application, "bio", "") or "",
            "artworks": [serialize_artwork(artwork) for artwork in artworks],
        })


class DirectMessageView(APIView):
    def get(self, request):
        user = SubmitArtistApplicationView().get_request_user(request)
        recipient_id = request.query_params.get("recipient_id")
        if not user or not recipient_id:
            return Response({"error": "Authentication and recipient_id are required."}, status=status.HTTP_400_BAD_REQUEST)
        messages = DirectMessage.objects.filter(Q(sender=user, recipient_id=recipient_id) | Q(sender_id=recipient_id, recipient=user)).select_related("sender")
        DirectMessage.objects.filter(sender_id=recipient_id, recipient=user, is_read=False).update(is_read=True)
        return Response([{"id": message.id, "sender_id": message.sender_id, "body": message.body, "created_at": message.created_at.isoformat()} for message in messages])

    def post(self, request):
        user = SubmitArtistApplicationView().get_request_user(request)
        recipient_id = request.data.get("recipient_id")
        body = (request.data.get("body") or "").strip()
        if not user or not recipient_id or not body:
            return Response({"error": "Recipient a  nd message are required."}, status=status.HTTP_400_BAD_REQUEST)
        try:
            recipient = User.objects.get(id=recipient_id, role=User.Role.ARTIST)
        except User.DoesNotExist:
            return Response({"error": "Artist not found."}, status=status.HTTP_404_NOT_FOUND)
        message = DirectMessage.objects.create(sender=user, recipient=recipient, body=body)
        return Response({"id": message.id, "sender_id": message.sender_id, "body": message.body, "created_at": message.created_at.isoformat()}, status=status.HTTP_201_CREATED)
