import secrets

from django.db import migrations, models
from messaging.models import agreement_verification_code


def populate_codes(apps, schema_editor):
    Agreement = apps.get_model("messaging", "Agreement")
    for agreement in Agreement.objects.filter(verification_code__isnull=True):
        agreement.verification_code = f"AF-AGR-{secrets.token_hex(6).upper()}"
        agreement.save(update_fields=["verification_code"])


class Migration(migrations.Migration):
    dependencies = [("messaging", "0007_agreement_delivery_details_agreement_delivery_fee")]

    operations = [
        migrations.AddField(model_name="agreement", name="verification_code", field=models.CharField(blank=True, max_length=24, null=True)),
        migrations.RunPython(populate_codes, migrations.RunPython.noop),
        migrations.AlterField(model_name="agreement", name="verification_code", field=models.CharField(default=agreement_verification_code, editable=False, max_length=24, unique=True)),
    ]
