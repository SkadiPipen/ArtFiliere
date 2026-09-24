from .riders import RiderOrdersView, RiderProfileView, RiderLocationView, RiderProofView
from .addresses import AddressesView
from .routing import DeliveryQuoteView
from django.urls import path
from .views import DeliveryRoutesView, PurchasesView, PurchaseDownloadView, PurchaseReviewView, DriverOrdersView

urlpatterns = [
    path('addresses/', AddressesView.as_view()),
    path('addresses/<int:address_id>/', AddressesView.as_view()),
    path('delivery/quote/<int:artwork_id>/', DeliveryQuoteView.as_view()),
    path('delivery/orders/pending/', RiderOrdersView.as_view(), {'scope': 'pending'}),
    path('delivery/orders/active/', RiderOrdersView.as_view(), {'scope': 'active'}),
    path('delivery/orders/history/', RiderOrdersView.as_view(), {'scope': 'history'}),
    path('delivery/orders/<int:order_id>/', RiderOrdersView.as_view()),
    path('delivery/orders/accept/<int:order_id>/', RiderOrdersView.as_view(), {'action': 'accept'}),
    path('delivery/orders/<int:order_id>/status/', RiderOrdersView.as_view()),
    path('delivery/orders/<int:order_id>/proof/', RiderProofView.as_view()),
    path('delivery/rider/profile/', RiderProfileView.as_view()),
    path('delivery/rider/location/', RiderLocationView.as_view()),
    path('delivery/routes/<int:artwork_id>/', DeliveryRoutesView.as_view()),
    path('purchases/', PurchasesView.as_view()),
    path('purchases/<int:payment_id>/png/', PurchaseDownloadView.as_view()),
    path('purchases/<int:payment_id>/review/', PurchaseReviewView.as_view()),
    path('delivery/driver/orders/', DriverOrdersView.as_view()),
    path('delivery/driver/orders/<int:order_id>/', DriverOrdersView.as_view()),
]
