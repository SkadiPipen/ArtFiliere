from django.db import migrations, models


class Migration(migrations.Migration):
    dependencies = [("artworks", "0004_artwork_difference_hash_artworksimilaritymatch")]

    operations = [
        migrations.AddField(
            model_name="artworksimilaritymatch",
            name="color_similarity_score",
            field=models.FloatField(default=0),
        ),
    ]
