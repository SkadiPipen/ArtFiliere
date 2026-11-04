from unittest.mock import patch
from types import SimpleNamespace
from django.test import TestCase
from django.utils import timezone
from users.models import User, ModeratorApplication, ActivityLog
from users.test_moderators import ModeratorEvaluationTests
from users.moderators import ModeratorApplicationsView, ModeratorApplicationDetail, ModeratorDocumentView, DriverAccountView
from fulfillment.models import DeliveryOrder, RiderProfile
from fulfillment.riders import RiderProfileView
from notifications.admin_requests import pending_requests


class DriverEvaluationTests(TestCase):
    setUp = ModeratorEvaluationTests.setUp
    user = ModeratorEvaluationTests.user

    def call(self, view, actor, method='get', data=None, driver=True, **kwargs):
        request = getattr(self.factory, method)('/', data or {}, format='json')
        options = {'kind': 'driver'} if driver and view in {ModeratorApplicationsView, ModeratorApplicationDetail, ModeratorDocumentView} else {}
        with patch('authentication.views.AuthenticatedAPIView.get_request_user', return_value=actor):
            return view.as_view(**options)(request, **kwargs)

    def submit(self, **changes):
        data = {**self.payload, 'requested_role': 'driver', 'license_number': 'N01-123-45678',
                'license_expires_on': '2030-12-31', 'documents': self.payload['documents'] * 2, **changes}
        response = self.call(ModeratorApplicationsView, self.hr, 'post', data)
        self.assertEqual(response.status_code, 201, response.data)
        return ModeratorApplication.objects.get(pk=response.data['id'])

    def decide(self, item, actor, action):
        item.refresh_from_db()
        return self.call(ModeratorApplicationDetail, actor, 'patch', {'version': item.version, 'action': action, 'note': 'Review completed'}, application_id=item.pk)

    def test_driver_review_is_separate_from_moderator_and_admin_grants_access(self):
        item = self.submit()
        self.assertEqual(self.decide(item, self.hr, 'approve').status_code, 409)
        self.assertEqual(self.decide(item, self.admin, 'approve').status_code, 409)
        self.assertEqual(self.decide(item, self.hr, 'claim').status_code, 200)
        self.assertEqual(self.decide(item, self.hr, 'forward').status_code, 200)
        self.buyer.refresh_from_db()
        self.assertEqual(self.buyer.role, 'buyer')
        self.assertTrue(any(row['category'] == 'driver' for row in pending_requests()))
        self.assertFalse(any(row['category'] == 'moderator' for row in pending_requests()))
        self.assertEqual(self.call(ModeratorApplicationDetail, self.hr, driver=False, application_id=item.pk).status_code, 404)
        self.assertEqual(self.call(ModeratorDocumentView, self.hr, driver=False, application_id=item.pk, index=0).status_code, 404)
        self.assertEqual(self.decide(item, self.admin, 'approve').status_code, 200)
        self.assertEqual(self.decide(item, self.admin, 'approve').status_code, 409)
        self.buyer.refresh_from_db()
        self.assertEqual(self.buyer.role, 'driver')
        self.assertTrue(RiderProfile.objects.filter(user=self.buyer).exists())
        directory = self.call(ModeratorApplicationsView, self.hr).data
        self.assertEqual(directory['moderators'][0]['application_id'], item.pk)

    def test_license_validation_and_private_attachments(self):
        payload = {**self.payload, 'requested_role': 'driver', 'license_number': 'N01-1234', 'license_expires_on': '2030-01-01', 'documents': self.payload['documents'] * 2}
        for change in [{'license_number': ''}, {'license_expires_on': '2000-01-01'}, {'license_expires_on': 'wrong'}, {'documents': self.payload['documents']}, {'requested_role': 'platform_admin'}]:
            response = self.call(ModeratorApplicationsView, self.hr, 'post', {**payload, **change})
            self.assertEqual(response.status_code, 400, response.data)
        item = self.submit()
        self.assertEqual(self.call(ModeratorDocumentView, self.hr, application_id=item.pk, index=0).content, self.bytes)
        for actor in [None, self.buyer, self.artist]:
            self.assertIn(self.call(ModeratorDocumentView, actor, application_id=item.pk, index=0).status_code, [401, 403])
        self.assertNotIn('data_uri', str(self.call(ModeratorApplicationsView, self.hr).data))

    def test_deactivation_clocks_out_blocks_driver_access_and_can_be_reversed(self):
        driver = self.user('driver', 'driver')
        RiderProfile.objects.create(user=driver, is_clocked_in=True, clock_in_time=timezone.now())
        response = self.call(DriverAccountView, self.hr, 'patch', {'action': 'deactivate', 'note': 'Documents require review'}, user_id=driver.pk)
        self.assertEqual(response.status_code, 200, response.data)
        driver.refresh_from_db()
        self.assertTrue(driver.driver_deactivated)
        self.assertTrue(driver.access_restricted)
        self.assertFalse(RiderProfile.objects.get(user=driver).is_clocked_in)
        self.assertEqual(self.call(RiderProfileView, driver).status_code, 403)
        self.assertEqual(self.call(DriverAccountView, self.hr, 'patch', {'action': 'deactivate', 'note': 'Again'}, user_id=driver.pk).status_code, 409)
        self.assertEqual(self.call(DriverAccountView, self.admin, 'patch', {'action': 'reactivate', 'note': 'Documents verified'}, user_id=driver.pk).status_code, 200)
        driver.refresh_from_db()
        self.assertFalse(driver.driver_deactivated)
        self.assertEqual(ActivityLog.objects.filter(reference_type='driver_account', reference_id=driver.pk).count(), 2)

    def test_deactivation_requires_staff_reason_and_no_ongoing_delivery(self):
        driver = self.user('driver', 'driver')
        for actor in [None, self.buyer, driver]:
            self.assertIn(self.call(DriverAccountView, actor, 'patch', {'action': 'deactivate', 'note': 'Reason'}, user_id=driver.pk).status_code, [401, 403])
        self.assertEqual(self.call(DriverAccountView, self.hr, 'patch', {'action': 'deactivate'}, user_id=driver.pk).status_code, 400)
        from artworks.models import Artwork
        from wallets.models import PaymentSession
        art = Artwork.objects.create(artist=self.artist, title='Physical artwork', price=100, art_type='physical', image_data='')
        payment = PaymentSession.objects.create(reference_id='driver-evaluation-test', buyer=self.buyer, artist=self.artist, artwork=art, gross_amount=100, platform_fee=10, artist_amount=90, status='paid')
        order = DeliveryOrder.objects.create(payment=payment, driver=driver, status='accepted', pickup_address='Artist', delivery_address='Buyer', fee=10)
        self.assertEqual(self.call(DriverAccountView, self.hr, 'patch', {'action': 'deactivate', 'note': 'Review'}, user_id=driver.pk).status_code, 409)
        order.status = 'delivered'
        order.save()
        self.assertEqual(self.call(DriverAccountView, self.hr, 'patch', {'action': 'deactivate', 'note': 'Review'}, user_id=driver.pk).status_code, 200)

    def test_hr_rejection_preserves_non_driver_role_and_history(self):
        item = self.submit()
        self.decide(item, self.hr, 'claim')
        self.assertEqual(self.decide(item, self.other_hr, 'reject').status_code, 409)
        self.assertEqual(self.decide(item, self.hr, 'reject').status_code, 200)
        self.buyer.refresh_from_db()
        self.assertEqual(self.buyer.role, 'buyer')
        item.refresh_from_db()
        self.assertEqual(item.status, 'rejected')
        self.assertEqual(item.reviews.count(), 3)

    def test_external_driver_and_expired_license_at_final_review(self):
        item = self.submit(email='external-driver@example.com', name='New Driver', phone='09123456789', address='Cebu City', date_of_birth='2000-01-01')
        self.assertIsNone(item.user_id)
        self.decide(item, self.hr, 'claim')
        self.decide(item, self.hr, 'forward')
        item.application_details['license_expires_on'] = '2000-01-01'
        item.save(update_fields=['application_details'])
        self.assertEqual(self.decide(item, self.admin, 'approve').status_code, 409)
        item.application_details['license_expires_on'] = '2030-01-01'
        item.save(update_fields=['application_details'])
        with patch('firebase_admin.auth.get_user_by_email', return_value=SimpleNamespace(uid='external-driver-uid', disabled=False)):
            self.assertEqual(self.decide(item, self.admin, 'approve').status_code, 200)
        item.refresh_from_db()
        self.assertEqual(item.user.role, 'driver')
        self.assertTrue(RiderProfile.objects.filter(user=item.user).exists())
