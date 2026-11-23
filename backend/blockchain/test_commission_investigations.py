from unittest.mock import patch
from django.test import TestCase
from django.utils import timezone
from rest_framework.test import APIRequestFactory
from commissions.models import CommissionRequest, CommissionProposal, CommissionProof
from users.models import User, ActivityLog
from .commission_investigations import CommissionInvestigationView


class CommissionInvestigationTests(TestCase):
    def setUp(self):
        self.admin = User.objects.create(username='investigator', email='investigator@example.com', firebase_uid='investigator', role='platform_admin')
        self.buyer = User.objects.create(username='buyer', email='buyer@example.com', firebase_uid='buyer', role='buyer')
        self.commission = CommissionRequest.objects.create(buyer=self.buyer, artist=self.admin,
            title='Test sketch', deadline=timezone.now(), status='STAGE_1')
        CommissionProposal.objects.create(commission=self.commission, proposer=self.buyer, version=1,
            terms={'price': '100', 'delivery_address': 'PRIVATE ADDRESS'})
        CommissionProof.objects.create(commission=self.commission, registry_id='100', record_hash='a' * 64)

    def call(self, user, commission_id=None, query=None):
        request = APIRequestFactory().get('/', query or {})
        with patch('authentication.views.AuthenticatedAPIView.get_request_user', return_value=user):
            return CommissionInvestigationView.as_view()(request, commission_id=commission_id)

    def test_admin_access_and_pending_proof_visibility(self):
        self.assertEqual(self.call(None).status_code, 403)
        self.assertEqual(self.call(self.buyer, self.commission.pk).status_code, 403)
        response = self.call(self.admin, self.commission.pk)
        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.data['sections']['proofs'][0]['status'], 'PENDING')
        self.assertNotIn('PRIVATE ADDRESS', str(response.data))
        self.assertTrue(ActivityLog.objects.filter(action='commission_history_view').exists())

    def test_search_missing_and_invalid_page(self):
        self.assertEqual(len(self.call(self.admin, query={'q': str(self.commission.pk)}).data['items']), 1)
        self.assertEqual(self.call(self.admin, query={'q': 'absent'}).data['items'], [])
        self.assertEqual(self.call(self.admin, 999).status_code, 404)
        self.assertEqual(self.call(self.admin, query={'page': '0'}).status_code, 400)

    def test_existing_proof_recovers_transaction_and_block(self):
        from commissions.proofs import process_proof
        proof = self.commission.proofs.get()
        proof.status = 'CONFIRMED'
        proof.save()
        with patch('blockchain.service.register_artwork', return_value={
            'transaction_hash': '0x' + 'a' * 64, 'block_number': 42,
        }):
            process_proof(proof)
        proof.refresh_from_db()
        self.assertEqual(proof.block_number, 42)
        response = self.call(self.admin, self.commission.pk)
        self.assertEqual(response.data['sections']['proofs'][0]['block_number'], 42)
        self.assertEqual(response.data['sections']['proofs'][0]['transaction_hash'], '0x' + 'a' * 64)
