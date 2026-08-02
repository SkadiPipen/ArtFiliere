from django.urls import path
from .views import SubmitArtistApplicationView

urlpatterns = [
    path('artist-applications/', SubmitArtistApplicationView.as_view(), name='submit_artist_application'),
]