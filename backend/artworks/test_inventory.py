from unittest.mock import Mock, patch

from django.test import SimpleTestCase, TestCase, override_settings
from django.utils import timezone
from rest_framework.test import APIRequestFactory

from users.models import User
from messaging.models import Agreement, AgreementTemplate, Conversation
from wallets.models import PaymentSession
from blockchain.provenance import check_checkout, OwnershipConflict
from .inventory import inventory_summary, listing_inventory, validate_copy_rights
from .models import Artwork
from .serializers import ArtworkSerializer


class InventoryInputTests(SimpleTestCase):
    def test_original_and_legacy_requests_are_single_copy(self):
        self.assertEqual(listing_inventory({}, 'physical', 'Direct Sell'),
                         dict(physical_format='original', stock_quantity=1, edition_size=None))
        with self.assertRaises(ValueError):
            listing_inventory({'stock_quantity': 2}, 'physical', 'Direct Sell')

    def test_edition_stock_and_auction_limits(self):
        self.assertEqual(listing_inventory({'physical_format': 'limited_edition', 'stock_quantity': '12', 'edition_size': 50}, 'physical', 'Direct Sell')['edition_size'], 50)
        for fields in [
            {'physical_format': 'print', 'stock_quantity': True},
            {'physical_format': 'print', 'stock_quantity': 1.5},
            {'physical_format': 'print', 'stock_quantity': 0},
            {'physical_format': 'print', 'stock_quantity': 100000},
            {'physical_format': 'limited_edition', 'stock_quantity': 12, 'edition_size': 10},
            {'physical_format': 'limited_edition', 'stock_quantity': 12},
        ]:
            with self.subTest(fields=fields), self.assertRaises(ValueError):
                listing_inventory(fields, 'physical', 'Direct Sell')
        with self.assertRaises(ValueError):
            listing_inventory({'physical_format': 'print', 'stock_quantity': 2}, 'physical', 'Auction')


class PhysicalInventoryTests(TestCase):
    def setUp(self):
        self.artist = User.objects.create(username='stock-artist', email='stock-artist@example.com', firebase_uid='stock-artist', role='artist')
        self.buyers = [User.objects.create(username=f'stock-buyer-{n}', email=f'stock-buyer-{n}@example.com', firebase_uid=f'stock-buyer-{n}', role='buyer') for n in range(3)]
        self.art = Artwork.objects.create(artist=self.artist, title='Print edition', price=100,
            art_type='physical', physical_format='limited_edition', stock_quantity=2, edition_size=50, status='approved')
        template = AgreementTemplate.objects.create(name='Stock agreement', body='One print')
        self.agreements = [Agreement.objects.create(artwork=self.art, artist=self.artist, buyer=buyer,
            conversation=Conversation.objects.create(artwork=self.art), template=template, price=100,
            status='accepted', delivery_type='physical', exclusivity='non_exclusive',
            artist_signed_at=timezone.now(), buyer_signed_at=timezone.now()) for buyer in self.buyers]

    def payment(self, index, status='pending', simulated=False):
        return PaymentSession.objects.create(reference_id=f'stock-{index}-{PaymentSession.objects.count()}',
            artwork=self.art, artist=self.artist, buyer=self.buyers[index], agreement=self.agreements[index],
            status=status, is_simulated=simulated, gross_amount=100, platform_fee=10, artist_amount=90)

    def test_reservations_and_paid_copies_prevent_overselling(self):
        check_checkout(self.agreements[0])
        first = self.payment(0)
        self.assertEqual(inventory_summary(self.art)['available'], 1)
        check_checkout(self.agreements[1])
        second = self.payment(1, 'paid')
        self.assertEqual(inventory_summary(self.art)['available'], 0)
        with self.assertRaises(OwnershipConflict):
            check_checkout(self.agreements[2])
        first.status = 'expired'; first.save(update_fields=['status'])
        check_checkout(self.agreements[2])
        self.assertEqual(inventory_summary(self.art)['available'], 1)
        second.status = 'refunded'; second.save(update_fields=['status'])
        self.assertEqual(inventory_summary(self.art)['available'], 2)

    def test_settlement_is_counted_once_and_listing_only_sells_out_at_zero(self):
        first = self.payment(0)
        first.status = 'paid'; first.save(update_fields=['status'])
        first.save(update_fields=['status'])
        self.assertEqual(inventory_summary(self.art)['sold'], 1)
        self.assertFalse(ArtworkSerializer(self.art).get_is_sold(self.art))
        self.payment(1, 'paid')
        self.assertTrue(ArtworkSerializer(self.art).get_is_sold(self.art))

    def test_simulation_does_not_consume_real_inventory(self):
        self.payment(0, 'paid', simulated=True)
        self.assertEqual(inventory_summary(self.art)['available'], 2)

    @override_settings(DEBUG=False, XENDIT_SECRET_KEY='unit-test', ENABLE_SIMULATED_CHECKOUT=False)
    def test_checkout_reserves_each_copy_and_resumes_without_reserving_twice(self):
        from wallets.views import AgreementCheckoutView
        factory = APIRequestFactory()
        for agreement in self.agreements:
            agreement.artist_accepted_at = agreement.buyer_accepted_at = timezone.now()
            agreement.artist_signature_image = agreement.buyer_signature_image = 'signed'
            agreement.delivery_details = {'recipient_name': 'Test recipient'}
            agreement.save()
        provider = Mock(ok=True)
        provider.json.side_effect = [
            {'payment_session_id': 'stock-session-1', 'payment_link_url': 'https://checkout.example/1'},
            {'payment_session_id': 'stock-session-2', 'payment_link_url': 'https://checkout.example/2'},
        ]
        def checkout(index):
            with patch('authentication.views.AuthenticatedAPIView.get_request_user', return_value=self.buyers[index]):
                return AgreementCheckoutView.as_view()(factory.post('/', {}, format='json'), agreement_id=self.agreements[index].pk)
        with patch('wallets.views.requests.post', return_value=provider) as api, patch('wallets.checkout_customer.checkout_customer', return_value={}):
            self.assertEqual(checkout(0).status_code, 201)
            self.assertEqual(checkout(0).status_code, 200)
            self.assertEqual(inventory_summary(self.art)['available'], 1)
            self.assertEqual(checkout(1).status_code, 201)
            self.assertEqual(checkout(2).status_code, 409)
            self.assertEqual(api.call_count, 2)
        self.assertEqual(PaymentSession.objects.count(), 2)

    def test_print_terms_cannot_assign_artwork_wide_rights(self):
        validate_copy_rights(self.art, 'non_exclusive', {})
        for exclusivity, scope in [('exclusive', {}), ('sole', {}), ('non_exclusive', {'copyright_transfer': {'kind': 'full'}})]:
            with self.assertRaises(ValueError):
                validate_copy_rights(self.art, exclusivity, scope)
        self.agreements[0].exclusivity = 'exclusive'
        with self.assertRaises(OwnershipConflict):
            check_checkout(self.agreements[0])

    def test_post_request_persists_stock_for_moderation(self):
        from .views import ArtworkView
        from .tests import image_data_url
        request = APIRequestFactory().post('/', {
            'title': 'Physical edition', 'description': 'Prints of my original painting',
            'price': '110', 'hours': '1', 'hourly_rate': '100', 'art_type': 'physical',
            'physical_format': 'limited_edition', 'stock_quantity': 12, 'edition_size': 50,
            'image_data': image_data_url(), 'categories': ['painting'],
        }, format='json')
        with patch('authentication.views.AuthenticatedAPIView.get_request_user', return_value=self.artist), \
             patch('artworks.views.screen_upload', return_value={'status': 'clear'}), \
             patch('artworks.views._create_similarity_matches', return_value=[]):
            response = ArtworkView.as_view()(request)
        self.assertEqual(response.status_code, 201, response.data)
        self.assertEqual(response.data['stock_quantity'], 12)
        self.assertEqual(response.data['edition_size'], 50)
        self.assertEqual(response.data['status'], 'pending')
