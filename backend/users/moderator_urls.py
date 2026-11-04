from django.urls import path
from .moderators import ModeratorApplicationsView, ModeratorApplicationDetail, ModeratorDocumentView, DriverAccountView

urlpatterns = [
    path('driver-applications/', ModeratorApplicationsView.as_view(kind='driver')),
    path('driver-applications/<int:application_id>/', ModeratorApplicationDetail.as_view(kind='driver')),
    path('driver-applications/<int:application_id>/documents/<int:index>/', ModeratorDocumentView.as_view(kind='driver')),
    path('driver-accounts/<int:user_id>/', DriverAccountView.as_view()),
    path('moderator-applications/', ModeratorApplicationsView.as_view()),
    path('moderator-applications/<int:application_id>/', ModeratorApplicationDetail.as_view()),
    path('moderator-applications/<int:application_id>/documents/<int:index>/', ModeratorDocumentView.as_view()),
]
