from django.urls import path
from .views import AgreementBlockchainProofView, ArtworkBlockchainView, PublicVerificationView, SaleBlockchainProofView

urlpatterns = [
    path("verify/", PublicVerificationView.as_view()),
    path("artworks/<int:artwork_id>/register/", ArtworkBlockchainView.as_view()),
    path("artworks/<int:artwork_id>/<str:action>/", ArtworkBlockchainView.as_view()),
    path("agreements/<int:agreement_id>/<str:action>/", AgreementBlockchainProofView.as_view()),
    path("transactions/<int:payment_id>/<str:action>/", SaleBlockchainProofView.as_view()),
]
