from datetime import timedelta
from django.test import TestCase
from django.utils import timezone
from rest_framework.test import APIRequestFactory
from users.models import User
from wallets.models import PaymentSession
from fulfillment.models import PurchaseReview
from auctions.models import AuctionListing
from .models import Artwork
from .featured import FeaturedArtworkView


class FeaturedTests(TestCase):
    def setUp(self):
        self.artist = User.objects.create(firebase_uid='featured-artist', username='featured-artist', email='artist@featured.test', role='artist')
        self.buyer = User.objects.create(firebase_uid='featured-buyer', username='featured-buyer', email='buyer@featured.test')
        self.work = self.artwork('Original work')

    def artwork(self, title, **kwargs):
        return Artwork.objects.create(artist=self.artist, title=title, description='Original art', category='Digital', price=100,
            image_data='data:image/png;base64,test', status='approved', **kwargs)

    def get_slides(self):
        result = FeaturedArtworkView.as_view()(APIRequestFactory().get('/api/users/artworks/featured/'))
        self.assertEqual(result.status_code, 200)
        return result.data['slides']

    def payment(self, work, reference, **kwargs):
        return PaymentSession.objects.create(artwork=work, artist=work.artist, buyer=self.buyer,
            reference_id=reference, gross_amount=100, artist_amount=90, platform_fee=10, status='paid', **kwargs)

    def test_empty_metrics_use_honest_spotlight_labels_and_hide_unapproved(self):
        pending = self.artwork('Pending')
        pending.status = 'pending'; pending.save()
        slides = self.get_slides()
        self.assertEqual([s['badge'] for s in slides], ['DISCOVER', 'ARTIST SPOTLIGHT'])
        self.assertTrue(all(s['artwork']['id'] == self.work.pk for s in slides))

    def test_real_purchases_rank_artwork_and_simulated_purchases_do_not(self):
        popular = self.artwork('Popular')
        self.payment(popular, 'paid')
        self.payment(self.work, 'trial', is_simulated=True)
        slides = self.get_slides()
        self.assertEqual(slides[0]['badge'], 'MOST POPULAR')
        self.assertEqual(slides[0]['artwork']['id'], popular.pk)
        self.assertEqual(slides[1]['artwork']['id'], popular.pk)

    def test_top_artist_uses_verified_artist_reviews(self):
        other = User.objects.create(firebase_uid='other-featured', username='other-featured', email='other@featured.test', role='artist')
        self.work.artist = other; self.work.save()
        payment = self.payment(self.work, 'reviewed')
        PurchaseReview.objects.create(payment=payment, artist_rating=5, artwork_rating=4)
        slide = self.get_slides()[1]
        self.assertEqual(slide['artist_id'], other.pk)
        self.assertEqual(slide['badge'], 'TOP ARTIST')

    def test_latest_live_auction_only_and_expired_auctions_are_hidden(self):
        now = timezone.now()
        def auction(work, **kwargs):
            return AuctionListing.objects.create(artist=self.artist, artwork=work, starting_bid=100, current_bid=120,
                start_time=now-timedelta(hours=1), end_time=kwargs.pop('end_time', now+timedelta(hours=1)), **kwargs)
        auction(self.work)
        newest = self.artwork('Latest auction', sale_type='AUCTION')
        listing = auction(newest)
        auction(self.artwork('Expired', sale_type='AUCTION'), end_time=now-timedelta(minutes=1))
        auction(self.artwork('Unapproved auction', sale_type='AUCTION'), status='PENDING_APPROVAL')
        slides = [s for s in self.get_slides() if s['kind'] == 'auction']
        self.assertEqual(len(slides), 1)
        self.assertEqual(slides[0]['artwork']['id'], newest.pk)
        self.assertEqual(slides[0]['ends_at'], listing.end_time.isoformat())

    def test_sold_physical_artwork_is_not_promoted(self):
        physical = self.artwork('Sold physical', art_type='physical')
        self.payment(physical, 'sold')
        self.assertNotIn(physical.pk, [s['artwork']['id'] for s in self.get_slides()])
