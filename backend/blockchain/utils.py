import hashlib


def artwork_hash_bytes32(hex_hash: str) -> bytes:
    if not hex_hash or len(hex_hash) != 64:
        raise ValueError("Artwork must have a SHA-256 hash.")
    return bytes.fromhex(hex_hash)


def sha256_bytes(data: bytes) -> str:
    return hashlib.sha256(data).hexdigest()
