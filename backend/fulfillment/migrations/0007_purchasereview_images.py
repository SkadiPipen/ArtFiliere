from django.db import migrations, models

class Migration(migrations.Migration):
    dependencies = [('fulfillment', '0006_purchasereview_commission_and_more')]
    operations = [migrations.AddField(model_name='purchasereview', name='images', field=models.JSONField(default=list, blank=True))]
