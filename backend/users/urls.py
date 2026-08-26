from django.urls import path
from .views import ArtistProfileView, ArtworkReviewView, ArtworkView, ArtworkTagSuggestionView, DirectMessageView, ArtistApplicationLogView, SubmitArtistApplicationView, UserNotificationView

urlpatterns = [
    path('artist-applications/', SubmitArtistApplicationView.as_view(), name='submit_artist_application'),
    path('artist-applications/<int:application_id>/', SubmitArtistApplicationView.as_view(), name='review_artist_application'),
    path('artist-application-logs/', ArtistApplicationLogView.as_view(), name='artist_application_logs'),
    path('notifications/', UserNotificationView.as_view(), name='user_notifications'),
    path('artworks/', ArtworkView.as_view(), name='artworks'),
    path('artworks/suggest-tags/', ArtworkTagSuggestionView.as_view(), name='artwork_tag_suggestions'),
    path('artworks/<int:artwork_id>/review/', ArtworkReviewView.as_view(), name='review_artwork'),
    path('artists/<int:artist_id>/', ArtistProfileView.as_view(), name='artist_profile'),
    path('messages/', DirectMessageView.as_view(), name='direct_messages'),
]
