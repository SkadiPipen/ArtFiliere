from django.urls import path

from .views import ArtworkCheckoutView, WalletView, PlatformAdminWalletView, xendit_payment_session_webhook

urlpatterns = [
    path("wallet/", WalletView.as_view(), name="wallet"),
    path("checkout/artworks/<int:artwork_id>/", ArtworkCheckoutView.as_view(), name="artwork_checkout"),
    path("admin/wallet/", PlatformAdminWalletView.as_view(), name="platform_admin_wallet"),
    path("admin/wallet/payments/<int:payment_id>/", PlatformAdminWalletView.as_view(), name="platform_admin_wallet_payment"),
    path("webhooks/xendit/payment-session/", xendit_payment_session_webhook, name="xendit_payment_session_webhook"),
]
