from unittest.mock import patch
from django.test import TestCase, override_settings
from rest_framework.test import APIRequestFactory
from users.models import User
from artworks.models import Artwork
from messaging.models import Agreement, AgreementTemplate
from messaging.contracts import ContractsView, ContractDecisionView
from wallets.views import ArtworkCheckoutView, AgreementCheckoutView
from wallets.models import PaymentSession


class ContractFlowTests(TestCase):
    def setUp(self):
        self.factory = APIRequestFactory()
        def user(name, role):
            return User.objects.create(username=name, firebase_uid=name, email=f"{name}@example.com", date_of_birth="2000-01-01", role=role)
        self.buyer = user("buyer", "buyer")
        self.artist = user("artist", "artist")
        self.stranger = user("stranger", "buyer")
        from PIL import Image
        from io import BytesIO
        import base64
        buffer = BytesIO()
        Image.new("RGB", (2, 2), "blue").save(buffer, "JPEG")
        self.image_data = "data:image/jpeg;base64," + base64.b64encode(buffer.getvalue()).decode()
        self.artwork = Artwork.objects.create(artist=self.artist, title="Painting", price="50", status="approved", image_data=self.image_data)
        AgreementTemplate.objects.get_or_create(name="Test", defaults={"body": "Terms", "is_active": True})

    def call(self, view, user, method="get", data=None, **kwargs):
        request = getattr(self.factory, method)("/", data or {}, format="json")
        with patch.object(view, "get_request_user", return_value=user):
            return view.as_view()(request, **kwargs)

    def propose(self):
        response = self.call(ContractsView, self.buyer, "post", {"price": "75.50", "terms": "Personal use. Digital delivery. No revisions."}, artwork_id=self.artwork.id)
        self.assertEqual(response.status_code, 201)
        return response.data["id"]

    def test_unread_proposals_are_scoped_and_clear_only_when_viewed(self):
        from messaging.contracts import ContractReadView
        first = self.propose()
        self.assertEqual(self.call(ContractsView, self.artist).data['contracts'][0]['unread_count'], 1)
        self.assertEqual(self.call(ContractsView, self.buyer).data['contracts'][0]['unread_count'], 0)
        self.call(ContractReadView, self.stranger, 'post', {'ids': [first]})
        self.assertEqual(self.call(ContractsView, self.artist).data['contracts'][0]['unread_count'], 1)
        second = self.propose()
        self.call(ContractReadView, self.artist, 'post', {'ids': [first]})
        counts = {c['id']: c['unread_count'] for c in self.call(ContractsView, self.artist).data['contracts']}
        self.assertEqual(counts, {first: 0, second: 1})
        self.call(ContractReadView, self.artist, 'post', {'ids': [second]})
        self.assertTrue(all(c['unread_count'] == 0 for c in self.call(ContractsView, self.artist).data['contracts']))

    @override_settings(XENDIT_SECRET_KEY="test-key")
    @patch("wallets.views.requests.post")
    def test_both_accept_before_checkout_and_agreed_price(self, payment):
        payment.return_value.ok = True
        payment.return_value.json.return_value = {"payment_link_url": "https://example.com/pay", "payment_session_id": "test"}
        pk = self.propose()
        self.assertEqual(self.call(ArtworkCheckoutView, self.buyer, "post", artwork_id=self.artwork.id).status_code, 409)
        self.assertEqual(self.call(AgreementCheckoutView, self.buyer, "post", agreement_id=pk).status_code, 409)
        self.call(ContractDecisionView, self.buyer, "patch", {"action": "accept"}, agreement_id=pk)
        self.assertEqual(self.call(AgreementCheckoutView, self.buyer, "post", agreement_id=pk).status_code, 409)
        self.call(ContractDecisionView, self.artist, "patch", {"action": "accept"}, agreement_id=pk)
        from django.utils import timezone
        Agreement.objects.filter(pk=pk).update(artist_signature="Artist", buyer_signature="Buyer", artist_signature_image="test", buyer_signature_image="test", artist_signed_at=timezone.now(), buyer_signed_at=timezone.now())
        result = self.call(AgreementCheckoutView, self.buyer, "post", agreement_id=pk)
        self.assertEqual(result.status_code, 201)
        self.assertEqual(str(PaymentSession.objects.get(agreement_id=pk).gross_amount), "75.50")
        self.assertEqual(payment.call_args.kwargs["json"]["amount"], 75.5)
        self.assertEqual(self.call(AgreementCheckoutView, self.buyer, "post", agreement_id=pk).status_code, 200)
        self.assertEqual(PaymentSession.objects.filter(agreement_id=pk).count(), 1)

    def test_replacement_rejects_stale_acceptance(self):
        old = self.propose()
        new = self.propose()
        self.assertEqual(Agreement.objects.get(id=old).status, "cancelled")
        self.assertIsNone(Agreement.objects.get(id=new).artist_accepted_at)
        self.assertEqual(self.call(ContractDecisionView, self.buyer, "patch", {"action": "accept"}, agreement_id=old).status_code, 409)

    def test_permissions_rejection_and_invalid_price(self):
        pk = self.propose()
        self.assertEqual(self.call(ContractsView, self.stranger).data["contracts"], [])
        self.assertEqual(self.call(ContractDecisionView, self.stranger, "patch", {"action": "accept"}, agreement_id=pk).status_code, 404)
        self.assertEqual(self.call(AgreementCheckoutView, None, "post", agreement_id=pk).status_code, 401)
        self.assertEqual(self.call(ContractsView, None).status_code, 403)
        for price in ["NaN", "-1", "1.001", "Infinity"]:
            self.assertEqual(self.call(ContractsView, self.buyer, "post", {"price": price, "terms": "terms"}, artwork_id=self.artwork.id).status_code, 400)
        self.call(ContractDecisionView, self.artist, "patch", {"action": "reject"}, agreement_id=pk)
        self.assertEqual(self.call(AgreementCheckoutView, self.buyer, "post", agreement_id=pk).status_code, 409)

    def test_artist_can_buy_another_artists_work(self):
        self.buyer.role = User.Role.ARTIST
        self.buyer.save(update_fields=["role"])
        self.assertTrue(self.call(ContractsView, self.buyer, artwork_id=self.artwork.id).data["artwork"]["can_propose"])
        pk = self.propose()
        for participant in (self.artist,):
            response = self.call(ContractDecisionView, participant, "patch", {"action": "accept"}, agreement_id=pk)
            self.assertEqual(response.status_code, 200)
        self.assertEqual(Agreement.objects.get(id=pk).status, "accepted")

    def test_artist_cannot_buy_own_artwork(self):
        self.assertFalse(self.call(ContractsView, self.artist, artwork_id=self.artwork.id).data["artwork"]["can_propose"])
        response = self.call(ContractsView, self.artist, "post", {"price": "100", "terms": "Personal use"}, artwork_id=self.artwork.id)
        self.assertEqual(response.status_code, 403)

    def test_recipient_counterproposal_switches_actions(self):
        pk = self.propose()
        self.assertEqual(self.call(ContractDecisionView, self.buyer, "patch", {"action": "accept"}, agreement_id=pk).status_code, 409)
        counter = self.call(ContractsView, self.artist, "post", {"revision_of": pk, "price": "90", "terms": "Commercial use"}, artwork_id=self.artwork.id)
        self.assertEqual(counter.status_code, 201)
        self.assertTrue(counter.data["is_proposer"])
        self.assertTrue(counter.data["artist_accepted"])
        self.assertFalse(counter.data["buyer_accepted"])
        self.assertEqual(Agreement.objects.get(id=pk).status, "cancelled")
        response = self.call(ContractDecisionView, self.buyer, "patch", {"action": "accept"}, agreement_id=counter.data["id"])
        self.assertEqual(response.data["status"], "accepted")

    def test_signing_requires_acceptance_consent_and_matching_document(self):
        from messaging.signing import AgreementSigningView
        pk = self.propose()
        self.assertEqual(self.call(AgreementSigningView, self.buyer, agreement_id=pk).status_code, 409)
        self.call(ContractDecisionView, self.artist, "patch", {"action": "accept"}, agreement_id=pk)
        data = self.call(AgreementSigningView, self.buyer, agreement_id=pk).data
        self.assertEqual(self.call(AgreementSigningView, self.stranger, agreement_id=pk).status_code, 404)
        self.assertEqual(self.call(AgreementSigningView, self.buyer, "post", {"signature": "Buyer", "consent": True, "document_hash": "stale"}, agreement_id=pk).status_code, 409)
        for user in (self.buyer, self.artist):
            response = self.call(AgreementSigningView, user, "post", {"signature": user.username, "signature_strokes": [[[0.1, 0.2], [0.3, 0.7], [0.6, 0.3]]], "consent": True, "document_hash": data["document_hash"]}, agreement_id=pk)
            self.assertEqual(response.status_code, 200)
        self.assertTrue(response.data["fully_signed"])
        pdf = self.call(AgreementSigningView, self.buyer, agreement_id=pk, pdf=True)
        self.assertTrue(pdf.content.startswith(b"%PDF"))

    def test_cost_floor_with_contract_multipliers(self):
        from artworks.pricing import minimum_price
        from decimal import Decimal
        self.artwork.hours = Decimal("2")
        self.artwork.hourly_rate = Decimal("100")
        self.artwork.material_cost = Decimal("50")
        self.artwork.art_type = "physical"
        self.artwork.save()
        self.assertEqual(minimum_price(self.artwork, "commercial", "exclusive"), Decimal("536.25"))
        response = self.call(ContractsView, self.buyer, "post", {"price": "536.24", "terms": "Commercial", "license_type": "commercial", "exclusivity": "exclusive"}, artwork_id=self.artwork.id)
        self.assertEqual(response.status_code, 400)
        self.artwork.art_type = "digital"
        self.assertEqual(minimum_price(self.artwork, "personal", "non_exclusive"), Decimal("220.00"))

    def test_signature_images_validate_transparency_and_blank(self):
        from messaging.signature_images import signature_image
        from PIL import Image
        from io import BytesIO
        import base64
        for color in [(255,255,255,255), (0,0,0,0)]:
            out = BytesIO(); Image.new('RGBA', (100,50), color).save(out, format='PNG')
            with self.assertRaises(ValueError):
                signature_image({'signature_image': 'data:image/png;base64,' + base64.b64encode(out.getvalue()).decode()})
        with self.assertRaises(ValueError): signature_image({'signature_strokes': []})
        image = signature_image({'signature_strokes': [[[0.1,0.2],[0.3,0.7],[0.6,0.3]]]})
        self.assertTrue(image.startswith('data:image/png;base64,'))
        self.assertTrue(signature_image({'signature_image': image}).startswith('data:image/png;base64,'))

    def test_cart_delete_cancels_negotiation(self):
        from cart.models import Cart, CartItem
        from cart.views import CartItemView
        pk = self.propose()
        cart = Cart.objects.create(buyer=self.buyer)
        item = CartItem.objects.create(cart=cart, listing=self.artwork)
        result = self.call(CartItemView, self.buyer, "delete", item_id=item.pk)
        self.assertEqual(result.status_code, 200)
        self.assertEqual(Agreement.objects.get(pk=pk).status, "cancelled")
        self.assertFalse(CartItem.objects.filter(pk=item.pk).exists())

    @override_settings(XENDIT_WEBHOOK_TOKEN="test-callback")
    def test_paid_webhook_removes_cart_but_keeps_agreement(self):
        from cart.models import Cart, CartItem
        from cart.views import CartItemView
        from wallets.views import xendit_payment_session_webhook
        pk = self.propose()
        cart = Cart.objects.create(buyer=self.buyer)
        item = CartItem.objects.create(cart=cart, listing=self.artwork)
        payment = PaymentSession.objects.create(reference_id="test-cart-payment", xendit_session_id="ps-test", buyer=self.buyer, artist=self.artist, artwork=self.artwork, agreement_id=pk, gross_amount="110", platform_fee="10", artist_amount="100")
        self.assertEqual(self.call(CartItemView, self.buyer, "delete", item_id=item.pk).status_code, 409)
        request = self.factory.post('/', {"event": "payment_session.completed", "data": {"reference_id": payment.reference_id, "status": "COMPLETED", "payment_session_id": "ps-test", "currency": "PHP", "amount": "110", "session_type": "PAY"}}, format="json", HTTP_X_CALLBACK_TOKEN="test-callback")
        self.assertEqual(xendit_payment_session_webhook(request).status_code, 200)
        self.assertFalse(CartItem.objects.filter(pk=item.pk).exists())
        self.assertNotEqual(Agreement.objects.get(pk=pk).status, "cancelled")
