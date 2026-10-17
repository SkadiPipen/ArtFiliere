from decimal import Decimal
from types import SimpleNamespace
from django.test import SimpleTestCase
from messaging.pricing import validate_pricing, pricing_summary


class PricingTests(SimpleTestCase):
    def setUp(self):
        self.art = SimpleNamespace(hours=None, hourly_rate=None, price=Decimal('1000'))

    def test_negotiated_multipliers_and_fixed_fee_have_same_total(self):
        pricing = validate_pricing({'mode': 'multipliers', 'license_multiplier': '1.5', 'exclusivity_multiplier': '1.3'}, self.art, Decimal('2145'))
        fixed = validate_pricing({'mode': 'fixed', 'fixed_fee': '1950'}, self.art, Decimal('2145'))
        self.assertEqual(pricing['license_fee'], '1950.00')
        self.assertEqual(pricing['platform_fee'], '195.00')
        self.assertEqual(pricing['checkout_excluding_delivery'], fixed['checkout_excluding_delivery'])
        self.assertIn('license 1.5 x exclusivity 1.3', pricing_summary(pricing))

    def test_low_fixed_fee_is_allowed_but_tampered_total_is_not(self):
        pricing = validate_pricing({'mode': 'fixed', 'fixed_fee': '10'}, self.art, Decimal('11'))
        self.assertEqual(pricing['license_fee'], '10.00')
        with self.assertRaises(ValueError):
            validate_pricing({'mode': 'fixed', 'fixed_fee': '10'}, self.art, Decimal('10'))

    def test_invalid_multipliers_rejected(self):
        for value in ('0', '-1', 'NaN', 'Infinity', '1.001', '101', '', None):
            with self.subTest(value=value), self.assertRaises(ValueError):
                validate_pricing({'mode': 'multipliers', 'license_multiplier': value, 'exclusivity_multiplier': '1'}, self.art, Decimal('1100'))

    def test_rounding_matches_payment_fee_split(self):
        pricing = validate_pricing({'mode': 'fixed', 'fixed_fee': '.05'}, self.art, Decimal('.06'))
        self.assertEqual(pricing['platform_fee'], '0.01')
        self.assertEqual(pricing['license_fee'], '0.05')
