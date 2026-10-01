"""Business-facing helpers for recording compact agreement and sale proofs."""

from django.conf import settings
from django.utils import timezone

from .models import BlockchainTransaction
from .service import BlockchainError, record_license, record_sale, register_artwork, verify_artwork, verify_license, verify_sale
from .utils import sha256_bytes, sha256_record


def _save_confirmed(item, result):
    item.transaction_hash = result["transaction_hash"]
    item.block_number = result["block_number"]
    item.status = BlockchainTransaction.Status.CONFIRMED
    item.confirmed_at = timezone.now()
    item.save(update_fields=["transaction_hash", "block_number", "status", "confirmed_at"])
    return item


def record_agreement_proof(agreement):
    """Record the final signed document fingerprint, never its text or signatures."""
    if not agreement.artwork_id:
        return None
    existing = BlockchainTransaction.objects.filter(
        operation="license_record", entity_type="agreement", entity_id=agreement.id,
        status=BlockchainTransaction.Status.CONFIRMED,
    ).first()
    if existing:
        try:
            if verify_license(agreement.id, existing.proof_hash)[0]:
                return existing
        except BlockchainError:
            return existing
    document = agreement.document_snapshot or agreement.terms_snapshot
    proof_hash = sha256_bytes(document.encode("utf-8"))
    item = BlockchainTransaction.objects.create(
        artwork_id=agreement.artwork_id,
        operation="license_record",
        entity_type="agreement",
        entity_id=agreement.id,
        proof_hash=proof_hash,
        network=settings.BLOCKCHAIN_NETWORK,
    )
    try:
        return _save_confirmed(item, record_license(agreement.id, proof_hash))
    except (BlockchainError, ValueError) as error:
        item.status = BlockchainTransaction.Status.FAILED
        item.error_message = str(error)
        item.save(update_fields=["status", "error_message"])
        return item


def record_artwork_proof(artwork):
    """Re-register an approved file only when the currently configured chain lacks it."""
    if not artwork.sha256_hash:
        return None
    latest = BlockchainTransaction.objects.filter(
        artwork=artwork, operation="artwork_registration", status=BlockchainTransaction.Status.CONFIRMED,
    ).order_by("-created_at").first()
    if latest:
        try:
            if verify_artwork(artwork.id, artwork.sha256_hash)[0]:
                return latest
        except BlockchainError:
            return latest
    item = BlockchainTransaction.objects.create(
        artwork=artwork,
        operation="artwork_registration",
        entity_type="artwork",
        entity_id=artwork.id,
        proof_hash=artwork.sha256_hash,
        network=settings.BLOCKCHAIN_NETWORK,
    )
    try:
        return _save_confirmed(item, register_artwork(artwork.id, artwork.sha256_hash))
    except (BlockchainError, ValueError) as error:
        item.status = BlockchainTransaction.Status.FAILED
        item.error_message = str(error)
        item.save(update_fields=["status", "error_message"])
        return item


def record_sale_proof(payment):
    """Record an immutable receipt fingerprint after the platform marks payment paid."""
    existing = BlockchainTransaction.objects.filter(
        operation="sale_record", entity_type="payment", entity_id=payment.id,
        status=BlockchainTransaction.Status.CONFIRMED,
    ).first()
    if existing:
        try:
            if verify_sale(payment.id, existing.proof_hash)[0]:
                return existing
        except BlockchainError:
            return existing
    proof_hash = sha256_record({
        "payment_id": payment.id,
        "agreement_id": payment.agreement_id,
        "artwork_id": payment.artwork_id,
        "gross_amount": str(payment.gross_amount),
        "currency": "PHP",
        "paid_at": payment.paid_at.isoformat() if payment.paid_at else None,
        "provider_payment_id": payment.xendit_payment_id,
        "simulated": payment.is_simulated,
    })
    item = BlockchainTransaction.objects.create(
        artwork_id=payment.artwork_id,
        operation="sale_record",
        entity_type="payment",
        entity_id=payment.id,
        proof_hash=proof_hash,
        network=settings.BLOCKCHAIN_NETWORK,
    )
    try:
        return _save_confirmed(item, record_sale(payment.id, proof_hash))
    except (BlockchainError, ValueError) as error:
        item.status = BlockchainTransaction.Status.FAILED
        item.error_message = str(error)
        item.save(update_fields=["status", "error_message"])
        return item
