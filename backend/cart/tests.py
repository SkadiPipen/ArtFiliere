from django.test import TestCase
from rest_framework.test import APIRequestFactory
from unittest.mock import patch
from users.models import User
from artworks.models import Artwork
from .models import Cart, CartItem
from .views import CartView, CartItemView, CartContractView

class CartTests(TestCase):
    def test_paid_rows_are_hidden_and_virtual_agreements_cancel_on_server(self):
        from messaging.models import Agreement, AgreementTemplate, Conversation
        from wallets.models import PaymentSession
        cart = Cart.objects.create(buyer=self.a)
        CartItem.objects.create(cart=cart, listing=self.art, quantity=1)
        template = AgreementTemplate.objects.create(name='Cart agreement', body='Terms')
        agreement = Agreement.objects.create(artwork=self.art, artist=self.b, buyer=self.a, template=template, conversation=Conversation.objects.create(artwork=self.art), price=100, status='accepted')
        self.assertEqual(self.call(CartContractView,self.b,'delete',agreement_id=agreement.pk).status_code,404)
        payment = PaymentSession.objects.create(reference_id='cart-paid',buyer=self.a,artist=self.b,artwork=self.art,agreement=agreement,gross_amount=100,platform_fee=10,artist_amount=90,status='pending')
        self.assertEqual(self.call(CartContractView,self.a,'delete',agreement_id=agreement.pk).status_code,409)
        self.assertEqual(len(self.call(CartView,self.a).data['items']),1)
        payment.status='paid'; payment.save()
        self.assertEqual(self.call(CartView,self.a).data['items'],[])
        payment.status='expired'; payment.save()
        self.assertEqual(self.call(CartContractView,self.a,'delete',agreement_id=agreement.pk).status_code,200)
        agreement.refresh_from_db(); self.assertEqual(agreement.status,'cancelled')
        self.assertFalse(CartItem.objects.filter(cart=cart).exists())
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
