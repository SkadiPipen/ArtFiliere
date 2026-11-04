from unittest.mock import patch
from django.test import TestCase
from rest_framework.test import APIClient
from users.models import User, ActivityLog
from artist_applications.models import ArtistApplication


class UserManagementTests(TestCase):
    def setUp(self):
        self.client = APIClient()
        self.users = {}
        for role in ('platform_admin', 'hr', 'driver', 'buyer', 'artist', 'creative_moderator'):
            self.users[role] = User.objects.create(username=role, firebase_uid=role, email=f'{role}@example.com', role=role, first_name='Test', last_name='User')

    def request_as(self, role, method='get', path='/api/users/management/', data=None):
        with patch('users.management.UserManagementView.get_request_user', return_value=self.users.get(role)):
            return getattr(self.client, method)(path, data or {}, format='json')

    def test_admin_scope_and_no_sensitive_fields(self):
        response = self.request_as('platform_admin')
        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.data['count'], 6)
        self.assertNotIn('firebase_uid', response.data['results'][0])
        self.assertNotIn('document_details', response.data['results'][0])
        filtered = self.request_as('platform_admin', path='/api/users/management/?role=driver&q=driver')
        self.assertEqual(filtered.data['count'], 1)

    def test_profiles_are_read_only_for_admin_and_hr(self):
        for actor in ('hr', 'platform_admin'):
            response = self.request_as(actor)
            self.assertTrue(all(not row['can_edit'] for row in response.data['results']))
            for target in self.users.values():
                response = self.request_as(actor, 'patch', f'/api/users/management/{target.pk}/', {'first_name': 'Changed', 'contact_number': '09123456789'})
                self.assertEqual(response.status_code, 405)
                target.refresh_from_db()
                self.assertEqual(target.first_name, 'Test')
                self.assertEqual(target.contact_number, '')
        self.assertFalse(ActivityLog.objects.filter(action='user_profile_updated').exists())

    def test_unauthorized_access_and_pagination(self):
        for role in ('buyer', 'driver', 'creative_moderator', None):
            self.assertEqual(self.request_as(role).status_code, 403)
            self.assertEqual(self.request_as(role, 'patch', f'/api/users/management/{self.users["driver"].pk}/', {'first_name': 'Changed'}).status_code, 405)
        self.assertEqual(self.request_as('platform_admin', path='/api/users/management/?page=no').status_code, 400)
        response = self.request_as('platform_admin', path='/api/users/management/?page=2')
        self.assertEqual(response.data['results'], [])

    def test_admin_self_edit_is_blocked(self):
        admin = self.users['platform_admin']
        response = self.request_as('platform_admin')
        self.assertFalse(next(row for row in response.data['results'] if row['id'] == admin.pk)['can_edit'])
        response = self.request_as('platform_admin', 'patch', f'/api/users/management/{admin.pk}/', {'first_name': 'Changed'})
        self.assertEqual(response.status_code, 405)
        admin.refresh_from_db()
        self.assertEqual(admin.first_name, 'Test')

    def test_deactivated_driver_is_not_listed_as_active(self):
        driver = self.users['driver']
        driver.driver_deactivated = True
        driver.save(update_fields=['driver_deactivated'])
        for actor in ('platform_admin', 'hr'):
            active = self.request_as(actor, path='/api/users/management/?role=driver&status=active')
            self.assertEqual(active.data['count'], 0)
            restricted = self.request_as(actor, path='/api/users/management/?role=driver&status=restricted')
            self.assertEqual(restricted.data['results'][0]['status'], 'deactivated')
