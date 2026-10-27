from unittest.mock import patch
from django.test import TestCase
from rest_framework.test import APIRequestFactory
from users.models import User
from artist_applications.models import ArtistApplication
from artist_profiles.views import ArtistProfileView
from .views import me

class ProfileBioTests(TestCase):
    def setUp(self):
        self.user = User.objects.create(firebase_uid='bio-artist', username='bio-artist', email='bio@test.com', role='artist')
        self.application = ArtistApplication.objects.create(user=self.user, hourly_rate=100, bio='Original bio', bir_certificate='', sworn_declaration='')

    def call(self, method, data=None):
        request = getattr(APIRequestFactory(), method)('/auth/me/', data, format='json', HTTP_AUTHORIZATION='Bearer test')
        with patch('authentication.views.verify_token', return_value={'uid': self.user.firebase_uid}):
            return me(request)

    def test_bio_is_shared_by_own_and_public_profiles_and_can_be_cleared(self):
        self.assertEqual(self.call('get').data['bio'], 'Original bio')
        response = self.call('patch', {'bio': ' Updated artist bio '})
        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.data['bio'], 'Updated artist bio')
        public = ArtistProfileView.as_view()(APIRequestFactory().get('/'), artist_id=self.user.pk)
        self.assertEqual(public.data['bio'], 'Updated artist bio')
        self.assertEqual(self.call('patch', {'bio': ''}).data['bio'], '')

    def test_invalid_bio_cannot_partially_change_profile(self):
        for bio in (None, [], 'x' * 2001):
            response = self.call('patch', {'bio': bio, 'first_name': 'Changed'})
            self.assertEqual(response.status_code, 400)
            self.user.refresh_from_db()
            self.assertEqual(self.user.first_name, '')

    def test_buyer_cannot_edit_artist_bio(self):
        self.user.role = 'buyer'; self.user.save()
        self.assertEqual(self.call('patch', {'bio': 'Changed'}).status_code, 403)

    def test_artist_without_application_can_save_bio(self):
        self.application.delete()
        response = self.call('patch', {'bio': 'My independent artist bio'})
        self.assertEqual(response.status_code, 200)
        self.user.refresh_from_db()
        self.assertEqual(self.user.bio, 'My independent artist bio')
        self.assertEqual(self.call('get').data['bio'], self.user.bio)
        public = ArtistProfileView.as_view()(APIRequestFactory().get('/'), artist_id=self.user.pk)
        self.assertEqual(public.data['bio'], self.user.bio)
        self.assertEqual(self.call('patch', {'bio': ''}).data['bio'], '')
