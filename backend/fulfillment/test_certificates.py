from unittest.mock import patch
from django.test import TestCase
from django.utils import timezone
from rest_framework.test import APIRequestFactory
from users.models import User
from artworks.models import Artwork
from messaging.models import Agreement, AgreementTemplate, Conversation
from wallets.models import PaymentSession
from .models import CertificateOfAuthenticity
from .certificates import issue_certificate
from .views import PurchaseCertificateView


class CertificateTests(TestCase):
    def setUp(self):
        self.buyer = User.objects.create(username='buyer', firebase_uid='buyer', email='buyer@coa.test', date_of_birth='2000-01-01', role='buyer')
        self.artist = User.objects.create(username='artist', firebase_uid='artist', email='artist@coa.test', date_of_birth='2000-01-01', role='artist')
        self.art = Artwork.objects.create(artist=self.artist, title='Stardust', price='100', art_type='digital', status='approved')
        template = AgreementTemplate.objects.create(name='COA test', body='Terms')
        self.agreement = Agreement.objects.create(conversation=Conversation.objects.create(artwork=self.art), template=template, artwork=self.art,
            buyer=self.buyer, artist=self.artist, price='100', license_type='commercial', exclusivity='sole',
            terms_snapshot='License duration: 12 months', document_snapshot='Signed commercial sole license. Portfolio use reserved.',
            artist_signature='Artist Example', buyer_signature='Buyer Example', artist_signed_at=timezone.now(), buyer_signed_at=timezone.now())
        self.payment = PaymentSession.objects.create(reference_id='coa-test', buyer=self.buyer, artist=self.artist, artwork=self.art,
            agreement=self.agreement, gross_amount='100', platform_fee='10', artist_amount='90', status='paid', paid_at=timezone.now())

    def request(self, user, payment_id):
        request = APIRequestFactory().get('/')
        with patch.object(PurchaseCertificateView, 'get_request_user', return_value=user):
            return PurchaseCertificateView.as_view()(request, payment_id=payment_id)

    def test_frozen_certificate_and_idempotent_issue(self):
        cert = issue_certificate(self.payment)
        original_pdf = bytes(cert.pdf)
        self.assertTrue(original_pdf.startswith(b'%PDF'))
        self.assertEqual(cert.snapshot['license'], 'Commercial')
        self.assertEqual(cert.snapshot['exclusivity'], 'Sole')
        self.assertIn('Signed commercial sole license', cert.snapshot['document'])
        self.art.title = 'Edited title'; self.art.save()
        self.agreement.document_snapshot = 'Changed later'; self.agreement.save()
        same = issue_certificate(self.payment)
        self.assertEqual(same.pk, cert.pk)
        self.assertEqual(bytes(same.pdf), original_pdf)
        self.assertEqual(same.snapshot['title'], 'Stardust')
        self.assertEqual(CertificateOfAuthenticity.objects.count(), 1)

    def test_certificate_is_one_page_without_contract_appendix(self):
        import re
        cert = issue_certificate(self.payment)
        self.assertEqual(cert.snapshot['pdf_style'], 3)
        self.assertEqual(len(re.findall(rb'/Type\s*/Page\b', bytes(cert.pdf))), 1)
        # The full agreement remains stored even though it is not appended to the PDF.
        self.assertEqual(cert.snapshot['document'], self.agreement.document_snapshot)

    def test_restyle_preserves_original_certificate_details(self):
        cert = issue_certificate(self.payment)
        original_code = cert.code
        old_snapshot = {**cert.snapshot, 'pdf_style': 2}
        CertificateOfAuthenticity.objects.filter(pk=cert.pk).update(snapshot=old_snapshot)
        self.art.title = 'Changed after purchase'
        self.art.save()
        updated = issue_certificate(self.payment)
        self.assertEqual(updated.code, original_code)
        self.assertEqual(updated.snapshot['title'], 'Stardust')
        self.assertEqual(updated.snapshot['document'], old_snapshot['document'])
        self.assertEqual(updated.snapshot['pdf_style'], 3)

    def test_private_paid_download_only(self):
        self.assertEqual(self.request(self.artist, self.payment.pk).status_code, 404)
        response = self.request(self.buyer, self.payment.pk)
        self.assertEqual(response.status_code, 200)
        self.assertEqual(response['Content-Type'], 'application/pdf')
        self.payment.status = 'pending'; self.payment.save()
        self.assertEqual(self.request(self.buyer, self.payment.pk).status_code, 404)

    def test_pending_does_not_issue_and_legacy_license_is_not_invented(self):
        self.payment.status = 'pending'; self.payment.save()
        self.assertIsNone(issue_certificate(self.payment))
        self.payment.status = 'paid'; self.payment.agreement = None; self.payment.save()
        cert = issue_certificate(self.payment)
        self.assertEqual(cert.snapshot['license'], 'Not recorded')
        self.assertIn('grants no additional usage rights', cert.snapshot['document'])

    def test_test_purchase_label_is_preserved(self):
        self.payment.is_simulated = True; self.payment.save()
        self.assertTrue(issue_certificate(self.payment).snapshot['simulated'])

    def test_payment_fulfillment_automatically_issues(self):
        from .services import fulfill_payment
        fulfill_payment(self.payment)
        self.assertTrue(CertificateOfAuthenticity.objects.filter(payment=self.payment).exists())

    def test_commission_requires_completion_and_all_payments(self):
        from commissions.models import CommissionRequest, CommissionMilestone
        commission = CommissionRequest.objects.create(buyer=self.buyer, artist=self.artist, title='Custom artwork', deadline=timezone.now())
        milestone = CommissionMilestone.objects.create(commission_req=commission, milestone_number=1, percentage=100, amount='100', status='PENDING')
        commission.status = 'COMPLETE'; commission.save()
        self.assertIsNone(issue_certificate(commission, commission=True))
        milestone.status = 'PAID'; milestone.paid_at = timezone.now(); milestone.save()
        commission.save()
        self.assertTrue(CertificateOfAuthenticity.objects.filter(commission=commission).exists())
        cert = issue_certificate(commission, commission=True)
        self.assertEqual(cert.snapshot['license'], 'Not recorded')
        self.assertEqual(CertificateOfAuthenticity.objects.count(), 1)
