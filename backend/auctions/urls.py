from django.urls import path
from . import views

urlpatterns = [
    path('dashboard/', views.AuctionDashboardView.as_view(), name='auction-dashboard'),
    path('<int:pk>/', views.AuctionDetailView.as_view(), name='auction-detail'),
    path('<int:pk>/bid/', views.PlaceBidView.as_view(), name='place-bid'),
    path('<int:pk>/settle/', views.SettleAuctionView.as_view(), name='settle-auction'),
]