# Royalty report, payment and admin release

New structured royalty agreements use `review_mode: admin_held`.

- Reporting starts when the period closes. A new period's report deadline is seven days later.
- The payment deadline is seven days after the report deadline (period end + 14 days).
- A buyer submits metrics and evidence. The server calculates the amount.
- The buyer opens a one-time Xendit PAY session. No saved-method mandate or automatic debit is needed.
- A completed session is fetched from Xendit and matched against session ID, reference, currency and amount. Verified funds credit the artist's pending balance exactly once.
- Admin Payment Controls contains **Royalty report verification**. Only a separate platform administrator can verify and release a funded report. Release moves the held amount from pending to available exactly once; bank withdrawal remains separate.
- Zero reports also require admin verification. Unpaid reports may be rejected with a reason. Reports with initiated payments cannot be edited; disputed paid reports stay held for manual correction/refund reconciliation.

## Provider setup

Uses `XENDIT_SECRET_KEY` and `XENDIT_WEBHOOK_TOKEN`. The existing payment-session webhook also handles references beginning `af-royalty-report-`. `ROYALTY_RETURN_URL`, or `XENDIT_RETURN_URL`, may supply an HTTPS return location; if absent, the buyer can return to the reports screen and use **Confirm / refresh payment status**. A hosted session can be created without a return URL. Do not substitute an HTTP URL where the provider requires HTTPS.

The current local key is a development/test key. Live money requires live Xendit merchant credentials, enabled payment channels on that merchant, and an accessible HTTPS webhook configured in the Xendit dashboard. A test key cannot enable live settlements. This workflow does not require `ROYALTY_COLLECTION_ENABLED` or `ROYALTY_PAYMENT_CHANNELS`, which govern the separate legacy saved-method flow.

Run `python manage.py process_royalties` regularly (at least hourly) to generate periods, reconcile pending hosted sessions and send reporting/admin reminders. Payment webhooks and buyer refresh also reconcile immediately.

## Existing agreements

Signed document snapshots are never rewritten. Existing period deadlines are retained. Existing legacy reports continue their original workflow unless explicitly migrated before a payment is initiated. New agreements receive the report/payment dates above. Administrative migration of an existing agreement must record the operational change and preserve signed records.

## Verification

`python manage.py test messaging.test_royalty_funding messaging.test_royalty_reporting`

The tests use mocked provider responses; they do not charge a buyer or validate merchant account permissions. Ambiguous session creation is not automatically retried. Use its saved reference for provider/support reconciliation.
# Returning from Xendit checkout

Royalty checkout opens in a separate browser tab, preserving the original report.
Set `ROYALTY_RETURN_URL=https://your-frontend-domain` in the backend environment
(or use the existing `XENDIT_RETURN_URL` HTTPS frontend address), then restart the
backend. New payment sessions receive success and cancellation URLs pointing to
`/royalty-payment-return` with the agreement and report IDs. This page verifies the
session with the backend and provides a **Return to royalty reports** button.
The frontend host must serve this Expo route directly.

HTTP localhost addresses cannot be sent as Xendit return URLs. For local testing,
keep the original report tab open and use **Confirm / refresh payment status**,
or configure an HTTPS frontend deployment/tunnel. Existing Xendit sessions retain
their original return URLs; do not create a second payment to change a return URL.
Returning or cancelling alone never marks a payment as paid or releases funds.

