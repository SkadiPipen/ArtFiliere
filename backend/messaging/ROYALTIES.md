# Royalty reporting and collection

Royalty reports are available in Settings > Royalty reports / Payments and from accepted royalty proposal cards. Only the buyer can submit a report; only its artist can approve or reject it. Evidence is private to those two participants. An approved report is locked.

New royalty/hybrid proposals contain a reporting policy and duration (1–60 months). Periods anchor to the later signing date, use the selected monthly/quarterly/semiannual/annual frequency, and end at the agreed duration. Month-end anchors do not drift. Both report and payment are due seven days after each period ends (UTC). Zero-sales periods require evidence. Missing reports are overdue, never automatically zero.

## Calculations

- Per unit: items sold × agreed PHP rate.
- Gross sales: gross sales × agreed percentage.
- Net sales: max(0, gross sales − contractually permitted deductions) × percentage.
- Profit: max(0, gross sales − permitted deductions − permitted costs) × percentage.
- Tiered: graduated bands starting at zero, applied to the chosen basis separately each period. Unit bands use PHP/item; other bands use percentages.
- Guaranteed: max(period guarantee, calculated royalty). The guarantee offsets royalties, applies **each reporting period**, and does not create a second charge.
- Upfront hybrid fees remain in the original artwork checkout; only subsequent royalty amounts are collected here.

Money uses server-side Decimal arithmetic and half-up cent rounding. The artist verifies reported figures against evidence before approving. The application cannot independently verify sales or bank statements. Existing signed agreements lacking structured rules are not rewritten or billed by this service.

## Enable in a deployment

1. Apply the included migration using `python manage.py migrate`. It adds reporting/authorization/receipt tables and proposal revision lineage. It does not rewrite signed documents.
2. Obtain Xendit approval for reusable, merchant-initiated payment channels in the Philippines. Verify supported channels and properties with Xendit; availability is account/channel dependent.
3. Configure these server environment variables (never Expo public variables):

   - Existing `XENDIT_SECRET_KEY` and `XENDIT_WEBHOOK_TOKEN`.
   - `ROYALTY_RETURN_URL`: the public HTTPS URL of `/royalty-reports`.
   - `ROYALTY_PAYMENT_CHANNELS`: comma-separated Xendit channel codes actually approved for saving and subsequent debits.
   - `ROYALTY_CHANNEL_PROPERTIES`: JSON with the properties required by the approved channel. For supported card merchant-initiated payments this includes `card_on_file_type: MERCHANT_UNSCHEDULED`; confirm any additional properties with Xendit.
   - `ROYALTY_COLLECTION_ENABLED=true` only after sandbox validation and approval. Default is false.

4. Configure the relevant Xendit payment-request webhook to `https://YOUR_API/api/users/royalties/webhook/`. Keep the existing artwork checkout webhook as configured; these are separate flows. Callback tokens are required and payment records are fetched back from Xendit before crediting a receipt.
5. Run `python manage.py process_royalties` hourly through your deployment scheduler. It creates periods, sends in-app due/review notifications, collects eligible approved reports, and reconciles pending provider requests. It must keep running on the server; the frontend does not schedule debits.
6. Buyers explicitly authorize collection, complete hosted Xendit payment-method linking, and press **Confirm completed payment authorization** on return. Clients never send a payment token or raw bank/card details to this API. Buyers can revoke future collection; already initiated charges can still settle.

## Reconciliation and failure behavior

Each period is claimed durably before its single provider request. Concurrent workers cannot initiate the same charge twice. A timeout, failed request, or unknown result is not retried automatically. If the provider ID is known, the worker polls it; a verified callback can also recover the ID for a request whose response was lost. For a permanently ambiguous result without a callback, support must reconcile reference `af-royalty-PERIOD_ID` in Xendit before taking any action. Do not reset `collecting` to `approved` or re-charge an unresolved reference.

Confirmed receipts credit the artist's available wallet balance once and appear as royalty receipts in wallet history. No extra royalty platform commission is deducted; existing artwork checkout fees are unchanged. Actual bank disbursement remains the existing payout process, separate from collection. A missing/revoked mandate leaves the debt approved and unpaid rather than silently changing it to paid.

Provider references:
- https://docs.xendit.co/apidocs/create-session
- https://docs.xendit.co/apidocs/create-payment-request
- https://docs.xendit.co/docs/cards-recurring-and-merchant-initiated-transactions

## Validation

`messaging.test_royalty_reporting` covers formulas, anchored periods, evidence permissions, approval, correction history, timeout behavior, revocation, receipts, and proposal comparisons. Provider requests are mocked: no real charges are made by tests. SQLite tests cover application behavior; validate PostgreSQL row locking and provider/channel behavior in staging before enabling production collection.
