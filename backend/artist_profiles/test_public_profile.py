from unittest.mock import patch

from django.test import TestCase
from django.utils import timezone
from rest_framework.test import APIRequestFactory
from commissions.models import CommissionRequest
from fulfillment.models import PurchaseReview
from users.models import User
from .statistics import profile_counts
from .views import ArtistFollowView, ArtistProfileView


class PublicArtistProfileTests(TestCase):
    def test_follow_counts_and_verified_review_count(self):
        artist = User.objects.create(firebase_uid='followed', username='followed', email='followed@example.test', role='artist')
        buyer = User.objects.create(firebase_uid='follower', username='follower', email='follower@example.test')
        factory = APIRequestFactory()
        profile = ArtistProfileView.as_view()
        follow = ArtistFollowView.as_view()
        with patch.object(ArtistFollowView, 'get_request_user', return_value=artist):
            self.assertTrue(follow(factory.get('/'), artist_id=artist.pk).data['is_self'])
        with patch.object(ArtistFollowView, 'get_request_user', return_value=buyer):
            state = follow(factory.get('/'), artist_id=artist.pk).data
            self.assertFalse(state['is_following'])
            self.assertFalse(state['is_self'])
            for _ in range(2):
                self.assertEqual(follow(factory.put('/'), artist_id=artist.pk).data['followers_count'], 1)
            self.assertEqual(profile_counts(buyer)['following_count'], 1)
            self.assertEqual(profile(factory.get('/'), artist_id=artist.pk).data['followers_count'], 1)
            self.assertFalse(follow(factory.delete('/'), artist_id=artist.pk).data['is_following'])
        self.assertEqual(profile_counts(buyer)['following_count'], 0)

        commission = CommissionRequest.objects.create(
            buyer=buyer, artist=artist, title='Review sample', time_duration=100,
            deadline=timezone.now(), status='COMPLETE',
        )
        PurchaseReview.objects.create(commission=commission, artist_rating=5, artwork_rating=5)
        self.assertEqual(profile(factory.get('/'), artist_id=artist.pk).data['reviews_count'], 1)
        self.assertEqual(profile_counts(buyer)['reviews_count'], 0)

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
