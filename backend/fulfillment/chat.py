from django.db import transaction
from rest_framework.response import Response
from messaging.models import Conversation, ConversationParticipant, Message
from .models import DeliveryOrder, DeliveryChat
from .riders import RiderView, orders


class RiderChatView(RiderView):
    @transaction.atomic
    def post(self, request, order_id):
        user = self.get_request_user(request)
        order = orders().select_for_update(of=('self',)).filter(pk=order_id, driver=user).exclude(status__in=['pending', 'delivered']).first()
        if not order:
            return Response({'error': 'An ongoing delivery assigned to you is required.'}, status=404)
        contact = request.data.get('contact')
        if contact not in ('buyer', 'artist'):
            return Response({'error': 'Choose buyer or artist.'}, status=400)
        chat = DeliveryChat.objects.filter(order=order, contact=contact).first()
        if not chat:
            source = order.commission if order.commission_id else order.payment
            recipient = getattr(source, contact)
            conversation = Conversation.objects.create()
            ConversationParticipant.objects.bulk_create([
                ConversationParticipant(conversation=conversation, user=user),
                ConversationParticipant(conversation=conversation, user=recipient),
            ])
            Message.objects.create(conversation=conversation, message_type=Message.Type.SYSTEM,
                                   body=f'Delivery #{order.pk}: coordinate {"drop-off" if contact == "buyer" else "pickup"} here.')
            chat = DeliveryChat.objects.create(order=order, contact=contact, conversation=conversation)
        return Response({'conversation_id': chat.conversation_id})
