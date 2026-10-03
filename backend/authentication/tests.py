from unittest.mock import patch
from django.test import SimpleTestCase
from firebase_admin import auth
from rest_framework.test import APIRequestFactory
from .views import login, me
from wallets.support import SupportView


class TokenVerificationTests(SimpleTestCase):
    def test_certificate_outage_is_a_service_error_for_login_and_private_views(self):
        factory = APIRequestFactory()
        requests = [
            (login, factory.post('/', HTTP_AUTHORIZATION='Bearer test')),
            (me, factory.get('/', HTTP_AUTHORIZATION='Bearer test')),
            (SupportView.as_view(), factory.get('/', HTTP_AUTHORIZATION='Bearer test')),
        ]
        with patch('authentication.services.auth.verify_id_token', side_effect=auth.CertificateFetchError('Certificate download failed', cause=OSError('Connection failed'))):
            for view, request in requests:
                response = view(request)
                self.assertEqual(response.status_code, 503)
                self.assertNotIn('test', str(response.data))

    def test_invalid_token_is_still_rejected(self):
        with patch('authentication.services.auth.verify_id_token', side_effect=auth.InvalidIdTokenError('Invalid signature')):
            response = login(APIRequestFactory().post('/', HTTP_AUTHORIZATION='Bearer test'))
        self.assertEqual(response.status_code, 401)

    def test_clock_and_project_failures_are_distinguished_without_logging_tokens(self):
        for reason, code in [('Token used too early', 'clock_mismatch'), ('incorrect audience claim', 'project_mismatch')]:
            with self.subTest(code=code), patch('authentication.services.auth.verify_id_token', side_effect=auth.InvalidIdTokenError(reason)) as verify:
                with self.assertLogs('authentication.services', level='WARNING') as logs:
                    response = login(APIRequestFactory().post('/', HTTP_AUTHORIZATION='Bearer private-token-value'))
                self.assertEqual(response.status_code, 401)
                self.assertEqual(response.data['code'], code)
                self.assertNotIn('private-token-value', str(logs.output))
                verify.assert_called_once_with('private-token-value', clock_skew_seconds=5)
