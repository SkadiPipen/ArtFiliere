# Advance reseller verification

## User flow

Profile → **Reseller verification** → TIN and BIR Form 2303 PDF/image → consent →
submit → platform-admin or HR document review → **Verified Reseller** badge.
No purchase, artist portfolio, hourly rate or artist role is required. The buyer
keeps the buyer role. A sworn declaration upload is optional when applicable;
this feature does not determine or automate tax exemptions or withholding.

The badge means seller documents were reviewed by ArtFiliere, not official BIR
endorsement, authorship verification or blanket permission to resell. Reviewers
must evaluate the uploaded documents; their authenticity is not automatically
confirmed against a government service.

Approved users can use the resale controls in an eligible purchase's provenance
panel or the existing commission-asset resale flow. The existing agreement,
ownership, duration, royalty, blockchain-confirmation and moderation requirements
remain in place. An approved artist can reuse their existing approved BIR seller
documents instead of duplicating onboarding; that alone does not award a reseller
badge.

## Review and revocation

Platform admin → **Reseller approvals**, or HR → **Reseller applications**.
Reviewers can preview the private certificate/declaration in a large in-app modal (images and browser PDF viewer), approve/reject pending
applications and revoke approved applications. Rejection/revocation requires a
reason. The user receives a notification. Concurrent/repeated state changes are
rejected. Revocation removes the badge and prevents new resale listings and new
provenance resale checkouts. Existing settled payments and blockchain histories
are not erased or reversed by badge revocation.

Rejected/revoked applicants can submit a new application. Prior applications,
documents and review actions remain available for audit. Pending/approved
applications cannot be silently overwritten. Account suspensions/bans also
disable the badge and seller permission.

## Privacy and storage

Documents accept PDF/JPEG/PNG/WebP up to 5 MB each. They remain in PostgreSQL as
private data URIs, matching the existing local document-storage architecture.
They never enter artwork metadata or the blockchain. Protected download routes
are available only to the applicant and authorized HR/platform admins, with
private/no-store caching. Only the boolean badge status is added to public
artwork and seller-profile responses. For production scale, use encrypted
private object storage, malware scanning and a reviewed retention policy.

## Setup

Apply `python manage.py migrate` after pulling the code. This installation has
already applied `users.0023_resellerapplication_resellerreview_and_more`.
No contract deployment or blockchain reset is required.

## APIs

- GET/POST `/api/reseller/application/`: own status/submission.
- GET `/api/reseller/reviews/`: authorized review queue.
- PATCH `/api/reseller/reviews/<id>/`: approve/reject/revoke.
- GET `/api/reseller/applications/<id>/documents/bir_certificate/`: private file.
- GET `/api/reseller/applications/<id>/documents/sworn_declaration/`: private file.

POST accepts `tin_number`, `bir_certificate: {name, data_uri}`, optional
`sworn_declaration: {name, data_uri}`, and `consent: true`. Applicant identity is
resolved from Firebase authentication, never from a submitted user ID.

Tests: `users.test_resellers`, existing `blockchain.test_provenance` and commission
resale royalty lifecycle tests. The positive resale fixtures explicitly include
approved seller documents; unverified users are tested separately.
