from django.urls import path

from .views import ArtistProfileView

urlpatterns = [
    path('artists/<int:artist_id>/', ArtistProfileView.as_view(), name='artist_profile'),
]
