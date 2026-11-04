"""Privacy-safe business entitlements, separate from blockchain delivery status.

This is a read projection. It never rewrites signed terms or historical proofs.
Free-text clauses are deliberately excluded from public responses.
"""
from django.utils import timezone
from django.utils.dateparse import parse_datetime
from django.utils.crypto import salted_hmac
from messaging.copyright_transfer import RIGHTS
from messaging.models import Agreement
from wallets.models import PaymentSession
from .provenance import license_expiry


def safe_scope(raw):
    raw = raw if isinstance(raw, dict) else {}
    enums = {
        'territory': {'philippines', 'worldwide', 'custom'},
        'modifications': {'none', 'technical', 'adaptations'},
        'sublicensing': {'none', 'production_partners'},
        'credit': {'required', 'where_practicable'},
    }
    result = {key: raw[key] for key, choices in enums.items() if raw.get(key) in choices}
    result['uses'] = [value for value in (raw.get('uses') or []) if isinstance(value, str) and value in
                      {'personal_display', 'social_media', 'advertising', 'packaging', 'merchandise', 'editorial'}]
    if type(raw.get('duration_months')) is int:
        result['duration_months'] = raw['duration_months']
    transfer = raw.get('copyright_transfer')
    if isinstance(transfer, dict) and transfer.get('kind') in ('full', 'partial'):
        result['copyright_transfer'] = {
            'kind': transfer['kind'],
            'rights': [key for key in transfer.get('rights', []) if isinstance(key, str) and key in RIGHTS],
            'effective': transfer.get('effective'),
        }
    return result


def safe_rights(raw):
    raw = raw if isinstance(raw, dict) else {}
    return {**{key: raw[key] for key in ('license_type', 'exclusivity', 'expires_at', 'duration_months') if key in raw},
            'allow_resale': raw.get('allow_resale') is True,
            'scope': safe_scope(raw.get('scope'))}


def enrich(record, data, viewer=None):
    """Expose summaries, not signed documents, contact fields or raw buyer IDs."""
    def party(pk):
        if pk == record.credited_creator_id:
            return {'username': record.credited_creator.username, 'label': '@' + record.credited_creator.username}
        if viewer and pk == viewer.pk:
            return {'label': 'You'}
        alias = salted_hmac('provenance-public-holder', f'{record.pk}:{pk}').hexdigest()[:8].upper()
        return {'label': 'Holder ' + alias}

    for key in ('current_owner', 'initial_owner'):
        if data.get(key):
            data[key] = party(data[key]['id'])
    if data.get('rights'):
        data['rights'] = safe_rights(data['rights'])
    events = list(record.events.select_related('payment', 'payment__agreement').all())
    by_payment = {entry.payment_id: entry for entry in events if entry.payment_id}
    for row in data['history']:
        for key in ('previous_owner', 'new_owner'):
            if row.get(key):
                row[key] = party(row[key]['id'])
        row['rights'] = safe_rights(row.get('rights'))
        row.pop('review_note', None)  # Moderator free text may contain private evidence.
        row.pop('reference', None)
    payments = list(PaymentSession.objects.filter(
        artwork__provenance_listing__record=record, is_simulated=False,
        status__in=['paid', 'refunded']).select_related('agreement', 'artwork').order_by('paid_at', 'pk'))
    by_agreement = {}
    for payment in payments:
        by_agreement.setdefault(payment.agreement_id, []).append(payment)
    # Signed assignments can take effect before payment; do not invent a payment.
    agreements = Agreement.objects.filter(artwork__provenance_listing__record=record,
        artist_signed_at__isnull=False, buyer_signed_at__isnull=False).select_related('artwork').order_by('created_at', 'pk')
    entitlements = []
    for agreement in agreements:
        scope = agreement.license_scope or {}
        assignment = scope.get('copyright_transfer')
        valid_assignment = isinstance(assignment, dict) and assignment.get('acknowledged') is True and assignment.get('kind') in ('full', 'partial')
        related = by_agreement.get(agreement.pk, [])
        payment = next((p for p in related if p.status == 'paid'), related[-1] if related else None)
        proof = by_payment.get(payment.pk) if payment else None
        if proof and proof.payload.get('rights', {}).get('scope'):
            scope = proof.payload['rights']['scope']
            assignment = scope.get('copyright_transfer')
            valid_assignment = isinstance(assignment, dict) and assignment.get('acknowledged') is True and assignment.get('kind') in ('full', 'partial')
        signed = max(agreement.artist_signed_at, agreement.buyer_signed_at)
        if not payment and not (valid_assignment and assignment.get('effective') == 'both_signed'):
            continue
        effective = signed if valid_assignment and assignment.get('effective') == 'both_signed' else max(signed, payment.paid_at) if payment and payment.paid_at else None
        expires = proof.payload.get('rights', {}).get('expires_at') if proof else None
        if not valid_assignment and not expires and scope.get('duration_months'):
            expires = license_expiry(signed, scope['duration_months'])
        if valid_assignment:
            expires = None  # License duration does not limit an explicit assignment.
            label = 'Copyright holder — full economic rights' if assignment['kind'] == 'full' else 'Copyright holder — selected economic rights'
        else:
            label = {'exclusive': 'Exclusive license holder', 'sole': 'Sole license holder'}.get(agreement.exclusivity, 'Non-exclusive license holder')
        state = 'active' if effective else 'awaiting_conditions'
        additional = bool(valid_assignment and assignment.get('additional_terms', '').strip().lower() not in ('', 'none', 'n/a'))
        if additional or agreement.status != 'accepted':
            state = 'review_required'
        if payment and payment.status == 'refunded':
            state = 'review_required' if valid_assignment else 'suspended_after_refund'
        elif expires and parse_datetime(expires) and timezone.now() >= parse_datetime(expires):
            state = 'expired'
        # A subsequent confirmed transfer supersedes an exclusive holder only.
        if agreement.exclusivity == 'exclusive' and proof and any(
                e.kind == 'transfer' and e.status == 'confirmed' and e.previous_owner_id == agreement.buyer_id
                and e.created_at > proof.created_at for e in events):
            state = 'transferred'
        summary = {
            'key': f'agreement-{agreement.pk}', 'holder': party(agreement.buyer_id),
            'from_holder': party(agreement.artist_id), 'holder_label': label, 'status': state,
            'purchased_at': payment.paid_at if payment else None, 'effective_at': effective,
            'expires_at': expires, 'rights': safe_rights({'license_type': agreement.license_type,
                'exclusivity': agreement.exclusivity, 'scope': scope, 'allow_resale': scope.get('allow_resale')}),
            'assigned_rights': [RIGHTS[key] for key in assignment.get('rights', []) if key in RIGHTS] if valid_assignment else [],
            'proof_status': proof.status if proof else 'not_recorded',
            'proof_recorded_at': proof.confirmed_at if proof else None,
            'has_additional_conditions': additional,
            'physical_purchase': agreement.artwork.art_type == 'physical',
            'existing_commitments': 'See protected agreement' if valid_assignment and assignment.get('existing_commitments', '').strip().lower() not in ('', 'none', 'n/a') else 'No additional commitments declared' if valid_assignment else 'See agreement for existing commitments',
            'royalty_obligations': 'Recurring royalties apply; see agreement' if agreement.compensation_type == 'royalty' else 'See agreement for any continuing royalty obligations',
        }
        entitlements.append(summary)
    # Commission completion/resale events may not reference a marketplace payment.
    # Preserve them without inventing a payment date or contractual effective date.
    for event in events:
        if event.kind != 'transfer' or event.payment_id or not event.new_owner_id:
            continue
        rights = safe_rights(event.payload.get('rights'))
        if not event.payload.get('rights'):
            continue
        state = 'active' if event.status == 'confirmed' else 'awaiting_conditions'
        expiry = parse_datetime(rights['expires_at']) if rights.get('expires_at') else None
        if expiry and timezone.now() >= expiry:
            state = 'expired'
        if event.status == 'confirmed' and any(e.kind == 'transfer' and e.status == 'confirmed'
                and e.previous_owner_id == event.new_owner_id and e.created_at > event.created_at for e in events):
            state = 'transferred'
        entitlements.append({
            'key': f'event-{event.pk}', 'holder': party(event.new_owner_id),
            'from_holder': party(event.previous_owner_id) if event.previous_owner_id else {'label': 'Original holder'},
            'holder_label': 'Exclusive license holder' if rights.get('exclusivity') == 'exclusive' else 'License holder',
            'status': state,
            'purchased_at': None, 'effective_at': None, 'expires_at': rights.get('expires_at'),
            'rights': rights, 'assigned_rights': [], 'proof_status': event.status,
            'proof_recorded_at': event.confirmed_at, 'has_additional_conditions': False,
            'existing_commitments': 'See the original commission agreement',
            'royalty_obligations': 'Original commission royalty obligations continue under the agreement',
        })
    data['entitlements'] = entitlements
    # Upload time is not evidence of when the artist created the work.
    data['creation_date'] = None
    data['first_listed_at'] = record.original_artwork.created_at if record.original_artwork_id else None
    data['privacy_note'] = 'Buyer identities and signed documents are private. Holder references are specific to this artwork.'
    data['agreement_note'] = 'Public rights summaries do not replace signed agreements. Additional conditions and existing commitments must be checked before resale.'
    return data
