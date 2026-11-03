from django.test import TestCase
from django.utils import timezone
from rest_framework.test import APIRequestFactory
from artworks.models import Artwork
from users.models import User
from .models import AuctionListing
from .views import AuctionDetailView


class AuctionLookupTests(TestCase):
    def test_auction_id_collision_does_not_open_another_artwork(self):
        artist = User.objects.create(username='lookup', email='lookup@example.com', firebase_uid='lookup')
        first = Artwork.objects.create(id=102, artist=artist, title='Ended artwork', price=100)
        second = Artwork.objects.create(id=103, artist=artist, title='Active artwork', price=100)
        AuctionListing.objects.create(id=101, artwork=first, artist=artist, starting_bid=100, current_bid=100,
                                     status='ENDED', end_time=timezone.now()-timezone.timedelta(days=1))
        active = AuctionListing.objects.create(id=102, artwork=second, artist=artist, starting_bid=100, current_bid=100,
                                              status='ACTIVE', end_time=timezone.now()+timezone.timedelta(days=1))
        factory = APIRequestFactory()
        response = AuctionDetailView.as_view()(factory.get('/'), pk=102)
        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.data['id'], active.id)
        self.assertEqual(response.data['title'], 'Active artwork')
        response = AuctionDetailView.as_view()(factory.get('/?lookup=artwork'), pk=103)
        self.assertEqual(response.data['id'], active.id)
        response = AuctionDetailView.as_view()(factory.get('/'), pk=103)
        self.assertEqual(response.status_code, 404)
