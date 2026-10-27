"""Deploy/configure the local registry, then validate it without reverting live history."""
import argparse
import json
import sys
from pathlib import Path

from dotenv import dotenv_values, set_key
from web3 import Web3

ROOT = Path(__file__).resolve().parents[1]
ENV = ROOT / "backend" / ".env"
# Anvil's public development account; never use this account on a public chain.
LOCAL_KEY = "0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80"


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--check", action="store_true", help="Verify without deploying or editing configuration")
    args = parser.parse_args()
    w3 = Web3(Web3.HTTPProvider("http://127.0.0.1:8545", request_kwargs={"timeout": 10}))
    if not w3.is_connected() or w3.eth.chain_id != 31337:
        raise RuntimeError("Start the local Anvil chain (chain ID 31337) first.")
    if "anvil" not in w3.client_version.lower():
        raise RuntimeError("Expected Anvil at the local RPC endpoint.")
    artifact = json.loads((ROOT / "out/ArtFiliereRegistry.sol/ArtFiliereRegistry.json").read_text())
    values = dotenv_values(ENV)
    address = values.get("BLOCKCHAIN_CONTRACT_ADDRESS")
    expected_code = artifact["deployedBytecode"]["object"]
    valid = bool(address and Web3.is_address(address) and w3.eth.get_code(Web3.to_checksum_address(address)).hex().removeprefix("0x") == expected_code.removeprefix("0x"))
    if not valid:
        if address and Web3.is_address(address) and w3.eth.get_code(Web3.to_checksum_address(address)):
            raise RuntimeError('The existing proof registry differs from the compiled contract. Preserve its history and reconcile the artifact; do not replace it automatically.')
        if args.check:
            raise RuntimeError("Configured registry is missing or differs from the compiled contract.")
        account = w3.eth.account.from_key(LOCAL_KEY)
        factory = w3.eth.contract(abi=artifact["abi"], bytecode=artifact["bytecode"]["object"])
        tx = factory.constructor().build_transaction({"from": account.address, "nonce": w3.eth.get_transaction_count(account.address), "chainId": 31337})
        receipt = w3.eth.wait_for_transaction_receipt(w3.eth.send_raw_transaction(account.sign_transaction(tx).raw_transaction))
        if receipt.status != 1:
            raise RuntimeError("Registry deployment failed.")
        address = receipt.contractAddress
        print(f"Registry deployed: {address}")
    if not args.check:
        for name, value in {"BLOCKCHAIN_NETWORK": "local", "BLOCKCHAIN_RPC_URL": "http://127.0.0.1:8545", "BLOCKCHAIN_CHAIN_ID": "31337", "BLOCKCHAIN_PRIVATE_KEY": LOCAL_KEY, "BLOCKCHAIN_CONTRACT_ADDRESS": address}.items():
            set_key(ENV, name, value)
        (ROOT / "backend/blockchain/abi/ArtFiliereRegistry.json").write_text(json.dumps({"abi": artifact["abi"]}, indent=2) + "\n")
    sys.path.insert(0, str(ROOT / "backend"))
    import os
    os.chdir(ROOT / "backend")
    os.environ.setdefault("DJANGO_SETTINGS_MODULE", "config.settings")
    import django
    django.setup()
    from blockchain.service import contract
    from django.conf import settings
    if settings.BLOCKCHAIN_CHAIN_ID != 31337 or settings.BLOCKCHAIN_RPC_URL != "http://127.0.0.1:8545" or settings.BLOCKCHAIN_CONTRACT_ADDRESS.lower() != address.lower():
        raise RuntimeError("Backend environment overrides do not match the local configuration.")
    # Snapshot/revert during normal startup can erase concurrent worker transactions.
    # Contract writes are exercised by separate integration tests instead.
    _, registry = contract()
    test_id, fingerprint = 2**63 - 1, "ab" * 32
    for getter, verifier, label in [('getArtwork', 'verifyArtwork', 'artwork'), ('getLicense', 'verifyLicense', 'agreement'), ('getSale', 'verifySale', 'sale')]:
        record = getattr(registry.functions, getter)(test_id).call()
        expected = bool(record[3] and bytes(record[0]).hex() == fingerprint)
        if getattr(registry.functions, verifier)(test_id, bytes.fromhex(fingerprint)).call() != expected:
            raise RuntimeError(f'{label} verification failed')
        print(f'PASS: {label} registry read and hash verification')
    print(f"Local blockchain ready: chain 31337, registry {address}")


if __name__ == "__main__":
    main()
