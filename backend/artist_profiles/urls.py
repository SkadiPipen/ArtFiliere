from django.urls import path

from .views import ArtistDirectoryView, ArtistProfileView

urlpatterns = [
    path('artists/', ArtistDirectoryView.as_view(), name='artist_directory'),
    path('artists/<int:artist_id>/', ArtistProfileView.as_view(), name='artist_profile'),
]
