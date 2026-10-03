import base64
from io import BytesIO
from datetime import timedelta
from unittest.mock import patch
from PIL import Image
from django.utils import timezone
from rest_framework.test import APIRequestFactory
from authentication.services import verify_token, AccountRestricted
from authentication.views import login, me
from users.models import User
from .test_support import SupportTests
from .support import SupportView
from .moderation import AccountModerationView, ModeratorUsersView, TicketReturnReviewView
from .models import SupportTicket, AccountModerationRequest, CancellationReturnRequest


class ModerationTests(SupportTests):
    def setUp(self):
        super().setUp()
        self.hr = User.objects.create(username='hr', firebase_uid='hr', email='hr@example.com', role='hr')
        self.creative = User.objects.create(username='creative', firebase_uid='creative', email='creative@example.com', role='creative_moderator')

    def invoke(self, view, user, method='get', data=None, **kwargs):
        request = getattr(self.factory, method)('/', data or {}, format='json')
        with patch('authentication.views.AuthenticatedAPIView.get_request_user', return_value=user):
            return view.as_view()(request, **kwargs)

    def test_creative_tickets_are_routed_to_director_and_other_reports_to_support(self):
        driver = self.report(concern='driver').data['id']
        creative = self.report(self.artist, concern='verification', reference_id=self.art.pk).data['id']
        self.art.status = 'declined'; self.art.save(update_fields=['status'])
        appeal = self.report(self.artist, concern='rejected_artwork', reference_id=self.art.pk).data['id']
        self.art.status = 'approved'; self.art.save(update_fields=['status'])
        plagiarism = self.report(self.buyer, concern='plagiarism', reference_id=self.art.pk, evidence='Original artwork and ownership evidence supplied.').data['id']
        customer = self.report().data['id']
        for user, expected in [(self.creative, {creative, appeal, plagiarism}), (self.support, {driver, customer})]:
            inbox = self.call(user, data={'moderator': '1'})
            self.assertEqual({r['id'] for r in inbox.data['results']}, expected)
            for ticket_id in (driver, creative, appeal, plagiarism, customer):
                self.assertEqual(self.call(user, ticket_id=ticket_id).status_code, 200 if ticket_id in expected else 404)
        for user in (self.hr, self.admin):
            self.assertEqual(self.call(user, data={'moderator': '1'}).status_code, 403)
            self.assertEqual(self.call(user, ticket_id=customer).status_code, 404)
        catalog = self.call(self.creative, action='catalog')
        self.assertEqual(catalog.data['department_label'], 'Creative Director')

    def request_action(self, action='suspend', **overrides):
        ticket = SupportTicket.objects.create(requester=self.buyer, assigned_to=self.support, concern='harassment', details='Reported harassment')
        data = dict(ticket_id=ticket.pk, target_id=self.other.pk, action=action, duration_days=3 if action == 'suspend' else None, reason='Evidence supports the requested account action.')
        data.update(overrides)
        return self.invoke(AccountModerationView, self.support, 'post', data)

    def test_only_admin_approval_applies_restrictions(self):
        result = self.request_action()
        self.assertEqual(result.status_code, 201)
        self.other.refresh_from_db(); self.assertFalse(self.other.access_restricted)
        data = {'status': 'approved', 'review_note': 'Evidence reviewed.'}
        self.assertEqual(self.invoke(AccountModerationView, self.support, 'patch', data, action_id=result.data['id']).status_code, 403)
        self.assertEqual(self.invoke(AccountModerationView, self.hr, 'patch', data, action_id=result.data['id']).status_code, 403)
        approved = self.invoke(AccountModerationView, self.admin, 'patch', data, action_id=result.data['id'])
        self.assertEqual(approved.status_code, 200)
        self.other.refresh_from_db(); self.assertTrue(self.other.access_restricted)
        self.assertEqual(self.invoke(AccountModerationView, self.admin, 'patch', data, action_id=result.data['id']).status_code, 400)

    def test_rejection_duplicate_and_staff_target_protection(self):
        self.assertEqual(self.request_action(target_id=self.admin.pk).status_code, 404)
        self.assertEqual(self.request_action(duration_days=0).status_code, 400)
        row = self.request_action(action='ban')
        self.assertEqual(self.request_action().status_code, 400)
        self.invoke(AccountModerationView, self.admin, 'patch', {'status': 'rejected', 'review_note': 'Insufficient evidence.'}, action_id=row.data['id'])
        self.other.refresh_from_db(); self.assertFalse(self.other.access_restricted)

    def test_ban_restore_and_expired_suspensions(self):
        row = self.request_action(action='ban')
        self.invoke(AccountModerationView, self.admin, 'patch', {'status': 'approved', 'review_note': 'Evidence checked.'}, action_id=row.data['id'])
        self.other.refresh_from_db(); self.assertTrue(self.other.is_banned)
        row = self.request_action(action='restore')
        self.invoke(AccountModerationView, self.admin, 'patch', {'status': 'approved', 'review_note': 'Appeal accepted.'}, action_id=row.data['id'])
        self.other.refresh_from_db(); self.assertFalse(self.other.access_restricted)
        self.other.suspended_until = timezone.now() - timedelta(seconds=1); self.other.save()
        self.assertFalse(self.other.access_restricted)

    def test_verified_tokens_and_login_reject_restricted_account(self):
        self.other.is_banned = True; self.other.save()
        with patch('authentication.services.auth.verify_id_token', return_value={'uid': self.other.firebase_uid, 'email': self.other.email}):
            with self.assertRaises(AccountRestricted):
                verify_token('token')
            response = login(self.factory.post('/', HTTP_AUTHORIZATION='Bearer token'))
            self.assertEqual(response.status_code, 403)
            self.assertEqual(response.data['code'], 'account_restricted')
            self.assertEqual(me(self.factory.get('/', HTTP_AUTHORIZATION='Bearer token')).status_code, 403)
            self.assertEqual(SupportView.as_view()(self.factory.get('/', HTTP_AUTHORIZATION='Bearer token')).status_code, 403)

    def test_customer_support_return_review_does_not_fake_payment_refund(self):
        ticket = self.report().data['id']
        self.call(self.support, 'patch', {'action': 'claim'}, ticket_id=ticket)
        data = dict(type='refund', status='approved', note='Refund review approved after checking the transaction.')
        self.assertEqual(self.invoke(TicketReturnReviewView, self.hr, 'post', data, ticket_id=ticket).status_code, 403)
        self.assertEqual(self.invoke(TicketReturnReviewView, self.admin, 'post', data, ticket_id=ticket).status_code, 403)
        result = self.invoke(TicketReturnReviewView, self.support, 'post', data, ticket_id=ticket)
        self.assertEqual(result.status_code, 200)
        self.assertEqual(CancellationReturnRequest.objects.get(pk=result.data['id']).reviewed_by, self.support)
        self.payment.refresh_from_db(); self.assertEqual(self.payment.status, 'paid')
