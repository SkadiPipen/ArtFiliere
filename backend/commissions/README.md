# Commission workflow

New commissions use flow version 2. Existing commissions retain their original flow; no historical payments or signatures are converted.

## Buyer and artist

1. Buyer selects an available completion date and budget, presses **Next**, and uses the existing negotiation form to propose licensing and specifications. The three percentages default to 30/30/40 and must total 100. Physical proposals include destination, pickup address and shipping fee.
2. Artist receives the proposal, then accepts, counters or declines. Each counter creates a new version. Only the other party can accept the latest version.
3. Both parties sign the locked agreement. Signing reserves the completion date and starts the 48-hour funding window. Expiration cancels the unpaid booking and releases that date.
4. Buyer pays the full amount through Xendit. Only an authenticated provider callback or verified provider lookup starts Stage 1; returning from checkout never marks an invoice paid.
5. Artist submits each stage. Buyer can submit **one consolidated revision request/comment per stage**. Revised uploads never reset that allowance. Approval advances production and queues that stage's payout independently of its provider settlement status.
6. Final digital originals unlock after final approval. Protected final uploads currently support PNG, JPEG, WebP and TIFF; intermediate stages also support PDF. Physical completion requires the artist's courier/tracking reference, buyer-confirmed receipt, and final approval.
7. The completed asset records the original artist, current owner, immutable licensing terms and file/document/signature hashes. Copyright remains with the artist. Resale requires explicit agreement permission, retains the original license expiry, and needs creative moderation. Royalties are deducted from seller proceeds after the platform fee and credited/reconciled separately.

The milestone percentages apply to artist service proceeds after the included platform fee. Physical shipping is reimbursed to the artist with the final payout. Provider charges are borne by the platform. The included platform fee remains in the platform holding balance.

## Customer Service and administrator

Commission disputes and overdue reviews freeze unreleased funds and appear under **Commission disputes & payouts** in both staff dashboards. Staff can resolve/resume, authorize a buyer wallet credit, or authorize a provider refund. Released payouts cannot automatically be recovered. Staff cannot resolve their own commission.

Refund authorization is distinct from successful settlement. Provider refunds require a verified original Xendit `payment_request_id`; if an invoice integration does not expose it, the authorization remains `CONFIG_REQUIRED` until the provider linkage is reconciled. Wallet credit is available as a separate staff decision. Uncertain refunds must be looked up by their matching provider refund ID, not submitted again. Audit entries retain the decision reason.

Stage payout retries reuse a stable idempotency reference. Uncertain requests older than 23 hours require staff provider lookup before another attempt. A new reference is allowed only after a verified terminal failure or reversal. Production approval and successful artist payout are displayed separately.

## Local setup

From the project root:

```powershell
.\venv\Scripts\python.exe backend\manage.py migrate
.\scripts\start-commission-worker.ps1
```

Restart Django and Expo after updating. The hidden worker processes expiration, review reminders/escalations, payment reconciliation and queued provenance proofs every minute. Logs are in the ignored `tmp` directory. Stop its reported PID with `Stop-Process -Id <PID>` when finished. Restart the worker after changing environment settings.

For a foreground worker, run from `backend`:

```powershell
..\venv\Scripts\python.exe manage.py process_commission_events --watch --record-proofs --interval 60
```

In production, run the worker as a supervised service, or schedule the command without `--watch`. Review reminders occur two days before the five-day review deadline. Overdue reviews escalate once per submitted version; there is no automatic approval.

Backend environment configuration:

```dotenv
XENDIT_SECRET_KEY=<server-side test key first>
XENDIT_WEBHOOK_TOKEN=<your dashboard callback token>
FRONTEND_URL=http://localhost:8081
COMMISSION_HOLDING_ENABLED=false
COMMISSION_PAYOUTS_ENABLED=false
COMMISSION_IPFS_API_URL=
```

Holding and payout flags intentionally default to false. Enable them only after configuring the supported Xendit holding/payment and payout arrangement for the platform account. A Xendit balance alone does not establish an escrow product. Artists save supported bank/e-wallet recipient details and address on their commission page. Payouts use v3 minor units and the `2025-09-01` API version; bank routing uses SWIFT, wallets use WALLET (for example PH_GCASH).

Register the invoice/payment, v3 payout and refund callbacks with the same token at your externally reachable backend URL plus `/api/commissions/payments/webhook/`. Xendit cannot reach localhost directly; use a development tunnel for test callbacks. No simulated funding fallback exists for new commissions.

Sources: [Xendit v3 payout contract](https://docs.xendit.co/apidocs/create-payout-v3), [Xendit refunds](https://docs.xendit.co/apidocs/refund-payment-request).

SHA-256 and upload timestamps are always recorded locally. To publish encrypted file CIDs, set `COMMISSION_IPFS_API_URL` to the private Kubo API endpoint (for example `http://127.0.0.1:5001`). Public IPFS receives encrypted bytes, never readable originals. Preserve the Django secret key and database backups to preserve encrypted content access. Queued hashes are anchored using the existing blockchain registry configuration; the UI reports pending/failed/confirmed truthfully. A CID by itself is not a timestamp or proof of authorship.

## Verification

```powershell
# From backend
..\venv\Scripts\python.exe manage.py test commissions wallets messaging.test_contracts auctions.test_licensing --noinput
# From the project root
npx tsc --noEmit
```

For browser testing, use separate buyer, artist and staff sessions. Create a new commission, counter/accept and sign with both accounts, then fund it using Xendit test checkout with the worker and callback tunnel running. For **each** stage, request a revision once, submit revised work, and verify a second revision is rejected. Test physical receipt gating, private originals before/after approval, dispute freezes, staff compensation, and resale royalty allocation. Existing commissions continue using their original screens.
