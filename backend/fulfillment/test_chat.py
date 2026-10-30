from unittest.mock import patch
from django.test import TestCase
from rest_framework.test import APIRequestFactory
from users.models import User
from artworks.models import Artwork
from wallets.models import PaymentSession
from messaging.models import ConversationParticipant
from messaging.views import ConversationView, ConversationMessageView
from .models import DeliveryOrder, DeliveryChat
from .chat import RiderChatView


class DeliveryChatTests(TestCase):
    def setUp(self):
        self.factory = APIRequestFactory()
        self.driver, self.buyer, self.artist, self.other = [User.objects.create(username=name, firebase_uid=name, email=f'{name}@test.com', role=role) for name, role in [('driver', 'driver'), ('buyer', 'buyer'), ('artist', 'artist'), ('other', 'driver')]]
        art = Artwork.objects.create(artist=self.artist, title='Physical artwork', price=100, art_type='physical', image_data='')
        self.payment = PaymentSession.objects.create(reference_id='delivery-chat-test', buyer=self.buyer, artist=self.artist, artwork=art, gross_amount=100, platform_fee=10, artist_amount=90, status='paid')
        self.order = DeliveryOrder.objects.create(payment=self.payment, driver=self.driver, status='accepted', fee=20, pickup_address='Studio', delivery_address='Buyer address')

    def call(self, view, user, method='post', data=None, **kwargs):
        request = getattr(self.factory, method)('/', data or {}, format='json')
        with patch('authentication.views.AuthenticatedAPIView.get_request_user', return_value=user):
            return view.as_view()(request, **kwargs)

    def test_separate_private_chats_reuse_existing_conversations_and_allow_replies(self):
        ids = []
        for role, person in [('buyer', self.buyer), ('artist', self.artist)]:
            response = self.call(RiderChatView, self.driver, data={'contact': role}, order_id=self.order.pk)
            self.assertEqual(response.status_code, 200)
            cid = response.data['conversation_id']
            ids.append(cid)
            self.assertSetEqual(set(ConversationParticipant.objects.filter(conversation_id=cid).values_list('user_id', flat=True)), {self.driver.pk, person.pk})
            repeated = self.call(RiderChatView, self.driver, data={'contact': role}, order_id=self.order.pk)
            self.assertEqual(repeated.data['conversation_id'], cid)
            self.assertEqual(self.call(ConversationMessageView, person, data={'body': 'Ready for delivery'}, conversation_id=cid).status_code, 201)
            self.assertEqual(self.call(ConversationView, self.other, method='get', conversation_id=cid).status_code, 404)
            inbox = self.call(ConversationView, person, method='get')
            self.assertEqual(inbox.status_code, 200)
            self.assertEqual(len(inbox.data), 1)
            self.assertEqual(inbox.data[0]['id'], cid)
            self.assertEqual(inbox.data[0]['delivery_order_id'], self.order.pk)
            self.assertEqual(inbox.data[0]['other_user']['role'], 'driver')
            self.assertEqual(inbox.data[0]['delivery_status'], 'accepted')
        self.assertNotEqual(*ids)
        self.assertEqual(DeliveryChat.objects.count(), 2)
        self.assertEqual(self.call(ConversationView, self.other, method='get').data, [])

    def test_requires_assigned_driver_and_ongoing_paid_order(self):
        for user in (self.other, self.buyer):
            self.assertIn(self.call(RiderChatView, user, data={'contact': 'buyer'}, order_id=self.order.pk).status_code, (403, 404))
        self.payment.status = 'pending'
        self.payment.save()
        self.assertEqual(self.call(RiderChatView, self.driver, data={'contact': 'buyer'}, order_id=self.order.pk).status_code, 404)

    def test_delivered_chat_retains_history_but_rejects_sending(self):
        cid = self.call(RiderChatView, self.driver, data={'contact': 'buyer'}, order_id=self.order.pk).data['conversation_id']
        self.order.status = 'delivered'
        self.order.save()
        self.assertEqual(self.call(RiderChatView, self.driver, data={'contact': 'buyer'}, order_id=self.order.pk).status_code, 404)
        for person in (self.driver, self.buyer):
            self.assertEqual(self.call(ConversationMessageView, person, data={'body': 'Message'}, conversation_id=cid).status_code, 409)
            self.assertEqual(self.call(ConversationView, person, method='get', conversation_id=cid).status_code, 200)
