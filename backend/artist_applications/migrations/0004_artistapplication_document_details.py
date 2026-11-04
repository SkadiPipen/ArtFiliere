from django.db import migrations, models


class Migration(migrations.Migration):
    dependencies = [('artist_applications', '0003_account_settings_and_bir_updates')]
    operations = [migrations.AddField(model_name='artistapplication', name='document_details', field=models.JSONField(blank=True, default=dict))]
