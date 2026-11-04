from decimal import Decimal
from unittest.mock import patch
from django.test import TestCase
from django.utils import timezone
from rest_framework.test import APIRequestFactory
from users.models import User
from artworks.models import Artwork
from commissions.models import CommissionRequest, CommissionMilestone
from .models import PaymentSession, WalletAccount, WalletLedgerEntry
from .artist_earnings import ArtistEarningsView


class ArtistEarningsTests(TestCase):
    def setUp(self):
        self.artist = User.objects.create(username='earner', email='earner@example.com', firebase_uid='earner', role='artist')
        self.other = User.objects.create(username='other', email='other@example.com', firebase_uid='other', role='artist')
        self.buyer = User.objects.create(username='collector', email='collector@example.com', firebase_uid='collector')
        self.artwork = Artwork.objects.create(artist=self.artist, title='Sunflower', price=110)
        self.wallet = WalletAccount.objects.create(user=self.artist)
        self.payment = PaymentSession.objects.create(reference_id='earnings-paid', buyer=self.buyer, artist=self.artist, artwork=self.artwork, gross_amount=110, platform_fee=10, artist_amount=100, status='paid', paid_at=timezone.now())

    def get(self, user=None, **params):
        request = APIRequestFactory().get('/', params)
        with patch('authentication.views.AuthenticatedAPIView.get_request_user', return_value=user):
            return ArtistEarningsView.as_view()(request)

    def test_unpaid_excluded_and_wallet_release_is_not_payout(self):
        PaymentSession.objects.create(reference_id='earnings-unpaid', buyer=self.buyer, artist=self.artist, artwork=self.artwork, gross_amount=999, platform_fee=9, artist_amount=990)
        response = self.get(self.artist)
        self.assertEqual(response.status_code, 200)
        self.assertEqual(Decimal(response.data['summary']['pending']), 100)
        self.assertEqual(Decimal(response.data['summary']['received']), 0)
        WalletLedgerEntry.objects.create(wallet=self.wallet, payment_session=self.payment, entry_type='sale_available', amount=100)
        response = self.get(self.artist)
        self.assertEqual(Decimal(response.data['summary']['available']), 100)
        self.assertEqual(Decimal(response.data['summary']['received']), 0)
        self.assertEqual(len(response.data['results']), 2)

    def test_private_access_filters_csv_and_refund(self):
        self.assertEqual(self.get().status_code, 401)
        self.assertEqual(self.get(self.buyer).status_code, 403)
        self.assertEqual(self.get(self.other, artist_id=self.artist.pk).data['count'], 0)
        self.assertEqual(self.get(self.artist, search='not found').data['count'], 0)
        self.assertEqual(self.get(self.artist, search='collector', category='shop').data['count'], 1)
        response = self.get(self.artist, export='csv')
        self.assertIn('Sunflower', response.content.decode())
        self.assertNotIn('account_number', response.content.decode())
        self.payment.status = 'refunded'; self.payment.save()
        response = self.get(self.artist)
        self.assertEqual(Decimal(response.data['summary']['pending']), 0)
        self.assertEqual(Decimal(response.data['summary']['refunds']), 110)
        self.assertEqual(self.get(self.artist, month=13).status_code, 400)

    def test_milestone_receipt_requires_confirmed_payout_and_excludes_shipping(self):
        commission = CommissionRequest.objects.create(artist=self.artist, buyer=self.buyer, title='Portrait', deadline=timezone.now(), funded_at=timezone.now(), locked_terms={'delivery_fee': '50'}, platform_fee=100)
        milestone = CommissionMilestone.objects.create(commission_req=commission, milestone_number=3, percentage=40, amount=450, payout_status='PROCESSING')
        response = self.get(self.artist, category='commission')
        self.assertEqual(Decimal(response.data['summary']['processing']), 400)
        self.assertEqual(Decimal(response.data['summary']['received']), 0)
        self.assertEqual(Decimal(response.data['summary']['shipping']), 50)
        milestone.payout_status = 'SUCCEEDED'; milestone.paid_at = timezone.now(); milestone.save()
        response = self.get(self.artist, category='commission', period='monthly', year=timezone.now().year, month=timezone.now().month)
        self.assertEqual(Decimal(response.data['summary']['received']), 400)
        self.assertEqual(sum(Decimal(r['received']) for r in response.data['chart']), 400)

    def test_held_royalty_with_receipt_is_not_available_until_release(self):
        from messaging.models import Agreement, AgreementTemplate, Conversation, RoyaltyPeriod, RoyaltyFunding, RoyaltyReceipt
        agreement = Agreement.objects.create(conversation=Conversation.objects.create(), template=AgreementTemplate.objects.create(name='Earnings', body='Terms'), artwork=self.artwork, buyer=self.buyer, artist=self.artist, price=100, terms_snapshot='Terms')
        today = timezone.localdate()
        period = RoyaltyPeriod.objects.create(agreement=agreement, starts_on=today, ends_on=today, due_on=today, terms={}, amount=25)
        funding = RoyaltyFunding.objects.create(period=period, reference='royalty-paid', amount=25, status='held', paid_at=timezone.now())
        RoyaltyReceipt.objects.create(period=period, amount=25, provider_payment_id='royalty-receipt')
        response = self.get(self.artist, category='commercial_royalty')
        self.assertEqual(Decimal(response.data['summary']['pending']), 25)
        self.assertEqual(Decimal(response.data['summary']['available']), 0)
        funding.released_at = timezone.now(); funding.status = 'released'; funding.save()
        self.assertEqual(Decimal(self.get(self.artist, category='commercial_royalty').data['summary']['available']), 25)

    def test_staff_review_date_ranges_and_safe_csv(self):
        staff = User.objects.create(username='support', email='support@example.com', firebase_uid='support', role='customer_support')
        response = self.get(staff, artist_id=self.artist.pk)
        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.data['count'], 1)
        self.assertEqual(self.get(staff).status_code, 403)
        self.assertEqual(self.get(self.artist, **{'from': '2099-01-01'}).data['count'], 0)
        self.assertEqual(self.get(self.artist, **{'from': '2026-12-31', 'to': '2026-01-01'}).status_code, 400)
        self.artwork.title = '=HYPERLINK("example")'; self.artwork.save()
        response = self.get(self.artist, export='csv')
        import csv
        from io import StringIO
        self.assertTrue(list(csv.reader(StringIO(response.content.decode())))[1][1].startswith("'="))

    def test_four_card_pagination_keeps_full_totals_and_export(self):
        from artworks.tests import image_data_url
        self.artwork.image_data = image_data_url(); self.artwork.save()
        for n in range(7):
            PaymentSession.objects.create(reference_id=f'page-payment-{n}', buyer=self.buyer, artist=self.artist, artwork=self.artwork, gross_amount=110, platform_fee=10, artist_amount=100, status='paid', paid_at=timezone.now())
        first = self.get(self.artist, page=1).data
        second = self.get(self.artist, page=2).data
        self.assertEqual(first['page_size'], 4)
        self.assertEqual(first['pages'], 2)
        self.assertEqual(first['count'], 8)
        self.assertEqual(len(first['results']), 4)
        self.assertEqual(len(second['results']), 4)
        self.assertFalse({r['id'] for r in first['results']} & {r['id'] for r in second['results']})
        self.assertEqual(Decimal(first['summary']['pending']), 800)
        self.assertEqual(first['summary'], second['summary'])
        self.assertTrue(first['results'][0]['preview_image'].startswith('data:image/jpeg;base64,'))
        self.assertEqual(self.get(self.artist, page=99).data['page'], 2)
        import csv
        from io import StringIO
        self.assertEqual(len(list(csv.reader(StringIO(self.get(self.artist, page=2, export='csv').content.decode())))), 9)
