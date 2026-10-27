from fulfillment.services import physical, shipping_details
from artworks.pricing import base_cost, minimum_price
from decimal import Decimal, InvalidOperation
import uuid

from django.db import transaction
from django.db.models import Q
from django.utils import timezone
from rest_framework.response import Response

from authentication.views import AuthenticatedAPIView
from authentication.permissions import IsAuthenticatedUser
from artworks.models import Artwork
from users.models import User
from .compensation import validate_compensation, compensation_summary, validate_schedule_total
from .models import Agreement, AgreementTemplate, Conversation, ConversationParticipant, Message
from .notifications import notify_negotiation
from .license_scope import validate_scope, scope_text
from .pricing import validate_pricing, pricing_summary
from .copyright_transfer import transfer_text
from .checkout_status import checkout_status


def artwork_thumbnail(artwork):
    """Small chat preview; do not duplicate original artwork files in every card."""
    if not artwork or not artwork.image_data or not artwork.image_data.startswith('data:image/'):
        return None
    import base64
    from io import BytesIO
    from PIL import Image, ImageOps
    try:
        raw = base64.b64decode(artwork.image_data.split(',', 1)[1], validate=True)
        with Image.open(BytesIO(raw)) as image:
            if image.width * image.height > 25000000:
                return None
            preview = ImageOps.exif_transpose(image)
            preview.thumbnail((180, 180))
            output = BytesIO()
            preview.convert('RGB').save(output, format='JPEG', quality=70)
        return 'data:image/jpeg;base64,' + base64.b64encode(output.getvalue()).decode('ascii')
    except (ValueError, IndexError, OSError, Image.DecompressionBombError):
        return None


def proposal_changes(item):
    previous = item.revision_of
    if not previous:
        return []
    fields = {'price': 'Checkout total', 'license_type': 'License', 'exclusivity': 'Exclusivity',
              'delivery_type': 'Delivery type', 'delivery_fee': 'Delivery fee',
              'pricing_terms': 'Agreed pricing', 'license_scope': 'License permissions', 'compensation_type': 'Compensation', 'compensation_terms': 'Compensation details',
              'delivery_details': 'Delivery details', 'terms_snapshot': 'Terms'}
    def display(source, key):
        value = getattr(source, key)
        if key == 'license_scope':
            return scope_text(value) + ('\n' + transfer_text(value['copyright_transfer']) if value.get('copyright_transfer') else '') if value else 'No structured license permissions'
        if key == 'compensation_terms':
            return compensation_summary(source.compensation_type, value) if value else 'No additional compensation settings'
        if isinstance(value, dict):
            return '\n'.join(f"{name.replace('_', ' ').title()}: {entry}" for name, entry in value.items()
                             if not name.endswith('_id') and not isinstance(entry, (dict, list))) or 'Not specified'
        return str(value)
    return [{'field': key, 'label': label, 'before': display(previous, key), 'after': display(item, key)}
            for key, label in fields.items() if getattr(previous, key) != getattr(item, key)]


def contract_data(item, user):
    commission = getattr(item, 'commission_contract', None)
    proposal_message = item.messages.filter(message_type=Message.Type.AGREEMENT).first()
    proposer_id = proposal_message.sender_id if proposal_message else item.buyer_id
    participant = item.conversation.participants.filter(user=user).first()
    unread = bool(proposal_message and proposer_id != user.id and participant and
                  (not participant.last_read_at or proposal_message.created_at > participant.last_read_at))
    return {
        'negotiation_key': item.negotiation_key,
        'proposed_by': {'uid': proposal_message.sender.firebase_uid, 'name': proposal_message.sender.username,
                        'role': 'buyer' if proposer_id == item.buyer_id else 'artist'} if proposal_message and proposal_message.sender else None,
        'attempt_action': {'Proposal edited': 'edited', 'Sent back to renegotiate': 'renegotiated'}.get(proposal_message.body, 'proposed') if proposal_message else 'proposed',
        'closure_reason': item.closure_reason,
        'cancelled_by': {'uid': item.cancelled_by.firebase_uid, 'name': item.cancelled_by.username} if item.cancelled_by_id else None,
        'cancelled_at': item.cancelled_at.isoformat() if item.cancelled_at else None,
        "revision_of": item.revision_of_id,
        "changes": proposal_changes(item),
        "unread_count": int(unread),
        "fully_signed": bool(item.artist_signed_at and item.buyer_signed_at and item.artist_signature_image and item.buyer_signature_image),
        "checkout_status": checkout_status(item),
        'is_auction': bool(item.artwork and str(item.artwork.sale_type).lower() == 'auction'),
        "is_proposer": user.id == proposer_id,
        "id": item.id, "artwork_id": item.artwork_id,
        "verification_code": item.verification_code,
        "buyer_uid": item.buyer.firebase_uid, "artist_uid": item.artist.firebase_uid,
        "created_at": item.created_at.isoformat(),
        "title": item.artwork.title if item.artwork else commission.title if commission else "Unavailable artwork",
        'commission_id': commission.pk if commission else None,
        "buyer": item.buyer.username, "artist": item.artist.username,
        "delivery_details": item.delivery_details, "delivery_fee": str(item.delivery_fee),
        "price": str(item.price), "terms": item.terms_snapshot,
        'license_type': item.license_type, 'exclusivity': item.exclusivity, 'delivery_type': item.delivery_type,
        'pricing_terms': item.pricing_terms, 'license_scope': item.license_scope, 'compensation_type': item.compensation_type, 'compensation_terms': item.compensation_terms,
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
        if artwork_data:
            artwork_data['royalty_enabled'] = user.royalty_enabled
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
        restart_id = request.data.get('restart_of')
        if revision_id and restart_id:
            return Response({'error': 'Choose edit or start a new negotiation.'}, status=400)
        original = None
        buyer = user
        restart = None
        if restart_id:
            restart = Agreement.objects.filter(pk=restart_id, artwork=artwork, status=Agreement.Status.CANCELLED).filter(Q(buyer=user) | Q(artist=user)).first()
            if not restart or restart.closure_reason == 'superseded':
                return Response({'error': 'Only a cancelled negotiation can be restarted as a new card.'}, status=409)
            buyer = restart.buyer
        if revision_id:
            original = Agreement.objects.filter(id=revision_id, artwork=artwork).filter(Q(buyer=user) | Q(artist=user)).first()
            if not original or original.status != Agreement.Status.PROPOSED:
                return Response({"error": "This proposal is no longer open for revision."}, status=409)
            buyer = original.buyer
        if not original and not restart and (user.role not in (User.Role.BUYER, User.Role.ARTIST) or user.id == artwork.artist_id):
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
            "compensation_type": ("one_time", "royalty", "hybrid"),
        }
        selected = {key: request.data.get(key, values[0]) for key, values in choices.items()}
        resale = getattr(artwork, 'commission_resale', None)
        if resale:
            from commissions.resale import license_active
            if not license_active(resale.asset):
                return Response({'error': 'The original commission license expired.'}, status=409)
            if selected['license_type'] != resale.asset.license_terms['license_type'] or selected['exclusivity'] != resale.asset.license_terms['exclusivity']:
                return Response({'error': 'Resale must preserve the original commission license and exclusivity.'}, status=409)
        if any(selected[key] not in values for key, values in choices.items()):
            return Response({"error": "Invalid contract option."}, status=400)
        selected["delivery_type"] = "physical" if physical(artwork) else "digital"
        try:
            license_scope = validate_scope(request.data.get('license_scope'), selected['license_type'])
            compensation_terms = validate_compensation(request.data, user, selected['license_type'])
            if license_scope and compensation_terms.get('reporting_duration_months') and license_scope['duration_months'] != compensation_terms['reporting_duration_months']:
                raise ValueError('Royalty reporting duration must match the license duration.')
        except PermissionError as error:
            return Response({'error': str(error)}, status=403)
        except ValueError as error:
            return Response({'error': str(error)}, status=400)
        try:
            delivery_details, delivery_fee = shipping_details(artwork, request.data, buyer, user, original)
            pricing_terms = validate_pricing(request.data.get('pricing_terms'), artwork, price - delivery_fee)
            validate_schedule_total(compensation_terms, price - delivery_fee)
        except ValueError as error:
            return Response({"error": str(error)}, status=400)
        minimum = minimum_price(artwork, selected["license_type"], selected["exclusivity"])
        if not pricing_terms and price - delivery_fee < minimum:
            return Response({"error": f"The proposed price cannot be below PHP {minimum} for these terms, plus PHP {delivery_fee} delivery."}, status=400)
        template = AgreementTemplate.objects.filter(is_active=True).first()
        if not template:
            return Response({"error": "No active agreement template is configured."}, status=409)
        if not original and previous.filter(status=Agreement.Status.PROPOSED).exists():
            return Response({'error': 'An open negotiation already exists. Edit or renegotiate its latest offer.'}, status=409)
        negotiation_key = str(uuid.uuid4())
        attempt_body = 'Contract proposed'
        if original:
            negotiation_key = original.negotiation_key or negotiation_key
            if not original.negotiation_key:
                # Keep existing, previously grouped attempts together when first edited.
                previous.filter(negotiation_key='').update(negotiation_key=negotiation_key)
            old_message = original.messages.filter(message_type=Message.Type.AGREEMENT).first()
            old_sender = old_message.sender_id if old_message else original.buyer_id
            attempt_body = 'Proposal edited' if old_sender == user.id else 'Sent back to renegotiate'
            Agreement.objects.filter(pk=original.pk).update(status=Agreement.Status.CANCELLED, closure_reason='superseded')
        conversation = Conversation.objects.create(artwork=artwork)
        ConversationParticipant.objects.bulk_create([ConversationParticipant(conversation=conversation, user=buyer), ConversationParticipant(conversation=conversation, user=artwork.artist)])
        snapshot = f"Artwork: {artwork.title}\nBuyer: {buyer.username}\nArtist: {artwork.artist.username}\nAgreed total: PHP {price}\n\n{terms.strip()}"
        if delivery_details:
            snapshot += f"\nDelivery to: {delivery_details['delivery_address']}\nDelivery fee: PHP {delivery_fee}\nPickup: {delivery_details['pickup_address']}"
        if pricing_terms:
            snapshot += '\n\n' + pricing_summary(pricing_terms)
        if license_scope:
            snapshot += '\n\n' + scope_text(license_scope)
        if compensation_terms:
            snapshot += '\n\n' + compensation_summary(selected['compensation_type'], compensation_terms)
        item = Agreement.objects.create(conversation=conversation, template=template, artwork=artwork, buyer=buyer, artist=artwork.artist, price=price, terms_snapshot=snapshot, delivery_fee=delivery_fee, delivery_details=delivery_details, compensation_terms=compensation_terms, license_scope=license_scope, pricing_terms=pricing_terms, revision_of=original, negotiation_key=negotiation_key, **selected)
        if user.id == buyer.id:
            item.buyer_accepted_at = timezone.now()
        else:
            item.artist_accepted_at = timezone.now()
        item.save()
        Message.objects.create(conversation=conversation, sender=user, message_type=Message.Type.AGREEMENT, agreement=item, body=attempt_body)
        notify_negotiation(item, user, {'Proposal edited': 'edited', 'Sent back to renegotiate': 'renegotiated'}.get(attempt_body, 'proposed'))
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
            if not item.negotiation_key:
                item.negotiation_key = str(uuid.uuid4())
                Agreement.objects.filter(artwork_id=item.artwork_id, buyer_id=item.buyer_id, negotiation_key='').update(negotiation_key=item.negotiation_key)
            item.status = Agreement.Status.CANCELLED
            item.closure_reason = 'cancelled'
            item.cancelled_by = user
            item.cancelled_at = timezone.now()
            Message.objects.create(conversation=item.conversation, sender=user, message_type=Message.Type.SYSTEM,
                                   agreement=item, body=f'Negotiation cancelled by {user.username}.')
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
        notify_negotiation(item, user, 'cancelled' if action in ('reject', 'cancel') else 'accepted')
        return Response(contract_data(item, user))
