import base64
import io
import uuid
from datetime import timedelta
from unittest.mock import Mock, patch

import requests
from PIL import Image
from django.test import TestCase, override_settings
from django.utils import timezone

from .ai_detector import DetectorUnavailable, ScreeningPending, screen_image, screen_upload, screening_configuration
from .hashing import decode_image_data
from .models import ArtworkAIScan
from .tests import image_data_url


def response(body=None, status=200):
    result = Mock(status_code=status)
    result.json.return_value = body
    return result


def completed(label='AI Generated', confidence=90):
    return {'status': 'done', 'result': confidence,
            'result_details': {'is_valid': True, 'final_result': label, 'final_label_confidence': confidence}}


@override_settings(TRUTHSCAN_API_KEY='unit-test-secret', ARTWORK_AUTO_AI_THRESHOLD=.8)
class TruthScanTests(TestCase):
    def setUp(self):
        self.image = image_data_url()
        self.job = str(uuid.uuid4())
        self.location = {'presigned_url': 'https://nyc3.digitaloceanspaces.com/bucket/uploads/sample.jpg?signature=private',
                         'file_path': 'uploads/sample.jpg'}

    def flow(self, payload=None):
        upload = response()
        upload.json.side_effect = AssertionError('A successful storage PUT has no JSON body')
        return [response(self.location), upload, response({'id': self.job, 'status': 'pending'}),
                response(payload or completed())]

    def test_documented_flow_preserves_bytes_and_keeps_secrets_and_job_ids_private(self):
        with patch('artworks.truthscan._send', side_effect=self.flow()) as http:
            result = screen_image(self.image)
        self.assertEqual(result['status'], 'review_required')
        self.assertEqual(result['provider_label'], 'AI Generated')
        self.assertEqual(result['score'], .9)
        calls = http.call_args_list
        self.assertEqual([c.args[0] for c in calls], ['GET', 'PUT', 'POST', 'POST'])
        self.assertEqual(calls[0].kwargs['headers']['apikey'], 'unit-test-secret')
        self.assertEqual(calls[1].kwargs['data'], decode_image_data(self.image))
        self.assertEqual(calls[1].kwargs['headers'], {'Content-Type': 'image/jpeg', 'x-amz-acl': 'private'})
        self.assertEqual(calls[2].kwargs['json']['url'], self.location['presigned_url'].split('?')[0])
        self.assertFalse(calls[2].kwargs['json']['generate_preview'])
        self.assertEqual(calls[3].kwargs['json'], {'id': self.job})
        for secret in ['unit-test-secret', self.job, 'signature=private', 'presigned_url']:
            self.assertNotIn(secret, str(result))

    def test_real_confidence_is_not_misread_as_ai_likelihood(self):
        with patch('artworks.truthscan._send', side_effect=self.flow(completed('Real', 99))):
            result = screen_image(self.image)
        self.assertEqual(result['status'], 'clear')
        self.assertEqual(result['label_confidence'], .99)
        self.assertEqual(result['provider_label'], 'Real')
        self.assertEqual(result['score'], 0)

    def test_current_cdn_upload_response_maps_to_the_documented_detection_origin(self):
        self.location = {'presigned_url': 'https://image-presigned-upload.ai-assets-cdn.com/?filename=sample.jpg&signature=private',
                         'file_path': 'uploads/sample.jpg'}
        with patch('artworks.truthscan._send', side_effect=self.flow()) as http:
            self.assertEqual(screen_image(self.image)['score'], .9)
        self.assertEqual(http.call_args_list[2].kwargs['json']['url'],
                         'https://ai-image-detector-prod.nyc3.digitaloceanspaces.com/uploads/sample.jpg')

    def test_ai_editing_is_distinguished_from_full_generation(self):
        with patch('artworks.truthscan._send', side_effect=self.flow(completed('AI Edited', 80))):
            result = screen_image(self.image)
        self.assertEqual(result['status'], 'review_required')
        self.assertEqual(result['provider_label'], 'AI Edited')

    def test_digital_editing_alone_does_not_accuse_artist_of_ai_generation(self):
        with patch('artworks.truthscan._send', side_effect=self.flow(completed('Digitally Edited', 98))):
            result = screen_image(self.image)
        self.assertEqual(result['status'], 'clear')
        self.assertEqual(result['label_confidence'], .98)

    def test_persisted_results_reuse_preview_on_submission_and_apply_current_threshold(self):
        with patch('artworks.truthscan._send', side_effect=self.flow()) as http:
            first = screen_upload(self.image, [self.image])
            with override_settings(ARTWORK_AUTO_AI_THRESHOLD=.95):
                second = screen_upload(self.image)
        self.assertEqual(http.call_count, 4)
        self.assertEqual(ArtworkAIScan.objects.count(), 1)
        self.assertEqual(first['status'], 'review_required')
        self.assertEqual(second['status'], 'clear')

    def test_pending_result_is_polled_without_resubmission(self):
        with patch('artworks.truthscan._send', side_effect=self.flow({'status': 'pending'}) + [response(completed())]) as http:
            with self.assertRaises(ScreeningPending):
                screen_image(self.image)
            result = screen_image(self.image)
        self.assertEqual(result['score'], .9)
        self.assertEqual(http.call_count, 5)
        self.assertTrue(http.call_args.args[1].endswith('/query'))

    def test_lost_submission_reply_keeps_id_and_only_queries_on_retry(self):
        initial = self.flow()[:2] + [requests.Timeout('Do not expose this internal URL')]
        with patch('artworks.truthscan._send', side_effect=initial + [response(completed())]) as http:
            with self.assertRaises(DetectorUnavailable):
                screen_image(self.image)
            scan = ArtworkAIScan.objects.get()
            submitted_id = http.call_args.kwargs['json']['id']
            self.assertEqual(scan.job_id, submitted_id)
            self.assertEqual(scan.state, 'pending')
            result = screen_image(self.image)
        self.assertEqual(result['score'], .9)
        self.assertEqual(http.call_count, 4)
        self.assertEqual(http.call_args.kwargs['json'], {'id': submitted_id})

    def test_bad_result_never_falls_back_to_a_clear_score_or_rebills(self):
        for payload in [completed('Unknown', 90), completed('AI Generated', float('nan')), completed('Real', True)]:
            ArtworkAIScan.objects.all().delete()
            with patch('artworks.truthscan._send', side_effect=self.flow(payload) + [response(completed())]) as http:
                with self.assertRaises(DetectorUnavailable):
                    screen_image(self.image)
                self.assertEqual(screen_image(self.image)['score'], .9)
                self.assertEqual(http.call_count, 5)

    def test_inflight_worker_lease_prevents_parallel_billable_jobs(self):
        with patch('artworks.truthscan._send', side_effect=self.flow({'status': 'pending'})):
            with self.assertRaises(ScreeningPending):
                screen_image(self.image)
        scan = ArtworkAIScan.objects.get()
        scan.lease_until = timezone.now() + timedelta(seconds=30)
        scan.save()
        with patch('artworks.truthscan._send') as http:
            with self.assertRaises(ScreeningPending):
                screen_image(self.image)
        http.assert_not_called()

    def test_worker_that_loses_lease_during_upload_cannot_submit_a_paid_job(self):
        replacement_lease = timezone.now() + timedelta(minutes=5)
        def transfer(method, url, **kwargs):
            if method == 'GET':
                return response(self.location)
            ArtworkAIScan.objects.update(lease_until=replacement_lease)
            return response()
        with patch('artworks.truthscan._send', side_effect=transfer) as http:
            with self.assertRaises(ScreeningPending):
                screen_image(self.image)
        self.assertEqual(http.call_count, 2)
        self.assertEqual(ArtworkAIScan.objects.get().lease_until, replacement_lease)
        self.assertFalse(ArtworkAIScan.objects.get().job_id)

    def test_untrusted_storage_url_is_rejected_before_uploading_any_image(self):
        with patch('artworks.truthscan._send', return_value=response({
            'presigned_url': 'http://127.0.0.1/uploads/sample.jpg', 'file_path': 'uploads/sample.jpg'})) as http:
            with self.assertRaises(DetectorUnavailable):
                screen_image(self.image)
        self.assertEqual(http.call_count, 1)

    def test_invalid_gallery_image_is_rejected_before_any_paid_call(self):
        with patch('artworks.truthscan._send') as http:
            with self.assertRaises(ValueError):
                screen_upload(self.image, ['invalid image'])
        http.assert_not_called()

    def test_tiny_but_valid_gallery_image_is_rejected_before_spending_cover_credit(self):
        data = io.BytesIO()
        Image.new('RGB', (2, 2)).save(data, format='PNG')
        small = 'data:image/png;base64,' + base64.b64encode(data.getvalue()).decode()
        with patch('artworks.truthscan._send') as http:
            with self.assertRaises(ValueError):
                screen_upload(self.image, [small])
        http.assert_not_called()

    @override_settings(TRUTHSCAN_API_KEY='')
    def test_missing_key_blocks_screening_without_fallback(self):
        with patch('artworks.truthscan._send') as http:
            with self.assertRaises(DetectorUnavailable):
                screen_image(self.image)
        http.assert_not_called()

    @override_settings(ARTWORK_AI_PROVIDER='auto')
    def test_truthscan_is_required_even_with_legacy_provider_configuration(self):
        self.assertEqual(screening_configuration()['provider'], 'truthscan')
        with override_settings(TRUTHSCAN_API_KEY=''):
            self.assertEqual(screening_configuration()['provider'], 'truthscan')
            self.assertFalse(screening_configuration()['configured'])
        with override_settings(ARTWORK_AI_PROVIDER='local'):
            self.assertEqual(screening_configuration()['provider'], 'truthscan')

    def test_scanning_does_not_import_torch_or_datasets(self):
        import builtins
        original_import = builtins.__import__
        def without_research(name, *args, **kwargs):
            if name.split('.')[0] in {'torch', 'torchvision', 'datasets'}:
                raise AssertionError('Application screening must not require training dependencies')
            return original_import(name, *args, **kwargs)
        with patch('artworks.truthscan._send', side_effect=self.flow()), patch('builtins.__import__', side_effect=without_research):
            self.assertEqual(screen_image(self.image)['provider'], 'truthscan')

    def test_exhausted_credits_never_returns_clear_or_retries_a_paid_submission(self):
        with patch('artworks.truthscan._send', side_effect=self.flow()[:2] + [response(status=403)]) as http:
            with self.assertRaises(DetectorUnavailable):
                screen_image(self.image)
            with self.assertRaises(DetectorUnavailable):
                screen_image(self.image)
        self.assertEqual(http.call_count, 3)
