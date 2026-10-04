from unittest.mock import patch
from django.test import TestCase
from django.utils import timezone
from rest_framework.test import APIClient
from users.models import User
from wallets.models import IncidentReport, AccountActionRequest
from .models import CommissionRequest, CommissionMessage


class WorkspaceTests(TestCase):
    def setUp(self):
        self.artist = User.objects.create(username='artist-work', email='artist-work@example.com', firebase_uid='artist-work', role='artist', is_accepting_commissions=True)
        self.buyer = User.objects.create(username='buyer-work', email='buyer-work@example.com', firebase_uid='buyer-work', role='buyer')
        self.other = User.objects.create(username='other-work', email='other-work@example.com', firebase_uid='other-work', role='buyer')
        self.mod = User.objects.create(username='support-work', email='support-work@example.com', firebase_uid='support-work', role='customer_support')
        self.commission = CommissionRequest.objects.create(artist=self.artist, buyer=self.buyer, title='Portrait', deadline=timezone.now() + timezone.timedelta(days=7), status='IN_PROGRESS', accepted_at=timezone.now() - timezone.timedelta(days=1))
        report = IncidentReport.objects.create(reporter=self.buyer, reported_user=self.artist, title='Incident', description='Details')
        self.restriction = AccountActionRequest.objects.create(report=report, target=self.artist, initiated_by=self.mod, action='suspension', reason='Incident review', status='approved', reviewed_at=timezone.now(), expires_at=timezone.now()+timezone.timedelta(days=7))
        self.client = APIClient()
        self.client.credentials(HTTP_AUTHORIZATION='Bearer token')

    def call(self, user, path, method='post', data=None):
        with patch('authentication.services.auth.verify_id_token', return_value={'uid': user.firebase_uid, 'email': user.email}):
            return getattr(self.client, method)(path, data or {}, format='json')

    def workspace(self, user, data):
        return self.call(user, f'/api/commissions/workspace/{self.commission.pk}/', data=data)

    def test_suspended_artist_work_is_scoped_and_new_acceptance_is_blocked(self):
        self.assertEqual(self.workspace(self.artist, {'action':'message', 'body':'Sketch ready'}).status_code, 201)
        self.assertEqual(self.workspace(self.artist, {'action':'progress', 'image_url':'https://example.com/sketch.png', 'progress_percentage':33}).status_code, 201)
        self.assertEqual(self.workspace(self.other, {'action':'message', 'body':'Unrelated'}).status_code, 404)
        self.assertEqual(self.workspace(self.buyer, {'action':'progress', 'image_url':'https://example.com/sketch.png', 'progress_percentage':33}).status_code, 400)
        self.assertEqual(self.call(self.artist, '/api/users/conversations/1/messages/', data={'body':'Unrelated'}).status_code, 403)
        pending = CommissionRequest.objects.create(artist=self.artist, buyer=self.buyer, title='Pending', deadline=timezone.now()+timezone.timedelta(days=7))
        self.assertEqual(self.call(self.artist, f'/api/commissions/requests/{pending.pk}/manage/', data={'action':'ACCEPT'}).status_code, 403)
        self.assertEqual(self.call(self.buyer, '/api/commissions/requests/', data={'artist_id':self.artist.pk}).status_code, 409)
        self.assertEqual(self.call(self.artist, f'/api/commissions/workspace/{pending.pk}/', data={'action':'message','body':'New'}).status_code, 403)
        self.commission.status='COMPLETE'; self.commission.save()
        self.assertEqual(self.workspace(self.artist, {'action':'message','body':'Closed'}).status_code, 403)

    def test_ban_requires_staff_approval_and_can_be_revoked(self):
        self.restriction.action='ban'; self.restriction.save()
        self.assertEqual(self.workspace(self.artist, {'action':'message','body':'Hello'}).status_code, 403)
        route=f'/api/commissions/access-reviews/{self.commission.pk}/'
        self.assertEqual(self.call(self.artist, route, data={'approved':True,'note':'Self approval'}).status_code, 403)
        self.assertEqual(self.call(self.buyer, route, data={'approved':True,'note':'Buyer approval'}).status_code, 403)
        self.assertEqual(self.call(self.mod, route, data={'approved':True,'note':'Buyer safety reviewed'}).status_code, 200)
        self.assertEqual(self.workspace(self.artist, {'action':'message','body':'Approved work'}).status_code, 201)
        self.assertEqual(self.call(self.artist, '/api/commissions/workspace/', method='get').status_code, 200)
        self.assertEqual(self.call(self.artist, '/api/cart/', data={}).status_code, 403)
        self.assertEqual(self.call(self.mod, route, data={'approved':False,'note':'Contact no longer safe'}).status_code, 200)
        self.assertEqual(self.workspace(self.artist, {'action':'message','body':'Revoked'}).status_code, 403)
        self.assertEqual(CommissionMessage.objects.count(), 1)

    def test_approval_does_not_extend_to_new_restriction_or_late_acceptance(self):
        self.restriction.action='ban'; self.restriction.save()
        route=f'/api/commissions/access-reviews/{self.commission.pk}/'
        self.assertEqual(self.call(self.mod, route, data={'approved':True,'note':'Reviewed'}).status_code, 200)
        AccountActionRequest.objects.create(report=self.restriction.report, target=self.artist, initiated_by=self.mod, action='ban', reason='New incident', status='approved', reviewed_at=timezone.now())
        self.assertEqual(self.workspace(self.artist, {'action':'message','body':'New restriction'}).status_code, 403)
        self.commission.accepted_at=timezone.now(); self.commission.save()
        self.assertEqual(self.call(self.mod, route, data={'approved':True,'note':'Late acceptance'}).status_code, 400)

    def test_anonymous_mutations_and_unrelated_reads_cannot_bypass_policy(self):
        client = APIClient()
        for path in (f'/api/commissions/workspace/{self.commission.pk}/', f'/api/commissions/requests/{self.commission.pk}/track/', f'/api/commissions/requests/{self.commission.pk}/cancel/'):
            response = client.post(path, {'action':'message', 'body':'Anonymous', 'image_url':'https://example.com/image.png'}, format='json')
            self.assertEqual(response.status_code, 403)
        response = self.call(self.other, f'/api/commissions/workspace/{self.commission.pk}/', method='get')
        self.assertEqual(response.data, [])
        self.assertEqual(self.workspace(self.artist, {'action':'ACCEPT'}).status_code, 400)
