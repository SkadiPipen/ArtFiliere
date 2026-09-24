from django.urls import path
from .views import CartView, CartItemView
urlpatterns = [path("cart/", CartView.as_view()), path("cart/items/<int:item_id>/", CartItemView.as_view())]
