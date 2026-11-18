from django.test import TestCase
from django.utils import timezone
from rest_framework.test import APIRequestFactory
from artworks.models import Artwork
from users.models import User
from .models import AuctionListing
from .views import AuctionDetailView
from .views import AuctionDashboardView
from unittest.mock import patch


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


class AuctionDeadlineTests(TestCase):
    def setUp(self):
        self.now = timezone.now()
        self.artist = User.objects.create(username='deadline', email='deadline@example.com', firebase_uid='deadline')

    def auction(self, hours, status='ACTIVE', start_hours=-1):
        artwork = Artwork.objects.create(artist=self.artist, title=f'{hours} hours', price=100, status='approved')
        return AuctionListing.objects.create(artwork=artwork, artist=self.artist, starting_bid=100, current_bid=100,
            status=status, start_time=self.now + timezone.timedelta(hours=start_hours),
            end_time=self.now + timezone.timedelta(hours=hours))

    def dashboard(self):
        with patch('auctions.views.timezone.now', return_value=self.now):
            return AuctionDashboardView.as_view()(APIRequestFactory().get('/')).data

    def test_deadline_window_includes_24_hours_but_excludes_expired_and_not_started(self):
        boundary = self.auction(24)
        sooner = self.auction(.5)
        self.auction(24.001)
        self.auction(0)
        self.auction(-1)
        self.auction(4, start_hours=1)
        self.auction(4, status='SCHEDULED')
        self.auction(4, status='PAYMENT_PENDING')
        self.auction(4, status='ENDED')
        result = self.dashboard()['close_to_deadline']
        self.assertEqual([a['id'] for a in result], [sooner.id, boundary.id])
        self.assertEqual(result[0]['start_time'], sooner.start_time.isoformat())

    def test_at_most_ten_auctions_sorted_by_nearest_deadline(self):
        auctions = [self.auction(hours) for hours in range(12, 0, -1)]
        result = self.dashboard()['close_to_deadline']
        self.assertEqual([a['id'] for a in result], [a.id for a in reversed(auctions)][:10])

    def test_no_qualifying_deadlines_returns_empty_list_without_fallback(self):
        self.auction(48)
        self.auction(1, status='SCHEDULED')
        data = self.dashboard()
        self.assertEqual(data['close_to_deadline'], [])
        self.assertEqual(len(data['all_auctions']), 2)
