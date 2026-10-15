# Commission workflow

Personal commission requests use one production fee with optional resale permission and resale royalties. They do not permit commercial-use royalties. Commercial commissions offer a one-time production fee or a fully funded upfront fee plus separate commercial-use royalties. Commercial resale permission and resale royalties are negotiated separately from commercial-use royalty rates.

Commercial royalty terms use the existing business-permit approval and royalty reporting service. The agreed basis, rate, reporting frequency and license duration are stored on the signed agreement. Reporting starts after final delivery approval. The buyer submits sales evidence, the artist reviews it, and any automatic collection requires the buyer's separate payment authorization and the existing royalty collection configuration. Stage approvals release production payments only. Existing signed agreements are preserved.

New commissions use flow version 2. Existing commissions retain their original flow; no historical payments or signatures are converted.

## Buyer and artist

1. Buyer selects an available completion date and budget, presses **Next**, and uses the existing negotiation form to propose licensing and specifications. The three percentages default to 30/30/40 and must total 100. Physical proposals include destination, pickup address and shipping fee.
2. Artist receives the proposal, then accepts, counters or declines. Each counter creates a new version. Only the other party can accept the latest version.
3. Both parties sign the locked agreement. Signing reserves the completion date and starts the 48-hour funding window. Expiration cancels the unpaid booking and releases that date.
4. Buyer pays the full amount through Xendit. Only an authenticated provider callback or verified provider lookup starts Stage 1; returning from checkout never marks an invoice paid.
5. Artist submits each stage. Buyer can submit **one consolidated revision request/comment per stage**. Revised uploads never reset that allowance. Approval advances production and queues that stage's payout independently of its provider settlement status.
6. Final digital originals unlock after final approval. Protected final uploads currently support PNG, JPEG, WebP and TIFF; intermediate stages also support PDF. Physical completion requires the artist's courier/tracking reference, buyer-confirmed receipt, and final approval.
7. The completed asset records the original artist, current owner, immutable licensing terms and file/document/signature hashes. Copyright remains with the artist. Resale requires explicit agreement permission, retains the original license expiry, and needs creative moderation. New enabled agreements use the versioned IPOPHL-based graduated schedule on artwork selling price before platform fees, credited/reconciled separately. Historical agreements retain their signed calculation.

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


Physical commission proposals use `GET /api/commissions/delivery-quote/?artist_id=...&address_id=...` (or participant-only `commission_id`) and submit its signed `delivery_quote`. Both parties need complete saved addresses. Configure `ORS_API_KEY` for actual driving distances. The driver fare is `DELIVERY_BASE_FARE` (default PHP 50, including `DELIVERY_INCLUDED_KM` default 2 km), plus `DELIVERY_PER_KM` (default PHP 15) for additional road distance. No guessed distance or manual shipping override is accepted. Buyer floor/unit and delivery instructions are recorded separately and included in the signed agreement. Changed addresses require a fresh quote; new quotes expire after 15 minutes, while validated proposals remain reviewable until the addresses change. The artist confirms delivery details by accepting, or refreshes the quote in a counteroffer.

`GET /api/commissions/policy/` exposes the versioned contractual resale schedule adopted from IPOPHL MC 2020-023 section 14.1 (Copyright Reference Book 2021, printed page 50 / PDF page 56 zero-based). `COMMISSION_RESALE_ROYALTY_PERCENTAGE` is now the starting rate of 5%, not an editable flat rate. Consecutive resale price portions use 5% up to PHP 150,000; 4% for the next PHP 200,000; 3% for the next PHP 250,000; 2% for the next PHP 400,000; 1.5% for the next PHP 1,000,000; and 1% above PHP 2,000,000. New enabled agreements lock `resale_calculation=ipophil_mc_2020_023_s14_1_v1`; resale settlement uses artwork selling price before platform fees, excluding separately agreed delivery. The current checkout has no separately charged VAT amount; if VAT collection is introduced its recorded amount must also be excluded from this basis. Historical agreements without this policy keep their signed flat-rate/net-basis calculation. Royalties are not charged on initial commissioning; commercial-use compensation remains separate.

This adopts the reference calculation as a contractual platform policy, not a complete statutory eligibility engine. Statutory rights for covered originals cannot be waived (section 10); coverage, exclusions, nationality, protected term, professional participation and registry requirements are described in sections 3–7 and 11 of the reference. The optional platform setting does not waive any applicable statutory entitlement. No existing signed agreements are rewritten.


Payment confirmation fallback: the commission detail screen checks an existing pending invoice with Xendit on load, on return to the app/browser tab, and every 15 seconds while awaiting confirmation. Both participants may invoke `refresh_payment`; only the buyer can create/fund checkout. The server verifies invoice ID, reference, currency and amount before posting the single idempotent upfront ledger entry. Provider failures and pending invoices never unlock production. This supports local testing without a reachable webhook; unattended confirmation still requires a configured public Xendit webhook and `XENDIT_WEBHOOK_TOKEN`.


Physical Stage 3 delivery: the artist submits a final preview, then the buyer uses `ready_delivery` to mark it ready for delivery (no milestone approval/payout). The artist uses `request_pickup`; a unique `fulfillment.DeliveryOrder` is created from the signed address, route and fee snapshot, and an automatic `AF-COM-...` tracking reference appears immediately. Clocked-in unrestricted drivers receive notifications; the pending request also appears in the rider app. Protected `/api/delivery/verified/` endpoints authenticate the driver, require clock-in for acceptance, allow one active protected delivery per driver, enforce ordered transitions and pickup/delivery photo proof. Buyer/artist tracking distinguishes pending, assigned, collected, transit and delivered. Driver delivery does not set buyer receipt or approve the milestone: the buyer must confirm receipt and then approve the inspected final artwork. A dispute blocks new dispatch and driver transitions. External courier tracking remains an explicit alternative after buyer readiness approval, and cannot overwrite a platform shipment. Digital commissions skip these steps. Revision entitlement remains one comment per stage; accepting the final preview for delivery closes further stage revisions. Run `python manage.py migrate` for commissions 0012 and fulfillment 0005.

The rider service merges protected deliveries into the existing screens using `verified-` IDs, keeping them separate from legacy delivery.Order records. Existing marketplace delivery endpoints and records remain in their legacy flow.


Driver map accuracy: city-bearing addresses must geocode to the requested city; a high-confidence result in a different city is rejected. Owners can add an exact latitude/longitude in Edit Profile > Saved addresses, or use current GPS only while physically at that address. Existing commission route pins from the previous geocoder are rechecked once and invalid pins cleared; owner-provided pins sync only when the saved address text still matches the agreed address. Correcting map pins does not rewrite signed addresses or fees. Driver GPS must be real, finite and accurate within 200 m; failed/denied/coarse GPS is not replaced with a Cebu default. The web map draws only verified road geometry, clears stale ETA on location changes/failure, and bounds snapping to 100 m. Missing address pins require owner correction, not a guessed city-centre route.


Completed commission purchases: `/api/purchases/` includes funded commissions with `commission-<id>` row IDs, a final submission preview, the actual delivery status/fee, and signed agreement/certificate links. New-flow commissions become rateable only after COMPLETE, all three milestones approved, verified funding and (for physical art) buyer receipt. `/api/commissions/<id>/review/` records the buyer's artist/artwork ratings once; reviewed items remain in purchase history but leave To Rate. Ratings contribute to the artist directory average. The new review relation is optional for legacy marketplace purchases; fulfillment migration 0006 adds it. Completion/COA eligibility recognizes current APPROVED stages instead of requiring legacy PAID stage statuses. Digital completed commissions download the final file through its authenticated endpoint; physical commissions have no digital-original download action.
