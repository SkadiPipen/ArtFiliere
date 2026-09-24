from django.urls import path
from .views import (
    CommissionRequestView,
    ManageCommissionStatusView,
    PayMilestoneView,
    ProcessTrackView
)

CreateCommissionRequestView = CommissionRequestView

urlpatterns = [
    path('request/', CommissionRequestView.as_view(), name='create-commission'),
    path('requests/', CommissionRequestView.as_view(), name='commission-requests'),
    path('requests/<int:pk>/manage/', ManageCommissionStatusView.as_view(), name='manage-commission'),
    path('milestones/<int:milestone_id>/pay/', PayMilestoneView.as_view(), name='pay-milestone'),
    path('requests/<int:pk>/track/', ProcessTrackView.as_view(), name='process-track'),
]