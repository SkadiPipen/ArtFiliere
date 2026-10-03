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


def auction_terms(auction, buyer_name="the winning buyer", amount="the winning bid"):
    terms = auction.terms_snapshot or (
        f"Auction license: {auction.license_type}. Exclusivity: {auction.exclusivity}. "
        f"Delivery: {auction.delivery_type}. The winning bid is the final core price."
    )
    return (
        terms.replace("{{buyer_name}}", buyer_name)
        .replace("{{artist_name}}", auction.artist.username if auction.artist else "the artist")
        .replace("{{artwork_title}}", auction.artwork.title if auction.artwork else "this artwork")
        .replace("{{amount}}", str(amount))
    )


def create_auction_agreement(auction, buyer, amount):
    from messaging.models import Agreement, AgreementTemplate, Conversation, ConversationParticipant, Message
    template = auction.agreement_template or AgreementTemplate.objects.filter(is_active=True).first()
    if not template:
        template = AgreementTemplate.objects.create(name="Standard Auction Agreement", body="{{artist_name}} licenses {{artwork_title}} to {{buyer_name}} for {{amount}}.")
    conversation = Conversation.objects.create(artwork=auction.artwork, status=Conversation.Status.AGREED)
    ConversationParticipant.objects.bulk_create([
        ConversationParticipant(conversation=conversation, user=buyer),
        ConversationParticipant(conversation=conversation, user=auction.artist),
    ])
    agreement = Agreement.objects.create(
        conversation=conversation, template=template, artwork=auction.artwork,
        buyer=buyer, artist=auction.artist, price=amount,
        terms_snapshot=auction_terms(auction, buyer.username, amount), license_type=auction.license_type,
        exclusivity=auction.exclusivity, delivery_type=auction.artwork.art_type,
        compensation_type="one_time", status=Agreement.Status.ACCEPTED,
        buyer_accepted_at=timezone.now(), artist_accepted_at=timezone.now(),
    )
    Message.objects.create(conversation=conversation, sender=None, message_type=Message.Type.SYSTEM,
        body="Auction terms were accepted at bid time. Only delivery details may be discussed.", agreement=agreement)
    return agreement


def offer_runner_up(auction):
    bidders = auction.bids.select_related('bidder').order_by('-amount', 'created_at')
    seen = {auction.highest_bidder_id}
    candidate = next((bid for bid in bidders if bid.bidder_id not in seen), None)
    if not candidate:
        auction.status = 'FORFEITED'
        auction.save(update_fields=['status'])
        return None
    auction.backup_bidder = candidate.bidder
    auction.backup_offer_expires_at = timezone.now() + timezone.timedelta(hours=24)
    auction.status = 'BACKUP_OFFER'
    auction.save(update_fields=['backup_bidder', 'backup_offer_expires_at', 'status'])
    from notifications.models import UserNotification
    UserNotification.objects.create(user=candidate.bidder, title="Auction purchase offer", message=f"The first winner did not pay. You may opt in to buy '{auction.artwork.title}' for your bid of ₱{candidate.amount:,.2f} within 24 hours.")
    return candidate


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

            # Lightweight expiry processing for local development. A production
            # deployment should run the same action from a scheduled job.
            if auction.status == 'PAYMENT_PENDING' and auction.payment_deadline and auction.payment_deadline <= timezone.now():
                auction.winner_forfeited_at = timezone.now()
                offer_runner_up(auction)

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
            "bid_increment": increment_val,
            "past_bid": past_bid,
            "next_min_bid": current_bid_val + increment_val,
            "end_time": auction.end_time.isoformat() if auction.end_time else (timezone.now() + timezone.timedelta(days=3)).isoformat(),
            "status": auction.status,
            "highest_bidder_id": auction.highest_bidder.id if auction.highest_bidder else None,
            "highest_bidder_name": auction.highest_bidder.username if auction.highest_bidder else None,
            "highest_bidder_uid": getattr(auction.highest_bidder, 'firebase_uid', None),
            "top_bidders": top_5_bidders,
            "auction_terms": auction_terms(auction),
            "license_type": auction.license_type,
            "exclusivity": auction.exclusivity,
            "delivery_type": auction.delivery_type,
            "payment_deadline": auction.payment_deadline.isoformat() if auction.payment_deadline else None,
            "backup_offer_expires_at": auction.backup_offer_expires_at.isoformat() if auction.backup_offer_expires_at else None,
            "backup_bidder_id": auction.backup_bidder_id,
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

        if request.data.get('terms_accepted') is not True:
            return Response({"error": "Read and accept the published auction agreement before placing a bid."}, status=status.HTTP_400_BAD_REQUEST)

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
        Bid.objects.create(auction=auction, bidder=user, amount=bid_amount, terms_accepted_at=timezone.now())
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

        if not auction.is_expired():
            return Response({"error": "The auction must end before a winner is selected."}, status=status.HTTP_400_BAD_REQUEST)
        if auction.status in {'PAYMENT_PENDING', 'SETTLED'}:
            return Response({"error": "This auction already has a winner."}, status=status.HTTP_400_BAD_REQUEST)

        winner = auction.highest_bidder
        artist = auction.artist
        artwork = auction.artwork
        final_price = float(auction.current_bid)
        is_physical = bool(
            auction.is_physical or 
            "PHYSICAL" in str(getattr(artwork, 'art_type', '')).upper()
        )

        agreement = create_auction_agreement(auction, winner, auction.current_bid)
        auction.winning_bid = auction.current_bid
        auction.payment_deadline = timezone.now() + timezone.timedelta(hours=48)
        auction.status = 'PAYMENT_PENDING'
        auction.save(update_fields=['winning_bid', 'payment_deadline', 'status'])
        from notifications.models import UserNotification
        UserNotification.objects.create(
            user=winner,
            title="You won the auction",
            message=f"You won '{artwork.title}' for ₱{final_price:,.2f}. The fixed agreement is ready; complete payment within 48 hours.",
        )

        return Response({
            "message": "Auction winner selected. Core terms are fixed; proceed to payment.",
            "conversation_id": agreement.conversation_id,
            "agreement_id": agreement.id,
            "payment_deadline": auction.payment_deadline.isoformat(),
            "title": artwork.title,
            "final_price": final_price,
            "is_physical": is_physical,
            "winner_username": winner.username,
            "artist_username": getattr(artist, 'username', 'Artist'),
        }, status=status.HTTP_200_OK)


class ForfeitWinnerView(AuthenticatedAPIView):
    """Expires an unpaid winner and offers the runner-up an opt-in purchase."""
    permission_classes = [permissions.AllowAny]

    @transaction.atomic
    def post(self, request, pk):
        auction = AuctionListing.objects.select_for_update().select_related('artwork', 'highest_bidder').filter(Q(pk=pk) | Q(artwork_id=pk)).first()
        if not auction:
            return Response({"error": "Auction not found."}, status=404)
        if auction.status != 'PAYMENT_PENDING' or not auction.payment_deadline or auction.payment_deadline > timezone.now():
            return Response({"error": "The winner payment window has not expired."}, status=400)
        auction.winner_forfeited_at = timezone.now()
        offer = offer_runner_up(auction)
        return Response({"status": auction.status, "backup_offer": bool(offer), "offer_expires_at": auction.backup_offer_expires_at})


class AcceptRunnerUpOfferView(AuthenticatedAPIView):
    permission_classes = [permissions.AllowAny]

    @transaction.atomic
    def post(self, request, pk):
        user = self.get_request_user(request)
        auction = AuctionListing.objects.select_for_update().select_related('artwork', 'artist', 'backup_bidder').filter(Q(pk=pk) | Q(artwork_id=pk)).first()
        if not user or not auction:
            return Response({"error": "Offer not found."}, status=404)
        if auction.status != 'BACKUP_OFFER' or auction.backup_bidder_id != user.id or not auction.backup_offer_expires_at or auction.backup_offer_expires_at <= timezone.now():
            return Response({"error": "This purchase offer is no longer available."}, status=400)
        bid = auction.bids.filter(bidder=user).order_by('-amount', 'created_at').first()
        if not bid:
            return Response({"error": "Your auction bid could not be found."}, status=400)
        agreement = create_auction_agreement(auction, user, bid.amount)
        auction.highest_bidder = user
        auction.winning_bid = bid.amount
        auction.current_bid = bid.amount
        auction.payment_deadline = timezone.now() + timezone.timedelta(hours=48)
        auction.status = 'PAYMENT_PENDING'
        auction.save(update_fields=['highest_bidder', 'winning_bid', 'current_bid', 'payment_deadline', 'status'])
        return Response({"agreement_id": agreement.id, "payment_deadline": auction.payment_deadline.isoformat(), "amount": str(bid.amount)})
