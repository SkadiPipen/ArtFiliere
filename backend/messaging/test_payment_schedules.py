from copy import deepcopy
from types import SimpleNamespace
from django.test import SimpleTestCase
from .compensation import validate_compensation, validate_schedule_total, compensation_summary


class PaymentScheduleTests(SimpleTestCase):
    def data(self, subtype='milestone_payments'):
        return {'compensation_type': 'one_time', 'compensation_terms': {
            'subtype': subtype, 'entries': [
                {'name': 'Sketch', 'amount': '40.25', 'due_date': '2026-12-01', 'acceptance': 'Buyer approves sketch'},
                {'name': 'Final file', 'amount': '59.75', 'due_date': '2026-12-15', 'acceptance': 'Deliver approved PNG'},
            ]}}

    def validate(self, data):
        return validate_compensation(data, SimpleNamespace(royalty_enabled=False), 'commercial')

    def test_all_schedule_types_validate_and_render(self):
        for subtype in ('milestone_payments', 'installment_payments', 'per_deliverable_fee'):
            with self.subTest(subtype=subtype):
                values = self.validate(self.data(subtype))
                validate_schedule_total(values, '100.00')
                summary = compensation_summary('one_time', values)
                self.assertIn('Sketch | PHP 40.25 | Due: 2026-12-01', summary)
                self.assertIn('Buyer approves sketch', summary)
                with self.assertRaises(ValueError):
                    validate_schedule_total(values, '100.01')

    def test_invalid_rows_are_rejected(self):
        for field, value in [('name', ''), ('amount', '0'), ('amount', 'NaN'),
                             ('amount', '1.001'), ('due_date', '2026-02-30'), ('acceptance', '')]:
            with self.subTest(field=field, value=value):
                data = deepcopy(self.data())
                data['compensation_terms']['entries'][0][field] = value
                with self.assertRaises(ValueError):
                    self.validate(data)
        for entries in ([], None, [{}] * 21):
            data = self.data()
            data['compensation_terms']['entries'] = entries
            with self.assertRaises(ValueError):
                self.validate(data)

    def test_installments_do_not_require_acceptance(self):
        data = self.data('installment_payments')
        for entry in data['compensation_terms']['entries']:
            entry['acceptance'] = ''
        self.assertEqual(len(self.validate(data)['entries']), 2)
