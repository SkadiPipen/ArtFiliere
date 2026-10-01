from django.urls import path
from . import views

urlpatterns = [
    path('dashboard/', views.AuctionDashboardView.as_view(), name='auction-dashboard'),
    path('<int:pk>/', views.AuctionDetailView.as_view(), name='auction-detail'),
    path('<int:pk>/bid/', views.PlaceBidView.as_view(), name='place-bid'),
    path('<int:pk>/settle/', views.SettleAuctionView.as_view(), name='settle-auction'),
    path('<int:pk>/forfeit-winner/', views.ForfeitWinnerView.as_view(), name='forfeit-auction-winner'),
    path('<int:pk>/backup-offer/accept/', views.AcceptRunnerUpOfferView.as_view(), name='accept-auction-backup-offer'),
]
