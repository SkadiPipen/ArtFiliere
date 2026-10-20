"""Durable signed-transaction delivery and receipt reconciliation on the existing RPC chain."""
import json
from pathlib import Path
from django.conf import settings
from django.db import transaction
from web3 import Web3
from web3.exceptions import TransactionNotFound
from .models import ProvenanceArtwork, ProvenanceEvent, ProvenanceSigner
from .provenance import confirmed_event
from .service import BlockchainError


def account_id(pk):
    return Web3.keccak(text=f'artfiliere:account:{pk}')


def artwork_id(pk):
    return Web3.keccak(text=f'artfiliere:artwork:{pk}')


def connection():
    address = settings.BLOCKCHAIN_PROVENANCE_ADDRESS
    if not address:
        raise BlockchainError('Ownership registry is not configured. Run the local blockchain setup.')
    w3 = Web3(Web3.HTTPProvider(settings.BLOCKCHAIN_RPC_URL, request_kwargs={'timeout': 15}))
    if not w3.is_connected() or w3.eth.chain_id != settings.BLOCKCHAIN_CHAIN_ID:
        raise BlockchainError('The configured blockchain is unavailable or has the wrong chain ID.')
    abi = json.loads((Path(__file__).parent / 'abi' / 'ArtFiliereProvenance.json').read_text())['abi']
    registry = w3.eth.contract(address=Web3.to_checksum_address(address), abi=abi)
    return w3, registry


def process_event(event_id):
    """Never create a second transaction after an uncertain broadcast or receipt timeout."""
    item = ProvenanceEvent.objects.select_related('record').get(pk=event_id)
    if item.status == 'confirmed':
        return item.status
    try:
        w3, registry = connection()
        key = artwork_id(item.pk)
        entry = registry.functions.entries(key).call()
        if entry[4]:
            if bytes(entry[0]) != artwork_id(item.record_id) or bytes(entry[3]).hex() != item.record_hash:
                raise BlockchainError('On-chain reference does not match the immutable record.')
            # A previously broadcast transaction may already be mined: reconcile, never resend.
            if not item.transaction_hash:
                raise BlockchainError('Missing transaction reference; manual reconciliation required.')
        elif not item.signed_transaction:
            with transaction.atomic():
                record = ProvenanceArtwork.objects.select_for_update().get(pk=item.record_id)
                item = ProvenanceEvent.objects.select_for_update().select_related('record').get(pk=event_id)
                if item.status == 'confirmed':
                    return item.status
                if item.kind != 'registration' and not record.registered_at:
                    return 'pending'
                if item.kind == 'transfer':
                    if record.current_owner_id != item.previous_owner_id or record.disputed:
                        item.status = 'failed'; item.error = 'Current owner changed or artwork is disputed. Support review required.'; item.save()
                        return item.status
                    if item.payment_id and (item.payment.status != 'paid' or item.payment.is_simulated):
                        item.status = 'failed'; item.error = 'Verified payment is required.'; item.save()
                        return item.status
                signer = w3.eth.account.from_key(settings.BLOCKCHAIN_PRIVATE_KEY)
                if registry.functions.operator().call().lower() != signer.address.lower():
                    raise BlockchainError('The configured signer is not the ownership registry operator.')
                lock, _ = ProvenanceSigner.objects.get_or_create(key=f'{w3.eth.chain_id}:{signer.address.lower()}')
                ProvenanceSigner.objects.select_for_update().get(pk=lock.pk)
                # Another worker may have prepared this same event while we waited.
                item.refresh_from_db()
                if not item.signed_transaction:
                    common = [artwork_id(record.pk)]
                    digest = bytes.fromhex(item.record_hash)
                    if item.kind == 'registration':
                        fn = registry.functions.register(*common, bytes.fromhex(record.file_hash), account_id(record.claimed_creator_id), account_id(record.initial_owner_id), key, digest)
                    elif item.kind == 'transfer':
                        fn = registry.functions.transfer(*common, account_id(item.previous_owner_id), account_id(item.new_owner_id), key, digest)
                    else:
                        fn = registry.functions.review(*common, key, digest)
                    # Include committed but not yet broadcast outbox transactions in nonce allocation.
                    pending = ProvenanceEvent.objects.filter(chain_id=w3.eth.chain_id).exclude(signed_transaction='').exclude(status='confirmed')
                    nonce = w3.eth.get_transaction_count(signer.address, 'pending')
                    for other in pending:
                        if other.sender == signer.address and other.nonce is not None:
                            nonce = max(nonce, other.nonce + 1)
                    tx = fn.build_transaction({'from': signer.address, 'nonce': nonce, 'chainId': w3.eth.chain_id, 'gas': 650000, 'gasPrice': w3.eth.gas_price})
                    signed = signer.sign_transaction(tx)
                    item.signed_transaction = Web3.to_hex(signed.raw_transaction)
                    item.transaction_hash = Web3.to_hex(signed.hash)
                    item.chain_id = w3.eth.chain_id; item.contract_address = registry.address
                    item.nonce = nonce; item.sender = signer.address
                    item.status = 'pending'; item.error = ''; item.save()
        item.refresh_from_db()
        if item.chain_id != w3.eth.chain_id or item.contract_address.lower() != registry.address.lower():
            raise BlockchainError('Registry configuration changed; reconcile against the original chain and contract.')
        try:
            receipt = w3.eth.get_transaction_receipt(item.transaction_hash)
        except TransactionNotFound:
            try:
                w3.eth.send_raw_transaction(bytes.fromhex(item.signed_transaction.removeprefix('0x')))
            except Exception as error:
                # Already-known transactions and ambiguous RPC failures are safe to retry by identical hash.
                ProvenanceEvent.objects.filter(pk=item.pk).update(error=f'Broadcast awaiting reconciliation: {type(error).__name__}')
            return 'pending'
        confirmations = w3.eth.block_number - receipt.blockNumber + 1
        if confirmations < settings.BLOCKCHAIN_PROVENANCE_CONFIRMATIONS:
            return 'pending'
        with transaction.atomic():
            record = ProvenanceArtwork.objects.select_for_update().get(pk=item.record_id)
            item = ProvenanceEvent.objects.select_for_update().get(pk=event_id)
            item.record = record
            if item.status == 'confirmed':
                return item.status
            if receipt.status != 1:
                item.status = 'failed'; item.block_number = receipt.blockNumber; item.error = 'Blockchain transaction reverted. Ownership has not changed.'; item.save()
                return item.status
            entry = registry.functions.entries(key).call(block_identifier=receipt.blockNumber)
            if not entry[4] or bytes(entry[0]) != artwork_id(item.record_id) or bytes(entry[3]).hex() != item.record_hash:
                raise BlockchainError('Confirmed receipt does not contain this provenance record.')
            confirmed_event(item, entry[4], receipt.blockNumber)
        return 'confirmed'
    except Exception as error:
        # Transport/config failures leave durable work pending. Never fake a confirmed owner.
        ProvenanceEvent.objects.filter(pk=event_id).exclude(status='confirmed').update(error=f'{type(error).__name__}: {str(error)[:300]}')
        return item.status
