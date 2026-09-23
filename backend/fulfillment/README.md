# Purchase fulfillment

Both signatures are required before a buyer can open Xendit checkout. Only a
verified `payment_session.completed` callback marks the purchase paid, removes
the cart item, releases the buyer's download, and creates a physical delivery.
Signing alone does not charge a payment method. Digital PNGs are converted and
saved at checkout so later edits to the listing cannot replace the purchased file.

## Local setup

1. Run `python manage.py migrate` from `backend`.
2. Configure `XENDIT_SECRET_KEY` and `XENDIT_WEBHOOK_TOKEN` in `backend/.env`.
   Configure the provider callback to reach
   `/api/webhooks/xendit/payment-session/` on your backend. A localhost address
   cannot receive callbacks from the provider. Restart Django after changing env.
3. Create a free OpenRouteService Standard account and API key at
   https://account.heigit.org/. Add `ORS_API_KEY=your_server_key` to
   `backend/.env` and restart Django. No Google billing setup is needed for
   delivery quotes. Keep this key on the backend, never in Expo/Firebase config.
4. In Edit Profile > Saved addresses, both parties can add/edit/remove addresses
   and choose a default. Existing addresses are preserved by migration 0013.
   Physical negotiation forms also include an address manager. Buyers choose their
   delivery address; artists can change their pickup address in a counterproposal.
   Each party sees only the other party's selected address, as read-only text.
   The server geocodes both complete Philippine addresses and requests an OpenRouteService driving route between their coordinates. It uses
   the addresses to calculate `50 + (distanceMeters / 1000) * 15` pesos, rounded
   half-up to cents. These rates are the existing project defaults, not a carrier
   tariff; constants are in config/settings.py. Ferry routes are excluded. City/province-only matches and confidence below 0.8 are rejected. Address precision still needs testing with real local addresses.
   Missing credentials, unmatched addresses, and unavailable routes block sending
   a physical proposal instead of substituting a guessed distance or old city rate.
   The signed quote expires after 15 minutes and is bound to the parties, artwork,
   revision and addresses. Address changes require recalculation. Submitted
   proposals snapshot addresses, distance and fee; later address edits never
   change an agreed contract or existing driver's delivery order.
5. Drivers sign in with a Firebase-linked user whose role is `driver`.
   Normal app login redirects driver accounts to `/rider`. A separate `/rider/login`
   is also available. The rider portal has Home, Orders, History, and Profile tabs.
   Drivers clock in, accept one order, confirm arrival at the artist, upload pickup
   proof, collect the artwork, start delivery, confirm arrival at the buyer, upload
   delivery proof, and complete delivery. Clocking out is blocked during an active order.
   This is an internal dispatch workflow, not an external courier booking API.

Buyers use Profile > **My Purchases** to see payment/delivery status, continue
pending payments, download digital PNGs, preview agreements, and rate both the
artist and artwork once payment is confirmed. Both ratings are stored in
`fulfillment_purchasereview`, linked to the buyer's payment. Refunded purchases
cannot download or submit new ratings.

PostgreSQL stores `fulfillment_deliveryroute`, `fulfillment_deliveryorder`, and
`fulfillment_purchasereview`. Existing `wallets_paymentsession` stores payment
state, checkout URL, and the PNG snapshot; `messaging_agreement` stores the
delivery quote and addresses. Shipping fees are excluded from artist earnings
and platform commission. No automated driver payout is implemented.

## Remote update inspected

`origin/main` was fetched at `03ff30d` (delivery checkout and rider's dashboard).
It contains an estimated distance calculation and PHP 50 + PHP 15/km fare,
but no location/rate dataset. The complete commit was subsequently fast-forwarded into main; local work was
restored and reconciled, including a users migration merge. This implementation now uses the fare formula with OpenRouteService driving distance,
existing Firebase user authentication, and payment-confirmed fulfillment.

## Verification

`python manage.py test fulfillment messaging.test_contracts cart --noinput`

The tests mock the payment and map providers. A configured OpenRouteService key is
required for a live address/route smoke test. A real Xendit sandbox payment and reachable
webhook are still required to verify the hosted checkout round trip.

## Rider integration from 03ff30d

The upstream rider route/tab structure, order request screen, pickup/buyer cards,
and progress display are integrated. Their APIs now use Firebase Bearer tokens
and the existing fulfillment orders; no second delivery/order database is created.
Old `/delivery-orders` links redirect into the rider portal. Rider profiles,
clock times, and the latest explicitly shared GPS position are stored in
`fulfillment_riderprofile`, linked to the existing `users_user` driver.
Proof images are validated, reduced to JPEG, and stored privately on the delivery
order with server timestamps. Only its assigned rider can upload/read those proofs
through the rider API. Completed history is scoped to that rider.

Navigation opens the saved address in Maps on both web and mobile. There are no
fabricated destination coordinates or ETAs. The upstream Google/ORS routing code
is not enabled. Delivery quotes use the new server-side OpenRouteService integration;
an embedded map and live ETA are not included. Navigation does not change the
saved contract fee.
Riders may explicitly share GPS while the delivery screen is open, or send a
single location update from Home. Sharing stops when leaving that screen.

After pulling these local changes, run migrations and install dependencies.
Restart Expo with `npx expo start -c`. Native development builds must be rebuilt
for the added `expo-location` dependency and camera/location permission config.
Web proof uploads use the image picker; mobile proof uploads use the camera.
Device GPS/camera permission behavior still needs a physical-device smoke test.

## Temporary checkout for module development

Set `ENABLE_SIMULATED_CHECKOUT=true` in `backend/.env` and restart Django.
This requires `DEBUG=True`. Both acceptance and signatures are still required.
Checkout creates an explicitly marked simulated purchase, unlocks downloads and
reviews, and creates physical delivery orders. It never calls Xendit or credits
artist wallets. Simulated purchases are excluded from admin payment release and
real payment webhook processing. Set the flag to `false` to restore Xendit.

The upstream `backend/delivery` URL namespace now routes to the authenticated
fulfillment views. Its old standalone models are retained as upstream source but
are not installed as a second live order system. Buyer activity delivery links
open My Purchases; rider detail pages remain restricted to assigned drivers.

## Address and quote endpoints

- GET/POST `/api/addresses/`: own address book (up to 20 entries).
- PATCH/DELETE `/api/addresses/<id>/`: own address only.
- GET `/api/delivery/quote/<artwork_id>/?agreement_id=<optional revision>`:
  selected addresses and the caller's address choices.
- POST to the same quote path with `address_id` and optional `agreement_id`:
  driving distance, fare and signed `token`.
- Submit that token as `delivery_quote` when creating/revising a contract.

The `users_address` table now has a user foreign key, `label`, and `is_default`.
The old `/auth/me/` address fields still read/update the default for compatibility.
Legacy delivery-route records remain available but are no longer used for new
physical proposals. Accepted contracts retain their original fee and addresses.

## OpenRouteService usage

Each calculation uses two geocoding requests and one driving-directions request.
The provider's free-plan limits apply; repeated calculations also consume quota.
No automatic retry or paid Google fallback is used. Route response distances
include fractional metres and are converted with decimal arithmetic before fare
rounding. Existing signed contracts retain their saved provider/distance/fee.
The Google Maps link is only optional external navigation, not a billed API call
made by this backend. New quotes display OpenRouteService/OpenStreetMap attribution.

## Xendit development checkout

Set `ENABLE_SIMULATED_CHECKOUT=false` and configure a development secret key with
permission to create/read Payment Sessions. The app sends customer details and
opens Xendit's hosted checkout after both agreement signatures. My Purchases
checks pending sessions with Xendit every 30 seconds while open; Refresh payment
status also checks immediately. The backend verifies the exact session ID,
reference, amount, currency and PAY type before fulfilling. Expired/canceled
sessions can be retried with Start a new payment. Old simulated purchases remain
marked as simulated and are never charged retroactively.

For confirmation when the app is closed, configure Payment Session webhooks at
`https://YOUR_BACKEND/api/webhooks/xendit/payment-session/` and set the separate
`XENDIT_WEBHOOK_TOKEN`. Local status checks work without a public webhook URL.
Optionally set `XENDIT_RETURN_URL` to an HTTPS frontend My Purchases URL.
Client redirects do not mark purchases paid. Duplicate callbacks/status checks
cannot credit a wallet or fulfill a purchase twice.

Windows uses the truststore package for system certificate validation; HTTPS
verification remains enabled. Install updated backend requirements after pulling.
An uncertain checkout creation (timeout/invalid successful response) retains its
reference for support reconciliation instead of blindly creating another session.

Validation on 2026-09-22: the configured development key reached Xendit but
Create Session returned 403 REQUEST_FORBIDDEN_ERROR (insufficient permissions).
A completed hosted sandbox payment still requires a permitted key and manual test.
