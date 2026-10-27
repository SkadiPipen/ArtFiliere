from .royalty_funding import RoyaltyCheckoutView, RoyaltyAdminReviewView
from django.urls import path

from .views import DirectMessageView, ConversationView, ConversationMessageView, AgreementView, AgreementTemplateAdminView

from .contracts import ContractsView, ContractDecisionView, ContractReadView

from .signing import AgreementSigningView

from .royalties import RoyaltyReportsView, RoyaltyEvidenceView
from .royalty_payments import RoyaltyMandateView, royalty_payment_webhook

urlpatterns = [
    path('royalties/admin/reports/', RoyaltyAdminReviewView.as_view()),
    path('royalties/admin/reports/<int:period_id>/', RoyaltyAdminReviewView.as_view()),
    path('royalties/periods/<int:period_id>/payment/', RoyaltyCheckoutView.as_view()),
    path('royalties/', RoyaltyReportsView.as_view()),
    path('royalties/periods/<int:period_id>/', RoyaltyReportsView.as_view()),
    path('royalties/periods/<int:period_id>/evidence/<int:index>/', RoyaltyEvidenceView.as_view()),
    path('royalties/agreements/<int:agreement_id>/mandate/', RoyaltyMandateView.as_view()),
    path('royalties/webhook/', royalty_payment_webhook),
    path('contracts/read/', ContractReadView.as_view()),
    path("contracts/<int:agreement_id>/sign/", AgreementSigningView.as_view()),
    path("contracts/<int:agreement_id>/pdf/", AgreementSigningView.as_view(), {"pdf": True}),
    path("contracts/", ContractsView.as_view()),
    path("contracts/artworks/<int:artwork_id>/", ContractsView.as_view()),
    path("contracts/<int:agreement_id>/", ContractDecisionView.as_view()),
    path('messages/', DirectMessageView.as_view(), name='direct_messages'),
    path('conversations/', ConversationView.as_view()),
    path('conversations/<int:conversation_id>/', ConversationView.as_view()),
    path('conversations/<int:conversation_id>/messages/', ConversationMessageView.as_view()),
    path('conversations/<int:conversation_id>/agreements/', AgreementView.as_view()),
    path('agreements/<int:agreement_id>/', AgreementView.as_view()),
    path('admin/agreement-templates/', AgreementTemplateAdminView.as_view()),
]
