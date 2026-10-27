from datetime import datetime, timezone as tz
from types import SimpleNamespace
from django.test import SimpleTestCase
from .availability import blocks_public_listing

class CatalogueLicenseTests(SimpleTestCase):
    def agreement(self, **overrides):
        values = dict(status='accepted', exclusivity='exclusive', artist_signed_at=datetime(2025, 1, 1, tzinfo=tz.utc), buyer_signed_at=datetime(2025, 2, 1, tzinfo=tz.utc), license_scope={'duration_months': 12}, compensation_terms={})
        return SimpleNamespace(**(values | overrides))

    def test_term_uses_later_signature_and_expires_at_boundary(self):
        from datetime import date
        self.assertTrue(blocks_public_listing(self.agreement(), date(2026, 1, 31)))
        self.assertFalse(blocks_public_listing(self.agreement(), date(2026, 2, 1)))

    def test_nonexclusive_and_cancelled_do_not_hide_art(self):
        self.assertFalse(blocks_public_listing(self.agreement(exclusivity='non_exclusive')))
        self.assertFalse(blocks_public_listing(self.agreement(status='cancelled')))
        self.assertFalse(blocks_public_listing(self.agreement(buyer_signed_at=None)))

    def test_sole_uses_same_term(self):
        from datetime import date
        self.assertTrue(blocks_public_listing(self.agreement(exclusivity='sole'), date(2025, 3, 1)))
        self.assertFalse(blocks_public_listing(self.agreement(exclusivity='sole'), date(2026, 3, 1)))

    def test_missing_legacy_term_is_not_assumed_expired(self):
        self.assertTrue(blocks_public_listing(self.agreement(license_scope={})))

from django.test import TestCase, override_settings
from fulfillment import tests as fulfillment_fixtures
from fulfillment.models import PurchaseReview
from messaging.models import Agreement
from .models import Artwork
from .views import ArtworkView, ArtworkReviewsView
from .serializers import ArtworkSerializer

@override_settings(XENDIT_SECRET_KEY='test', XENDIT_WEBHOOK_TOKEN='callback')
class CatalogueIntegrationTests(TestCase):
    setUp = fulfillment_fixtures.FulfillmentTests.setUp
    call = fulfillment_fixtures.FulfillmentTests.call
    proposal = fulfillment_fixtures.FulfillmentTests.proposal
    checkout = fulfillment_fixtures.FulfillmentTests.checkout
    complete = fulfillment_fixtures.FulfillmentTests.complete

    def test_rating_summary_and_feedback_photos_match_saved_review(self):
        payment = self.checkout(self.proposal())
        self.complete(payment)
        PurchaseReview.objects.create(payment=payment, artist_rating=5, artwork_rating=3, comment='Lovely work', images=['photo'])
        feed = self.call(ArtworkView, None).data
        item = next(item for item in feed if item['id'] == self.art.pk)
        self.assertEqual(item['average_rating'], 3.0)
        self.assertEqual(item['review_count'], 1)
        reviews = self.call(ArtworkReviewsView, None, artwork_id=self.art.pk).data
        self.assertEqual(reviews['reviews'][0]['images'], ['photo'])
        self.assertEqual(reviews['reviews'][0]['comment'], 'Lovely work')

    def test_feed_hides_active_license_then_restores_expired_work(self):
        payment = self.checkout(self.proposal())
        self.complete(payment)
        from django.utils import timezone
        from datetime import timedelta
        Agreement.objects.filter(pk=payment.agreement_id).update(exclusivity='exclusive', license_scope={'duration_months': 1})
        self.assertEqual(self.call(ArtworkView, None).data, [])
        Agreement.objects.filter(pk=payment.agreement_id).update(artist_signed_at=timezone.now()-timedelta(days=70), buyer_signed_at=timezone.now()-timedelta(days=60))
        feed = self.call(ArtworkView, None).data
        self.assertEqual([item['id'] for item in feed], [self.art.pk])
        self.assertFalse(feed[0]['is_sold'])

    def test_sold_physical_work_remains_visible_and_marked_sold(self):
        payment = self.checkout(self.proposal())
        self.complete(payment)
        Artwork.objects.filter(pk=self.art.pk).update(art_type='physical')
        feed = self.call(ArtworkView, None).data
        self.assertEqual(len(feed), 1)
        self.assertTrue(feed[0]['is_sold'])

    def test_unrated_art_has_no_fabricated_rating(self):
        data = ArtworkSerializer(self.art).data
        self.assertIsNone(data['average_rating'])
        self.assertEqual(data['review_count'], 0)
