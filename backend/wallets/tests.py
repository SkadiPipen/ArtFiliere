from decimal import Decimal
from unittest.mock import patch
from django.test import TestCase, override_settings
from django.utils import timezone
from rest_framework.test import APIRequestFactory
from users.models import User, Address
from artworks.models import Artwork
from messaging.models import Agreement, AgreementTemplate, Conversation, Message
from .auction_delivery import AuctionDeliveryQuoteView, AUCTION_MESSAGE
from .views import AgreementCheckoutView
from .models import PaymentSession


@override_settings(DEBUG=True, ENABLE_SIMULATED_CHECKOUT=True)
class AuctionCheckoutTests(TestCase):
    def setUp(self):
        self.factory = APIRequestFactory()
        self.buyer = User.objects.create(username='auction-buyer', firebase_uid='auction-buyer', email='buyer@example.com', date_of_birth='2000-01-01', role='buyer', contact_number='09123456789')
        self.artist = User.objects.create(username='auction-artist', firebase_uid='auction-artist', email='artist@example.com', date_of_birth='2000-01-01', role='artist')
        Address.objects.create(user=self.artist, street='123 Studio Street', barangay='Lahug', city='Cebu City', province='Cebu', region='Central Visayas', postal_code='6000')
        self.art = Artwork.objects.create(artist=self.artist, title='Auction art', price=100, status='approved', art_type='physical')
        self.agreement = Agreement.objects.create(conversation=Conversation.objects.create(artwork=self.art),
            template=AgreementTemplate.objects.create(name='Auction', body='Fixed terms'), artwork=self.art,
            buyer=self.buyer, artist=self.artist, price=Decimal('1000'), delivery_type='physical', status='accepted',
            buyer_accepted_at=timezone.now(), artist_accepted_at=timezone.now(), buyer_signed_at=timezone.now(),
            artist_signed_at=timezone.now(), buyer_signature_image='signed', artist_signature_image='signed',
            terms_snapshot='Fixed auction terms', document_snapshot='Signed fixed auction document')
        Message.objects.create(conversation=self.agreement.conversation, agreement=self.agreement, sender=None, message_type='system', body=AUCTION_MESSAGE)
        self.details = {'recipient_name': 'Recipient', 'recipient_phone': '09123456789',
                        'delivery_address': '456 Buyer Street, Mandaue City, Cebu 6014', 'delivery_notes': 'Call on arrival'}

    def call(self, view, data=None, user=None, method='post'):
        request = getattr(self.factory, method)('/', data or {}, format='json')
        with patch('authentication.views.AuthenticatedAPIView.get_request_user', return_value=user or self.buyer):
            return view.as_view()(request, agreement_id=self.agreement.pk)

    def quote(self):
        with patch('delivery.views.estimate_distance_from_addresses', return_value=10):
            return self.call(AuctionDeliveryQuoteView, self.details)

    def test_quote_prefill_and_ownership(self):
        self.assertTrue(self.call(AgreementCheckoutView, method='get').data['is_auction'])
        self.assertEqual(self.quote().data['total'], '1170.00')
        self.assertEqual(self.call(AuctionDeliveryQuoteView, self.details, self.artist).status_code, 404)

    def test_payment_preserves_bid_and_signed_document_and_resumes(self):
        quote = self.quote().data
        with patch('wallets.views.fulfill_payment') as dispatch, patch('wallets.views.record_sale_proof'):
            response = self.call(AgreementCheckoutView, {'delivery_quote': quote['token'], 'price': '1', 'delivery_fee': '0'})
            self.assertEqual(response.status_code, 201, response.data)
            payment = PaymentSession.objects.get(pk=response.data['purchase_id'])
            self.assertEqual(payment.gross_amount, Decimal('1170'))
            self.assertEqual(payment.artist_amount + payment.platform_fee, Decimal('1000'))
            self.agreement.refresh_from_db()
            self.assertEqual(self.agreement.price, Decimal('1000'))
            self.assertEqual(self.agreement.document_snapshot, 'Signed fixed auction document')
            self.assertEqual(self.agreement.delivery_details['recipient_name'], 'Recipient')
            dispatch.assert_called_once()
            self.assertEqual(self.call(AgreementCheckoutView).status_code, 200)
            self.assertEqual(PaymentSession.objects.count(), 1)

    def test_missing_tampered_and_expired_quote_cannot_pay(self):
        token = self.quote().data['token']
        self.assertEqual(self.call(AgreementCheckoutView).status_code, 400)
        self.assertEqual(self.call(AgreementCheckoutView, {'delivery_quote': token + 'x'}).status_code, 400)
        with patch('django.core.signing.time.time', return_value=timezone.now().timestamp() + 1000):
            self.assertEqual(self.call(AgreementCheckoutView, {'delivery_quote': token}).status_code, 400)
        self.assertFalse(PaymentSession.objects.exists())

    def test_blank_address_and_other_agreement_quote_rejected(self):
        self.assertEqual(self.call(AuctionDeliveryQuoteView, {**self.details, 'delivery_address': ''}).status_code, 400)
        token = self.quote().data['token']
        self.agreement.price = Decimal('2000')
        self.agreement.save(update_fields=['price'])
        self.assertEqual(self.call(AgreementCheckoutView, {'delivery_quote': token}).status_code, 400)

    def test_unsigned_checkout_still_requires_signatures(self):
        token = self.quote().data['token']
        self.agreement.buyer_signed_at = None
        self.agreement.save(update_fields=['buyer_signed_at'])
        self.assertEqual(self.call(AgreementCheckoutView, {'delivery_quote': token}).status_code, 409)
        self.assertFalse(PaymentSession.objects.exists())

    def test_digital_auction_skips_delivery_and_uses_winning_bid(self):
        self.art.art_type = 'digital'
        self.art.save(update_fields=['art_type'])
        self.agreement.delivery_type = 'digital'
        self.agreement.save(update_fields=['delivery_type'])
        with patch('wallets.views.png_bytes', return_value=b'png'), patch('wallets.views.fulfill_payment'), patch('wallets.views.record_sale_proof'):
            response = self.call(AgreementCheckoutView)
        self.assertEqual(response.status_code, 201, response.data)
        self.assertEqual(PaymentSession.objects.get().gross_amount, Decimal('1000'))
        self.assertEqual(self.call(AuctionDeliveryQuoteView, self.details).status_code, 409)

    def test_regular_negotiated_purchase_retains_existing_delivery_requirement(self):
        self.agreement.messages.all().delete()
        self.assertFalse(self.call(AgreementCheckoutView, method='get').data['is_auction'])
        self.assertEqual(self.call(AgreementCheckoutView).status_code, 409)
        self.assertEqual(self.call(AuctionDeliveryQuoteView, self.details).status_code, 409)

    def test_dispatch_uses_checkout_recipient_address_fee_and_notes(self):
        from fulfillment.services import fulfill_payment
        from delivery.views import serialize_active_order
        token = self.quote().data['token']
        with patch('wallets.views.fulfill_payment'), patch('wallets.views.record_sale_proof'):
            response = self.call(AgreementCheckoutView, {'delivery_quote': token})
        payment = PaymentSession.objects.select_related('agreement').get(pk=response.data['purchase_id'])
        with patch('delivery.views.geocode_address_nominatim', return_value=(10.3, 123.9)):
            fulfill_payment(payment)
        order = payment.delivery_orders.get()
        self.assertEqual(order.buyer_name, 'Recipient')
        self.assertEqual(order.buyer_phone, '09123456789')
        self.assertEqual(order.address, self.details['delivery_address'])
        self.assertEqual(order.delivery_fee, Decimal('170'))
        self.assertEqual(serialize_active_order(order)['buyer']['instructions'], 'Call on arrival')
