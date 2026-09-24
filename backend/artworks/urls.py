from django.urls import path

from .views import ArtworkView, ArtworkTagSuggestionView, ArtworkReviewView, ArtworkSimilarityReviewView

urlpatterns = [
    path('artworks/', ArtworkView.as_view(), name='artworks'),
    path('artworks/<int:artwork_id>/', ArtworkView.as_view(), name='artwork_detail'),
    path('artworks/suggest-tags/', ArtworkTagSuggestionView.as_view(), name='artwork_tag_suggestions'),
    path('artworks/<int:artwork_id>/review/', ArtworkReviewView.as_view(), name='review_artwork'),
    path('artwork-similarity/<int:match_id>/review/', ArtworkSimilarityReviewView.as_view(), name='review_artwork_similarity'),
]
