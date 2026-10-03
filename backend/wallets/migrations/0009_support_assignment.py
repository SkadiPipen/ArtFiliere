from django.db import migrations, models
import django.db.models.deletion


class Migration(migrations.Migration):
    dependencies = [('wallets', '0008_delete_driverapplication')]
    operations = [
        migrations.AddField(model_name='supportticket', name='assigned_to', field=models.ForeignKey(null=True, blank=True, on_delete=django.db.models.deletion.PROTECT, related_name='assigned_support_tickets', to='users.user')),
        migrations.AddField(model_name='supportticket', name='transfer_to', field=models.ForeignKey(null=True, blank=True, on_delete=django.db.models.deletion.SET_NULL, related_name='incoming_support_transfers', to='users.user')),
    ]
