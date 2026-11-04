from django.urls import path
from .resellers import ResellerApplicationView, ResellerReviewsView, ResellerDocumentView

from .management import UserManagementView

urlpatterns = [
    path('users/management/', UserManagementView.as_view()),
    path('users/management/<int:user_id>/', UserManagementView.as_view()),
    path('reseller/application/', ResellerApplicationView.as_view()),
    path('reseller/reviews/', ResellerReviewsView.as_view()),
    path('reseller/reviews/<int:application_id>/', ResellerReviewsView.as_view()),
    path('reseller/applications/<int:application_id>/documents/<str:document>/', ResellerDocumentView.as_view()),
]
