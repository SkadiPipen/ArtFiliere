from types import SimpleNamespace
from django.test import SimpleTestCase
from messaging.copyright_transfer import RIGHTS, validate_transfer, transfer_text
from messaging.signing import document_text


class CopyrightTransferTests(SimpleTestCase):
    def setUp(self):
        self.terms = {'kind': 'partial', 'rights': ['reproduction'], 'effective': 'signed_and_paid',
                      'existing_commitments': 'None', 'artist_reserved_uses': 'Portfolio display only',
                      'additional_terms': 'None', 'acknowledged': True}

    def test_full_transfer_includes_all_economic_rights(self):
        self.terms['kind'] = 'full'
        result = validate_transfer(self.terms)
        self.assertEqual(set(result['rights']), set(RIGHTS))
        self.assertIn('Moral rights are not assigned', transfer_text(result))

    def test_invalid_or_unacknowledged_transfer_is_rejected(self):
        for key, value in [('kind', 'sale'), ('rights', []), ('rights', ['moral_rights']),
                           ('effective', 'now'), ('existing_commitments', ''),
                           ('artist_reserved_uses', ''), ('additional_terms', 123), ('acknowledged', False)]:
            with self.subTest(key=key), self.assertRaises(ValueError):
                validate_transfer({**self.terms, key: value})

    def test_assignment_document_avoids_contradictory_ownership_and_reversion(self):
        party = SimpleNamespace(first_name='Test', middle_name='', last_name='User', username='test')
        item = SimpleNamespace(artist_presigned_document='', artwork=SimpleNamespace(title='Art'),
            exclusivity='exclusive', license_type='personal',
            license_scope={'copyright_transfer': validate_transfer(self.terms), 'territory': 'philippines', 'territory_details': '',
                'uses': ['personal_display'], 'products': '', 'duration_months': 12,
                'modifications': 'none', 'sublicensing': 'none', 'credit': 'required', 'credit_name': ''},
            artist=party, buyer=party, terms_snapshot='Agreed terms', price='100', compensation_terms={}, delivery_type='digital')
        text = document_text(item)
        self.assertIn('ART LICENSING AND COPYRIGHT ASSIGNMENT AGREEMENT', text)
        self.assertIn('settled successfully', text)
        self.assertIn('Portfolio display only', text)
        self.assertNotIn('does not assign copyright ownership', text)
        self.assertNotIn('all rights granted shall immediately cease', text)
        self.assertIn('does not automatically reverse', text)

    def test_no_checkbox_means_no_assignment(self):
        self.assertIsNone(validate_transfer(None))
