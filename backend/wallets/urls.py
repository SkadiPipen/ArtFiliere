from django.urls import path

from .views import AgreementCheckoutView, ActivityHistoryView, ArtworkCheckoutView, CancellationReturnRequestView, PlatformAdminRequestView, PlatformAdminUserView, WalletView, PlatformAdminWalletView, xendit_payment_session_webhook

urlpatterns = [
    path("wallet/", WalletView.as_view(), name="wallet"),
    path("checkout/artworks/<int:artwork_id>/", ArtworkCheckoutView.as_view(), name="artwork_checkout"),
    path("checkout/agreements/<int:agreement_id>/", AgreementCheckoutView.as_view(), name="agreement_checkout"),
    path("activity/", ActivityHistoryView.as_view(), name="activity_history"),
    path("transactions/requests/", CancellationReturnRequestView.as_view(), name="cancellation_return_requests"),
    path("transactions/<int:payment_id>/requests/", CancellationReturnRequestView.as_view(), name="cancellation_return_request"),
    path("admin/wallet/", PlatformAdminWalletView.as_view(), name="platform_admin_wallet"),
    path("admin/wallet/payments/<int:payment_id>/", PlatformAdminWalletView.as_view(), name="platform_admin_wallet_payment"),
    path("admin/requests/", PlatformAdminRequestView.as_view(), name="platform_admin_requests"),
    path("admin/requests/<int:request_id>/", PlatformAdminRequestView.as_view(), name="platform_admin_request"),
    path("admin/users/", PlatformAdminUserView.as_view(), name="platform_admin_users"),
    path("admin/users/<int:user_id>/", PlatformAdminUserView.as_view(), name="platform_admin_user"),
    path("webhooks/xendit/payment-session/", xendit_payment_session_webhook, name="xendit_payment_session_webhook"),

    #Added aliases
    path("activities/", ActivityHistoryView.as_view(), name="activities_history_slash"),
    path("activites", ActivityHistoryView.as_view(), name="activity_history"),
]
