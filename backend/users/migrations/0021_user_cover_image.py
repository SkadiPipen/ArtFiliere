from django.db import migrations, models


class Migration(migrations.Migration):
    dependencies = [('users', '0020_account_settings_and_bir_updates')]
    operations = [migrations.AddField(model_name='user', name='cover_image', field=models.TextField(blank=True, default=''))]
