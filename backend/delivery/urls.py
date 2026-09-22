# Compatibility URLs for the upstream rider module, using our authenticated
# fulfillment service and the existing paid-order records.
from django.urls import path
from fulfillment.riders import RiderOrdersView, RiderProfileView, RiderLocationView, RiderProofView
urlpatterns = [
    path('orders/pending/', RiderOrdersView.as_view(), {'scope': 'pending'}),
    path('orders/active/', RiderOrdersView.as_view(), {'scope': 'active'}),
    path('orders/history/', RiderOrdersView.as_view(), {'scope': 'history'}),
    path('orders/<int:order_id>/', RiderOrdersView.as_view()),
    path('orders/accept/<int:order_id>/', RiderOrdersView.as_view(), {'action': 'accept'}),
    path('orders/<int:order_id>/status/', RiderOrdersView.as_view()),
    path('orders/<int:order_id>/proof/', RiderProofView.as_view()),
    path('rider/profile/', RiderProfileView.as_view()),
    path('rider/location/', RiderLocationView.as_view()),
]
