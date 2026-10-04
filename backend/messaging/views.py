from django.db.models import Q
from rest_framework.response import Response
from rest_framework import status

from authentication.views import AuthenticatedAPIView
from authentication.permissions import IsAuthenticatedUser
from users.models import User
from artworks.models import Artwork
from .models import DirectMessage
from .models import Agreement, AgreementTemplate, Conversation, ConversationParticipant, Message
from django.utils import timezone
from authentication.permissions import IsPlatformAdmin
from delivery.views import create_delivery_and_notify_driver_order


class DirectMessageView(AuthenticatedAPIView):
    permission_classes = [IsAuthenticatedUser]

    def get(self, request):
        user = self.get_request_user(request)
        recipient_id = request.query_params.get("recipient_id")
        if not recipient_id:
            return Response(
                {"error": "recipient_id is required."}, status=status.HTTP_400_BAD_REQUEST
            )

        messages = DirectMessage.objects.filter(
            Q(sender=user, recipient_id=recipient_id)
            | Q(sender_id=recipient_id, recipient=user)
        ).select_related("sender")

        if not getattr(user, 'view_only', False):
            DirectMessage.objects.filter(
                sender_id=recipient_id, recipient=user, is_read=False
            ).update(is_read=True)

        return Response(
            [
                {
                    "id": message.id,
                    "sender_id": message.sender_id,
                    "body": message.body,
                    "created_at": message.created_at.isoformat(),
                }
                for message in messages
            ]
        )

    def post(self, request):
        user = self.get_request_user(request)
        recipient_id = request.data.get("recipient_id")
        body = (request.data.get("body") or "").strip()
        if not recipient_id or not body:
            return Response({"error": "Recipient and message are required."}, status=status.HTTP_400_BAD_REQUEST)
        try:
            recipient = User.objects.get(id=recipient_id, role=User.Role.ARTIST)
        except User.DoesNotExist:
            return Response({"error": "Artist not found."}, status=status.HTTP_404_NOT_FOUND)
        message = DirectMessage.objects.create(sender=user, recipient=recipient, body=body)
        return Response({"id": message.id, "sender_id": message.sender_id, "body": message.body, "created_at": message.created_at.isoformat()}, status=status.HTTP_201_CREATED)


class ConversationView(AuthenticatedAPIView):
    permission_classes = [IsAuthenticatedUser]

    def get(self, request, conversation_id=None):
        user = self.get_request_user(request)
        if conversation_id:
            conversation = Conversation.objects.filter(id=conversation_id, participants__user=user).first()
            if not conversation:
                return Response({"error": "Conversation not found."}, status=404)
            if not getattr(user, 'view_only', False):
                ConversationParticipant.objects.filter(conversation=conversation, user=user).update(last_read_at=timezone.now())
            return Response({"id": conversation.id, "status": conversation.status, "current_user_id": user.id, "artwork_id": conversation.artwork_id, "messages": [serialize_message(message) for message in conversation.messages.select_related("sender", "agreement").all()]})
        conversations = Conversation.objects.filter(participants__user=user).prefetch_related("participants__user", "messages").distinct().order_by("-updated_at")
        payload = []
        for item in conversations:
            other = next((participant.user for participant in item.participants.all() if participant.user_id != user.id), None)
            last_message = item.messages.order_by("-created_at").first()
            payload.append({
                "id": item.id, "status": item.status, "artwork_id": item.artwork_id,
                "updated_at": item.updated_at.isoformat(),
                "other_user": {"id": other.id, "name": other.username, "role": other.role} if other else None,
                "last_message": last_message.body if last_message else "No messages yet.",
                "last_message_type": last_message.message_type if last_message else None,
            })
        return Response(payload)

    def post(self, request):
        buyer = self.get_request_user(request)
        artist_id = request.data.get("artist_id")
        if not artist_id:
            return Response({"error": "artist_id is required."}, status=400)
        try:
            artist = User.objects.get(id=artist_id, role=User.Role.ARTIST)
        except User.DoesNotExist:
            return Response({"error": "Artist not found."}, status=404)
        if buyer == artist:
            return Response({"error": "You cannot start a conversation with yourself."}, status=400)
        artwork_id = request.data.get("artwork_id") or None
        if artwork_id and not Artwork.objects.filter(id=artwork_id, artist=artist).exists():
            return Response({"error": "The selected artwork does not belong to this artist."}, status=400)
        conversation = Conversation.objects.create(artwork_id=artwork_id)
        ConversationParticipant.objects.bulk_create([ConversationParticipant(conversation=conversation, user=buyer), ConversationParticipant(conversation=conversation, user=artist)])
        return Response({"id": conversation.id}, status=201)


class ConversationMessageView(AuthenticatedAPIView):
    permission_classes = [IsAuthenticatedUser]
    def post(self, request, conversation_id):
        user = self.get_request_user(request)
        if not ConversationParticipant.objects.filter(conversation_id=conversation_id, user=user).exists():
            return Response({"error": "Conversation not found."}, status=404)
        body = (request.data.get("body") or "").strip()
        if not body:
            return Response({"error": "Message cannot be empty."}, status=400)
        message = Message.objects.create(conversation_id=conversation_id, sender=user, body=body)
        Conversation.objects.filter(id=conversation_id).update(updated_at=timezone.now())
        return Response(serialize_message(message), status=201)


class AgreementView(AuthenticatedAPIView):
    permission_classes = [IsAuthenticatedUser]
    def post(self, request, conversation_id):
        user = self.get_request_user(request)
        participants = list(ConversationParticipant.objects.filter(conversation_id=conversation_id).select_related("user"))
        if user not in [participant.user for participant in participants] or len(participants) != 2:
            return Response({"error": "Conversation not found."}, status=404)
        buyer = next((p.user for p in participants if p.user.role == User.Role.BUYER), None)
        artist = next((p.user for p in participants if p.user.role == User.Role.ARTIST), None)
        template = AgreementTemplate.objects.filter(is_active=True).first()
        if not buyer or not artist or not template:
            return Response({"error": "A buyer, artist, and active agreement template are required."}, status=400)
        price = request.data.get("price")
        if price is None:
            return Response({"error": "price is required."}, status=400)
        terms = template.body.replace("{{buyer_name}}", buyer.username).replace("{{artist_name}}", artist.username).replace("{{amount}}", str(price))
        conversation = participants[0].conversation
        artwork_id = request.data.get("artwork_id") or conversation.artwork_id
        if artwork_id and not Artwork.objects.filter(id=artwork_id, artist=artist).exists():
            return Response({"error": "The selected artwork does not belong to the agreement artist."}, status=400)
        if artwork_id and Artwork.objects.filter(id=artwork_id, sale_type='Auction').exists():
            return Response({'error': 'Auction license terms are fixed. Use the winning auction agreement.'}, status=409)
        agreement = Agreement.objects.create(conversation_id=conversation_id, template=template, artwork_id=artwork_id, buyer=buyer, artist=artist, price=price, terms_snapshot=terms, delivery_date=request.data.get("delivery_date") or None, revision_limit=request.data.get("revision_limit") or 0, license_type=request.data.get("license_type", "personal"), exclusivity=request.data.get("exclusivity", "non_exclusive"), delivery_type=request.data.get("delivery_type", "digital"), compensation_type=request.data.get("compensation_type", "one_time"))
        Message.objects.create(conversation_id=conversation_id, sender=user, message_type=Message.Type.AGREEMENT, agreement=agreement, body="Agreement proposed")
        return Response(serialize_agreement(agreement), status=201)

    def patch(self, request, agreement_id):
        user = self.get_request_user(request)
        agreement = Agreement.objects.filter(id=agreement_id).first()
        if not agreement or user.id not in {agreement.buyer_id, agreement.artist_id}:
            return Response({"error": "Agreement not found."}, status=404)
        if agreement.status != Agreement.Status.PROPOSED:
            return Response({"error": "This agreement is already closed."}, status=409)
        if user.id == agreement.buyer_id: agreement.buyer_accepted_at = timezone.now()
        else: agreement.artist_accepted_at = timezone.now()
        if agreement.buyer_accepted_at and agreement.artist_accepted_at:
            agreement.status = Agreement.Status.ACCEPTED
            Conversation.objects.filter(id=agreement.conversation_id).update(status=Conversation.Status.AGREED)
            Message.objects.create(conversation_id=agreement.conversation_id, message_type=Message.Type.SYSTEM, body="Both parties accepted the agreement. Payment must be made through ArtFiliere's secure Xendit checkout.")

        # trigger for delivery for physical
        delivery_type_str = str(getattr(agreement, 'delivery_type', '')).lower() 
        if delivery_type_str not in ['digital', '']: 
            try: 
                buyer_address = ( 
                    getattr(agreement.buyer, 'address', None) 
                    or request.data.get('delivery_address') 
                ) 
                artwork_title = agreement.artwork.title if agreement.artwork else "Physical Artwork Contract" 
                
                create_delivery_and_notify_driver_order( 
                    buyer_id=agreement.buyer.id, 
                    address=buyer_address, 
                    payment_method="COD", 
                    artwork_title=artwork_title, 
                    price=float(agreement.price or 0.0), 
                    is_physical=True, 
                    is_priority=bool(request.data.get('is_priority', False)), 
                    distance_km=float(request.data.get('distance_km', 5.0)) 
                ) 
                print(f"Triggered delivery order for physical agreement #{agreement.id}") 
            except Exception as e: 
                print("Warning: delivery order could not be generated:", e) 
                
        agreement.save()
        return Response(serialize_agreement(agreement))


class AgreementTemplateAdminView(AuthenticatedAPIView):
    permission_classes = [IsPlatformAdmin]
    def get(self, request):
        return Response([{"id": item.id, "name": item.name, "body": item.body, "is_active": item.is_active} for item in AgreementTemplate.objects.all()])
    def post(self, request):
        defaults = {"name": request.data.get("name", "Standard agreement"), "body": request.data.get("body", ""), "is_active": request.data.get("is_active", True), "updated_by": self.get_request_user(request)}
        if request.data.get("id"):
            item, _ = AgreementTemplate.objects.update_or_create(id=request.data["id"], defaults=defaults)
        else:
            item = AgreementTemplate.objects.create(**defaults)
        return Response({"id": item.id}, status=201)


def serialize_agreement(item):
    return {"id": item.id, "verification_code": item.verification_code, "status": item.status, "price": str(item.price), "terms": item.terms_snapshot, "buyer_accepted_at": item.buyer_accepted_at, "artist_accepted_at": item.artist_accepted_at, "license_type": item.license_type, "exclusivity": item.exclusivity, "delivery_type": item.delivery_type, "compensation_type": item.compensation_type}


def serialize_message(message):
    return {"id": message.id, "sender_id": message.sender_id, "body": message.body, "type": message.message_type, "agreement": serialize_agreement(message.agreement) if message.agreement else None, "created_at": message.created_at.isoformat()}
