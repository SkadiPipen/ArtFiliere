from django.db import migrations, models


class Migration(migrations.Migration):
    dependencies = [('artworks', '0013_artwork_categories')]
    operations = [
        migrations.AddField(model_name='artwork', name='ai_screening', field=models.JSONField(blank=True, default=dict)),
        migrations.AddField(model_name='artwork', name='automated_block_reason', field=models.CharField(blank=True, default='', max_length=30)),
        migrations.AlterField(model_name='artworksimilaritymatch', name='review_status', field=models.CharField(choices=[('pending', 'Pending review'), ('confirmed_copy', 'Confirmed copy'), ('not_a_copy', 'Not a copy'), ('auto_blocked', 'Automatically blocked similarity')], default='pending', max_length=20)),
    ]
