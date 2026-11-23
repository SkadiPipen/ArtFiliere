from datetime import timedelta
from decimal import Decimal
from unittest.mock import Mock, patch
from django.test import TestCase, override_settings
from django.utils import timezone
from rest_framework.exceptions import ValidationError
from wallets.models import WalletAccount
from . import test_lifecycle as fixtures
from .extra_revisions import apply_payment
from .models import CommissionExtraRevision


@override_settings(COMMISSION_RESALE_ROYALTY_PERCENTAGE='5.00', XENDIT_SECRET_KEY='', XENDIT_WEBHOOK_TOKEN='test-callback', COMMISSION_HOLDING_ENABLED=False, COMMISSION_PAYOUTS_ENABLED=False)
class ExtraRevisionTests(TestCase):
    setUp = fixtures.LifecycleTests.setUp
    call = fixtures.LifecycleTests.call
    new = fixtures.LifecycleTests.new
    agreed = fixtures.LifecycleTests.agreed
    funded = fixtures.LifecycleTests.funded
    flow = fixtures.LifecycleTests.flow
    image = fixtures.LifecycleTests.image
    submit = fixtures.LifecycleTests.submit

    def final(self, art_type='Digital'):
        c = self.funded(art_type)
        c.status = 'STAGE_3'; c.save()
        c.milestones.filter(milestone_number__lt=3).update(status='APPROVED', approved_at=timezone.now())
        m = c.milestones.get(milestone_number=3)
        self.submit(c, m)
        self.assertEqual(self.flow(self.buyer, c, 'revise', milestone_id=m.pk, comment='Included changes').status_code, 200)
        self.submit(c, m)
        return c, m

    def requested(self):
        c, m = self.final()
        r = self.flow(self.buyer, c, 'request_extra_revision', comment='Add a second character')
        self.assertEqual(r.status_code, 200, r.data)
        m.refresh_from_db(); self.assertIsNone(m.review_due_at)
        return c, m, c.extra_revisions.get()

    def quoted(self):
        c, m, e = self.requested()
        r = self.flow(self.artist, c, 'quote_extra_revision', extra_revision_id=e.pk, scope='Add a second character in the background', amount='220.00', due_at=(timezone.now()+timedelta(days=7)).isoformat())
        self.assertEqual(r.status_code, 200, r.data)
        e.refresh_from_db(); self.assertEqual(e.platform_fee, Decimal('20.00'))
        return c, m, e

    def paid(self):
        c, m, e = self.quoted()
        e.status = 'AWAITING_PAYMENT'; e.accepted_at = timezone.now(); e.payment_reference = f'commission-extra-{e.pk}-test'; e.provider_id = 'extra-invoice'; e.save()
        payload = {'id': e.provider_id, 'external_id': e.payment_reference, 'amount': '220.00', 'currency': 'PHP', 'status': 'PAID'}
        apply_payment(payload); apply_payment(payload)
        e.refresh_from_db(); self.assertEqual(e.status, 'FUNDED'); self.assertEqual(e.held_amount, Decimal('220'))
        return c, m, e, payload

    def test_full_flow_separate_balances_and_idempotent_release(self):
        c, m, e, payload = self.paid()
        original = c.held_amount
        self.assertEqual(c.ledger.filter(kind='EXTRA_REVISION_FUNDING').count(), 1)
        self.assertEqual(self.flow(self.buyer, c, 'approve', milestone_id=m.pk).status_code, 409)
        self.assertEqual(self.flow(self.artist, c, 'approve_extra_revision', extra_revision_id=e.pk).status_code, 403)
        self.submit(c, m); e.refresh_from_db(); self.assertEqual(e.status, 'SUBMITTED'); self.assertIsNotNone(e.submission_id)
        self.assertEqual(self.flow(self.buyer, c, 'approve_extra_revision', extra_revision_id=e.pk).status_code, 200)
        self.assertEqual(self.flow(self.buyer, c, 'approve_extra_revision', extra_revision_id=e.pk).status_code, 409)
        wallet = WalletAccount.objects.get(user=self.artist); self.assertEqual(wallet.available_balance, Decimal('200'))
        e.refresh_from_db(); self.assertEqual(e.held_amount, 0)
        c.refresh_from_db(); self.assertEqual(c.held_amount, original); self.assertEqual(c.status, 'STAGE_3')
        self.assertEqual(self.flow(self.buyer, c, 'approve', milestone_id=m.pk).status_code, 200)

    def test_permissions_duplicate_requests_and_no_work_before_payment(self):
        c, m, e = self.requested()
        self.assertEqual(self.flow(self.buyer, c, 'request_extra_revision', comment='Another extra request').status_code, 409)
        self.assertEqual(self.flow(self.buyer, c, 'quote_extra_revision', extra_revision_id=e.pk).status_code, 403)
        r = self.call(self.artist, f'/api/commissions/flow/{c.pk}/', {'action': 'submit', 'milestone_id': m.pk, 'file': self.image()}, multipart=True)
        self.assertEqual(r.status_code, 409)
        self.assertEqual(self.flow(self.other, c, 'decline_extra_revision', extra_revision_id=e.pk).status_code, 404)

    def test_declined_quote_restores_review_and_preserves_agreement(self):
        c, m, e = self.quoted(); snapshot = c.locked_terms
        self.assertEqual(self.flow(self.buyer, c, 'decline_extra_revision', extra_revision_id=e.pk).status_code, 200)
        m.refresh_from_db(); self.assertIsNotNone(m.review_due_at)
        c.refresh_from_db(); self.assertEqual(c.locked_terms, snapshot)
        self.assertEqual(self.flow(self.buyer, c, 'request_extra_revision', comment='Pause the same submission again').status_code, 409)

    def test_expired_request_does_not_freeze_original(self):
        c, m, e = self.requested(); e.response_due_at = timezone.now()-timedelta(seconds=1); e.save()
        r = self.call(self.buyer, f'/api/commissions/flow/{c.pk}/', method='get')
        self.assertEqual(r.status_code, 200); e.refresh_from_db(); self.assertEqual(e.status, 'EXPIRED')
        c.refresh_from_db(); self.assertFalse(c.disputed); m.refresh_from_db(); self.assertIsNotNone(m.review_due_at)

    def test_payment_amount_validation_and_late_payment_frozen(self):
        c, m, e = self.quoted(); e.status = 'AWAITING_PAYMENT'; e.payment_reference = 'commission-extra-test'; e.provider_id = 'invoice'; e.response_due_at = timezone.now()-timedelta(seconds=1); e.save()
        payload = {'id': 'invoice', 'external_id': e.payment_reference, 'amount': '221.00', 'currency': 'PHP', 'status': 'PAID'}
        with self.assertRaises(ValidationError): apply_payment(payload)
        payload['amount'] = '220.00'; apply_payment(payload)
        e.refresh_from_db(); self.assertEqual(e.status, 'RECONCILE'); c.refresh_from_db(); self.assertTrue(c.disputed)
        self.assertFalse(WalletAccount.objects.filter(user=self.artist).exists())

    @override_settings(XENDIT_SECRET_KEY='test', COMMISSION_HOLDING_ENABLED=True)
    def test_checkout_is_explicit_and_reuses_invoice(self):
        c, m, e = self.quoted()
        with patch('commissions.extra_revisions.requests.get', return_value=Mock(json=lambda: [], raise_for_status=lambda: None)), patch('commissions.extra_revisions.requests.post') as create:
            def invoice(**kwargs):
                e.refresh_from_db()
                return Mock(json=lambda: {'id': 'invoice', 'invoice_url': 'https://checkout.example/test', 'external_id': e.payment_reference, 'currency': 'PHP', 'amount': 220}, raise_for_status=lambda: None)
            create.side_effect = lambda *args, **kwargs: invoice(**kwargs)
            self.assertEqual(self.flow(self.buyer, c, 'pay_extra_revision', extra_revision_id=e.pk).status_code, 400)
            for _ in range(2):
                r = self.flow(self.buyer, c, 'pay_extra_revision', extra_revision_id=e.pk, accept_quote=True)
                self.assertEqual(r.status_code, 200, r.data); self.assertEqual(r.data['checkout_url'], 'https://checkout.example/test')
            self.assertEqual(create.call_count, 1)
        e.refresh_from_db(); self.assertIsNone(e.funded_at)

    def test_no_extra_after_dispatch_preparation(self):
        c, m = self.final('Physical'); m.delivery_ready_at = timezone.now(); m.save()
        self.assertEqual(self.flow(self.buyer, c, 'request_extra_revision', comment='Change the physical artwork').status_code, 409)

    def test_support_refund_separate_balance_once(self):
        c, m, e, _ = self.paid(); c.disputed = True; c.save()
        payload = {'action': 'refund_extra_revision', 'extra_revision_id': e.pk, 'reason': 'Extra work cancelled by agreement'}
        path = f'/api/commissions/reviews/{c.pk}/'
        self.assertEqual(self.call(self.buyer, path, payload).status_code, 403)
        self.assertEqual(self.call(self.staff, path, payload).status_code, 200)
        self.assertEqual(self.call(self.staff, path, payload).status_code, 409)
        self.assertEqual(WalletAccount.objects.get(user=self.buyer).available_balance, Decimal('220'))
        c.refresh_from_db(); self.assertEqual(c.held_amount, Decimal('1100'))

    def test_extra_not_available_before_included_revision(self):
        c = self.funded(); c.status = 'STAGE_3'; c.save()
        c.milestones.filter(milestone_number__lt=3).update(status='APPROVED', approved_at=timezone.now())
        m = c.milestones.get(milestone_number=3); self.submit(c, m)
        self.assertEqual(self.flow(self.buyer, c, 'request_extra_revision', comment='New preference').status_code, 409)
        self.assertEqual(c.extra_revisions.count(), 0)

    def test_quote_validation_and_immutable_sent_quote(self):
        c, m, e = self.requested()
        for price in ['0', '-1', 'NaN', '1.234']:
            response = self.flow(self.artist, c, 'quote_extra_revision', extra_revision_id=e.pk, scope='Additional scope', amount=price, due_at=(timezone.now()+timedelta(days=7)).isoformat())
            self.assertEqual(response.status_code, 400)
        response = self.flow(self.artist, c, 'quote_extra_revision', extra_revision_id=e.pk, scope='Additional scope', amount='110', due_at=(timezone.now()+timedelta(days=7)).isoformat())
        self.assertEqual(response.status_code, 200)
        self.assertEqual(self.flow(self.artist, c, 'quote_extra_revision', extra_revision_id=e.pk, scope='Changed quote', amount='220', due_at=(timezone.now()+timedelta(days=7)).isoformat()).status_code, 409)
        e.refresh_from_db(); self.assertEqual(e.amount, Decimal('110'))

    def test_webhook_authentication_and_duplicate_callbacks(self):
        c, m, e = self.quoted()
        e.status = 'AWAITING_PAYMENT'; e.payment_reference = 'commission-extra-hook'; e.provider_id = 'invoice-hook'; e.accepted_at = timezone.now(); e.save()
        payload = {'id': e.provider_id, 'external_id': e.payment_reference, 'amount': '220', 'currency': 'PHP', 'status': 'PAID'}
        path = '/api/commissions/payments/webhook/'
        self.client.credentials()
        self.assertEqual(self.client.post(path, payload, format='json').status_code, 403)
        for _ in range(2): self.assertEqual(self.client.post(path, payload, format='json', HTTP_X_CALLBACK_TOKEN='test-callback').status_code, 200)
        e.refresh_from_db(); self.assertEqual(e.status, 'FUNDED')
        self.assertEqual(c.ledger.filter(kind='EXTRA_REVISION_FUNDING').count(), 1)

    def test_worker_escalates_late_extra_work_without_releasing_money(self):
        from django.core.management import call_command
        c, m, e, _ = self.paid(); e.due_at = timezone.now()-timedelta(seconds=1); e.save()
        call_command('process_commission_events'); call_command('process_commission_events')
        c.refresh_from_db(); self.assertTrue(c.disputed)
        e.refresh_from_db(); self.assertEqual(e.held_amount, Decimal('220'))
        self.assertFalse(WalletAccount.objects.filter(user=self.artist).exists())

    def test_earnings_lists_extra_separately_as_available_after_approval(self):
        from wallets.artist_earnings import earnings_rows
        c, m, e, _ = self.paid(); self.submit(c, m)
        self.assertEqual(self.flow(self.buyer, c, 'approve_extra_revision', extra_revision_id=e.pk).status_code, 200)
        row = next(r for r in earnings_rows(self.artist) if r['id'] == f'extra-revision-{e.pk}')
        self.assertEqual(row['status'], 'available'); self.assertEqual(row['net'], '200.00'); self.assertEqual(row['fees'], '20.00')
