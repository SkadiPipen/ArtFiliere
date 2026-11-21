from django.urls import path

from .views import SubmitArtistApplicationView, ArtistApplicationLogView
from .deadlines import AdminDeadlinesView
from .sworn_renewals import AdminSwornRenewalView, ArtistSwornRenewalView

urlpatterns = [
    path('sworn-declaration-renewals/', ArtistSwornRenewalView.as_view()),
    path('admin/deadlines/', AdminDeadlinesView.as_view()),
    path('admin/sworn-declaration-renewals/', AdminSwornRenewalView.as_view()),
    path('admin/sworn-declaration-renewals/<int:renewal_id>/', AdminSwornRenewalView.as_view()),
    path('artist-applications/', SubmitArtistApplicationView.as_view(), name='submit_artist_application'),
    path('artist-applications/<int:application_id>/', SubmitArtistApplicationView.as_view(), name='review_artist_application'),
    path('artist-application-logs/', ArtistApplicationLogView.as_view(), name='artist_application_logs'),
]
