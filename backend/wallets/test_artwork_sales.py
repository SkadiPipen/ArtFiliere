from datetime import datetime
from zoneinfo import ZoneInfo

from django.test import TestCase
from users.models import User
from artworks.models import Artwork
from .models import PaymentSession
from .artwork_sales import artwork_sales


class ArtworkSalesTests(TestCase):
    def setUp(self):
        self.artist = User.objects.create(username='sales-artist', email='sales-artist@example.com', firebase_uid='sales-artist', role='artist')
        self.buyer = User.objects.create(username='sales-buyer', email='sales-buyer@example.com', firebase_uid='sales-buyer', role='buyer')
        self.digital = Artwork.objects.create(artist=self.artist, title='Digital', art_type='digital', price=10)
        self.physical = Artwork.objects.create(artist=self.artist, title='Physical', art_type='physical', price=10)
        self.now = datetime(2026, 11, 6, 12, tzinfo=ZoneInfo('Asia/Manila'))

    def payment(self, key, art=None, **extra):
        return PaymentSession.objects.create(reference_id=key, buyer=self.buyer, artist=self.artist, artwork=art or self.digital,
            gross_amount=100, artist_amount=90, platform_fee=10, **{'status': 'paid', 'paid_at': self.now, **extra})

    def test_calendar_buckets_formats_repeat_licenses_and_exclusions(self):
        self.payment('digital-1')
        self.payment('digital-2')
        self.payment('physical', self.physical)
        self.payment('month-only', paid_at=datetime(2026, 11, 1, 12, tzinfo=ZoneInfo('Asia/Manila')))
        self.payment('previous-month', paid_at=datetime(2026, 10, 31, 12, tzinfo=ZoneInfo('Asia/Manila')))
        self.payment('pending', status='pending')
        self.payment('simulated', is_simulated=True)
        self.payment('refunded', status='refunded')
        self.payment('future', paid_at=datetime(2026, 11, 7, 12, tzinfo=ZoneInfo('Asia/Manila')))
        self.payment('undated', paid_at=None)
        result = artwork_sales(self.now)
        self.assertEqual(result['week']['starts_on'], '2026-11-02')
        self.assertEqual(result['month']['starts_on'], '2026-11-01')
        self.assertEqual(result['week']['summary'], {'digital': 2, 'physical': 1, 'total': 3, 'collected': '300'})
        self.assertEqual(result['month']['summary']['total'], 4)
        self.assertEqual(result['undated_paid_purchases'], 1)
        self.assertEqual(result['week']['series'][0]['total'], 0)

    def test_local_midnight_includes_utc_previous_day(self):
        self.payment('midnight', paid_at=datetime(2026, 11, 5, 16, tzinfo=ZoneInfo('UTC')))
        result = artwork_sales(self.now)
        self.assertEqual(result['week']['series'][-1]['digital'], 1)

    def test_empty_sales_have_zero_filled_calendar_series(self):
        result = artwork_sales(self.now)
        self.assertEqual(len(result['week']['series']), 5)
        self.assertEqual(len(result['month']['series']), 6)
        self.assertTrue(all(row['total'] == 0 for row in result['month']['series']))
