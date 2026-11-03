from unittest.mock import patch

from django.test import TestCase
from rest_framework.test import APIRequestFactory

from users.models import User
from .views import login


class LoginProfileTests(TestCase):
    def submit(self):
        request = APIRequestFactory().post('/auth/login/', HTTP_AUTHORIZATION='Bearer token')
        with patch('authentication.views.verify_token', return_value={'uid': 'staff-uid', 'email': 'staff@example.com'}):
            return login(request)

    def test_missing_profile_does_not_create_incomplete_account(self):
        User.objects.create(username='', email='existing@example.com', firebase_uid='existing')
        response = self.submit()
        self.assertEqual(response.status_code, 404)
        self.assertEqual(response.data['code'], 'profile_not_found')
        self.assertEqual(User.objects.count(), 1)

    def test_provisioned_staff_keeps_role_when_linking_firebase(self):
        user = User.objects.create(username='staff', email='staff@example.com', role='customer_support')
        response = self.submit()
        self.assertEqual(response.status_code, 200)
        user.refresh_from_db()
        self.assertEqual(user.firebase_uid, 'staff-uid')
        self.assertEqual(response.data['role'], 'customer_support')
