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

    def test_base_price_floor_and_exact_boundary(self):
        pricing = validate_pricing({'mode': 'fixed', 'fixed_fee': '1000'}, self.art, Decimal('1100'))
        self.assertEqual(pricing['license_fee'], '1000.00')
        at_base = validate_pricing({'mode': 'fixed', 'fixed_fee': '909.09'}, self.art, Decimal('1000'))
        self.assertEqual(at_base['checkout_excluding_delivery'], '1000.00')
        for raw, total in [({'mode': 'fixed', 'fixed_fee': '900'}, '990'),
                           ({'mode': 'multipliers', 'license_multiplier': '.9', 'exclusivity_multiplier': '1'}, '990')]:
            with self.subTest(raw=raw), self.assertRaisesRegex(ValueError, 'base price'):
                validate_pricing(raw, self.art, Decimal(total))
        with self.assertRaises(ValueError):
            validate_pricing({'mode': 'fixed', 'fixed_fee': '1000'}, self.art, Decimal('1000'))

    def test_invalid_multipliers_rejected(self):
        for value in ('0', '-1', 'NaN', 'Infinity', '1.001', '101', '', None):
            with self.subTest(value=value), self.assertRaises(ValueError):
                validate_pricing({'mode': 'multipliers', 'license_multiplier': value, 'exclusivity_multiplier': '1'}, self.art, Decimal('1100'))

    def test_rounding_matches_payment_fee_split(self):
        self.art.price = Decimal('.05')
        pricing = validate_pricing({'mode': 'fixed', 'fixed_fee': '.05'}, self.art, Decimal('.06'))
        self.assertEqual(pricing['platform_fee'], '0.01')
        self.assertEqual(pricing['license_fee'], '0.05')
