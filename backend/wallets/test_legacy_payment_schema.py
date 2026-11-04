import importlib
from types import SimpleNamespace
from django.db import connection, transaction, IntegrityError
from django.test import TestCase
from blockchain import test_provenance as fixtures

repair = importlib.import_module('wallets.migrations.0014_legacy_payment_entitlement_defaults').set_legacy_defaults


class LegacyPaymentSchemaTests(TestCase):
    setUp = fixtures.ProvenanceTests.setUp
    agreement_for = fixtures.ProvenanceTests.agreement_for
    payment_for = fixtures.ProvenanceTests.payment_for

    def test_fresh_schema_is_unchanged(self):
        repair(None, SimpleNamespace(connection=connection))
        self.assertEqual(self.payment_for(status='pending').status, 'pending')

    def test_legacy_required_columns_do_not_block_checkout_or_lose_history(self):
        old = self.payment_for(status='paid')
        with connection.cursor() as cursor:
            cursor.execute('SET CONSTRAINTS ALL IMMEDIATE')
            cursor.execute("ALTER TABLE wallets_paymentsession ADD COLUMN entitlement_error text NOT NULL DEFAULT 'historical error'")
            cursor.execute("ALTER TABLE wallets_paymentsession ADD COLUMN entitlement_status varchar(30) NOT NULL DEFAULT 'historical status'")
            cursor.execute('ALTER TABLE wallets_paymentsession ALTER COLUMN entitlement_error DROP DEFAULT')
            cursor.execute('ALTER TABLE wallets_paymentsession ALTER COLUMN entitlement_status DROP DEFAULT')
        with self.assertRaises(IntegrityError), transaction.atomic():
            self.payment_for(status='pending')
        repair(None, SimpleNamespace(connection=connection))
        repair(None, SimpleNamespace(connection=connection))  # Idempotent recovery.
        new = self.payment_for(status='pending')
        with connection.cursor() as cursor:
            cursor.execute('SELECT entitlement_error, entitlement_status FROM wallets_paymentsession WHERE id = %s', [old.pk])
            self.assertEqual(cursor.fetchone(), ('historical error', 'historical status'))
            cursor.execute('SELECT entitlement_error, entitlement_status FROM wallets_paymentsession WHERE id = %s', [new.pk])
            self.assertEqual(cursor.fetchone(), ('', ''))
        old.refresh_from_db()
        self.assertEqual(old.status, 'paid')
        self.assertEqual(new.status, 'pending')
