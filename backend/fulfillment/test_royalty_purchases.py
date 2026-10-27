from datetime import timedelta
from django.test import TestCase
from django.utils import timezone
from . import tests as fixtures
from .views import PurchasesView, RoyaltyLicenseDownloadView
from messaging.models import Agreement, RoyaltyPeriod

class RoyaltyPurchaseTests(TestCase):
    setUp = fixtures.FulfillmentTests.setUp
    call = fixtures.FulfillmentTests.call
    proposal = fixtures.FulfillmentTests.proposal

    def license(self):
        pk = self.proposal()
        Agreement.objects.filter(pk=pk).update(compensation_type='royalty')
        return Agreement.objects.get(pk=pk)

    def test_signed_royalty_license_without_checkout_is_listed_and_downloadable(self):
        agreement = self.license()
        rows = self.call(PurchasesView, self.buyer).data
        self.assertEqual(len(rows), 1)
        self.assertTrue(rows[0]['is_royalty_license'])
        self.assertTrue(rows[0]['can_download'])
        self.assertTrue(rows[0]['download_path'])
        self.assertEqual(self.call(RoyaltyLicenseDownloadView, self.buyer, agreement_id=agreement.pk).status_code, 200)
        self.assertEqual(self.call(PurchasesView, self.other).data, [])
        self.assertEqual(self.call(RoyaltyLicenseDownloadView, self.other, agreement_id=agreement.pk).status_code, 404)

    def test_cutoff_keeps_license_visible_and_paid_restores_downloads(self):
        agreement = self.license()
        today = timezone.localdate()
        period = RoyaltyPeriod.objects.create(agreement=agreement, starts_on=today-timedelta(days=30), ends_on=today, due_on=today+timedelta(days=7), terms={})
        rows = self.call(PurchasesView, self.buyer).data
        self.assertEqual(len(rows), 1)
        self.assertFalse(rows[0]['can_download'])
        self.assertEqual(self.call(RoyaltyLicenseDownloadView, self.buyer, agreement_id=agreement.pk).status_code, 403)
        period.status = 'funded'; period.save()
        self.assertTrue(self.call(PurchasesView, self.buyer).data[0]['can_download'])

    def test_unsigned_and_hybrid_without_upfront_payment_are_not_unlocked(self):
        agreement = self.license()
        Agreement.objects.filter(pk=agreement.pk).update(buyer_signature_image='')
        self.assertEqual(self.call(PurchasesView, self.buyer).data, [])
        self.assertEqual(self.call(RoyaltyLicenseDownloadView, self.buyer, agreement_id=agreement.pk).status_code, 404)
        Agreement.objects.filter(pk=agreement.pk).update(buyer_signature_image='test', compensation_type='hybrid')
        self.assertEqual(self.call(RoyaltyLicenseDownloadView, self.buyer, agreement_id=agreement.pk).status_code, 404)
