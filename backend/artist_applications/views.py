from rest_framework.response import Response
from rest_framework import status
from rest_framework.permissions import AllowAny

from authentication.views import AuthenticatedAPIView
from authentication.permissions import IsHR
from users.models import User
from .models import ArtistApplication, ArtistApplicationLog


def submitted_document(value, fallback_name):
    """Return a safe, reviewable document payload from a submitted value."""
    if isinstance(value, dict):
        return str(value.get("data_uri") or ""), str(value.get("name") or fallback_name)
    return str(value or ""), fallback_name


def document_response(data_uri, name, fallback_name):
    return {
        "name": name or fallback_name,
        "data_uri": data_uri if str(data_uri).startswith("data:") else "",
        "available": str(data_uri).startswith("data:"),
    }


class SubmitArtistApplicationView(AuthenticatedAPIView):
    def get_permissions(self):
        if self.request.method == "POST":
            return [AllowAny()]
        return [IsHR()]

    def get(self, request):
        applications = ArtistApplication.objects.select_related("user").order_by(
            "-submitted_at"
        )
        return Response(
            [
                {
                    "id": application.id,
                    "artist_name": f"{application.user.first_name} {application.user.last_name}".strip()
                    or application.user.username,
                    "email": application.user.email,
                    "hourly_rate": str(application.hourly_rate),
                    "bio": application.bio or "",
                    "portfolio": application.portfolio,
                    "bir_certificate": document_response(application.bir_certificate, application.bir_certificate_name, "BIR Certificate"),
                    "sworn_declaration": document_response(application.sworn_declaration, application.sworn_declaration_name, "Sworn Declaration"),
                    "status": application.status,
                    "submitted_at": application.submitted_at.isoformat(),
                }
                for application in applications
            ]
        )

    def post(self, request):
        firebase_uid = request.data.get("firebase_uid")
        hourly_rate = request.data.get("hourly_rate")
        tin_number = request.data.get("tinNum", "").replace("-", "")
        bir_certificate, bir_certificate_name = submitted_document(
            request.data.get("birCertificate"), "BIR Certificate"
        )
        sworn_declaration, sworn_declaration_name = submitted_document(
            request.data.get("swornDeclaration"), "Sworn Declaration"
        )
        portfolio = request.data.get("portfolio", [])

        if not firebase_uid:
            return Response(
                {"error": "User identification is required."},
                status=status.HTTP_400_BAD_REQUEST,
            )

        if not all([hourly_rate, tin_number, bir_certificate, sworn_declaration]):
            return Response(
                {"error": "Please complete all required artist registration fields."},
                status=status.HTTP_400_BAD_REQUEST,
            )

        max_document_size = 7 * 1024 * 1024
        if len(bir_certificate) > max_document_size or len(sworn_declaration) > max_document_size:
            return Response(
                {"error": "Each submitted document must be 5 MB or smaller."},
                status=status.HTTP_400_BAD_REQUEST,
            )

        if not tin_number.isdigit() or len(tin_number) != 9:
            return Response(
                {"error": "Enter a valid 9-digit TIN."}, status=status.HTTP_400_BAD_REQUEST
            )

        if not isinstance(portfolio, list) or not portfolio:
            return Response(
                {"error": "Add at least one artwork to your portfolio."},
                status=status.HTTP_400_BAD_REQUEST,
            )

        try:
            user = User.objects.get(firebase_uid=firebase_uid)
        except User.DoesNotExist:
            return Response(
                {"error": "User not found in database."}, status=status.HTTP_404_NOT_FOUND
            )

        previous_application = ArtistApplication.objects.filter(user=user).only("status").first()

        application, created = ArtistApplication.objects.update_or_create(
            user=user,
            defaults={
                "hourly_rate": hourly_rate,
                "tin_number": tin_number,
                "bio": request.data.get("bio"),
                "bir_certificate": bir_certificate,
                "bir_certificate_name": bir_certificate_name,
                "sworn_declaration": sworn_declaration,
                "sworn_declaration_name": sworn_declaration_name,
                "portfolio": portfolio,
                "status": ArtistApplication.ApprovalStatus.PENDING,
            },
        )

        ArtistApplicationLog.objects.create(
            application=application,
            actor=user,
            action=ArtistApplicationLog.Action.SUBMITTED,
            previous_status="" if created else previous_application.status,
            new_status=application.status,
        )

        return Response(
            {"message": "Application submitted successfully.", "status": application.status},
            status=status.HTTP_201_CREATED,
        )

    def patch(self, request, application_id):
        user = self.get_request_user(request)

        review_status = request.data.get("status")
        valid_statuses = {
            ArtistApplication.ApprovalStatus.APPROVED,
            ArtistApplication.ApprovalStatus.REJECTED,
        }
        if review_status not in valid_statuses:
            return Response(
                {"error": "Status must be approved or rejected."},
                status=status.HTTP_400_BAD_REQUEST,
            )

        rejection_reason = (request.data.get("rejection_reason") or "").strip()
        if (
            review_status == ArtistApplication.ApprovalStatus.REJECTED
            and not rejection_reason
        ):
            return Response(
                {"error": "A reason is required when rejecting an application."},
                status=status.HTTP_400_BAD_REQUEST,
            )

        try:
            application = ArtistApplication.objects.select_related("user").get(
                id=application_id
            )
        except ArtistApplication.DoesNotExist:
            return Response(
                {"error": "Artist application not found."}, status=status.HTTP_404_NOT_FOUND
            )

        previous_status = application.status
        application.status = review_status
        application.rejection_reason = (
            rejection_reason
            if review_status == ArtistApplication.ApprovalStatus.REJECTED
            else ""
        )
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
            notification_message = (
                "Your artist registration request has been approved. "
                "You can now use artist features."
            )
        else:
            notification_title = "Artist application rejected"
            notification_message = (
                f"Your artist registration request was rejected. Reason: {rejection_reason}"
            )

        # Local import avoids a circular import between artist_applications and notifications
        from notifications.models import UserNotification

        UserNotification.objects.create(
            user=application.user,
            application=application,
            title=notification_title,
            message=notification_message,
        )

        return Response({"id": application.id, "status": application.status})


class ArtistApplicationLogView(AuthenticatedAPIView):
    permission_classes = [IsHR]

    def get(self, request):
        logs = ArtistApplicationLog.objects.select_related(
            "application__user", "actor"
        )[:100]
        return Response(
            [
                {
                    "id": log.id,
                    "action": log.action,
                    "previous_status": log.previous_status,
                    "new_status": log.new_status,
                    "reason": log.reason,
                    "artist_name": f"{log.application.user.first_name} {log.application.user.last_name}".strip()
                    or log.application.user.username,
                    "actor_name": (
                        f"{log.actor.first_name} {log.actor.last_name}".strip()
                        or log.actor.username
                    )
                    if log.actor
                    else "Deleted user",
                    "created_at": log.created_at.isoformat(),
                }
                for log in logs
            ]
        )
