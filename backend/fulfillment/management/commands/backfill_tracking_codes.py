import hashlib
import secrets
from urllib.parse import urlsplit
from django.conf import settings
from django.core.management.base import BaseCommand, CommandError
from fulfillment.models import DownloadFingerprint
from fulfillment.services import png_bytes
from fulfillment.tracking import attach_transaction
from fulfillment.watermarks import license_details
from wallets.models import PaymentSession


class Command(BaseCommand):
    help = 'Prepare tracking records for existing paid purchases. Dry-run unless --apply.'

    def add_arguments(self, parser):
        parser.add_argument('--apply', action='store_true')
        parser.add_argument('--record-local-proofs', action='store_true')
        parser.add_argument('--include-simulated', action='store_true')

    def handle(self, *args, **options):
        payments = PaymentSession.objects.filter(status='paid').select_related('artwork', 'agreement')
        if not options['include_simulated']:
            payments = payments.filter(is_simulated=False)
        if options['record_local_proofs']:
            if not options['apply']:
                raise CommandError('--record-local-proofs requires --apply')
            from blockchain.service import contract
            if settings.BLOCKCHAIN_NETWORK != 'local' or urlsplit(settings.BLOCKCHAIN_RPC_URL).hostname not in ('localhost', '127.0.0.1'):
                raise CommandError('This command records proofs only on the local development chain.')
            w3, registry = contract()
            if w3.eth.chain_id != 31337 or not w3.eth.get_code(registry.address):
                raise CommandError('Expected a deployed registry on local chain 31337.')
        prepared = linked = failed = 0
        for payment in payments:
            if not options['apply']:
                prepared += 1
                continue
            if options['record_local_proofs']:
                from blockchain.proofs import record_agreement_proof, record_sale_proof
                agreement = payment.agreement
                if agreement and agreement.artist_signed_at and agreement.buyer_signed_at:
                    record_agreement_proof(agreement)
                proof = record_sale_proof(payment)
                if proof.status != 'confirmed':
                    failed += 1
                    self.stderr.write(f'Purchase {payment.pk}: blockchain proof failed; no transaction code assigned.')
                    continue
            # Physical purchases do not have image downloads.
            digital = payment.agreement.delivery_type == 'digital' if payment.agreement else payment.artwork.art_type == 'digital'
            if not digital:
                continue
            try:
                raw = bytes(payment.artwork_png) if payment.artwork_png else png_bytes(payment.artwork)
                key = f'payment:{payment.pk}'
                record, _ = DownloadFingerprint.objects.get_or_create(source_key=key,
                    source_sha256=hashlib.sha256(raw).hexdigest(), defaults={
                        'token': format(secrets.randbits(61), '061b'), 'buyer_id': payment.buyer_id,
                        'artist_id': payment.artist_id, 'license_snapshot': license_details(key)})
                attach_transaction(record)
                prepared += 1
                linked += bool(record.transaction_code)
            except ValueError:
                failed += 1
                self.stderr.write(f'Purchase {payment.pk}: source image unavailable.')
        # Existing issued royalty-license fingerprints can link to their license proofs.
        if options['apply']:
            for record in DownloadFingerprint.objects.filter(transaction_code__isnull=True):
                attach_transaction(record)
            from messaging.models import Agreement
            licenses = Agreement.objects.filter(status='accepted', compensation_type='royalty',
                artwork__isnull=False, delivery_type='digital', artist_signed_at__isnull=False,
                buyer_signed_at__isnull=False, commission_contract__isnull=True).exclude(
                artist_signature_image='').exclude(buyer_signature_image='')
            for agreement in licenses.select_related('artwork'):
                if options['record_local_proofs']:
                    from blockchain.proofs import record_agreement_proof
                    record_agreement_proof(agreement)
                try:
                    raw = png_bytes(agreement.artwork)
                    key = f'agreement:{agreement.pk}'
                    record, _ = DownloadFingerprint.objects.get_or_create(source_key=key,
                        source_sha256=hashlib.sha256(raw).hexdigest(), defaults={
                            'token': format(secrets.randbits(61), '061b'), 'buyer_id': agreement.buyer_id,
                            'artist_id': agreement.artwork.artist_id, 'license_snapshot': license_details(key)})
                    attach_transaction(record)
                except ValueError:
                    failed += 1
        self.stdout.write(f'Purchases prepared: {prepared}; transaction codes linked: {linked}; failed: {failed}; applied: {options["apply"]}')
