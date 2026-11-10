# Artwork attribution and moderator history

The buyer-facing artwork page displays original-creator attribution only. It does not display the former blockchain badge, ownership/licence timeline or proof modal. Seller details and normal purchasing information remain separate. The creator is resolved through the permanent provenance identity (or the original commission artist), so a resale seller does not replace creator credit. Claimed attribution is not presented as independently verified authorship.

Creative moderators open an artwork in their dashboard and choose **View full artwork history**. Admin and customer-support accounts can also use the protected API. It consolidates connected listings/resales, sales and checkout attempts, agreements, immutable purchase-term snapshots, both blockchain registries' records, digital-copy codes, moderation/similarity checks, attribution reviews, refunds, reports, delivery status, linked support cases and royalties. Commission origins, proofs and refunds are included where linked. Sections are paginated in stable order, 25 records per section per page; Load more history appends the next page.

## Boundaries

- Blockchain entries show the saved transaction hashes, block numbers, network/chain/contract data where recorded, proof hashes, statuses and prior attempts. This is a read projection, not a new on-chain transaction or a live re-verification of every receipt.
- Platform sales, agreements, cases and delivery activity are labelled platform records. They are not represented as blockchain events merely because they belong to an artwork. Missing hashes/dates stay missing. Local Anvil has no public block explorer.
- Buyer/artist account IDs and usernames are available to authorised staff. Payment-provider tokens/checkout URLs, contact/address fields, signature images and raw signed documents are excluded. Contract-specific licence permissions and conditions are included.
- A licence/entitlement transfer is distinct from copyright assignment. The view does not infer copyright ownership from a payment alone.
- Digital-copy lookup accepts issued AF-TX or legacy AF codes. Creative moderators now have direct access to buyer-account/licence/proof matches without requiring support to perform the lookup. A traced copy does not prove a sale happened outside the platform or identify its outside purchaser/price.
- History access and copy-code lookups are audited in ActivityLog. Responses use private/no-store. Anonymous users, buyers and artists cannot access the full history endpoint. Legacy public provenance responses no longer expose other holders' timelines or licences; owner-only resale/download controls remain available.

## Purchase-time terms

Migration `blockchain.0005_saletermssnapshot` adds immutable `SaleTermsSnapshot` records. Checkout captures the agreed licence fields, permitted uses, territory, term, resale permission, copyright-assignment conditions, compensation terms, signature timestamps and a hash of the signed document. Later agreement edits cannot rewrite that snapshot. Sale proofs bind this frozen document hash.

Sales recorded through older/other paths capture a snapshot when recording their sale proof, labelled `sale_recording`. Old purchases without a snapshot show `legacy_current_record`: the UI explicitly warns that the exact original purchase-time terms were not captured. GET requests do not fabricate or backdate historical snapshots, re-sign agreements or rewrite old blockchain proofs.

## Endpoints

- `GET /api/blockchain/artworks/<listing_id>/creator/` — minimal public attribution; unapproved private work remains restricted.
- `GET /api/blockchain/artworks/<listing_id>/history/?page=1` — authorised staff dossier.
- Equivalent `records/<provenance_uuid>/creator/` and `records/<provenance_uuid>/history/` routes resolve permanent identities.
- `POST /api/support/artwork-code/` — admin, support and creative-moderator copy lookup. Creative responses omit raw contract text and full personal names.

## Local chain persistence

The existing `scripts/start-blockchain.ps1` continues to start Anvil with `--state .local/blockchain/state.json --state-interval 1`. Use that script when restarting. Preserve both the saved chain state and the application database. This change does not reset, redeploy or replay the live chain and does not alter existing contract bytecode.

## Verification

- 55 focused tests passed; one opt-in live-Anvil integration test was skipped. Coverage includes private history permissions, creator credit across resale, frozen terms/proof hashes, legacy records, pagination, commission proofs, royalty privacy and creative-moderator copy lookup.
- Frontend TypeScript checks passed; the snapshot migration is applied and migration drift checks pass.
- A read-only projection of existing local records successfully serialized the connected sale, agreement, proofs, moderation and delivery records. No live purchase or blockchain transaction was created for verification.
- A broader isolated run of 297 tests was not green: 12 failures and 4 errors remained, with two skipped tests. All 16 failing cases reproduced with the new snapshot capture disabled and the original sale-document hashing restored in the test process. These involve existing delivery/geocoding fixtures, document fixtures missing compensation fields, and a royalty-fee expectation; outbound HTTP was deliberately blocked. Details are in the local ignored `tmp/artwork-history-regression.log` and `tmp/artwork-history-baseline-comparison.log`. They were not masked by modifying unrelated production behaviour.
