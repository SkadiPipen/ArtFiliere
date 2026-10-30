import base64
from io import BytesIO
from unittest.mock import patch
from django.test import TestCase
from PIL import Image
from rest_framework.test import APIRequestFactory
from users.models import User, Address
from .views import register


class SignupTests(TestCase):
    def setUp(self):
        image = BytesIO()
        Image.new('RGB', (8, 8), 'red').save(image, 'PNG')
        self.image = 'data:image/png;base64,' + base64.b64encode(image.getvalue()).decode()
        self.payload = {'username': 'signup-buyer', 'first_name': 'New', 'last_name': 'Buyer',
                        'date_of_birth': '2000-01-01', 'contact_number': '09123456789',
                        'address': {key: 'Test' for key in ['street', 'barangay', 'city', 'province', 'region', 'postal_code']}}

    def submit(self, **values):
        request = APIRequestFactory().post('/', {**self.payload, **values}, format='json', HTTP_AUTHORIZATION='Bearer token')
        with patch('authentication.views.verify_token', return_value={'uid': 'google-identity', 'email': 'verified@example.com', 'firebase': {'sign_in_provider': 'google.com'}}):
            return register(request)

    def test_google_identity_registers_with_uploaded_photo_and_verified_email(self):
        response = self.submit(profile_image=self.image, email='untrusted@example.com')
        self.assertEqual(response.status_code, 201, response.data)
        user = User.objects.get(firebase_uid='google-identity')
        self.assertEqual(user.profile_image, self.image)
        self.assertEqual(user.email, 'verified@example.com')
        self.assertTrue(user.addresses.filter(is_default=True).exists())

    def test_skip_photo_and_duplicate_registration_never_overwrites_profile(self):
        self.assertEqual(self.submit().status_code, 201)
        self.assertEqual(User.objects.get(firebase_uid='google-identity').profile_image, '')
        self.assertEqual(self.submit(profile_image=self.image).status_code, 409)
        self.assertEqual(User.objects.count(), 1)
        self.assertEqual(Address.objects.count(), 1)
        self.assertEqual(User.objects.get().profile_image, '')

    def test_invalid_photo_and_birthday_never_create_partial_profile(self):
        for values in [{'profile_image': 'not an image'}, {'date_of_birth': '2999-01-01'}, {'date_of_birth': '2000-02-31'}]:
            with self.subTest(values=values):
                self.assertEqual(self.submit(**values).status_code, 400)
                self.assertFalse(User.objects.exists())
                self.assertFalse(Address.objects.exists())
