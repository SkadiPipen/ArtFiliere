# Artwork upload screening

New original-artwork submissions are checked server-side, even if the client skips the image preview check. The cover and up to three gallery images are screened. The highest AI score controls the AI flag. The cover continues to drive visual similarity and provenance fingerprints.

## Decisions

| Condition | Result |
|---|---|
| AI score below 0.80 | Normal pending artwork review; not certified human-made |
| Any image at or above 0.80 | Held pending and unpublished for evidence review; labelled potentially AI-generated |
| Identical file already submitted | Automatically declined; reference and attempted submission retained privately |
| Visual similarity >=0.90 AND strong geometry AND multiple hash signals agree | Auto-declined and unpublished as suspected duplicate; moderator reconsideration and artist appeal available |
| Review-worthy similarity below 0.90 or without strong corroboration | Pending moderator review; no visual auto-decline |
| Lower review-worthy similarity | Pending; moderator resolves matches before approval |
| Detector cannot load or execute | HTTP 503; no unchecked submission accepted |

The runtime AI review threshold remains `ARTWORK_AUTO_AI_THRESHOLD = 0.80` (legacy setting name). High scores trigger evidence review rather than automatic rejection. AI screening uses TruthScan only. The visual-similarity threshold remains a separate business rule, not a calibrated probability of plagiarism. These scores are never percentages of how much an artwork is AI-generated or plagiarised. Shared subject matter, style and simple outlines can cause false similarity blocks; evaluate the similarity rule against representative real uploads before relying on its error rate.

High AI scores require documented evidence review before approval and are not automatic rejection decisions. A moderator may clear the AI flag after recording a supporting evidence note, or decline the artwork. Run `python manage.py reopen_ai_holds` to move previous AI-only automatic declines into this private review workflow while preserving their previous decision in the audit log and screening metadata. Identical-file blocks remain read-only. High-similarity auto-declines may be reconsidered with documented authorship or permission evidence. Non-public artwork detail is accessible only to its owner and creative moderators.

Exact-duplicate attempts retain a null unique SHA-256 field so they cannot replace the original's fingerprint/provenance identity. Their match links to the original at confidence 1.0. Existing approved works are not retrospectively blocked by this update.

## Runtime

Set `TRUTHSCAN_API_KEY` in **backend/.env**, never in frontend variables or source code. TruthScan is the only AI detector. Missing credentials, exhausted credits or service outages stop screening; there is no local CNN fallback. The old `ARTWORK_AI_PROVIDER` and `ARTWORK_AI_MODEL_PATH` settings are no longer read by the application. See `backend/.env.truthscan.example`. Restart the backend after environment changes.

Apply `python manage.py migrate` for `artworks.0015_artworkaiscan`. Existing backend requirements already include HTTPX and HTTP/2 support (`h2`). The adapter uses HTTP/2: live HTTP/1.1 upload attempts were interrupted by the provider's current upload gateway. It supports both documented DigitalOcean presigned URLs and the current `image-presigned-upload.ai-assets-cdn.com` gateway, without accepting arbitrary upload hosts.

### TruthScan

The server follows the [official image API](https://truthscan.com/truthscan-ai-image-detection-api-documentation): obtain a signed upload URL, upload the original received bytes privately, submit a detection job, then query its result. It does not resize or recompress the uploaded bytes. Preview/heatmap/deep-analysis generation is disabled. The artist upload screen discloses external processing before screening and identifies the provider. Review provider retention terms before broader deployment; the uploaded files leave this server.

The response distinguishes `AI Generated`, `AI Edited`, `Digitally Edited` and `Real`. TruthScan confidence refers to that classification. A 97% Real result is **not** displayed as 97% AI. UI displays the original label/confidence. The internal `score` is the confidence for AI Generated/AI Edited and zero for the two non-AI labels, solely for review routing; it is not a binary AI probability. AI editing is preserved as a separate label. Ordinary digital editing alone does not trigger an AI flag. The existing 80% evidence-review rule remains; no automatic AI rejection was added.

`ArtworkAIScan` privately persists jobs and successful results for seven days, keyed by exact image bytes, adapter version and a digest of the service key. Cover/gallery duplicates, preview/final submission and worker restarts reuse results. Runtime threshold changes still apply to cached classifications. A worker lease prevents concurrent submission. A client-generated job UUID is saved **before** the billable request; ambiguous timeouts preserve it and subsequent attempts query that job rather than creating another. Job IDs, API keys, signed URLs and raw provider metadata are never included in the public response. The document UUID is sensitive because the provider's query endpoint does not require a key.

Pending preview checks return HTTP 202 and the client polls every two seconds, bounded to two minutes before showing a retry action. A retry reuses the server job. Unavailable service, invalid output, rate limits or exhausted credits return HTTP 503 and cannot create an unchecked artwork. Entire image batches are validated before spending credits, including the provider's 1 KB minimum. Completed-image cache expiry, changed image bytes or a changed key can require a new scan. The [free plan](https://truthscan.com/pricing) currently includes 25 results/month; cover plus three distinct gallery images can consume four results.

Two authorised live checks on 6 November 2026: the known generated coast was classified AI Generated at 99%; the human Van Gogh reproduction was classified Real at 97.5%. Both jobs are cached. These two examples are smoke tests, not evidence of overall accuracy.

### Archived research

The former CNN, datasets, weights and experimental scripts are retained only under `backend/datasets/artwork_origin/` as unused research artifacts. The application does not import them, train on them or load their checkpoints. They do not need to be included in an application deployment. Torch and torchvision are not required for AI screening. Research-only preprocessing and model loading live in `legacy_detector.py`; their tests are outside the application test suite.

Existing historical screening results remain visible for moderation/audit purposes. Their display does not execute the retired CNN. The anti-plagiarism pipeline remains SHA-256, perceptual/difference/edge hashes and ORB-based similarity with its current policy; switching the AI detector does not replace or retrain those algorithms.

Endpoints under `/api/users/`:

- `GET artworks/screen-image/`: artist-only provider/disclosure configuration; never returns the key.
- `POST artworks/screen-image/`: artist-only image preview screening; HTTP 200 completed, HTTP 202 processing; creates no listing.
- `POST artworks/`: authoritative screening and submission. HTTP 201 means the private submission record was saved; inspect `status` and `automated_block_reason` to determine whether it was blocked. It does not mean publication.
- `PATCH artworks/<id>/ai-review/`: creative-moderator AI clearance with `note`.
- Existing artwork and similarity review endpoints enforce read-only automatic blocks and unresolved AI flags.

## Admin sales graph

The existing admin analytics response includes `artwork_sales`: calendar week-to-date (Monday onward) and month-to-date series in Asia/Manila time. Digital and physical purchase counts are shown separately and together. Count means payment transactions, not unique artwork files; digital non-exclusive licenses can sell repeatedly. Includes paid auction/artwork purchases; excludes pending, refunded, simulated, undated and future-dated payments. Commissions remain in the separate existing commission metrics. The React Native SVG chart works with the Expo web/mobile component system without a web-only chart dependency.


## geometry-v2 copy-detection evidence

New comparisons use pHash, dHash and edge hashes across eight orientations (four right-angle rotations, with and without mirroring). The winning hash distances come from the same orientation. ORB matches use a Hamming-distance ceiling, a two-neighbor ratio test in both directions, reciprocal correspondence, and a RANSAC homography. At least eight inliers, 55% inlier agreement and 2% spatial coverage on both images are required before any ORB score is accepted. Input geometry is bounded to 960 pixels on the longest edge. Crops can match through local geometry; low-detail or severely edited copies may still be missed. No CLIP/SSCD model is used.

The new score is a heuristic index: max(0.35*p + 0.25*d + 0.40*g, 0.45*edge + 0.55*g), with hash indices max(0, 1-distance/20), and g=min(verified-feature-ratio/0.2, 1). Hash or edge agreement alone cannot reach 0.80. Palette similarity is display context only. Existing historical matches retain their original values; empty match_evidence means legacy evidence, not geometry-v2.

`ARTWORK_SIMILARITY_AUTO_BLOCK_ENABLED` defaults to true for the provisional 90% policy. It can be disabled through the environment. Blocking requires the score cutoff PLUS at least 16 geometrically verified inliers, at least 65% inlier agreement, 8% coverage on both images, and at least two agreeing hash measures (pHash <=8, dHash <=10, edge <=6). These are provisional engineering safeguards, not research-validated thresholds. Strong copies can still be legitimate uploads: keep review/appeal available. Exact-file duplicate protection remains independent. The 90% similarity setting is a provisional publication-policy cutoff, not a calibrated plagiarism probability. AI screening remains a separate 80% review rule.

Apply migrations before running the updated server: `python manage.py migrate`. New matches store algorithm version, orientation, inlier counts/ratios and coverage in `match_evidence`. Moderators can inspect that spatial evidence. No old measurements are rewritten. Matching remains synchronous and compares against the approved catalogue, including references missing older cached hashes; use a background candidate index before large-scale deployment.

### Evaluate your threshold

Prepare a UTF-8 CSV with columns `left,right,label,split,group`. Paths are relative to the CSV. Labels are `copy` or `independent`; splits are `calibration` or `test`; group identifies the original-artwork family. Put every variant of an original in one split. The tool rejects shared groups and byte-identical images across splits, but cannot discover mislabeled families for you. Both splits should contain modified copies, unrelated art and difficult independent works sharing styles, palettes, shapes and subjects. Include low-detail work and authorized duplicates when evaluating the platform policy separately.

Run from backend:

```
python manage.py evaluate_similarity path/to/pairs.csv --split calibration --thresholds 0.80,0.85,0.90,0.95 --output calibration.json
python manage.py evaluate_similarity path/to/pairs.csv --split test --thresholds CHOSEN_THRESHOLD --output heldout.json
```

Choose a threshold on calibration only and freeze it before the test run. The report includes per-pair TP/FP/TN/FN, precision, recall, false-positive rate, algorithm version and raw evidence. Precision is null if there are no positive predictions; it is never reported as 100% in that case. Exact byte matches use the same separate duplicate rule as production. Other predictions require the full multi-signal gate. These are labeled-pair measurements, not end-to-end catalogue accuracy, copyright judgments, or guaranteed production error rates. No representative real-artwork dataset has been evaluated yet. Synthetic regression tests are software checks only. Reports refuse to overwrite existing files and do not change application records.


### Auto-decline and appeal workflow

New submissions at or above 0.90 are automatically declined only if the geometry-v2 multi-signal gate also passes. The reason explicitly says suspected duplicate, explains that similarity is not proof of plagiarism, and directs the artist to appeal. The upload result has an Appeal auto-decline action; Activities also links each declined artwork to the existing rejected-artwork support concern. Appeals are private, ownership-scoped, routed to Creative Moderator concern queues and deduplicated while active. The moderator can inspect the Auto-blocked tab without waiting for an appeal, approve with a recorded authorship/permission explanation, or uphold rejection with a reason. Approval clears the block and resolves linked active appeals; the original automatic decision and match measurements remain in history. Exact-file duplicate protection remains independent and read-only. No existing submissions are retrospectively declined.

Every geometry-v2 match records the policy threshold and whether blocking was enabled at submission. Displays use that stored threshold rather than rewriting historical assessments when settings change. This policy is user-selected and still requires representative held-out testing before claiming a measured error rate. Restart Django after changing the policy settings.
