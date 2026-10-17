from copy import deepcopy
from types import SimpleNamespace
from django.test import SimpleTestCase
from messaging.license_scope import validate_scope, scope_text
from messaging.signing import document_text


class LicenseScopeTests(SimpleTestCase):
    def setUp(self):
        self.scope = {'territory': 'philippines', 'territory_details': '', 'uses': ['merchandise'],
                      'products': 'Printed shirts', 'modifications': 'technical',
                      'sublicensing': 'production_partners', 'credit': 'required',
                      'credit_name': 'Artist', 'duration_months': 12}

    def test_personal_license_cannot_grant_merchandising(self):
        with self.assertRaises(ValueError):
            validate_scope(self.scope, 'personal')

    def test_missing_or_invalid_permissions_are_rejected(self):
        for key, value in [('territory', 'moon'), ('uses', []), ('uses', [{}]),
                           ('duration_months', True), ('duration_months', 1.5),
                           ('products', ''), ('modifications', 'unrestricted')]:
            scope = deepcopy(self.scope)
            scope[key] = value
            with self.subTest(key=key), self.assertRaises(ValueError):
                validate_scope(scope, 'commercial')

    def test_custom_territory_requires_details(self):
        self.scope['territory'] = 'custom'
        with self.assertRaises(ValueError):
            validate_scope(self.scope, 'commercial')

    def test_document_uses_selected_permissions_without_worldwide_grant(self):
        party = SimpleNamespace(first_name='Test', middle_name='', last_name='User', username='test')
        item = SimpleNamespace(artist_presigned_document='', artwork=SimpleNamespace(title='Art'),
            exclusivity='exclusive', license_type='commercial', license_scope=validate_scope(self.scope, 'commercial'),
            artist=party, buyer=party, terms_snapshot='Agreed terms', price='100',
            compensation_terms={}, delivery_type='digital')
        text = document_text(item)
        self.assertIn('Philippines only', text)
        self.assertNotIn('worldwide license', text)
        self.assertIn('Printed shirts', text)
        self.assertIn('No moral-rights waiver', text)
        self.assertIn('statutory resale', text)
        self.assertIn('prior written consent', text)

    def test_legacy_scope_is_not_invented(self):
        self.assertEqual(validate_scope(None, 'personal'), {})
        self.assertEqual(scope_text({}), '')
