from rest_framework.views import APIView
from rest_framework.response import Response
from rest_framework import status, permissions
from django.utils import timezone
from django.db import transaction
from django.db.models import Q
from .models import AuctionListing, Bid


def mark_username(username: str) -> str:
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
                return str(artwork.img)
            except Exception:
                pass
    return getattr(artwork, 'image_url', None) or getattr(artwork, 'primary_image', None)


class AuctionDashboardView(APIView):
    permission_classes = [permissions.AllowAny]

    def get(self, request, *args, **kwargs):
        now = timezone.now()

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
                from artworks.models import Artwork
                art = Artwork.objects.filter(pk=pk).first()
                if not art:
                    return Response({"error": "Auction not found"}, status=status.HTTP_404_NOT_FOUND)

                artist_user = getattr(art, 'artist', None) or getattr(art, 'user', None)
                if not artist_user:
                    from django.contrib.auth import get_user_model
                    User = get_user_model()
                    artist_user = User.objects.filter(is_staff=True).first() or User.objects.first()

                starting_price = getattr(art, 'price', None) or 5280.00

                artist_id_val = getattr(artist_user, 'id', None) or getattr(artist_user, 'pk', 1)

                auction = AuctionListing.objects.create(
                    artwork_id=art.id,
                    artist_id=artist_id_val,
                    starting_bid=starting_price,
                    current_bid=starting_price,
                    bid_increment=100.00,
                    end_time=timezone.now() + timezone.timedelta(days=3),
                    status='ACTIVE',
                )

        except Exception as e:
            import traceback
            traceback.print_exc()
            return Response({"error": f"Internal Auction Error: {str(e)}"}, status=status.HTTP_500_INTERNAL_SERVER_ERROR)

        # Top 5 bidders
        bids = list(auction.bids.select_related('bidder').order_by('-amount'))
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
            "title": getattr(auction.artwork, 'title', 'Seashore'),
            "artist_id": artist_obj.id if artist_obj else 1,
            "artist_name": artist_display,
            "description": getattr(auction.artwork, 'description', 'No description provided.'),
            "materials": getattr(auction.artwork, 'medium', getattr(auction.artwork, 'material', 'Digital Art / Painting')),
            "is_physical": bool(auction.is_physical or "PHYSICAL" in str(getattr(auction.artwork, 'art_type', '')).upper()),
            "image_data": artwork_img,
            "image_url": artwork_img,
            "current_bid": current_bid_val,
            "past_bid": past_bid,
            "next_min_bid": current_bid_val + increment_val,
            "end_time": auction.end_time.isoformat() if auction.end_time else (timezone.now() + timezone.timedelta(days=3)).isoformat(),
            "top_bidders": top_5_bidders,
        }, status=status.HTTP_200_OK)


class PlaceBidView(APIView):
    permission_classes = [permissions.IsAuthenticated]

    @transaction.atomic
    def post(self, request, pk):
        try:
            auction = AuctionListing.objects.select_for_update().filter(
                Q(pk=pk) | Q(artwork_id=pk)
            ).first()
            if not auction:
                return Response({"error": "Auction does not exist."}, status=status.HTTP_404_NOT_FOUND)
        except Exception as e:
            return Response({"error": str(e)}, status=status.HTTP_500_INTERNAL_SERVER_ERROR)

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

        # Send outbid notif to previous highest bidder
        if previous_bidder and previous_bidder != user:
            try:
                from users.models import UserNotification
                UserNotification.objects.create(
                    user=previous_bidder,
                    title="You have been outbid.",
                    message=f"Someone placed a higher bid of Php{bid_amount} on '{auction.artwork.title}'.",
                )
            except Exception:
                pass

        return Response({
            "message": "Bid placed successfully",
            "current_bid": float(auction.current_bid)
        }, status=status.HTTP_201_CREATED)


class SettleAuctionView(APIView):
    permission_classes = [permissions.AllowAny]

    @transaction.atomic
    def post(self, request, pk):
        auction = AuctionListing.objects.select_related('artwork', 'artist', 'highest_bidder').filter(
            Q(pk=pk) | Q(artwork_id=pk)
        ).first()

        if not auction:
            return Response({"error": "Auction not found."}, status=status.HTTP_404_NOT_FOUND)

        if not auction.highest_bidder:
            return Response({"error": "No bids placed on this auction."}, status=status.HTTP_400_BAD_REQUEST)

        # Mark Auction Settled
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

        # Integrate with Teammate's backend/messaging models
        conversation_id = None
        contract_id = None

        try:
            # Import messaging models
            from messaging import models as msg_models
            
            # Find Conversation / Thread model
            ConvModel = getattr(msg_models, 'Conversation', None) or getattr(msg_models, 'ChatRoom', None)
            MsgModel = getattr(msg_models, 'Message', None)
            
            # Find Contract / Agreement model
            ContractModel = getattr(msg_models, 'Contract', None) or getattr(msg_models, 'Agreement', None)
            if not ContractModel:
                try:
                    from messaging import contracts as msg_contracts
                    ContractModel = getattr(msg_contracts, 'Contract', None) or getattr(msg_contracts, 'Agreement', None)
                except Exception:
                    pass

            # Create or get Conversation
            if ConvModel:
                conv = ConvModel.objects.filter(
                    (Q(artist=artist) & Q(client=winner)) | (Q(artist=winner) & Q(client=artist)),
                    artwork=artwork
                ).first() if hasattr(ConvModel, 'artwork') else ConvModel.objects.filter(
                    (Q(artist=artist) & Q(client=winner)) | (Q(artist=winner) & Q(client=artist))
                ).first()

                if not conv:
                    create_kwargs = {'artist': artist, 'client': winner}
                    if hasattr(ConvModel, 'artwork'):
                        create_kwargs['artwork'] = artwork
                    conv = ConvModel.objects.create(**create_kwargs)

                conversation_id = conv.id

                # Post automated winning announcement into the chat
                if MsgModel:
                    fulfillment_note = "Physical delivery via Move It Courier" if is_physical else "Digital download (No courier dispatch)"
                    MsgModel.objects.create(
                        conversation=conv if hasattr(MsgModel, 'conversation') else None,
                        room=conv if hasattr(MsgModel, 'room') else None,
                        sender=artist,
                        text=(
                            f"Auction Finished!\n"
                            f"Winner: @{winner.username}\n"
                            f"Winning Bid: ₱{final_price:,.2f}\n"
                            f"Fulfillment: {fulfillment_note}\n"
                            f"Contract generated. Please review terms and finalize payment."
                        )
                    )

            # Create or update Contract
            if ContractModel:
                contract_defaults = {
                    'agreed_price': final_price,
                    'status': 'PENDING_PAYMENT',
                    'is_physical': is_physical,
                }
                if hasattr(ContractModel, 'delivery_type'):
                    contract_defaults['delivery_type'] = 'physical' if is_physical else 'digital'

                contract, _ = ContractModel.objects.get_or_create(
                    artwork=artwork,
                    artist=artist,
                    client=winner if hasattr(ContractModel, 'client') else None,
                    buyer=winner if hasattr(ContractModel, 'buyer') else None,
                    defaults=contract_defaults
                )
                contract.agreed_price = final_price
                contract.save()
                contract_id = contract.id

        except Exception as e:
            print("[SettleAuctionView] Messaging hook warning:", e)

        return Response({
            "message": "Auction successfully settled and linked to negotiation.",
            "conversation_id": conversation_id,
            "contract_id": contract_id,
            "artwork_id": artwork.id,
            "is_physical": is_physical,
            "final_price": final_price,
        }, status=status.HTTP_200_OK)