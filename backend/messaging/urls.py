from django.urls import path

from .views import DirectMessageView, ConversationView, ConversationMessageView, AgreementView, AgreementTemplateAdminView

urlpatterns = [
    path('messages/', DirectMessageView.as_view(), name='direct_messages'),
    path('conversations/', ConversationView.as_view()),
    path('conversations/<int:conversation_id>/', ConversationView.as_view()),
    path('conversations/<int:conversation_id>/messages/', ConversationMessageView.as_view()),
    path('conversations/<int:conversation_id>/agreements/', AgreementView.as_view()),
    path('agreements/<int:agreement_id>/', AgreementView.as_view()),
    path('admin/agreement-templates/', AgreementTemplateAdminView.as_view()),
]
