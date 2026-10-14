import base64
from datetime import timedelta
from io import BytesIO
from unittest.mock import patch
from PIL import Image
from django.test import TestCase
from django.utils import timezone
from rest_framework.test import APIRequestFactory
from users.models import User
from artist_applications.models import ArtistApplication, ArtistRegistrationUpdate
from notifications.models import UserNotification
from .settings_views import AccountSettingsView, ArtistRecordUpdateView, ArtistRecordReviewView


class SettingsTests(TestCase):
    def setUp(self):
        self.user = User.objects.create(username='artist', firebase_uid='artist', email='artist@test.com', role='artist', first_name='Artist', last_name='Example')
        self.other = User.objects.create(username='other', firebase_uid='other', email='other@test.com')
        self.mod = User.objects.create(username='creative', firebase_uid='creative', email='creative@test.com', role='creative_moderator')
        self.hr = User.objects.create(username='hr', firebase_uid='hr', email='hr@test.com', role='hr')
        image = BytesIO(); Image.new('RGB', (2, 2), 'blue').save(image, 'PNG')
        self.image = 'data:image/png;base64,' + base64.b64encode(image.getvalue()).decode()
        self.application = ArtistApplication.objects.create(user=self.user, hourly_rate=100, tin_number='123456789', bir_certificate='original', sworn_declaration='declaration', portfolio=[], status='approved')
        self.factory = APIRequestFactory()

    def call(self, view, user, method='get', data=None, **kwargs):
        request = getattr(self.factory, method)('/', data or {}, format='json')
        with patch.object(view, 'get_request_user', return_value=user):
            return view.as_view()(request, **kwargs)

    def test_profile_persists_photo_username_and_personal_information(self):
        response = self.call(AccountSettingsView, self.user, 'patch', {'username': 'new_artist', 'profile_image': self.image, 'first_name': 'New', 'middle_name': 'Middle', 'last_name': 'Name', 'date_of_birth': '2000-03-04', 'contact_number': '09123456789'})
        self.assertEqual(response.status_code, 200)
        self.user.refresh_from_db()
        response = self.call(AccountSettingsView, self.user)
        self.assertEqual(response.data['username'], 'new_artist')
        self.assertEqual(response.data['profile_image'], self.image)
        self.assertEqual(self.user.date_of_birth.isoformat(), '2000-03-04')
        self.assertEqual(response['Cache-Control'], 'private, no-store')
        self.assertEqual(self.other.username, 'other')

    def test_invalid_and_privileged_updates_are_rejected_atomically(self):
        for data in [{'username': 'OTHER'}, {'username': ''}, {'role': 'platform_admin'}, {'firebase_uid': 'other'}, {'email': 'other@test.com'}, {'date_of_birth': '2099-01-01'}, {'date_of_birth': '2000-02-30'}, {'username': 'new', 'profile_image': 'not an image'}]:
            self.assertEqual(self.call(AccountSettingsView, self.user, 'patch', data).status_code, 400)
        self.user.refresh_from_db()
        self.assertEqual(self.user.username, 'artist')
        self.assertEqual(self.user.role, 'artist')
        self.assertEqual(self.call(AccountSettingsView, None).status_code, 403)

    def submit(self, **extra):
        return self.call(ArtistRecordUpdateView, self.user, 'post', {'tin_number': '987654321', 'evidence_image': self.image, 'expires_on': (timezone.localdate() + timedelta(days=30)).isoformat(), **extra})

    def test_bir_update_needs_evidence_and_creative_review_not_hr(self):
        self.assertEqual(self.submit(evidence_image='').status_code, 400)
        response = self.submit()
        self.assertEqual(response.status_code, 201)
        self.application.refresh_from_db()
        self.assertEqual(self.application.bir_certificate, 'original')
        self.assertEqual(self.application.tin_number, '123456789')
        self.assertEqual(self.submit().status_code, 409)
        self.assertTrue(UserNotification.objects.filter(user=self.mod, title='Artist BIR update for review').exists())
        self.assertFalse(UserNotification.objects.filter(user=self.hr).exists())
        pk = response.data['id']
        self.assertEqual(self.call(ArtistRecordReviewView, self.hr).status_code, 403)
        self.assertEqual(self.call(ArtistRecordReviewView, self.other, 'patch', {'action': 'approve'}, update_id=pk).status_code, 403)
        result = self.call(ArtistRecordReviewView, self.mod, 'patch', {'action': 'approve'}, update_id=pk)
        self.assertEqual(result.status_code, 200)
        self.application.refresh_from_db()
        self.assertEqual(self.application.tin_number, '987654321')
        self.assertEqual(self.application.bir_certificate, self.image)
        record = ArtistRegistrationUpdate.objects.get(pk=pk)
        self.assertEqual(record.previous_record['certificate'], 'original')
        self.assertEqual(record.reviewed_by, self.mod)
        self.assertEqual(self.call(ArtistRecordReviewView, self.mod, 'patch', {'action': 'approve'}, update_id=pk).status_code, 409)

    def test_rejection_preserves_registration_and_allows_resubmission(self):
        response = self.submit(expires_on=None)
        self.assertEqual(response.status_code, 201)
        pk = response.data['id']
        self.assertEqual(self.call(ArtistRecordReviewView, self.mod, 'patch', {'action': 'reject'}, update_id=pk).status_code, 400)
        self.assertEqual(self.call(ArtistRecordReviewView, self.mod, 'patch', {'action': 'reject', 'note': 'Please use a clearer photo.'}, update_id=pk).status_code, 200)
        self.application.refresh_from_db()
        self.assertEqual(self.application.bir_certificate, 'original')
        self.assertEqual(self.submit().status_code, 201)
        self.assertEqual(self.call(ArtistRecordUpdateView, self.other, 'post', {}).status_code, 403)

    def test_evidence_is_only_exposed_to_creative_reviewers_and_owner(self):
        pk = self.submit().data['id']
        self.assertEqual(self.call(AccountSettingsView, self.other).data['artist_registration'], None)
        items = self.call(ArtistRecordReviewView, self.mod).data
        self.assertNotIn('evidence_image', items[0])
        detail = self.call(ArtistRecordReviewView, self.mod, update_id=pk)
        self.assertEqual(detail.data['evidence_image'], self.image)
        self.assertEqual(detail['Cache-Control'], 'private, no-store')
