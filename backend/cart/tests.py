from django.test import TestCase
from rest_framework.test import APIRequestFactory
from unittest.mock import patch
from users.models import User
from artworks.models import Artwork
from .models import Cart, CartItem
from .views import CartView, CartItemView

class CartTests(TestCase):
    def setUp(self):
        self.a = User.objects.create(username="a", firebase_uid="a", email="a@example.com", date_of_birth="2000-01-01", role="artist")
        self.b = User.objects.create(username="b", firebase_uid="b", email="b@example.com", date_of_birth="2000-01-01", role="artist")
        self.art = Artwork.objects.create(artist=self.b, title="Art", price="100", status="approved")
    def call(self, view, user, method="get", data=None, **kwargs):
        request = getattr(APIRequestFactory(), method)("/", data or {}, format="json")
        with patch.object(view, "get_request_user", return_value=user):
            return view.as_view()(request, **kwargs)
    def test_persistent_crud_and_isolation(self):
        result = self.call(CartView, self.a, "post", {"listing_id": self.art.pk})
        self.assertEqual(result.status_code, 201)
        pk = result.data["items"][0]["id"]
        self.call(CartView, self.a, "post", {"listing_id": self.art.pk})
        self.assertEqual(CartItem.objects.count(), 1)
        self.assertEqual(len(self.call(CartView, self.a).data["items"]), 1)
        self.assertEqual(self.call(CartItemView, self.b, "delete", item_id=pk).status_code, 404)
        self.assertEqual(self.call(CartView, self.b).data["items"], [])
        self.assertEqual(self.call(CartItemView, self.a, "patch", {"quantity": 2}, item_id=pk).data["items"][0]["quantity"], 2)
        self.assertEqual(self.call(CartItemView, self.a, "delete", item_id=pk).data["items"], [])
    def test_invalid_and_unauthenticated(self):
        self.assertEqual(self.call(CartView, None).status_code, 403)
        self.assertEqual(self.call(CartView, self.b, "post", {"listing_id": self.art.pk}).status_code, 400)
        for qty in [0, -1, True, 1.5, "2", 1000]:
            self.assertEqual(self.call(CartView, self.a, "post", {"listing_id": self.art.pk, "quantity": qty}).status_code, 400)
        self.art.status = "pending"
        self.art.save()
        self.assertEqual(self.call(CartView, self.a, "post", {"listing_id": self.art.pk}).status_code, 400)
