from django.db import migrations, models


class Migration(migrations.Migration):
    dependencies = [("blockchain", "0001_initial")]

    operations = [
        migrations.AddField(
            model_name="blockchaintransaction",
            name="entity_id",
            field=models.PositiveBigIntegerField(blank=True, null=True),
        ),
        migrations.AddField(
            model_name="blockchaintransaction",
            name="entity_type",
            field=models.CharField(default="artwork", max_length=30),
        ),
        migrations.AddField(
            model_name="blockchaintransaction",
            name="proof_hash",
            field=models.CharField(blank=True, default="", max_length=64),
        ),
    ]
