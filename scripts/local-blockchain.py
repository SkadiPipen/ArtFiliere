"""Deploy/configure the local registry and exercise the actual backend service."""
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
    from blockchain.service import register_artwork, record_license, record_sale, verify_artwork, verify_license, verify_sale
    from django.conf import settings
    if settings.BLOCKCHAIN_CHAIN_ID != 31337 or settings.BLOCKCHAIN_RPC_URL != "http://127.0.0.1:8545" or settings.BLOCKCHAIN_CONTRACT_ADDRESS.lower() != address.lower():
        raise RuntimeError("Backend environment overrides do not match the local configuration.")
    snapshot = w3.provider.make_request("evm_snapshot", [])
    if "result" not in snapshot:
        raise RuntimeError("Cannot snapshot chain for verification.")
    try:
        test_id = 2**63 - 1
        fingerprint = "ab" * 32
        for write, verify, label in [(register_artwork, verify_artwork, "artwork"), (record_license, verify_license, "agreement"), (record_sale, verify_sale, "sale")]:
            result = write(test_id, fingerprint)
            if not verify(test_id, fingerprint)[0] or verify(test_id, "cd" * 32)[0]:
                raise RuntimeError(f"{label} verification failed")
            print(f"PASS: {label} signed transaction and hash verification (block {result['block_number']})")
    finally:
        if w3.provider.make_request("evm_revert", [snapshot["result"]]).get("result") is not True:
            raise RuntimeError("Failed to remove verification transactions.")
    print(f"Local blockchain ready: chain 31337, registry {address}")


if __name__ == "__main__":
    main()
