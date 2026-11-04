from django.test import TestCase
from . import test_contracts as fixtures
from .models import Agreement
from .license_wording import resolved_wording, serialized_sections
from .signing import document_text
from .views import AgreementTemplateAdminView
from users.models import User


class LicenseWordingTests(TestCase):
    setUp = fixtures.ContractFlowTests.setUp
    call = fixtures.ContractFlowTests.call
    propose = fixtures.ContractFlowTests.propose

    def test_edits_apply_to_new_agreements_and_do_not_change_existing_ones(self):
        first = Agreement.objects.get(pk=self.propose())
        before = document_text(first)
        template = first.template
        template.wording = {'portfolio': 'Portfolio display requires the agreed attribution.'}
        template.save()
        first.refresh_from_db()
        self.assertEqual(document_text(first), before)
        second = Agreement.objects.get(pk=self.propose())
        self.assertIn('Portfolio display requires the agreed attribution.', document_text(second))
        self.assertIn('Personal use. Digital delivery. No revisions.', document_text(second))
        self.assertIn('PHP 75.50', document_text(second))

    def test_section_editor_saves_and_rejects_incomplete_sections(self):
        agreement = Agreement.objects.get(pk=self.propose())
        admin = User.objects.create(username='wording-admin', firebase_uid='wording-admin', role='platform_admin')
        template = agreement.template
        sections = resolved_wording(template)
        sections['digital_delivery'] = 'Digital delivery uses the agreed platform channel.'
        response = self.call(AgreementTemplateAdminView, admin, 'post', {'id': template.pk, 'sections': sections})
        self.assertEqual(response.status_code, 200)
        template.refresh_from_db()
        self.assertEqual(template.wording['digital_delivery'], sections['digital_delivery'])
        self.assertEqual(len(serialized_sections(template)), len(sections))
        response = self.call(AgreementTemplateAdminView, admin, 'post', {'id': template.pk, 'sections': {'portfolio': 'Missing other sections'}})
        self.assertEqual(response.status_code, 400)
        sections['personal_grant'] = 'Missing selected exclusivity'
        self.assertEqual(self.call(AgreementTemplateAdminView, admin, 'post', {'id': template.pk, 'sections': sections}).status_code, 400)
        self.assertEqual(self.call(AgreementTemplateAdminView, self.buyer, 'post', {'id': template.pk, 'sections': sections}).status_code, 403)


from commissions import test_lifecycle as commission_fixtures
from .models import AgreementTemplate


class CommissionWordingTests(TestCase):
    setUp = commission_fixtures.LifecycleTests.setUp
    call = commission_fixtures.LifecycleTests.call
    new = commission_fixtures.LifecycleTests.new
    flow = commission_fixtures.LifecycleTests.flow

    def test_commission_acceptance_records_edited_clauses_and_keeps_them(self):
        template, _ = AgreementTemplate.objects.get_or_create(name='Commission milestone agreement', defaults={'body': 'Commission milestone agreement'})
        template.wording = {'commission_revisions': 'A consolidated revision request must identify the requested changes.'}
        template.save()
        commission = self.new()
        response = self.flow(self.artist, commission, 'accept', version=1)
        self.assertEqual(response.status_code, 200, response.data)
        commission.refresh_from_db()
        agreement = commission.agreement
        self.assertIn(template.wording['commission_revisions'], agreement.document_snapshot)
        original = agreement.document_snapshot
        template.wording = {'commission_revisions': 'Changed after acceptance'}
        template.save()
        agreement.refresh_from_db()
        self.assertEqual(agreement.document_snapshot, original)
