# Platform defaults and license wording

Admin > Platform defaults provides separate Pricing & fees and License wording tabs.
Only platform administrators can save settings. Numeric values are validated on the
server and saves use a revision check to prevent overwriting newer changes.

Settings include the artwork/commission platform fee percentage, additional royalty
platform fee percentage, suggested artist royalty, default exclusivity, default
license duration, and personal/commercial/exclusivity pricing multipliers.

The additional royalty fee is a percentage of the artist royalty, added to the
buyer payment. For a PHP 500 artist royalty and 2% platform rate, the buyer pays
PHP 510, the artist receives PHP 500, and PHP 10 is platform revenue. The initial
platform royalty fee is 0%; existing agreements also retain their previous 0%.
Statutory resale rights and the separate commission resale royalty policy are not
changed by the suggested commercial artist royalty setting.

New proposals snapshot rates. Commission acceptance reuses its saved proposal fee;
shop checkout uses the saved agreement rate. Auctions snapshot settings when posted.
Existing agreements and auction records retain legacy rates. Receipt reconciliation
requires the full buyer total, credits only the artist share, and records the
platform share separately. Admin analytics includes released royalty platform fees.

Defaults are fetched before new negotiation forms mount. A failure to load settings
requires retry rather than submitting a draft using unverified fallback rates.
Pricing presets and compensation suggestions use the same saved defaults.

Apply backend migrations before opening the editor. No existing payments, signed
contracts, source artwork, or historical royalty receipts are rewritten.
