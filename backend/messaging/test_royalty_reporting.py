import base64
from datetime import date, datetime, timezone as tz
from decimal import Decimal
from io import BytesIO
from unittest.mock import patch
from PIL import Image
from django.test import TestCase, SimpleTestCase, override_settings
from rest_framework.test import APIRequestFactory
from users.models import User
from artworks.models import Artwork
from wallets.models import WalletAccount
from .models import Agreement, AgreementTemplate, Conversation, RoyaltyPeriod, RoyaltyMandate, RoyaltyReceipt
from .royalty_rules import calculate, validate_rules
from .royalties import add_months, ensure_periods, RoyaltyReportsView, RoyaltyEvidenceView
from .royalty_payments import collect, reconcile, RoyaltyMandateView, royalty_payment_webhook
from .contracts import proposal_changes


class CalculationTests(SimpleTestCase):
    def test_rates_deductions_losses_and_rounding(self):
        for terms, metrics, amount in [
            ({'subtype': 'per_unit', 'rate': '2.50'}, {'units': '12'}, '30.00'),
            ({'subtype': 'gross_sales', 'rate': '3.33'}, {'gross_sales': '100.50'}, '3.35'),
            ({'subtype': 'net_sales', 'rate': '10'}, {'gross_sales': '1000', 'deductions': '200'}, '80.00'),
            ({'subtype': 'profit_based', 'rate': '10'}, {'gross_sales': '1000', 'deductions': '100', 'costs': '600'}, '30.00'),
            ({'subtype': 'upfront_profit_based', 'rate': '10'}, {'gross_sales': '100', 'deductions': '0', 'costs': '200'}, '0.00'),
        ]:
            self.assertEqual(calculate(terms, metrics)[1], Decimal(amount))

    def test_graduated_tiers_and_per_period_guarantee(self):
        rules = validate_rules({'calculation': {'basis': 'gross_sales', 'tiers': [{'from': '0', 'rate': '5'}, {'from': '1000', 'rate': '10'}]}}, 'tiered')
        self.assertEqual(calculate({'subtype': 'tiered', 'calculation': rules}, {'gross_sales': '1500'})[1], Decimal('100'))
        for sales, expected in [('0', '100'), ('1500', '150')]:
            terms = {'subtype': 'minimum_guaranteed', 'minimum_guarantee': '100', 'calculation': {'basis': 'gross_sales', 'rate': '10'}}
            self.assertEqual(calculate(terms, {'gross_sales': sales})[1], Decimal(expected))

    def test_invalid_figures_and_rules(self):
        for value in ['NaN', '-1', '1.001', None, 'Infinity', '1.5']:
            with self.assertRaises(ValueError):
                calculate({'subtype': 'per_unit', 'rate': '2'}, {'units': value})
        with self.assertRaises(ValueError):
            validate_rules({'calculation': {'basis': 'gross_sales', 'tiers': [{'from': '100', 'rate': '5'}]}}, 'tiered')

    def test_month_end_anchor(self):
        self.assertEqual(add_months(date(2026, 1, 31), 1), date(2026, 2, 28))
        self.assertEqual(add_months(date(2026, 1, 31), 2), date(2026, 3, 31))


class ReportingTests(TestCase):
    def setUp(self):
        self.factory = APIRequestFactory()
        self.buyer = User.objects.create(username='buyer', firebase_uid='buyer', email='buyer@test.com')
        self.artist = User.objects.create(username='artist', firebase_uid='artist', email='artist@test.com', role='artist')
        self.outsider = User.objects.create(username='other', firebase_uid='other', email='other@test.com')
        art = Artwork.objects.create(artist=self.artist, title='Original', price=100)
        template = AgreementTemplate.objects.create(name='Reporting', body='Terms')
        self.agreement = Agreement.objects.create(conversation=Conversation.objects.create(artwork=art), artwork=art,
            template=template, buyer=self.buyer, artist=self.artist, price=100, terms_snapshot='Signed terms',
            status='accepted', compensation_type='royalty', license_type='commercial',
            artist_signed_at=datetime(2026, 1, 31, tzinfo=tz.utc), buyer_signed_at=datetime(2026, 1, 31, tzinfo=tz.utc),
            compensation_terms={'subtype': 'gross_sales', 'rate': '10', 'reporting_frequency': 'monthly',
                'reporting_duration_months': 2, 'reporting_policy': 'signing_date_plus_7_days_artist_approval'})
        ensure_periods(self.agreement, date(2026, 4, 1))
        self.period = self.agreement.royalty_periods.order_by('starts_on').first()
        image = BytesIO(); Image.new('RGB', (2, 2)).save(image, 'PNG')
        self.evidence = [{'name': 'sales.png', 'data': 'data:image/png;base64,' + base64.b64encode(image.getvalue()).decode()}]

    def call(self, view, user, method='get', data=None, **kwargs):
        request = getattr(self.factory, method)('/', data or {}, format='json')
        with patch.object(view, 'get_request_user', return_value=user):
            return view.as_view()(request, **kwargs)

    def submit(self):
        return self.call(RoyaltyReportsView, self.buyer, 'post', {'metrics': {'gross_sales': '1000'}, 'evidence': self.evidence}, period_id=self.period.pk)

    def test_periods_are_finite_idempotent_and_not_generated_for_legacy(self):
        ensure_periods(self.agreement, date(2027, 1, 1))
        self.assertEqual(self.agreement.royalty_periods.count(), 2)
        self.assertEqual(self.period.ends_on, date(2026, 2, 28))
        self.assertEqual(self.period.due_on, date(2026, 3, 7))
        self.agreement.compensation_terms.pop('reporting_policy')
        self.agreement.royalty_periods.all().delete()
        ensure_periods(self.agreement)
        self.assertFalse(self.agreement.royalty_periods.exists())

    def test_submission_evidence_permissions_review_and_corrections(self):
        self.assertEqual(self.call(RoyaltyReportsView, self.artist, 'post', {}, period_id=self.period.pk).status_code, 404)
        self.assertEqual(self.call(RoyaltyReportsView, self.buyer, 'post', {'metrics': {'gross_sales': '1000'}}, period_id=self.period.pk).status_code, 400)
        self.assertEqual(self.submit().status_code, 200)
        self.period.refresh_from_db(); self.assertEqual(self.period.amount, 100)
        self.assertEqual(self.call(RoyaltyEvidenceView, self.outsider, period_id=self.period.pk, index=0).status_code, 404)
        self.assertEqual(self.call(RoyaltyEvidenceView, self.artist, period_id=self.period.pk, index=0).status_code, 200)
        self.assertEqual(self.call(RoyaltyReportsView, self.buyer, 'patch', {'action': 'approve'}, period_id=self.period.pk).status_code, 404)
        self.assertEqual(self.call(RoyaltyReportsView, self.artist, 'patch', {'action': 'reject', 'note': 'Need receipts'}, period_id=self.period.pk).status_code, 200)
        self.assertEqual(self.submit().status_code, 200)
        self.assertEqual(self.call(RoyaltyReportsView, self.artist, 'patch', {'action': 'approve'}, period_id=self.period.pk).status_code, 200)
        self.assertEqual(self.submit().status_code, 409)
        self.period.refresh_from_db(); self.assertEqual(len(self.period.history), 4)

    @override_settings(ROYALTY_COLLECTION_ENABLED=True)
    def test_collection_requires_approval_mandate_and_never_retries_ambiguous_request(self):
        with patch('messaging.royalty_payments.provider') as provider:
            collect(self.period.pk); provider.assert_not_called()
            self.submit()
            self.call(RoyaltyReportsView, self.artist, 'patch', {'action': 'approve'}, period_id=self.period.pk)
            collect(self.period.pk); provider.assert_not_called()
            RoyaltyMandate.objects.create(agreement=self.agreement, reference='mandate-test', token_id='pt-test', status='active')
            import requests
            provider.side_effect = requests.Timeout()
            collect(self.period.pk); collect(self.period.pk)
            self.assertEqual(provider.call_count, 1)
            self.period.refresh_from_db(); self.assertEqual(self.period.status, 'collecting')
            self.assertFalse(RoyaltyReceipt.objects.exists())

    def test_verified_receipt_credits_wallet_once_and_rejects_wrong_amount(self):
        self.period.amount, self.period.status, self.period.provider_request_id = 100, 'collecting', 'pr-test'
        self.period.save()
        data = {'reference_id': f'af-royalty-{self.period.pk}', 'currency': 'PHP', 'request_amount': 100,
                'payment_request_id': 'pr-test', 'status': 'SUCCEEDED', 'latest_payment_id': 'py-test'}
        with self.assertRaises(ValueError):
            reconcile(self.period.pk, {**data, 'request_amount': 101})
        reconcile(self.period.pk, data); reconcile(self.period.pk, data)
        self.assertEqual(RoyaltyReceipt.objects.count(), 1)
        self.assertEqual(WalletAccount.objects.get(user=self.artist).available_balance, 100)

    def test_revocation_and_webhook_authentication(self):
        mandate = RoyaltyMandate.objects.create(agreement=self.agreement, reference='mandate', token_id='pt-test', status='active')
        self.assertEqual(self.call(RoyaltyMandateView, self.artist, 'post', {'action': 'revoke'}, agreement_id=self.agreement.pk).status_code, 409)
        self.assertEqual(self.call(RoyaltyMandateView, self.buyer, 'post', {'action': 'revoke'}, agreement_id=self.agreement.pk).status_code, 200)
        mandate.refresh_from_db(); self.assertEqual(mandate.status, 'revoked')
        response = royalty_payment_webhook(self.factory.post('/', {'data': {}}, format='json'))
        self.assertEqual(response.status_code, 403)

    @override_settings(ROYALTY_COLLECTION_ENABLED=True, ROYALTY_PAYMENT_CHANNELS=['APPROVED_CHANNEL'], ROYALTY_RETURN_URL='https://example.com/royalty-reports')
    def test_mandate_requires_explicit_consent_and_verified_session(self):
        with patch('messaging.royalty_payments.provider') as provider:
            result = self.call(RoyaltyMandateView, self.buyer, 'post', {'action': 'link'}, agreement_id=self.agreement.pk)
            self.assertEqual(result.status_code, 400); provider.assert_not_called()
            provider.return_value = {'payment_session_id': 'ps-test', 'payment_link_url': 'https://checkout.xendit.co/test'}
            result = self.call(RoyaltyMandateView, self.buyer, 'post', {'action': 'link', 'consent': True}, agreement_id=self.agreement.pk)
            self.assertEqual(result.status_code, 200)
            mandate = RoyaltyMandate.objects.get(agreement=self.agreement)
            self.assertEqual(mandate.token_id, '')
            verified = {'payment_session_id': 'ps-test', 'reference_id': mandate.reference, 'session_type': 'SAVE', 'currency': 'PHP', 'status': 'COMPLETED', 'payment_token_id': 'pt-verified'}
            provider.return_value = {**verified, 'reference_id': 'someone-else'}
            result = self.call(RoyaltyMandateView, self.buyer, 'post', {'action': 'refresh', 'payment_token_id': 'pt-client'}, agreement_id=self.agreement.pk)
            self.assertEqual(result.status_code, 409)
            provider.return_value = verified
            result = self.call(RoyaltyMandateView, self.buyer, 'post', {'action': 'refresh'}, agreement_id=self.agreement.pk)
            self.assertEqual(result.status_code, 200)
            mandate.refresh_from_db(); self.assertEqual(mandate.token_id, 'pt-verified')

    @override_settings(ROYALTY_COLLECTION_ENABLED=True)
    def test_zero_report_requires_approval_and_revoked_mandate_cannot_collect(self):
        result = self.call(RoyaltyReportsView, self.buyer, 'post', {'metrics': {'gross_sales': '0'}, 'evidence': self.evidence}, period_id=self.period.pk)
        self.assertEqual(result.status_code, 200)
        self.period.refresh_from_db(); self.assertEqual(self.period.status, 'submitted')
        self.call(RoyaltyReportsView, self.artist, 'patch', {'action': 'approve'}, period_id=self.period.pk)
        self.period.refresh_from_db(); self.assertEqual(self.period.status, 'zero_due')
        self.period.status, self.period.amount, self.period.approved_at = 'approved', 100, datetime(2026, 3, 1, tzinfo=tz.utc)
        self.period.save()
        RoyaltyMandate.objects.create(agreement=self.agreement, reference='revoked', token_id='pt-test', status='revoked')
        with patch('messaging.royalty_payments.provider') as provider:
            collect(self.period.pk)
            provider.assert_not_called()

    def test_missing_report_stays_overdue_and_private(self):
        result = self.call(RoyaltyReportsView, self.buyer)
        self.assertTrue(result.data['periods'][0]['overdue'])
        self.assertEqual(result.data['periods'][0]['status'], 'awaiting_report')
        self.assertIsNone(result.data['periods'][0]['amount'])
        self.assertEqual(self.call(RoyaltyReportsView, self.outsider).data['periods'], [])

    def test_revision_diff_is_persisted_and_scoped(self):
        revision = Agreement.objects.get(pk=self.agreement.pk)
        revision.pk = None; revision.verification_code = 'NEW'; revision.price = 120; revision.revision_of = self.agreement
        revision.save()
        self.assertEqual(proposal_changes(revision), [{'field': 'price', 'label': 'Checkout total', 'before': '100', 'after': '120'}])
