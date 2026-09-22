import base64
from io import BytesIO
from unittest.mock import patch
from PIL import Image
from django.test import TestCase, override_settings
from django.utils import timezone
from rest_framework.test import APIRequestFactory
from users.models import User, Address
from artworks.models import Artwork
from messaging.models import Agreement, AgreementTemplate
from messaging.contracts import ContractsView, ContractDecisionView
from wallets.models import PaymentSession, WalletAccount
from wallets.views import AgreementCheckoutView, xendit_payment_session_webhook
from .riders import RiderOrdersView, RiderProfileView, RiderLocationView, RiderProofView
from .models import DeliveryRoute, DeliveryOrder, PurchaseReview
from .addresses import AddressesView
from .routing import DeliveryQuoteView, issue_quote, road_distance
from .views import DeliveryRoutesView, PurchasesView, PurchaseDownloadView, PurchaseReviewView, DriverOrdersView


@override_settings(XENDIT_SECRET_KEY='test', XENDIT_WEBHOOK_TOKEN='callback')
class FulfillmentTests(TestCase):
    def setUp(self):
        self.factory = APIRequestFactory()
        def user(name, role):
            return User.objects.create(username=name, firebase_uid=name, email=f'{name}@example.com', date_of_birth='2000-01-01', role=role)
        self.buyer = user('buyer', 'buyer')
        self.artist = user('artist', 'artist')
        self.other = user('other', 'buyer')
        self.driver = user('driver', 'driver')
        self.driver2 = user('driver2', 'driver')
        Address.objects.create(user=self.artist, city='Cebu City', street='123 Pickup St', barangay='Test', province='Cebu', region='Central Visayas', postal_code='6000')
        Address.objects.create(user=self.buyer, city='Mandaue City', street='456 Buyer Street', barangay='Test', province='Cebu', region='Central Visayas', postal_code='6014')
        buffer = BytesIO()
        Image.new('RGB', (3, 3), 'red').save(buffer, 'JPEG')
        self.art = Artwork.objects.create(artist=self.artist, title='Test art', price=100, status='approved', art_type='digital', image_data='data:image/jpeg;base64,' + base64.b64encode(buffer.getvalue()).decode())
        AgreementTemplate.objects.get_or_create(name='Test', defaults={'body': 'Terms', 'is_active': True})
        self.route = DeliveryRoute.objects.create(pickup_city='Cebu City', destination_city='Mandaue City', distance_km=10)

    def call(self, view, user, method='get', data=None, **kwargs):
        request = getattr(self.factory, method)('/', data or {}, format='json')
        with patch('authentication.views.AuthenticatedAPIView.get_request_user', return_value=user):
            return view.as_view()(request, **kwargs)

    def quote(self, actor=None, original=None, address_id=None):
        actor = actor or self.buyer
        with patch('fulfillment.routing.road_distance', return_value=10000):
            return issue_quote(self.art, self.buyer, actor, original, address_id or actor.address.id)['token']

    def proposal(self, physical=False):
        self.art.art_type = 'physical' if physical else 'digital'
        self.art.save()
        data = {'price': '310' if physical else '110', 'terms': 'Test terms', 'delivery_type': 'digital'}
        if physical:
            data.update(delivery_quote=self.quote())
        response = self.call(ContractsView, self.buyer, 'post', data, artwork_id=self.art.id)
        self.assertEqual(response.status_code, 201, response.data)
        pk = response.data['id']
        self.call(ContractDecisionView, self.artist, 'patch', {'action': 'accept'}, agreement_id=pk)
        Agreement.objects.filter(pk=pk).update(artist_signed_at=timezone.now(), buyer_signed_at=timezone.now(), artist_signature_image='test', buyer_signature_image='test')
        return pk

    def checkout(self, pk):
        with patch('wallets.views.requests.post') as gateway:
            gateway.return_value.ok = True
            gateway.return_value.json.return_value = {'payment_session_id': 'test', 'payment_link_url': 'https://example.com/pay'}
            result = self.call(AgreementCheckoutView, self.buyer, 'post', agreement_id=pk)
            self.assertEqual(result.status_code, 201, result.data)
        return PaymentSession.objects.get(agreement_id=pk)

    def complete(self, payment):
        request = self.factory.post('/', {'event': 'payment_session.completed', 'data': {'reference_id': payment.reference_id, 'status': 'COMPLETED', 'payment_session_id': payment.xendit_session_id, 'amount': str(payment.gross_amount), 'currency': 'PHP', 'session_type': 'PAY'}}, format='json', HTTP_X_CALLBACK_TOKEN='callback')
        return xendit_payment_session_webhook(request)

    def test_physical_requires_route_and_separate_price_floor(self):
        self.art.art_type = 'physical'; self.art.save()
        data = {'price': '110', 'terms': 'Terms', 'delivery_type': 'digital'}
        self.assertEqual(self.call(ContractsView, self.buyer, 'post', data, artwork_id=self.art.id).status_code, 400)
        data.update(delivery_quote=self.quote(), price='300')
        self.assertEqual(self.call(ContractsView, self.buyer, 'post', data, artwork_id=self.art.id).status_code, 400)
        data['price'] = '310'
        result = self.call(ContractsView, self.buyer, 'post', data, artwork_id=self.art.id)
        agreement = Agreement.objects.get(pk=result.data['id'])
        self.assertEqual(agreement.delivery_type, 'physical')
        self.assertEqual(agreement.delivery_fee, 200)
        self.assertEqual(agreement.delivery_details['destination_city'], 'Mandaue City')

    def test_physical_webhook_idempotent_and_fee_snapshot(self):
        pk = self.proposal(physical=True)
        self.route.base_fare = 999; self.route.save()
        payment = self.checkout(pk)
        self.assertEqual(payment.gross_amount, 310)
        self.assertEqual(payment.platform_fee, 10)
        self.assertEqual(payment.artist_amount, 100)
        self.assertFalse(DeliveryOrder.objects.exists())
        self.assertEqual(self.complete(payment).status_code, 200)
        self.assertEqual(self.complete(payment).status_code, 200)
        self.assertEqual(DeliveryOrder.objects.count(), 1)
        self.assertEqual(DeliveryOrder.objects.get().fee, 200)
        self.assertEqual(WalletAccount.objects.get(user=self.artist).pending_balance, 100)
        self.assertEqual(self.call(PurchaseDownloadView, self.buyer, payment_id=payment.id).status_code, 409)

    def test_digital_png_only_after_payment_and_only_for_buyer(self):
        payment = self.checkout(self.proposal())
        self.assertEqual(self.call(PurchaseDownloadView, self.buyer, payment_id=payment.id).status_code, 404)
        self.art.image_data = ''; self.art.save()
        self.complete(payment)
        self.assertFalse(DeliveryOrder.objects.exists())
        response = self.call(PurchaseDownloadView, self.buyer, payment_id=payment.id)
        self.assertEqual(response.status_code, 200)
        self.assertTrue(response.content.startswith(b'\x89PNG\r\n\x1a\n'))
        self.assertEqual(Image.open(BytesIO(response.content)).size, (3, 3))
        self.assertEqual(self.call(PurchaseDownloadView, self.other, payment_id=payment.id).status_code, 404)
        self.assertEqual(self.call(PurchasesView, self.other).data, [])
        self.assertTrue(self.call(PurchasesView, self.buyer).data[0]['can_download'])
        self.assertTrue(self.call(PurchasesView, self.buyer).data[0]['image'].startswith('data:image/png;base64,'))

    def test_reviews_paid_owner_valid_scores_once(self):
        payment = self.checkout(self.proposal())
        data = {'artist_rating': 5, 'artwork_rating': 4, 'artist_comment': 'Helpful artist', 'artwork_comment': 'Beautiful artwork'}
        def rate(user, body=data):
            return self.call(PurchaseReviewView, user, 'post', body, payment_id=payment.id)
        self.assertEqual(rate(self.buyer).status_code, 404)
        self.complete(payment)
        self.assertEqual(rate(self.other).status_code, 404)
        # Viewing or postponing a review never marks it complete.
        for _ in range(2):
            purchase = self.call(PurchasesView, self.buyer).data[0]
            self.assertTrue(purchase['can_rate'])
            self.assertTrue(purchase['can_download'])
            self.assertIsNone(purchase['review'])
        self.assertEqual(rate(self.buyer, {**data, 'artist_rating': True}).status_code, 400)
        self.assertEqual(rate(self.buyer, {**data, 'artwork_rating': 6}).status_code, 400)
        self.assertEqual(rate(self.buyer).status_code, 201)
        self.assertEqual(rate(self.buyer).status_code, 409)
        self.assertEqual(PurchaseReview.objects.count(), 1)
        purchase = self.call(PurchasesView, self.buyer).data[0]
        self.assertFalse(purchase['can_rate'])
        self.assertTrue(purchase['can_download'])
        self.assertEqual(purchase['review']['artist_comment'], 'Helpful artist')
        self.assertEqual(purchase['review']['artwork_comment'], 'Beautiful artwork')
        payment.status = 'refunded'; payment.save()
        self.assertEqual(self.call(PurchaseDownloadView, self.buyer, payment_id=payment.id).status_code, 404)

    def test_driver_assignment_and_ordered_transitions(self):
        payment = self.checkout(self.proposal(True)); self.complete(payment)
        order = DeliveryOrder.objects.get(payment=payment)
        def advance(user, state):
            return self.call(DriverOrdersView, user, 'post', {'status': state}, order_id=order.id)
        self.assertEqual(advance(self.buyer, 'accepted').status_code, 403)
        self.assertEqual(advance(self.driver, 'delivered').status_code, 409)
        self.assertEqual(advance(self.driver, 'accepted').status_code, 409)
        self.call(RiderProfileView, self.driver, 'post', {'is_clocked_in': True})
        self.assertEqual(advance(self.driver, 'accepted').status_code, 200)
        self.assertEqual(advance(self.driver2, 'in_transit').status_code, 404)
        self.assertEqual(advance(self.driver, 'in_transit').status_code, 409)
        self.assertEqual(advance(self.driver, 'arrived_at_artist').status_code, 200)
        self.assertEqual(advance(self.driver, 'picked_up').status_code, 409)
        def proof(user, kind, image=None):
            return self.call(RiderProofView, user, 'post', {'proof_type': kind, 'image': image or self.art.image_data}, order_id=order.id)
        self.assertEqual(proof(self.driver2, 'PICKUP').status_code, 404)
        self.assertEqual(proof(self.driver, 'PICKUP', 'invalid').status_code, 400)
        self.assertEqual(proof(self.driver, 'PICKUP').status_code, 200)
        self.assertEqual(advance(self.driver, 'picked_up').status_code, 200)
        self.assertEqual(advance(self.driver, 'in_transit').status_code, 200)
        self.assertEqual(advance(self.driver, 'arrived_at_buyer').status_code, 200)
        self.assertEqual(advance(self.driver, 'delivered').status_code, 409)
        self.assertEqual(proof(self.driver, 'DELIVERY').status_code, 200)
        self.assertEqual(advance(self.driver, 'delivered').status_code, 200)
        self.assertEqual(proof(self.driver, 'DELIVERY').status_code, 409)
        self.assertEqual(self.call(RiderOrdersView, self.driver, scope='history').data[0]['id'], order.id)
        self.assertEqual(self.call(RiderOrdersView, self.driver2, scope='history').data, [])
        self.assertEqual(self.call(RiderOrdersView, self.driver2, order_id=order.id).status_code, 404)
        order.refresh_from_db(); self.assertIsNotNone(order.delivered_at)
        self.assertEqual(self.call(PurchasesView, self.buyer).data[0]['delivery']['status'], 'delivered')

    def test_unsigned_agreement_cannot_start_payment(self):
        pk = self.proposal()
        Agreement.objects.filter(pk=pk).update(buyer_signed_at=None)
        with patch('wallets.views.requests.post') as gateway:
            self.assertEqual(self.call(AgreementCheckoutView, self.buyer, 'post', agreement_id=pk).status_code, 409)
            gateway.assert_not_called()

    def test_saved_addresses_override_client_and_survive_profile_edits(self):
        self.art.art_type = 'physical'; self.art.save()
        response = self.call(ContractsView, self.buyer, 'post', {
            'price': '310', 'terms': 'Terms', 'delivery_quote': self.quote(),
            'delivery_address': 'Forged other address',
        }, artwork_id=self.art.id)
        agreement = Agreement.objects.get(pk=response.data['id'])
        self.assertIn('456 Buyer Street', agreement.delivery_details['delivery_address'])
        self.assertNotIn('Forged', agreement.delivery_details['delivery_address'])
        self.assertIn('123 Pickup St', agreement.delivery_details['pickup_address'])
        Address.objects.filter(user=self.buyer).update(street='Changed later')
        self.call(ContractDecisionView, self.artist, 'patch', {'action': 'accept'}, agreement_id=agreement.id)
        Agreement.objects.filter(pk=agreement.id).update(artist_signed_at=timezone.now(), buyer_signed_at=timezone.now(), artist_signature_image='test', buyer_signature_image='test')
        payment = self.checkout(agreement.id); self.complete(payment)
        order = DeliveryOrder.objects.get(payment=payment)
        self.assertIn('456 Buyer Street', order.delivery_address)
        self.assertEqual(order.delivery_address.count('Mandaue City'), 1)

    def test_counterproposal_context_uses_original_buyer_and_filters_routes(self):
        pk = self.proposal(True)
        request = self.factory.get('/', {'agreement_id': pk})
        with patch('authentication.views.AuthenticatedAPIView.get_request_user', return_value=self.artist):
            response = DeliveryRoutesView.as_view()(request, artwork_id=self.art.id)
        self.assertEqual(response.status_code, 200)
        self.assertIn('456 Buyer Street', response.data['delivery_address'])
        self.assertEqual([r['id'] for r in response.data['routes']], [self.route.id])
        Address.objects.filter(user=self.buyer).update(city='Different City')
        self.buyer.refresh_from_db()
        response = self.call(DeliveryRoutesView, self.buyer, artwork_id=self.art.id)
        self.assertEqual(response.data['routes'], [])
        Address.objects.filter(user=self.buyer).delete()
        self.buyer.refresh_from_db()
        self.assertEqual(self.call(DeliveryRoutesView, self.buyer, artwork_id=self.art.id).status_code, 400)

    def test_profile_address_fields_round_trip_and_validation(self):
        from authentication.views import me
        data = {'street': 'New Street', 'barangay': 'New Barangay', 'city': 'New City',
                'province': 'Cebu', 'region': 'Central Visayas', 'postal_code': '6000'}
        with patch('authentication.views.verify_token', return_value={'uid': self.buyer.firebase_uid}):
            response = me(self.factory.patch('/', data, format='json', HTTP_AUTHORIZATION='Bearer test'))
            self.assertEqual(response.status_code, 200)
            response = me(self.factory.get('/', HTTP_AUTHORIZATION='Bearer test'))
            self.assertEqual(response.data['address'], data)
            response = me(self.factory.patch('/', {'city': ''}, format='json', HTTP_AUTHORIZATION='Bearer test'))
            self.assertEqual(response.status_code, 400)
            self.assertEqual(Address.objects.get(user=self.buyer).city, 'New City')

    def test_rider_clock_location_and_role_permissions(self):
        self.assertEqual(self.call(RiderProfileView, self.buyer).status_code, 403)
        self.assertEqual(self.call(RiderOrdersView, None).status_code, 403)
        self.assertEqual(self.call(RiderLocationView, self.driver, 'post', {'latitude': 10, 'longitude': 120}).status_code, 409)
        self.call(RiderProfileView, self.driver, 'post', {'is_clocked_in': True})
        for coordinates in [{'latitude': 91, 'longitude': 120}, {'latitude': 'NaN', 'longitude': 120}, {}]:
            self.assertEqual(self.call(RiderLocationView, self.driver, 'post', coordinates).status_code, 400)
        self.assertEqual(self.call(RiderLocationView, self.driver, 'post', {'latitude': 10, 'longitude': 120, 'rider_id': self.driver2.id}).status_code, 200)
        self.assertEqual(self.call(RiderProfileView, self.driver).data['latitude'], 10)
        self.assertIsNone(self.call(RiderProfileView, self.driver2).data['latitude'])
        payment = self.checkout(self.proposal(True)); self.complete(payment)
        order = DeliveryOrder.objects.get(payment=payment)
        self.call(RiderOrdersView, self.driver, 'post', order_id=order.id, action='accept')
        self.assertEqual(self.call(RiderProfileView, self.driver, 'post', {'is_clocked_in': False}).status_code, 409)
        self.assertEqual(self.call(RiderOrdersView, self.driver, scope='active').data['id'], order.id)
        self.assertIsNone(self.call(RiderOrdersView, self.driver2, scope='active').data)

    @override_settings(DEBUG=True, ENABLE_SIMULATED_CHECKOUT=True, XENDIT_SECRET_KEY='')
    def test_simulated_checkout_fulfills_without_charging_or_wallet_credit(self):
        from cart.models import Cart, CartItem
        pk = self.proposal()
        cart = Cart.objects.create(buyer=self.buyer)
        CartItem.objects.create(cart=cart, listing=self.art)
        with patch('wallets.views.requests.post') as gateway:
            response = self.call(AgreementCheckoutView, self.buyer, 'post', agreement_id=pk)
            self.assertEqual(response.status_code, 201)
            self.assertTrue(response.data['simulated'])
            gateway.assert_not_called()
        payment = PaymentSession.objects.get(agreement_id=pk)
        self.assertTrue(payment.is_simulated)
        self.assertEqual(payment.status, 'paid')
        self.assertFalse(WalletAccount.objects.filter(user=self.artist).exists())
        self.assertFalse(CartItem.objects.filter(cart=cart).exists())
        self.assertEqual(self.call(PurchaseDownloadView, self.buyer, payment_id=payment.id).status_code, 200)
        self.assertTrue(self.call(PurchasesView, self.buyer).data[0]['can_rate'])
        self.assertEqual(self.call(AgreementCheckoutView, self.buyer, 'post', agreement_id=pk).status_code, 200)
        self.assertEqual(PaymentSession.objects.filter(agreement_id=pk).count(), 1)

    @override_settings(DEBUG=False, ENABLE_SIMULATED_CHECKOUT=True, XENDIT_SECRET_KEY='')
    def test_simulated_checkout_disabled_outside_development(self):
        pk = self.proposal()
        self.assertEqual(self.call(AgreementCheckoutView, self.buyer, 'post', agreement_id=pk).status_code, 503)
        self.assertFalse(PaymentSession.objects.filter(agreement_id=pk).exists())

    def test_address_book_ownership_defaults_and_validation(self):
        fields = {'label': 'Work', 'street': 'Office Road', 'barangay': 'Test', 'city': 'Cebu City', 'province': 'Cebu', 'region': 'Central Visayas', 'postal_code': '6000', 'is_default': True}
        response = self.call(AddressesView, self.buyer, 'post', fields)
        self.assertEqual(response.status_code, 201, response.data)
        address_id = response.data['id']
        self.assertEqual(self.buyer.addresses.count(), 2)
        self.assertEqual(self.buyer.address.id, address_id)
        self.assertEqual(self.buyer.addresses.filter(is_default=True).count(), 1)
        self.assertEqual(self.call(AddressesView, self.other, 'patch', {'city': 'Forged'}, address_id=address_id).status_code, 404)
        self.assertEqual(self.call(AddressesView, self.other, 'delete', address_id=address_id).status_code, 404)
        self.assertEqual(self.call(AddressesView, self.buyer, 'patch', {'street': ''}, address_id=address_id).status_code, 400)
        self.assertEqual(self.call(AddressesView, self.buyer, 'delete', address_id=address_id).status_code, 200)
        self.assertEqual(self.buyer.addresses.filter(is_default=True).count(), 1)

    def test_mapped_quote_binds_addresses_price_parties_and_revision(self):
        self.art.art_type = 'physical'; self.art.save()
        work = Address.objects.create(user=self.buyer, label='Work', street='Office Road', barangay='Test', city='Cebu City', province='Cebu', region='Central Visayas', postal_code='6000')
        with patch('fulfillment.routing.road_distance', return_value=12345) as maps:
            response = self.call(DeliveryQuoteView, self.buyer, 'post', {'address_id': work.id, 'pickup_address_id': work.id}, artwork_id=self.art.id)
        self.assertEqual(response.status_code, 200, response.data)
        self.assertEqual(response.data['fee'], '235.18')
        self.assertEqual(response.data['pickup_address_id'], self.artist.address.id)
        self.assertEqual(response.data['delivery_address_id'], work.id)
        self.assertIn('Office Road', maps.call_args.args[1])
        token = response.data['token']
        data = {'price': '345.18', 'terms': 'Terms', 'delivery_quote': token, 'delivery_fee': '0'}
        self.assertEqual(self.call(ContractsView, self.other, 'post', data, artwork_id=self.art.id).status_code, 400)
        forged = {**data, 'delivery_quote': token + 'x'}
        self.assertEqual(self.call(ContractsView, self.buyer, 'post', forged, artwork_id=self.art.id).status_code, 400)
        with patch('django.core.signing.time.time', return_value=timezone.now().timestamp() + 901):
            self.assertEqual(self.call(ContractsView, self.buyer, 'post', data, artwork_id=self.art.id).status_code, 400)
        work.street = 'Changed'; work.save()
        self.assertEqual(self.call(ContractsView, self.buyer, 'post', data, artwork_id=self.art.id).status_code, 400)
        work.street = 'Office Road'; work.save()
        result = self.call(ContractsView, self.buyer, 'post', data, artwork_id=self.art.id)
        self.assertEqual(result.status_code, 201, result.data)
        agreement = Agreement.objects.get(pk=result.data['id'])
        self.assertEqual(str(agreement.delivery_fee), '235.18')
        # Artist counters with their own pickup, retaining the buyer's selected Work address.
        studio = Address.objects.create(user=self.artist, label='Studio', street='Studio Road', barangay='Test', city='Cebu City', province='Cebu', region='Central Visayas', postal_code='6000')
        token = self.quote(self.artist, agreement, studio.id)
        counter = self.call(ContractsView, self.artist, 'post', {'price': '310', 'terms': 'Counter', 'revision_of': agreement.id, 'delivery_quote': token}, artwork_id=self.art.id)
        self.assertEqual(counter.status_code, 201, counter.data)
        details = Agreement.objects.get(pk=counter.data['id']).delivery_details
        self.assertEqual(details['pickup_address_id'], studio.id)
        self.assertEqual(details['delivery_address_id'], work.id)
        with patch('fulfillment.routing.road_distance') as maps:
            response = self.call(DeliveryQuoteView, self.buyer, 'post', {'address_id': studio.id}, artwork_id=self.art.id)
            self.assertEqual(response.status_code, 400)
            maps.assert_not_called()

    @override_settings(ORS_API_KEY='test-server-key')
    def test_ors_driving_distance_and_provider_errors(self):
        feature = {'properties': {'country_a': 'PHL', 'layer': 'address', 'confidence': 0.95}, 'geometry': {'coordinates': [123.9, 10.3]}}
        with patch('fulfillment.routing.requests.get') as geocoder, patch('fulfillment.routing.requests.post') as maps:
            geocoder.return_value.ok = True
            geocoder.return_value.status_code = 200
            geocoder.return_value.json.return_value = {'features': [feature]}
            maps.return_value.ok = True
            maps.return_value.status_code = 200
            maps.return_value.json.return_value = {'routes': [{'summary': {'distance': 12345.6}}]}
            self.assertEqual(road_distance('Pickup', 'Dropoff'), 12345.6)
            self.assertEqual(geocoder.call_count, 2)
            self.assertEqual(geocoder.call_args.kwargs['params']['boundary.country'], 'PHL')
            self.assertEqual(maps.call_args.kwargs['json']['coordinates'], [[123.9, 10.3], [123.9, 10.3]])
            self.assertEqual(maps.call_args.kwargs['headers']['Authorization'], 'test-server-key')
            self.assertIn('driving-car/json', maps.call_args.args[0])
            maps.return_value.json.return_value = {'routes': []}
            with self.assertRaisesRegex(ValueError, 'No driving route'):
                road_distance('Pickup', 'Dropoff')
            geocoder.return_value.json.return_value = {'features': []}
            with self.assertRaisesRegex(ValueError, 'could not be found'):
                road_distance('Pickup', 'Dropoff')
            geocoder.return_value.json.return_value = {'features': [{**feature, 'properties': {'country_a': 'PHL', 'layer': 'locality', 'confidence': 1}}]}
            with self.assertRaisesRegex(ValueError, 'precisely'):
                road_distance('Pickup', 'Dropoff')
            geocoder.return_value.status_code = 429
            with self.assertRaisesRegex(ValueError, 'limit'):
                road_distance('Pickup', 'Dropoff')
            geocoder.return_value.status_code = 403
            geocoder.return_value.ok = False
            with self.assertRaisesRegex(ValueError, 'map service'):
                road_distance('Pickup', 'Dropoff')
        with override_settings(ORS_API_KEY=''), patch('fulfillment.routing.requests.get') as geocoder:
            with self.assertRaisesRegex(ValueError, 'not configured'):
                road_distance('Pickup', 'Dropoff')
            geocoder.assert_not_called()

    def test_provider_status_verification_ownership_and_exact_payment_match(self):
        from wallets.views import PaymentStatusView
        payment = self.checkout(self.proposal())
        data = {'reference_id': payment.reference_id, 'payment_session_id': payment.xendit_session_id,
                'amount': str(payment.gross_amount), 'currency': 'PHP', 'session_type': 'PAY', 'status': 'COMPLETED'}
        with patch('wallets.views.requests.get') as provider:
            provider.return_value.ok = True
            provider.return_value.json.return_value = data
            self.assertEqual(self.call(PaymentStatusView, self.other, 'post', payment_id=payment.id).status_code, 404)
            provider.assert_not_called()
            for field, wrong in [('amount', '1'), ('currency', 'USD'), ('payment_session_id', 'another'), ('reference_id', 'another'), ('session_type', 'SAVE')]:
                provider.return_value.json.return_value = {**data, field: wrong}
                self.assertEqual(self.call(PaymentStatusView, self.buyer, 'post', payment_id=payment.id).status_code, 502)
                payment.refresh_from_db()
                self.assertEqual(payment.status, 'pending')
            provider.return_value.json.return_value = data
            self.assertEqual(self.call(PaymentStatusView, self.buyer, 'post', payment_id=payment.id).data['status'], 'paid')
            self.assertEqual(self.complete(payment).status_code, 200)
            self.assertEqual(WalletAccount.objects.get(user=self.artist).pending_balance, 100)

    def test_expired_session_allows_new_checkout_and_forbidden_key_is_visible(self):
        from wallets.views import PaymentStatusView
        agreement_id = self.proposal()
        payment = self.checkout(agreement_id)
        with patch('wallets.views.requests.get') as provider:
            provider.return_value.ok = True
            provider.return_value.json.return_value = {'reference_id': payment.reference_id, 'payment_session_id': payment.xendit_session_id, 'amount': str(payment.gross_amount), 'currency': 'PHP', 'session_type': 'PAY', 'status': 'EXPIRED'}
            self.assertEqual(self.call(PaymentStatusView, self.buyer, 'post', payment_id=payment.id).data['status'], 'expired')
        with patch('wallets.views.requests.post') as provider:
            provider.return_value.ok = False
            provider.return_value.status_code = 403
            provider.return_value.json.return_value = {'error_code': 'REQUEST_FORBIDDEN_ERROR'}
            result = self.call(AgreementCheckoutView, self.buyer, 'post', agreement_id=agreement_id)
            self.assertEqual(result.status_code, 502)
            self.assertIn('permissions', result.data['error'])
            self.assertFalse(PaymentSession.objects.filter(agreement_id=agreement_id, status='pending').exists())
            self.assertEqual(provider.call_args.kwargs['json']['customer']['type'], 'INDIVIDUAL')

    def test_dashboard_save_sample_acknowledged_only_with_valid_token(self):
        payload = {'event': 'payment_session.expired', 'data': {'id': 'ps-example', 'reference_id': 'test_session', 'session_type': 'SAVE', 'status': 'EXPIRED', 'currency': 'IDR', 'amount': 100000}}
        before = PaymentSession.objects.count()
        for token, expected in [('wrong', 401), ('callback', 200)]:
            request = self.factory.post('/', payload, format='json', HTTP_X_CALLBACK_TOKEN=token)
            self.assertEqual(xendit_payment_session_webhook(request).status_code, expected)
        self.assertEqual(PaymentSession.objects.count(), before)
        self.assertFalse(WalletAccount.objects.exists())

    def test_webhook_id_alias_and_conflicting_ids(self):
        payment = self.checkout(self.proposal())
        payload = {'event': 'payment_session.completed', 'data': {'id': payment.xendit_session_id, 'payment_session_id': 'different', 'reference_id': payment.reference_id, 'session_type': 'PAY', 'currency': 'PHP', 'amount': str(payment.gross_amount), 'status': 'COMPLETED'}}
        request = self.factory.post('/', payload, format='json', HTTP_X_CALLBACK_TOKEN='callback')
        self.assertEqual(xendit_payment_session_webhook(request).status_code, 400)
        payment.refresh_from_db()
        self.assertEqual(payment.status, 'pending')
        del payload['data']['payment_session_id']
        request = self.factory.post('/', payload, format='json', HTTP_X_CALLBACK_TOKEN='callback')
        self.assertEqual(xendit_payment_session_webhook(request).status_code, 200)
        payment.refresh_from_db()
        self.assertEqual(payment.status, 'paid')
