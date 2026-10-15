import base64
from datetime import timedelta
from io import BytesIO
from unittest.mock import patch

from PIL import Image
from django.test import TestCase
from django.utils import timezone
from rest_framework.test import APIRequestFactory

from authentication.views import register
from users.models import RoyaltyApplication, User
from users.royalty_views import RoyaltyApplicationView, RoyaltyReviewView, RoyaltyPermitView
from messaging.compensation import OPTIONS, validate_compensation
from messaging.contracts import ContractsView
from messaging.models import Agreement, AgreementTemplate
from messaging.models import Conversation, ConversationParticipant
from messaging.views import AgreementView
from messaging.signing import document_text
from artworks.models import Artwork


class RoyaltyTests(TestCase):
    def setUp(self):
        self.factory = APIRequestFactory()
        self.user = User.objects.create(username='applicant', firebase_uid='applicant', email='applicant@example.com', first_name='Test', last_name='User', date_of_birth='2000-01-01')
        self.admin = User.objects.create(username='admin', firebase_uid='admin', email='admin@example.com', role='platform_admin')
        buffer = BytesIO()
        Image.new('RGB', (2, 2), 'blue').save(buffer, 'JPEG')
        self.image = 'data:image/jpeg;base64,' + base64.b64encode(buffer.getvalue()).decode()
        self.expires = timezone.localdate() + timedelta(days=30)
        self.permit = {'business_permit_image': self.image, 'permit_expires_on': self.expires.isoformat()}

    def call(self, view, user, method='get', data=None, **kwargs):
        request = getattr(self.factory, method)('/', data or {}, format='json')
        with patch.object(view, 'get_request_user', return_value=user):
            return view.as_view()(request, **kwargs)

    def apply(self):
        result = self.call(RoyaltyApplicationView, self.user, 'post', self.permit)
        self.assertEqual(result.status_code, 201)
        return result.data['id']

    def approve(self):
        pk = self.apply()
        result = self.call(RoyaltyReviewView, self.admin, 'patch', {'action': 'approve'}, application_id=pk)
        self.assertEqual(result.status_code, 200)

    def test_submission_approval_expiry_and_private_admin_review(self):
        pk = self.apply()
        self.assertFalse(self.user.royalty_enabled)
        self.assertFalse(self.user.access_restricted)
        self.assertNotIn('business_permit_image', self.call(RoyaltyApplicationView, self.user).data)
        self.assertEqual(self.call(RoyaltyReviewView, self.user).status_code, 403)
        self.assertEqual(self.call(RoyaltyReviewView, self.user, 'patch', {'action': 'approve'}, application_id=pk).status_code, 403)
        review = self.call(RoyaltyReviewView, self.admin).data[0]
        self.assertEqual(review['username'], 'applicant')
        self.assertEqual(review['name'], 'Test User')
        self.assertIsInstance(review['age'], int)
        self.assertEqual(review['business_permit_image'], self.image)
        self.assertEqual(review['permit_expires_on'], self.expires.isoformat())
        self.assertEqual(self.call(RoyaltyReviewView, self.admin, 'patch', {'action': 'approve'}, application_id=pk).status_code, 200)
        self.assertTrue(self.user.royalty_enabled)
        self.assertEqual(self.call(RoyaltyReviewView, self.admin, 'patch', {'action': 'reject'}, application_id=pk).status_code, 409)
        RoyaltyApplication.objects.filter(pk=pk).update(permit_expires_on=timezone.localdate() - timedelta(days=1))
        self.assertFalse(self.user.royalty_enabled)
        self.assertEqual(self.call(RoyaltyApplicationView, self.user, 'post', self.permit).status_code, 201)
        self.assertFalse(self.user.royalty_enabled)

    def test_invalid_uploads_expired_dates_and_reapplication(self):
        for values in [{}, {**self.permit, 'business_permit_image': 'data:image/jpeg;base64,aGVsbG8='}, {**self.permit, 'permit_expires_on': '2026-02-30'}, {**self.permit, 'permit_expires_on': '2000-01-01'}]:
            self.assertEqual(self.call(RoyaltyApplicationView, self.user, 'post', values).status_code, 400)
        self.assertFalse(RoyaltyApplication.objects.exists())
        pk = self.apply()
        self.assertEqual(self.call(RoyaltyApplicationView, self.user, 'post', self.permit).status_code, 409)
        self.call(RoyaltyReviewView, self.admin, 'patch', {'action': 'reject', 'review_note': 'Please upload a clearer permit.'}, application_id=pk)
        self.assertFalse(self.user.royalty_enabled)
        self.assertEqual(self.call(RoyaltyApplicationView, self.user, 'post', self.permit).status_code, 201)

    def test_applicant_can_view_only_their_own_submitted_permit(self):
        self.assertEqual(self.call(RoyaltyPermitView, self.user).status_code, 404)
        self.apply()
        result = self.call(RoyaltyPermitView, self.user)
        self.assertEqual(result.status_code, 200)
        self.assertEqual(result.data['business_permit_image'], self.image)
        self.assertEqual(result['Cache-Control'], 'private, no-store')
        self.assertNotIn('business_permit_image', self.call(RoyaltyApplicationView, self.user).data)
        request = self.factory.get('/', {'user_id': self.user.pk})
        with patch.object(RoyaltyPermitView, 'get_request_user', return_value=self.admin):
            self.assertEqual(RoyaltyPermitView.as_view()(request).status_code, 404)
        self.assertEqual(self.call(RoyaltyPermitView, None).status_code, 403)

    def test_registration_is_immediate_but_royalty_pending(self):
        data = {**self.permit, 'wants_royalty': 'yes', 'username': 'new-user', 'first_name': 'New', 'last_name': 'User', 'date_of_birth': '2001-01-01', 'contact_number': '123456789', 'address': {key: 'Test' for key in ['region', 'province', 'city', 'postal_code', 'barangay', 'street']}}
        request = self.factory.post('/', data, format='json', HTTP_AUTHORIZATION='Bearer token')
        with patch('authentication.views.verify_token', return_value={'uid': 'new', 'email': 'new@example.com'}):
            result = register(request)
        self.assertEqual(result.status_code, 201)
        user = User.objects.get(firebase_uid='new')
        self.assertFalse(user.access_restricted)
        self.assertFalse(user.royalty_enabled)
        self.assertEqual(user.royalty_application.status, 'pending')

    def test_invalid_registration_does_not_create_an_account_profile(self):
        data = {'wants_royalty': 'yes', 'username': 'new-user', 'first_name': 'New', 'last_name': 'User', 'date_of_birth': '2001-01-01', 'contact_number': '123', 'address': {key: 'Test' for key in ['region', 'province', 'city', 'postal_code', 'barangay', 'street']}}
        request = self.factory.post('/', data, format='json', HTTP_AUTHORIZATION='Bearer token')
        with patch('authentication.views.verify_token', return_value={'uid': 'new', 'email': 'new@example.com'}):
            result = register(request)
        self.assertEqual(result.status_code, 400)
        self.assertFalse(User.objects.filter(firebase_uid='new').exists())

    def test_all_compensation_options_round_trip_and_appear_in_signed_document(self):
        self.approve()
        artist = User.objects.create(username='artist', firebase_uid='artist', email='artist@example.com', role='artist')
        artwork = Artwork.objects.create(artist=artist, title='Painting', price='50', status='approved', image_data=self.image)
        AgreementTemplate.objects.get_or_create(name='Royalty test', defaults={'body': 'Terms', 'is_active': True})
        for category, options in OPTIONS.items():
            for subtype, label in options.items():
                with self.subTest(category=category, subtype=subtype):
                    terms = {'subtype': subtype, 'rate': '3.50', 'minimum_guarantee': '1000', 'details': 'Agreed schedule, permitted deductions, thresholds and deliverables.', 'reporting_frequency': 'quarterly', 'calculation': {'basis': 'gross_sales', 'rate': '3.50', 'tiers': [{'from': '0', 'rate': '3.50'}]}}
                    if subtype in ('milestone_payments', 'installment_payments', 'per_deliverable_fee'):
                        terms['entries'] = [{'name': 'Final artwork', 'amount': '100', 'due_date': '2026-12-31', 'acceptance': 'Buyer approves final artwork'}]
                    result = self.call(ContractsView, self.user, 'post', {'price': '100', 'terms': 'Commercial rights for 12 months.', 'license_type': 'commercial', 'compensation_type': category, 'compensation_terms': terms, 'revision_of': Agreement.objects.filter(artwork=artwork, buyer=self.user, status='proposed').order_by('-id').values_list('id', flat=True).first()}, artwork_id=artwork.pk)
                    self.assertEqual(result.status_code, 201, result.data)
                    item = Agreement.objects.get(pk=result.data['id'])
                    self.assertEqual(item.compensation_terms['subtype'], subtype)
                    self.assertIn(label, document_text(item))
                    self.assertNotIn('ten (10) business days', document_text(item))
                    if category != 'one_time':
                        self.assertEqual(item.compensation_terms['reporting_frequency'], 'quarterly')
                        self.assertIn('Royalty Reporting & Payment: Quarterly', document_text(item))
                    else:
                        self.assertNotIn('reporting_frequency', item.compensation_terms)

    def test_unapproved_personal_and_mismatched_options_cannot_bypass_approval(self):
        data = {'compensation_type': 'royalty', 'compensation_terms': {'subtype': 'gross_sales', 'rate': '3', 'reporting_frequency': 'monthly'}}
        with self.assertRaises(PermissionError):
            validate_compensation(data, self.user, 'commercial')
        self.approve()
        with self.assertRaises(ValueError):
            validate_compensation(data, self.user, 'personal')
        for fields in [{'subtype': 'upfront_gross_sales'}, {'subtype': 'gross_sales', 'rate': '101', 'reporting_frequency': 'monthly'}, {'subtype': 'gross_sales', 'rate': '3', 'reporting_frequency': 'weekly'}, {'subtype': 'net_sales', 'rate': '3', 'reporting_frequency': 'monthly'}, {'subtype': 'tiered', 'reporting_frequency': 'monthly'}]:
            with self.assertRaises(ValueError):
                validate_compensation({**data, 'compensation_terms': fields}, self.user, 'commercial')

    def test_both_contract_endpoints_enforce_royalty_permission(self):
        artist = User.objects.create(username='artist', firebase_uid='artist', email='artist@example.com', role='artist')
        artwork = Artwork.objects.create(artist=artist, title='Painting', price='50', status='approved', image_data=self.image)
        AgreementTemplate.objects.get_or_create(name='Permission test', defaults={'body': 'Terms', 'is_active': True})
        conversation = Conversation.objects.create(artwork=artwork)
        ConversationParticipant.objects.create(conversation=conversation, user=self.user)
        ConversationParticipant.objects.create(conversation=conversation, user=artist)
        body = {'price': '100', 'terms': 'Commercial license', 'license_type': 'commercial', 'compensation_type': 'royalty', 'compensation_terms': {'subtype': 'gross_sales', 'rate': '3', 'reporting_frequency': 'annually'}}
        for view, kwargs in [(ContractsView, {'artwork_id': artwork.pk}), (AgreementView, {'conversation_id': conversation.pk})]:
            self.assertEqual(self.call(view, self.user, 'post', body, **kwargs).status_code, 403)
        self.approve()
        for view, kwargs in [(ContractsView, {'artwork_id': artwork.pk}), (AgreementView, {'conversation_id': conversation.pk})]:
            result = self.call(view, self.user, 'post', body, **kwargs)
            self.assertEqual(result.status_code, 201, result.data)
            self.assertEqual(result.data['compensation_terms']['reporting_frequency'], 'annually')

    def test_admin_cannot_approve_a_permit_that_expired_during_review(self):
        pk = self.apply()
        RoyaltyApplication.objects.filter(pk=pk).update(permit_expires_on=timezone.localdate() - timedelta(days=1))
        result = self.call(RoyaltyReviewView, self.admin, 'patch', {'action': 'approve'}, application_id=pk)
        self.assertEqual(result.status_code, 400)
        self.assertFalse(self.user.royalty_enabled)
