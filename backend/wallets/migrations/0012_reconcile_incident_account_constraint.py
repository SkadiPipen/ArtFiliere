from django.db import migrations, models


def reconcile(apps, schema_editor):
    model = apps.get_model('wallets', 'AccountActionRequest')
    with schema_editor.connection.cursor() as cursor:
        constraints = schema_editor.connection.introspection.get_constraints(cursor, model._meta.db_table)
    if 'one_pending_account_action' in constraints:
        schema_editor.remove_constraint(model, models.UniqueConstraint(fields=['target'], condition=models.Q(status='pending'), name='one_pending_account_action'))
        schema_editor.add_constraint(model, models.UniqueConstraint(fields=['target'], condition=models.Q(status='pending'), name='one_pending_incident_account_action'))


class Migration(migrations.Migration):
    dependencies = [('wallets', '0011_merge_report_and_financial_workflows')]
    operations = [migrations.RunPython(reconcile, migrations.RunPython.noop)]
