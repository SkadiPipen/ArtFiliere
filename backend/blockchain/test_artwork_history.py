from unittest.mock import patch
from django.core.exceptions import ValidationError
from django.test import TestCase
from django.utils import timezone
from users.models import User, ActivityLog
from artworks.models import Artwork
from fulfillment.models import DownloadFingerprint
from fulfillment.fingerprint_lookup import FingerprintLookupView
from . import test_provenance as fixtures
from .models import BlockchainTransaction, ProvenanceArtwork, ProvenanceListing, SaleTermsSnapshot
from .provenance_views import ArtworkHistoryView, CreatorAttributionView, ProvenanceView, ArtworkVerificationView, ArtworkInvestigationListView, ProvenanceReviewQueueView
from .sale_terms import capture_sale_terms


class ArtworkHistoryTests(TestCase):
    setUp = fixtures.ProvenanceTests.setUp
    agreement_for = fixtures.ProvenanceTests.agreement_for
    payment_for = fixtures.ProvenanceTests.payment_for

    def moderator(self):
        return User.objects.create(username='creative-history', email='private-mod@example.com',
                                   firebase_uid='creative-history', role='creative_moderator')

    def call(self, view, user, artwork_id=None, data=None, method='get'):
        request = getattr(self.factory, method)('/', data or {}, format='json')
        with patch('authentication.views.AuthenticatedAPIView.get_request_user', return_value=user):
            kwargs = {'artwork_id': artwork_id or self.art.pk} if view != FingerprintLookupView else {}
            return view.as_view()(request, **kwargs)

    def test_full_history_is_admin_only_even_for_creator_and_buyer(self):
        for user in (None, self.artist, self.buyer, self.moderator()):
            self.assertEqual(self.call(ArtworkHistoryView, user).status_code, 403)
        self.assertEqual(self.call(ArtworkHistoryView, self.admin).status_code, 200)

    def test_creator_endpoint_exposes_only_attribution_and_survives_resale(self):
        resale = Artwork.objects.create(artist=self.buyer, title='Resale X', price=150, status='approved', art_type='digital')
        ProvenanceListing.objects.create(artwork=resale, record=self.record)
        response = self.call(CreatorAttributionView, None, resale.pk)
        self.assertEqual(set(response.data), {'created_by', 'creator_verification', 'disputed'})
        self.assertEqual(response.data['created_by']['id'], self.artist.pk)
        self.assertNotIn(self.buyer.username, str(response.data))
        legacy = self.call(ProvenanceView, None)
        self.assertEqual(legacy.data['history'], [])
        self.assertEqual(legacy.data['entitlements'], [])
        self.assertNotIn('file_hash', legacy.data)

    def test_frozen_purchase_terms_and_proofs_are_available_without_payment_secrets(self):
        payment = self.payment_for()
        payment.xendit_payment_id = 'SECRET_PROVIDER_ID'; payment.save()
        self.agreement.license_scope = {'allow_resale': True, 'products': 'Art prints'}
        self.agreement.license_type = 'commercial'
        self.agreement.compensation_type = 'royalty'
        self.agreement.compensation_terms = {'subtype': 'gross_sales', 'rate': '10', 'calculation': {'basis': 'gross_sales'}}
        self.agreement.save()
        snapshot = capture_sale_terms(payment, 'checkout')
        self.agreement.license_scope = {'allow_resale': False, 'products': 'CHANGED'}
        self.agreement.save()
        BlockchainTransaction.objects.create(artwork=self.art, entity_type='payment', entity_id=payment.pk,
            operation='sale_record', network='local', status='confirmed', transaction_hash='0x' + 'a' * 64, block_number=17)
        mod = self.admin
        result = self.call(ArtworkHistoryView, mod)
        self.assertEqual(result.status_code, 200)
        sale = result.data['sections']['sales'][0]
        self.assertEqual(sale['license']['scope']['products'], 'Art prints')
        self.assertTrue(sale['license']['scope']['allow_resale'])
        self.assertEqual(sale['license']['compensation_terms']['rate'], '10')
        self.assertEqual(sale['license']['compensation_terms']['calculation']['basis'], 'gross_sales')
        self.assertEqual(sale['document_hash'], snapshot.document_hash)
        self.assertEqual(sale['buyer']['id'], self.buyer.pk)
        self.assertEqual(result.data['sections']['blockchain_proofs'][0]['block_number'], 17)
        for secret in ('SECRET_PROVIDER_ID', self.buyer.email, 'private agreement with address', 'buyer_signature_image'):
            self.assertNotIn(secret, str(result.data))
        self.assertEqual(result['Cache-Control'], 'private, no-store')
        self.assertTrue(ActivityLog.objects.filter(user=mod, action='artwork_history_view').exists())

    def test_snapshot_cannot_be_rewritten(self):
        snapshot = capture_sale_terms(self.payment_for(), 'checkout')
        snapshot.terms['license_type'] = 'commercial'
        with self.assertRaises(ValidationError):
            snapshot.save()

    def test_registration_labels_artist_and_initial_owner_without_a_buyer(self):
        result = self.call(ArtworkHistoryView, self.admin)
        registration = result.data['sections']['ownership_events'][0]
        self.assertEqual(registration['artist']['id'], self.artist.pk)
        self.assertEqual(registration['initial_owner']['id'], self.artist.pk)
        self.assertIsNone(registration['buyer'])
        self.assertIsNone(registration['seller'])

    def test_recovering_existing_sale_proof_does_not_invent_a_historical_snapshot(self):
        from .proofs import record_sale_proof
        payment = self.payment_for()
        existing = BlockchainTransaction.objects.create(artwork=self.art, operation='sale_record', entity_type='payment',
            entity_id=payment.pk, network='local', status='confirmed', proof_hash='a'*64, transaction_hash='0x'+'b'*64)
        with patch('blockchain.proofs.verify_sale', return_value=(True, None)):
            self.assertEqual(record_sale_proof(payment).pk, existing.pk)
        self.assertFalse(SaleTermsSnapshot.objects.exists())

    def test_history_groups_resales_and_labels_missing_historical_snapshots(self):
        first = self.payment_for()
        resale = Artwork.objects.create(artist=self.buyer, title='Resale X', price=150, status='approved')
        ProvenanceListing.objects.create(artwork=resale, record=self.record)
        agreement = self.agreement_for(resale, self.buyer, self.next_buyer, exclusive='non_exclusive')
        second = self.payment_for(agreement)
        response = self.call(ArtworkHistoryView, self.admin, resale.pk)
        self.assertEqual(response.data['created_by']['id'], self.artist.pk)
        self.assertEqual(set(response.data['listing_ids']), {self.art.pk, resale.pk})
        self.assertEqual({r['id'] for r in response.data['sections']['sales']}, {first.pk, second.pk})
        self.assertTrue(all(r['terms_source'] == 'legacy_current_record' for r in response.data['sections']['sales']))
        self.assertFalse(SaleTermsSnapshot.objects.exists())  # GET does not invent old snapshots.

    def test_history_before_registration_never_creates_chain_events(self):
        pending = Artwork.objects.create(artist=self.artist, title='Unregistered', price=10, status='pending')
        count = ProvenanceArtwork.objects.count()
        response = self.call(ArtworkHistoryView, self.admin, pending.pk)
        self.assertEqual(response.status_code, 200)
        self.assertIsNone(response.data['record_id'])
        self.assertEqual(ProvenanceArtwork.objects.count(), count)
        self.assertEqual(self.call(CreatorAttributionView, None, pending.pk).status_code, 404)

    def test_history_paginates_without_losing_sales(self):
        for _ in range(26):
            self.payment_for()
        mod = self.admin
        first = self.call(ArtworkHistoryView, mod)
        second = self.call(ArtworkHistoryView, mod, data={'page': 2})
        self.assertEqual(len(first.data['sections']['sales']), 25)
        self.assertEqual(len(second.data['sections']['sales']), 1)
        self.assertEqual(first.data['next_page'], 2)
        self.assertIsNone(second.data['next_page'])
        self.assertEqual(self.call(ArtworkHistoryView, mod, data={'page': 'invalid'}).status_code, 400)

    def test_admin_can_trace_copy_with_audited_access(self):
        payment = self.payment_for()
        DownloadFingerprint.objects.create(token='0' * 60 + '1', buyer=self.buyer, artist=self.artist,
            source_key=f'payment:{payment.pk}', source_sha256='a' * 64, issued_at=timezone.now(),
            license_snapshot={'license_type': 'personal', 'terms_snapshot': 'PRIVATE SIGNATURE AND ADDRESS'})
        mod = self.admin
        result = self.call(FingerprintLookupView, mod, data={'code': 'AF-0000000000000001'}, method='post')
        self.assertEqual(result.status_code, 200)
        self.assertEqual(result.data['buyer']['id'], self.buyer.pk)
        self.assertTrue(ActivityLog.objects.filter(user=mod, action='artwork_code_lookup').exists())
        history = self.call(ArtworkHistoryView, mod)
        self.assertEqual(history.data['sections']['digital_copies'][0]['payment_id'], payment.pk)

    def test_sale_proof_binds_frozen_checkout_document_even_if_agreement_changes(self):
        from .proofs import record_sale_proof
        from .utils import sha256_record
        payment = self.payment_for()
        frozen = capture_sale_terms(payment, 'checkout')
        self.agreement.document_snapshot = 'New text after checkout'; self.agreement.save()
        with patch('blockchain.proofs._recover_receipt', return_value=None), \
             patch('blockchain.proofs.record_sale', return_value={'transaction_hash': '0x' + 'b' * 64, 'block_number': 8}), \
             patch('blockchain.proofs.sha256_record', wraps=sha256_record) as digest:
            record_sale_proof(payment)
        self.assertEqual(digest.call_args.args[0]['license_document_hash'], frozen.document_hash)

    def test_commission_resale_resolves_original_artist_and_related_proofs(self):
        from commissions.models import CommissionRequest, CommissionMilestone, CommissionSubmission, CommissionAsset, CommissionResale, CommissionProof
        commission = CommissionRequest.objects.create(buyer=self.buyer, artist=self.artist, title='Commissioned X', deadline=timezone.now())
        stage = CommissionMilestone.objects.create(commission_req=commission, milestone_number=3, percentage=100)
        submission = CommissionSubmission.objects.create(milestone=stage, uploader=self.artist, filename='PRIVATE-FILENAME.png',
            content_type='image/png', content=b'original', sha256='a' * 64)
        asset = CommissionAsset.objects.create(commission=commission, original_artist=self.artist, owner=self.buyer,
            submission=submission, license_terms={'license_type': 'commercial', 'allow_resale': True, 'private_field': 'SECRET'}, record_hash='b' * 64)
        resale = Artwork.objects.create(artist=self.buyer, title='Resold commission', price=140, status='approved')
        CommissionResale.objects.create(artwork=resale, asset=asset, seller=self.buyer)
        CommissionProof.objects.create(commission=commission, asset=asset, registry_id='123',
            record_hash='c' * 64, transaction_hash='0x' + 'd' * 64, block_number=21, status='CONFIRMED')
        result = self.call(ArtworkHistoryView, self.admin, resale.pk)
        self.assertEqual(result.status_code, 200)
        self.assertEqual(result.data['created_by']['id'], self.artist.pk)
        self.assertEqual(result.data['commission']['id'], commission.pk)
        self.assertEqual(result.data['sections']['commission_proofs'][0]['block_number'], 21)
        self.assertNotIn('SECRET', str(result.data))
        self.assertNotIn('PRIVATE-FILENAME', str(result.data))

    def test_royalty_records_omit_provider_tokens(self):
        from datetime import date
        from messaging.models import RoyaltyPeriod, RoyaltyReceipt, RoyaltyFunding
        period = RoyaltyPeriod.objects.create(agreement=self.agreement, starts_on=date(2026, 10, 1), ends_on=date(2026, 11, 1),
            due_on=date(2026, 11, 8), terms={}, amount=10, status='paid')
        RoyaltyReceipt.objects.create(period=period, amount=10, provider_payment_id='PRIVATE-RECEIPT-ID')
        RoyaltyFunding.objects.create(period=period, amount=10, reference='test-fund', session_id='PRIVATE-FUND-ID')
        result = self.call(ArtworkHistoryView, self.admin)
        self.assertEqual(result.status_code, 200)
        self.assertEqual(result.data['sections']['royalty_receipts'][0]['amount'], '10.00')
        self.assertEqual(len(result.data['sections']['royalty_funding']), 1)
        self.assertNotIn('PRIVATE-RECEIPT-ID', str(result.data))
        self.assertNotIn('PRIVATE-FUND-ID', str(result.data))

    def test_moderator_verification_excludes_investigation_data(self):
        self.payment_for()
        mod = self.moderator()
        response = self.call(ArtworkVerificationView, mod)
        self.assertEqual(response.status_code, 200)
        self.assertEqual(set(response.data), {'title', 'created_by', 'creator_verification', 'disputed', 'registration_status'})
        self.assertEqual(response.data['created_by']['id'], self.artist.pk)
        self.assertNotIn(self.buyer.username, str(response.data))
        self.assertEqual(response['Cache-Control'], 'private, no-store')
        self.assertEqual(self.call(FingerprintLookupView, mod, method='post').status_code, 400)
        provenance = self.call(ProvenanceView, mod)
        self.assertEqual(provenance.data['history'], [])
        self.assertEqual(provenance.data['entitlements'], [])
        self.assertNotIn('file_hash', provenance.data)

    def test_verification_pending_artwork_and_role_restrictions(self):
        pending = Artwork.objects.create(artist=self.artist, title='Pending', price=10, status='pending')
        response = self.call(ArtworkVerificationView, self.moderator(), pending.pk)
        self.assertEqual(response.data['registration_status'], 'not_registered')
        for user in (None, self.artist, self.buyer):
            self.assertEqual(self.call(ArtworkVerificationView, user).status_code, 403)

    def test_admin_investigation_search_and_role_restrictions(self):
        def request(user, data=None):
            with patch('authentication.views.AuthenticatedAPIView.get_request_user', return_value=user):
                return ArtworkInvestigationListView.as_view()(self.factory.get('/', data or {}))
        for user in (None, self.artist, self.buyer, self.moderator()):
            self.assertEqual(request(user).status_code, 403)
        response = request(self.admin, {'q': str(self.art.pk)})
        self.assertEqual(response.status_code, 200)
        self.assertIn(self.art.pk, [row['id'] for row in response.data['items']])
        self.assertEqual(request(self.admin, {'q': 'no-such-artwork'}).data['items'], [])
        self.assertEqual(request(self.admin, {'page': 'invalid'}).status_code, 400)
        self.assertEqual(request(self.admin, {'page': 0}).status_code, 400)

    def test_creative_moderator_can_trace_copy_without_private_investigation_fields(self):
        payment = self.payment_for()
        DownloadFingerprint.objects.create(token='0' * 60 + '1', buyer=self.buyer, artist=self.artist,
            source_key=f'payment:{payment.pk}', source_sha256='a' * 64, issued_at=timezone.now(),
            license_snapshot={'license_type': 'personal', 'terms_snapshot': 'PRIVATE SIGNATURE AND ADDRESS'})
        mod = self.moderator()
        response = self.call(FingerprintLookupView, mod, data={'code': 'AF-0000000000000001'}, method='post')
        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.data['buyer'], {'id': self.buyer.pk, 'username': self.buyer.username})
        self.assertEqual(response.data['artwork']['id'], self.art.pk)
        self.assertEqual(set(response.data['blockchain']), {'status'})
        self.assertNotIn('PRIVATE SIGNATURE', str(response.data))
        self.assertNotIn(self.buyer.email, str(response.data))
        self.assertTrue(ActivityLog.objects.filter(user=mod, action='artwork_code_lookup').exists())
        self.assertEqual(self.call(ArtworkHistoryView, mod).status_code, 403)

    def test_failed_queue_is_admin_only_and_attribution_disputes_remain_for_creative(self):
        from .models import ProvenanceEvent, ProvenanceReview
        item = ProvenanceEvent.objects.filter(record=self.record).first()
        item.status = 'failed'
        item.save(update_fields=['status'])
        review = ProvenanceReview.objects.create(record=self.record, requested_by=self.artist, reason='Incorrect creator claim')
        mod = self.moderator()
        def request(user):
            with patch('authentication.views.AuthenticatedAPIView.get_request_user', return_value=user):
                return ProvenanceReviewQueueView.as_view()(self.factory.get('/'))
        response = request(mod)
        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.data['failed_transactions'], [])
        self.assertIn(review.pk, [row['id'] for row in response.data['reviews']])
        response = request(self.admin)
        self.assertIn(str(item.pk), [row['id'] for row in response.data['failed_transactions']])
        self.assertIn(review.pk, [row['id'] for row in response.data['reviews']])
        for user in (None, self.artist, self.buyer):
            self.assertEqual(request(user).status_code, 403)
