from django.urls import path
from .resellers import ResellerApplicationView, ResellerReviewsView, ResellerDocumentView

urlpatterns = [
    path('reseller/application/', ResellerApplicationView.as_view()),
    path('reseller/reviews/', ResellerReviewsView.as_view()),
    path('reseller/reviews/<int:application_id>/', ResellerReviewsView.as_view()),
    path('reseller/applications/<int:application_id>/documents/<str:document>/', ResellerDocumentView.as_view()),
]
