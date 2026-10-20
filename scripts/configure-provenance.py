"""Add the ownership registry to the running local chain; never reset existing state."""
import json
from pathlib import Path
from dotenv import dotenv_values, set_key
from web3 import Web3

ROOT = Path(__file__).resolve().parents[1]
env = ROOT / 'backend' / '.env'
values = dotenv_values(env)
w3 = Web3(Web3.HTTPProvider(values.get('BLOCKCHAIN_RPC_URL', 'http://127.0.0.1:8545')))
if not w3.is_connected() or w3.eth.chain_id != 31337 or 'anvil' not in w3.client_version.lower():
    raise RuntimeError('Start the existing local Anvil chain on chain ID 31337 first.')
artifact = json.loads((ROOT / 'out/ArtFiliereProvenance.sol/ArtFiliereProvenance.json').read_text())
address = values.get('BLOCKCHAIN_PROVENANCE_ADDRESS')
if address:
    actual = bytearray(w3.eth.get_code(Web3.to_checksum_address(address)))
    expected = bytearray.fromhex(artifact['deployedBytecode']['object'].removeprefix('0x'))
    # Mask constructor-injected immutable operator slots before comparing runtime code.
    for slots in artifact['deployedBytecode'].get('immutableReferences', {}).values():
        for slot in slots:
            start, length = slot['start'], slot['length']
            actual[start:start+length] = bytes(length)
            expected[start:start+length] = bytes(length)
    if actual != expected:
        raise RuntimeError('Ownership registry bytecode differs. Preserve its history; do not replace an existing registry automatically.')
    registry = w3.eth.contract(address=Web3.to_checksum_address(address), abi=artifact['abi'])
    if registry.functions.operator().call().lower() != w3.eth.account.from_key(values['BLOCKCHAIN_PRIVATE_KEY']).address.lower():
        raise RuntimeError('Configured ownership registry has a different operator.')
else:
    signer = w3.eth.account.from_key(values['BLOCKCHAIN_PRIVATE_KEY'])
    factory = w3.eth.contract(abi=artifact['abi'], bytecode=artifact['bytecode']['object'])
    tx = factory.constructor().build_transaction({'from': signer.address, 'nonce': w3.eth.get_transaction_count(signer.address, 'pending'), 'chainId': 31337})
    receipt = w3.eth.wait_for_transaction_receipt(w3.eth.send_raw_transaction(signer.sign_transaction(tx).raw_transaction))
    if receipt.status != 1:
        raise RuntimeError('Ownership registry deployment failed.')
    address = receipt.contractAddress
    set_key(env, 'BLOCKCHAIN_PROVENANCE_ADDRESS', address)
(ROOT / 'backend/blockchain/abi/ArtFiliereProvenance.json').write_text(json.dumps({'abi': artifact['abi']}, indent=2) + '\n', encoding='utf-8')
print(f'Ownership registry ready on existing chain {w3.eth.chain_id}: {address}')
