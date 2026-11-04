"""Allow current inserts on databases retaining the former entitlement columns.

Keep historical values and constraints intact. Empty defaults mean no legacy
status/error supplied; current provenance has its own durable event status.
Fresh databases have neither column and need no schema change.
"""
from django.db import migrations


def set_legacy_defaults(apps, schema_editor):
    connection = schema_editor.connection
    if connection.vendor != 'postgresql':
        return
    with connection.cursor() as cursor:
        cursor.execute("""SELECT column_name FROM information_schema.columns
            WHERE table_schema = current_schema() AND table_name = 'wallets_paymentsession'
            AND column_name IN ('entitlement_error', 'entitlement_status')
            AND data_type IN ('text', 'character varying') AND column_default IS NULL""")
        for (name,) in cursor.fetchall():
            cursor.execute('ALTER TABLE wallets_paymentsession ALTER COLUMN '
                           + connection.ops.quote_name(name) + " SET DEFAULT ''")


class Migration(migrations.Migration):
    dependencies = [('wallets', '0013_merge_20261004_0934')]
    operations = [migrations.RunPython(set_legacy_defaults, migrations.RunPython.noop)]
