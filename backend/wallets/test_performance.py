from datetime import date, datetime
from decimal import Decimal
from zoneinfo import ZoneInfo
from unittest.mock import patch
from django.test import TestCase
from rest_framework.test import APIRequestFactory
from commissions.models import CommissionRequest
from artworks.models import Artwork
from users.models import User
from .models import PaymentSession
from .performance import performance, AdminPerformanceView

class PerformanceTests(TestCase):
    def setUp(self):
        self.buyer = User.objects.create(username='trend-buyer', email='trendbuyer@example.com', firebase_uid='trend-buyer', role='buyer')
        self.artist = User.objects.create(username='trend-artist', email='trendartist@example.com', firebase_uid='trend-artist', role='artist')
        self.admin = User.objects.create(username='trend-admin', email='trendadmin@example.com', firebase_uid='trend-admin', role='platform_admin')
        self.art = Artwork.objects.create(artist=self.artist, title='Trend sample', price=100, status='approved')
    def payment(self, ref, paid_at, **extra):
        return PaymentSession.objects.create(reference_id=ref, buyer=self.buyer, artist=self.artist, artwork=self.art,
            gross_amount=110, platform_fee=10, artist_amount=100, paid_at=paid_at, **{'status': 'paid', **extra})
    def test_daily_buckets_include_refunds_exclude_simulations_and_compare_equal_periods(self):
        zone = ZoneInfo('Asia/Manila')
        self.payment('current', datetime(2026, 11, 4, 12, tzinfo=zone))
        self.payment('refunded', datetime(2026, 11, 3, 12, tzinfo=zone), status='refunded')
        self.payment('simulated', datetime(2026, 11, 4, 12, tzinfo=zone), is_simulated=True)
        self.payment('previous', datetime(2026, 10, 28, 12, tzinfo=zone))
        self.payment('pending', None, status='pending')
        self.payment('undated', None)
        CommissionRequest.objects.create(buyer=self.buyer, artist=self.artist, title='Funded commission', time_duration=330, deadline=datetime(2026, 12, 1, tzinfo=zone), funded_at=datetime(2026, 11, 4, 13, tzinfo=zone), flow_version=2)
        result = performance(7, today=date(2026, 11, 4))
        self.assertEqual(len(result['series']), 7)
        self.assertEqual(result['series'][0]['date'], '2026-10-29')
        self.assertEqual(Decimal(result['summary']['collected']), 550)
        self.assertEqual(result['summary']['shop_payments'], 2)
        self.assertEqual(result['summary']['funded_commissions'], 1)
        self.assertEqual(Decimal(result['channels']['commission']), 330)
        self.assertEqual(Decimal(result['previous']['collected']), 110)
        self.assertEqual(result['undated_shop_payments'], 1)
        self.assertEqual(result['series'][-1]['shop_count'], 1)
    def test_midnight_boundary_uses_manila_time_and_zero_fills_days(self):
        self.payment('manila-midnight', datetime(2026, 11, 3, 16, tzinfo=ZoneInfo('UTC')))
        result = performance(7, today=date(2026, 11, 4))
        self.assertEqual(result['series'][-1]['shop_count'], 1)
        self.assertTrue(all(Decimal(row['total']) == 0 for row in result['series'][:-1]))
    def test_admin_only_and_invalid_range(self):
        factory = APIRequestFactory()
        for user, days, expected in [(self.buyer, 30, 403), (self.admin, 1, 400), (self.admin, 'bad', 400), (self.admin, 7, 200)]:
            with patch.object(AdminPerformanceView, 'get_request_user', return_value=user):
                result = AdminPerformanceView.as_view()(factory.get('/', {'days': days}))
            self.assertEqual(result.status_code, expected)
            if expected == 200:
                self.assertEqual(result['Cache-Control'], 'private, no-store')
                self.assertEqual(len(result.data['series']), 7)

    def test_auctions_are_separate_from_shop_without_double_counting(self):
        from messaging.models import Agreement, AgreementTemplate, Conversation, Message
        from .auction_delivery import AUCTION_MESSAGE
        zone = ZoneInfo('Asia/Manila')
        self.payment('direct', datetime(2026, 11, 4, 12, tzinfo=zone))
        auction_art = Artwork.objects.create(artist=self.artist, title='Auction', price=100, sale_type='Auction')
        PaymentSession.objects.create(reference_id='auction', buyer=self.buyer, artist=self.artist, artwork=auction_art, gross_amount=330, platform_fee=30, artist_amount=300, status='paid', paid_at=datetime(2026, 11, 4, 12, tzinfo=zone))
        template = AgreementTemplate.objects.first()
        conversation = Conversation.objects.create(artwork=self.art)
        agreement = Agreement.objects.create(template=template, conversation=conversation, artwork=self.art, buyer=self.buyer, artist=self.artist, price=100, terms_snapshot='Fixed auction terms')
        # Use the immutable auction message even if the listing type later changes.
        for _ in range(2):
            Message.objects.create(conversation=conversation, agreement=agreement, sender=None, body=AUCTION_MESSAGE)
        payment = self.payment('auction-from-agreement', datetime(2026, 11, 4, 12, tzinfo=zone))
        payment.agreement = agreement; payment.save()
        self.payment('refunded-shop', datetime(2026, 11, 4, 12, tzinfo=zone), status='refunded')
        result = performance(7, today=date(2026, 11, 4))
        self.assertEqual(result['summary']['payments'], 4)
        self.assertEqual(result['summary']['auction_payments'], 2)
        self.assertEqual(Decimal(result['channels']['auction']), 440)
        self.assertEqual(Decimal(result['channel_summaries']['auction']['current']['earnings']), 40)
        self.assertEqual(Decimal(result['channel_summaries']['shop']['current']['earnings']), 10)
        self.assertEqual(Decimal(result['summary']['earnings']), 50)
        self.assertEqual(sum(Decimal(result['channels'][key]) for key in ('shop', 'auction', 'commission')), Decimal(result['summary']['collected']))

    def test_commission_earnings_use_completion_date_and_exclude_held_fees(self):
        from commissions.models import CommissionAsset, CommissionMilestone, CommissionSubmission
        zone = ZoneInfo('Asia/Manila')
        now = datetime(2026, 11, 4, 12, tzinfo=zone)
        commission = CommissionRequest.objects.create(buyer=self.buyer, artist=self.artist, title='Complete', time_duration=550, platform_fee=50, deadline=now, funded_at=datetime(2026, 10, 1, tzinfo=zone), flow_version=2, status='COMPLETE')
        stage = CommissionMilestone.objects.create(commission_req=commission, milestone_number=3, percentage=40)
        submission = CommissionSubmission.objects.create(milestone=stage, uploader=self.artist, filename='art.png', content_type='image/png', content=b'example', sha256='a' * 64)
        asset = CommissionAsset.objects.create(commission=commission, original_artist=self.artist, owner=self.buyer, submission=submission, license_terms={}, record_hash='b' * 64)
        CommissionAsset.objects.filter(pk=asset.pk).update(created_at=now)
        CommissionRequest.objects.create(buyer=self.buyer, artist=self.artist, title='Held', time_duration=330, platform_fee=30, deadline=now, funded_at=now, flow_version=2, status='STAGE_1')
        result = performance(7, today=date(2026, 11, 4))
        self.assertEqual(Decimal(result['channels']['commission']), 330)
        self.assertEqual(Decimal(result['channel_summaries']['commission']['current']['earnings']), 50)
        self.assertEqual(Decimal(result['series'][-1]['commission_earnings']), 50)

    def test_released_royalty_service_fees_are_included_without_artist_royalty(self):
        from messaging.models import Agreement, AgreementTemplate, Conversation, RoyaltyPeriod, RoyaltyReceipt
        zone = ZoneInfo('Asia/Manila')
        now = datetime(2026, 11, 4, 12, tzinfo=zone)
        agreement = Agreement.objects.create(template=AgreementTemplate.objects.first(), conversation=Conversation.objects.create(artwork=self.art), artwork=self.art, buyer=self.buyer, artist=self.artist, price=100, terms_snapshot='Royalty license')
        period = RoyaltyPeriod.objects.create(agreement=agreement, starts_on=date(2026, 10, 1), ends_on=date(2026, 10, 31), due_on=date(2026, 11, 7), terms={}, status='paid', amount=100, paid_at=now)
        receipt = RoyaltyReceipt.objects.create(period=period, amount=102, platform_fee=2, provider_payment_id='performance-royalty')
        RoyaltyReceipt.objects.filter(pk=receipt.pk).update(created_at=now)
        held_period = RoyaltyPeriod.objects.create(agreement=agreement, starts_on=date(2026, 9, 1), ends_on=date(2026, 9, 30), due_on=date(2026, 10, 7), terms={}, status='funded', amount=100, paid_at=now)
        held_receipt = RoyaltyReceipt.objects.create(period=held_period, amount=102, platform_fee=2, provider_payment_id='performance-held-royalty')
        RoyaltyReceipt.objects.filter(pk=held_receipt.pk).update(created_at=now)
        result = performance(7, today=date(2026, 11, 4))
        self.assertEqual(Decimal(result['summary']['earnings']), 2)
        self.assertEqual(Decimal(result['channel_summaries']['shop']['current']['earnings']), 0)
        self.assertEqual(Decimal(result['channel_summaries']['royalty']['current']['earnings']), 2)
        self.assertEqual(Decimal(result['channel_summaries']['royalty']['current']['artist_royalties']), 100)
        self.assertEqual(Decimal(result['summary']['collected']), 204)
