from copy import deepcopy
from decimal import Decimal
from unittest.mock import patch
from django.test import TestCase, override_settings
from users.models import User
from wallets.models import WalletAccount
from wallets.analytics import admin_analytics
from .models import PlatformDefaults, RoyaltyReceipt
from .platform_defaults import DEFAULTS, current_defaults, fee_percent, royalty_split, PlatformDefaultsAdminView
from .pricing import validate_pricing
from .royalty_funding import apply_session, RoyaltyAdminReviewView
from . import test_contracts as contract_fixtures
from . import test_royalty_funding as funding_fixtures

class DefaultsTests(TestCase):
    setUp = contract_fixtures.ContractFlowTests.setUp
    call = contract_fixtures.ContractFlowTests.call
    propose = contract_fixtures.ContractFlowTests.propose

    def test_admin_save_validation_permissions_and_stale_revision(self):
        admin = User.objects.create(username='defaults-admin', firebase_uid='defaults-admin', role='platform_admin')
        values = deepcopy(DEFAULTS)
        values['platform_fee_percentage'] = '20.00'
        response = self.call(PlatformDefaultsAdminView, admin, 'post', {'revision': 0, 'values': values})
        self.assertEqual(response.status_code, 200, response.data)
        self.assertEqual(current_defaults()['platform_fee_percentage'], '20.00')
        self.assertEqual(self.call(PlatformDefaultsAdminView, admin, 'post', {'revision': 0, 'values': values}).status_code, 409)
        values['platform_fee_percentage'] = 'NaN'
        self.assertEqual(self.call(PlatformDefaultsAdminView, admin, 'post', {'revision': response.data['revision'], 'values': values}).status_code, 400)
        self.assertEqual(self.call(PlatformDefaultsAdminView, self.buyer, 'post', {'revision': 0, 'values': DEFAULTS}).status_code, 403)

    def test_new_fee_calculation_and_existing_agreement_snapshot(self):
        from .models import Agreement
        old = Agreement.objects.get(pk=self.propose())
        values = deepcopy(DEFAULTS)
        values['platform_fee_percentage'] = '20.00'
        PlatformDefaults.objects.create(pk=1, values=values)
        self.assertEqual(fee_percent(old), Decimal('10'))
        self.artwork.refresh_from_db()
        pricing = validate_pricing({'mode': 'fixed', 'fixed_fee': '100'}, self.artwork, Decimal('120'))
        self.assertEqual(Decimal(pricing['platform_fee']), Decimal('20'))
        new = Agreement.objects.get(pk=self.propose())
        self.assertEqual(fee_percent(new), Decimal('20'))

@override_settings(XENDIT_SECRET_KEY='test-key', ROYALTY_RETURN_URL='', XENDIT_RETURN_URL='')
class RoyaltyPlatformFeeTests(TestCase):
    setUp = funding_fixtures.RoyaltyFundingTests.setUp
    call = funding_fixtures.RoyaltyFundingTests.call
    submit = funding_fixtures.RoyaltyFundingTests.submit
    start = funding_fixtures.RoyaltyFundingTests.start
    session = funding_fixtures.RoyaltyFundingTests.session

    def policy(self, basis):
        self.agreement.platform_defaults_snapshot = {**DEFAULTS, 'royalty_platform_fee_percentage': '2.00', 'royalty_platform_fee_basis': basis}
        self.agreement.save(update_fields=['platform_defaults_snapshot'])
        self.period.agreement = self.agreement

    def test_artist_royalty_basis_is_added_and_not_deducted(self):
        self.policy('artist_royalty')
        funding = self.start()
        self.assertEqual(funding.amount, Decimal('102.00'))
        apply_session(funding.pk, self.session(funding))
        wallet = WalletAccount.objects.get(user=self.artist)
        self.assertEqual(wallet.pending_balance, Decimal('100.00'))
        result = self.call(RoyaltyAdminReviewView, self.admin, 'post', {'action': 'release', 'note': 'Verified'}, period_id=self.period.pk)
        self.assertEqual(result.status_code, 200, result.data)
        wallet.refresh_from_db()
        self.assertEqual(wallet.available_balance, Decimal('100.00'))
        receipt = RoyaltyReceipt.objects.get(period=self.period)
        self.assertEqual(receipt.platform_fee, Decimal('2.00'))
        self.assertEqual(admin_analytics()['revenue']['royalty_platform_fees'], '2.00')
        # Confirmed payment cannot be credited twice.
        apply_session(funding.pk, self.session(funding))
        wallet.refresh_from_db()
        self.assertEqual(wallet.available_balance, Decimal('100.00'))

    def test_royalty_basis_and_legacy_agreement(self):
        self.policy('artist_royalty')
        self.submit()
        self.period.refresh_from_db()
        self.assertEqual(royalty_split(self.period), (Decimal('100.00'), Decimal('2.00'), Decimal('102.00')))
        self.agreement.platform_defaults_snapshot = {}
        self.agreement.save()
        self.period.agreement = self.agreement
        self.assertEqual(royalty_split(self.period)[1], Decimal('0'))


from commissions import test_lifecycle as commission_fixtures

class CommissionDefaultsTests(TestCase):
    setUp = commission_fixtures.LifecycleTests.setUp
    call = commission_fixtures.LifecycleTests.call
    new = commission_fixtures.LifecycleTests.new
    flow = commission_fixtures.LifecycleTests.flow

    def test_production_fee_is_fixed_at_proposal_even_if_defaults_change(self):
        values = {**deepcopy(DEFAULTS), 'platform_fee_percentage': '20.00'}
        row = PlatformDefaults.objects.create(pk=1, values=values)
        commission = self.new()
        proposal = commission.proposals.get()
        self.assertEqual(Decimal(proposal.terms['platform_fee']), Decimal('183.33'))
        row.values = {**values, 'platform_fee_percentage': '30.00'}
        row.save()
        response = self.flow(self.artist, commission, 'accept', version=1)
        self.assertEqual(response.status_code, 200, response.data)
        commission.refresh_from_db()
        self.assertEqual(commission.platform_fee, Decimal('183.33'))
        self.assertEqual(commission.agreement.platform_defaults_snapshot['platform_fee_percentage'], '20.00')
