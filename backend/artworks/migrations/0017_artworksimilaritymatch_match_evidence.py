from django.db import migrations, models


class Migration(migrations.Migration):
    dependencies = [('artworks', '0016_simplify_table_names')]
    operations = [migrations.AddField(
        model_name='artworksimilaritymatch', name='match_evidence',
        field=models.JSONField(default=dict, blank=True),
    )]
