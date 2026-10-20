from decimal import Decimal
from unittest.mock import patch
from django.test import TestCase
from django.utils import timezone
from rest_framework.test import APIRequestFactory
from users.models import User
from artworks.models import Artwork
from commissions.models import CommissionRequest, CommissionRefund
from messaging.models import Agreement, AgreementTemplate, Conversation, RoyaltyPeriod, RoyaltyReceipt
from .models import PaymentSession
from .views import PlatformAdminWalletView, PlatformAdminPaymentsView
from .analytics import admin_analytics


class AdminAnalyticsTests(TestCase):
    def setUp(self):
        self.admin = User.objects.create(username='overview-admin', email='overview-admin@example.com', firebase_uid='overview-admin', role='platform_admin')
        self.artist = User.objects.create(username='overview-artist', email='overview-artist@example.com', firebase_uid='overview-artist', role='artist')
        self.buyer = User.objects.create(username='overview-buyer', email='overview-buyer@example.com', firebase_uid='overview-buyer', role='buyer')
        self.art = Artwork.objects.create(artist=self.artist, title='Digital', art_type='digital', status='approved', price=20, image_data='preview')
        Artwork.objects.create(artist=self.artist, title='Physical', art_type='physical', status='pending', price=20, image_data='preview')

    def test_totals_include_all_transactions_and_exclude_unpaid_simulated_refunded(self):
        PaymentSession.objects.bulk_create([PaymentSession(reference_id=f'overview-{i}', buyer=self.buyer, artist=self.artist, artwork=self.art, gross_amount=20, platform_fee=2, artist_amount=18, status='paid') for i in range(105)])
        for index, (status, simulated) in enumerate([('pending', False), ('refunded', False), ('paid', True)]):
            PaymentSession.objects.create(reference_id=f'excluded-{index}', buyer=self.buyer, artist=self.artist, artwork=self.art, gross_amount=999, platform_fee=99, artist_amount=900, status=status, is_simulated=simulated)
        data = admin_analytics()
        self.assertEqual(data['artworks']['total'], 2)
        self.assertEqual(data['artworks']['digital'], 1)
        self.assertEqual(data['artworks']['physical'], 1)
        self.assertEqual(Decimal(data['revenue']['shop_collected']), 2100)
        self.assertEqual(Decimal(data['revenue']['shop_platform_fees']), 210)
        self.assertEqual(data['activity']['paid_purchases'], 105)
        request = APIRequestFactory().get('/')
        with patch('authentication.views.AuthenticatedAPIView.get_request_user', return_value=self.admin):
            response = PlatformAdminWalletView.as_view()(request)
        self.assertEqual(response.status_code, 200)
        self.assertEqual(len(response.data['payments']), 100)
        self.assertEqual(Decimal(response.data['summary']['platform_fees']), 210)
        with patch('authentication.views.AuthenticatedAPIView.get_request_user', return_value=self.admin):
            page = PlatformAdminPaymentsView.as_view()(APIRequestFactory().get('/', {'status': 'paid', 'page': 5}))
            self.assertEqual(page.status_code, 200)
            self.assertEqual(page.data['total'], 105)
            self.assertEqual(page.data['pages'], 5)
            self.assertEqual(len(page.data['payments']), 5)
            search = PlatformAdminPaymentsView.as_view()(APIRequestFactory().get('/', {'search': 'overview-104'}))
            self.assertEqual(search.data['total'], 1)
            self.assertEqual(search.data['payments'][0]['reference_id'], 'overview-104')
            bad = PlatformAdminPaymentsView.as_view()(APIRequestFactory().get('/', {'status': 'invalid'}))
            self.assertEqual(bad.status_code, 400)
        with patch('authentication.views.AuthenticatedAPIView.get_request_user', return_value=self.buyer):
            self.assertEqual(PlatformAdminWalletView.as_view()(request).status_code, 403)
            self.assertEqual(PlatformAdminPaymentsView.as_view()(request).status_code, 403)

    def test_commission_refunds_fees_and_artist_royalties_stay_separate(self):
        args = dict(buyer=self.buyer, artist=self.artist, flow_version=2, funded_at=timezone.now(), time_duration=1000, platform_fee=100, held_amount=500, deadline=timezone.now())
        complete = CommissionRequest.objects.create(title='Complete', status='COMPLETE', **args)
        CommissionRequest.objects.create(title='In progress', status='STAGE_1', **args)
        CommissionRefund.objects.create(commission=complete, authorized_by=self.admin, amount=50, reference='overview-refund', status='WALLET_CREDITED')
        template = AgreementTemplate.objects.create(name='Overview', body='Terms')
        conversation = Conversation.objects.create(artwork=self.art)
        agreement = Agreement.objects.create(conversation=conversation, template=template, artwork=self.art, buyer=self.buyer, artist=self.artist, price=20)
        period = RoyaltyPeriod.objects.create(agreement=agreement, starts_on=timezone.localdate(), ends_on=timezone.localdate(), due_on=timezone.localdate(), terms={}, status='paid', amount=30)
        RoyaltyReceipt.objects.create(period=period, amount=30, provider_payment_id='overview-receipt')
        data = admin_analytics()
        self.assertEqual(Decimal(data['revenue']['commission_collected']), 1950)
        self.assertEqual(Decimal(data['revenue']['commission_platform_fees']), 100)
        self.assertEqual(Decimal(data['revenue']['commission_holding']), 1000)
        self.assertEqual(Decimal(data['revenue']['artist_royalties']), 30)
        self.assertEqual(Decimal(data['revenue']['royalty_platform_fees']), 0)
        self.assertEqual(Decimal(data['revenue']['total_platform_fees']), 100)

