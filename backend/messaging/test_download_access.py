from datetime import date, timedelta
from unittest.mock import patch
from django.test import TestCase, override_settings
from django.utils import timezone
from fulfillment import tests as fixtures
from fulfillment.views import PurchaseDownloadView, PurchasesView
from .models import Agreement, RoyaltyPeriod
from .download_access import royalty_download_block

@override_settings(XENDIT_SECRET_KEY='test', XENDIT_WEBHOOK_TOKEN='callback')
class DownloadAccessTests(TestCase):
    setUp = fixtures.FulfillmentTests.setUp
    call = fixtures.FulfillmentTests.call
    proposal = fixtures.FulfillmentTests.proposal
    checkout = fixtures.FulfillmentTests.checkout
    complete = fixtures.FulfillmentTests.complete

    def prepare(self):
        payment = self.checkout(self.proposal())
        self.complete(payment)
        Agreement.objects.filter(pk=payment.agreement_id).update(compensation_type='royalty')
        payment.refresh_from_db()
        period = RoyaltyPeriod.objects.create(agreement=payment.agreement, starts_on=date(2026, 1, 1), ends_on=date(2026, 2, 1), due_on=date(2026, 2, 8), terms={})
        return payment, period

    def test_cutoff_is_inclusive_and_unpaid_overdue_stays_blocked(self):
        payment, period = self.prepare()
        self.assertIsNone(royalty_download_block(payment.agreement, date(2026, 1, 31)))
        self.assertIsNotNone(royalty_download_block(payment.agreement, date(2026, 2, 1)))
        self.assertIsNotNone(royalty_download_block(payment.agreement, date(2026, 3, 1)))

    def test_verified_paid_held_and_zero_due_restore_access(self):
        payment, period = self.prepare()
        for status in ('paid', 'funded', 'zero_due'):
            period.status = status; period.save()
            self.assertIsNone(royalty_download_block(payment.agreement, date(2026, 2, 1)))

    def test_one_time_unaffected_and_other_debts_remain_blocking(self):
        payment, period = self.prepare()
        payment.agreement.compensation_type = 'one_time'
        self.assertIsNone(royalty_download_block(payment.agreement, date(2026, 2, 1)))
        payment.agreement.compensation_type = 'hybrid'
        self.assertIsNotNone(royalty_download_block(payment.agreement, date(2026, 2, 1)))

    def test_download_endpoint_and_list_enforce_same_cutoff(self):
        payment, period = self.prepare()
        with patch('messaging.download_access.timezone.localdate', return_value=date(2026, 2, 1)):
            response = self.call(PurchaseDownloadView, self.buyer, payment_id=payment.pk)
            self.assertEqual(response.status_code, 403)
            row = self.call(PurchasesView, self.buyer).data[0]
            self.assertFalse(row['can_download'])
            self.assertEqual(row['download_block']['due_on'], '2026-02-08')
            self.assertTrue(row['image'].startswith('data:image/jpeg;base64,'))
            period.status = 'funded'; period.save()
            self.assertEqual(self.call(PurchaseDownloadView, self.buyer, payment_id=payment.pk).status_code, 200)
