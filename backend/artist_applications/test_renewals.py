import base64
from datetime import timedelta
from unittest.mock import patch

from django.test import TestCase
from django.utils import timezone
from rest_framework.test import APIRequestFactory

from users.models import User
from .deadlines import AdminDeadlinesView, record_status
from .document_details import tax_today
from .models import ArtistApplication, SwornDeclarationRenewal
from .sworn_renewals import AdminSwornRenewalView, ArtistSwornRenewalView


class RenewalTests(TestCase):
    def setUp(self):
        self.artist = User.objects.create(username='renewal-artist', firebase_uid='renewal-artist', email='renewal@example.test', role=User.Role.ARTIST)
        self.admin = User.objects.create(username='renewal-admin', firebase_uid='renewal-admin', email='renewal-admin@example.test', role=User.Role.PLATFORM_ADMIN)
        self.today = tax_today()
        self.application = ArtistApplication.objects.create(
            user=self.artist, hourly_rate=100, status='approved', sworn_declaration='prior document',
            document_details={'taxable_year': self.today.year - 1, 'rdo_code': '039'},
        )
        self.data = {
            'document': {'name': 'declaration.pdf', 'data_uri': 'data:application/pdf;base64,' + base64.b64encode(b'%PDF-1.4\n%%EOF').decode()},
            'details': {'taxable_year': self.today.year, 'notarized_date': self.today.isoformat(),
                        'bir_received_date': self.today.isoformat(), 'remittance_status': 'not_exceed_500000', 'confirmed': True},
        }
        self.factory = APIRequestFactory()

    def request(self, view, user, method='get', data=None, **kwargs):
        request = getattr(self.factory, method)('/', data or {}, format='json')
        with patch.object(view, 'get_request_user', return_value=user):
            return view.as_view()(request, **kwargs)

    def test_renewal_requires_admin_review_and_preserves_previous_record(self):
        submit = self.request(ArtistSwornRenewalView, self.artist, 'post', self.data)
        self.assertEqual(submit.status_code, 201)
        self.application.refresh_from_db()
        self.assertEqual(self.application.sworn_declaration, 'prior document')
        self.assertEqual(self.request(ArtistSwornRenewalView, self.artist, 'post', self.data).status_code, 409)
        renewal_id = submit.data['id']
        self.assertEqual(self.request(AdminSwornRenewalView, self.artist, renewal_id=renewal_id).status_code, 403)
        listing = self.request(AdminSwornRenewalView, self.admin)
        self.assertNotIn('document', listing.data['results'][0])
        self.assertEqual(listing['Cache-Control'], 'private, no-store')
        review = self.request(AdminSwornRenewalView, self.admin, 'patch', {'action': 'approve'}, renewal_id=renewal_id)
        self.assertEqual(review.status_code, 200)
        self.application.refresh_from_db()
        self.assertEqual(self.application.sworn_declaration, self.data['document']['data_uri'])
        self.assertEqual(self.application.document_details['rdo_code'], '039')
        self.assertEqual(SwornDeclarationRenewal.objects.get(pk=renewal_id).previous_record['document'], 'prior document')
        self.assertEqual(self.request(ArtistSwornRenewalView, self.artist, 'post', self.data).status_code, 409)

    def test_rejection_allows_resubmission_and_deadlines_remain_private(self):
        renewal_id = self.request(ArtistSwornRenewalView, self.artist, 'post', self.data).data['id']
        review = self.request(AdminSwornRenewalView, self.admin, 'patch', {'action': 'reject', 'note': 'Missing received stamp.'}, renewal_id=renewal_id)
        self.assertEqual(review.status_code, 200)
        self.assertEqual(self.request(ArtistSwornRenewalView, self.artist, 'post', self.data).status_code, 201)
        self.assertEqual(self.request(AdminDeadlinesView, self.artist).status_code, 403)
        results = self.request(AdminDeadlinesView, self.admin, data={'category': 'declarations', 'status': 'expired'})
        self.assertEqual(results.data['count'], 1)
        self.assertEqual(results.data['results'][0]['ends_on'], f'{self.today.year - 1}-12-31')

    def test_inclusive_and_exclusive_date_boundaries(self):
        now = timezone.now()
        self.assertEqual(record_status(self.today, False, now, self.today), 'due_soon')
        self.assertEqual(record_status(self.today, True, now, self.today), 'expired')
        self.assertEqual(record_status(self.today + timedelta(days=31), False, now, self.today), 'current')

    def test_existing_artist_without_an_application_can_renew(self):
        self.application.delete()
        initial = self.request(ArtistSwornRenewalView, self.artist)
        self.assertEqual(initial.status_code, 200)
        self.assertIsNone(initial.data['approved_year'])
        submitted = self.request(ArtistSwornRenewalView, self.artist, 'post', self.data)
        self.assertEqual(submitted.status_code, 201)
        reviewed = self.request(AdminSwornRenewalView, self.admin, 'patch', {'action': 'approve'}, renewal_id=submitted.data['id'])
        self.assertEqual(reviewed.status_code, 200)
        self.assertFalse(ArtistApplication.objects.filter(user=self.artist).exists())
        self.assertEqual(self.request(ArtistSwornRenewalView, self.artist).data['approved_year'], self.today.year)
        deadlines = self.request(AdminDeadlinesView, self.admin, data={'category': 'declarations'})
        self.assertEqual(deadlines.data['results'][0]['ends_on'], f'{self.today.year}-12-31')
