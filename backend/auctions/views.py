from rest_framework.views import APIView
from rest_framework.response import Response
from rest_framework import status, permissions
from django.utils import timezone
from django.db import transaction
from .models import AuctionListing, Bid

def mark_username(username: str) -> str:
    if len(username) <= 4:
        return f"@{username[:1]}***{username[-1:]}"
    return f"@{username[:2]}***{username[-2:]}"

def get_artwork_image(artwork):
    if hasattr(artwork, 'image_data') and artwork.image_data:
        return artwork.image_data
    if hasattr(artwork, 'image') and artwork.image:
        try:
            return artwork.image_url
        except Exception:
            pass
    return None

class AuctionDashboardView(APIView):
    permission_classes = [permissions.AllowAny]

    def get(self, request):
        now = timezone.now()
        active_auctions = AuctionListing.objects.filter(status='ACTIVE', end_time__gt=now).select_related('artwork', 'artist')

        # Deadline (ends within 24 hrs or sorted by remaing time)
        close_to_deadline = active_auctions.order_by('end_time')[:10]

        def serialize_item(a):
            return {
                "id": a.id,
                "artwork_id": a.artwork.id,
                "title": a.artwork.title,
                "artist_name": a.artist.username,
                "current_bid": float(a.current_bid),
                "is_physical": bool(a.is_physical or "PHYSICAL" in str(getattr(a.artwork, 'art_type', '')).upper()),
                "image_data": get_artwork_image(a.artwork),
                "image_url": get_artwork_image(a.artwork),
                "end_time": a.end_time.isoformat(),
            }

        return Response({
            "close_to_deadline": [serialize_item(a) for a in close_to_deadline],
            "all_auctions": [serialize_item(a) for a in active_auctions.order_by('-created_at')],
        }, status=status.HTTP_200_OK)


class AuctionDetailView(APIView):
    permission_classes = [permissions.AllowAny]

    def get(self, request, pk):
        try:
            auction = AuctionListing.objects.select_related('artwork', 'artist', 'highest_bidder').get(pk=pk)
        except AuctionListing.DoesNotExist:
            return Response({"error": "Auction not found"}, status=status.HTTP_404_NOT_FOUND)

        # Sorting top 5 bidders
        bids = list(auction.bids.select_related('bidder').order_by('-amount'))
        seen_bidders = set()
        top_5_bidders = []
        for b in bids:
            if b.bidder.id and b.bidder.id not in seen_bidders:
                seen_bidders.add(b.bidder.id)
                top_5_bidders.append({
                    "masked_name": mark_username(b.bidder.username),
                    "amount": float(b.amount)
                })
                if len(top_5_bidders) >= 5:
                    break

        past_bid = float(bids[1].amount) if len(bids) > 1 else float(auction.starting_bid)
        current_bid_val = float(auction.current_bid or auction.starting_bid)
        increment_val = float(auction.bid_increment)

        return Response({
            "id": auction.id,
            "title": auction.artwork.title,
            "artist_id": auction.artist.id,
            "artist_name": auction.artist.username,
            "description": getattr(auction.artwork, 'description', 'No description provided.'),
            "materials": getattr(auction.artwork, 'medium', 'Canvas, Acrylic'),
            "is_physical": bool(auction.is_physical),
            "image_data": get_artwork_image(auction.artwork),
            "image_url": get_artwork_image(auction.artwork),
            "current_bid": current_bid_val,
            "past_bid": past_bid,
            "next_min_bid": current_bid_val + increment_val,
            "end_time": auction.end_time.isoformat(),
            "top_bidders": top_5_bidders,
        }, status=status.HTTP_200_OK)


class PlaceBidView(APIView):
    permission_classes = [permissions.IsAuthenticated]

    @transaction.atomic
    def post(self, request, pk):
        try:
            auction = AuctionListing.objects.select_for_update().get(pk=pk)
        except AuctionListing.DoesNotExist:
            return Response({"error": "Auction does not exist."}, status=status.HTTP_404_NOT_FOUND)

        if auction.status != 'ACTIVE' or auction.is_expired():
            return Response({"error": "This auction is no longer active."}, status=status.HTTP_400_BAD_REQUEST)

        bid_amount = request.data.get('amount')
        if not bid_amount or float(bid_amount) <= float(auction.current_bid):
            return Response(
                {"error": f"Bid must be higher than current bid (Php{auction.current_bid})"},
                status=status.HTTP_400_BAD_REQUEST
            )

        previous_bidder = auction.highest_bidder
        user = request.user

        # Save bid
        Bid.objects.create(auction=auction, bidder=user, amount=bid_amount)
        auction.current_bid = bid_amount
        auction.highest_bidder = user
        auction.save()

        # Send outbid notif to prev highest bidder
        if previous_bidder and previous_bidder != user:
            try :
                from users.models import UserNotification
                UserNotification.objects.create(
                    user=previous_bidder,
                    title="You have been outbid.",
                    message=f"Someone placed a higher bid of Php{bid_amount} on '{auction.artwork.title}'.",
                )
            except Exception:
                pass

        return Response({"message": "Bid placed successfully", "current_bid": float(auction.current_bid)}, status=status.HTTP_201_CREATED)


class SettleAuctionView(APIView):
    permission_classes = [permissions.IsAuthenticated]

    def post(self, request, pk):
        try:
            auction = AuctionListing.objects.get(pk=pk)
        except AuctionListing.DoesNotExist:
            return Response({"error": "Auction not found."}, status=status.HTTP_404_NOT_FOUND)

        if auction.artist != request.user and not request.user.is_staff:
            return Response({"error": "Only the artist can settle this auction."}, status=status.HTTP_403_FORBIDDEN)

        auction.status = 'SETTLED'
        auction.save()

        if auction.is_physical and auction.highest_bidder:
            try:
                from delivery.views import create_delivery_and_notify_driver_order
                buyer_address = getattr(auction.highest_bidder, 'address', 'Cebu')
                create_delivery_and_notify_driver_order(
                    buyer_id=auction.highest_bidder.id,
                    address=buyer_address,
                    payment_mthod='AUCTION_WIN',
                    artwork_title=auction.artwork.title,
                    price=float(auction.current_bid),
                    is_physical=True
                )
            except Exception as e:
                print("Delivery trigger warning:", e)

        return Response({"message": "Auction successfully settled."}, status=status.HTTP_200_OK)
    