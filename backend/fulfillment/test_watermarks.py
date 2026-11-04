from io import BytesIO
from unittest.mock import Mock, patch

from django.test import TestCase, override_settings
from PIL import Image

from .models import DownloadFingerprint
from .watermarks import WatermarkUnavailable, protected_image
from .watermarks import faint_tag
from .watermarks import tag_lines, license_details
from . import tests as fixtures


class WatermarkTests(TestCase):
    setUp = fixtures.FulfillmentTests.setUp
    call = fixtures.FulfillmentTests.call
    proposal = fixtures.FulfillmentTests.proposal

    def test_transaction_alias_preserves_hidden_token_and_legacy_lookup(self):
        from django.utils import timezone
        from blockchain.models import BlockchainTransaction
        from .tracking import attach_transaction, find_code
        from .watermarks import copy_code
        record = DownloadFingerprint.objects.create(token='0' * 60 + '1', artist=self.artist,
            buyer=self.buyer, source_key='payment:123', source_sha256='a' * 64, issued_at=timezone.now())
        proof = BlockchainTransaction.objects.create(artwork=self.art, operation='sale_record',
            entity_type='payment', entity_id=123, network='local', status='failed', transaction_hash='ab' * 32)
        attach_transaction(record)
        self.assertIsNone(record.transaction_code)
        proof.status = 'confirmed'; proof.save()
        attach_transaction(record)
        self.assertTrue(copy_code(record).startswith('AF-TX-'))
        self.assertEqual(find_code(copy_code(record)).pk, record.pk)
        self.assertEqual(find_code('AF-0000000000000001').pk, record.pk)
        self.assertEqual(record.token, '0' * 60 + '1')
        alias = record.transaction_code
        attach_transaction(record)
        self.assertEqual(record.transaction_code, alias)

    def test_sale_proof_binds_buyer_artist_and_signed_license(self):
        from wallets.models import PaymentSession
        from messaging.models import Agreement
        from blockchain.proofs import record_sale_proof
        from blockchain.utils import sha256_record, sha256_bytes
        pk = self.proposal()
        agreement = Agreement.objects.get(pk=pk)
        payment = PaymentSession.objects.create(reference_id='tracking-proof', buyer=self.buyer,
            artist=self.artist, artwork=self.art, agreement=agreement, status='paid',
            gross_amount=100, platform_fee=10, artist_amount=90)
        with patch('blockchain.proofs._recover_receipt', return_value=None), patch('blockchain.proofs.record_sale', return_value={'transaction_hash': 'ab' * 32, 'block_number': 42}), patch('blockchain.proofs.sha256_record', wraps=sha256_record) as hash_record:
            proof = record_sale_proof(payment)
        payload = hash_record.call_args.args[0]
        self.assertEqual(payload['buyer_id'], self.buyer.pk)
        self.assertEqual(payload['artist_id'], self.artist.pk)
        self.assertEqual(payload['license_document_hash'], sha256_bytes((agreement.document_snapshot or agreement.terms_snapshot).encode()))
        self.assertEqual(proof.status, 'confirmed')

    def test_code_only_tag_links_to_private_license_snapshot(self):
        pk = self.proposal()
        snapshot = license_details(f'agreement:{pk}')
        record = DownloadFingerprint(token='0' * 60 + '1', artist_id=self.artist.pk,
                                     buyer_id=self.buyer.pk, license_snapshot=snapshot)
        label = '\n'.join(tag_lines(record, 'Artist'))
        self.assertEqual(label, 'AF-0000000000000001')
        self.assertEqual(snapshot['reference'], f'AGR-{pk}')
        self.assertIn('license_scope', snapshot)

    def test_lookup_is_staff_only_and_returns_buyer_artwork_and_license(self):
        from django.utils import timezone
        from .fingerprint_lookup import FingerprintLookupView
        pk = self.proposal()
        record = DownloadFingerprint.objects.create(token='0' * 60 + '1', artist=self.artist,
            buyer=self.buyer, source_key=f'agreement:{pk}', source_sha256='a' * 64,
            license_snapshot=license_details(f'agreement:{pk}'), issued_at=timezone.now())
        payload = {'code': 'af-0000000000000001'}
        self.assertEqual(self.call(FingerprintLookupView, self.buyer, 'post', payload).status_code, 403)
        for role in ('customer_support', 'platform_admin'):
            self.other.role = role
            response = self.call(FingerprintLookupView, self.other, 'post', payload)
            self.assertEqual(response.status_code, 200)
            self.assertEqual(response.data['buyer']['id'], self.buyer.pk)
            self.assertEqual(response.data['artwork']['id'], self.art.pk)
            self.assertEqual(response.data['license']['agreement_id'], pk)
            self.assertEqual(response['Cache-Control'], 'private, no-store')
        self.assertEqual(self.call(FingerprintLookupView, self.other, 'post', {'code': 'bad'}).status_code, 400)
        record.issued_at = None
        record.save()
        self.assertEqual(self.call(FingerprintLookupView, self.other, 'post', payload).status_code, 404)

    def test_faint_tag_changes_pixels_and_does_not_include_buyer_identity(self):
        record = DownloadFingerprint(token='0' * 60 + '1', artist_id=self.artist.pk, buyer_id=self.buyer.pk)
        image = Image.new('RGB', (900, 600), 'gray')
        result = faint_tag(image, record)
        from PIL import ImageChops
        self.assertIsNotNone(ImageChops.difference(image, result).getbbox())
        self.assertEqual(result.size, image.size)

    def test_royalty_download_calls_watermarker_only_for_authorized_buyer(self):
        from messaging.models import Agreement
        from .views import RoyaltyLicenseDownloadView
        pk = self.proposal()
        Agreement.objects.filter(pk=pk).update(compensation_type='royalty')
        with patch('fulfillment.watermarks.protected_image', return_value=b'protected') as protect:
            response = self.call(RoyaltyLicenseDownloadView, self.other, agreement_id=pk)
            self.assertEqual(response.status_code, 404)
            protect.assert_not_called()
            response = self.call(RoyaltyLicenseDownloadView, self.buyer, agreement_id=pk)
            self.assertEqual(response.content, b'protected')
            self.assertEqual(protect.call_args.kwargs, {
                'source_key': f'agreement:{pk}', 'buyer_id': self.buyer.pk,
                'artist_id': self.artist.pk})

    def image(self):
        output = BytesIO()
        Image.new('RGBA', (256, 256), (90, 130, 170, 180)).save(output, 'PNG')
        return output.getvalue()

    def protect(self, raw, source='payment:1', buyer=None):
        return protected_image(raw, source_key=source, buyer_id=(buyer or self.buyer).pk, artist_id=self.artist.pk)

    @override_settings(DOWNLOAD_WATERMARK_ENABLED=False)
    def test_disabled_does_not_write_record(self):
        raw = self.image()
        self.assertEqual(self.protect(raw), raw)
        self.assertFalse(DownloadFingerprint.objects.exists())

    @override_settings(DOWNLOAD_WATERMARK_ENABLED=True, DOWNLOAD_VISIBLE_TAG_ENABLED=True)
    def test_visible_code_identity_stability_and_transparency(self):
        from .tracking import find_code
        from .watermarks import copy_code
        raw = self.image()
        result = self.protect(raw)
        first = DownloadFingerprint.objects.get()
        self.protect(raw)
        self.assertEqual(DownloadFingerprint.objects.count(), 1)
        self.assertEqual(find_code(copy_code(first)).pk, first.pk)
        self.assertIsNotNone(first.issued_at)
        with Image.open(BytesIO(result)) as image, Image.open(BytesIO(raw)) as original:
            self.assertEqual(image.getchannel('A').tobytes(), original.getchannel('A').tobytes())
            self.assertNotEqual(image.convert('RGB').tobytes(), original.convert('RGB').tobytes())
            self.assertEqual(image.size, original.size)
            self.assertEqual(image.info, {})
        self.protect(raw, source='payment:2', buyer=self.other)
        self.assertEqual(DownloadFingerprint.objects.count(), 2)
        self.assertEqual(first.buyer_id, self.buyer.pk)

    @override_settings(DOWNLOAD_WATERMARK_ENABLED=True)
    def test_invalid_image_blocks_download_and_is_not_issued(self):
        with self.assertLogs('fulfillment.watermarks', level='ERROR'):
            with self.assertRaises(WatermarkUnavailable):
                self.protect(b'not an image')
        self.assertIsNone(DownloadFingerprint.objects.get().issued_at)
