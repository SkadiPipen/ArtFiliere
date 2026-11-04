from django.test import SimpleTestCase
from .checkout_errors import checkout_error
from .checkout_customer import checkout_customer
from types import SimpleNamespace


class CheckoutErrorTests(SimpleTestCase):
    def test_external_account_without_names_has_valid_checkout_label(self):
        buyer = SimpleNamespace(first_name='', last_name='', username='')
        self.assertEqual(checkout_customer(buyer)['individual_detail'], {'given_names': 'Buyer'})

    def test_checkout_names_are_trimmed_and_empty_surname_omitted(self):
        buyer = SimpleNamespace(first_name='  Ana  ', last_name='  ', username='handle')
        self.assertEqual(checkout_customer(buyer)['individual_detail'], {'given_names': 'Ana'})
        buyer.last_name = ' Cruz '
        self.assertEqual(checkout_customer(buyer)['individual_detail']['surname'], 'Cruz')

    def test_validation_is_distinguished_from_account_configuration(self):
        code, message = checkout_error(400, {'error_code': 'API_VALIDATION_ERROR'})
        self.assertEqual(code, 'API_VALIDATION_ERROR')
        self.assertIn('request fields', message)

    def test_channel_configuration_has_actionable_message(self):
        self.assertIn('PHP payment channels', checkout_error(400, {'error_code': 'INVALID_PAYMENT_CHANNEL'})[1])

    def test_untrusted_payload_is_not_disclosed(self):
        for body in (None, [], {'message': 'secret-value'}, {'error_code': 'secret-value'}):
            code, message = checkout_error(502, body)
            self.assertEqual(code, 'UNKNOWN_ERROR')
            self.assertNotIn('secret-value', message)

    def test_permissions_and_rate_limit(self):
        self.assertIn('permissions', checkout_error(403, {})[1])
        self.assertIn('too many requests', checkout_error(429, {})[1])
