from django.db import migrations, models


class Migration(migrations.Migration):
    dependencies = [("messaging", "0003_default_agreement_template")]

    operations = [
        migrations.AddField(model_name="agreement", name="license_type", field=models.CharField(default="personal", max_length=30)),
        migrations.AddField(model_name="agreement", name="exclusivity", field=models.CharField(default="non_exclusive", max_length=30)),
        migrations.AddField(model_name="agreement", name="delivery_type", field=models.CharField(default="digital", max_length=30)),
        migrations.AddField(model_name="agreement", name="compensation_type", field=models.CharField(default="one_time", max_length=30)),
    ]
