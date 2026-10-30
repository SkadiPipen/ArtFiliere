from django.urls import path

from .views import UserNotificationView
from .admin_requests import AdminRequestNotificationsView

urlpatterns = [
    path('admin/request-notifications/', AdminRequestNotificationsView.as_view()),
    path('notifications/', UserNotificationView.as_view(), name='user_notifications'),
]
