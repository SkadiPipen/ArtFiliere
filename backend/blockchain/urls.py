from django.urls import path
from .views import ArtworkBlockchainView
urlpatterns = [path("artworks/<int:artwork_id>/register/", ArtworkBlockchainView.as_view()), path("artworks/<int:artwork_id>/<str:action>/", ArtworkBlockchainView.as_view())]
