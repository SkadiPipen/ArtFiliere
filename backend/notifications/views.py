from rest_framework.response import Response

from authentication.views import AuthenticatedAPIView
from authentication.permissions import IsAuthenticatedUser


class UserNotificationView(AuthenticatedAPIView):
    permission_classes = [IsAuthenticatedUser]

    def get(self, request):
        user = self.get_request_user(request)
        notifications = user.notifications.all()[:50]
        return Response(
            {
                "unread_count": user.notifications.filter(is_read=False).count(),
                "notifications": [
                    {
                        "id": notification.id,
                        "title": notification.title,
                        "message": notification.message,
                        "is_read": notification.is_read,
                        "commission_id": notification.commission_id,
                        "created_at": notification.created_at.isoformat(),
                    }
                    for notification in notifications
                ],
            }
        )

    def patch(self, request):
        user = self.get_request_user(request)
        notification_id = request.data.get("notification_id")
        notifications = user.notifications.filter(is_read=False)
        if request.data.get("commission_only"):
            notifications = notifications.filter(commission__isnull=False)
        if notification_id:
            notifications = notifications.filter(id=notification_id)
        notifications.update(is_read=True)
        return Response({"message": "Notifications marked as read."})
