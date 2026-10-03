from fulfillment.services import physical, shipping_details
from artworks.pricing import base_cost, minimum_price
from decimal import Decimal, InvalidOperation

from django.db import transaction
from django.db.models import Q
from django.utils import timezone
from rest_framework.response import Response

from authentication.views import AuthenticatedAPIView
from authentication.permissions import IsAuthenticatedUser
from artworks.models import Artwork
from users.models import User
from .models import Agreement, AgreementTemplate, Conversation, ConversationParticipant, Message


def contract_data(item, user):
    proposal_message = item.messages.filter(message_type=Message.Type.AGREEMENT).first()
    proposer_id = proposal_message.sender_id if proposal_message else item.buyer_id
    participant = item.conversation.participants.filter(user=user).first()
    unread = bool(proposal_message and proposer_id != user.id and participant and
                  (not participant.last_read_at or proposal_message.created_at > participant.last_read_at))
    return {
        "unread_count": int(unread),
        "fully_signed": bool(item.artist_signed_at and item.buyer_signed_at and item.artist_signature_image and item.buyer_signature_image),
        "is_proposer": user.id == proposer_id,
        "id": item.id, "artwork_id": item.artwork_id,
        "verification_code": item.verification_code,
        "buyer_uid": item.buyer.firebase_uid, "artist_uid": item.artist.firebase_uid,
        "created_at": item.created_at.isoformat(),
        "title": item.artwork.title if item.artwork else "Unavailable artwork",
        "buyer": item.buyer.username, "artist": item.artist.username,
        "delivery_details": item.delivery_details, "delivery_fee": str(item.delivery_fee),
        "price": str(item.price), "terms": item.terms_snapshot,
        "status": item.status,
        "buyer_accepted": bool(item.buyer_accepted_at),
        "artist_accepted": bool(item.artist_accepted_at),
        "my_accepted": bool(item.buyer_accepted_at if user.id == item.buyer_id else item.artist_accepted_at),
    }


class ContractReadView(AuthenticatedAPIView):
    permission_classes = [IsAuthenticatedUser]

    def post(self, request):
        user = self.get_request_user(request)
        ids = request.data.get('ids', [])
        if not isinstance(ids, list) or len(ids) > 500 or any(type(i) is not int for i in ids):
            return Response({'error': 'Provide a list of proposal IDs.'}, status=400)
        agreements = Agreement.objects.filter(pk__in=ids).filter(Q(buyer=user) | Q(artist=user))
        # Mark only the proposal that was rendered, not newer messages in the conversation.
        for agreement in agreements:
            message = agreement.messages.filter(message_type=Message.Type.AGREEMENT).first()
            if message:
                ConversationParticipant.objects.filter(conversation=agreement.conversation, user=user).filter(
                    Q(last_read_at__isnull=True) | Q(last_read_at__lt=message.created_at)
                ).update(last_read_at=message.created_at)
        return Response({'ok': True})


class ContractsView(AuthenticatedAPIView):
    permission_classes = [IsAuthenticatedUser]

    def get(self, request, artwork_id=None):
        user = self.get_request_user(request)
        contracts = Agreement.objects.filter(Q(buyer=user) | Q(artist=user)).select_related("artwork", "buyer", "artist").order_by("-id")
        artwork_data = None
        if artwork_id:
            artwork = Artwork.objects.select_related("artist").filter(id=artwork_id, status=Artwork.Status.APPROVED).first()
            if not artwork:
                return Response({"error": "Artwork is unavailable."}, status=404)
            contracts = contracts.filter(artwork_id=artwork_id)
            artwork_data = {"id": artwork.id, "title": artwork.title, "price": str(base_cost(artwork)), "artist": artwork.artist.username, "artist_uid": artwork.artist.firebase_uid, "buyer_uid": user.firebase_uid, "buyer_name": user.username, "image_url": artwork.image_data, "art_type": "physical" if physical(artwork) else "digital", "is_auction": str(artwork.sale_type).lower() == "auction", "can_propose": str(artwork.sale_type).lower() != "auction" and user.role in (User.Role.BUYER, User.Role.ARTIST) and user.id != artwork.artist_id}
        return Response({"artwork": artwork_data, "contracts": [contract_data(item, user) for item in contracts]})

    @transaction.atomic
    def post(self, request, artwork_id):
        user = self.get_request_user(request)
        # Serialize proposals for an artwork so only one current revision exists per buyer.
        artwork = Artwork.objects.select_for_update().filter(id=artwork_id, status=Artwork.Status.APPROVED).first()
        if not artwork:
            return Response({"error": "Artwork is unavailable."}, status=404)
        if str(artwork.sale_type).lower() == 'auction':
            return Response({'error': 'Auction license terms are fixed. The winning buyer signs the auction agreement after the auction ends.'}, status=409)
        revision_id = request.data.get("revision_of")
        original = None
        buyer = user
        if revision_id:
            original = Agreement.objects.filter(id=revision_id, artwork=artwork).filter(Q(buyer=user) | Q(artist=user)).first()
            if not original or original.status not in (Agreement.Status.PROPOSED, Agreement.Status.CANCELLED):
                return Response({"error": "This proposal is no longer open for revision."}, status=409)
            buyer = original.buyer
        if not original and (user.role not in (User.Role.BUYER, User.Role.ARTIST) or user.id == artwork.artist_id):
            return Response({"error": "Buyers and artists may negotiate purchases, but cannot buy their own artwork."}, status=403)
        previous = Agreement.objects.filter(artwork=artwork, buyer=buyer)
        if previous.filter(status=Agreement.Status.ACCEPTED).exists():
            return Response({"error": "An accepted contract already exists for this artwork."}, status=409)
        try:
            price = Decimal(str(request.data.get("price", "")))
            if not price.is_finite() or price <= 0 or price > Decimal("9999999999.99") or price != price.quantize(Decimal("0.01")):
                raise ValueError()
        except (InvalidOperation, ValueError):
            return Response({"error": "Enter a positive price with at most two decimal places."}, status=400)
        terms = request.data.get("terms", "")
        if not isinstance(terms, str) or not terms.strip() or len(terms) > 10000:
            return Response({"error": "Enter the contract terms (up to 10,000 characters)."}, status=400)
        choices = {
            "license_type": ("personal", "commercial"),
            "exclusivity": ("non_exclusive", "exclusive", "sole"),
            "delivery_type": ("digital", "physical"),
            "compensation_type": ("one_time", "royalty"),
        }
        selected = {key: request.data.get(key, values[0]) for key, values in choices.items()}
        if any(selected[key] not in values for key, values in choices.items()):
            return Response({"error": "Invalid contract option."}, status=400)
        selected["delivery_type"] = "physical" if physical(artwork) else "digital"
        try:
            delivery_details, delivery_fee = shipping_details(artwork, request.data, buyer, user, original)
        except ValueError as error:
            return Response({"error": str(error)}, status=400)
        minimum = minimum_price(artwork, selected["license_type"], selected["exclusivity"])
        if price - delivery_fee < minimum:
            return Response({"error": f"The proposed price cannot be below PHP {minimum} for these terms, plus PHP {delivery_fee} delivery."}, status=400)
        template = AgreementTemplate.objects.filter(is_active=True).first()
        if not template:
            return Response({"error": "No active agreement template is configured."}, status=409)
        previous.filter(status=Agreement.Status.PROPOSED).update(status=Agreement.Status.CANCELLED)
        conversation = Conversation.objects.create(artwork=artwork)
        ConversationParticipant.objects.bulk_create([ConversationParticipant(conversation=conversation, user=buyer), ConversationParticipant(conversation=conversation, user=artwork.artist)])
        snapshot = f"Artwork: {artwork.title}\nBuyer: {buyer.username}\nArtist: {artwork.artist.username}\nAgreed total: PHP {price}\n\n{terms.strip()}"
        if delivery_details:
            snapshot += f"\nDelivery to: {delivery_details['delivery_address']}\nDelivery fee: PHP {delivery_fee}\nPickup: {delivery_details['pickup_address']}"
        item = Agreement.objects.create(conversation=conversation, template=template, artwork=artwork, buyer=buyer, artist=artwork.artist, price=price, terms_snapshot=snapshot, delivery_fee=delivery_fee, delivery_details=delivery_details, **selected)
        if user.id == buyer.id:
            item.buyer_accepted_at = timezone.now()
        else:
            item.artist_accepted_at = timezone.now()
        item.save()
        Message.objects.create(conversation=conversation, sender=user, message_type=Message.Type.AGREEMENT, agreement=item, body="Contract proposed")
        return Response(contract_data(item, user), status=201)


class ContractDecisionView(AuthenticatedAPIView):
    permission_classes = [IsAuthenticatedUser]

    @transaction.atomic
    def patch(self, request, agreement_id):
        user = self.get_request_user(request)
        # Same artwork lock as proposal creation prevents accepting superseded terms.
        candidate = Agreement.objects.filter(id=agreement_id).filter(Q(buyer=user) | Q(artist=user)).first()
        if not candidate:
            return Response({"error": "Contract not found."}, status=404)
        Artwork.objects.select_for_update().filter(id=candidate.artwork_id).first()
        item = Agreement.objects.select_for_update(of=("self",)).select_related("buyer", "artist", "artwork").get(id=agreement_id)
        if item.status != Agreement.Status.PROPOSED:
            return Response({"error": "This proposal is already closed. Refresh the contracts."}, status=409)
        action = request.data.get("action")
        if action in ("reject", "cancel"):
            item.status = Agreement.Status.CANCELLED
        elif action == "accept":
            if contract_data(item, user)["is_proposer"]:
                return Response({"error": "The proposal sender can revise or cancel; the recipient must accept."}, status=409)
            if user.id == item.buyer_id:
                item.buyer_accepted_at = timezone.now()
            else:
                item.artist_accepted_at = timezone.now()
            if item.buyer_accepted_at and item.artist_accepted_at:
                item.status = Agreement.Status.ACCEPTED
                Conversation.objects.filter(id=item.conversation_id).update(status=Conversation.Status.AGREED)
        else:
            return Response({"error": "Choose accept or reject."}, status=400)
        item.save()
        return Response(contract_data(item, user))
