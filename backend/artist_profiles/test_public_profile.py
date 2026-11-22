from unittest.mock import patch

from django.test import TestCase
from rest_framework.test import APIRequestFactory
from artist_applications.models import ArtistApplication
from users.models import User
from .statistics import profile_counts
from .views import ArtistFollowView, ArtistProfileView


class PublicArtistProfileTests(TestCase):
    def test_registration_samples_appear_after_approval(self):
        artist = User.objects.create(firebase_uid='sample-artist', username='sample-artist', email='sample@artist.test', role='artist')
        image = 'data:image/png;base64,AA=='
        application = ArtistApplication.objects.create(user=artist, hourly_rate=100, portfolio=[{'title': 'Ink study', 'imageDataUri': image}])
        view = ArtistProfileView.as_view()
        factory = APIRequestFactory()
        self.assertEqual(view(factory.get('/'), artist_id=artist.pk).data['portfolio'], [])

        application.status = ArtistApplication.ApprovalStatus.APPROVED
        application.save(update_fields=['status'])
        sample, = view(factory.get('/'), artist_id=artist.pk).data['portfolio']
        self.assertEqual(sample['title'], 'Ink study')
        self.assertEqual(sample['image_data'], image)
        self.assertEqual(sample['source'], 'registration')
        self.assertFalse(sample['is_for_sale'])

    def test_repeated_follow_and_unfollow_keep_counts_correct(self):
        artist = User.objects.create(firebase_uid='follow-artist', username='follow-artist', email='follow@artist.test', role='artist')
        viewer = User.objects.create(firebase_uid='follow-viewer', username='follow-viewer', email='follow@buyer.test')
        view = ArtistFollowView.as_view()
        factory = APIRequestFactory()
        with patch.object(ArtistFollowView, 'get_request_user', return_value=viewer):
            self.assertFalse(view(factory.get('/'), artist_id=artist.pk).data['is_following'])
            self.assertEqual(view(factory.put('/'), artist_id=artist.pk).data['followers_count'], 1)
            self.assertEqual(view(factory.put('/'), artist_id=artist.pk).data['followers_count'], 1)
            self.assertEqual(profile_counts(viewer)['following_count'], 1)
            self.assertEqual(ArtistProfileView.as_view()(factory.get('/'), artist_id=artist.pk).data['followers_count'], 1)
            self.assertFalse(view(factory.delete('/'), artist_id=artist.pk).data['is_following'])
            self.assertEqual(view(factory.delete('/'), artist_id=artist.pk).data['followers_count'], 0)
            self.assertEqual(profile_counts(viewer)['following_count'], 0)

        with patch.object(ArtistFollowView, 'get_request_user', return_value=artist):
            self.assertEqual(view(factory.put('/'), artist_id=artist.pk).status_code, 403)

    def test_artist_without_application_can_be_viewed_publicly(self):
        artist = User.objects.create(firebase_uid='public-artist', username='public-artist', email='public@artist.test',
                                     first_name='Public', last_name='Artist', role='artist', profile_image='avatar', cover_image='cover')
        response = ArtistProfileView.as_view()(APIRequestFactory().get('/'), artist_id=artist.pk)
        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.data['id'], artist.pk)
        self.assertEqual(response.data['name'], 'Public Artist')
        self.assertEqual(response.data['bio'], '')
        self.assertEqual(response.data['profile_image'], 'avatar')
        self.assertEqual(response.data['cover_image'], 'cover')
        self.assertEqual(response.data['portfolio'], [])

    def test_non_artist_account_is_not_an_artist_profile(self):
        buyer = User.objects.create(firebase_uid='profile-buyer', username='profile-buyer', email='buyer@profile.test')
        response = ArtistProfileView.as_view()(APIRequestFactory().get('/'), artist_id=buyer.pk)
        self.assertEqual(response.status_code, 404)

    def test_artist_profile_resolves_username_and_keeps_id_links(self):
        artist = User.objects.create(firebase_uid='share-artist', username='SeriousKing', email='share@artist.test', role='artist', bio='My artist bio')
        by_name = ArtistProfileView.as_view()(APIRequestFactory().get('/'), username='SeriousKing')
        by_id = ArtistProfileView.as_view()(APIRequestFactory().get('/'), artist_id=artist.pk)
        self.assertEqual(by_name.status_code, 200)
        self.assertEqual(by_name.data, by_id.data)
        self.assertEqual(by_name.data['bio'], 'My artist bio')
        self.assertEqual(ArtistProfileView.as_view()(APIRequestFactory().get('/'), username='missing-artist').status_code, 404)

    def test_username_route_does_not_expose_buyer_as_artist(self):
        buyer = User.objects.create(firebase_uid='share-buyer', username='share-buyer', email='share@buyer.test')
        self.assertEqual(ArtistProfileView.as_view()(APIRequestFactory().get('/'), username=buyer.username).status_code, 404)
