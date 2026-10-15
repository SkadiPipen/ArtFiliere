from datetime import datetime, timedelta
from unittest.mock import patch

from django.test import TestCase
from django.utils import timezone
from rest_framework.test import APIClient
from users.models import User
from .availability import CALENDAR_ZONE, conflicts
from .models import CommissionRequest


class AvailabilityTests(TestCase):
    def setUp(self):
        self.artist = User.objects.create(username='calendar-artist', email='calendar-artist@example.com', firebase_uid='calendar-artist', role='artist', is_accepting_commissions=True)
        self.buyer = User.objects.create(username='calendar-buyer', email='calendar-buyer@example.com', firebase_uid='calendar-buyer', role='buyer')
        day = timezone.now().astimezone(CALENDAR_ZONE).date() + timedelta(days=14)
        self.deadline = datetime.combine(day, datetime.min.time(), tzinfo=CALENDAR_ZONE) + timedelta(hours=17)
        self.booked = CommissionRequest.objects.create(artist=self.artist, buyer=self.buyer, title='Private portrait', deadline=self.deadline, status='IN_PROGRESS', accepted_at=timezone.now())
        self.client = APIClient()

    def call(self, user, path, data):
        self.client.credentials(HTTP_AUTHORIZATION='Bearer token')
        with patch('authentication.services.auth.verify_id_token', return_value={'uid': user.firebase_uid, 'email': user.email}):
            return self.client.post(path, data, format='json')

    def test_public_calendar_is_private_and_uses_manila_days(self):
        result = self.client.get(f'/api/commissions/artists/{self.artist.pk}/availability/')
        self.assertEqual(result.status_code, 200)
        self.assertEqual(result.data['booked_dates'], [self.deadline.date().isoformat()])
        self.assertNotIn(self.buyer.username, str(result.data))
        self.assertNotIn(self.booked.title, str(result.data))
        self.assertTrue(conflicts(self.artist.pk, self.deadline.replace(hour=0)))
        self.assertFalse(conflicts(self.artist.pk, self.deadline + timedelta(days=1)))
        self.booked.status = 'CANCELLED'; self.booked.save()
        self.assertEqual(self.client.get(f'/api/commissions/artists/{self.artist.pk}/availability/').data['booked_dates'], [])

    def test_conflicting_request_is_rejected_before_creation(self):
        response = self.call(self.buyer, '/api/commissions/request/', {
            'artist_id': self.artist.pk, 'subject': 'Portrait', 'style': 'Realism',
            'proposed_budget': '1000', 'deadline': self.deadline.isoformat(),
        })
        self.assertEqual(response.status_code, 409)
        self.assertEqual(CommissionRequest.objects.count(), 1)

    def test_acceptance_reserves_day_and_prevents_second_acceptance(self):
        self.booked.status = 'COMPLETE'; self.booked.save()
        first = CommissionRequest.objects.create(artist=self.artist, buyer=self.buyer, title='First', deadline=self.deadline)
        second = CommissionRequest.objects.create(artist=self.artist, buyer=self.buyer, title='Second', deadline=self.deadline)
        self.assertEqual(self.client.get(f'/api/commissions/artists/{self.artist.pk}/availability/').data['booked_dates'], [])
        self.assertEqual(self.call(self.artist, f'/api/commissions/requests/{first.pk}/manage/', {'action': 'ACCEPT'}).status_code, 200)
        self.assertEqual(self.call(self.artist, f'/api/commissions/requests/{second.pk}/manage/', {'action': 'ACCEPT'}).status_code, 409)
        second.refresh_from_db()
        self.assertEqual(second.status, 'PENDING')
        self.assertEqual(len(self.client.get(f'/api/commissions/artists/{self.artist.pk}/availability/').data['booked_dates']), 1)
