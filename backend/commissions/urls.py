from django.urls import path
from .workspace import CommissionWorkspaceView, CommissionAccessReviewView
from .views import (
    CommissionRequestView,
    ManageCommissionStatusView,
    PayMilestoneView,
    ProcessTrackView,
    CancelCommissionView,
    XenditMilestoneWebhookView,
    VerifyMilestonePaymentView,
)

urlpatterns = [
    path('workspace/', CommissionWorkspaceView.as_view()),
    path('workspace/<int:pk>/', CommissionWorkspaceView.as_view()),
    path('access-reviews/', CommissionAccessReviewView.as_view()),
    path('access-reviews/<int:pk>/', CommissionAccessReviewView.as_view()),
    path('request/', CommissionRequestView.as_view(), name='create-commission'),
    path('requests/', CommissionRequestView.as_view(), name='commission-requests'),
    path('requests/<int:pk>/manage/', ManageCommissionStatusView.as_view(), name='manage-commission'),
    path('requests/<int:pk>/cancel/', CancelCommissionView.as_view(), name='cancel-commission'),
    path('milestones/<int:milestone_id>/pay/', PayMilestoneView.as_view(), name='pay-milestone'),
    path('milestones/<int:milestone_id>/verify/', VerifyMilestonePaymentView.as_view(), name='verify-milestone'),
    path('xendit/webhook/', XenditMilestoneWebhookView.as_view(), name='xendit-milestone-webhook'),
    path('requests/<int:pk>/track/', ProcessTrackView.as_view(), name='process-track'),
]
