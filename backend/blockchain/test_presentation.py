from datetime import timedelta
from unittest.mock import patch
from django.test import TestCase
from django.utils import timezone
from . import test_provenance as fixtures
from .provenance import public_record, queue_payment, event
from .presentation import enrich
from .provenance_views import ProvenanceView
from .models import ProvenanceListing
from artworks.models import Artwork


class PublicEntitlementTests(TestCase):
    setUp = fixtures.ProvenanceTests.setUp
    agreement_for = fixtures.ProvenanceTests.agreement_for
    payment_for = fixtures.ProvenanceTests.payment_for
    confirm = fixtures.ProvenanceTests.confirm

    def summary(self, viewer=None):
        return enrich(self.record, public_record(self.record), viewer)

    def assignment(self, effective='signed_and_paid', kind='partial'):
        self.agreement.license_scope = {'allow_resale': True, 'duration_months': 12,
            'copyright_transfer': {'kind': kind, 'rights': ['reproduction'],
                'effective': effective, 'acknowledged': True,
                'existing_commitments': 'private-existing-license@example.com',
                'artist_reserved_uses': 'private-reservation@example.com',
                'additional_terms': 'None'}}
        self.agreement.save()

    def test_unpurchased_work_has_no_acquired_rights(self):
        self.assertEqual(self.summary()['entitlements'], [])
        self.assertIsNone(self.summary()['creation_date'])
        self.assertEqual(self.summary()['first_listed_at'], self.art.created_at)

    def test_paid_exclusive_is_a_license_not_copyright_and_pending_proof_is_separate(self):
        payment = self.payment_for()
        queue_payment(payment)
        row = self.summary()['entitlements'][0]
        self.assertEqual(row['holder_label'], 'Exclusive license holder')
        self.assertEqual(row['assigned_rights'], [])
        self.assertEqual(row['status'], 'active')
        self.assertEqual(row['proof_status'], 'pending')
        self.assertEqual(row['purchased_at'], payment.paid_at)

    def test_nonexclusive_purchase_is_visible_without_replacing_owner(self):
        self.agreement.exclusivity = 'non_exclusive'
        self.agreement.save()
        self.payment_for()
        self.assertIsNone(queue_payment(self.agreement.payment_sessions.first()))
        self.assertEqual(self.summary()['entitlements'][0]['holder_label'], 'Non-exclusive license holder')
        self.assertEqual(self.record.current_owner_id, self.artist.pk)

    def test_assignment_timing_and_partial_rights(self):
        self.assignment()
        self.assertEqual(self.summary()['entitlements'], [])
        payment = self.payment_for()
        row = self.summary()['entitlements'][0]
        self.assertEqual(row['assigned_rights'], ['Reproduction'])
        self.assertEqual(row['effective_at'], payment.paid_at)
        self.assertIsNone(row['expires_at'])
        self.assertEqual(row['holder_label'], 'Copyright holder — selected economic rights')

    def test_signature_only_assignment_does_not_invent_a_purchase(self):
        self.assignment(effective='both_signed', kind='full')
        row = self.summary()['entitlements'][0]
        self.assertIsNone(row['purchased_at'])
        self.assertEqual(row['effective_at'], max(self.agreement.artist_signed_at, self.agreement.buyer_signed_at))
        self.assertEqual(row['proof_status'], 'not_recorded')

    def test_public_endpoint_redacts_documents_free_text_and_buyer_identity(self):
        self.assignment()
        self.payment_for()
        with patch('authentication.views.AuthenticatedAPIView.get_request_user', return_value=None):
            result = ProvenanceView.as_view()(self.factory.get('/'), artwork_id=self.art.pk)
        self.assertEqual(result.status_code, 200)
        text = str(result.data)
        for secret in (self.buyer.username, 'private agreement with address', 'private-existing-license@example.com', 'private-reservation@example.com'):
            self.assertNotIn(secret, text)
        self.assertTrue(result.data['entitlements'][0]['holder']['label'].startswith('Holder '))
        self.assertEqual(self.summary(self.buyer)['entitlements'][0]['holder']['label'], 'You')

    def test_expiry_and_refund_do_not_erase_history(self):
        self.agreement.license_scope = {'duration_months': 1}
        self.agreement.artist_signed_at = self.agreement.buyer_signed_at = timezone.now() - timedelta(days=90)
        self.agreement.save()
        payment = self.payment_for()
        self.assertEqual(self.summary()['entitlements'][0]['status'], 'expired')
        payment.status = 'refunded'; payment.save()
        self.assertEqual(self.summary()['entitlements'][0]['status'], 'suspended_after_refund')
        self.assignment()
        self.assertEqual(self.summary()['entitlements'][0]['status'], 'review_required')

    def test_confirmed_resale_keeps_creator_and_continuous_private_holder_history(self):
        self.confirm(self.record.events.get(kind='registration'))
        first = queue_payment(self.payment_for()); self.confirm(first)
        listing = Artwork.objects.create(artist=self.buyer, title='Resale', image_data=self.art.image_data, price=100, status='approved')
        ProvenanceListing.objects.create(artwork=listing, record=self.record)
        agreement = self.agreement_for(listing, self.buyer, self.next_buyer)
        second = queue_payment(self.payment_for(agreement)); self.confirm(second)
        result = self.summary()
        self.assertEqual(result['created_by']['username'], self.artist.username)
        self.assertEqual(len(result['entitlements']), 2)
        self.assertEqual(result['entitlements'][0]['status'], 'transferred')
        self.assertEqual(result['entitlements'][1]['from_holder'], result['entitlements'][0]['holder'])
        self.assertNotIn(self.buyer.username, str(result))

    def test_commission_style_event_preserves_rights_without_inventing_business_dates(self):
        item = event(self.record, 'transfer', 'commission-completion:test', previous=self.artist,
            new=self.buyer, payload={'rights': {'license_type': 'commercial', 'exclusivity': 'exclusive', 'allow_resale': True}})
        self.confirm(item)
        row = self.summary()['entitlements'][0]
        self.assertIsNone(row['purchased_at'])
        self.assertIsNone(row['effective_at'])
        self.assertEqual(row['proof_status'], 'confirmed')
        self.assertEqual(row['holder_label'], 'Exclusive license holder')

    def test_additional_assignment_conditions_are_not_assumed_fulfilled(self):
        self.assignment()
        self.agreement.license_scope['copyright_transfer']['additional_terms'] = 'Deliver source files first'
        self.agreement.save()
        self.payment_for()
        row = self.summary()['entitlements'][0]
        self.assertEqual(row['status'], 'review_required')
        self.assertTrue(row['has_additional_conditions'])
        self.assertNotIn('Deliver source files first', str(row))
