from django.db import migrations


def backfill(apps, schema_editor):
    Commission = apps.get_model('commissions', 'CommissionRequest')
    # Legacy records did not store acceptance time. Active/finished records are
    # already accepted; preserve them using the earliest recorded work timestamp.
    for commission in Commission.objects.exclude(status__in=('PENDING', 'CANCELLED')).iterator():
        photo = commission.photos.filter(photo_type='PROGRESS').order_by('uploaded_at').first()
        commission.accepted_at = photo.uploaded_at if photo else commission.created_at
        commission.save(update_fields=['accepted_at'])


class Migration(migrations.Migration):
    dependencies = [('commissions', '0007_commissionrequest_accepted_at_and_more')]
    operations = [migrations.RunPython(backfill, migrations.RunPython.noop)]
