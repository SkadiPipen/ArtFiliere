from django.urls import path
from .views import CartView, CartItemView, CartContractView
urlpatterns = [path("cart/", CartView.as_view()), path("cart/items/<int:item_id>/", CartItemView.as_view())]
urlpatterns += [path('cart/contracts/<int:agreement_id>/', CartContractView.as_view())]
