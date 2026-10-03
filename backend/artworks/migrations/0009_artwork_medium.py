from django.db import migrations, models


class Migration(migrations.Migration):
    dependencies = [
        ("artworks", "0008_merge_20260923_2143"),
    ]

    operations = [
        migrations.AddField(
            model_name="artwork",
            name="medium",
            field=models.CharField(blank=True, default="", max_length=100),
        ),
    ]
