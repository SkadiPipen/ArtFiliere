from django.db import migrations, models


class Migration(migrations.Migration):
    dependencies = [('messaging', '0014_negotiation_sessions_and_cancellation')]
    operations = [migrations.AddField(model_name='agreement', name='license_scope', field=models.JSONField(default=dict, blank=True))]
