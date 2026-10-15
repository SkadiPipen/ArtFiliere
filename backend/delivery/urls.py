from django.urls import path
from . import views
from fulfillment.riders import RiderOrdersView, RiderProfileView, RiderProofView, RiderLocationView

urlpatterns = [
    path('verified/orders/pending/', RiderOrdersView.as_view(), {'scope': 'pending'}),
    path('verified/orders/active/', RiderOrdersView.as_view(), {'scope': 'active'}),
    path('verified/orders/history/', RiderOrdersView.as_view(), {'scope': 'history'}),
    path('verified/orders/<int:order_id>/', RiderOrdersView.as_view()),
    path('verified/orders/accept/<int:order_id>/', RiderOrdersView.as_view(), {'action': 'accept'}),
    path('verified/orders/<int:order_id>/status/', RiderOrdersView.as_view()),
    path('verified/orders/<int:order_id>/proof/', RiderProofView.as_view()),
    path('verified/rider/profile/', RiderProfileView.as_view()),
    path('verified/rider/location/', RiderLocationView.as_view()),
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



