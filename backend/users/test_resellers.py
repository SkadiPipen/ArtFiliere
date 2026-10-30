from io import BytesIO
from unittest.mock import patch
import base64

from PIL import Image
from django.test import TestCase
from rest_framework.test import APIRequestFactory
from users.models import User, ResellerApplication, ResellerReview
from users.resellers import ResellerApplicationView, ResellerReviewsView, ResellerDocumentView, require_seller
from rest_framework.exceptions import PermissionDenied


class ResellerTests(TestCase):
    def setUp(self):
        self.buyer = self.user('buyer', 'buyer')
        self.other = self.user('other', 'buyer')
        self.admin = self.user('admin', 'platform_admin')
        self.hr = self.user('hr', 'hr')
        self.factory = APIRequestFactory()
        image = BytesIO()
        Image.new('RGB', (8, 8), 'white').save(image, 'PNG')
        self.doc = {'name': 'bir.png', 'data_uri': 'data:image/png;base64,' + base64.b64encode(image.getvalue()).decode()}
        self.payload = {'tin_number': '123-456-789', 'bir_certificate': self.doc, 'consent': True}

    def user(self, name, role):
        return User.objects.create(username=name, firebase_uid=name, email=name + '@test.com', role=role)

    def call(self, view, user, method='get', data=None, **kwargs):
        request = getattr(self.factory, method)('/', data or {}, format='json')
        with patch('authentication.views.AuthenticatedAPIView.get_request_user', return_value=user):
            return view.as_view()(request, **kwargs)

    def submit(self):
        response = self.call(ResellerApplicationView, self.buyer, 'post', self.payload)
        self.assertEqual(response.status_code, 201, response.data)
        return ResellerApplication.objects.get(pk=response.data['id'])

    def approve(self, item):
        result = self.call(ResellerReviewsView, self.admin, 'patch', {'action': 'approve'}, application_id=item.pk)
        self.assertEqual(result.status_code, 200, result.data)

    def test_advance_application_needs_no_purchase_and_never_changes_role(self):
        from wallets.models import PaymentSession
        self.assertFalse(PaymentSession.objects.filter(buyer=self.buyer).exists())
        item = self.submit()
        self.assertFalse(self.buyer.reseller_verified)
        self.approve(item)
        self.buyer.refresh_from_db()
        self.assertEqual(self.buyer.role, 'buyer')
        self.assertTrue(self.buyer.reseller_verified)
        require_seller(self.buyer)
        self.assertEqual(ResellerReview.objects.count(), 2)

    def test_validation_and_duplicate_submission(self):
        for changes in ({'tin_number': 'x'}, {'tin_number': '123'}, {'bir_certificate': {'name': 'bad.png', 'data_uri': 'data:image/png;base64,YmFk'}}, {'consent': False}):
            response = self.call(ResellerApplicationView, self.buyer, 'post', {**self.payload, **changes})
            self.assertEqual(response.status_code, 400, response.data)
        self.submit()
        self.assertEqual(self.call(ResellerApplicationView, self.buyer, 'post', self.payload).status_code, 409)

    def test_review_privileges_reject_reapply_preserves_old_documents(self):
        item = self.submit()
        self.assertEqual(self.call(ResellerReviewsView, self.other).status_code, 403)
        self.assertEqual(self.call(ResellerReviewsView, self.buyer, 'patch', {'action': 'approve'}, application_id=item.pk).status_code, 403)
        self.assertEqual(self.call(ResellerReviewsView, self.hr, 'patch', {'action': 'reject'}, application_id=item.pk).status_code, 400)
        self.assertEqual(self.call(ResellerReviewsView, self.hr, 'patch', {'action': 'reject', 'review_note': 'Please upload a clearer certificate.'}, application_id=item.pk).status_code, 200)
        self.submit()
        self.assertEqual(ResellerApplication.objects.filter(user=self.buyer).count(), 2)
        item.refresh_from_db()
        self.assertEqual(item.bir_certificate, self.doc['data_uri'])
        self.assertEqual(item.status, 'rejected')

    def test_revocation_removes_badge_and_resale_permission(self):
        item = self.submit()
        self.approve(item)
        self.assertEqual(self.call(ResellerReviewsView, self.admin, 'patch', {'action': 'revoke', 'review_note': 'Documents require re-verification.'}, application_id=item.pk).status_code, 200)
        self.assertFalse(self.buyer.reseller_verified)
        with self.assertRaises(PermissionDenied):
            require_seller(self.buyer)
        self.assertEqual(self.call(ResellerReviewsView, self.admin, 'patch', {'action': 'approve'}, application_id=item.pk).status_code, 409)

    def test_documents_are_protected_and_never_in_summary(self):
        item = self.submit()
        self.assertEqual(self.call(ResellerDocumentView, self.other, application_id=item.pk, document='bir_certificate').status_code, 404)
        self.assertEqual(self.call(ResellerDocumentView, None, application_id=item.pk, document='bir_certificate').status_code, 403)
        response = self.call(ResellerDocumentView, self.admin, application_id=item.pk, document='bir_certificate')
        self.assertEqual(response.status_code, 200)
        self.assertEqual(response['Content-Type'], 'image/png')
        self.assertEqual(response['Cache-Control'], 'private, no-store')
        for view, user in ((ResellerApplicationView, self.buyer), (ResellerReviewsView, self.admin)):
            summary = self.call(view, user)
            self.assertNotIn(self.doc['data_uri'], str(summary.data))
        self.assertNotIn('tin_number', self.call(ResellerApplicationView, self.buyer).data)

    def test_unverified_and_restricted_users_cannot_resell(self):
        with self.assertRaises(PermissionDenied):
            require_seller(self.buyer)
        item = self.submit()
        self.approve(item)
        self.buyer.is_banned = True
        self.buyer.save(update_fields=['is_banned'])
        self.assertFalse(self.buyer.reseller_verified)
        with self.assertRaises(PermissionDenied):
            require_seller(self.buyer)

    def test_badge_is_public_without_private_documents(self):
        from artworks.models import Artwork
        from artworks.serializers import ArtworkSerializer
        from artist_profiles.views import ArtistProfileView
        item = self.submit()
        art = Artwork.objects.create(artist=self.buyer, title='Resale', price=10, image_data='image', status='approved')
        self.assertFalse(ArtworkSerializer(art).data['seller_reseller_verified'])
        self.approve(item)
        data = ArtworkSerializer(art).data
        self.assertTrue(data['seller_reseller_verified'])
        self.assertNotIn(self.doc['data_uri'], str(data))
        response = ArtistProfileView.as_view()(self.factory.get('/'), artist_id=self.buyer.pk)
        self.assertEqual(response.status_code, 200)
        self.assertTrue(response.data['reseller_verified'])
        self.assertEqual(response.data['role'], 'buyer')
        self.assertFalse(response.data['is_accepting_commissions'])

    def test_approved_artist_documents_can_be_reused_without_a_reseller_badge(self):
        from artist_applications.models import ArtistApplication
        from users.resellers import seller_compliant
        self.other.role = 'artist'
        self.other.save(update_fields=['role'])
        self.assertFalse(seller_compliant(self.other))
        ArtistApplication.objects.create(user=self.other, hourly_rate=100, tin_number='123456789', bir_certificate=self.doc['data_uri'], sworn_declaration='', status='approved')
        self.assertTrue(seller_compliant(self.other))
        self.assertFalse(self.other.reseller_verified)

    def test_seller_application_does_not_grant_artist_upload_permission(self):
        from artworks.views import ArtworkView
        item = self.submit()
        self.approve(item)
        response = self.call(ArtworkView, self.buyer, 'post', {'title': 'Cannot post new original art'})
        self.assertEqual(response.status_code, 403)

    def test_regular_and_commission_resale_endpoints_enforce_verification(self):
        from types import SimpleNamespace
        from blockchain.provenance_views import ProvenanceResaleView
        from commissions.resale import CommissionResaleView
        # Ownership checks succeed; the document gate must reject before a listing is created.
        with patch('blockchain.provenance_views.get_record', return_value=SimpleNamespace(pk=1)), patch('blockchain.provenance_views.ProvenanceArtwork.objects.select_for_update') as records:
            records.return_value.get.return_value = SimpleNamespace(current_owner_id=self.buyer.pk, registered_at=True)
            response = self.call(ProvenanceResaleView, self.buyer, 'post', {'price': '100'}, artwork_id=1)
            self.assertEqual(response.status_code, 403)
        with patch('commissions.resale.CommissionAsset.objects.select_for_update') as assets:
            assets.return_value.filter.return_value.first.return_value = SimpleNamespace(owner_id=self.buyer.pk)
            response = self.call(CommissionResaleView, self.buyer, 'post', {'price': '100'}, asset_id=1)
            self.assertEqual(response.status_code, 403)
