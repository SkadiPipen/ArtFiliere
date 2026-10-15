from io import BytesIO
from unittest.mock import patch
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


@override_settings(XENDIT_SECRET_KEY='', XENDIT_WEBHOOK_TOKEN='test-callback', COMMISSION_HOLDING_ENABLED=False, COMMISSION_PAYOUTS_ENABLED=False)
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

    def new(self, art_type='Digital'):
        response = self.call(self.buyer, '/api/commissions/request/', {'artist_id': self.artist.pk, 'subject': 'Portrait', 'style': 'Realism',
            'art_type': art_type, 'deadline': self.deadline, 'proposed_budget': '1000',
            'proposal': {'price': '1100.00', 'deadline': self.deadline, 'milestones': [30, 30, 40], 'allow_resale': True, 'royalty_percentage': '10.00',
                'delivery_address': 'Buyer, Cebu City', 'pickup_address': 'Artist, Mandaue City', 'delivery_fee': '100.00' if art_type == 'Physical' else '0'}})
        self.assertEqual(response.status_code, 201, response.data)
        return CommissionRequest.objects.get(pk=response.data['commission_req_id'])

    def flow(self, user, c, action, **data):
        return self.call(user, f'/api/commissions/flow/{c.pk}/', {'action': action, **data})

    def agreed(self, art_type='Digital'):
        c = self.new(art_type)
        result = self.flow(self.artist, c, 'accept', version=1)
        self.assertEqual(result.status_code, 200, result.data)
        c.refresh_from_db()
        for user in (self.buyer, self.artist):
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

    def funded(self, art_type='Digital'):
        c = self.agreed(art_type)
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

    def test_physical_final_requires_shipping_and_buyer_receipt(self):
        c = self.funded('Physical')
        self.assertEqual(sum(c.milestones.values_list('amount', flat=True)), Decimal('1009.09'))
        for m in c.milestones.order_by('milestone_number'):
            self.submit(c, m)
            if m.milestone_number == 3:
                self.assertEqual(self.flow(self.buyer, c, 'approve', milestone_id=m.pk).status_code, 409)
                self.assertEqual(self.flow(self.buyer, c, 'receive', milestone_id=m.pk).status_code, 409)
                self.assertEqual(self.flow(self.artist, c, 'ship', milestone_id=m.pk, tracking='Courier ABC123').status_code, 200)
                self.assertEqual(self.flow(self.artist, c, 'receive', milestone_id=m.pk).status_code, 409)
                self.assertEqual(self.flow(self.buyer, c, 'receive', milestone_id=m.pk).status_code, 200)
            self.assertEqual(self.flow(self.buyer, c, 'approve', milestone_id=m.pk).status_code, 200)

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
        c = self.funded()
        for m in c.milestones.order_by('milestone_number'):
            self.submit(c, m); self.assertEqual(self.flow(self.buyer, c, 'approve', milestone_id=m.pk).status_code, 200)
        asset = CommissionAsset.objects.get(commission=c)
        result = self.call(self.buyer, f'/api/commissions/assets/{asset.pk}/resale/', {'price': '2200.00'})
        self.assertEqual(result.status_code, 201, result.data)
        artwork = Artwork.objects.get(pk=result.data['artwork_id'])
        payment = PaymentSession.objects.create(reference_id='resale-payment-test', buyer=self.other, artist=self.buyer, artwork=artwork, gross_amount='2200', platform_fee='200', artist_amount='2000', status='paid')
        payment.refresh_from_db(); allocate_royalty(payment); allocate_royalty(payment)
        asset.refresh_from_db(); payment.refresh_from_db()
        self.assertEqual(asset.owner_id, self.other.pk); self.assertEqual(payment.artist_amount, Decimal('1800.00'))
        wallet = WalletAccount.objects.get(user=self.artist); self.assertEqual(wallet.pending_balance, Decimal('200.00'))
        settle_royalty(payment); settle_royalty(payment)
        wallet.refresh_from_db(); self.assertEqual(wallet.available_balance, Decimal('200.00')); self.assertEqual(wallet.pending_balance, 0)

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
