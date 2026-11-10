import importlib
from types import SimpleNamespace
from django.db import connection, transaction, IntegrityError
from wallets.models import PaymentSession
from django.test import TestCase
from blockchain import test_provenance as fixtures

historical_repair = importlib.import_module('wallets.migrations.0014_legacy_payment_entitlement_defaults').set_legacy_defaults


def repair(apps, schema_editor):
    # Exercise the historical migration with the table name it saw at that time.
    table = connection.ops.quote_name(PaymentSession._meta.db_table)
    with connection.cursor() as cursor:
        cursor.execute('SET CONSTRAINTS ALL IMMEDIATE')
        cursor.execute(f'ALTER TABLE {table} RENAME TO wallets_paymentsession')
    try:
        historical_repair(apps, schema_editor)
    finally:
        with connection.cursor() as cursor:
            cursor.execute(f'ALTER TABLE wallets_paymentsession RENAME TO {table}')


class LegacyPaymentSchemaTests(TestCase):
    setUp = fixtures.ProvenanceTests.setUp
    agreement_for = fixtures.ProvenanceTests.agreement_for
    payment_for = fixtures.ProvenanceTests.payment_for

    def test_fresh_schema_is_unchanged(self):
        repair(None, SimpleNamespace(connection=connection))
        self.assertEqual(self.payment_for(status='pending').status, 'pending')

    def test_legacy_required_columns_do_not_block_checkout_or_lose_history(self):
        table = connection.ops.quote_name(PaymentSession._meta.db_table)
        old = self.payment_for(status='paid')
        with connection.cursor() as cursor:
            cursor.execute('SET CONSTRAINTS ALL IMMEDIATE')
            cursor.execute(f"ALTER TABLE {table} ADD COLUMN entitlement_error text NOT NULL DEFAULT 'historical error'")
            cursor.execute(f"ALTER TABLE {table} ADD COLUMN entitlement_status varchar(30) NOT NULL DEFAULT 'historical status'")
            cursor.execute(f'ALTER TABLE {table} ALTER COLUMN entitlement_error DROP DEFAULT')
            cursor.execute(f'ALTER TABLE {table} ALTER COLUMN entitlement_status DROP DEFAULT')
        with self.assertRaises(IntegrityError), transaction.atomic():
            self.payment_for(status='pending')
        repair(None, SimpleNamespace(connection=connection))
        repair(None, SimpleNamespace(connection=connection))  # Idempotent recovery.
        new = self.payment_for(status='pending')
        with connection.cursor() as cursor:
            cursor.execute(f'SELECT entitlement_error, entitlement_status FROM {table} WHERE id = %s', [old.pk])
            self.assertEqual(cursor.fetchone(), ('historical error', 'historical status'))
            cursor.execute(f'SELECT entitlement_error, entitlement_status FROM {table} WHERE id = %s', [new.pk])
            self.assertEqual(cursor.fetchone(), ('', ''))
        old.refresh_from_db()
        self.assertEqual(old.status, 'paid')
        self.assertEqual(new.status, 'pending')
