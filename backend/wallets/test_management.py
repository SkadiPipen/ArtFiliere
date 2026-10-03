from decimal import Decimal
from unittest.mock import patch
from django.test import TestCase
from django.utils import timezone
from rest_framework.test import APIRequestFactory
from users.models import User
from artworks.models import Artwork
from authentication.services import verify_token
from .models import PaymentSession, IncidentReport, AccountActionRequest, CancellationReturnRequest, WalletAccount, FinancialAuthorization
from .management import ManagementView, ReportsView, AccountActionsView, TransactionRequestsView, FinancialAuthorizationsView, ReportAttachmentView
from .views import PlatformAdminRequestView, PlatformAdminWalletView
from .management import ReportUserSearchView


class ManagementTests(TestCase):
    def test_report_username_search_requires_typing_and_limits_matches(self):
        def search(query):
            request = self.factory.get('/', {'q': query})
            with patch('authentication.views.AuthenticatedAPIView.get_request_user', return_value=self.buyer):
                return ReportUserSearchView.as_view()(request)
        self.assertNotIn('users', self.call(ManagementView, self.buyer).data)
        self.assertEqual(search('').data, [])
        self.assertEqual(search('ca').data, [])
        matches = search('CASE-').data
        self.assertLessEqual(len(matches), 5)
        self.assertNotIn(self.buyer.pk, [row['id'] for row in matches])
        self.assertNotIn(self.mod.pk, [row['id'] for row in matches])
        self.assertEqual(search('case-artist').data[0]['id'], self.artist.pk)
        self.assertEqual(search('example.com').data, [])

    def test_evidence_upload_download_and_access(self):
        import json
        from django.core.files.uploadedfile import SimpleUploadedFile
        payload = {'title': 'Evidence test', 'description': 'Damaged package', 'links': ['https://example.com/proof']}
        request = self.factory.post('/', {'payload': json.dumps(payload), 'files': SimpleUploadedFile('proof.pdf', b'%PDF-1.4\nproof', content_type='application/pdf')}, format='multipart')
        with patch('authentication.views.AuthenticatedAPIView.get_request_user', return_value=self.buyer):
            response = ReportsView.as_view()(request)
        self.assertEqual(response.status_code, 201, response.data)
        self.assertEqual(response.data['links'], payload['links'])
        attachment_id = response.data['attachments'][0]['id']
        for actor in [self.buyer, self.mod, self.admin]:
            download = self.call(ReportAttachmentView, actor, attachment_id=attachment_id)
            self.assertEqual(download.status_code, 200)
            self.assertEqual(download.content, b'%PDF-1.4\nproof')
        self.assertEqual(self.call(ReportAttachmentView, self.other, attachment_id=attachment_id).status_code, 404)
        self.assertEqual(self.call(ReportAttachmentView, None, attachment_id=attachment_id).status_code, 403)

    def test_invalid_evidence_is_rejected_before_report_creation(self):
        import json
        from django.core.files.uploadedfile import SimpleUploadedFile
        payload = {'title': 'Invalid evidence', 'description': 'Details', 'links': ['javascript:alert(1)']}
        self.assertEqual(self.call(ReportsView, self.buyer, 'post', payload).status_code, 400)
        payload['links'] = []
        request = self.factory.post('/', {'payload': json.dumps(payload), 'files': SimpleUploadedFile('fake.pdf', b'not a PDF')}, format='multipart')
        with patch('authentication.views.AuthenticatedAPIView.get_request_user', return_value=self.buyer):
            self.assertEqual(ReportsView.as_view()(request).status_code, 400)
        self.assertFalse(IncidentReport.objects.filter(title='Invalid evidence').exists())

    def setUp(self):
        self.factory = APIRequestFactory()
        def user(name, role):
            return User.objects.create(username=name, role=role, firebase_uid=name, email=f'{name}@example.com', date_of_birth='2000-01-01')
        self.buyer = user('case-buyer', 'buyer')
        self.artist = user('case-artist', 'artist')
        self.other = user('case-other', 'buyer')
        self.driver = user('case-driver', 'driver')
        self.mod = user('case-mod', 'customer_support')
        self.admin = user('case-admin', 'platform_admin')
        self.art = Artwork.objects.create(artist=self.artist, title='Case artwork', price=100, art_type='physical', status='approved')
        self.payment = PaymentSession.objects.create(reference_id='case-payment', buyer=self.buyer, artist=self.artist, artwork=self.art,
            gross_amount=100, platform_fee=10, artist_amount=90, status='paid')
        self.report = IncidentReport.objects.create(reporter=self.buyer, reported_user=self.artist, payment=self.payment, title='Damaged item', description='The package arrived damaged.')

    def call(self, view, user, method='get', data=None, **kwargs):
        request = getattr(self.factory, method)('/', data or {}, format='json')
        with patch('authentication.views.AuthenticatedAPIView.get_request_user', return_value=user):
            return view.as_view()(request, **kwargs)

    def test_role_scoped_reports_and_transactions(self):
        self.assertEqual(self.call(ManagementView, self.buyer).data['reports'][0]['id'], self.report.pk)
        self.assertEqual(self.call(ManagementView, self.other).data['reports'], [])
        self.assertEqual(self.call(ManagementView, self.other).data['payments'], [])
        self.assertEqual(self.call(ManagementView, self.mod).data['reports'][0]['id'], self.report.pk)
        self.assertEqual(self.call(ManagementView, None).status_code, 403)

    def test_creative_moderator_has_no_customer_service_authority(self):
        self.mod.role = 'creative_moderator'
        self.mod.save()
        self.assertEqual(self.call(ManagementView, self.mod).status_code, 403)
        self.assertEqual(self.call(ReportsView, self.mod, 'patch', {'status': 'resolved', 'resolution': 'Reviewed'}, report_id=self.report.pk).status_code, 403)
        self.assertEqual(self.call(AccountActionsView, self.mod, 'post', {'report_id': self.report.pk, 'action': 'ban', 'reason': 'Reviewed'}).status_code, 403)
        self.assertEqual(self.call(FinancialAuthorizationsView, self.mod, 'post', {'report_id': self.report.pk, 'kind': 'refund', 'amount': '10', 'reason': 'Reviewed'}).status_code, 403)

    def test_report_roles_and_transaction_ownership(self):
        data = {'title': 'Incident', 'description': 'Delivery issue', 'payment_id': self.payment.pk}
        self.assertEqual(self.call(ReportsView, self.buyer, 'post', data).status_code, 201)
        self.assertEqual(self.call(ReportsView, self.other, 'post', data).status_code, 404)
        self.assertEqual(self.call(ReportsView, self.mod, 'post', data).status_code, 403)
        self.assertEqual(self.call(ReportsView, self.driver, 'post', {'title': 'Incident', 'description': 'Vehicle issue'}).status_code, 201)
        self.assertEqual(self.call(ReportsView, self.driver, 'post', data).status_code, 404)

    def test_cancellation_requires_counterpart_then_admin_approval(self):
        data = {'request_type': 'cancellation', 'reason': 'Delivery unavailable'}
        response = self.call(TransactionRequestsView, self.buyer, 'post', data, payment_id=self.payment.pk)
        self.assertEqual(response.status_code, 201, response.data)
        pk = response.data['id']
        self.assertEqual(self.call(TransactionRequestsView, self.buyer, 'patch', {'decision': 'accepted'}, request_id=pk).status_code, 403)
        self.assertEqual(self.call(TransactionRequestsView, self.other, 'patch', {'decision': 'accepted'}, request_id=pk).status_code, 404)
        self.assertEqual(self.call(PlatformAdminRequestView, self.admin, 'patch', {'status': 'approved'}, request_id=pk).status_code, 409)
        response = self.call(TransactionRequestsView, self.artist, 'patch', {'decision': 'accepted'}, request_id=pk)
        self.assertEqual(response.status_code, 200, response.data)
        self.assertEqual(response.data['status'], 'pending')
        self.assertEqual(self.call(PlatformAdminRequestView, self.admin, 'patch', {'status': 'approved', 'admin_note': 'Reviewed'}, request_id=pk).status_code, 200)
        self.payment.refresh_from_db()
        self.assertEqual(self.payment.status, 'paid')

    def test_decline_duplicate_requests_and_paid_physical_returns(self):
        data = {'request_type': 'cancellation', 'reason': 'Please cancel'}
        first = self.call(TransactionRequestsView, self.artist, 'post', data, payment_id=self.payment.pk)
        self.assertEqual(self.call(TransactionRequestsView, self.buyer, 'post', data, payment_id=self.payment.pk).status_code, 400)
        result = self.call(TransactionRequestsView, self.buyer, 'patch', {'decision': 'declined'}, request_id=first.data['id'])
        self.assertEqual(result.data['status'], 'declined')
        self.assertEqual(self.call(TransactionRequestsView, self.artist, 'post', data, payment_id=self.payment.pk).status_code, 201)
        self.assertEqual(self.call(TransactionRequestsView, self.driver, 'post', data, payment_id=self.payment.pk).status_code, 403)
        self.assertEqual(self.call(TransactionRequestsView, self.buyer, 'post', {'request_type': 'return', 'reason': 'Damaged'}, payment_id=self.payment.pk).status_code, 201)
        self.art.art_type = 'digital'; self.art.save()
        self.assertEqual(self.call(TransactionRequestsView, self.artist, 'post', {'request_type': 'return', 'reason': 'Damaged'}, payment_id=self.payment.pk).status_code, 400)

    def test_account_actions_require_admin_and_expire(self):
        data = {'report_id': self.report.pk, 'action': 'suspension', 'duration_days': 7, 'reason': 'Repeated incidents'}
        self.assertEqual(self.call(AccountActionsView, self.buyer, 'post', data).status_code, 403)
        response = self.call(AccountActionsView, self.mod, 'post', data)
        self.assertEqual(response.status_code, 201, response.data)
        pk = response.data['id']
        with patch('authentication.services.auth.verify_id_token', return_value={'uid': self.artist.firebase_uid}):
            self.assertEqual(verify_token('token')['uid'], self.artist.firebase_uid)
            self.assertEqual(self.call(AccountActionsView, self.mod, 'patch', {'status': 'approved', 'review_note': 'Reviewed'}, action_id=pk).status_code, 403)
            self.assertEqual(self.call(AccountActionsView, self.admin, 'patch', {'status': 'approved', 'review_note': 'Reviewed evidence'}, action_id=pk).status_code, 200)
            with self.assertRaises(ValueError):
                verify_token('token')
            AccountActionRequest.objects.filter(pk=pk).update(expires_at=timezone.now() - timezone.timedelta(seconds=1))
            self.assertEqual(verify_token('token')['uid'], self.artist.firebase_uid)

    def test_ban_and_declined_sanctions(self):
        response = self.call(AccountActionsView, self.mod, 'post', {'report_id': self.report.pk, 'action': 'ban', 'reason': 'Evidence reviewed'})
        pk = response.data['id']
        self.assertEqual(self.call(AccountActionsView, self.admin, 'patch', {'status': 'declined', 'review_note': 'Insufficient evidence'}, action_id=pk).status_code, 200)
        with patch('authentication.services.auth.verify_id_token', return_value={'uid': self.artist.firebase_uid}):
            verify_token('token')
        response = self.call(AccountActionsView, self.mod, 'post', {'report_id': self.report.pk, 'action': 'ban', 'reason': 'Additional evidence'})
        self.call(AccountActionsView, self.admin, 'patch', {'status': 'approved', 'review_note': 'Approved'}, action_id=response.data['id'])
        with patch('authentication.services.auth.verify_id_token', return_value={'uid': self.artist.firebase_uid}), self.assertRaises(ValueError):
            verify_token('token')

    def test_report_resolution_and_release_hold(self):
        self.assertEqual(self.call(ReportsView, self.buyer, 'patch', {'status': 'resolved', 'resolution': 'Done'}, report_id=self.report.pk).status_code, 403)
        WalletAccount.objects.create(user=self.artist, pending_balance=90)
        self.assertEqual(self.call(PlatformAdminWalletView, self.admin, 'post', {'action': 'release'}, payment_id=self.payment.pk).status_code, 409)
        self.assertEqual(self.call(ReportsView, self.mod, 'patch', {'status': 'resolved', 'resolution': 'Replacement delivered'}, report_id=self.report.pk).status_code, 200)
        self.assertEqual(self.call(PlatformAdminWalletView, self.admin, 'post', {'action': 'release'}, payment_id=self.payment.pk).status_code, 200)

    def test_staff_authorize_compensation_and_participant_visibility(self):
        for actor, kind in [(self.admin, 'refund'), (self.mod, 'wallet_credit')]:
            response = self.call(FinancialAuthorizationsView, actor, 'post', {'report_id': self.report.pk, 'kind': kind, 'amount': '25', 'reason': 'Damaged artwork'})
            self.assertEqual(response.status_code, 201, response.data)
        self.assertEqual(FinancialAuthorization.objects.filter(recipient=self.buyer, status='authorized').count(), 2)
        self.payment.refresh_from_db()
        self.assertEqual(self.payment.status, 'paid')
        self.assertFalse(WalletAccount.objects.filter(user=self.buyer).exists())
        self.assertEqual(len(self.call(ManagementView, self.buyer).data['financials']), 2)
        self.assertEqual(self.call(ManagementView, self.other).data['financials'], [])

    def test_compensation_permissions_amounts_and_cumulative_limit(self):
        data = {'report_id': self.report.pk, 'kind': 'refund', 'amount': '25', 'reason': 'Damaged artwork'}
        for actor in [self.buyer, self.artist, self.driver]:
            self.assertEqual(self.call(FinancialAuthorizationsView, actor, 'post', data).status_code, 403)
        for amount in ['NaN', 'Infinity', '-1', '0', '1.001', '101', True]:
            self.assertEqual(self.call(FinancialAuthorizationsView, self.mod, 'post', {**data, 'amount': amount}).status_code, 400)
        self.assertEqual(self.call(FinancialAuthorizationsView, self.mod, 'post', {**data, 'amount': '100'}).status_code, 201)
        self.assertEqual(self.call(FinancialAuthorizationsView, self.admin, 'post', {**data, 'kind': 'wallet_credit', 'amount': '0.01'}).status_code, 400)
        self.assertEqual(FinancialAuthorization.objects.count(), 1)

    def test_compensation_rejects_self_authorization_and_unpaid_purchase(self):
        data = {'report_id': self.report.pk, 'kind': 'refund', 'amount': '25', 'reason': 'Damaged artwork'}
        self.report.reporter = self.mod
        self.report.save()
        self.assertEqual(self.call(FinancialAuthorizationsView, self.mod, 'post', data).status_code, 403)
        self.payment.status = 'pending'
        self.payment.save()
        self.assertEqual(self.call(FinancialAuthorizationsView, self.admin, 'post', data).status_code, 400)

    def test_authorized_compensation_holds_release_after_resolution(self):
        WalletAccount.objects.create(user=self.artist, pending_balance=90)
        self.assertEqual(self.call(FinancialAuthorizationsView, self.mod, 'post', {'report_id': self.report.pk, 'kind': 'refund', 'amount': '50', 'reason': 'Damage'}).status_code, 201)
        self.assertEqual(self.call(ReportsView, self.admin, 'patch', {'status': 'resolved', 'resolution': 'Refund authorized'}, report_id=self.report.pk).status_code, 200)
        self.assertEqual(self.call(PlatformAdminWalletView, self.admin, 'post', {'action': 'release'}, payment_id=self.payment.pk).status_code, 409)
