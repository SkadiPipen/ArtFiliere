from django.db import migrations, models


class Migration(migrations.Migration):
    dependencies = [('artworks', '0017_artworksimilaritymatch_match_evidence')]
    operations = [
        migrations.AddField(model_name='artwork', name='physical_format', field=models.CharField(
            choices=[('original', 'Original artwork'), ('print', 'Print / reproduction'), ('limited_edition', 'Limited-edition print')], default='original', max_length=20)),
        migrations.AddField(model_name='artwork', name='stock_quantity', field=models.PositiveIntegerField(default=1)),
        migrations.AddField(model_name='artwork', name='edition_size', field=models.PositiveIntegerField(blank=True, null=True)),
        migrations.AddConstraint(model_name='artwork', constraint=models.CheckConstraint(
            condition=models.Q(stock_quantity__gte=1, stock_quantity__lte=99999), name='artwork_stock_range')),
        migrations.AddConstraint(model_name='artwork', constraint=models.CheckConstraint(
            condition=~models.Q(physical_format='original') | models.Q(stock_quantity=1, edition_size__isnull=True), name='original_single_copy')),
        migrations.AddConstraint(model_name='artwork', constraint=models.CheckConstraint(
            condition=(models.Q(physical_format='limited_edition', edition_size__gte=models.F('stock_quantity'), edition_size__lte=99999)
                & models.Q(edition_size__isnull=False)) | (models.Q(physical_format__in=['original', 'print'], edition_size__isnull=True)), name='physical_edition_size')),
    ]
