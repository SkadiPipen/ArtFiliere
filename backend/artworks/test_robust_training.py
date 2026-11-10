import io

from django.core.management import call_command
from django.test import TestCase

from users.models import User
from .models import Artwork, ArtworkReviewLog


class ReopenAIHoldTests(TestCase):
    def test_reopens_only_ai_declines_preserves_history_and_is_idempotent(self):
        artist = User.objects.create(username='held-artist', email='held@example.com', firebase_uid='held-artist', role='artist')
        ai = Artwork.objects.create(artist=artist, title='False positive candidate', price=10, status='declined',
            automated_block_reason='high_ai_score', decline_reason='Old automatic AI decision',
            ai_screening={'score': .87, 'threshold': .8, 'status': 'auto_blocked', 'review_status': 'automatic'})
        similarity = Artwork.objects.create(artist=artist, title='Similarity evidence', price=10, status='declined', automated_block_reason='high_similarity')
        call_command('reopen_ai_holds', stdout=io.StringIO())
        ai.refresh_from_db(); similarity.refresh_from_db()
        self.assertEqual(ai.status, 'pending')
        self.assertEqual(ai.automated_block_reason, '')
        self.assertEqual(ai.ai_screening['review_status'], 'pending')
        self.assertEqual(ai.ai_screening['previous_automatic_decision']['reason'], 'Old automatic AI decision')
        self.assertEqual(similarity.automated_block_reason, 'high_similarity')
        call_command('reopen_ai_holds', stdout=io.StringIO())
        self.assertEqual(ArtworkReviewLog.objects.filter(artwork=ai, action='ai_hold_reopened').count(), 1)
