from django.urls import path
from . import views

urlpatterns = [
    path('quote/', views.get_delivery_quote, name='delivery-quote'),
    path('orders/pending/', views.get_pending_orders, name='pending-orders'),
    
    path('orders/accept/<int:order_id>/', views.accept_order, name='accept-order'),
    path('orders/<int:order_id>/accept/', views.accept_order, name='accept-order-alt'),

    path('orders/active/', views.get_active_delivery, name='get-active-delivery'),
    path('orders/<int:order_id>/', views.get_order_by_id, name='delivery-detail'),
    path('orders/<int:order_id>/status/', views.update_order_status, name='update-order-status'),
    path('orders/<int:order_id>/status', views.update_order_status),
    path('orders/<int:order_id>/proof/', views.OrderProofUploadView.as_view(), name='order-proof'),
    
    path('rider/location/', views.update_rider_location, name='update-location'),
    path('rider/profile/', views.RiderProfileView.as_view(), name='rider-profile'),
    path('orders/history/', views.RiderDeliveryHistoryView.as_view(), name='rider-order-history'),
]



