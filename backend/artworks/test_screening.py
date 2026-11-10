from unittest.mock import patch

from django.test import TestCase, SimpleTestCase, override_settings
from rest_framework.test import APIRequestFactory

from users.models import User
from .ai_detector import DetectorUnavailable, ScreeningPending, screen_upload
from .models import Artwork, ArtworkSimilarityMatch
from .hashing import compute_sha256, compute_perceptual_hash, compute_difference_hash, compute_edge_hash
from .tests import image_data_url
from .views import ArtworkView, ArtworkReviewView, ArtworkSimilarityReviewView, ArtworkAIReviewView, ArtworkImageScreenView


def screening(score=.3):
    return {'score': score, 'threshold': .8, 'status': 'review_required' if score >= .8 else 'clear',
            'review_status': 'pending' if score >= .8 else 'not_required', 'model_version': 'test', 'images': []}


class ScreeningAggregationTests(SimpleTestCase):
    def test_gallery_ai_flag_cannot_be_hidden_by_clear_cover(self):
        with patch('artworks.ai_detector.screen_image', side_effect=[screening(.3), screening(.9)]):
            result = screen_upload(image_data_url(), [image_data_url(quality=55)])
        self.assertEqual(result['image_index'], 1)
        self.assertEqual(result['status'], 'review_required')

    def test_runtime_threshold_applies_to_provider_scores(self):
        from .ai_detector import screen_image
        with override_settings(ARTWORK_AUTO_AI_THRESHOLD=.8), patch('artworks.truthscan.screen_with_truthscan', side_effect=[{'score': .799}, {'score': .8}]):
            self.assertEqual(screen_image(image_data_url())['status'], 'clear')
            result = screen_image(image_data_url())
        self.assertEqual(result['status'], 'review_required')
        self.assertEqual(result['threshold'], .8)
        self.assertNotIn('training_threshold', result)


class ArtworkScreeningTests(TestCase):
    def setUp(self):
        self.artist = User.objects.create(username='screen-artist', email='screen-artist@example.com', firebase_uid='screen-artist', role='artist')
        self.mod = User.objects.create(username='screen-mod', email='screen-mod@example.com', firebase_uid='screen-mod', role='creative_moderator')
        self.other = User.objects.create(username='screen-other', email='screen-other@example.com', firebase_uid='screen-other', role='buyer')
        self.image = image_data_url()
        self.payload = {'title': 'Screened art', 'description': 'Original painting', 'price': '11', 'image_data': self.image,
                        'categories': ['painting'], 'art_type': 'digital', 'sale_type': 'Direct Sell', 'hours': '1', 'hourly_rate': '10'}

    def call(self, view, user, method='get', data=None, **kwargs):
        request = getattr(APIRequestFactory(), method)('/', data or {}, format='json')
        with patch('authentication.views.AuthenticatedAPIView.get_request_user', return_value=user):
            return view.as_view()(request, **kwargs)

    def submit(self, score=.3, **payload):
        with patch('artworks.views.screen_upload', return_value=screening(score)):
            return self.call(ArtworkView, self.artist, 'post', {**self.payload, **payload})

    def reference(self):
        return Artwork.objects.create(artist=self.other, title='Existing original', description='Original', price=10,
                                      image_data=self.image, status='approved', sha256_hash=compute_sha256(self.image),
                                      perceptual_hash=compute_perceptual_hash(self.image), difference_hash=compute_difference_hash(self.image), edge_hash=compute_edge_hash(self.image))

    def test_low_score_follows_normal_review_and_cannot_be_forged(self):
        response = self.submit(ai_screening=screening(.99), status='approved', automated_block_reason='fake')
        self.assertEqual(response.status_code, 201)
        self.assertEqual(response.data['status'], 'pending')
        self.assertEqual(response.data['ai_screening']['score'], .3)
        self.assertFalse(response.data['automated_block_reason'])

    def test_high_ai_score_is_held_for_evidence_review_without_automatic_rejection(self):
        response = self.submit(.9)
        pk = response.data['id']
        self.assertEqual(response.data['status'], 'pending')
        self.assertEqual(response.data['automated_block_reason'], '')
        self.assertEqual(response.data['ai_screening']['review_status'], 'pending')
        self.assertEqual(self.call(ArtworkView, None, artwork_id=pk).status_code, 404)
        self.assertEqual(self.call(ArtworkReviewView, self.mod, 'patch', {'status': 'approved'}, artwork_id=pk).status_code, 409)
        self.assertEqual(self.call(ArtworkAIReviewView, self.mod, 'patch', {'note': 'Reviewed sketches and original process files.'}, artwork_id=pk).status_code, 200)

    def test_ai_threshold_is_inclusive_and_below_threshold_is_normal_review(self):
        below = self.submit(.799, image_data=image_data_url(quality=55))
        self.assertEqual(below.data['status'], 'pending')
        self.assertFalse(below.data['automated_block_reason'])
        at = self.submit(.8)
        self.assertEqual(at.data['status'], 'pending')
        self.assertEqual(at.data['ai_screening']['status'], 'review_required')
        self.assertFalse(at.data['automated_block_reason'])

    def test_legacy_manual_ai_flag_still_requires_documented_clearance(self):
        legacy = {**screening(.9), 'status': 'review_required', 'review_status': 'pending'}
        artwork = Artwork.objects.create(artist=self.artist, title='Legacy held artwork', price=10, image_data=self.image, ai_screening=legacy)
        pk = artwork.pk
        self.assertEqual(self.call(ArtworkReviewView, self.mod, 'patch', {'status': 'approved'}, artwork_id=pk).status_code, 409)
        self.assertEqual(self.call(ArtworkAIReviewView, self.artist, 'patch', {'note': 'Reviewed sketches and original process files.'}, artwork_id=pk).status_code, 403)
        self.assertEqual(self.call(ArtworkAIReviewView, self.mod, 'patch', {'note': 'short'}, artwork_id=pk).status_code, 400)
        cleared = self.call(ArtworkAIReviewView, self.mod, 'patch', {'note': 'Reviewed sketches and original process files.'}, artwork_id=pk)
        self.assertEqual(cleared.status_code, 200)
        self.assertEqual(cleared.data['ai_screening']['review_status'], 'cleared')
        # Isolate moderation from the independently tested external blockchain flow.
        Artwork.objects.filter(pk=pk).update(sha256_hash=None)
        self.assertEqual(self.call(ArtworkReviewView, self.mod, 'patch', {'status': 'approved'}, artwork_id=pk).status_code, 200)

    def test_identical_upload_is_private_read_only_evidence_with_reference(self):
        original = self.reference()
        response = self.submit()
        self.assertEqual(response.status_code, 201)
        pk = response.data['id']
        self.assertEqual(response.data['status'], 'declined')
        self.assertEqual(response.data['automated_block_reason'], 'exact_duplicate')
        self.assertEqual(response.data['similarity_matches'], [])  # No private reference leakage to uploader.
        match = ArtworkSimilarityMatch.objects.get(artwork_id=pk)
        self.assertEqual(match.reference_artwork_id, original.pk)
        self.assertEqual(match.review_status, 'auto_blocked')
        self.assertIsNone(Artwork.objects.get(pk=pk).sha256_hash)
        for user in (None, self.other):
            self.assertEqual(self.call(ArtworkView, user, artwork_id=pk).status_code, 404)
        detail = self.call(ArtworkView, self.mod, artwork_id=pk)
        self.assertEqual(detail.status_code, 200)
        self.assertEqual(detail.data['similarity_matches'][0]['reference_artwork_id'], original.pk)
        self.assertEqual(self.call(ArtworkReviewView, self.mod, 'patch', {'status': 'approved'}, artwork_id=pk).status_code, 409)
        self.assertEqual(self.call(ArtworkSimilarityReviewView, self.mod, 'patch', {'review_status': 'not_a_copy'}, match_id=match.pk).status_code, 409)
        self.assertEqual(self.call(ArtworkAIReviewView, self.mod, 'patch', {'note': 'Reviewed sketches and original process files.'}, artwork_id=pk).status_code, 409)
        self.assertEqual(self.call(ArtworkView, self.artist, 'patch', {'categories': ['drawing']}, artwork_id=pk).status_code, 409)
        self.assertNotIn(pk, [r['id'] for r in self.call(ArtworkView, None).data])

    @override_settings(ARTWORK_AUTO_SIMILARITY_THRESHOLD=.8)
    def test_similarity_at_threshold_blocks_but_below_requires_review(self):
        self.reference()
        with patch('artworks.views.similarity_confidence', return_value=.8):
            blocked = self.submit(image_data=image_data_url(quality=55))
        self.assertEqual(blocked.data['automated_block_reason'], 'high_similarity')
        with patch('artworks.views.similarity_confidence', return_value=.799):
            held = self.submit(image_data=image_data_url(quality=65))
        self.assertEqual(held.data['status'], 'pending')
        self.assertFalse(held.data['automated_block_reason'])
        self.assertTrue(held.data['similarity_review_required'])

    def test_unavailable_detector_does_not_accept_unchecked_submission(self):
        with patch('artworks.views.screen_upload', side_effect=DetectorUnavailable('Temporarily unavailable')):
            response = self.call(ArtworkView, self.artist, 'post', self.payload)
        self.assertEqual(response.status_code, 503)
        self.assertFalse(Artwork.objects.exists())

    def test_provider_validation_error_is_a_client_error_not_a_server_crash(self):
        with patch('artworks.views.screen_upload', side_effect=ValueError('Upload a larger image.')):
            response = self.call(ArtworkView, self.artist, 'post', self.payload)
        self.assertEqual(response.status_code, 400)
        self.assertFalse(Artwork.objects.exists())

    def test_preflight_is_artist_only_and_does_not_create_listing(self):
        with patch('artworks.views.screen_upload', return_value=screening(.9)):
            self.assertEqual(self.call(ArtworkImageScreenView, self.other, 'post', {'image_data': self.image}).status_code, 403)
            response = self.call(ArtworkImageScreenView, self.artist, 'post', {'image_data': self.image})
        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.data['status'], 'review_required')
        self.assertFalse(Artwork.objects.exists())

    def test_pending_external_scan_returns_pollable_response_without_listing(self):
        with patch('artworks.views.screen_upload', side_effect=ScreeningPending()):
            response = self.call(ArtworkImageScreenView, self.artist, 'post', {'image_data': self.image})
        self.assertEqual(response.status_code, 202)
        self.assertEqual(response.data, {'status': 'processing', 'retry_after': 2})
        self.assertEqual(response['Cache-Control'], 'private, no-store')
        self.assertFalse(Artwork.objects.exists())

    @override_settings(ARTWORK_AI_PROVIDER='truthscan', TRUTHSCAN_API_KEY='not-a-real-key')
    def test_provider_configuration_exposes_disclosure_but_no_credentials(self):
        response = self.call(ArtworkImageScreenView, self.artist)
        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.data['provider'], 'truthscan')
        self.assertTrue(response.data['external_service'])
        self.assertNotIn('not-a-real-key', str(response.data))
        self.assertEqual(self.call(ArtworkImageScreenView, self.other).status_code, 403)
