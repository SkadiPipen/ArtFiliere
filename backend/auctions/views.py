from rest_framework.views import APIView
from rest_framework.response import Response
from rest_framework import status, permissions
from django.utils import timezone
from django.db import transaction
from django.db.models import Q
from decimal import Decimal
from .models import AuctionListing, Bid
from authentication.views import AuthenticatedAPIView
from users.models import User


def mark_username(username: str) -> str:
    if not username:
        return "@User"
    if len(username) <= 4:
        return f"@{username[:1]}***{username[-1:]}"
    return f"@{username[:2]}***{username[-2:]}"


def get_artwork_image(artwork):
    if not artwork:
        return None
    if hasattr(artwork, 'image_data') and artwork.image_data:
        return artwork.image_data
    if hasattr(artwork, 'image') and artwork.image:
        try:
            return artwork.image.url
        except Exception:
            try:
                return str(artwork.image)
            except Exception:
                pass
    return getattr(artwork, 'image_url', None) or getattr(artwork, 'primary_image', None)


class AuctionDashboardView(APIView):
    permission_classes = [permissions.AllowAny]

    def get(self, request, *args, **kwargs):
        now = timezone.now()

        from artworks.models import Artwork
        auction_artworks = Artwork.objects.filter(
            Q(sale_type__icontains='AUCTION') | Q(category__icontains='AUCTION')
        ).exclude(auction_listings__isnull=False)

        for art in auction_artworks:
            try:
                start_p = float(art.price or 1000)
                AuctionListing.objects.get_or_create(
                    artwork_id=art.id,
                    defaults={
                        'artist_id': getattr(art, 'artist_id', None),
                        'starting_bid': start_p,
                        'current_bid': start_p,
                        'bid_increment': float(getattr(art, 'bid_increment', 100) or 100),
                        'start_time': art.starting_time or now,
                        'end_time': art.end_time or (now + timezone.timedelta(days=3)),
                        'status': 'ACTIVE',
                        'is_physical': getattr(art, 'art_type', '') == 'physical',
                    }
                )
            except Exception as e:
                print(f"[Auto-Heal AuctionListing Error] {e}")

        active_auctions = AuctionListing.objects.filter(
            status__in=['ACTIVE', 'SCHEDULED', 'PENDING_APPROVAL']
        ).select_related('artwork', 'artist')

        if not active_auctions.exists():
            active_auctions = AuctionListing.objects.exclude(
                status='CANCELLED'
            ).select_related('artwork', 'artist')

        close_to_deadline = active_auctions.order_by('end_time')[:10]

        def serialize_item(a):
            end_iso = a.end_time.isoformat() if a.end_time else (now + timezone.timedelta(days=2)).isoformat()
            artist_name = "Artist"
            if a.artist:
                full_name = f"{getattr(a.artist, 'first_name', '')} {getattr(a.artist, 'last_name', '')}".strip()
                artist_name = full_name or getattr(a.artist, 'username', 'Artist')

            return {
                "id": a.id,
                "artwork_id": a.artwork.id if a.artwork else None,
                "title": a.artwork.title if a.artwork else "Artwork",
                "artist_name": artist_name,
                "current_bid": float(a.current_bid or a.starting_bid or 0),
                "is_physical": bool(a.is_physical or "PHYSICAL" in str(getattr(a.artwork, 'art_type', '')).upper()),
                "image_data": get_artwork_image(a.artwork),
                "image_url": get_artwork_image(a.artwork),
                "end_time": end_iso,
                "status": a.status,
            }

        serialized_all = [serialize_item(a) for a in active_auctions.order_by('-id')]
        close_list = [serialize_item(a) for a in close_to_deadline]
        if not close_list:
            close_list = serialized_all[:5]

        return Response({
            "close_to_deadline": close_list,
            "all_auctions": serialized_all,
        }, status=status.HTTP_200_OK)


class AuctionDetailView(APIView):
    permission_classes = [permissions.AllowAny]

    def get(self, request, pk):
        try:
            auction = AuctionListing.objects.select_related(
                'artwork', 'artist', 'highest_bidder'
            ).filter(Q(pk=pk) | Q(artwork_id=pk)).first()

            if not auction:
                return Response({"error": "Auction not found"}, status=status.HTTP_404_NOT_FOUND)

        except Exception as e:
            return Response({"error": f"Internal Auction Error: {str(e)}"}, status=status.HTTP_500_INTERNAL_SERVER_ERROR)

        bids = list(auction.bids.select_related('bidder').order_by('-amount', '-created_at'))
        seen_bidders = set()
        top_5_bidders = []
        for b in bids:
            if b.bidder and b.bidder.id not in seen_bidders:
                seen_bidders.add(b.bidder.id)
                top_5_bidders.append({
                    "masked_name": mark_username(b.bidder.username),
                    "amount": float(b.amount)
                })
                if len(top_5_bidders) >= 5:
                    break

        past_bid = float(bids[1].amount) if len(bids) > 1 else float(auction.starting_bid)
        current_bid_val = float(auction.current_bid or auction.starting_bid or 0.0)
        increment_val = float(auction.bid_increment or 100.0)

        artwork_img = get_artwork_image(auction.artwork)
        artist_obj = auction.artist
        artist_display = "Artist"
        if artist_obj:
            full_name = f"{getattr(artist_obj, 'first_name', '')} {getattr(artist_obj, 'last_name', '')}".strip()
            artist_display = full_name or getattr(artist_obj, 'username', 'Artist')

        return Response({
            "id": auction.id,
            "artwork_id": auction.artwork.id if auction.artwork else pk,
            "title": getattr(auction.artwork, 'title', 'Artwork'),
            "artist_id": artist_obj.id if artist_obj else 1,
            "artist_name": artist_display,
            "artist_uid": getattr(artist_obj, 'firebase_uid', str(artist_obj.id if artist_obj else 1)),
            "description": getattr(auction.artwork, 'description', 'No description provided.'),
            "materials": getattr(auction.artwork, 'medium', getattr(auction.artwork, 'material', 'Mixed Media')),
            "is_physical": bool(auction.is_physical or "PHYSICAL" in str(getattr(auction.artwork, 'art_type', '')).upper()),
            "image_data": artwork_img,
            "image_url": artwork_img,
            "current_bid": current_bid_val,
            "past_bid": past_bid,
            "next_min_bid": current_bid_val + increment_val,
            "end_time": auction.end_time.isoformat() if auction.end_time else (timezone.now() + timezone.timedelta(days=3)).isoformat(),
            "status": auction.status,
            "highest_bidder_id": auction.highest_bidder.id if auction.highest_bidder else None,
            "highest_bidder_name": auction.highest_bidder.username if auction.highest_bidder else None,
            "highest_bidder_uid": getattr(auction.highest_bidder, 'firebase_uid', None),
            "top_bidders": top_5_bidders,
        }, status=status.HTTP_200_OK)


class PlaceBidView(AuthenticatedAPIView):
    permission_classes = [permissions.AllowAny]

    @transaction.atomic
    def post(self, request, pk):
        user = self.get_request_user(request)
        if not user:
            return Response({"error": "Authentication required. Please log in."}, status=status.HTTP_401_UNAUTHORIZED)
        
        auction = AuctionListing.objects.select_for_update().filter(
            Q(pk=pk) | Q(artwork_id=pk)
        ).first()
            
        if not auction:
            return Response({"error": "Auction does not exist."}, status=status.HTTP_404_NOT_FOUND)

        if auction.artist and auction.artist.id == user.id:
            return Response({"error": "You cannot bid on your own auction listing."}, status=status.HTTP_400_BAD_REQUEST)

        if auction.status != 'ACTIVE' or auction.is_expired():
            return Response({"error": "This auction is no longer active."}, status=status.HTTP_400_BAD_REQUEST)

        raw_amount = request.data.get('amount')
        if not raw_amount:
            return Response({"error": "Please provide a valid bid amount."}, status=status.HTTP_400_BAD_REQUEST)

        try:
            bid_amount = Decimal(str(raw_amount))
        except Exception:
            return Response({"error": "Invalid bid amount value."}, status=status.HTTP_400_BAD_REQUEST)

        min_required = Decimal(str(auction.current_bid)) + Decimal(str(auction.bid_increment or 0))
        if bid_amount < min_required:
            return Response(
                {"error": f"Bid must be at least Php {min_required:,.2f}"},
                status=status.HTTP_400_BAD_REQUEST
            )

        previous_bidder = auction.highest_bidder

        # Save bid
        Bid.objects.create(auction=auction, bidder=user, amount=bid_amount)
        auction.current_bid = bid_amount
        auction.highest_bidder = user
        auction.save()

        # Send outbid notification
        if previous_bidder and previous_bidder.id != user.id:
            try:
                from users.models import UserNotification
                UserNotification.objects.create(
                    recipient=previous_bidder,
                    title="You have been outbid.",
                    message=f"Someone placed a higher bid of Php{bid_amount:,.2f} on '{auction.artwork.title}'.",
                )
            except Exception:
                pass

        return Response({
            "message": "Bid placed successfully",
            "current_bid": float(auction.current_bid),
            "next_min_bid": float(auction.current_bid) + float(auction.bid_increment or 100),
        }, status=status.HTTP_201_CREATED)


class SettleAuctionView(AuthenticatedAPIView):
    permission_classes = [permissions.AllowAny]

    @transaction.atomic
    def post(self, request, pk):
        user = self.get_request_user(request)
        if not user:
            return Response({"error": "Authentication required."}, status=status.HTTP_401_UNAUTHORIZED)
        
        auction = AuctionListing.objects.select_related('artwork', 'artist', 'highest_bidder').filter(
            Q(pk=pk) | Q(artwork_id=pk)
        ).first()

        if not auction:
            return Response({"error": "Auction not found."}, status=status.HTTP_404_NOT_FOUND)

        if not auction.highest_bidder:
            return Response({"error": "No bids placed on this auction."}, status=status.HTTP_400_BAD_REQUEST)

        auction.status = 'SETTLED'
        auction.save()

        winner = auction.highest_bidder
        artist = auction.artist
        artwork = auction.artwork
        final_price = float(auction.current_bid)
        is_physical = bool(
            auction.is_physical or 
            "PHYSICAL" in str(getattr(artwork, 'art_type', '')).upper()
        )

        try:
            from users.models import UserNotification
            UserNotification.objects.create(
                recipient=winner,
                title="You won in Auction!",
                message=f"Congratulations! You won the auction for '{artwork.title}' at Php {final_price:,.2f}. Please review the contract to proceed with payment.",
            )
        except Exception:
            pass

        return Response({
            "message": "Auction successfully settled and linked to negotiation.",
            "conversation_id": artwork.id,
            "title": artwork.title,
            "final_price": final_price,
            "is_physical": is_physical,
            "winner_username": winner.username,
            "artist_username": getattr(artist, 'username', 'Artist'),
        }, status=status.HTTP_200_OK)