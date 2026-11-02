# Visible artwork tracking codes

Invisible TrustMark encoding and decoding have been removed. Downloads use visible
tracking codes with Pillow. TrustMark, PyTorch, and model downloads are unnecessary.

## Blockchain purchase references

Visible tags prefer `AF-TX-<16 hex characters>` when a confirmed sale/license proof
exists. This is an exact database alias to the proof transaction, not a truncated
transaction hash and not the artwork-registration record. Admin/CS lookup displays
the full transaction hash, network, block and proof hash with the buyer and license.
Legacy `AF-` code lookups remain valid; stored tokens remain private identifiers.

Run `python manage.py backfill_tracking_codes` to preview existing paid purchases;
add `--apply` to prepare their tracking records. `--record-local-proofs` retries
proof recording only against a deployed registry on localhost chain 31337.
`--include-simulated` includes explicitly labeled development purchases.
Previously downloaded files require re-downloading; original image blobs are not
rewritten. Unconfirmed or unsupported sources retain legacy codes rather than
claiming blockchain confirmation. Commission-specific blockchain purchase proofs
are not implemented by this alias mechanism.

New sale proof hashes bind buyer, artist and signed-document hash as well as the
existing purchase fields. Historical confirmed proof hashes remain unchanged.
Local-chain confirmation is development evidence, not public-chain permanence.


## Marking and lookup

The center code uses faint hollow, horizontally stretched block lettering. Only
the lower-left code uses a compact five-by-seven dot-matrix alphabet with slightly
stretched horizontal spacing. Both resolve to the same buyer and license. Print/photo readability requires physical
testing at the intended print size and cannot be guaranteed by digital zoom.
Both resolve to the same buyer, artist, artwork, and recorded license. Original
uploads remain unchanged; PNG downloads preserve dimensions and transparency.
Existing database records and blockchain references are preserved.

Keep `DOWNLOAD_WATERMARK_ENABLED=true` and `DOWNLOAD_VISIBLE_TAG_ENABLED=true`.
Restart an already-running backend to load the updated code. Existing downloaded
files cannot be changed; download again for visible-only marking.

Admin and Customer Support use Artwork code lookup through the audited private
`POST /api/support/artwork-code/` endpoint. Backend operators can use:

```powershell
python manage.py verify_watermark --code AF-TX-0123456789ABCDEF
```

The historical command name remains for compatibility; only visible codes are
accepted. Buyer details stay private. License details reflect terms at issuance,
not a live determination of expiry, revocation, or unauthorized redistribution.
Visible codes can be removed, cropped, obscured, or become unreadable in prints
and screenshots. Newly generated files have no invisible recovery signal.
