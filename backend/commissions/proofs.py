import base64
import hashlib
import json
import requests
from django.conf import settings
from .models import CommissionProof


def submission_proof(submission):
    payload = {'file_hash': submission.sha256, 'uploader': submission.uploader_id,
        'stage': submission.milestone_id, 'uploaded_at': submission.uploaded_at.isoformat()}
    digest = hashlib.sha256(json.dumps(payload, sort_keys=True).encode()).hexdigest()
    return CommissionProof.objects.create(commission=submission.milestone.commission_req,
        submission=submission, record_hash=digest, registry_id=str(2**128 + submission.pk))


def process_proof(proof):
    from blockchain.service import register_artwork, verify_artwork, BlockchainError
    submission = proof.submission
    endpoint = getattr(settings, 'COMMISSION_IPFS_API_URL', '')
    if submission and not submission.cid and endpoint:
        # Public IPFS receives encrypted bytes, never a readable original.
        from cryptography.fernet import Fernet
        key = base64.urlsafe_b64encode(hashlib.sha256(settings.SECRET_KEY.encode()).digest())
        encrypted = Fernet(key).encrypt(bytes(submission.content))
        try:
            response = requests.post(endpoint.rstrip('/') + '/api/v0/add', params={'pin': 'true'}, files={'file': ('encrypted-submission', encrypted)}, timeout=20)
            response.raise_for_status(); submission.cid = response.json()['Hash']; submission.save(update_fields=['cid'])
        except (requests.RequestException, KeyError, ValueError): pass
    if proof.status == 'CONFIRMED': return
    try:
        found, _ = verify_artwork(int(proof.registry_id), proof.record_hash)
        if found:
            proof.status = 'CONFIRMED'; proof.error = ''; proof.save(); return
        result = register_artwork(int(proof.registry_id), proof.record_hash)
        proof.transaction_hash = result['transaction_hash']; proof.block_number = result['block_number']
        proof.status = 'CONFIRMED'; proof.error = ''; proof.save()
    except (BlockchainError, ValueError) as error:
        proof.status = 'FAILED'; proof.error = str(error); proof.save()
