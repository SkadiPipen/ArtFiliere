# Artwork provenance and exclusive ownership

The existing blockchain and proof registry remain in use. `ArtFiliereProvenance` is an additional contract on that same chain. It adds operator-authorized registration, transfers, and append-only review records; it does not create a blockchain or replace old proofs.

Each work has one permanent UUID, shown as **Artwork ID**. Marketplace rows remain listing IDs. Authorized resales create a new listing linked to the same artwork UUID. Commission assets have one identity even when subsequently listed for resale.

## Flow

1. Creative approval queues a registration with the original off-chain file SHA-256, claimed creator and initial owner. Existing approved works can be queued with `python manage.py initialize_provenance`. Historical payments retain their original dates in metadata; blockchain timestamps are never backdated.
2. Buyer and seller sign their existing agreement. Choose **exclusive** for an ownership entitlement transfer. **Sole** and **non-exclusive** licenses are not exclusive ownership transfers. The agreement records license scope, duration, permitted uses, and explicit resale permission. Copyright is not automatically assigned.
3. Checkout locks the listing and canonical identity. A pending exclusive payment reserves it across all listings. Verified provider expiration releases the reservation; an uncertain checkout stays reserved. Existing licenses prevent a conflicting exclusive sale.
4. The existing verified Xendit callback records payment and queues one transfer per payment. Simulated/unpaid transactions cannot change blockchain ownership. The completed listing is unavailable immediately, while the UI continues to show the prior confirmed owner until blockchain confirmation.
5. The worker saves a signed transaction and its hash **before** broadcasting. Network retries resend identical bytes. It reconciles receipts and the expected event hash, waits for configured confirmations, then updates the owner. A reverted transaction stays failed, with ownership unchanged. Admins can retry after verifying a conclusive revert and resolving any conflict; previous failed hashes remain visible.
6. A confirmed owner may submit a resale only if the purchase terms permit it. Original license scope and expiry are retained. Commission resales continue through the existing royalty allocation flow. The next transfer appends to the same identity and never replaces its creator claim.
7. Users can request attribution reviews with evidence links. An independent admin/creative moderator approves or rejects the claim. The decision is appended to the chain before reviewed attribution changes. Original attribution and prior transfers remain available. Third-party allegations do not automatically freeze another user's sale; party/staff disputes and pending reviewed decisions place transfers on hold.

Approved shop refunds append an ownership return after a confirmed exclusive transfer rather than rewriting the sale. An uncertain broadcast must be reconciled before refunding, and a sale cannot be refunded through the holding-balance control after ownership has already moved to someone else.

## Where to find it

- Artwork details → **View provenance & ownership history**.
- My Purchases → the same link; completed commission details also link to provenance.
- Admin or Creative dashboard → **Attribution & ownership reviews**.
- Inside provenance: verify an original file, download the exact registered bytes as the confirmed owner, inspect rights/history, submit evidence, and (when authorized) submit resale listings. Existing PNG downloads may be converted copies; compare the registered original when checking its hash.

Originals, agreements, addresses, and signature images remain off-chain. Public history does not expose signed agreement text or delivery details. Account hashes represent platform accounts, not independently controlled crypto wallets. This is a platform-operated ownership registry: its operator key must remain server-side. Registration is a claim, and reviewed attribution is a moderation decision, not independent proof of authorship.

## Local setup

From the project root:

```powershell
cd backend
.\venv\Scripts\python.exe manage.py migrate
cd ..
npm run blockchain:start
```

This preserves `.local/blockchain/state.json`, checks the original registry, deploys/configures the additional ownership contract if missing, and starts a hidden provenance worker. Restart Django after initial configuration. Keep the local chain state; deleting or resetting it destroys local transaction history.

The launcher uses `backend/venv` when present, with the older root `venv` as a
fallback. Run `npm run blockchain:start` whenever starting a local session; it
reuses the running node and worker rather than deploying a new contract for each
approval. Moderator approval queues provenance registration. The worker sends
the transaction and confirms it from its receipt, normally on its next few
five-second passes. A node or worker outage leaves it pending until service
returns; approval alone is never presented as blockchain confirmation.

Backend settings: existing `BLOCKCHAIN_RPC_URL`, `BLOCKCHAIN_CHAIN_ID`, `BLOCKCHAIN_PRIVATE_KEY`, plus `BLOCKCHAIN_PROVENANCE_ADDRESS` and `BLOCKCHAIN_PROVENANCE_CONFIRMATIONS` (local default 1; other networks default 3). Production deployments require an appropriately controlled operator key and a continuously supervised worker:

```powershell
python manage.py process_provenance --watch
```

If restarting the worker after code changes, stop its existing process first. The local launcher avoids creating a duplicate worker. Do not run multiple different chains against one database or reset contract addresses to retry a transaction.

## Validation

```powershell
tools\foundry\forge.exe test
cd backend
.\venv\Scripts\python.exe manage.py test blockchain.test_provenance --noinput
```

The opt-in `blockchain.test_provenance_live` test uses `RUN_LOCAL_PROVENANCE_TESTS=1`, checks chain ID 31337, and writes random test artwork identities to the local chain. It tests A → B → C with real signed transactions and a single continuous history. It never resets the chain. Test database records are removed normally; their local-chain test entries remain.
