from django.db import migrations


DEFAULT_TERMS = """ARTFILIERE ARTWORK AGREEMENT

Buyer: {{buyer_name}}
Artist: {{artist_name}}
Agreed price: PHP {{amount}}

The buyer and artist confirm that the artwork, deliverables, timeline, revisions, and delivery method stated in this agreement have been discussed and accepted. Payment is processed securely through ArtFiliere. The platform holds the artist's earnings until the transaction is completed under the platform's cancellation and return rules.
"""


def create_default_template(apps, schema_editor):
    AgreementTemplate = apps.get_model("messaging", "AgreementTemplate")
    AgreementTemplate.objects.get_or_create(name="ArtFiliere standard agreement", defaults={"body": DEFAULT_TERMS, "is_active": True})


class Migration(migrations.Migration):
    dependencies = [("messaging", "0002_conversation_agreements")]
    operations = [migrations.RunPython(create_default_template, migrations.RunPython.noop)]
