import base64
from types import SimpleNamespace
from io import BytesIO
from unittest.mock import patch
from PIL import Image
from django.test import TestCase
from rest_framework.test import APIRequestFactory
from users.models import User, ModeratorApplication, ModeratorApplicationReview
from users.moderators import ModeratorApplicationsView, ModeratorApplicationDetail, ModeratorDocumentView
from notifications.admin_requests import pending_requests
from notifications.models import UserNotification


class ModeratorEvaluationTests(TestCase):
    def setUp(self):
        self.factory = APIRequestFactory()
        self.hr = self.user('hr', 'hr')
        self.other_hr = self.user('otherhr', 'hr')
        self.admin = self.user('admin', 'platform_admin')
        self.buyer = self.user('applicant', 'buyer')
        self.artist = self.user('artist', 'artist')
        image = BytesIO()
        Image.new('RGB', (8, 8), 'white').save(image, 'PNG')
        self.bytes = image.getvalue()
        self.payload = dict(email=self.buyer.email, requested_role='customer_support', education='College graduate',
                            motivation='Customer service experience', documents=[dict(name='application.png', data_uri='data:image/png;base64,' + base64.b64encode(self.bytes).decode())])

    def user(self, name, role):
        return User.objects.create(username=name, email=name + '@example.com', firebase_uid=name, role=role)

    def call(self, view, user, method='get', data=None, **kwargs):
        request = getattr(self.factory, method)('/', data or {}, format='json')
        with patch('authentication.views.AuthenticatedAPIView.get_request_user', return_value=user):
            return view.as_view()(request, **kwargs)

    def submit(self, **overrides):
        response = self.call(ModeratorApplicationsView, self.hr, 'post', {**self.payload, **overrides})
        self.assertEqual(response.status_code, 201, response.data)
        return ModeratorApplication.objects.get(pk=response.data['id'])

    def decide(self, item, actor, action, note='Evaluation reason', version=None):
        item.refresh_from_db()
        return self.call(ModeratorApplicationDetail, actor, 'patch', dict(action=action, note=note, version=version if version is not None else item.version), application_id=item.pk)

    def test_hr_evaluation_then_admin_approval_grants_role_once(self):
        item = self.submit()
        self.assertEqual(self.decide(item, self.admin, 'approve').status_code, 409)
        self.assertEqual(self.decide(item, self.hr, 'approve').status_code, 409)
        self.assertEqual(self.decide(item, self.hr, 'claim').status_code, 200)
        self.assertEqual(self.decide(item, self.hr, 'forward').status_code, 200)
        self.buyer.refresh_from_db()
        self.assertEqual(self.buyer.role, 'buyer')
        self.assertTrue(any(row['category'] == 'moderator' for row in pending_requests()))
        self.assertTrue(UserNotification.objects.filter(user=self.admin).exists())
        item.refresh_from_db()
        version = item.version
        self.assertEqual(self.decide(item, self.admin, 'approve').status_code, 200)
        self.assertEqual(self.decide(item, self.admin, 'approve', version=version).status_code, 409)
        self.buyer.refresh_from_db()
        self.assertEqual(self.buyer.role, 'customer_support')
        self.assertEqual(ModeratorApplicationReview.objects.filter(application=item).count(), 4)
        self.assertFalse(any(row['category'] == 'moderator' for row in pending_requests()))

    def test_assignment_stale_changes_and_rejection_reason(self):
        item = self.submit()
        self.assertEqual(self.decide(item, self.hr, 'forward').status_code, 409)
        self.assertEqual(self.decide(item, self.hr, 'claim').status_code, 200)
        self.assertEqual(self.decide(item, self.other_hr, 'claim').status_code, 409)
        self.assertEqual(self.decide(item, self.other_hr, 'reject').status_code, 409)
        self.assertEqual(self.decide(item, self.hr, 'reject', note='').status_code, 400)
        self.assertEqual(self.decide(item, self.hr, 'forward', version=1).status_code, 409)
        self.assertEqual(self.decide(item, self.hr, 'reject').status_code, 200)
        self.buyer.refresh_from_db()
        self.assertEqual(self.buyer.role, 'buyer')
        new = self.submit()
        self.assertNotEqual(new.pk, item.pk)

    def test_private_documents_and_directory_permissions(self):
        item = self.submit()
        for user in [None, self.buyer, self.artist]:
            for view, kwargs in [(ModeratorApplicationsView, {}), (ModeratorApplicationDetail, {'application_id': item.pk}), (ModeratorDocumentView, {'application_id': item.pk, 'index': 0})]:
                self.assertIn(self.call(view, user, **kwargs).status_code, [401, 403])
        response = self.call(ModeratorDocumentView, self.hr, application_id=item.pk, index=0)
        self.assertEqual(response.content, self.bytes)
        self.assertEqual(response['Cache-Control'], 'private, no-store')
        self.assertEqual(self.call(ModeratorDocumentView, self.hr, application_id=item.pk, index=5).status_code, 404)
        listing = self.call(ModeratorApplicationsView, self.hr)
        self.assertNotIn('data_uri', str(listing.data))
        self.assertIn('application.png', str(listing.data))

    def test_duplicate_and_invalid_upload_role_or_applicant(self):
        for override in [dict(requested_role='platform_admin'), dict(education=''), dict(documents=[]), dict(documents=[dict(name='bad.png', data_uri='data:image/png;base64,YmFk')]), dict(email=self.admin.email)]:
            response = self.call(ModeratorApplicationsView, self.hr, 'post', {**self.payload, **override})
            self.assertEqual(response.status_code, 400, response.data)
        self.submit()
        self.assertEqual(self.call(ModeratorApplicationsView, self.hr, 'post', self.payload).status_code, 409)
        self.assertEqual(self.call(ModeratorApplicationsView, self.admin, 'post', self.payload).status_code, 403)

    def test_admin_rejection_and_restricted_applicant_do_not_grant_access(self):
        item = self.submit()
        self.decide(item, self.hr, 'claim')
        self.decide(item, self.hr, 'forward')
        self.buyer.is_banned = True
        self.buyer.save()
        self.assertEqual(self.decide(item, self.admin, 'approve').status_code, 409)
        self.assertEqual(self.decide(item, self.admin, 'reject', note='').status_code, 400)
        self.assertEqual(self.decide(item, self.admin, 'reject').status_code, 200)
        self.buyer.refresh_from_db()
        self.assertEqual(self.buyer.role, 'buyer')
        self.hr.is_banned = True
        self.hr.save()
        self.assertEqual(self.call(ModeratorApplicationsView, self.hr).status_code, 403)

    def test_creative_role_and_existing_moderators_directory(self):
        item = self.submit(email=self.artist.email, requested_role='creative_moderator')
        self.decide(item, self.hr, 'claim')
        self.decide(item, self.hr, 'forward')
        self.assertEqual(self.decide(item, self.admin, 'approve').status_code, 200)
        listing = self.call(ModeratorApplicationsView, self.hr).data
        self.assertTrue(any(row['id'] == self.artist.pk and row['role'] == 'creative_moderator' for row in listing['moderators']))

    def external(self):
        return self.submit(email='external@example.com', name='New Applicant', phone='09123456789',
                           address='Cebu City, Cebu', date_of_birth='2000-01-01')

    def test_external_applicant_requires_no_account_until_final_approval(self):
        item = self.external()
        self.assertIsNone(item.user_id)
        self.assertFalse(User.objects.filter(email=item.email).exists())
        self.assertEqual(self.decide(item, self.hr, 'claim').status_code, 200)
        self.assertEqual(self.decide(item, self.hr, 'forward').status_code, 200)
        with patch('firebase_admin.auth.get_user_by_email', return_value=SimpleNamespace(uid='external-uid', disabled=False)):
            self.assertEqual(self.decide(item, self.admin, 'approve').status_code, 200)
        item.refresh_from_db()
        self.assertEqual(item.user.role, 'customer_support')
        self.assertEqual(item.user.email, 'external@example.com')
        self.assertEqual(item.user.firebase_uid, 'external-uid')
        self.assertEqual(self.decide(item, self.admin, 'approve').status_code, 409)

    def test_external_validation_duplicate_and_rejection(self):
        for changes in [dict(email='not-an-email'), dict(email='new@example.com'), dict(email='new@example.com', name='Name', phone='123', address='Cebu', date_of_birth='wrong')]:
            response = self.call(ModeratorApplicationsView, self.hr, 'post', {**self.payload, **changes})
            self.assertEqual(response.status_code, 400)
        item = self.external()
        response = self.call(ModeratorApplicationsView, self.hr, 'post', {**self.payload, 'email': 'EXTERNAL@example.com'})
        self.assertEqual(response.status_code, 409)
        self.decide(item, self.hr, 'claim')
        self.assertEqual(self.decide(item, self.hr, 'reject').status_code, 200)
        self.assertFalse(User.objects.filter(email=item.email).exists())

    def test_firebase_failure_keeps_external_application_pending_admin_decision(self):
        item = self.external()
        self.decide(item, self.hr, 'claim')
        self.decide(item, self.hr, 'forward')
        with patch('firebase_admin.auth.get_user_by_email', side_effect=RuntimeError('Unavailable')):
            self.assertEqual(self.decide(item, self.admin, 'approve').status_code, 503)
        item.refresh_from_db()
        self.assertEqual(item.status, 'sent_to_admin')
        self.assertIsNone(item.user_id)
