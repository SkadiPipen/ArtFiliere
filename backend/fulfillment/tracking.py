"""Short aliases for confirmed sale/license transactions; preserve legacy codes."""
import re
from .models import DownloadFingerprint


def attach_transaction(record):
    if record.transaction_code:
        return record
    from blockchain.models import BlockchainTransaction
    kind, pk, *_ = record.source_key.split(':')
    if kind == 'payment':
        operation, entity = 'sale_record', 'payment'
    elif kind == 'agreement':
        operation, entity = 'license_record', 'agreement'
    else:
        return record
    proof = BlockchainTransaction.objects.filter(operation=operation, entity_type=entity,
        entity_id=pk, status='confirmed').exclude(transaction_hash='').order_by('-pk').first()
    if not proof:
        return record
    # Include the fingerprint ID: two source-file versions of one purchase remain distinct.
    from hashlib import sha256
    alias = sha256(f'{proof.network}:{proof.transaction_hash}:{record.pk}'.encode()).hexdigest()[:16].upper()
    record.transaction_code = f'AF-TX-{alias}'
    record.blockchain_proof = proof
    record.save(update_fields=['transaction_code', 'blockchain_proof'])
    return record


def find_code(code):
    if not isinstance(code, str):
        raise ValueError('Invalid copy code')
    code = code.strip().upper()
    if re.fullmatch(r'AF-TX-[0-9A-F]{16}', code):
        query = {'transaction_code': code}
    elif re.fullmatch(r'AF-[0-9A-F]{16}', code) and int(code[3:], 16) < 2**61:
        query = {'token': format(int(code[3:], 16), '061b')}
    else:
        raise ValueError('Invalid copy code')
    return DownloadFingerprint.objects.select_related('buyer', 'artist', 'blockchain_proof').filter(**query, issued_at__isnull=False).first()


def proof_details(record):
    proof = record.blockchain_proof
    if not proof:
        return {'status': 'not_linked'}
    return {'status': proof.status, 'network': proof.network, 'transaction_hash': proof.transaction_hash,
            'block_number': proof.block_number, 'proof_hash': proof.proof_hash,
            'operation': proof.operation, 'entity_type': proof.entity_type, 'entity_id': proof.entity_id}
