from unittest.mock import patch
from decimal import Decimal
from django.test import TestCase
from django.utils import timezone
from django.core.exceptions import ValidationError
from rest_framework.test import APIRequestFactory
from users.models import User
from artworks.models import Artwork
from artworks.views import ArtworkView, AuctionAgreementPreviewView
from artworks.tests import image_data_url
from messaging.models import AgreementTemplate
from messaging.signing import AgreementSigningView, signing_data, render_pdf
from messaging.contracts import ContractsView
from wallets.views import AgreementCheckoutView
from .models import AuctionListing
from .views import AuctionDetailView, SettleAuctionView, create_auction_agreement
from .licensing import request_document


class AuctionSigningTests(TestCase):
    def setUp(self):
        self.artist = User.objects.create(username='auction-signer', firebase_uid='auction-signer', email='auction-signer@example.com', role='artist')
        self.buyer = User.objects.create(username='auction-winner', firebase_uid='auction-winner', email='auction-winner@example.com', role='buyer')
        self.template = AgreementTemplate.objects.create(name='Signed auction test', body='Artist: {{artist_name}}\nBuyer: {{buyer_name}}\nAmount: {{amount}}\n\nFixed platform terms.')
        self.factory = APIRequestFactory()
        self.payload = {'title':'Signed portrait', 'description':'Original portrait made for this auction', 'category':'Painting', 'categories':['painting'], 'price':'100', 'starting_bid':'100', 'image_data':image_data_url(), 'sale_type':'Auction', 'art_type':'digital', 'bid_increment':'10',
                        'starting_time':(timezone.now()+timezone.timedelta(days=1)).isoformat(), 'end_time':(timezone.now()+timezone.timedelta(days=2)).isoformat(),
                        'auction_agreement_template_id':self.template.pk, 'auction_terms':self.template.body, 'auction_terms_confirmed':True,
                        'auction_license_type':'personal', 'auction_exclusivity':'non_exclusive', 'auction_delivery_type':'digital'}

    def call(self, view, user, data=None, **kwargs):
        request = self.factory.post('/', data or {}, format='json')
        with patch('authentication.views.AuthenticatedAPIView.get_request_user', return_value=user):
            return view.as_view()(request, **kwargs)

    def submit(self):
        document, digest = request_document(self.artist, self.payload)
        payload = {**self.payload, 'auction_signature_name':'Artist Name', 'auction_signature_consent':True, 'auction_document_hash':digest, 'signature_strokes':[[[0.1,0.1],[0.3,0.5],[0.5,0.1]]]}
        response = self.call(ArtworkView, self.artist, payload)
        self.assertEqual(response.status_code, 201, response.data)
        return AuctionListing.objects.get(), document, payload

    def test_past_auction_chat_requires_both_signatures_and_participation(self):
        outsider = User.objects.create(username='outside-bidder', email='outside@example.com', firebase_uid='outside-bidder')
        artwork = Artwork.objects.create(artist=self.artist, title='Auction portrait', price=100)
        auction = AuctionListing.objects.create(
            artwork=artwork, artist=self.artist, highest_bidder=self.buyer,
            starting_bid=100, current_bid=100, status='ENDED',
            end_time=timezone.now() - timezone.timedelta(minutes=1),
        )

        def details(viewer):
            with patch.object(AuctionDetailView, 'get_request_user', return_value=viewer):
                return AuctionDetailView.as_view()(self.factory.get('/'), pk=auction.pk).data

        self.assertFalse(details(outsider)['can_select_winner'])
        self.assertEqual(self.call(SettleAuctionView, outsider, pk=auction.pk).status_code, 403)
        self.assertTrue(details(self.buyer)['can_select_winner'])
        result = self.call(SettleAuctionView, self.artist, pk=auction.pk)
        self.assertEqual(result.status_code, 200, result.data)
        self.assertIsNone(details(self.buyer)['contract_conversation_id'])

        from messaging.models import Agreement
        Agreement.objects.filter(pk=result.data['agreement_id']).update(
            artist_signed_at=timezone.now(), buyer_signed_at=timezone.now(),
            artist_signature_image='artist signature', buyer_signature_image='buyer signature',
        )
        for participant in (self.artist, self.buyer):
            self.assertEqual(details(participant)['contract_conversation_id'], result.data['conversation_id'])
        for nonparticipant in (None, outsider):
            self.assertIsNone(details(nonparticipant)['contract_conversation_id'])

    def test_preview_endpoint_returns_full_signable_document_for_each_delivery_type(self):
        import hashlib
        for delivery in ('physical', 'digital'):
            with self.subTest(delivery=delivery):
                response = self.call(AuctionAgreementPreviewView, self.artist, {**self.payload, 'art_type':delivery, 'auction_delivery_type':delivery})
                self.assertEqual(response.status_code, 200, response.data)
                self.assertIn('ART LICENSING AGREEMENT', response.data['document'])
                self.assertIn('Signed portrait', response.data['document'])
                self.assertEqual(response.data['document_hash'], hashlib.sha256(response.data['document'].encode()).hexdigest())

    def test_artist_must_review_current_document_and_sign_before_request(self):
        self.assertEqual(self.call(ArtworkView, self.artist, self.payload).status_code, 400)
        self.assertFalse(Artwork.objects.exists())
        self.assertEqual(self.call(AuctionAgreementPreviewView, self.buyer, self.payload).status_code, 403)
        auction, document, payload = self.submit()
        self.assertEqual(auction.signed_document, document)
        self.assertTrue(auction.artist_signature_image.startswith('data:image/png;base64,'))
        self.assertTrue(auction.artist_signed_at)
        self.assertEqual(auction.status, 'PENDING_APPROVAL')
        auction.license_type = 'commercial'
        with self.assertRaises(ValidationError):
            auction.save()

    def test_stale_or_tampered_signature_document_is_rejected(self):
        _, digest = request_document(self.artist, self.payload)
        payload = {**self.payload, 'auction_signature_name':'Artist Name', 'auction_signature_consent':True, 'auction_document_hash':digest, 'signature_strokes':[[[0.1,0.1],[0.3,0.5]]]}
        payload['auction_license_type']='commercial'
        self.assertEqual(self.call(ArtworkView, self.artist, payload).status_code, 409)
        self.assertFalse(Artwork.objects.exists())

    def test_winner_signs_preserved_terms_and_checkout_waits_for_buyer_signature(self):
        auction, original, _ = self.submit()
        self.template.body='Changed template wording'; self.template.save()
        auction.status='PAYMENT_PENDING'; auction.save()
        agreement = create_auction_agreement(auction, self.buyer, Decimal('250'))
        self.assertEqual(agreement.artist_presigned_document, original)
        self.assertEqual(agreement.artist_signature_image, auction.artist_signature_image)
        agreement.license_type = 'commercial'
        with self.assertRaises(ValidationError):
            agreement.save()
        agreement.refresh_from_db()
        self.assertEqual(agreement.artist_signed_at, auction.artist_signed_at)
        self.assertFalse(agreement.buyer_signed_at)
        checkout = self.call(AgreementCheckoutView, self.buyer, agreement_id=agreement.pk)
        self.assertEqual(checkout.status_code, 409)
        document = signing_data(agreement, self.buyer)
        self.assertTrue(document['document'].startswith(original))
        self.assertIn('Final winning bid: PHP 250', document['document'])
        with patch('messaging.signing.record_agreement_proof') as proof:
            result = self.call(AgreementSigningView, self.buyer, {'signature':'Winner Name', 'consent':True, 'document_hash':document['document_hash'], 'signature_strokes':[[[0.1,0.1],[0.3,0.5]]]}, agreement_id=agreement.pk)
            self.assertEqual(result.status_code, 200, result.data)
            self.assertTrue(result.data['fully_signed'])
            proof.assert_called_once()
        agreement.refresh_from_db()
        self.assertEqual(agreement.artist_presigned_document, original)
        self.assertEqual(agreement.artist_signature_image, auction.artist_signature_image)
        self.assertTrue(render_pdf(agreement).startswith(b'%PDF-'))

    def test_auction_cannot_be_replaced_by_a_negotiated_license(self):
        auction, _, _ = self.submit()
        auction.artwork.status='approved'; auction.artwork.save()
        response = self.call(ContractsView, self.buyer, {'price':'500','terms':'Different license'}, artwork_id=auction.artwork_id)
        self.assertEqual(response.status_code, 409)
