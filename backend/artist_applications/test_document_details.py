from datetime import timedelta
from unittest.mock import patch
from django.test import TestCase
from django.utils import timezone
from rest_framework.test import APIClient
from users.models import User
from .models import ArtistApplication
from .document_details import validate_document_details


class DocumentDetailsTests(TestCase):
    def setUp(self):
        today = timezone.localdate()
        self.details = dict(registered_name='Test Artist', rdo_code='039', registration_date='2020-01-01', taxable_year=today.year, notarized_date=today.isoformat(), bir_received_date=today.isoformat(), remittance_status='not_exceed_500000', confirmed=True)

    def test_invalid_and_missing_fields(self):
        for changes in [dict(confirmed=False), dict(rdo_code='abc'), dict(taxable_year=2000), dict(registration_date='2026-02-30'), dict(bir_received_date='2020-01-01'), dict(notarized_date=(timezone.localdate()+timedelta(days=1)).isoformat()), dict(remittance_status='unknown')]:
            with self.subTest(changes=changes), self.assertRaises(ValueError):
                validate_document_details({**self.details, **changes})

    def test_submission_requires_details_and_exposes_them_to_hr(self):
        user = User.objects.create(username='artist_details', email='artist_details@example.com', firebase_uid='artist-details')
        client = APIClient()
        payload = dict(firebase_uid=user.firebase_uid, hourly_rate='100', tinNum='123456789', birCertificate=dict(name='bir.pdf', data_uri='data:application/pdf;base64,QQ=='), swornDeclaration=dict(name='sworn.pdf', data_uri='data:application/pdf;base64,QQ=='), portfolio=[dict(title='Artwork')])
        self.assertEqual(client.post('/api/users/artist-applications/', payload, format='json').status_code, 400)
        self.assertFalse(ArtistApplication.objects.filter(user=user).exists())
        payload['documentDetails'] = self.details
        self.assertEqual(client.post('/api/users/artist-applications/', payload, format='json').status_code, 201)
        self.assertEqual(ArtistApplication.objects.get(user=user).document_details, self.details)
        hr = User.objects.create(username='hr_details', email='hr_details@example.com', role=User.Role.HR)
        client.force_authenticate(user=hr)
        with patch('artist_applications.views.SubmitArtistApplicationView.get_request_user', return_value=hr):
            response = client.get('/api/users/artist-applications/')
        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.data[0]['document_details'], self.details)
