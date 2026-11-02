"""Private operator command; never expose buyer identities publicly."""
import json
from django.core.management.base import BaseCommand, CommandError
from fulfillment.tracking import find_code, proof_details


class Command(BaseCommand):
    help = 'Look up the purchase associated with a visible artwork copy code.'

    def add_arguments(self, parser):
        parser.add_argument('--code', required=True, help='Visible AF- or AF-TX- artwork copy code.')

    def handle(self, *args, **options):
        record = find_code(options['code'])
        if record is None:
            self.stdout.write('No matching issued copy code found.')
            return
        self.stdout.write(json.dumps({'source': record.source_key, 'buyer_id': record.buyer_id,
                                     'artist_id': record.artist_id, 'license': record.license_snapshot,
                                     'blockchain': proof_details(record),
                                     'issued_at': record.issued_at.isoformat()}))
