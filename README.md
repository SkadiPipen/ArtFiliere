# Welcome to your Expo app 👋

New auction requests require the artist to preview the complete license agreement,
draw or upload a transparent PNG signature, enter their name and consent to sign.
The server validates the document hash, records the signed text/signature/time,
and locks its license terms. Creative Moderator sees the full signed document.
When a winner is selected, their identity and winning bid are appended separately;
the original artist-signed document and signature are preserved. The buyer signs
through the existing agreement signing screen before checkout. Later template
edits apply to future requests. Older unsigned auctions retain their existing
signing process; signatures are never backfilled or invented.

## Reports, disputes and transaction management

Approved suspensions and bans show a blocking notice with the reason and expiry
on the user's next login, app focus, or account check (every 30 seconds).
Suspended users can log in and browse with a persistent view-only banner. Read
requests remain available; mutations are rejected by backend authentication and
middleware, with appeals and their own Customer Service conversations exempted.
Banned users retain access to their notice, appeal status, appeal evidence and
existing commission workspace. Suspended artists can message the buyer and
submit progress/final artwork for active commissions accepted before restriction.
Banned artists require Customer Service approval for each commission in the
moderator dashboard. Approval can be revoked, expires when the commission closes,
and does not carry over to a new restriction. New requests to restricted artists
and accepting pending commissions remain blocked. Commission messages are stored
separately from general chat and scoped to the commission's buyer and artist.
Legacy commissions had no acceptance timestamp: migration 0008 uses their first
progress upload timestamp, or creation timestamp when no progress exists; new
acceptances store the exact time.
The dedicated workspace enforces permissions in Django. Existing general chat
writes directly to Firebase and now checks account restriction status before
sending in the app; deployed Firestore security rules were not changed here.
Appeals accept an explanation, five links and five image/PDF files
(5 MB each); one appeal per restriction can await review at a time.
Suspension and ban appeals notify Platform Admin directly. Admin reviews pending
appeals under Account action approvals and approves or denies them with a reason.
Customer Service can add an optional recommendation, but it is not required.
Regular reports and disputes still go to Customer Service. Admin
can also lift an approved restriction directly with a reason. Original approvals
and reversal details remain in the history; other active restrictions still apply.

Open Reports & disputes in the web sidebar or the profile menu. Customer service moderators and
Platform Admin have links in their dashboards; drivers can file reports from
their profile. Buyers, artists and drivers can submit incidents/disputes with
optional transaction, reported account and evidence references. Users see their
own reports; customer service moderators and Platform Admin review the report queue.
Customer service accounts use the existing customer_support role and open the
customer service dashboard after login. Creative moderators handle artwork review.

Buyers and artists can request cancellation for an active transaction or return
for a paid physical purchase. Only the other party can accept/decline a
cancellation. Accepted cancellations await Platform Admin review; approval does
not automatically issue a payment-provider refund. Open reports and pending or
approved cancellation/return requests prevent artist fund release.

Moderators recommend suspensions (1–365 days) or bans from a report with a named
account. Platform Admin reviews each recommendation independently. Pending or
declined recommendations leave the account active. Approved restrictions are
enforced by the shared Firebase token verification service; suspensions expire
automatically. Reports accept up to five JPG, PNG, WebP or PDF attachments
(5 MB each) and five HTTP/HTTPS links. Attachments are stored privately in the
database and downloaded through authenticated endpoints by the reporter or staff.

Platform Admin and moderators can resolve disputes and authorize refunds or
wallet credits for the transaction buyer. Authorizations record the amount,
reason and staff member; their combined total cannot exceed the purchase amount.
Pending authorizations hold artist fund release even after report resolution.
Authorization does not execute a provider refund or change a wallet balance;
the screen identifies these records as awaiting processing.

## Auction delivery checkout

After both parties sign the fixed auction agreement, checkout for physical
artwork collects the recipient name, phone, delivery address, and optional
notes. Profile details are prefilled and editable. Calculate the delivery fee,
review the winning bid plus delivery total, then continue to payment. Digital
artwork skips this step. Expired physical auction payments reopen the same form
from My Purchases. Delivery uses the current Cebu service area and local distance
estimate; quotes expire after 15 minutes and are validated by the backend.
The winning bid and signed document remain unchanged.

## Local blockchain (Windows)

From the project root, using the existing `venv` with the backend requirements installed:

```powershell
npm run blockchain:start
npm run blockchain:check
```

The startup command installs checksum-verified Foundry v1.8.4 tools if needed,
starts Anvil in the background at `http://127.0.0.1:8545` (chain ID `31337`),
compiles Solidity 0.8.20, deploys or reuses `ArtFiliereRegistry`, exports its ABI,
and updates only the blockchain entries in `backend/.env`. The signer uses
Anvil's funded development account; this public test key is for local use only.
Restart an already-running Django backend after initial configuration.

Both commands verify signed artwork, agreement, and sale transactions through
the backend service, including rejection of mismatched hashes. Verification
uses a snapshot and restores it afterward so test records do not remain.
The check command requires the local node to be running.

Chain state is saved every second under `.local/blockchain/state.json` and
reloaded on subsequent starts. Keep this directory to retain the deployed
contract and proofs. Logs and the background process ID are in the same
directory. Foundry binaries and local state are ignored by Git.

To restore proofs for existing approved artwork, signed agreements, and paid sales:

```powershell
cd backend
../venv/Scripts/python.exe manage.py record_existing_proofs
```

Payments continue to use the existing Xendit/simulated payment flow; the local
chain stores proof hashes only.

This is an [Expo](https://expo.dev) project created with [`create-expo-app`](https://www.npmjs.com/package/create-expo-app).

## Get started

1. Install dependencies

   ```bash
   npm install
   ```

2. Start the app

   ```bash
   npx expo start
   ```

In the output, you'll find options to open the app in a

- [development build](https://docs.expo.dev/develop/development-builds/introduction/)
- [Android emulator](https://docs.expo.dev/workflow/android-studio-emulator/)
- [iOS simulator](https://docs.expo.dev/workflow/ios-simulator/)
- [Expo Go](https://expo.dev/go), a limited sandbox for trying out app development with Expo

You can start developing by editing the files inside the **app** directory. This project uses [file-based routing](https://docs.expo.dev/router/introduction).

## Get a fresh project

When you're ready, run:

```bash
npm run reset-project
```

This command will move the starter code to the **app-example** directory and create a blank **app** directory where you can start developing.

### Other setup steps

- To set up ESLint for linting, run `npx expo lint`, or follow our guide on ["Using ESLint and Prettier"](https://docs.expo.dev/guides/using-eslint/)
- If you'd like to set up unit testing, follow our guide on ["Unit Testing with Jest"](https://docs.expo.dev/develop/unit-testing/)
- Learn more about the TypeScript setup in this template in our guide on ["Using TypeScript"](https://docs.expo.dev/guides/typescript/)

## Learn more

To learn more about developing your project with Expo, look at the following resources:

- [Expo documentation](https://docs.expo.dev/): Learn fundamentals, or go into advanced topics with our [guides](https://docs.expo.dev/guides).
- [Learn Expo tutorial](https://docs.expo.dev/tutorial/introduction/): Follow a step-by-step tutorial where you'll create a project that runs on Android, iOS, and the web.

## Join the community

Join our community of developers creating universal apps.

- [Expo on GitHub](https://github.com/expo/expo): View our open source platform and contribute.
- [Discord community](https://chat.expo.dev): Chat with Expo users and ask questions.
