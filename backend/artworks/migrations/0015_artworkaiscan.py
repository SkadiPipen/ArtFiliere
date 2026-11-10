from django.db import migrations, models


class Migration(migrations.Migration):
    dependencies = [('artworks', '0014_artwork_screening')]
    operations = [migrations.CreateModel(name='ArtworkAIScan', fields=[
        ('cache_key', models.CharField(max_length=64, primary_key=True, serialize=False)),
        ('state', models.CharField(default='new', max_length=16)),
        ('job_id', models.CharField(blank=True, default='', max_length=64)),
        ('result', models.JSONField(blank=True, default=dict)),
        ('lease_until', models.DateTimeField(blank=True, null=True)),
        ('expires_at', models.DateTimeField(blank=True, null=True)),
        ('created_at', models.DateTimeField(auto_now_add=True)),
        ('updated_at', models.DateTimeField(auto_now=True)),
    ])]
