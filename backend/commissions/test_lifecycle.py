from io import BytesIO
from unittest.mock import patch, PropertyMock
from decimal import Decimal
from PIL import Image
from django.core.files.uploadedfile import SimpleUploadedFile
from django.test import TestCase, override_settings
from django.core.management import call_command
from django.utils import timezone
from rest_framework.test import APIClient
from users.models import User
from messaging.signing import signing_data
from .models import CommissionRequest, CommissionMilestone, CommissionSubmission, CommissionLedger, CommissionAsset
from .lifecycle import apply_funding, apply_payout, attempt_payout


@override_settings(COMMISSION_RESALE_ROYALTY_PERCENTAGE='5.00', XENDIT_SECRET_KEY='', XENDIT_WEBHOOK_TOKEN='test-callback', COMMISSION_HOLDING_ENABLED=False, COMMISSION_PAYOUTS_ENABLED=False)
class LifecycleTests(TestCase):
    def setUp(self):
        self.buyer = User.objects.create(username='flow-buyer', email='flow-buyer@example.com', firebase_uid='flow-buyer', role='buyer')
        self.artist = User.objects.create(username='flow-artist', email='flow-artist@example.com', firebase_uid='flow-artist', role='artist', is_accepting_commissions=True)
        self.other = User.objects.create(username='flow-other', email='flow-other@example.com', firebase_uid='flow-other', role='buyer')
        self.staff = User.objects.create(username='flow-staff', email='flow-staff@example.com', firebase_uid='flow-staff', role='customer_support')
        self.client = APIClient()
        self.deadline = (timezone.now() + timezone.timedelta(days=14)).isoformat()

    def call(self, user, path, data=None, method='post', multipart=False):
        self.client.credentials(HTTP_AUTHORIZATION='Bearer token')
        with patch('authentication.services.auth.verify_id_token', return_value={'uid': user.firebase_uid, 'email': user.email}):
            return getattr(self.client, method)(path, data or {}, format='multipart' if multipart else 'json')

    def new(self, art_type='Digital', commercial=False, compensation=None, resale=None):
        delivery = {}
        if art_type == 'Physical':
            from users.models import Address
            for user in (self.artist, self.buyer):
                Address.objects.get_or_create(user=user, defaults={'region': 'VII', 'province': 'Cebu', 'city': 'Mandaue', 'postal_code': '6014', 'barangay': 'Centro', 'street': f'{user.username} Street', 'is_default': True})
            with patch('commissions.delivery.road_distance', return_value=10000):
                quote = self.call(self.buyer, '/api/commissions/delivery-quote/', {'artist_id': self.artist.pk}, method='get')
            self.assertEqual(quote.status_code, 200, quote.data)
            delivery = {'delivery_quote': quote.data['token'], 'delivery_floor_unit': 'Room 2', 'delivery_instruction': 'Call at gate'}
        response = self.call(self.buyer, '/api/commissions/request/', {'artist_id': self.artist.pk, 'subject': 'Portrait', 'style': 'Realism',
            'art_type': art_type, 'deadline': self.deadline, 'proposed_budget': '1000',
            'proposal': {'price': '1100.00', 'deadline': self.deadline, 'milestones': [30, 30, 40], 'compensation_type': 'hybrid' if compensation else 'one_time', 'compensation_terms': compensation or {}, 'license_type': 'commercial' if commercial else 'personal', 'duration_months': 12 if commercial else 0, 'allow_resale': commercial if resale is None else resale, 'royalty_percentage': '5.00' if (commercial if resale is None else resale) else '0',
                'delivery_address': 'Buyer, Cebu City', 'pickup_address': 'Artist, Mandaue City', 'delivery_fee': '100.00' if art_type == 'Physical' else '0', **delivery}})
        self.assertEqual(response.status_code, 201, response.data)
        return CommissionRequest.objects.get(pk=response.data['commission_req_id'])

    def flow(self, user, c, action, **data):
        return self.call(user, f'/api/commissions/flow/{c.pk}/', {'action': action, **data})

    def agreed(self, art_type='Digital', commercial=False, compensation=None, resale=None):
        c = self.new(art_type, commercial, compensation, resale)
        result = self.flow(self.artist, c, 'accept', version=1)
        self.assertEqual(result.status_code, 200, result.data)
        c.refresh_from_db()
        for user in (self.artist, self.buyer):
            c.agreement.refresh_from_db()
            document = signing_data(c.agreement, user)
            result = self.call(user, f'/api/users/contracts/{c.agreement_id}/sign/', {
                'signature': user.username, 'consent': True, 'document_hash': document['document_hash'],
                'signature_strokes': [[[0.1, 0.1], [0.2, 0.3], [0.4, 0.2]]],
            })
            self.assertEqual(result.status_code, 200, result.data)
        c.refresh_from_db()
        self.assertEqual(c.status, 'AWAITING_FUNDS')
        return c

    def funded(self, art_type='Digital', commercial=False, compensation=None, resale=None):
        c = self.agreed(art_type, commercial, compensation, resale)
        c.funding_reference = f'commission-funding-{c.pk}-test'; c.funding_provider_id = 'invoice-test'; c.save()
        payload = {'id': 'invoice-test', 'external_id': c.funding_reference, 'amount': '1100.00', 'currency': 'PHP', 'status': 'PAID'}
        apply_funding(payload); apply_funding(payload)
        c.refresh_from_db()
        self.assertEqual(c.held_amount, Decimal('1100.00'))
        self.assertEqual(c.ledger.filter(kind='UPFRONT_FUNDING').count(), 1)
        return c

    def image(self):
        out = BytesIO(); Image.new('RGB', (50, 50), 'red').save(out, 'PNG')
        return SimpleUploadedFile('work.png', out.getvalue(), content_type='image/png')

    def submit(self, c, m):
        result = self.call(self.artist, f'/api/commissions/flow/{c.pk}/', {'action': 'submit', 'milestone_id': m.pk, 'file': self.image()}, multipart=True)
        self.assertEqual(result.status_code, 200, result.data)

    def test_road_shipping_is_authoritative_and_saved_in_agreement(self):
        c = self.new('Physical')
        terms = c.proposals.get().terms
        self.assertEqual(terms['delivery_fee'], '170.00')  # 50 + (10 road km - 2 included) * 15
        self.assertEqual(terms['delivery_details']['distance_fee'], '120.00')
        self.assertIn(self.buyer.username, terms['delivery_address'])
        self.assertEqual(terms['delivery_floor_unit'], 'Room 2')
        self.assertEqual(terms['delivery_instruction'], 'Call at gate')
        tampered = {**terms, 'delivery_fee': '1', 'pickup_address': 'Fake pickup'}
        result = self.flow(self.artist, c, 'counter', version=1, terms=tampered)
        self.assertEqual(result.status_code, 200, result.data)
        c.refresh_from_db()
        self.assertEqual(c.proposals.latest('version').terms['delivery_fee'], '170.00')
        result = self.flow(self.buyer, c, 'accept', version=2)
        self.assertEqual(result.status_code, 200, result.data)
        c.refresh_from_db()
        self.assertIn('Room 2', c.agreement.document_snapshot)
        self.assertIn('Call at gate', c.agreement.document_snapshot)
        self.assertNotIn(terms['delivery_quote'], c.agreement.document_snapshot)

    def test_zero_distance_quote_uses_base_fare_only(self):
        self.new('Physical')
        with patch('commissions.delivery.road_distance', return_value=0):
            result = self.call(self.buyer, '/api/commissions/delivery-quote/', {'artist_id': self.artist.pk}, method='get')
        self.assertEqual(result.status_code, 200, result.data)
        self.assertEqual(result.data['distance_km'], '0.000')
        self.assertEqual(result.data['distance_fee'], '0.00')
        self.assertEqual(result.data['fee'], '50.00')

    def test_shipping_rejects_changed_address_and_wrong_parties(self):
        from .delivery import verify_delivery
        from rest_framework.exceptions import ValidationError
        c = self.new('Physical')
        token = c.proposals.get().terms['delivery_quote']
        other = CommissionRequest(buyer=self.other, artist=self.artist)
        with self.assertRaises(ValidationError): verify_delivery(other, token)
        with self.assertRaises(ValidationError): verify_delivery(c, token + 'tampered')
        address = self.buyer.address
        address.street = 'New street'; address.save()
        result = self.flow(self.artist, c, 'accept', version=1)
        self.assertEqual(result.status_code, 400, result.data)
        c.refresh_from_db()
        self.assertIsNone(c.agreement_id)

    def test_quote_access_routing_failure_and_existing_proposal_expiry(self):
        import time
        c = self.new('Physical')
        self.assertEqual(self.call(self.other, '/api/commissions/delivery-quote/', {'commission_id': c.pk}, method='get').status_code, 404)
        self.assertEqual(self.call(self.buyer, '/api/commissions/delivery-quote/', {'artist_id': 'bad'}, method='get').status_code, 400)
        with patch('commissions.delivery.road_distance', side_effect=ValueError('No driving route available.')):
            result = self.call(self.buyer, '/api/commissions/delivery-quote/', {'artist_id': self.artist.pk}, method='get')
        self.assertEqual(result.status_code, 400)
        with patch('django.core.signing.time.time', return_value=time.time() + 3600):
            result = self.flow(self.artist, c, 'accept', version=1)
        self.assertEqual(result.status_code, 200, result.data)  # already validated proposal may be reviewed later

    def test_ipophil_graduated_resale_schedule(self):
        from .royalty_policy import calculate_resale
        for gross, expected in [('0', '0'), ('1000', '50'), ('150000', '7500'),
                                ('150000.01', '7500'), ('350000', '15500'), ('600000', '23000'),
                                ('1000000', '31000'), ('2000000', '46000'), ('3000000', '56000')]:
            with self.subTest(gross=gross):
                self.assertEqual(calculate_resale(gross), Decimal(expected))
        c = self.new(resale=True)
        from .royalty_policy import POLICY
        self.assertEqual(c.proposals.get().terms['resale_calculation'], POLICY)
        self.assertEqual(c.proposals.get().terms['royalty_percentage'], '5.00')
        policy = self.call(self.buyer, '/api/commissions/policy/', method='get')
        self.assertEqual(policy.data['resale_calculation'], POLICY)
        self.assertEqual(len(policy.data['resale_schedule']), 6)

    def test_standard_resale_royalty_is_enforced(self):
        c = self.new()
        terms = {**c.proposals.get().terms, 'allow_resale': True, 'royalty_percentage': '7'}
        self.assertEqual(self.flow(self.artist, c, 'counter', version=1, terms=terms).status_code, 400)
        with override_settings(COMMISSION_RESALE_ROYALTY_PERCENTAGE=None):
            terms['royalty_percentage'] = '5'
            self.assertEqual(self.flow(self.artist, c, 'counter', version=1, terms=terms).status_code, 400)
        terms['royalty_percentage'] = '5'
        self.assertEqual(self.flow(self.artist, c, 'counter', version=1, terms=terms).status_code, 200)

    def test_versioned_negotiation_and_signing_gate(self):
        c = self.new()
        self.assertEqual(c.status, 'NEGOTIATING')
        self.assertEqual(self.flow(self.buyer, c, 'accept', version=1).status_code, 403)
        result = self.flow(self.artist, c, 'counter', version=1, terms={'price': '2200.00', 'deadline': self.deadline, 'milestones': [20, 30, 50]})
        self.assertEqual(result.status_code, 200, result.data)
        self.assertEqual(self.flow(self.buyer, c, 'accept', version=1).status_code, 409)
        self.assertEqual(self.flow(self.buyer, c, 'accept', version=2).status_code, 200)
        c.refresh_from_db()
        self.assertEqual(c.status, 'SIGNING')
        self.assertEqual(self.flow(self.buyer, c, 'fund').status_code, 409)
        self.assertEqual(sum(c.milestones.values_list('amount', flat=True)), Decimal('2000.00'))
        self.assertEqual(self.flow(self.artist, c, 'counter', version=2).status_code, 409)
        self.assertEqual(self.call(self.other, f'/api/commissions/flow/{c.pk}/', method='get').status_code, 404)

    def test_personal_commissions_disallow_commercial_royalties_and_unlicensed_resale_rates(self):
        c = self.new()
        for extra in ({'royalty_percentage': '10'}, {'compensation_type': 'hybrid', 'compensation_terms': {'subtype': 'upfront_gross_sales', 'rate': '5'}}):
            result = self.flow(self.artist, c, 'counter', version=1, terms={'price': '1100', 'deadline': self.deadline, **extra})
            self.assertEqual(result.status_code, 400, result.data)
        c.refresh_from_db(); self.assertFalse(c.proposals.first().terms['allow_resale'])
        self.assertEqual(c.proposals.first().terms['royalty_percentage'], '0.00')

    def test_commercial_royalties_need_buyer_approval_and_upfront_production_fee(self):
        c = self.new()
        terms = {'price': '1100', 'deadline': self.deadline, 'license_type': 'commercial', 'duration_months': 12,
            'compensation_type': 'hybrid', 'compensation_terms': {'subtype': 'upfront_gross_sales', 'rate': '5', 'reporting_frequency': 'monthly', 'reporting_duration_months': 12}}
        self.assertEqual(self.flow(self.artist, c, 'counter', version=1, terms=terms).status_code, 403)
        terms['compensation_type'] = 'royalty'
        self.assertEqual(self.flow(self.artist, c, 'counter', version=1, terms=terms).status_code, 400)

    def test_commercial_reporting_starts_after_delivery_and_stays_separate_from_production(self):
        from messaging.models import Agreement, RoyaltyPeriod
        from messaging.royalties import ensure_periods
        from messaging.royalty_rules import calculate
        compensation = {'subtype': 'upfront_gross_sales', 'rate': '5', 'reporting_frequency': 'monthly', 'reporting_duration_months': 12}
        with patch.object(User, 'royalty_enabled', new_callable=PropertyMock, return_value=True):
            c = self.funded(commercial=True, compensation=compensation)
            self.assertEqual(c.agreement.compensation_type, 'hybrid')
            self.assertEqual(c.agreement.compensation_terms['rate'], '5')
            Agreement.objects.filter(pk=c.agreement_id).update(artist_signed_at=timezone.now() - timezone.timedelta(days=45), buyer_signed_at=timezone.now() - timezone.timedelta(days=45))
            c.agreement.refresh_from_db(); ensure_periods(c.agreement)
            self.assertFalse(RoyaltyPeriod.objects.filter(agreement=c.agreement).exists())
            for m in c.milestones.order_by('milestone_number'):
                self.submit(c, m); self.assertEqual(self.flow(self.buyer, c, 'approve', milestone_id=m.pk).status_code, 200)
                if m.milestone_number != 3:
                    ensure_periods(c.agreement); self.assertFalse(RoyaltyPeriod.objects.filter(agreement=c.agreement).exists())
            c.refresh_from_db(); ensure_periods(c.agreement)
            period = RoyaltyPeriod.objects.get(agreement=c.agreement)
            self.assertEqual(period.starts_on, timezone.localdate(c.asset.created_at))
            self.assertEqual(calculate(period.terms, {'gross_sales': '1000'})[1], Decimal('50.00'))
            self.assertEqual(c.held_amount, Decimal('1100.00'))
            self.assertEqual(sum(c.milestones.values_list('amount', flat=True)), Decimal('1000.00'))
            reports = self.call(self.buyer, '/api/users/royalties/', method='get')
            self.assertEqual(reports.status_code, 200, reports.data)
            self.assertEqual(reports.data['agreements'][0]['title'], c.title)
            self.assertEqual(reports.data['periods'][0]['agreement_id'], c.agreement_id)

    def test_payment_refresh_reconciles_provider_confirmation_for_both_parties(self):
        c = self.agreed()
        c.funding_reference = f'commission-funding-{c.pk}-refresh-test'
        c.funding_provider_id = 'invoice-refresh-test'; c.save()
        detail = self.call(self.artist, f'/api/commissions/flow/{c.pk}/', method='get')
        self.assertTrue(detail.data['funding_pending'])
        payload = {'id': c.funding_provider_id, 'external_id': c.funding_reference, 'amount': '1100.00', 'currency': 'PHP', 'status': 'PENDING'}
        with override_settings(XENDIT_SECRET_KEY='test-server-secret'), patch('commissions.lifecycle.requests.get') as provider:
            provider.return_value.json.return_value = payload
            result = self.flow(self.artist, c, 'refresh_payment')
            self.assertEqual(result.status_code, 200, result.data)
            self.assertIsNone(result.data['funded_at'])
            self.assertEqual(result.data['held_amount'], '0.00')
            self.assertEqual(self.flow(self.other, c, 'refresh_payment').status_code, 404)
            payload['status'] = 'PAID'
            payload['amount'] = '1.00'
            self.assertEqual(self.flow(self.buyer, c, 'refresh_payment').status_code, 400)
            c.refresh_from_db(); self.assertIsNone(c.funded_at)
            payload['amount'] = '1100.00'
            for user in (self.artist, self.buyer):
                result = self.flow(user, c, 'refresh_payment')
                self.assertEqual(result.status_code, 200, result.data)
                self.assertEqual(result.data['status'], 'STAGE_1')
                self.assertEqual(result.data['held_amount'], '1100.00')
                self.assertFalse(result.data['funding_pending'])
        self.assertEqual(c.ledger.filter(kind='UPFRONT_FUNDING').count(), 1)
        self.submit(c, c.milestones.first())

    def test_unreachable_payment_provider_does_not_credit_funding(self):
        import requests
        c = self.agreed()
        c.funding_reference = f'commission-funding-{c.pk}-timeout-test'
        c.funding_provider_id = 'invoice-timeout-test'; c.save()
        with override_settings(XENDIT_SECRET_KEY='test-server-secret'), patch('commissions.lifecycle.requests.get', side_effect=requests.Timeout):
            result = self.flow(self.buyer, c, 'refresh_payment')
        self.assertEqual(result.status_code, 409)
        c.refresh_from_db()
        self.assertIsNone(c.funded_at)
        self.assertEqual(c.held_amount, Decimal('0'))
        self.assertFalse(c.ledger.filter(kind='UPFRONT_FUNDING').exists())

    def test_no_simulated_funding_or_old_endpoint_bypass(self):
        c = self.agreed()
        self.assertEqual(self.flow(self.buyer, c, 'fund').status_code, 409)
        m = c.milestones.first()
        self.assertEqual(self.call(self.buyer, f'/api/commissions/milestones/{m.pk}/verify/').status_code, 409)
        self.assertEqual(self.call(self.buyer, f'/api/commissions/milestones/{m.pk}/pay/').status_code, 409)
        self.assertEqual(self.call(self.artist, f'/api/commissions/requests/{c.pk}/track/', {'image_url': 'https://example.com/file.png'}).status_code, 409)
        c.refresh_from_db(); self.assertIsNone(c.funded_at)
        self.client.credentials()
        self.assertEqual(self.client.post('/api/commissions/payments/webhook/', {}, format='json').status_code, 403)

    def test_exactly_one_revision_and_private_final_delivery(self):
        c = self.funded()
        for m in c.milestones.order_by('milestone_number'):
            self.submit(c, m)
            self.assertEqual(self.flow(self.buyer, c, 'revise', milestone_id=m.pk, comment='Make background blue.').status_code, 200)
            self.assertEqual(self.flow(self.buyer, c, 'revise', milestone_id=m.pk, comment='Second comment').status_code, 409)
            self.assertEqual(self.flow(self.buyer, c, 'reply_revision', milestone_id=m.pk, reply='Pretending to be artist').status_code, 403)
            response = self.flow(self.artist, c, 'reply_revision', milestone_id=m.pk, reply='I will adjust the background in this stage.')
            self.assertEqual(response.status_code, 200, response.data)
            history = next(row for row in response.data['milestones'] if row['id'] == m.pk)
            self.assertEqual(history['revision_reply'], 'I will adjust the background in this stage.')
            self.assertTrue(history['revision_replied_at'])
            self.assertEqual(self.flow(self.artist, c, 'reply_revision', milestone_id=m.pk, reply='Rewrite history').status_code, 409)
            self.submit(c, m)
            self.assertEqual(self.flow(self.buyer, c, 'revise', milestone_id=m.pk, comment='Another revision').status_code, 409)
            submission = m.submissions.last()
            path = f'/api/commissions/flow/{c.pk}/files/{submission.pk}/'
            self.assertEqual(self.call(self.other, path, method='get').status_code, 404)
            if m.milestone_number == 3:
                self.assertEqual(self.call(self.buyer, path, method='get').status_code, 409)
                self.assertEqual(self.call(self.buyer, path + '?preview=1', method='get').status_code, 200)
            self.assertEqual(self.flow(self.buyer, c, 'approve', milestone_id=m.pk).status_code, 200)
            self.assertEqual(self.flow(self.buyer, c, 'approve', milestone_id=m.pk).status_code, 409)
        c.refresh_from_db(); self.assertEqual(c.status, 'COMPLETE')
        self.assertEqual(CommissionAsset.objects.filter(commission=c).count(), 1)
        self.assertEqual(self.call(self.buyer, path, method='get').status_code, 200)
        self.assertEqual(c.proofs.count(), 7)

    def test_completed_commissions_in_artist_portfolio_without_private_files(self):
        from artist_profiles.portfolio import artist_portfolio
        from artworks.models import Artwork
        import base64
        c = self.funded()
        self.assertEqual(artist_portfolio(self.artist), [])
        for m in c.milestones.order_by('milestone_number'):
            self.submit(c, m)
            self.assertEqual(self.flow(self.buyer, c, 'approve', milestone_id=m.pk).status_code, 200)
        pending = Artwork.objects.create(artist=self.artist, title='Pending post', price=10, image_data='preview')
        entries = artist_portfolio(self.artist)
        self.assertEqual(len(entries), 1)
        entry = entries[0]
        self.assertEqual(entry['id'], f'commission-{c.pk}')
        self.assertFalse(entry['is_for_sale'])
        self.assertEqual(entry['source'], 'commission')
        self.assertNotIn('buyer', entry)
        self.assertNotIn('locked_terms', entry)
        self.assertNotIn('content', entry)
        self.assertNotIn('download_url', entry)
        submission = CommissionSubmission.objects.filter(milestone__commission_req=c, milestone__milestone_number=3).last()
        preview = base64.b64decode(entry['image_data'].split(',', 1)[1])
        self.assertNotEqual(preview, bytes(submission.content))
        with Image.open(BytesIO(preview)) as image:
            self.assertLessEqual(max(image.size), 900)
            self.assertEqual(image.format, 'JPEG')
        self.assertEqual(artist_portfolio(self.other), [])
        own = self.call(self.artist, '/api/users/portfolio/', method='get')
        self.assertEqual(own.status_code, 200)
        self.assertEqual(len(own.data), 2)
        dates = [row['portfolio_date'] for row in own.data]
        from django.utils.dateparse import parse_datetime
        self.assertEqual(dates, sorted(dates, key=lambda date: parse_datetime(date).timestamp(), reverse=True))
        pending.status = 'approved'; pending.save()
        self.assertEqual(len(artist_portfolio(self.artist)), 2)

    def physical_ready_to_dispatch(self):
        c = self.funded('Physical')
        for m in c.milestones.order_by('milestone_number'):
            self.submit(c, m)
            if m.milestone_number < 3:
                self.assertEqual(self.flow(self.buyer, c, 'approve', milestone_id=m.pk).status_code, 200)
        return c, m

    def test_physical_commission_driver_dispatch_tracking_and_final_approval(self):
        import base64
        from fulfillment.models import DeliveryOrder, RiderProfile
        from notifications.models import UserNotification
        driver = User.objects.create(username='commission-driver', email='driver@example.com', firebase_uid='commission-driver', role='rider')
        other_driver = User.objects.create(username='commission-driver2', email='driver2@example.com', firebase_uid='commission-driver2', role='driver')
        RiderProfile.objects.create(user=driver, is_clocked_in=True, clock_in_time=timezone.now())
        c, m = self.physical_ready_to_dispatch()
        self.assertEqual(self.flow(self.artist, c, 'request_pickup', milestone_id=m.pk).status_code, 409)
        self.assertEqual(self.flow(self.artist, c, 'ready_delivery', milestone_id=m.pk).status_code, 403)
        result = self.flow(self.buyer, c, 'ready_delivery', milestone_id=m.pk)
        self.assertEqual(result.status_code, 200, result.data)
        self.assertTrue(result.data['milestones'][2]['delivery_ready_at'])
        self.assertEqual(result.data['status'], 'STAGE_3')
        m.refresh_from_db(); self.assertIsNone(m.approved_at)
        self.assertEqual(self.flow(self.buyer, c, 'request_pickup', milestone_id=m.pk).status_code, 403)
        self.assertEqual(self.flow(self.buyer, c, 'revise', milestone_id=m.pk, comment='Change again').status_code, 409)
        with patch('fulfillment.routing.geocode_address', return_value=[123.9, 10.3]):
            result = self.flow(self.artist, c, 'request_pickup', milestone_id=m.pk)
        self.assertEqual(result.status_code, 200, result.data)
        delivery = result.data['delivery']
        self.assertEqual(delivery['status'], 'pending')
        self.assertIsNone(delivery['driver'])
        self.assertTrue(delivery['tracking_reference'].startswith(f'AF-COM-{c.pk}-'))
        order = DeliveryOrder.objects.get(commission=c)
        self.assertEqual(order.route_details['delivery_instruction'], 'Call at gate')
        self.assertEqual(order.route_details['delivery_floor_unit'], 'Room 2')
        self.assertTrue(UserNotification.objects.filter(user=driver, commission=c, title='Commission pickup available').exists())
        count = UserNotification.objects.filter(commission=c).count()
        self.assertEqual(self.flow(self.artist, c, 'request_pickup', milestone_id=m.pk).status_code, 200)
        self.assertEqual(DeliveryOrder.objects.filter(commission=c).count(), 1)
        self.assertEqual(UserNotification.objects.filter(commission=c).count(), count)
        self.assertEqual(self.flow(self.artist, c, 'ship', milestone_id=m.pk, tracking='Replace').status_code, 409)
        prefix = '/api/delivery/verified/'
        self.client.credentials()
        self.assertIn(self.client.get(prefix + 'orders/pending/').status_code, [401, 403])
        self.assertEqual(self.call(self.buyer, prefix + 'orders/pending/', method='get').status_code, 403)
        pending = self.call(driver, prefix + 'orders/pending/', method='get')
        self.assertEqual(pending.status_code, 200, pending.data)
        self.assertEqual(pending.data[0]['id'], order.pk)
        self.assertEqual(self.call(other_driver, prefix + f'orders/accept/{order.pk}/').status_code, 409)
        accepted = self.call(driver, prefix + f'orders/accept/{order.pk}/')
        self.assertEqual(accepted.status_code, 200, accepted.data)
        self.assertEqual(accepted.data['step'], 'ACCEPTED')
        tracking = self.call(self.buyer, f'/api/commissions/flow/{c.pk}/', method='get')
        self.assertEqual(tracking.data['delivery']['driver']['name'], driver.username)
        self.assertIsNone(tracking.data['delivered_at'])
        self.assertEqual(self.call(other_driver, prefix + f'orders/{order.pk}/', method='get').status_code, 404)
        self.assertEqual(self.call(other_driver, prefix + f'orders/{order.pk}/status/', {'status': 'ARRIVED_AT_ARTIST'}).status_code, 404)
        self.assertEqual(self.flow(self.buyer, c, 'receive', milestone_id=m.pk).status_code, 409)
        self.assertEqual(self.flow(self.buyer, c, 'approve', milestone_id=m.pk).status_code, 409)
        proof = 'data:image/png;base64,' + base64.b64encode(self.image().read()).decode()
        def transition(status):
            response = self.call(driver, prefix + f'orders/{order.pk}/status/', {'status': status})
            self.assertEqual(response.status_code, 200, response.data)
        transition('ARRIVED_AT_ARTIST')
        self.assertEqual(self.call(driver, prefix + f'orders/{order.pk}/status/', {'status': 'PICKED_UP'}).status_code, 409)
        self.assertEqual(self.call(driver, prefix + f'orders/{order.pk}/proof/', {'proof_type': 'PICKUP', 'image': proof}).status_code, 200)
        transition('PICKED_UP'); transition('IN_TRANSIT'); transition('ARRIVED_AT_BUYER')
        self.assertEqual(self.call(driver, prefix + f'orders/{order.pk}/status/', {'status': 'DELIVERED'}).status_code, 409)
        self.assertEqual(self.call(driver, prefix + f'orders/{order.pk}/proof/', {'proof_type': 'DELIVERY', 'image': proof}).status_code, 200)
        transition('DELIVERED')
        m.refresh_from_db(); self.assertIsNone(m.approved_at)
        self.assertEqual(self.flow(self.buyer, c, 'approve', milestone_id=m.pk).status_code, 409)
        self.assertEqual(self.flow(self.buyer, c, 'receive', milestone_id=m.pk).status_code, 200)
        result = self.flow(self.buyer, c, 'approve', milestone_id=m.pk)
        self.assertEqual(result.status_code, 200, result.data)
        self.assertEqual(result.data['status'], 'COMPLETE')
        history = self.call(driver, prefix + 'orders/history/', method='get')
        self.assertEqual(history.data[0]['id'], order.pk)

    def test_delivery_invalid_geocodes_are_cleared_and_owner_pins_synced(self):
        from fulfillment.models import DeliveryOrder
        from .shipping import verified_locations
        c = self.funded('Physical')
        details = {**c.locked_terms['delivery_details'], 'pickup_coordinates': [125, 11], 'delivery_coordinates': [125, 11]}
        order = DeliveryOrder.objects.create(commission=c, pickup_address=c.locked_terms['pickup_address'], delivery_address=c.locked_terms['delivery_address'], fee='170', route_details=details)
        with patch('fulfillment.routing.geocode_address', side_effect=ValueError('Wrong city. Save an exact pin.')):
            result = verified_locations(order)
        self.assertIsNone(result['pickup_coordinates'])
        self.assertIsNone(result['delivery_coordinates'])
        self.assertIn('pickup', result['location_errors'])
        address = c.artist.address
        address.latitude = 10.33; address.longitude = 123.93; address.save()
        result = verified_locations(order)
        self.assertEqual(result['pickup_coordinates'], [123.93, 10.33])
        self.assertNotIn('pickup', result['location_errors'])
        self.assertIn('delivery', result['location_errors'])
        c.refresh_from_db()
        self.assertEqual(c.locked_terms['delivery_fee'], '170.00')

    def test_digital_commissions_skip_delivery_and_disputes_block_dispatch(self):
        c = self.funded()
        m = c.milestones.first()
        self.assertEqual(self.flow(self.buyer, c, 'ready_delivery', milestone_id=m.pk).status_code, 409)
        self.deadline = (timezone.now() + timezone.timedelta(days=15)).isoformat()
        c, m = self.physical_ready_to_dispatch()
        self.flow(self.buyer, c, 'ready_delivery', milestone_id=m.pk)
        c.disputed = True; c.save(update_fields=['disputed'])
        self.assertEqual(self.flow(self.artist, c, 'request_pickup', milestone_id=m.pk).status_code, 409)

    def test_physical_final_requires_shipping_and_buyer_receipt(self):
        c = self.funded('Physical')
        self.assertEqual(sum(c.milestones.values_list('amount', flat=True)), Decimal('1015.45'))
        for m in c.milestones.order_by('milestone_number'):
            self.submit(c, m)
            if m.milestone_number == 3:
                self.assertEqual(self.flow(self.buyer, c, 'approve', milestone_id=m.pk).status_code, 409)
                self.assertEqual(self.flow(self.buyer, c, 'receive', milestone_id=m.pk).status_code, 409)
                self.assertEqual(self.flow(self.buyer, c, 'ready_delivery', milestone_id=m.pk).status_code, 200)
                self.assertEqual(self.flow(self.artist, c, 'ship', milestone_id=m.pk, tracking='Courier ABC123').status_code, 200)
                self.assertEqual(self.flow(self.artist, c, 'receive', milestone_id=m.pk).status_code, 409)
                self.assertEqual(self.flow(self.buyer, c, 'receive', milestone_id=m.pk).status_code, 200)
            self.assertEqual(self.flow(self.buyer, c, 'approve', milestone_id=m.pk).status_code, 200)

    def test_purchase_format_origin_and_cross_source_newest_first(self):
        from artworks.models import Artwork
        from wallets.models import PaymentSession
        c = self.funded()
        digital = Artwork.objects.create(artist=self.artist, title='Direct digital', art_type='digital', price='100', sale_type='DIRECT')
        physical = Artwork.objects.create(artist=self.artist, title='Physical auction', art_type='physical', price='200', sale_type='AUCTION')
        older = PaymentSession.objects.create(reference_id='filter-old-direct', buyer=self.buyer, artist=self.artist, artwork=digital, gross_amount='100', platform_fee='10', artist_amount='90')
        newer = PaymentSession.objects.create(reference_id='filter-new-auction', buyer=self.buyer, artist=self.artist, artwork=physical, gross_amount='200', platform_fee='20', artist_amount='180')
        PaymentSession.objects.filter(pk=older.pk).update(created_at=c.funded_at - timezone.timedelta(days=1))
        PaymentSession.objects.filter(pk=newer.pk).update(created_at=c.funded_at + timezone.timedelta(hours=1))
        response = self.call(self.buyer, '/api/purchases/', method='get')
        self.assertEqual(response.status_code, 200, response.data)
        self.assertEqual([p['id'] for p in response.data], [newer.pk, f'commission-{c.pk}', older.pk])
        auction, commission, direct = response.data
        self.assertEqual((auction['art_type'], auction['purchase_type'], auction['is_auction']), ('physical', 'auction', True))
        self.assertEqual((commission['art_type'], commission['purchase_type']), ('digital', 'commission'))
        self.assertEqual((direct['art_type'], direct['purchase_type']), ('digital', 'direct'))
        self.assertTrue(all(p['purchase_date'] for p in response.data))
        self.assertFalse(self.call(self.other, '/api/purchases/', method='get').data)

    def test_completed_physical_purchase_appears_and_can_be_rated_once(self):
        from fulfillment.models import PurchaseReview
        c, m = self.physical_ready_to_dispatch()
        review_url = f'/api/commissions/{c.pk}/review/'
        ratings = {'artist_rating': 5, 'artwork_rating': 4, 'artist_comment': 'Helpful artist', 'artwork_comment': 'Beautiful physical artwork'}
        row = next(p for p in self.call(self.buyer, '/api/purchases/', method='get').data if p.get('commission_id') == c.pk)
        self.assertFalse(row['can_rate']); self.assertEqual(row['status'], 'in_progress')
        self.assertEqual(self.call(self.buyer, review_url, ratings).status_code, 409)
        self.flow(self.buyer, c, 'ready_delivery', milestone_id=m.pk)
        self.flow(self.artist, c, 'ship', milestone_id=m.pk, tracking='Courier COMPLETED123')
        self.flow(self.buyer, c, 'receive', milestone_id=m.pk)
        self.assertEqual(self.flow(self.buyer, c, 'approve', milestone_id=m.pk).status_code, 200)
        response = self.call(self.buyer, '/api/purchases/', method='get')
        self.assertEqual(response.status_code, 200, response.data)
        row = next(p for p in response.data if p.get('commission_id') == c.pk)
        self.assertEqual(row['id'], f'commission-{c.pk}')
        self.assertEqual(row['status'], 'paid'); self.assertTrue(row['can_rate'])
        self.assertTrue(row['image'].startswith('data:image/jpeg;base64,'))
        self.assertFalse(row['can_download'])
        self.assertEqual(row['agreement_id'], c.agreement_id)
        self.assertEqual(row['delivery']['status'], 'delivered')
        self.assertEqual(row['delivery']['fee'], '170.00')
        self.assertTrue(row['certificate_code'])
        self.assertEqual(self.call(self.buyer, '/api/' + row['certificate_path'], method='get').status_code, 200)
        self.assertEqual(self.call(self.other, '/api/' + row['certificate_path'], method='get').status_code, 404)
        self.assertEqual(self.call(self.artist, review_url, ratings).status_code, 404)
        self.assertEqual(self.call(self.other, review_url, ratings).status_code, 404)
        self.assertEqual(self.call(self.buyer, review_url, {**ratings, 'artist_rating': True}).status_code, 400)
        self.assertEqual(self.call(self.buyer, review_url, ratings).status_code, 201)
        self.assertEqual(self.call(self.buyer, review_url, ratings).status_code, 409)
        self.assertEqual(PurchaseReview.objects.filter(commission=c).count(), 1)
        row = next(p for p in self.call(self.buyer, '/api/purchases/', method='get').data if p.get('commission_id') == c.pk)
        self.assertEqual(row['status'], 'paid'); self.assertFalse(row['can_rate'])
        self.assertEqual(row['review']['artwork_comment'], 'Beautiful physical artwork')
        directory = self.call(self.buyer, '/api/users/artists/', method='get')
        self.assertEqual(directory.status_code, 200, directory.data)
        artist = next(a for a in directory.data if a['id'] == self.artist.pk)
        self.assertEqual(artist['average_rating'], 5.0); self.assertEqual(artist['rating_count'], 1)

    def test_history_needs_authentication_and_expired_booking_is_released(self):
        c = self.agreed()
        self.client.credentials()
        self.assertEqual(self.client.get('/api/commissions/requests/', {'user_email': self.buyer.email}).status_code, 401)
        c.funding_due_at = timezone.now() - timezone.timedelta(seconds=1); c.save()
        call_command('process_commission_events', verbosity=0)
        c.refresh_from_db(); self.assertEqual(c.status, 'CANCELLED')
        history = self.call(self.buyer, '/api/commissions/requests/', method='get')
        self.assertEqual(history.status_code, 200)
        self.assertEqual(history.data[0]['commission_req_id'], c.pk)

    def test_overdue_review_freezes_funds_once_and_never_auto_approves(self):
        from wallets.models import SupportTicket
        c = self.funded(); m = c.milestones.first(); self.submit(c, m)
        m.refresh_from_db(); m.review_due_at = timezone.now() - timezone.timedelta(hours=1); m.save()
        call_command('process_commission_events', verbosity=0); call_command('process_commission_events', verbosity=0)
        c.refresh_from_db(); m.refresh_from_db()
        self.assertTrue(c.disputed); self.assertIsNone(m.approved_at)
        self.assertEqual(SupportTicket.objects.filter(commission=c).count(), 1)

    def test_refund_callback_is_bounded_and_idempotent(self):
        from .models import CommissionRefund
        from .reviews import apply_refund
        c = self.funded(); c.disputed = True; c.funding_payload['payment_request_id'] = 'pr-test'; c.save()
        refund = CommissionRefund.objects.create(commission=c, authorized_by=self.staff, amount='100.00', reason='Cancel unfinished scope', reference='refund-test', provider_id='rfd-test', status='PROCESSING')
        payload = {'id': 'rfd-test', 'reference_id': 'refund-test', 'payment_request_id': 'pr-test', 'currency': 'PHP', 'amount': '100.00', 'status': 'SUCCEEDED'}
        apply_refund(refund, payload); apply_refund(refund, payload)
        c.refresh_from_db(); self.assertEqual(c.held_amount, Decimal('1000.00'))
        self.assertEqual(c.ledger.filter(kind='PROVIDER_REFUND').count(), 1)

    def test_resale_transfers_asset_and_royalty_is_allocated_once(self):
        from artworks.models import Artwork
        from wallets.models import PaymentSession, WalletAccount
        from .models import CommissionResale
        from .resale import allocate_royalty, settle_royalty
        c = self.funded(resale=True)
        for m in c.milestones.order_by('milestone_number'):
            self.submit(c, m); self.assertEqual(self.flow(self.buyer, c, 'approve', milestone_id=m.pk).status_code, 200)
        asset = CommissionAsset.objects.get(commission=c)
        result = self.call(self.buyer, f'/api/commissions/assets/{asset.pk}/resale/', {'price': '2200.00'})
        self.assertEqual(result.status_code, 201, result.data)
        artwork = Artwork.objects.get(pk=result.data['artwork_id'])
        payment = PaymentSession.objects.create(reference_id='resale-payment-test', buyer=self.other, artist=self.buyer, artwork=artwork, gross_amount='2200', platform_fee='200', artist_amount='2000', status='paid')
        payment.refresh_from_db(); allocate_royalty(payment); allocate_royalty(payment)
        asset.refresh_from_db(); payment.refresh_from_db()
        self.assertEqual(asset.owner_id, self.other.pk); self.assertEqual(payment.artist_amount, Decimal('1890.00'))
        wallet = WalletAccount.objects.get(user=self.artist); self.assertEqual(wallet.pending_balance, Decimal('110.00'))
        settle_royalty(payment); settle_royalty(payment)
        wallet.refresh_from_db(); self.assertEqual(wallet.available_balance, Decimal('110.00')); self.assertEqual(wallet.pending_balance, 0)

    def test_dispute_freezes_approval_and_staff_credit_is_bounded(self):
        c = self.funded(); m = c.milestones.first(); self.submit(c, m)
        self.assertEqual(self.flow(self.buyer, c, 'dispute', reason='Artist did not follow the agreed scope.').status_code, 200)
        self.assertEqual(self.flow(self.buyer, c, 'approve', milestone_id=m.pk).status_code, 409)
        path = f'/api/commissions/reviews/{c.pk}/'
        self.assertEqual(self.call(self.buyer, path, {'action': 'wallet_credit', 'amount': '100', 'reason': 'Self approval'}).status_code, 403)
        self.assertEqual(self.call(self.staff, path, {'action': 'wallet_credit', 'amount': '1200', 'reason': 'Cancel unfinished work'}).status_code, 400)
        self.assertEqual(self.call(self.staff, path, {'action': 'wallet_credit', 'amount': '1100', 'reason': 'Cancel unfinished work'}).status_code, 200)
        c.refresh_from_db(); self.assertEqual(c.held_amount, 0); self.assertEqual(c.status, 'CANCELLED')

    def test_payout_webhooks_are_idempotent_and_reversal_restores_hold(self):
        c = self.funded(); m = c.milestones.first(); self.submit(c, m)
        self.assertEqual(self.flow(self.buyer, c, 'approve', milestone_id=m.pk).status_code, 200)
        attempt_payout(m.pk); m.refresh_from_db(); self.assertEqual(m.payout_status, 'CONFIG_REQUIRED')
        m.payout_reference = 'payout-test'; m.payout_provider_id = 'po-test'; m.save()
        payload = {'reference_id': 'payout-test', 'payout_id': 'po-test', 'source_currency': 'PHP', 'source_amount': 30000, 'status': 'SUCCEEDED'}
        apply_payout(m, payload); apply_payout(m, payload)
        c.refresh_from_db(); self.assertEqual(c.held_amount, Decimal('800.00'))
        payload['status'] = 'REVERSED'; apply_payout(m, payload); apply_payout(m, payload)
        c.refresh_from_db(); self.assertEqual(c.held_amount, Decimal('1100.00'))

    def test_uncertain_payout_stops_before_idempotency_window_expires(self):
        from .models import CommissionPayoutProfile
        c = self.funded(); m = c.milestones.first(); self.submit(c, m)
        self.assertEqual(self.flow(self.buyer, c, 'approve', milestone_id=m.pk).status_code, 200)
        m.refresh_from_db(); m.payout_reference = 'uncertain-payout'; m.payout_status = 'RETRY_PENDING'; m.save()
        CommissionPayoutProfile.objects.create(artist=self.artist, recipient={'type': 'INDIVIDUAL'})
        entry = CommissionLedger.objects.create(commission=c, reference='uncertain-payout-attempt', kind='PAYOUT_ATTEMPT', amount=0)
        CommissionLedger.objects.filter(pk=entry.pk).update(created_at=timezone.now() - timezone.timedelta(hours=24))
        with override_settings(XENDIT_SECRET_KEY='test-only', COMMISSION_PAYOUTS_ENABLED=True), patch('commissions.lifecycle.requests.post') as provider:
            attempt_payout(m.pk); provider.assert_not_called()
        m.refresh_from_db(); self.assertEqual(m.payout_status, 'RECONCILE')

    def test_payout_profile_prefills_identity_and_preserves_masked_saved_account(self):
        from users.models import Address
        from .models import CommissionPayoutProfile
        self.artist.first_name = 'Ada'; self.artist.middle_name = 'May'; self.artist.last_name = 'Reyes'; self.artist.save()
        Address.objects.create(user=self.artist, region='VII', province='Cebu', city='Mandaue', postal_code='6014', barangay='Centro', street='12 Artist Street', is_default=True)
        path = '/api/commissions/payout-profile/'
        response = self.call(self.artist, path, method='get')
        self.assertEqual(response.status_code, 200, response.data)
        fields = response.data['fields']
        self.assertEqual(fields['given_name'], 'Ada'); self.assertEqual(fields['surname'], 'Reyes')
        self.assertEqual(fields['account_holder_name'], 'Ada May Reyes')
        self.assertEqual(fields['city'], 'Mandaue'); self.assertEqual(fields['postal_code'], '6014')
        self.assertEqual(fields['account_number'], '')
        fields['account_number'] = '09171234567'
        saved = self.call(self.artist, path, fields)
        self.assertEqual(saved.status_code, 200, saved.data)
        self.assertTrue(saved.data['configured']); self.assertEqual(saved.data['account_last4'], '4567')
        self.assertNotIn('09171234567', str(saved.data))
        reloaded = self.call(self.artist, path, method='get')
        self.assertEqual(reloaded.data['fields']['given_name'], 'Ada')
        self.assertEqual(reloaded.data['fields']['account_number'], '')
        self.assertEqual(self.call(self.artist, path, reloaded.data['fields']).status_code, 200)
        profile = CommissionPayoutProfile.objects.get(artist=self.artist)
        self.assertEqual(profile.recipient['account_details']['account_number'], '09171234567')
        changed = dict(reloaded.data['fields'], routing_type='SWIFT', routing_value='BOPIPHMM')
        self.assertEqual(self.call(self.artist, path, changed).status_code, 400)
        self.assertEqual(self.call(self.buyer, path, method='get').status_code, 403)

    def test_xendit_connection_check_does_not_expose_balance_or_send_money(self):
        with override_settings(XENDIT_SECRET_KEY='xnd_development_test', COMMISSION_PAYOUTS_ENABLED=True), patch('commissions.lifecycle.requests.get') as provider, patch('commissions.lifecycle.requests.post') as send_money:
            provider.return_value.json.return_value = {'balance': 999999}
            response = self.call(self.artist, '/api/commissions/payout-profile/?check_connection=1', method='get')
            self.assertEqual(response.status_code, 200, response.data)
            self.assertTrue(response.data['xendit']['reachable'])
            self.assertEqual(response.data['xendit']['mode'], 'test')
            self.assertNotIn('balance', str(response.data)); self.assertNotIn('xnd_development_test', str(response.data))
            send_money.assert_not_called()
            provider.assert_called_once()

    def test_saved_recipient_is_sent_to_xendit_for_approved_milestone(self):
        from .models import CommissionPayoutProfile
        fields = {'given_name': 'Ada', 'surname': 'Reyes', 'account_holder_name': 'Ada Reyes', 'account_number': '09171234567', 'routing_type': 'WALLET', 'routing_value': 'PH_GCASH', 'street': '12 Artist Street', 'city': 'Mandaue', 'province': 'Cebu', 'postal_code': '6014'}
        self.assertEqual(self.call(self.artist, '/api/commissions/payout-profile/', fields).status_code, 200)
        c = self.funded(); m = c.milestones.first(); self.submit(c, m)
        self.assertEqual(self.flow(self.buyer, c, 'approve', milestone_id=m.pk).status_code, 200)
        with override_settings(XENDIT_SECRET_KEY='xnd_development_test', COMMISSION_PAYOUTS_ENABLED=True), patch('commissions.lifecycle.requests.post') as provider:
            provider.return_value.json.side_effect = lambda: {'payout_id': 'po-saved-recipient', 'reference_id': CommissionMilestone.objects.get(pk=m.pk).payout_reference, 'status': 'ACCEPTED', 'source_currency': 'PHP', 'source_amount': 30000}
            attempt_payout(m.pk)
            self.assertEqual(provider.call_args.kwargs['json']['recipient'], CommissionPayoutProfile.objects.get(artist=self.artist).recipient)
            self.assertEqual(provider.call_args.args[0], 'https://api.xendit.co/v3/payouts')
        m.refresh_from_db(); self.assertEqual(m.payout_provider_id, 'po-saved-recipient'); self.assertEqual(m.payout_status, 'PROCESSING')
