import base64
import hashlib
from types import SimpleNamespace
from unittest.mock import Mock, patch
from django.test import TestCase, override_settings
from django.utils import timezone
from django.core.files.uploadedfile import SimpleUploadedFile
from rest_framework.test import APIRequestFactory
from web3.exceptions import TransactionNotFound
from users.models import User
from artworks.models import Artwork
from wallets.models import PaymentSession, WalletLedgerEntry
from messaging.models import Agreement, AgreementTemplate, Conversation
from .models import ProvenanceEvent, ProvenanceListing, ProvenanceReview
from .provenance import ensure_artwork, check_checkout, queue_payment, confirmed_event, public_record, reserve_checkout, check_refund, queue_refund, OwnershipConflict
from .ownership_chain import process_event, artwork_id
from .provenance_views import ProvenanceResaleView, ProvenanceReviewView, FileIntegrityView, ProvenanceRetryView, ProvenanceView, ProvenanceOriginalView


@override_settings(BLOCKCHAIN_PROVENANCE_CONFIRMATIONS=1)
class ProvenanceTests(TestCase):
    def setUp(self):
        self.artist, self.buyer, self.next_buyer, self.admin = [User.objects.create(username=name, email=name+'@test.com', firebase_uid=name, role=role) for name, role in [('creator', 'artist'), ('owner-b', 'buyer'), ('owner-c', 'buyer'), ('reviewer', 'platform_admin')]]
        self.content = b'off-chain original bytes'
        self.art = Artwork.objects.create(artist=self.artist, title='X', price=100, status='approved', art_type='digital', image_data='data:image/png;base64,'+base64.b64encode(self.content).decode(), sha256_hash=hashlib.sha256(self.content).hexdigest())
        self.template = AgreementTemplate.objects.create(name='Provenance', body='Terms')
        self.agreement = self.agreement_for(self.art, self.artist, self.buyer)
        self.record = ensure_artwork(self.art)
        self.factory = APIRequestFactory()

    def agreement_for(self, art, artist, buyer, exclusive='exclusive'):
        return Agreement.objects.create(artwork=art, artist=artist, buyer=buyer, conversation=Conversation.objects.create(artwork=art), template=self.template, price=100,
            status='accepted', exclusivity=exclusive, license_scope={'allow_resale': True}, document_snapshot='private agreement with address and signatures',
            buyer_accepted_at=timezone.now(), artist_accepted_at=timezone.now(), buyer_signed_at=timezone.now(), artist_signed_at=timezone.now(),
            buyer_signature_image='signed', artist_signature_image='signed')

    def payment_for(self, agreement=None, status='paid'):
        a = agreement or self.agreement
        return PaymentSession.objects.create(reference_id=f'payment-{PaymentSession.objects.count()}', buyer=a.buyer, artist=a.artist, artwork=a.artwork, agreement=a,
            gross_amount=100, platform_fee=10, artist_amount=90, status=status, paid_at=timezone.now() if status == 'paid' else None, xendit_session_id='session')

    def confirm(self, item):
        confirmed_event(item, int(timezone.now().timestamp()), 10)
        self.record.refresh_from_db()

    def test_registration_offchain_hash_claim_and_no_unconfirmed_owner(self):
        self.assertEqual(self.record.file_hash, hashlib.sha256(self.content).hexdigest())
        data = public_record(self.record)
        self.assertEqual(data['creator_verification'], 'claimed')
        self.assertIsNone(data['current_owner'])
        self.assertIn('does not automatically prove authorship', data['disclaimer'])
        self.assertEqual(ensure_artwork(self.art).pk, self.record.pk)
        self.assertEqual(self.record.events.count(), 1)

    def test_original_claim_and_history_are_immutable(self):
        from django.core.exceptions import ValidationError
        self.record.claimed_creator = self.next_buyer
        with self.assertRaises(ValidationError): self.record.save()
        item=self.record.events.get(kind='registration')
        item.payload['claimed_creator']=self.next_buyer.pk
        with self.assertRaises(ValidationError): item.save()

    def test_public_history_endpoint_does_not_require_login(self):
        with patch('authentication.views.AuthenticatedAPIView.get_request_user', return_value=None):
            response=ProvenanceView.as_view()(self.factory.get('/'),artwork_id=self.art.pk)
        self.assertEqual(response.status_code,200)
        self.assertFalse(response.data['can_review'])

    def test_checkout_snapshot_is_used_after_payment(self):
        p=self.payment_for(status='pending'); reserve_checkout(p)
        self.agreement.license_scope={'allow_resale':False}; self.agreement.save()
        p.status='paid'; p.save()
        self.assertTrue(queue_payment(p).payload['rights']['allow_resale'])

    @override_settings(DEBUG=False, ENABLE_SIMULATED_CHECKOUT=False, XENDIT_SECRET_KEY='test-key')
    @patch('wallets.views.png_bytes', return_value=b'png')
    @patch('wallets.views.requests.post')
    def test_checkout_api_prevents_two_exclusive_provider_sessions(self, provider, _):
        from wallets.views import AgreementCheckoutView
        provider.return_value.ok=True
        provider.return_value.json.return_value={'payment_session_id':'test-session', 'payment_link_url':'https://example.com/pay'}
        with patch('authentication.views.AuthenticatedAPIView.get_request_user', return_value=self.buyer):
            first=AgreementCheckoutView.as_view()(self.factory.post('/',{},format='json'),agreement_id=self.agreement.pk)
        self.assertIn(first.status_code,(200,201),first.data)
        self.assertEqual(first.data['payment_id'], PaymentSession.objects.get(agreement=self.agreement).pk)
        second=self.agreement_for(self.art,self.artist,self.next_buyer)
        with patch('authentication.views.AuthenticatedAPIView.get_request_user', return_value=self.next_buyer):
            denied=AgreementCheckoutView.as_view()(self.factory.post('/',{},format='json'),agreement_id=second.pk)
        self.assertEqual(denied.status_code,409)
        self.assertEqual(provider.call_count,1)

    def test_failed_retry_requires_admin_and_preserves_old_transaction(self):
        item, chain, registry=self.chain_event()
        item.status='failed'; item.save()
        request=lambda: self.factory.post('/',{'event_id':str(item.pk)},format='json')
        with patch('authentication.views.AuthenticatedAPIView.get_request_user', return_value=self.artist):
            denied=ProvenanceRetryView.as_view()(request(),artwork_id=self.art.pk)
        self.assertEqual(denied.status_code,403)
        chain.eth.get_transaction_receipt.return_value=SimpleNamespace(status=0,blockNumber=10)
        with patch('authentication.views.AuthenticatedAPIView.get_request_user', return_value=self.admin), patch('blockchain.ownership_chain.connection',return_value=(chain,registry)):
            response=ProvenanceRetryView.as_view()(request(),artwork_id=self.art.pk)
        self.assertEqual(response.status_code,202,response.data)
        item.refresh_from_db()
        self.assertEqual(item.status,'pending'); self.assertFalse(item.signed_transaction)
        self.assertEqual(item.previous_attempts[0]['transaction_hash'],'0x'+'a'*64)

    def test_payment_queue_idempotent_and_owner_changes_only_on_confirmation(self):
        payment = self.payment_for()
        item = queue_payment(payment)
        self.assertEqual(item.pk, queue_payment(payment).pk)
        self.assertEqual(self.record.current_owner, self.artist)
        self.confirm(self.record.events.get(kind='registration'))
        self.assertEqual(self.record.current_owner, self.artist)
        self.confirm(item)
        self.assertEqual(self.record.current_owner, self.buyer)
        self.assertEqual(self.record.claimed_creator, self.artist)

    def test_refund_appends_confirmed_return_without_rewriting_sale(self):
        self.confirm(self.record.events.get(kind='registration'))
        payment=self.payment_for(); sold=queue_payment(payment); self.confirm(sold)
        check_refund(payment)
        payment.status='refunded'; payment.save()
        queue_refund(payment); queue_refund(payment)
        self.record.refresh_from_db(); self.assertEqual(self.record.current_owner,self.buyer)
        returned=self.record.events.get(reference=f'refund:{payment.pk}')
        self.confirm(returned)
        self.assertEqual(self.record.current_owner,self.artist)
        self.assertEqual(self.record.events.filter(kind='transfer').count(),2)
        sold.refresh_from_db(); self.assertEqual(sold.status,'confirmed')
        check_checkout(self.agreement_for(self.art,self.artist,self.next_buyer))

    def test_refund_cannot_race_an_uncertain_broadcast(self):
        item, _, _=self.chain_event()
        with self.assertRaises(OwnershipConflict): check_refund(item.payment)

    def test_unpaid_nonexclusive_and_simulated_cannot_transfer(self):
        payment = self.payment_for(status='pending')
        self.assertIsNone(queue_payment(payment))
        payment.status='paid'; payment.is_simulated=True; payment.save()
        self.assertIsNone(queue_payment(payment))
        payment.is_simulated=False; payment.save()
        self.agreement.exclusivity='non_exclusive'; self.agreement.save()
        self.assertIsNone(queue_payment(payment))

    def test_duplicate_checkout_and_existing_nonexclusive_license_rejected(self):
        other = self.agreement_for(self.art, self.artist, self.next_buyer)
        self.payment_for(status='pending')
        with self.assertRaises(OwnershipConflict): check_checkout(other)
        self.agreement.exclusivity='non_exclusive'; self.agreement.save()
        with self.assertRaises(OwnershipConflict): check_checkout(other)

    def test_authorized_resale_continues_identity_and_creator_history(self):
        self.confirm(self.record.events.get(kind='registration'))
        self.confirm(queue_payment(self.payment_for()))
        request = self.factory.post('/', {'price':'120'}, format='json')
        with patch('authentication.views.AuthenticatedAPIView.get_request_user', return_value=self.buyer):
            response = ProvenanceResaleView.as_view()(request, artwork_id=self.art.pk)
        self.assertEqual(response.status_code, 201, response.data)
        listing = Artwork.objects.get(pk=response.data['listing_id'])
        self.assertEqual(ProvenanceListing.objects.get(artwork=listing).record_id, self.record.pk)
        listing.status='approved'; listing.save()
        a = self.agreement_for(listing, self.buyer, self.next_buyer)
        check_checkout(a)
        self.confirm(queue_payment(self.payment_for(a)))
        self.record.refresh_from_db()
        data = public_record(self.record)
        self.assertEqual(data['created_by']['id'], self.artist.pk)
        self.assertEqual(data['current_owner']['id'], self.next_buyer.pk)
        self.assertEqual([x['kind'] for x in data['history']], ['registration','transfer','transfer'])
        self.assertNotIn('private agreement', str(data))

    def test_unauthorized_resale_and_unpermitted_resale_rejected(self):
        with patch('authentication.views.AuthenticatedAPIView.get_request_user', return_value=self.next_buyer):
            response = ProvenanceResaleView.as_view()(self.factory.post('/', {'price':'120'}, format='json'), artwork_id=self.art.pk)
        self.assertEqual(response.status_code, 403)
        self.confirm(self.record.events.get(kind='registration'))
        self.agreement.license_scope = {'allow_resale':False}; self.agreement.save()
        self.confirm(queue_payment(self.payment_for()))
        with patch('authentication.views.AuthenticatedAPIView.get_request_user', return_value=self.buyer):
            response = ProvenanceResaleView.as_view()(self.factory.post('/', {'price':'120'}, format='json'), artwork_id=self.art.pk)
        self.assertEqual(response.status_code, 409)

    def chain_event(self):
        self.confirm(self.record.events.get(kind='registration'))
        item = queue_payment(self.payment_for())
        item.transaction_hash='0x'+'a'*64; item.signed_transaction='0x1234'; item.chain_id=31337; item.contract_address='0x'+'1'*40; item.save()
        chain=Mock(); chain.eth.chain_id=31337; chain.eth.block_number=10
        registry=Mock(); registry.address=item.contract_address
        registry.functions.entries.return_value.call.return_value=(artwork_id(self.record.pk), b'', b'', bytes.fromhex(item.record_hash), int(timezone.now().timestamp()), 2)
        return item, chain, registry

    def test_reverted_transfer_does_not_change_owner(self):
        item, chain, registry = self.chain_event()
        chain.eth.get_transaction_receipt.return_value=SimpleNamespace(status=0, blockNumber=10)
        with patch('blockchain.ownership_chain.connection', return_value=(chain, registry)): self.assertEqual(process_event(item.pk), 'failed')
        self.record.refresh_from_db(); self.assertEqual(self.record.current_owner, self.artist)

    def test_rpc_failure_retains_pending_owner_and_hash(self):
        item, _, _ = self.chain_event()
        with patch('blockchain.ownership_chain.connection', side_effect=ConnectionError('offline')): process_event(item.pk)
        item.refresh_from_db(); self.record.refresh_from_db()
        self.assertEqual(item.status, 'pending'); self.assertEqual(self.record.current_owner, self.artist)
        self.assertTrue(item.transaction_hash)

    def test_uncertain_broadcast_reuses_identical_signed_transaction(self):
        item, chain, registry = self.chain_event()
        chain.eth.get_transaction_receipt.side_effect=TransactionNotFound('not mined')
        registry.functions.entries.return_value.call.return_value=(b'',b'',b'',b'',0,0)
        with patch('blockchain.ownership_chain.connection', return_value=(chain,registry)):
            process_event(item.pk); process_event(item.pk)
        self.assertEqual(chain.eth.send_raw_transaction.call_count, 2)
        self.assertEqual(chain.eth.send_raw_transaction.call_args.args[0], bytes.fromhex('1234'))
        self.record.refresh_from_db(); self.assertEqual(self.record.current_owner, self.artist)

    def test_confirmed_receipt_reconciles_once(self):
        item, chain, registry = self.chain_event()
        chain.eth.get_transaction_receipt.return_value=SimpleNamespace(status=1, blockNumber=10)
        with patch('blockchain.ownership_chain.connection', return_value=(chain,registry)):
            self.assertEqual(process_event(item.pk), 'confirmed'); self.assertEqual(process_event(item.pk), 'confirmed')
        self.record.refresh_from_db(); self.assertEqual(self.record.current_owner, self.buyer)
        self.assertEqual(self.record.events.filter(kind='transfer').count(),1)

    def test_review_independent_authorization_append_only_and_pending_attribution(self):
        self.confirm(self.record.events.get(kind='registration'))
        with patch('authentication.views.AuthenticatedAPIView.get_request_user', return_value=self.buyer):
            created = ProvenanceReviewView.as_view()(self.factory.post('/', {'reason':'Review creator evidence','proposed_creator_id':self.next_buyer.pk,'evidence_links':['https://example.com/proof']},format='json'), artwork_id=self.art.pk)
            denied = ProvenanceReviewView.as_view()(self.factory.patch('/', {'review_id':created.data['review_id'],'decision':'approve','note':'Checked evidence'},format='json'), artwork_id=self.art.pk)
        self.assertEqual(denied.status_code,403)
        with patch('authentication.views.AuthenticatedAPIView.get_request_user', return_value=self.admin):
            response=ProvenanceReviewView.as_view()(self.factory.patch('/', {'review_id':created.data['review_id'],'decision':'approve','note':'Independent evidence reviewed'},format='json'),artwork_id=self.art.pk)
        self.assertEqual(response.status_code,202)
        self.record.refresh_from_db(); self.assertEqual(self.record.credited_creator,self.artist)
        self.confirm(ProvenanceEvent.objects.get(pk=response.data['event_id']))
        self.assertEqual(self.record.credited_creator,self.next_buyer); self.assertEqual(self.record.claimed_creator,self.artist)
        self.assertTrue(self.record.creator_verified); self.assertEqual(self.record.events.count(),2)

    def test_file_integrity_and_private_outbox_not_exposed(self):
        response=FileIntegrityView.as_view()(self.factory.post('/', {'file':SimpleUploadedFile('original.png',self.content)},format='multipart'),artwork_id=self.art.pk)
        self.assertTrue(response.data['matches'])
        response=FileIntegrityView.as_view()(self.factory.post('/', {'file':SimpleUploadedFile('changed.png',b'changed')},format='multipart'),artwork_id=self.art.pk)
        self.assertFalse(response.data['matches'])
        self.assertNotIn('signed_transaction', str(public_record(self.record)))

    def test_registered_original_download_requires_confirmed_owner_and_matching_hash(self):
        self.confirm(self.record.events.get(kind='registration'))
        with patch('authentication.views.AuthenticatedAPIView.get_request_user',return_value=self.buyer):
            denied=ProvenanceOriginalView.as_view()(self.factory.get('/'),artwork_id=self.art.pk)
        self.assertEqual(denied.status_code,403)
        self.confirm(queue_payment(self.payment_for()))
        with patch('authentication.views.AuthenticatedAPIView.get_request_user',return_value=self.buyer):
            response=ProvenanceOriginalView.as_view()(self.factory.get('/'),artwork_id=self.art.pk)
        self.assertEqual(response.content,self.content)
        self.art.image_data='data:image/png;base64,'+base64.b64encode(b'changed').decode(); self.art.save()
        with patch('authentication.views.AuthenticatedAPIView.get_request_user',return_value=self.buyer):
            invalid=ProvenanceOriginalView.as_view()(self.factory.get('/'),artwork_id=self.art.pk)
        self.assertEqual(invalid.status_code,409)

    @patch('wallets.views.record_sale_proof')
    @patch('wallets.views.fulfill_payment')
    def test_duplicate_verified_payment_callbacks_queue_one_transfer(self, *_):
        from wallets.views import apply_xendit_status
        p = self.payment_for(status='pending')
        data={'payment_session_id':'session','reference_id':p.reference_id,'amount':100,'currency':'PHP','session_type':'PAY','status':'COMPLETED'}
        apply_xendit_status(p.pk,data); apply_xendit_status(p.pk,data)
        self.assertEqual(ProvenanceEvent.objects.filter(payment=p).count(),1)
        self.assertEqual(WalletLedgerEntry.objects.filter(payment_session=p).count(),1)
