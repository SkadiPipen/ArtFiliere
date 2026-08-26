from django.db.models import Q
from rest_framework.response import Response
from rest_framework import status

from authentication.views import AuthenticatedAPIView
from authentication.permissions import IsAuthenticatedUser
from users.models import User
from .models import DirectMessage


class DirectMessageView(AuthenticatedAPIView):
    permission_classes = [IsAuthenticatedUser]

    def get(self, request):
        user = self.get_request_user(request)
        recipient_id = request.query_params.get("recipient_id")
        if not recipient_id:
            return Response(
                {"error": "recipient_id is required."}, status=status.HTTP_400_BAD_REQUEST
            )

        messages = DirectMessage.objects.filter(
            Q(sender=user, recipient_id=recipient_id)
            | Q(sender_id=recipient_id, recipient=user)
        ).select_related("sender")

        DirectMessage.objects.filter(
            sender_id=recipient_id, recipient=user, is_read=False
        ).update(is_read=True)

        return Response(
            [
                {
                    "id": message.id,
                    "sender_id": message.sender_id,
                    "body": message.body,
                    "created_at": message.created_at.isoformat(),
                }
                for message in messages
            ]
        )

    def post(self, request):
        user = self.get_request_user(request)
        recipient_id = request.data.get("recipient_id")
        body = (request.data.get("body") or "").strip()

        if not recipient_id or not body:
            return Response(
                {"error": "Recipient and message are required."},
                status=status.HTTP_400_BAD_REQUEST,
            )

        try:
            recipient = User.objects.get(id=recipient_id, role=User.Role.ARTIST)
        except User.DoesNotExist:
            return Response({"error": "Artist not found."}, status=status.HTTP_404_NOT_FOUND)

        message = DirectMessage.objects.create(sender=user, recipient=recipient, body=body)
        return Response(
            {
                "id": message.id,
                "sender_id": message.sender_id,
                "body": message.body,
                "created_at": message.created_at.isoformat(),
            },
            status=status.HTTP_201_CREATED,
        )
