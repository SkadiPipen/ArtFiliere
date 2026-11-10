from django.db import migrations, models
import django.db.models.deletion


class Migration(migrations.Migration):
    dependencies = [('blockchain', '0004_provenanceevent_previous_attempts_and_more'),
                    ('wallets', '0014_legacy_payment_entitlement_defaults'),
                    ('messaging', '0018_license_wording')]
    operations = [migrations.CreateModel(name='SaleTermsSnapshot', fields=[
        ('id', models.BigAutoField(auto_created=True, primary_key=True, serialize=False, verbose_name='ID')),
        ('terms', models.JSONField(default=dict)),
        ('document_hash', models.CharField(blank=True, max_length=64)),
        ('source', models.CharField(max_length=20)),
        ('created_at', models.DateTimeField(auto_now_add=True)),
        ('agreement', models.ForeignKey(null=True, on_delete=django.db.models.deletion.PROTECT, to='messaging.agreement')),
        ('payment', models.OneToOneField(on_delete=django.db.models.deletion.PROTECT, related_name='sale_terms_snapshot', to='wallets.paymentsession')),
    ])]
