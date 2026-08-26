from django.urls import path

from .views import SubmitArtistApplicationView, ArtistApplicationLogView

urlpatterns = [
    path('artist-applications/', SubmitArtistApplicationView.as_view(), name='submit_artist_application'),
    path('artist-applications/<int:application_id>/', SubmitArtistApplicationView.as_view(), name='review_artist_application'),
    path('artist-application-logs/', ArtistApplicationLogView.as_view(), name='artist_application_logs'),
]
