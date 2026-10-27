from django.db.models import Avg, Count, F, Q
from django.db.models.functions import Coalesce
from django.utils import timezone
from rest_framework.permissions import AllowAny
from rest_framework.response import Response
from rest_framework.views import APIView
from auctions.models import AuctionListing
from fulfillment.models import PurchaseReview
from wallets.models import PaymentSession
from .models import Artwork
from .serializers import ArtworkSerializer


class FeaturedArtworkView(APIView):
    permission_classes = [AllowAny]

    def get(self, request):
        sold = (Q(art_type='physical', payment_sessions__status='paid')
                | Q(payment_sessions__status='paid', payment_sessions__agreement__exclusivity__in=['exclusive', 'sole'])
                | Q(auction_listings__status='SETTLED')
                | (Q(provenance_listing__record__registered_at__isnull=False)
                   & ~Q(provenance_listing__record__current_owner_id=F('artist_id'))))
        works = list(Artwork.objects.filter(status='approved', artist__is_banned=False)
                     .filter(Q(artist__suspended_until__isnull=True) | Q(artist__suspended_until__lte=timezone.now()))
                     .exclude(sold).select_related('artist').distinct())
        sales = PaymentSession.objects.filter(status='paid', is_simulated=False)
        art_sales = {r['artwork_id']: r['total'] for r in sales.values('artwork_id').annotate(total=Count('pk'))}
        artist_sales = {r['artist_id']: r['total'] for r in sales.values('artist_id').annotate(total=Count('pk'))}
        reviews = PurchaseReview.objects.filter(payment__status='paid', payment__is_simulated=False)
        art_reviews = {r['payment__artwork_id']: r for r in reviews.values('payment__artwork_id').annotate(average=Avg('artwork_rating'), total=Count('pk'))}
        artist_reviews = {r['artist_pk']: r for r in PurchaseReview.objects.filter(
            Q(payment__status='paid', payment__is_simulated=False) | Q(commission__status='COMPLETE')
        ).annotate(artist_pk=Coalesce('payment__artist_id', 'commission__artist_id')).values('artist_pk').annotate(average=Avg('artist_rating'), total=Count('pk'))}

        def rank(work):
            review = art_reviews.get(work.pk, {})
            return (art_sales.get(work.pk, 0), review.get('average') or 0, review.get('total', 0), work.created_at, work.pk)

        def artist_rank(work):
            review = artist_reviews.get(work.artist_id, {})
            return (review.get('average') or 0, review.get('total', 0), artist_sales.get(work.artist_id, 0), rank(work))

        def slide(work, kind, badge, subtitle):
            return {'id': kind, 'kind': kind, 'badge': badge, 'title': work.title,
                    'subtitle': subtitle, 'artwork': ArtworkSerializer(work).data}

        slides = []
        if works:
            popular = max(works, key=rank)
            ranked = bool(art_sales.get(popular.pk) or art_reviews.get(popular.pk))
            slides.append(slide(popular, 'popular', 'MOST POPULAR' if ranked else 'DISCOVER',
                                'Ranked by paid purchases, then verified artwork reviews.' if ranked else 'Discover original artwork from our community.'))
            artist_work = max(works, key=artist_rank)
            artist_work = max((w for w in works if w.artist_id == artist_work.artist_id), key=rank)
            ranked_artist = bool(artist_sales.get(artist_work.artist_id) or artist_reviews.get(artist_work.artist_id))
            name = f'{artist_work.artist.first_name} {artist_work.artist.last_name}'.strip() or artist_work.artist.username
            item = slide(artist_work, 'artist', 'TOP ARTIST' if ranked_artist else 'ARTIST SPOTLIGHT', name)
            item['artist_id'] = artist_work.artist_id
            item['ranking_basis'] = 'Verified artist rating, review count, then paid purchases; artwork ranked by purchases and reviews.'
            slides.append(item)
        auction = AuctionListing.objects.filter(artwork_id__in=[w.pk for w in works], status='ACTIVE',
                    start_time__lte=timezone.now(), end_time__gt=timezone.now()).select_related('artwork__artist').order_by('-pk').first()
        if auction:
            item = slide(auction.artwork, 'auction', 'LATEST AUCTION', 'Live bidding · ends in')
            item['ends_at'] = auction.end_time.isoformat()
            item['artwork'].update(sale_type='AUCTION', starting_time=auction.start_time.isoformat(),
                                   end_time=auction.end_time.isoformat(), price=str(auction.current_bid), bid_increment=str(auction.bid_increment))
            slides.append(item)
        response = Response({'slides': slides})
        response['Cache-Control'] = 'no-store'
        return response
