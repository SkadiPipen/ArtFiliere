from django.urls import path
from . import views

urlpatterns = [
    path('orders/pending/', views.get_pending_orders, name='pending-orders'),
    path('orders/accept/<int:order_id>/', views.accept_order, name='accept-order'),
    path('rider/location/', views.update_rider_location, name='update-location'),
    path('orders/<int:order_id>/status/', views.update_order_status, name='update-order-status'),
    path('orders/active/', views.get_active_delivery, name='get-active-delivery'),
    path('orders/history/', views.RiderDeliveryHistoryView.as_view(), name='rider-order-history'),
    path('orders/<int:order_id>/proof/', views.OrderProofUploadView.as_view(), name='order-proof'),
    path('rider/profile/', views.RiderProfileView.as_view(), name='rider-profile'),
]