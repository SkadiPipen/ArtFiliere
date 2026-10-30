# Public provenance and rights summaries

The default display shows creator credit, creation date when available, a
separately labeled first-listing date, and ownership/license history. Creation
date is currently “Not provided” because the artwork model has no artist-supplied
creation-date field; upload dates must not be repurposed as creation dates.
Each history card shows the holder, purchase date when known, and a collapsed
“View rights summary” section. Technical hashes, transaction references, chain
details and file comparison are restricted to the administrative details UI.
The underlying verification APIs remain available. Full signed agreements stay
in the protected negotiation workspace.

Artwork detail and successful agreement/sale code verification share the same
provenance panel. Registration, payment, contractual effective dates, and proof
recording dates are distinct. Before a purchase there is no empty acquired-rights
card. Creator attribution is preserved across resale.

`blockchain/presentation.py` projects the existing signed agreements, real paid
or refunded payments, and immutable provenance events without changing them.
Exclusive/sole/non-exclusive licenses are labeled separately from express full
or partial economic-copyright assignments. Assignment dates respect the selected
signature-only or signature-and-payment condition. Additional free-text conditions
require review; the system cannot determine their fulfillment automatically.
An assignment's duration is not inferred from a license's duration.

Non-exclusive grants can coexist. Exclusive transfers with later confirmed
transfers are labeled historical. Expired licenses stay in history; refunded
licenses are suspended and refunded assignments require review rather than an
automatic reassignment. Physical delivery conditions remain governed by the
signed agreement; purchase is not presented as proof of delivered possession.

Public responses exclude signed terms, signatures, addresses, free-text campaign,
territory and assignment clauses, moderator notes, and buyer account IDs/usernames.
Structured permission choices are allowlisted. Stable HMAC holder references are
scoped to each artwork; a signed-in holder sees “You.” These references reduce
identity exposure but must not be described as guaranteed anonymity. A custom
scope or declared existing commitment directs users to the protected agreement.
This is a public summary, not a replacement or public copy of the agreement.

No historical transaction or date is fabricated. A business entitlement without
a provenance event is explicitly labeled “Not recorded for this entitlement.”
The legacy on-chain holder field still represents one exclusive entitlement,
not a complete register of all assigned economic rights. This change presents
contract-based rights separately; it does not migrate or reinterpret old contract
entries or claim a new copyright-specific on-chain record.
