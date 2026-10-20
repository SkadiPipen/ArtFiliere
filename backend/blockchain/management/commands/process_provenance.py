import time
from django.core.management.base import BaseCommand
from django.db import close_old_connections
from blockchain.models import ProvenanceEvent
from blockchain.ownership_chain import process_event


def recover_missing_transfers():
    """Also recover payments processed by a worker that predates the ownership outbox."""
    from wallets.models import PaymentSession
    from commissions.models import CommissionAsset
    from blockchain.provenance import queue_payment, ensure_commission, OwnershipConflict
    for payment in PaymentSession.objects.filter(status='paid', is_simulated=False, agreement__exclusivity='exclusive', ownership_transfer__isnull=True).order_by('paid_at', 'pk')[:20]:
        try:
            queue_payment(payment)
        except OwnershipConflict:
            continue  # Invalid originals require a creative review, never a fabricated hash.
    for asset in CommissionAsset.objects.filter(commission__status='COMPLETE', commission__funded_at__isnull=False,
            license_terms__exclusivity='exclusive', provenance_origin__isnull=True)[:20]:
        ensure_commission(asset)


class Command(BaseCommand):
    help = 'Deliver durable ownership transactions and reconcile blockchain confirmations.'
    def add_arguments(self, parser):
        parser.add_argument('--watch', action='store_true')
        parser.add_argument('--interval', type=int, default=5)
    def handle(self, *args, **options):
        while True:
            close_old_connections()
            recover_missing_transfers()
            # Reverted transactions require review; network interruptions retain pending state.
            for pk in ProvenanceEvent.objects.filter(status='pending').order_by('created_at').values_list('pk', flat=True)[:100]:
                process_event(pk)
            if not options['watch']:
                return
            time.sleep(max(2, options['interval']))
