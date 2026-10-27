from django.db import migrations, models


def backfill(apps, schema_editor):
    Artwork = apps.get_model('artworks', 'Artwork')
    # Frozen, exact matches only; preserve ambiguous historical labels unchanged.
    groups = {
        'painting': ['painting', 'paintings', 'oil painting', 'watercolor', 'watercolour', 'oil on canvas', 'acrylic', 'acrylic painting'],
        'drawing': ['drawing', 'drawings', 'sketch', 'sketches', 'pencil drawing', 'charcoal drawing', 'ink drawing'],
        'photography': ['photography', 'photograph', 'photographs', 'photo', 'photos'],
        'print': ['print', 'prints', 'printmaking', 'etching', 'engraving', 'screenprint', 'woodcut'],
        'sculpture': ['sculpture', 'sculptures', 'statue', 'bust', 'relief sculpture'],
        'illustration': ['illustration', 'illustrations', 'book illustration', 'editorial illustration'],
        'collage': ['collage', 'collages', 'paper collage'],
        'mixed_media': ['mixed media', 'mixed media work', 'mixed media works'],
        'digital_art': ['digital art', 'digital artwork', 'computer art', 'digital painting'],
        'graphic_design': ['graphic design', 'graphic designs', 'poster design', 'typography'],
        'textile_art': ['textile art', 'textile', 'textiles', 'fiber art', 'fibre art', 'tapestry', 'embroidery'],
        'ceramic_art': ['ceramic art', 'ceramics', 'ceramic', 'pottery'],
    }
    aliases = {term: key for key, terms in groups.items() for term in terms}
    for artwork in Artwork.objects.using(schema_editor.connection.alias).all().iterator():
        key = aliases.get(artwork.category.strip().lower().replace('_', ' ').replace('-', ' '))
        if key:
            Artwork.objects.using(schema_editor.connection.alias).filter(pk=artwork.pk).update(categories=[key])


class Migration(migrations.Migration):
    dependencies = [('artworks', '0012_remove_artwork_medium')]
    operations = [
        migrations.AddField(model_name='artwork', name='categories', field=models.JSONField(default=list, blank=True)),
        migrations.RunPython(backfill, migrations.RunPython.noop),
    ]
