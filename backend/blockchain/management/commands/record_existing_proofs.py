from django.core.management.base import BaseCommand

from blockchain.proofs import record_agreement_proof, record_artwork_proof, record_sale_proof
from artworks.models import Artwork
from messaging.models import Agreement
from wallets.models import PaymentSession


class Command(BaseCommand):
    help = "Records local blockchain proofs for already-finalized agreements and paid transactions."

    def handle(self, *args, **options):
        artworks = Artwork.objects.filter(status=Artwork.Status.APPROVED)
        agreements = Agreement.objects.filter(status=Agreement.Status.ACCEPTED, artist_signed_at__isnull=False, buyer_signed_at__isnull=False, artwork__isnull=False)
        payments = PaymentSession.objects.filter(status=PaymentSession.Status.PAID)
        artwork_count = agreement_count = sale_count = 0
        for artwork in artworks:
            item = record_artwork_proof(artwork)
            if item and item.status == "confirmed":
                artwork_count += 1
        for agreement in agreements:
            if record_agreement_proof(agreement).status == "confirmed":
                agreement_count += 1
        for payment in payments:
            if record_sale_proof(payment).status == "confirmed":
                sale_count += 1
        self.stdout.write(self.style.SUCCESS(f"Artwork proofs confirmed: {artwork_count}; agreement proofs confirmed: {agreement_count}; sale proofs confirmed: {sale_count}"))
