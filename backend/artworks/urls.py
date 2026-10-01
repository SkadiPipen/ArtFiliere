from django.urls import path

from .views import ArtworkView, ArtworkTagSuggestionView, ArtworkReviewView, ArtworkReviewsView, ArtworkSimilarityReviewView, AuctionAgreementDefaultsView

urlpatterns = [
    path('artworks/', ArtworkView.as_view(), name='artworks'),
    path('artworks/<int:artwork_id>/', ArtworkView.as_view(), name='artwork_detail'),
    path('artworks/<int:artwork_id>/reviews/', ArtworkReviewsView.as_view(), name='artwork_reviews'),
    path('artworks/suggest-tags/', ArtworkTagSuggestionView.as_view(), name='artwork_tag_suggestions'),
    path('artworks/auction-agreement-defaults/', AuctionAgreementDefaultsView.as_view(), name='auction_agreement_defaults'),
    path('artworks/<int:artwork_id>/review/', ArtworkReviewView.as_view(), name='review_artwork'),
    path('artwork-similarity/<int:match_id>/review/', ArtworkSimilarityReviewView.as_view(), name='review_artwork_similarity'),
]
