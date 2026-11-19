from django.db import migrations


def rename_standard_template(apps, schema_editor):
    template_model = apps.get_model("messaging", "AgreementTemplate")
    templates = template_model.objects.using(schema_editor.connection.alias)
    old_template = templates.filter(name="ArtFiliere standard agreement").first()
    if old_template is None:
        return

    new_name = "ArtFilier standard agreement"
    body = old_template.body.replace("ArtFiliere", "ArtFilier").replace("ARTFILIERE", "ARTFILIER")
    updates = {"body": body}
    if not templates.filter(name=new_name).exists():
        updates["name"] = new_name
    templates.filter(pk=old_template.pk).update(**updates)


class Migration(migrations.Migration):
    dependencies = [("messaging", "0021_simplify_table_names")]

    operations = [migrations.RunPython(rename_standard_template, migrations.RunPython.noop)]
