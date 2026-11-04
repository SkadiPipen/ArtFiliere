# Database recovery — 28 October 2026

## What conflicted

The local database had applied the older migration
`blockchain.0003_provenanceasset_entitlementreservation_and_more`.
The current GitHub branch instead contains
`blockchain.0003_provenancesigner_provenanceartwork_provenanceevent_and_more`.
These are different schemas, not duplicate copies of the same migration.
In particular, their event primary keys, references and listing relationships differ.
Faking the newer migration would leave the application's schema incorrect.

## Recovery performed

- Applied the independent `users.0021_user_cover_image` migration to fix user lookup.
- Created a full PostgreSQL custom-format backup before archiving provenance.
- Checked that `pg_restore --list` could read the backup. A full restore into a
  separate database was not performed; this is not a claim of restore testing.
- Moved all seven older ledger tables into the PostgreSQL schema
  `artfiliere_legacy_provenance_20261028`, within the same database.
- Compared every archived row's contents with its source under transaction locks.
- Applied the current blockchain migrations `0003`, `0004` and messaging `0017`.

No table was dropped, no old proof was relabeled as a new proof, and no on-chain
transaction was submitted. The shared legacy `blockchain_blockchaintransaction`
table remains in the public schema, unchanged. Accounts, artworks, payments,
agreements and commission records were not re-created or deleted.

## Preserved records

| Archived table | Rows |
| --- | ---: |
| blockchain_provenanceasset | 17 |
| blockchain_provenanceevent | 20 |
| blockchain_provenancelisting | 17 |
| blockchain_provenanceparty | 4 |
| blockchain_provenanceproof | 35 |
| blockchain_entitlement | 3 |
| blockchain_entitlementreservation | 0 |

The archive retains its original IDs, dates, JSON payloads, hashes, relationships
and statuses. Its foreign keys continue to reference the same records. The older
migration-history entry is retained as evidence; it was not marked as the newer
migration.

## Backup

Local file (excluded from Git):

`.local/backups/before-provenance-archive-20261027T183626277592Z.dump`

The filename timestamp is UTC; this was 28 October in Asia/Singapore.

SHA-256:

`9a1c74f4f4b0205d73a92d60229a6d1d9dbee0670d7392423fded7682d15c6f7`

The backup contains sensitive application data. Do not upload it to GitHub or
share it publicly. For recovery, restore it to a separate database first and
verify it before considering any replacement of the active database.

## Important history limitation

Archived v1 history is **preserved but not automatically displayed by the new
provenance UI**. The new application uses new public tables. These schemas and
their ownership/rights semantics are incompatible, so this recovery deliberately
does not translate an old event into a newly confirmed ownership transfer.

Do not run `initialize_provenance` or `process_provenance` merely to make the old
history appear: they may create a new history and send new transactions. A
reviewed import/display bridge is a separate task. Old blockchain timestamps
must not be fabricated or new proofs described as original historical proofs.

## Reusable recovery command

`python manage.py archive_legacy_provenance` is preview-only.

For an affected, not-yet-recovered PostgreSQL installation, explicitly use
`--apply --pg-bin "C:\Program Files\PostgreSQL\18\bin"`, then run normal
migrations. The command validates the old schema, refuses an existing archive or
partial new ledger, requires a readable full backup, and verifies row contents.
Do not rerun it on this recovered database: the new tables are not the old schema.

The recovery command does not alter any deployed Solidity contract or Anvil state.
Restart Django after migration. Persistent authentication failures after restart
need separate token/account checks; database recovery is not proof of live
Firebase authentication working.
