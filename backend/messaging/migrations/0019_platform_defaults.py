from django.db import migrations, models
import django.db.models.deletion
from django.conf import settings

class Migration(migrations.Migration):
    dependencies = [('messaging', '0018_license_wording'), migrations.swappable_dependency(settings.AUTH_USER_MODEL)]
    operations = [
        migrations.CreateModel(name='PlatformDefaults', fields=[('id', models.BigAutoField(primary_key=True, serialize=False, auto_created=True, verbose_name='ID')), ('values', models.JSONField(default=dict)), ('revision', models.PositiveIntegerField(default=1)), ('updated_at', models.DateTimeField(auto_now=True)), ('updated_by', models.ForeignKey(null=True, blank=True, on_delete=django.db.models.deletion.SET_NULL, to=settings.AUTH_USER_MODEL))]),
        migrations.AddField(model_name='agreement', name='platform_defaults_snapshot', field=models.JSONField(default=dict, blank=True)),
        migrations.AddField(model_name='royaltyreceipt', name='platform_fee', field=models.DecimalField(max_digits=12, decimal_places=2, default=0)),
    ]
