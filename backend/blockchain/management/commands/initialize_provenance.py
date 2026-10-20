"""Queue existing records without inventing historical blockchain timestamps."""
from django.core.management.base import BaseCommand
from artworks.models import Artwork
from commissions.models import CommissionAsset
from wallets.models import PaymentSession
from blockchain.provenance import ensure_artwork, ensure_commission, queue_payment, OwnershipConflict


class Command(BaseCommand):
    help = 'Queue approved artworks and verified exclusive sales on the existing chain. Registration time is the actual new block time.'
    def handle(self, *args, **options):
        count = 0
        for artwork in Artwork.objects.filter(status='approved').order_by('pk'):
            try:
                ensure_artwork(artwork); count += 1
            except OwnershipConflict:
                self.stderr.write(f'Artwork {artwork.pk}: file integrity review required; skipped.')
        for asset in CommissionAsset.objects.select_related('commission', 'submission', 'original_artist').filter(commission__status='COMPLETE', commission__funded_at__isnull=False):
            ensure_commission(asset)
        for payment in PaymentSession.objects.filter(status='paid', is_simulated=False, agreement__exclusivity='exclusive').order_by('paid_at', 'pk'):
            try:
                queue_payment(payment)
            except OwnershipConflict:
                self.stderr.write(f'Purchase {payment.pk}: file integrity review required; skipped.')
        self.stdout.write(f'Queued provenance for {count} approved listings. Original payment dates are metadata, not backdated blockchain records.')
