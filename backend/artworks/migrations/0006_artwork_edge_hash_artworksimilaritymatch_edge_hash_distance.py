from django.db import migrations, models


class Migration(migrations.Migration):
    dependencies = [("artworks", "0005_artworksimilaritymatch_color_similarity_score")]

    operations = [
        migrations.AddField(
            model_name="artwork",
            name="edge_hash",
            field=models.CharField(blank=True, help_text="Edge-only perceptual hash used to detect recoloured copies.", max_length=64, null=True),
        ),
        migrations.AddField(
            model_name="artworksimilaritymatch",
            name="edge_hash_distance",
            field=models.PositiveSmallIntegerField(default=64),
        ),
    ]
