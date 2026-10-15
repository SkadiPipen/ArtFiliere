from django.urls import path
from .availability import ArtistAvailabilityView
from .lifecycle import CommissionFlowView, SubmissionFileView, PayoutProfileView, CommissionPaymentWebhook
from .reviews import CommissionReviewsView
from .resale import CommissionResaleView
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
    path('assets/<int:asset_id>/resale/', CommissionResaleView.as_view()),
    path('reviews/', CommissionReviewsView.as_view()),
    path('reviews/<int:pk>/', CommissionReviewsView.as_view()),
    path('flow/<int:pk>/', CommissionFlowView.as_view()),
    path('flow/<int:pk>/files/<int:submission_id>/', SubmissionFileView.as_view()),
    path('payout-profile/', PayoutProfileView.as_view()),
    path('payments/webhook/', CommissionPaymentWebhook.as_view()),
    path('artists/<int:artist_id>/availability/', ArtistAvailabilityView.as_view()),
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
