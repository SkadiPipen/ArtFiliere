from django.db import migrations, models


class Migration(migrations.Migration):
    dependencies = [('messaging', '0015_agreement_license_scope')]
    operations = [migrations.AddField(model_name='agreement', name='pricing_terms', field=models.JSONField(default=dict, blank=True))]
