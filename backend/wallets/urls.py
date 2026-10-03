from django.urls import path
from .auction_delivery import AuctionDeliveryQuoteView
from .management import ReportUserSearchView
from .management import ManagementView, ReportsView, AccountActionsView, TransactionRequestsView, FinancialAuthorizationsView, ReportAttachmentView

from .views import PaymentStatusView, AgreementCheckoutView, ActivityHistoryView, ArtworkCheckoutView, CancellationReturnRequestView, PlatformAdminRequestView, PlatformAdminUserView, WalletView, PlatformAdminWalletView, xendit_payment_session_webhook

urlpatterns = [
    path('management/', ManagementView.as_view()),
    path('management/report-users/', ReportUserSearchView.as_view()),
    path('management/financial-authorizations/', FinancialAuthorizationsView.as_view()),
    path('management/reports/', ReportsView.as_view()),
    path('management/attachments/<int:attachment_id>/', ReportAttachmentView.as_view()),
    path('management/reports/<int:report_id>/', ReportsView.as_view()),
    path('management/account-actions/', AccountActionsView.as_view()),
    path('management/account-actions/<int:action_id>/', AccountActionsView.as_view()),
    path('transactions/requests/<int:request_id>/respond/', TransactionRequestsView.as_view()),
    path('checkout/agreements/<int:agreement_id>/delivery/', AuctionDeliveryQuoteView.as_view()),
    path("payments/<int:payment_id>/refresh/", PaymentStatusView.as_view()),
    path("wallet/", WalletView.as_view(), name="wallet"),
    path("checkout/artworks/<int:artwork_id>/", ArtworkCheckoutView.as_view(), name="artwork_checkout"),
    path("checkout/agreements/<int:agreement_id>/", AgreementCheckoutView.as_view(), name="agreement_checkout"),
    path("activity/", ActivityHistoryView.as_view(), name="activity_history"),
    path("transactions/requests/", TransactionRequestsView.as_view(), name="cancellation_return_requests"),
    path("transactions/<int:payment_id>/requests/", TransactionRequestsView.as_view(), name="cancellation_return_request"),
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
