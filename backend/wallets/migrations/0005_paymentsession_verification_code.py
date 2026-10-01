import secrets

from django.db import migrations, models
from wallets.models import sale_verification_code


def populate_codes(apps, schema_editor):
    PaymentSession = apps.get_model("wallets", "PaymentSession")
    for payment in PaymentSession.objects.filter(verification_code__isnull=True):
        payment.verification_code = f"AF-SALE-{secrets.token_hex(6).upper()}"
        payment.save(update_fields=["verification_code"])


class Migration(migrations.Migration):
    dependencies = [("wallets", "0004_paymentsession_is_simulated")]

    operations = [
        migrations.AddField(model_name="paymentsession", name="verification_code", field=models.CharField(blank=True, max_length=24, null=True)),
        migrations.RunPython(populate_codes, migrations.RunPython.noop),
        migrations.AlterField(model_name="paymentsession", name="verification_code", field=models.CharField(default=sale_verification_code, editable=False, max_length=24, unique=True)),
    ]
