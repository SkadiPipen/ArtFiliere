from django.urls import path
from .views import AgreementBlockchainProofView, ArtworkBlockchainView, PublicVerificationView, SaleBlockchainProofView
from .provenance_views import ProvenanceView, ProvenanceResaleView, ProvenanceReviewView, ProvenanceRetryView, FileIntegrityView, ProvenanceReviewQueueView, ProvenanceOriginalView

urlpatterns = [
    path('artworks/<int:artwork_id>/original/', ProvenanceOriginalView.as_view()),
    path('records/<uuid:artwork_id>/original/', ProvenanceOriginalView.as_view()),
    path('attribution-reviews/', ProvenanceReviewQueueView.as_view()),
    path('records/<uuid:artwork_id>/reconcile/', ProvenanceRetryView.as_view()),
    path('artworks/<int:artwork_id>/integrity/', FileIntegrityView.as_view()),
    path('records/<uuid:artwork_id>/integrity/', FileIntegrityView.as_view()),
    path('records/<uuid:artwork_id>/provenance/', ProvenanceView.as_view()),
    path('records/<uuid:artwork_id>/attribution-reviews/', ProvenanceReviewView.as_view()),
    path('artworks/<int:artwork_id>/provenance/', ProvenanceView.as_view()),
    path('artworks/<int:artwork_id>/resale/', ProvenanceResaleView.as_view()),
    path('artworks/<int:artwork_id>/attribution-reviews/', ProvenanceReviewView.as_view()),
    path('artworks/<int:artwork_id>/reconcile/', ProvenanceRetryView.as_view()),
    path("verify/", PublicVerificationView.as_view()),
    path("artworks/<int:artwork_id>/register/", ArtworkBlockchainView.as_view()),
    path("artworks/<int:artwork_id>/<str:action>/", ArtworkBlockchainView.as_view()),
    path("agreements/<int:agreement_id>/<str:action>/", AgreementBlockchainProofView.as_view()),
    path("transactions/<int:payment_id>/<str:action>/", SaleBlockchainProofView.as_view()),
]
