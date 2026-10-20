from copy import deepcopy
from decimal import Decimal
from unittest.mock import patch
from django.test import TestCase, override_settings
from django.utils import timezone
from rest_framework.test import APIRequestFactory
from users.models import User
from wallets.models import WalletAccount
from .models import RoyaltyFunding, RoyaltyReceipt
from .royalties import RoyaltyReportsView
from .royalty_funding import RoyaltyCheckoutView, RoyaltyAdminReviewView, apply_session
from .test_royalty_reporting import ReportingTests


@override_settings(XENDIT_SECRET_KEY='test-key', ROYALTY_RETURN_URL='', XENDIT_RETURN_URL='')
class RoyaltyFundingTests(TestCase):
    def setUp(self):
        ReportingTests.setUp(self)
        self.admin = User.objects.create(username='reviewer', email='reviewer@test.com', firebase_uid='reviewer', role='platform_admin')
        self.period.terms = {**self.period.terms, 'review_mode': 'admin_held'}
        self.period.save()

    call = ReportingTests.call

    def submit(self):
        result = self.call(RoyaltyReportsView, self.buyer, 'post', {'metrics': {'gross_sales': '1000'}, 'evidence': self.evidence}, period_id=self.period.pk)
        self.assertEqual(result.status_code, 200)

    def start(self):
        self.submit()
        with patch('messaging.royalty_funding.provider', return_value={'payment_session_id': 'ps-test', 'payment_link_url': 'https://example.com/pay'}) as provider:
            response = self.call(RoyaltyCheckoutView, self.buyer, 'post', {'action': 'pay'}, period_id=self.period.pk)
            self.assertEqual(response.status_code, 201)
            self.assertEqual(provider.call_args.args, ('POST', '/sessions'))
        return RoyaltyFunding.objects.get(period=self.period)

    def session(self, funding):
        return {'amount': str(funding.amount), 'currency': 'PHP', 'session_type': 'PAY', 'payment_session_id': funding.session_id,
                'reference_id': funding.reference, 'status': 'COMPLETED', 'payment_id': 'payment-verified'}

    def test_paid_money_is_held_until_admin_release_and_both_are_idempotent(self):
        funding = self.start()
        data = self.session(funding)
        apply_session(funding.pk, data)
        apply_session(funding.pk, data)
        wallet = WalletAccount.objects.get(user=self.artist)
        self.assertEqual(wallet.pending_balance, Decimal('100'))
        self.assertEqual(wallet.available_balance, 0)
        self.assertEqual(RoyaltyReceipt.objects.count(), 1)
        for _ in range(2):
            result = self.call(RoyaltyAdminReviewView, self.admin, 'post', {'action': 'release', 'note': 'Evidence verified'}, period_id=self.period.pk)
            self.assertEqual(result.status_code, 200)
        wallet.refresh_from_db()
        self.assertEqual(wallet.pending_balance, 0)
        self.assertEqual(wallet.available_balance, Decimal('100'))

    def test_artist_cannot_approve_admin_report_and_unpaid_cannot_be_released(self):
        self.submit()
        self.assertEqual(self.call(RoyaltyReportsView, self.artist, 'patch', {'action': 'approve'}, period_id=self.period.pk).status_code, 403)
        self.assertEqual(self.call(RoyaltyAdminReviewView, self.artist, 'post', {'action': 'release'}, period_id=self.period.pk).status_code, 403)
        self.assertEqual(self.call(RoyaltyAdminReviewView, self.admin, 'post', {'action': 'release'}, period_id=self.period.pk).status_code, 409)

    def test_checkout_is_buyer_only_and_never_creates_a_second_session(self):
        funding = self.start()
        with patch('messaging.royalty_funding.provider') as provider:
            response = self.call(RoyaltyCheckoutView, self.buyer, 'post', {'action': 'pay'}, period_id=self.period.pk)
            self.assertEqual(response.status_code, 200)
            provider.assert_not_called()
            self.assertEqual(self.call(RoyaltyCheckoutView, self.artist, 'post', {}, period_id=self.period.pk).status_code, 404)
        self.assertEqual(RoyaltyFunding.objects.count(), 1)

    def test_wrong_provider_amount_cannot_credit_and_paid_report_cannot_change(self):
        funding = self.start()
        data = self.session(funding); data['amount'] = '1'
        with self.assertRaises(ValueError):
            apply_session(funding.pk, data)
        self.assertFalse(WalletAccount.objects.filter(user=self.artist).exists())
        self.period.status = 'rejected'; self.period.save(update_fields=['status'])
        response = self.call(RoyaltyReportsView, self.buyer, 'post', {'metrics': {'gross_sales': '100'}, 'evidence': self.evidence}, period_id=self.period.pk)
        self.assertEqual(response.status_code, 409)

    def test_admin_can_reject_unpaid_and_zero_report_needs_verification(self):
        self.submit()
        self.assertEqual(self.call(RoyaltyAdminReviewView, self.admin, 'post', {'action': 'reject', 'note': 'Missing sales evidence'}, period_id=self.period.pk).status_code, 200)
        self.period.refresh_from_db(); self.assertEqual(self.period.status, 'rejected')
        result = self.call(RoyaltyReportsView, self.buyer, 'post', {'metrics': {'gross_sales': '0'}, 'evidence': self.evidence}, period_id=self.period.pk)
        self.assertEqual(result.data['status'], 'submitted')
        self.assertEqual(self.call(RoyaltyAdminReviewView, self.admin, 'post', {'action': 'release'}, period_id=self.period.pk).data['status'], 'zero_due')

    def test_admin_queue_is_private(self):
        self.submit()
        self.assertEqual(self.call(RoyaltyAdminReviewView, self.buyer, 'get').status_code, 403)
        result = self.call(RoyaltyAdminReviewView, self.admin, 'get')
        self.assertEqual(result.status_code, 200)
        self.assertEqual(result.data[0]['id'], self.period.pk)

    def test_new_period_has_report_deadline_seven_days_before_payment(self):
        from datetime import date, timedelta
        from .royalties import ensure_periods, period_data
        self.agreement.royalty_periods.all().delete()
        self.agreement.compensation_terms['review_mode'] = 'admin_held'
        self.agreement.save()
        ensure_periods(self.agreement, date(2026, 2, 1))
        period = self.agreement.royalty_periods.first()
        self.assertEqual(period.due_on, period.ends_on + timedelta(days=14))
        self.assertEqual(period_data(period, self.buyer)['report_due_on'], str(period.ends_on + timedelta(days=7)))

    def test_webhook_refetches_provider_before_holding_money(self):
        from wallets.views import xendit_payment_session_webhook
        funding = self.start()
        callback = self.factory.post('/', {'event': 'payment_session.completed', 'data': self.session(funding)}, format='json', HTTP_X_CALLBACK_TOKEN='callback-test')
        with override_settings(XENDIT_WEBHOOK_TOKEN='callback-test'), patch('messaging.royalty_payments.provider', return_value=self.session(funding)) as provider:
            result = xendit_payment_session_webhook(callback)
            self.assertEqual(result.status_code, 200)
            provider.assert_called_once_with('GET', '/sessions/ps-test')
        self.assertEqual(WalletAccount.objects.get(user=self.artist).available_balance, 0)
