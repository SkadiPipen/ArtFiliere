import django.db.models.deletion
from django.db import migrations, models
from django.db.models import OuterRef, Subquery


def assign_artists(apps, schema_editor):
    renewal = apps.get_model('artist_applications', 'SwornDeclarationRenewal')
    application = apps.get_model('artist_applications', 'ArtistApplication')
    database = schema_editor.connection.alias
    owners = application.objects.using(database).filter(pk=OuterRef('application_id')).values('user_id')
    renewal.objects.using(database).update(artist_id=Subquery(owners))


class Migration(migrations.Migration):
    dependencies = [('artist_applications', '0006_sworn_declaration_renewal')]

    operations = [
        migrations.AddField(
            model_name='sworndeclarationrenewal', name='artist',
            field=models.ForeignKey(null=True, on_delete=django.db.models.deletion.PROTECT,
                                    related_name='sworn_renewals', to='users.user'),
        ),
        migrations.RunPython(assign_artists),
        migrations.AlterField(
            model_name='sworndeclarationrenewal', name='artist',
            field=models.ForeignKey(on_delete=django.db.models.deletion.PROTECT, related_name='sworn_renewals', to='users.user'),
        ),
        migrations.RemoveConstraint(model_name='sworndeclarationrenewal', name='one_pending_sworn_renewal'),
        migrations.RemoveField(model_name='sworndeclarationrenewal', name='application'),
        migrations.AddConstraint(
            model_name='sworndeclarationrenewal',
            constraint=models.UniqueConstraint(fields=['artist'], condition=models.Q(status='pending'),
                                               name='one_pending_sworn_renewal_per_artist'),
        ),
    ]
