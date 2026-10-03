from django.urls import path
from .management import TransactionRequestsView
from .support import SupportView
from .moderation import AccountModerationView, ModeratorUsersView, TicketReturnReviewView

from .views import PaymentStatusView, AgreementCheckoutView, ActivityHistoryView, ArtworkCheckoutView, CancellationReturnRequestView, CustomerSupportRequestView, PlatformAdminRequestView, PlatformAdminUserView, WalletView, PlatformAdminWalletView, xendit_payment_session_webhook

urlpatterns = [
    path('admin/requests/', PlatformAdminRequestView.as_view(), name='platform_admin_requests'),
    path('admin/requests/<int:request_id>/', PlatformAdminRequestView.as_view(), name='platform_admin_request'),
    path('moderation/account-actions/', AccountModerationView.as_view()),
    path('moderation/account-actions/<int:action_id>/', AccountModerationView.as_view()),
    path('moderation/users/', ModeratorUsersView.as_view()),
    path('moderation/tickets/<int:ticket_id>/return-review/', TicketReturnReviewView.as_view()),
    path('support/catalog/', SupportView.as_view(), {'action': 'catalog'}),
    path('support/agents/', SupportView.as_view(), {'action': 'agents'}),
    path('support/accounts/', SupportView.as_view(), {'action': 'accounts'}),
    path('support/references/', SupportView.as_view(), {'action': 'references'}),
    path('support/tickets/', SupportView.as_view()),
    path('support/tickets/<int:ticket_id>/', SupportView.as_view()),
    path('support/tickets/<int:ticket_id>/reported-profile/', SupportView.as_view(), {'action': 'reported-profile'}),
    path("payments/<int:payment_id>/refresh/", PaymentStatusView.as_view()),
    path("wallet/", WalletView.as_view(), name="wallet"),
    path("checkout/artworks/<int:artwork_id>/", ArtworkCheckoutView.as_view(), name="artwork_checkout"),
    path("checkout/agreements/<int:agreement_id>/", AgreementCheckoutView.as_view(), name="agreement_checkout"),
    path("activity/", ActivityHistoryView.as_view(), name="activity_history"),
    path("transactions/requests/", TransactionRequestsView.as_view(), name="cancellation_return_requests"),
    path("transactions/<int:payment_id>/requests/", TransactionRequestsView.as_view(), name="cancellation_return_request"),
    path("admin/wallet/", PlatformAdminWalletView.as_view(), name="platform_admin_wallet"),
    path("admin/wallet/payments/<int:payment_id>/", PlatformAdminWalletView.as_view(), name="platform_admin_wallet_payment"),
    path("moderation/returns/", CustomerSupportRequestView.as_view(), name="moderator_return_requests"),
    path("moderation/returns/<int:request_id>/", CustomerSupportRequestView.as_view(), name="moderator_return_request"),
    path("admin/users/", PlatformAdminUserView.as_view(), name="platform_admin_users"),
    path("admin/users/<int:user_id>/", PlatformAdminUserView.as_view(), name="platform_admin_user"),
    path("webhooks/xendit/payment-session/", xendit_payment_session_webhook, name="xendit_payment_session_webhook"),

    #Added aliases
    path("activities/", ActivityHistoryView.as_view(), name="activities_history_slash"),
    path("activites", ActivityHistoryView.as_view(), name="activity_history"),
]
