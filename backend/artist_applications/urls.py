from django.urls import path

from .views import SubmitArtistApplicationView, ArtistApplicationLogView, PortfolioMatchPreviewView, PortfolioTagSuggestionView
from .deadlines import AdminDeadlinesView
from .driver_renewals import AdminDriverLicenseRenewalView, DriverLicenseRenewalView
from .sworn_renewals import AdminSwornRenewalView, ArtistSwornRenewalView

urlpatterns = [
    path('driver-license-renewals/', DriverLicenseRenewalView.as_view()),
    path('admin/driver-license-renewals/', AdminDriverLicenseRenewalView.as_view()),
    path('admin/driver-license-renewals/<int:renewal_id>/', AdminDriverLicenseRenewalView.as_view()),
    path('sworn-declaration-renewals/', ArtistSwornRenewalView.as_view()),
    path('admin/deadlines/', AdminDeadlinesView.as_view()),
    path('admin/sworn-declaration-renewals/', AdminSwornRenewalView.as_view()),
    path('admin/sworn-declaration-renewals/<int:renewal_id>/', AdminSwornRenewalView.as_view()),
    path('artist-applications/', SubmitArtistApplicationView.as_view(), name='submit_artist_application'),
    path('artist-applications/suggest-tags/', PortfolioTagSuggestionView.as_view()),
    path('artist-applications/<int:application_id>/portfolio-match/<int:sample_index>/<int:match_index>/', PortfolioMatchPreviewView.as_view()),
    path('artist-applications/<int:application_id>/', SubmitArtistApplicationView.as_view(), name='review_artist_application'),
    path('artist-application-logs/', ArtistApplicationLogView.as_view(), name='artist_application_logs'),
]
