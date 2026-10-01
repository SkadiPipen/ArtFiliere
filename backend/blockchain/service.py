import json
from pathlib import Path
from django.conf import settings
from web3 import Web3
from .utils import artwork_hash_bytes32


class BlockchainError(Exception): pass


def contract():
    if not settings.BLOCKCHAIN_CONTRACT_ADDRESS: raise BlockchainError("Contract address is not configured.")
    w3 = Web3(Web3.HTTPProvider(settings.BLOCKCHAIN_RPC_URL, request_kwargs={"timeout": 20}))
    if not w3.is_connected(): raise BlockchainError("Blockchain node is unavailable.")
    abi_path = Path(__file__).parent / "abi" / "ArtFiliereRegistry.json"
    if not abi_path.exists(): raise BlockchainError("Contract ABI is missing. Deploy/export the contract first.")
    return w3, w3.eth.contract(address=Web3.to_checksum_address(settings.BLOCKCHAIN_CONTRACT_ADDRESS), abi=json.loads(abi_path.read_text())["abi"])


def _send(function):
    w3, registry = contract()
    if not settings.BLOCKCHAIN_PRIVATE_KEY: raise BlockchainError("Blockchain private key is not configured.")
    account = w3.eth.account.from_key(settings.BLOCKCHAIN_PRIVATE_KEY)
    tx = function(registry).build_transaction({"from": account.address,"nonce": w3.eth.get_transaction_count(account.address),"chainId": settings.BLOCKCHAIN_CHAIN_ID,"gas": 250000,"gasPrice": w3.eth.gas_price})
    signed = account.sign_transaction(tx); tx_hash = w3.eth.send_raw_transaction(signed.raw_transaction); receipt = w3.eth.wait_for_transaction_receipt(tx_hash, timeout=120)
    if receipt.status != 1: raise BlockchainError("Transaction reverted.")
    return {"transaction_hash": tx_hash.hex(), "block_number": receipt.blockNumber}


def register_artwork(artwork_id, artwork_hash):
    return _send(lambda registry: registry.functions.registerArtwork(artwork_id, artwork_hash_bytes32(artwork_hash)))


def record_license(agreement_id, document_hash):
    return _send(lambda registry: registry.functions.recordLicense(agreement_id, artwork_hash_bytes32(document_hash)))


def record_sale(payment_id, sale_hash):
    return _send(lambda registry: registry.functions.recordSale(payment_id, artwork_hash_bytes32(sale_hash)))


def verify_artwork(artwork_id, artwork_hash):
    _, registry = contract(); record = registry.functions.getArtwork(artwork_id).call()
    return bytes(record[0]).hex() == artwork_hash.lower(), record


def verify_license(agreement_id, document_hash):
    _, registry = contract(); record = registry.functions.getLicense(agreement_id).call()
    return bytes(record[0]).hex() == document_hash.lower(), record


def verify_sale(payment_id, sale_hash):
    _, registry = contract(); record = registry.functions.getSale(payment_id).call()
    return bytes(record[0]).hex() == sale_hash.lower(), record
