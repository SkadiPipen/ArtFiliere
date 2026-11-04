from datetime import timedelta
from unittest.mock import patch
from django.test import TestCase
from django.utils import timezone
from rest_framework.test import APIRequestFactory
from users.models import User, ResellerApplication, RoyaltyApplication
from .models import AdminRequestRead
from .admin_requests import AdminRequestNotificationsView


class AdminRequestNotificationTests(TestCase):
    def setUp(self):
        self.factory = APIRequestFactory()
        self.admin = self.user('admin', 'platform_admin')
        self.other_admin = self.user('other-admin', 'platform_admin')
        self.buyer = self.user('buyer', 'buyer')
        self.application = self.reseller(self.buyer)

    def user(self, name, role):
        return User.objects.create(firebase_uid=name, username=name, email=name + '@example.com', role=role)

    def reseller(self, user):
        return ResellerApplication.objects.create(user=user, tin_number='123456789', bir_certificate='private-certificate-bytes', bir_certificate_name='bir.png')

    def call(self, user, method='get', data=None):
        request = getattr(self.factory, method)('/', data or {}, format='json')
        with patch('authentication.views.AuthenticatedAPIView.get_request_user', return_value=user):
            return AdminRequestNotificationsView.as_view()(request)

    def test_pending_requests_are_unread_and_get_is_read_only(self):
        response = self.call(self.admin)
        self.assertEqual(response.status_code, 200, response.data)
        self.assertEqual(response.data['unread_count'], 1)
        self.assertEqual(response.data['pending_count'], 1)
        self.assertEqual(response.data['notifications'][0]['destination'], '/reseller-approvals')
        self.assertFalse(AdminRequestRead.objects.exists())
        self.assertNotIn('private-certificate-bytes', str(response.data))
        self.assertEqual(response['Cache-Control'], 'private, no-store')

    def test_click_clears_unread_not_pending_and_survives_refresh(self):
        snapshot = self.call(self.admin).data['snapshot']
        response = self.call(self.admin, 'patch', {'snapshot': snapshot})
        self.assertEqual(response.status_code, 200, response.data)
        self.assertEqual(response.data['unread_count'], 0)
        self.assertEqual(response.data['pending_count'], 1)
        self.application.refresh_from_db()
        self.assertEqual(self.application.status, 'pending')
        self.assertEqual(self.call(self.admin).data['unread_count'], 0)
        self.call(self.admin, 'patch', {'snapshot': snapshot})
        self.assertEqual(AdminRequestRead.objects.count(), 1)

    def test_read_state_is_independent_for_each_admin(self):
        snapshot = self.call(self.admin).data['snapshot']
        self.call(self.admin, 'patch', {'snapshot': snapshot})
        self.assertEqual(self.call(self.other_admin).data['unread_count'], 1)
        self.assertEqual(self.call(self.other_admin, 'patch', {'snapshot': snapshot}).status_code, 403)

    def test_new_arrival_after_snapshot_is_not_accidentally_cleared(self):
        snapshot = self.call(self.admin).data['snapshot']
        self.reseller(self.user('new-buyer', 'buyer'))
        result = self.call(self.admin, 'patch', {'snapshot': snapshot})
        self.assertEqual(result.data['pending_count'], 2)
        self.assertEqual(result.data['unread_count'], 1)

    def test_individual_click_marks_only_selected_request(self):
        self.reseller(self.user('second-buyer', 'buyer'))
        data = self.call(self.admin).data
        result = self.call(self.admin, 'patch', {'snapshot': data['snapshot'], 'request_key': data['notifications'][0]['key']})
        self.assertEqual(result.data['unread_count'], 1)
        self.assertEqual(AdminRequestRead.objects.count(), 1)

    def test_queue_read_marks_only_displayed_ids_in_selected_category(self):
        other = self.reseller(self.user('queue-buyer', 'buyer'))
        data = self.call(self.admin).data
        result = self.call(self.admin, 'patch', {'snapshot': data['snapshot'], 'category': 'reseller', 'request_ids': [self.application.pk]})
        self.assertEqual(result.data['unread_count'], 1)
        self.assertEqual(result.data['pending_count'], 2)
        self.assertEqual(AdminRequestRead.objects.count(), 1)
        result = self.call(self.admin, 'patch', {'snapshot': data['snapshot'], 'category': 'royalty', 'request_ids': [other.pk]})
        self.assertEqual(result.data['unread_count'], 1)

    def test_queue_read_rejects_malformed_ids(self):
        data = self.call(self.admin).data
        for ids in ('all', [True], [{}]):
            result = self.call(self.admin, 'patch', {'snapshot': data['snapshot'], 'category': 'reseller', 'request_ids': ids})
            self.assertEqual(result.status_code, 400)
        self.assertFalse(AdminRequestRead.objects.exists())

    def test_decision_removes_request_and_resubmission_is_new(self):
        snapshot = self.call(self.admin).data['snapshot']
        self.call(self.admin, 'patch', {'snapshot': snapshot})
        self.application.status = 'rejected'
        self.application.save(update_fields=['status'])
        self.assertEqual(self.call(self.admin).data['pending_count'], 0)
        self.reseller(self.buyer)
        self.assertEqual(self.call(self.admin).data['unread_count'], 1)

    def test_royalty_resubmission_with_same_id_is_unread_again(self):
        royalty = RoyaltyApplication.objects.create(user=self.buyer, business_permit_image='private-permit', permit_expires_on=timezone.localdate() + timedelta(days=365))
        data = self.call(self.admin).data
        self.assertEqual(data['categories']['royalty']['unread'], 1)
        self.call(self.admin, 'patch', {'snapshot': data['snapshot']})
        royalty.submitted_at += timedelta(seconds=1)
        royalty.save(update_fields=['submitted_at'])
        self.assertEqual(self.call(self.admin).data['unread_count'], 1)

    def test_no_cross_role_access_or_forged_acknowledgements(self):
        self.assertEqual(self.call(self.buyer).status_code, 403)
        self.assertEqual(self.call(None).status_code, 403)
        self.assertEqual(self.call(self.admin, 'patch', {'snapshot': 'invalid'}).status_code, 400)
        data = self.call(self.admin).data
        self.assertEqual(self.call(self.admin, 'patch', {'snapshot': data['snapshot'], 'request_key': 'forged-key'}).status_code, 400)
        self.assertFalse(AdminRequestRead.objects.exists())
