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
        latest = Agreement.objects.filter(artwork=self.artwork, buyer=self.buyer, status="proposed").order_by("-id").first()
        response = self.call(ContractsView, self.buyer, "post", {"price": "75.50", "terms": "Personal use. Digital delivery. No revisions.", **({"revision_of": latest.pk} if latest else {})}, artwork_id=self.artwork.id)
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

    def test_edit_counteroffer_cancel_and_restart_preserve_attempts(self):
        first = self.propose()
        def post(user, **data):
            return self.call(ContractsView, user, 'post', {'price': '100', 'terms': 'Updated terms', **data}, artwork_id=self.artwork.pk)
        counter = post(self.artist, revision_of=first)
        self.assertEqual(counter.status_code, 201)
        self.assertEqual(counter.data['attempt_action'], 'renegotiated')
        self.assertEqual(counter.data['proposed_by']['uid'], self.artist.firebase_uid)
        edited = post(self.artist, revision_of=counter.data['id'], price='110')
        self.assertEqual(edited.status_code, 201)
        self.assertEqual(edited.data['attempt_action'], 'edited')
        self.assertEqual(edited.data['negotiation_key'], counter.data['negotiation_key'])
        self.assertFalse(edited.data['buyer_accepted'])
        self.assertEqual(post(self.buyer, revision_of=first).status_code, 409)
        self.assertEqual(post(self.buyer).status_code, 409)
        cancelled = self.call(ContractDecisionView, self.buyer, 'patch', {'action': 'cancel'}, agreement_id=edited.data['id'])
        self.assertEqual(cancelled.status_code, 200)
        self.assertEqual(cancelled.data['cancelled_by']['uid'], self.buyer.firebase_uid)
        self.assertTrue(cancelled.data['cancelled_at'])
        self.assertEqual(post(self.buyer, revision_of=edited.data['id']).status_code, 409)
        self.assertEqual(post(self.stranger, restart_of=edited.data['id']).status_code, 409)
        restarted = post(self.artist, restart_of=edited.data['id'])
        self.assertEqual(restarted.status_code, 201)
        self.assertNotEqual(restarted.data['negotiation_key'], edited.data['negotiation_key'])
        self.assertIsNone(restarted.data['revision_of'])
        self.assertEqual(Agreement.objects.count(), 4)
        self.assertEqual(Agreement.objects.get(pk=edited.data['id']).closure_reason, 'cancelled')
        self.assertEqual(Agreement.objects.get(pk=first).closure_reason, 'superseded')

    def test_notifications_follow_negotiation_events_and_target_only_other_participant(self):
        from notifications.models import UserNotification
        first = self.propose()
        notification = UserNotification.objects.get(agreement_id=first)
        self.assertEqual(notification.user, self.artist)
        self.assertEqual(notification.title, 'New negotiation')
        self.assertFalse(notification.is_read)
        edited = self.call(ContractsView, self.buyer, 'post', {'revision_of': first, 'price': '90', 'terms': 'Edited terms'}, artwork_id=self.artwork.pk)
        self.assertEqual(edited.status_code, 201)
        self.assertEqual(UserNotification.objects.get(agreement_id=edited.data['id']).title, 'Negotiation edited')
        counter = self.call(ContractsView, self.artist, 'post', {'revision_of': edited.data['id'], 'price': '100', 'terms': 'Counteroffer'}, artwork_id=self.artwork.pk)
        self.assertEqual(counter.status_code, 201)
        notification = UserNotification.objects.get(agreement_id=counter.data['id'])
        self.assertEqual(notification.user, self.buyer)
        self.assertEqual(notification.title, 'New counteroffer')
        self.call(ContractDecisionView, self.buyer, 'patch', {'action': 'cancel'}, agreement_id=counter.data['id'])
        notification = UserNotification.objects.get(agreement_id=counter.data['id'], title='Negotiation cancelled')
        self.assertEqual(notification.user, self.artist)
        count = UserNotification.objects.count()
        self.assertEqual(self.call(ContractDecisionView, self.buyer, 'patch', {'action': 'cancel'}, agreement_id=counter.data['id']).status_code, 409)
        self.assertEqual(UserNotification.objects.count(), count)
        self.assertFalse(UserNotification.objects.filter(user=self.stranger).exists())

    def test_notification_links_and_read_status_are_private(self):
        from notifications.models import UserNotification
        from notifications.views import UserNotificationView
        from messaging.notifications import notify_negotiation
        first = self.propose()
        result = self.call(UserNotificationView, self.artist)
        self.assertEqual(result.data['unread_count'], 1)
        item = result.data['notifications'][0]
        self.assertEqual(item['agreement_id'], first)
        self.assertEqual(item['negotiation_partner']['id'], self.buyer.firebase_uid)
        self.assertEqual(self.call(UserNotificationView, self.stranger).data['notifications'], [])
        self.call(UserNotificationView, self.stranger, 'patch', {'notification_id': item['id']})
        self.assertFalse(UserNotification.objects.get(pk=item['id']).is_read)
        self.call(UserNotificationView, self.artist, 'patch', {'notification_id': item['id']})
        self.assertTrue(UserNotification.objects.get(pk=item['id']).is_read)
        self.call(ContractDecisionView, self.artist, 'patch', {'action': 'accept'}, agreement_id=first)
        self.assertEqual(UserNotification.objects.get(user=self.buyer, title='Negotiation accepted').agreement_id, first)
        agreement = Agreement.objects.get(pk=first)
        notify_negotiation(agreement, self.artist, 'signed')
        notify_negotiation(agreement, self.artist, 'signed')
        self.assertEqual(UserNotification.objects.filter(user=self.buyer, title='Agreement signed').count(), 1)

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
        self.assertFalse(data['can_sign'])
        early = self.call(AgreementSigningView, self.buyer, 'post', {'signature': 'Buyer', 'consent': True, 'document_hash': data['document_hash'], 'signature_strokes': [[[0.1, 0.2], [0.3, 0.7]]]}, agreement_id=pk)
        self.assertEqual(early.status_code, 409)
        with patch('messaging.signing.record_agreement_proof'), patch('wallets.views.requests.post') as gateway:
            for user in (self.artist, self.buyer):
                response = self.call(AgreementSigningView, user, "post", {"signature": user.username, "signature_strokes": [[[0.1, 0.2], [0.3, 0.7], [0.6, 0.3]]], "consent": True, "document_hash": data["document_hash"]}, agreement_id=pk)
                self.assertEqual(response.status_code, 200)
            gateway.assert_not_called()
        self.assertFalse(PaymentSession.objects.filter(agreement_id=pk).exists())
        self.assertTrue(response.data["fully_signed"])
        pdf = self.call(AgreementSigningView, self.buyer, agreement_id=pk, pdf=True)
        self.assertTrue(pdf.content.startswith(b"%PDF"))

    def test_license_permissions_survive_counteroffer_and_require_artist_authority(self):
        from messaging.signing import AgreementSigningView
        scope = {'territory': 'philippines', 'territory_details': '', 'uses': ['personal_display'],
                 'allow_resale': False,
                 'products': '', 'modifications': 'none', 'sublicensing': 'none',
                 'credit': 'required', 'credit_name': 'Painter', 'duration_months': 12}
        response = self.call(ContractsView, self.buyer, 'post',
            {'price': '75.50', 'terms': 'Personal display', 'license_scope': scope}, artwork_id=self.artwork.pk)
        self.assertEqual(response.status_code, 201)
        self.assertEqual(response.data['license_scope'], scope)
        pk = response.data['id']
        scope['duration_months'] = 6
        revised = self.call(ContractsView, self.artist, 'post',
            {'price': '75.50', 'terms': 'Six months', 'license_scope': scope, 'revision_of': pk}, artwork_id=self.artwork.pk)
        self.assertEqual(revised.status_code, 201)
        self.assertTrue(any(change['field'] == 'license_scope' for change in revised.data['changes']))
        pk = revised.data['id']
        self.call(ContractDecisionView, self.buyer, 'patch', {'action': 'accept'}, agreement_id=pk)
        document = self.call(AgreementSigningView, self.artist, agreement_id=pk).data
        self.assertIn('License term: 6 months', document['document'])
        payload = {'signature': 'Artist', 'consent': True, 'document_hash': document['document_hash'],
                   'signature_strokes': [[[0.1, 0.2], [0.3, 0.7], [0.6, 0.3]]]}
        self.assertEqual(self.call(AgreementSigningView, self.artist, 'post', payload, agreement_id=pk).status_code, 400)
        payload['authority_confirmed'] = True
        self.assertEqual(self.call(AgreementSigningView, self.artist, 'post', payload, agreement_id=pk).status_code, 200)

    def test_negotiated_pricing_roundtrips_and_counteroffer_can_change_mode(self):
        response = self.call(ContractsView, self.buyer, 'post', {
            'price': '55.00', 'terms': 'Negotiated license',
            'pricing_terms': {'mode': 'fixed', 'fixed_fee': '50'}}, artwork_id=self.artwork.pk)
        self.assertEqual(response.status_code, 201)
        self.assertEqual(response.data['pricing_terms']['license_fee'], '50.00')
        self.assertIn('Platform fee (10%, not negotiable): PHP 5.00', response.data['terms'])
        pk = response.data['id']
        changed = self.call(ContractsView, self.artist, 'post', {
            'price': '82.50', 'terms': 'Counteroffer', 'revision_of': pk,
            'pricing_terms': {'mode': 'multipliers', 'license_multiplier': '1', 'exclusivity_multiplier': '1.5'}}, artwork_id=self.artwork.pk)
        self.assertEqual(changed.status_code, 201)
        self.assertEqual(changed.data['pricing_terms']['mode'], 'multipliers')
        self.assertTrue(any(change['field'] == 'pricing_terms' for change in changed.data['changes']))
        self.assertEqual(Agreement.objects.get(pk=pk).status, 'cancelled')

    def test_copyright_assignment_roundtrips_and_is_in_signing_document(self):
        from messaging.signing import AgreementSigningView
        scope = {'territory': 'philippines', 'territory_details': '', 'uses': ['personal_display'],
                 'products': '', 'modifications': 'none', 'sublicensing': 'none', 'credit': 'required',
                 'credit_name': '', 'duration_months': 12, 'copyright_transfer': {
                     'kind': 'partial', 'rights': ['reproduction'], 'effective': 'signed_and_paid',
                     'existing_commitments': 'None', 'artist_reserved_uses': 'Portfolio only',
                     'additional_terms': 'None', 'acknowledged': True}}
        response = self.call(ContractsView, self.buyer, 'post', {'price': '75.50', 'terms': 'Transfer reproduction',
            'license_scope': scope}, artwork_id=self.artwork.pk)
        self.assertEqual(response.status_code, 201)
        self.assertEqual(response.data['license_scope']['copyright_transfer']['rights'], ['reproduction'])
        pk = response.data['id']
        self.call(ContractDecisionView, self.artist, 'patch', {'action': 'accept'}, agreement_id=pk)
        document = self.call(AgreementSigningView, self.buyer, agreement_id=pk).data['document']
        self.assertIn('COPYRIGHT ASSIGNMENT', document)
        self.assertIn('Portfolio only', document)
        self.assertNotIn('does not assign copyright ownership', document)

    def test_tampered_pricing_does_not_create_proposal(self):
        response = self.call(ContractsView, self.buyer, 'post', {
            'price': '10.00', 'terms': 'Wrong total',
            'pricing_terms': {'mode': 'fixed', 'fixed_fee': '10'}}, artwork_id=self.artwork.pk)
        self.assertEqual(response.status_code, 400)
        self.assertFalse(Agreement.objects.filter(artwork=self.artwork).exists())

    def test_checkout_status_tracks_pending_and_paid_without_creating_payment(self):
        from messaging.checkout_status import checkout_status
        from messaging.signing import AgreementSigningView
        pk = self.propose()
        agreement = Agreement.objects.get(pk=pk)
        self.assertEqual(checkout_status(agreement), 'not_started')
        self.assertFalse(PaymentSession.objects.filter(agreement=agreement).exists())
        payment = PaymentSession.objects.create(agreement=agreement, buyer=self.buyer, artist=self.artist,
            artwork=self.artwork, reference_id='checkout-status-test', gross_amount='75.50',
            platform_fee='6.86', artist_amount='68.64', status='pending')
        self.assertEqual(checkout_status(agreement), 'pending')
        payment.status = 'paid'
        payment.save(update_fields=['status'])
        self.call(ContractDecisionView, self.artist, 'patch', {'action': 'accept'}, agreement_id=pk)
        response = self.call(AgreementSigningView, self.buyer, agreement_id=pk)
        self.assertEqual(response.data['checkout_status'], 'paid')
        self.assertEqual(PaymentSession.objects.filter(agreement=agreement).count(), 1)

    def test_cost_floor_with_contract_multipliers(self):
        from artworks.pricing import minimum_price
        from decimal import Decimal
        self.artwork.hours = Decimal("2")
        self.artwork.hourly_rate = Decimal("100")
        self.artwork.material_cost = Decimal("50")
        self.artwork.art_type = "physical"
        self.artwork.save()
        self.assertEqual(minimum_price(self.artwork, "commercial", "exclusive"), Decimal("618.75"))
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
