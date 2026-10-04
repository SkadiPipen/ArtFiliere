from unittest.mock import patch
from django.test import TestCase
from django.utils import timezone
from rest_framework.test import APIRequestFactory
from users.models import User, ActivityLog
from authentication.services import verify_token, AccountRestricted
from .models import IncidentReport, AccountActionRequest, AccountModerationRequest, SupportTicket, RestrictionAppeal
from .restrictions import RestrictionStatusView, RestrictionAppealsView, ReverseRestrictionView, restriction_rows


class RestrictionTests(TestCase):
    def test_suspension_allows_login_reads_but_blocks_mutations_even_with_direct_requests(self):
        from rest_framework.test import APIClient
        client = APIClient()
        client.credentials(HTTP_AUTHORIZATION='Bearer suspended-token')
        with patch('authentication.services.auth.verify_id_token', return_value={'uid': self.buyer.firebase_uid, 'email': self.buyer.email}):
            login = client.post('/auth/login/', {}, format='json')
            self.assertEqual(login.status_code, 200, login.data)
            self.assertTrue(login.data['read_only'])
            self.assertEqual(client.get('/auth/me/').status_code, 200)
            self.assertEqual(client.get('/api/wallet/').status_code, 200)
            self.assertEqual(client.get('/api/cart/').status_code, 200)
            from .models import WalletAccount
            from cart.models import Cart
            self.assertFalse(WalletAccount.objects.filter(user=self.buyer).exists())
            self.assertFalse(Cart.objects.filter(buyer=self.buyer).exists())
            for path, method, data in [('/auth/me/', 'patch', {'first_name': 'Changed'}), ('/api/cart/', 'post', {'artwork_id': 1}), ('/api/checkout/artworks/1/', 'post', {}), ('/api/users/contracts/1/sign/', 'post', {}), ('/api/commissions/requests/', 'post', {'buyer_id': self.buyer.pk})]:
                response = getattr(client, method)(path, data, format='json')
                self.assertEqual(response.status_code, 403, path)
                self.assertEqual(response.json()['code'], 'account_read_only')
            support = client.post('/api/support/tickets/', {'concern': 'account', 'details': 'I need help understanding my suspension.'}, format='json')
            self.assertEqual(support.status_code, 201, support.data)
            reply = client.post(f"/api/support/tickets/{support.data['id']}/", {'message': 'Please review my account restriction.'}, format='json')
            self.assertEqual(reply.status_code, 201, reply.data)
        self.buyer.refresh_from_db()
        self.assertNotEqual(self.buyer.first_name, 'Changed')

    def setUp(self):
        self.factory = APIRequestFactory()
        def user(name, role):
            return User.objects.create(username=name, firebase_uid=name, email=f'{name}@example.com', role=role)
        self.buyer = user('restricted-buyer', 'buyer')
        self.other = user('other-buyer', 'buyer')
        self.mod = user('support-mod', 'customer_support')
        self.admin = user('restriction-admin', 'platform_admin')
        self.report = IncidentReport.objects.create(reporter=self.other, reported_user=self.buyer, title='Incident', description='Incident details')
        self.restriction = AccountActionRequest.objects.create(report=self.report, target=self.buyer, initiated_by=self.mod, reviewed_by=self.admin,
            action='suspension', duration_days=7, status='approved', reason='Repeated incidents', reviewed_at=timezone.now(), expires_at=timezone.now() + timezone.timedelta(days=7))

    def call(self, view, actor, method='get', data=None, **kwargs):
        request = getattr(self.factory, method)('/', data or {}, format='json', HTTP_AUTHORIZATION='Bearer test-token')
        with patch('authentication.services.auth.verify_id_token', return_value={'uid': actor.firebase_uid}):
            return view.as_view()(request, **kwargs)

    def appeal(self):
        response = self.call(RestrictionAppealsView, self.buyer, 'post', {'source': 'report', 'restriction_id': self.restriction.pk, 'explanation': 'Please reconsider this decision', 'links': ['https://example.com/evidence']})
        self.assertEqual(response.status_code, 201, response.data)
        return response.data['id']

    def test_restricted_user_reads_notice_and_appeals_but_normal_auth_is_blocked(self):
        with patch('authentication.services.auth.verify_id_token', return_value={'uid': self.buyer.firebase_uid}):
            with self.assertRaises(AccountRestricted):
                verify_token('test-token')
        notice = self.call(RestrictionStatusView, self.buyer)
        self.assertEqual(notice.status_code, 200)
        self.assertTrue(notice.data['restricted'])
        self.assertEqual(notice.data['restrictions'][0]['reason'], 'Repeated incidents')
        self.appeal()
        self.assertEqual(self.call(RestrictionAppealsView, self.buyer).status_code, 403)

    def test_duplicate_and_foreign_appeals_are_blocked(self):
        self.appeal()
        data = {'source': 'report', 'restriction_id': self.restriction.pk, 'explanation': 'A second appeal'}
        self.assertEqual(self.call(RestrictionAppealsView, self.buyer, 'post', data).status_code, 400)
        self.assertEqual(self.call(RestrictionAppealsView, self.other, 'post', data).status_code, 404)
        self.assertEqual(self.call(RestrictionStatusView, self.other).data['appeals'], [])

    def test_appeal_notifies_admin_directly_and_admin_reinstates_without_recommendation(self):
        pk = self.appeal()
        from notifications.models import UserNotification
        self.assertTrue(UserNotification.objects.filter(user=self.admin, title='New restriction appeal').exists())
        self.assertFalse(UserNotification.objects.filter(user=self.mod, title='New restriction appeal').exists())
        self.assertEqual(self.call(RestrictionAppealsView, self.admin, 'patch', {'decision': 'approved'}, appeal_id=pk).status_code, 400)
        self.assertEqual(self.call(RestrictionAppealsView, self.admin, 'patch', {'decision': 'approved', 'note': 'Reinstatement approved'}, appeal_id=pk).status_code, 200)
        self.assertEqual(self.call(RestrictionAppealsView, self.admin, 'patch', {'decision': 'denied', 'note': 'Second decision'}, appeal_id=pk).status_code, 400)
        self.restriction.refresh_from_db()
        self.assertEqual(self.restriction.status, 'approved')
        self.assertIsNotNone(self.restriction.revoked_at)
        self.assertEqual(self.restriction.revoked_by, self.admin)
        self.assertTrue(ActivityLog.objects.filter(action='restriction_reversed', user=self.admin).exists())
        self.assertFalse(self.call(RestrictionStatusView, self.buyer).data['restricted'])
        with patch('authentication.services.auth.verify_id_token', return_value={'uid': self.buyer.firebase_uid}):
            verify_token('test-token')

    def test_only_admin_can_reverse_and_other_active_restrictions_remain(self):
        ticket = SupportTicket.objects.create(requester=self.other, concern='incident', details='Incident')
        ban = AccountModerationRequest.objects.create(ticket=ticket, target=self.buyer, requested_by=self.mod, action='ban', status='approved', reviewed_at=timezone.now(), reason='Another decision')
        self.buyer.is_banned = True; self.buyer.save()
        data = {'reason': 'Suspension no longer needed'}
        self.assertEqual(self.call(ReverseRestrictionView, self.mod, 'post', data, source='report', restriction_id=self.restriction.pk).status_code, 403)
        self.assertEqual(self.call(ReverseRestrictionView, self.admin, 'post', {}, source='report', restriction_id=self.restriction.pk).status_code, 400)
        self.assertEqual(self.call(ReverseRestrictionView, self.admin, 'post', data, source='report', restriction_id=self.restriction.pk).status_code, 200)
        self.buyer.refresh_from_db()
        self.assertTrue(self.buyer.is_banned)
        self.assertEqual(len(restriction_rows(self.buyer)), 1)
        self.assertEqual(self.call(ReverseRestrictionView, self.admin, 'post', data, source='ticket', restriction_id=ban.pk).status_code, 200)
        self.buyer.refresh_from_db()
        self.assertFalse(self.buyer.is_banned)
        self.assertFalse(restriction_rows(self.buyer))

    def test_denied_appeal_keeps_ban_and_user_cannot_decide(self):
        self.restriction.action = 'ban'; self.restriction.save()
        pk = self.appeal()
        self.assertEqual(self.call(RestrictionAppealsView, self.other, 'patch', {'decision': 'approved', 'note': 'Self review'}, appeal_id=pk).status_code, 403)
        self.assertEqual(self.call(RestrictionAppealsView, self.mod, 'patch', {'recommendation': 'uphold', 'note': 'Evidence confirms decision'}, appeal_id=pk).status_code, 200)
        self.assertEqual(self.call(RestrictionAppealsView, self.admin, 'patch', {'decision': 'denied', 'note': 'Decision upheld'}, appeal_id=pk).status_code, 200)
        self.assertEqual(RestrictionAppeal.objects.get(pk=pk).status, 'denied')
        self.assertTrue(self.call(RestrictionStatusView, self.buyer).data['restricted'])

    def test_admin_can_deny_pending_appeal_and_optional_review_cannot_reopen_it(self):
        pk = self.appeal()
        queue = self.call(RestrictionAppealsView, self.admin)
        self.assertEqual(queue.data[0]['status'], 'pending')
        self.assertEqual(self.call(RestrictionAppealsView, self.mod, 'patch', {'decision': 'approved', 'note': 'Cannot decide'}, appeal_id=pk).status_code, 400)
        decision = self.call(RestrictionAppealsView, self.admin, 'patch', {'decision': 'denied', 'note': 'Evidence supports the restriction'}, appeal_id=pk)
        self.assertEqual(decision.status_code, 200)
        self.assertTrue(self.call(RestrictionStatusView, self.buyer).data['restricted'])
        self.assertEqual(self.call(RestrictionAppealsView, self.mod, 'patch', {'recommendation': 'reinstate', 'note': 'Late recommendation'}, appeal_id=pk).status_code, 400)
        from notifications.models import UserNotification
        self.assertTrue(UserNotification.objects.filter(user=self.buyer, title='Appeal updated', message__contains='denied').exists())

    def test_expired_suspension_does_not_block_login_or_allow_new_appeal(self):
        self.restriction.expires_at = timezone.now() - timezone.timedelta(seconds=1); self.restriction.save()
        self.assertFalse(self.call(RestrictionStatusView, self.buyer).data['restricted'])
        self.assertEqual(self.call(RestrictionAppealsView, self.buyer, 'post', {'source': 'report', 'restriction_id': self.restriction.pk, 'explanation': 'Expired appeal'}).status_code, 404)

    def test_login_returns_restriction_code_and_evidence_is_private(self):
        self.restriction.action = 'ban'; self.restriction.save()
        import json
        from django.core.files.uploadedfile import SimpleUploadedFile
        from authentication.views import login
        from .restrictions import AppealAttachmentView
        request = self.factory.post('/', {}, HTTP_AUTHORIZATION='Bearer token')
        with patch('authentication.services.auth.verify_id_token', return_value={'uid': self.buyer.firebase_uid}):
            response = login(request)
        self.assertEqual(response.status_code, 403)
        self.assertEqual(response.data['code'], 'account_restricted')
        payload = {'source': 'report', 'restriction_id': self.restriction.pk, 'explanation': 'Please review this attached evidence'}
        request = self.factory.post('/', {'payload': json.dumps(payload), 'files': SimpleUploadedFile('proof.pdf', b'%PDF-1.4\nproof')}, format='multipart', HTTP_AUTHORIZATION='Bearer token')
        with patch('authentication.services.auth.verify_id_token', return_value={'uid': self.buyer.firebase_uid}):
            response = RestrictionAppealsView.as_view()(request)
        self.assertEqual(response.status_code, 201, response.data)
        pk = response.data['attachments'][0]['id']
        self.assertEqual(self.call(AppealAttachmentView, self.buyer, attachment_id=pk).content, b'%PDF-1.4\nproof')
        self.assertEqual(self.call(AppealAttachmentView, self.mod, attachment_id=pk).status_code, 200)
        self.assertEqual(self.call(AppealAttachmentView, self.other, attachment_id=pk).status_code, 404)
