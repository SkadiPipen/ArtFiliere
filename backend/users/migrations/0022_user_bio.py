from django.db import migrations, models

class Migration(migrations.Migration):
    dependencies = [('users', '0021_user_cover_image')]
    operations = [migrations.AddField(model_name='user', name='bio', field=models.TextField(blank=True, null=True, default=None, max_length=2000))]
