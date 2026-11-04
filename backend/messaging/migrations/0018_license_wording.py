from django.db import migrations, models


class Migration(migrations.Migration):
    dependencies = [('messaging', '0017_royalty_funding')]
    operations = [
        migrations.AddField(model_name='agreementtemplate', name='wording', field=models.JSONField(default=dict, blank=True)),
        migrations.AddField(model_name='agreement', name='wording_snapshot', field=models.JSONField(default=dict, blank=True)),
    ]
