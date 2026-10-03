from unittest.mock import patch
import base64
from io import BytesIO
from PIL import Image
from datetime import timedelta
from django.test import TestCase
from django.utils import timezone
from rest_framework.test import APIRequestFactory
from artworks.models import Artwork
from auctions.models import AuctionListing, Bid
from commissions.models import CommissionRequest
from users.models import User
from .models import PaymentSession, SupportTicket
from .support import SupportView


class SupportTests(TestCase):
    def setUp(self):
        self.factory = APIRequestFactory()
        def user(name, role):
            return User.objects.create(username=name, firebase_uid=name, email=f'{name}@example.com', role=role)
        self.buyer = user('buyer', 'buyer')
        self.other = user('other', 'buyer')
        self.artist = user('artist', 'artist')
        self.support = user('support', 'customer_support')
        self.admin = user('admin', 'platform_admin')
        self.art = Artwork.objects.create(artist=self.artist, title='Artwork', price=100, status='approved', art_type='physical', image_data='')
        self.payment = PaymentSession.objects.create(reference_id='support-test', buyer=self.buyer, artist=self.artist, artwork=self.art, gross_amount=110, platform_fee=10, artist_amount=100, status='paid')

    def call(self, user, method='get', data=None, **kwargs):
        request = getattr(self.factory, method)('/', data or {}, format='json')
        with patch('authentication.views.AuthenticatedAPIView.get_request_user', return_value=user):
            return SupportView.as_view()(request, **kwargs)

    def report(self, user=None, **changes):
        data = dict(concern='missing_parcel', reference_id=self.payment.pk, details='The parcel has not arrived.')
        data.update(changes)
        return self.call(user or self.buyer, 'post', data)

    def test_authentication_and_artist_only_catalog_and_create(self):
        self.assertEqual(self.call(None, action='catalog').status_code, 403)
        result = self.call(self.buyer, action='catalog')
        self.assertFalse(any(c['artist_only'] for c in result.data['concerns']))
        self.assertEqual(self.report(concern='verification', reference_id=self.art.pk).status_code, 403)
        artist = self.call(self.artist, action='catalog')
        self.assertTrue(any(c['id'] == 'verification' for c in artist.data['concerns']))

    def test_payment_ownership_and_reference_required(self):
        self.assertEqual(self.report(self.other).status_code, 400)
        self.assertEqual(self.report(reference_id=None).status_code, 400)
        self.assertEqual(self.report().status_code, 201)
        self.assertEqual(self.report(self.artist).status_code, 201)
        rows = self.call(self.other, data={'concern': 'missing_parcel'}, action='references')
        self.assertEqual(rows.data['results'], [])

    def test_delivery_and_download_filter_type(self):
        self.assertEqual(self.report(concern='download').status_code, 400)
        self.art.art_type = 'digital'; self.art.save()
        self.assertEqual(self.report().status_code, 400)
        self.assertEqual(self.report(concern='download').status_code, 201)

    def test_private_ticket_and_replies_are_scoped(self):
        ticket_id = self.report().data['id']
        self.assertEqual(self.call(self.other, ticket_id=ticket_id).status_code, 404)
        self.assertEqual(self.call(self.other, 'post', {'message': 'Access test'}, ticket_id=ticket_id).status_code, 404)
        self.assertEqual(self.call(self.other).data['results'], [])
        self.assertEqual(self.call(self.other, data={'moderator': '1'}).status_code, 403)
        self.assertEqual(len(self.call(self.support, data={'moderator': '1'}).data['results']), 1)

    def test_admin_reply_status_and_customer_reopening(self):
        pk = self.report().data['id']
        self.assertEqual(self.call(self.support, 'patch', {'action': 'claim'}, ticket_id=pk).status_code, 200)
        denied = self.call(self.buyer, 'patch', {'status': 'resolved'}, ticket_id=pk)
        self.assertEqual(denied.status_code, 403)
        reply = self.call(self.support, 'post', {'message': 'Please confirm your delivery details.'}, ticket_id=pk)
        self.assertEqual(reply.data['status'], 'awaiting_customer')
        self.assertTrue(reply.data['replies'][0]['is_staff'])
        self.assertEqual(self.call(self.support, 'patch', {'status': 'invalid'}, ticket_id=pk).status_code, 400)
        self.call(self.support, 'patch', {'status': 'resolved'}, ticket_id=pk)
        reply = self.call(self.buyer, 'post', {'message': 'The parcel is still missing.'}, ticket_id=pk)
        self.assertEqual(reply.data['status'], 'open')
        self.assertFalse(reply.data['replies'][-1]['is_staff'])
        self.assertEqual(self.call(self.buyer, 'post', {'message': ' '}, ticket_id=pk).status_code, 400)

    def test_artwork_followup_and_plagiarism_evidence(self):
        self.assertEqual(self.report(self.artist, concern='verification', reference_id=self.art.pk).status_code, 201)
        self.art.artist = self.other; self.art.status = 'pending'; self.art.save()
        self.assertEqual(self.report(self.artist, concern='verification', reference_id=self.art.pk).status_code, 400)
        self.assertEqual(self.report(self.artist, concern='plagiarism', reference_id=self.art.pk, evidence='Original source').status_code, 400)
        self.art.status = 'approved'; self.art.save()
        self.assertEqual(self.report(self.artist, concern='plagiarism', reference_id=self.art.pk).status_code, 400)
        self.assertEqual(self.report(self.artist, concern='plagiarism', reference_id=self.art.pk, evidence='Original source and publication date').status_code, 201)

    def test_general_report_and_invalid_photo(self):
        self.assertEqual(self.report(concern='account', reference_id=None).status_code, 201)
        self.assertEqual(self.report(concern='account').status_code, 400)
        self.assertEqual(self.report(image_data='data:image/png;base64,bm90YW5pbWFnZQ==').status_code, 400)
        self.assertEqual(self.report(concern='unknown').status_code, 400)
        self.assertEqual(self.report(details='short').status_code, 400)

    def test_valid_photo_is_saved_privately_on_ticket(self):
        buffer = BytesIO()
        Image.new('RGB', (4, 4), 'red').save(buffer, 'PNG')
        photo = 'data:image/png;base64,' + base64.b64encode(buffer.getvalue()).decode()
        report = self.report(image_data=photo)
        self.assertEqual(report.status_code, 201)
        self.assertEqual(report.data['image_data'], photo)
        self.assertNotIn('image_data', self.call(self.buyer).data['results'][0])
        self.assertEqual(self.call(self.other, ticket_id=report.data['id']).status_code, 404)

    def test_commission_participants_and_auction_access(self):
        commission = CommissionRequest.objects.create(buyer=self.buyer, artist=self.artist, title='Custom work', deadline=timezone.now()+timedelta(days=10))
        self.assertEqual(self.report(concern='commission_scope', reference_id=commission.pk).status_code, 201)
        self.assertEqual(self.report(self.other, concern='commission_scope', reference_id=commission.pk).status_code, 400)
        auction = AuctionListing.objects.create(artist=self.artist, artwork=self.art, starting_bid=100, current_bid=100, end_time=timezone.now()+timedelta(days=1))
        self.assertEqual(self.report(concern='bidding', reference_id=auction.pk).status_code, 201)
        self.assertEqual(self.report(concern='auction_checkout', reference_id=auction.pk).status_code, 400)
        Bid.objects.create(auction=auction, bidder=self.buyer, amount=100)
        self.assertEqual(self.report(concern='auction_checkout', reference_id=auction.pk).status_code, 201)

    def test_report_does_not_move_money(self):
        self.assertEqual(self.report(concern='refund_request').status_code, 201)
        self.payment.refresh_from_db()
        self.assertEqual(self.payment.status, 'paid')
        self.assertEqual(self.payment.ledger_entries.count(), 0)

    def test_reference_search_and_pagination(self):
        for n in range(22):
            self.report(concern='account', reference_id=None, details=f'Account issue number {n}')
        page = self.call(self.buyer)
        self.assertEqual(len(page.data['results']), 20)
        self.assertEqual(page.data['next_offset'], 20)
        self.assertEqual(len(self.call(self.buyer, data={'offset': 20}).data['results']), 2)
        self.assertEqual(self.call(self.buyer, data={'offset': 'bad'}).status_code, 400)
        data = self.call(self.buyer, data={'concern': 'missing_parcel', 'q': str(self.payment.pk)}, action='references').data
        self.assertEqual(data['results'][0]['id'], self.payment.pk)

    def test_exclusive_claim_and_confirmed_transfer(self):
        colleague = User.objects.create(username='colleague', firebase_uid='colleague', email='colleague@example.com', role='customer_support')
        pk = self.report().data['id']
        def action(user, name, **extra):
            return self.call(user, 'patch', dict(action=name, **extra), ticket_id=pk)
        self.assertEqual(self.call(self.support, 'post', {'message': 'Before accepting'}, ticket_id=pk).status_code, 403)
        self.assertEqual(action(self.buyer, 'claim').status_code, 403)
        self.assertEqual(action(self.support, 'claim').status_code, 200)
        self.assertEqual(action(colleague, 'claim').status_code, 409)
        self.assertEqual(self.call(colleague, data={'moderator': '1'}).data['results'], [])
        self.assertEqual(len(self.call(self.support, data={'moderator': '1', 'queue': 'mine'}).data['results']), 1)
        self.assertEqual(action(colleague, 'transfer', target_id=self.support.pk).status_code, 403)
        self.assertEqual(action(self.support, 'transfer', target_id=self.buyer.pk).status_code, 404)
        self.assertEqual(action(self.support, 'transfer', target_id=colleague.pk).status_code, 200)
        self.assertEqual(len(self.call(colleague, data={'moderator': '1', 'queue': 'transfers'}).data['results']), 1)
        self.assertEqual(self.call(colleague, 'post', {'message': 'Not accepted yet'}, ticket_id=pk).status_code, 403)
        self.assertEqual(action(self.support, 'accept_transfer').status_code, 409)
        self.assertEqual(action(colleague, 'accept_transfer').data['assigned_to_id'], colleague.pk)
        self.assertEqual(action(colleague, 'accept_transfer').status_code, 409)
        self.assertEqual(self.call(self.support, 'post', {'message': 'Previous owner'}, ticket_id=pk).status_code, 403)
        self.assertEqual(self.call(colleague, 'post', {'message': 'I can help now'}, ticket_id=pk).status_code, 201)
        self.assertEqual(self.call(self.buyer, ticket_id=pk).data['replies'][-1]['message'], 'I can help now')
        self.assertEqual(self.call(self.support, 'patch', {'status': 'closed'}, ticket_id=pk).status_code, 403)

    def test_transfer_decline_cancel_and_close(self):
        colleague = User.objects.create(username='colleague', firebase_uid='colleague', email='colleague@example.com', role='customer_support')
        pk = self.report().data['id']
        def action(user, name, **extra):
            return self.call(user, 'patch', dict(action=name, **extra), ticket_id=pk)
        action(self.support, 'claim')
        for decision, actor in [('decline_transfer', colleague), ('cancel_transfer', self.support)]:
            action(self.support, 'transfer', target_id=colleague.pk)
            result = action(actor, decision)
            self.assertEqual(result.data['assigned_to_id'], self.support.pk)
            self.assertIsNone(result.data['transfer_to_id'])
        action(self.support, 'transfer', target_id=colleague.pk)
        self.call(self.support, 'patch', {'status': 'resolved'}, ticket_id=pk)
        self.assertEqual(action(colleague, 'accept_transfer').status_code, 409)
        colleague.is_banned = True; colleague.save()
        self.call(self.support, 'patch', {'status': 'open'}, ticket_id=pk)
        self.assertEqual(action(self.support, 'transfer', target_id=colleague.pk).status_code, 400)

    def test_appeals_require_rejected_artwork_owned_by_an_artist(self):
        self.assertEqual(self.report(self.artist, concern='rejected_artwork', reference_id=self.art.pk).status_code, 400)
        self.art.status = 'pending'; self.art.save()
        self.assertEqual(self.report(self.artist, concern='rejected_artwork', reference_id=self.art.pk).status_code, 400)
        self.art.status = 'declined'; self.art.decline_reason = 'Ownership unclear'; self.art.save()
        self.assertEqual(self.report(self.buyer, concern='rejected_artwork', reference_id=self.art.pk).status_code, 403)
        other_artist = User.objects.create(username='artist2', firebase_uid='artist2', email='artist2@example.com', role='artist')
        self.assertEqual(self.report(other_artist, concern='rejected_artwork', reference_id=self.art.pk).status_code, 400)
        rows = self.call(self.artist, data={'concern': 'rejected_artwork', 'reference_id': self.art.pk}, action='references').data['results']
        self.assertEqual(rows[0]['decline_reason'], 'Ownership unclear')
        self.assertEqual(self.call(other_artist, data={'concern': 'rejected_artwork'}, action='references').data['results'], [])
        self.assertEqual(self.report(self.artist, concern='rejected_artwork', reference_id=self.art.pk, details='short').status_code, 400)
        self.assertEqual(self.report(self.artist, concern='rejected_artwork', reference_id=self.art.pk, evidence='Original source URL').status_code, 201)

    def test_one_active_appeal_and_scoped_followup(self):
        self.art.status = 'declined'; self.art.save()
        created = self.report(self.artist, concern='rejected_artwork', reference_id=self.art.pk)
        self.assertEqual(created.status_code, 201)
        pk = created.data['id']
        for active_status in ('open', 'in_progress', 'awaiting_customer'):
            SupportTicket.objects.filter(pk=pk).update(status=active_status)
            duplicate = self.report(self.artist, concern='rejected_artwork', reference_id=self.art.pk)
            self.assertEqual(duplicate.status_code, 409)
            self.assertEqual(duplicate.data['ticket_id'], pk)
        query = {'concern': 'rejected_artwork', 'artwork_id': self.art.pk, 'active': '1'}
        self.assertEqual(self.call(self.artist, data=query).data['results'][0]['id'], pk)
        self.assertEqual(self.call(self.other, ticket_id=pk).status_code, 404)
        SupportTicket.objects.filter(pk=pk).update(status='resolved')
        self.assertEqual(self.call(self.artist, data=query).data['results'], [])
        self.assertEqual(self.report(self.artist, concern='rejected_artwork', reference_id=self.art.pk).status_code, 201)
        self.art.status = 'approved'; self.art.save()
        self.assertEqual(self.call(self.artist, data={'concern': 'rejected_artwork'}, action='references').data['results'], [])

    def review_appealed_artwork(self, user, **values):
        from artworks.views import ArtworkReviewView
        request = self.factory.patch('/', values, format='json')
        with patch('authentication.views.AuthenticatedAPIView.get_request_user', return_value=user):
            return ArtworkReviewView.as_view()(request, artwork_id=self.art.pk)

    def test_moderator_approval_resolves_appeal_and_notifies_artist(self):
        from artworks.models import ArtworkReviewLog
        from notifications.models import UserNotification
        creative = User.objects.create(username='creative_appeal', firebase_uid='creative_appeal', email='creative_appeal@example.com', role='creative_moderator')
        self.art.status = 'declined'; self.art.decline_reason = 'Please prove ownership'; self.art.save()
        appeal = self.report(self.artist, concern='rejected_artwork', reference_id=self.art.pk).data['id']
        self.assertEqual(self.review_appealed_artwork(self.artist, status='approved').status_code, 403)
        self.assertEqual(self.review_appealed_artwork(self.support, status='approved').status_code, 403)
        result = self.review_appealed_artwork(creative, status='approved')
        self.assertEqual(result.status_code, 200)
        self.art.refresh_from_db()
        self.assertEqual(self.art.status, 'approved')
        self.assertEqual(self.art.decline_reason, '')
        ticket = SupportTicket.objects.get(pk=appeal)
        self.assertEqual(ticket.status, 'resolved')
        self.assertIn('appeal was accepted', ticket.replies.get().message)
        self.assertEqual(ticket.replies.get().sender, creative)
        self.assertTrue(UserNotification.objects.filter(user=self.artist, artwork=self.art, title='Artwork approved').exists())
        self.assertTrue(ArtworkReviewLog.objects.filter(artwork=self.art, previous_status='declined', new_status='approved', actor=creative).exists())

    def test_upheld_rejection_resolves_appeal_with_feedback(self):
        creative = User.objects.create(username='creative_appeal', firebase_uid='creative_appeal', email='creative_appeal@example.com', role='creative_moderator')
        self.art.status = 'declined'; self.art.save()
        appeal = self.report(self.artist, concern='rejected_artwork', reference_id=self.art.pk).data['id']
        self.assertEqual(self.review_appealed_artwork(creative, status='declined').status_code, 400)
        result = self.review_appealed_artwork(creative, status='declined', decline_reason='Ownership evidence remains insufficient.')
        self.assertEqual(result.status_code, 200)
        ticket = SupportTicket.objects.get(pk=appeal)
        self.assertEqual(ticket.status, 'resolved')
        self.assertIn('Ownership evidence remains insufficient.', ticket.replies.get().message)
        self.art.refresh_from_db()
        self.assertEqual(self.art.status, 'declined')

    def test_appeal_cannot_bypass_similarity_review(self):
        from artworks.models import ArtworkSimilarityMatch
        creative = User.objects.create(username='creative_appeal', firebase_uid='creative_appeal', email='creative_appeal@example.com', role='creative_moderator')
        reference = Artwork.objects.create(artist=self.artist, title='Original', price=100)
        self.art.status = 'declined'; self.art.save()
        appeal = self.report(self.artist, concern='rejected_artwork', reference_id=self.art.pk).data['id']
        match = ArtworkSimilarityMatch.objects.create(artwork=self.art, reference_artwork=reference, phash_distance=0, dhash_distance=0, confidence_score=1)
        for match_status in ('pending', 'confirmed_copy'):
            match.review_status = match_status; match.save()
            self.assertEqual(self.review_appealed_artwork(creative, status='approved').status_code, 409)
            self.assertEqual(SupportTicket.objects.get(pk=appeal).status, 'open')
        match.review_status = 'not_a_copy'; match.save()
        self.assertEqual(self.review_appealed_artwork(creative, status='approved').status_code, 200)
