from django.urls import path

from .views import ArtistDirectoryView, ArtistProfileView, MyPortfolioView

urlpatterns = [
    path('portfolio/', MyPortfolioView.as_view(), name='my_portfolio'),
    path('artists/', ArtistDirectoryView.as_view(), name='artist_directory'),
    path('artists/by-username/<str:username>/', ArtistProfileView.as_view(), name='artist_profile_username'),
    path('artists/<int:artist_id>/', ArtistProfileView.as_view(), name='artist_profile'),
]
