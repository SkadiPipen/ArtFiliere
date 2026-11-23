"""Read-only, staff-only artwork dossier; no blockchain writes or payment secrets."""
import uuid
from django.db.models import Q
from rest_framework.exceptions import NotFound
from artworks.models import Artwork, ArtworkReviewLog, ArtworkSimilarityMatch
from messaging.models import Agreement, RoyaltyPeriod, RoyaltyReceipt, RoyaltyFunding
from wallets.models import PaymentSession, CancellationReturnRequest, IncidentReport, SupportTicket
from fulfillment.models import DownloadFingerprint, DeliveryOrder
from fulfillment.watermarks import copy_code
from fulfillment.tracking import proof_details
from .models import ProvenanceArtwork, ProvenanceListing, BlockchainTransaction
from .presentation import safe_rights
from .sale_terms import agreement_terms

STAFF_ROLES = {'platform_admin', 'creative_moderator', 'customer_support'}


def person(user):
    return {'id': user.pk, 'username': user.username} if user else None


def context(artwork_id):
    if isinstance(artwork_id, uuid.UUID):
        record = ProvenanceArtwork.objects.select_related('credited_creator', 'claimed_creator', 'current_owner', 'commission_asset__commission').filter(pk=artwork_id).first()
        if not record:
            raise NotFound('Artwork identity not found.')
        artwork = record.original_artwork or record.listings.select_related('artwork').order_by('pk').first()
        if isinstance(artwork, ProvenanceListing):
            artwork = artwork.artwork
    else:
        artwork = Artwork.objects.select_related('artist').filter(pk=artwork_id).first()
        if not artwork:
            raise NotFound('Artwork not found.')
        link = ProvenanceListing.objects.select_related('record__credited_creator', 'record__claimed_creator', 'record__current_owner', 'record__commission_asset__commission').filter(artwork=artwork).first()
        record = link.record if link else None
    asset = record.commission_asset if record and record.commission_asset_id else None
    if not asset and artwork:
        resale = getattr(artwork, 'commission_resale', None)
        asset = resale.asset if resale else None
    ids = set(record.listings.values_list('artwork_id', flat=True)) if record else set()
    if record and record.original_artwork_id:
        ids.add(record.original_artwork_id)
    if artwork:
        ids.add(artwork.pk)
    if asset:
        ids.update(asset.resales.values_list('artwork_id', flat=True))
    creator = record.credited_creator if record else asset.original_artist if asset else artwork.artist
    return artwork, record, asset, sorted(ids), creator


def hide_resale_creator(artwork, record, asset=None):
    """Hide public resale credit only; stored creator history remains intact."""
    if not artwork or not (asset or (record and artwork.pk != record.original_artwork_id)):
        return False
    latest = record.events.filter(kind='transfer', status='confirmed').order_by('-created_at').first() if record else None
    rights = latest.payload.get('rights', {}) if latest else (asset.license_terms if asset else {})
    scope = rights.get('scope') or {}
    assignment = scope.get('copyright_transfer') or rights.get('copyright_transfer') or {}
    return str(assignment.get('artist_reserved_uses', '')).strip().lower() == 'none'


def creator_record(artwork_id, viewer=None):
    artwork, record, asset, ids, creator = context(artwork_id)
    staff = viewer and viewer.role in STAFF_ROLES
    visible = Artwork.objects.filter(pk__in=ids, status='approved').exists()
    owner = viewer and ((artwork and artwork.artist_id == viewer.pk) or (record and record.current_owner_id == viewer.pk))
    if not visible and not (staff or owner):
        raise NotFound('Artwork not found.')
    hidden = not staff and hide_resale_creator(artwork, record, asset)
    return {'created_by': None if hidden else person(creator), 'creator_verification': 'reviewed' if record and record.creator_verified else 'claimed',
            'disputed': bool(record and record.disputed)}


def proof(row):
    return {'id': row.pk, 'operation': row.operation, 'status': row.status,
            'network': row.network, 'transaction_hash': row.transaction_hash,
            'block_number': row.block_number, 'proof_hash': row.proof_hash,
            'recorded_at': row.created_at, 'confirmed_at': row.confirmed_at,
            'entity_type': row.entity_type, 'entity_id': row.entity_id}


def source_id(source, kind):
    parts = source.split(':')
    return int(parts[1]) if len(parts) > 1 and parts[0] == kind and parts[1].isdigit() else None


def dossier(artwork_id, page=1):
    artwork, record, asset, ids, creator = context(artwork_id)
    payments = PaymentSession.objects.filter(artwork_id__in=ids)
    contracts = Agreement.objects.filter(Q(artwork_id__in=ids) | Q(payment_sessions__artwork_id__in=ids))
    if asset and asset.commission.agreement_id:
        contracts = Agreement.objects.filter(Q(pk__in=contracts.values('pk')) | Q(pk=asset.commission.agreement_id))
    contracts = contracts.distinct()
    copies = Q(source_key__in=[f'payment:{pk}' for pk in payments.values_list('pk', flat=True)])
    copies |= Q(source_key__in=[f'agreement:{pk}' for pk in contracts.values_list('pk', flat=True)])
    if asset:
        copies |= Q(source_key=f'commission:{asset.commission_id}') | Q(source_key__startswith=f'commission:{asset.commission_id}:')
    more, sections = {}, {}
    size, start = 25, (page - 1) * 25
    def section(name, queryset, render):
        rows = list(queryset[start:start + size + 1])
        more[name] = len(rows) > size
        sections[name] = [render(row) for row in rows[:size]]
    def sale(row):
        snapshot = getattr(row, 'sale_terms_snapshot', None)
        title = ('Resale' if record and row.artwork_id != record.original_artwork_id else 'Artwork sale') if row.status in ('paid', 'refunded') else 'Checkout attempt'
        return {'id': row.pk, 'title': title,
                'status': row.status, 'recorded_at': row.paid_at or row.created_at,
                'listing_id': row.artwork_id, 'buyer': person(row.buyer), 'seller': person(row.artist),
                'amount': str(row.gross_amount), 'currency': 'PHP', 'simulated': row.is_simulated,
                'agreement_id': snapshot.agreement_id if snapshot else row.agreement_id,
                'license': snapshot.terms if snapshot else agreement_terms(row.agreement),
                'terms_source': snapshot.source if snapshot else 'legacy_current_record',
                'terms_captured_at': snapshot.created_at if snapshot else None,
                'document_hash': snapshot.document_hash if snapshot else None,
                'verification_code': row.verification_code}
    section('listings', Artwork.objects.filter(pk__in=ids).select_related('artist').order_by('created_at', 'pk'), lambda row: {
        'id': row.pk, 'title': row.title, 'status': row.status, 'recorded_at': row.created_at,
        'listing_id': row.pk, 'seller': person(row.artist), 'note': row.decline_reason})
    section('sales', payments.select_related('buyer', 'artist', 'agreement', 'sale_terms_snapshot').order_by('created_at', 'pk'), sale)
    section('agreements', contracts.select_related('buyer', 'artist').order_by('created_at', 'pk'), lambda row: {
        'id': row.pk, 'title': 'Agreement', 'status': row.status, 'recorded_at': row.created_at,
        'buyer': person(row.buyer), 'seller': person(row.artist), 'listing_id': row.artwork_id,
        'license': agreement_terms(row), 'terms_source': 'agreement_record', 'verification_code': row.verification_code,
        'note': 'For a completed purchase, use its frozen sale terms. This agreement record may be a proposal, revision or cancellation.'})
    section('blockchain_proofs', BlockchainTransaction.objects.filter(artwork_id__in=ids).order_by('created_at', 'pk'), proof)
    events = record.events.select_related('previous_owner', 'new_owner').order_by('created_at', 'pk') if record else []
    section('ownership_events', events, lambda row: {
        'id': str(row.pk), 'title': row.get_kind_display(), 'status': row.status,
        'recorded_at': row.confirmed_at or row.created_at,
        'artist': person(record.claimed_creator) if row.kind == 'registration' else None,
        'initial_owner': person(row.new_owner) if row.kind == 'registration' else None,
        'buyer': person(row.new_owner) if row.kind == 'transfer' else None,
        'seller': person(row.previous_owner) if row.kind == 'transfer' else None,
        'transaction_hash': row.transaction_hash, 'block_number': row.block_number,
        'chain_id': row.chain_id, 'contract_address': row.contract_address, 'proof_hash': row.record_hash,
        'payment_id': row.payment_id, 'reason': row.payload.get('reason'), 'rights': safe_rights(row.payload.get('rights')),
        'previous_attempts': [{key: attempt.get(key) for key in ('transaction_hash', 'status', 'block_number')}
                              for attempt in row.previous_attempts]})
    section('digital_copies', DownloadFingerprint.objects.filter(copies).select_related('buyer', 'artist', 'blockchain_proof').order_by('created_at', 'pk'), lambda row: {
        'id': row.pk, 'title': 'Issued digital copy' if row.issued_at else 'Digital copy not yet issued',
        'status': 'issued' if row.issued_at else 'not_issued', 'recorded_at': row.issued_at or row.created_at,
        'code': copy_code(row) if row.issued_at else None, 'source': row.source_key,
        'payment_id': source_id(row.source_key, 'payment'), 'agreement_id': source_id(row.source_key, 'agreement'),
        'buyer': person(row.buyer), 'seller': person(row.artist), 'source_hash': row.source_sha256,
        'license': {key: value for key, value in (row.license_snapshot or {}).items()
                    if key in ('license_type', 'exclusivity', 'license_scope')},
        'blockchain': proof_details(row)})
    section('refunds', CancellationReturnRequest.objects.filter(payment_session__in=payments).select_related('requester', 'reviewed_by').order_by('created_at', 'pk'), lambda row: {
        'id': row.pk, 'title': row.get_request_type_display(), 'status': row.status,
        'recorded_at': row.created_at, 'buyer': person(row.requester), 'payment_id': row.payment_session_id,
        'note': row.reason, 'resolution': row.admin_note, 'reviewed_at': row.reviewed_at})
    section('reports', IncidentReport.objects.filter(payment__in=payments).select_related('reporter').order_by('created_at', 'pk'), lambda row: {
        'id': row.pk, 'title': row.title, 'status': row.status, 'recorded_at': row.created_at,
        'buyer': person(row.reporter), 'payment_id': row.payment_id, 'note': row.description, 'resolution': row.resolution})
    section('moderation', ArtworkReviewLog.objects.filter(artwork_id__in=ids).select_related('actor').order_by('created_at', 'pk'), lambda row: {
        'id': row.pk, 'title': row.action, 'status': row.new_status, 'recorded_at': row.created_at,
        'actor': person(row.actor), 'listing_id': row.artwork_id, 'note': row.reason})
    section('similarity_checks', ArtworkSimilarityMatch.objects.filter(Q(artwork_id__in=ids) | Q(reference_artwork_id__in=ids)).order_by('created_at', 'pk'), lambda row: {
        'id': row.pk, 'title': 'Visual similarity screening', 'status': row.review_status,
        'recorded_at': row.created_at, 'listing_id': row.artwork_id,
        'note': f'Compared with artwork #{row.reference_artwork_id}: similarity score {row.confidence_score:.1%}. This is not proof of infringement.',
        'resolution': row.review_note})
    reviews = record.reviews.select_related('requested_by', 'reviewed_by', 'proposed_creator').order_by('created_at', 'pk') if record else []
    section('attribution_reviews', reviews, lambda row: {
        'id': row.pk, 'title': 'Creator attribution review', 'status': row.status, 'recorded_at': row.created_at,
        'actor': person(row.requested_by), 'note': row.reason, 'resolution': row.decision_note,
        'proposed_creator': person(row.proposed_creator), 'reviewer': person(row.reviewed_by), 'reviewed_at': row.reviewed_at,
        'evidence_links': row.evidence_links})
    section('deliveries', DeliveryOrder.objects.filter(payment__in=payments).order_by('created_at', 'pk'), lambda row: {
        'id': row.pk, 'title': 'Physical delivery', 'status': row.status, 'recorded_at': row.created_at,
        'payment_id': row.payment_id, 'delivered_at': row.delivered_at})
    tickets = Q(artwork_id__in=ids) | Q(payment__in=payments)
    if asset:
        tickets |= Q(commission_id=asset.commission_id)
    section('support_tickets', SupportTicket.objects.filter(tickets).order_by('created_at', 'pk'), lambda row: {
        'id': row.pk, 'title': row.concern, 'status': row.status, 'recorded_at': row.created_at,
        'payment_id': row.payment_id, 'listing_id': row.artwork_id,
        'note': 'Support case linked to this artwork. Contact/address details and private support messages are restricted.'})
    section('royalty_periods', RoyaltyPeriod.objects.filter(agreement__in=contracts).order_by('starts_on', 'pk'), lambda row: {
        'id': row.pk, 'title': 'Royalty reporting period', 'status': row.status,
        'recorded_at': row.submitted_at, 'agreement_id': row.agreement_id,
        'amount': str(row.amount) if row.amount is not None else None, 'currency': 'PHP',
        'note': f'Reporting period {row.starts_on} to {row.ends_on}; due {row.due_on}.',
        'resolution': row.review_note})
    section('royalty_receipts', RoyaltyReceipt.objects.filter(period__agreement__in=contracts).select_related('period').order_by('created_at', 'pk'), lambda row: {
        'id': row.pk, 'title': 'Royalty receipt', 'status': 'paid', 'recorded_at': row.created_at,
        'agreement_id': row.period.agreement_id, 'amount': str(row.amount), 'currency': 'PHP'})
    section('royalty_funding', RoyaltyFunding.objects.filter(period__agreement__in=contracts).select_related('period').order_by('created_at', 'pk'), lambda row: {
        'id': row.pk, 'title': 'Royalty funds', 'status': row.status, 'recorded_at': row.created_at,
        'agreement_id': row.period.agreement_id, 'amount': str(row.amount), 'currency': 'PHP',
        'note': 'Paid funds and released funds are separate states; see status.'})
    if asset:
        from commissions.models import CommissionRefund, CommissionProof
        section('commission_refunds', CommissionRefund.objects.filter(commission_id=asset.commission_id).order_by('created_at', 'pk'), lambda row: {
            'id': row.pk, 'title': 'Commission refund', 'status': row.status, 'recorded_at': row.created_at,
            'amount': str(row.amount), 'currency': 'PHP', 'note': row.reason})
        section('commission_proofs', CommissionProof.objects.filter(commission_id=asset.commission_id).order_by('pk'), lambda row: {
            'id': row.pk, 'title': 'Commission proof', 'status': row.status, 'recorded_at': None,
            'transaction_hash': row.transaction_hash, 'block_number': row.block_number,
            'proof_hash': row.record_hash})
    return {'artwork_id': artwork.pk if artwork else None, 'record_id': str(record.pk) if record else None,
            'title': artwork.title if artwork else asset.commission.title, 'listing_ids': ids,
            'created_by': person(creator), 'current_holder': person(record.current_owner) if record and record.registered_at else None,
            'claimed_creator': person(record.claimed_creator) if record else person(creator),
            'creator_verification': 'reviewed' if record and record.creator_verified else 'claimed',
            'disputed': bool(record and record.disputed), 'file_hash': record.file_hash if record else None,
            'commission': {'id': asset.commission_id, 'status': asset.commission.status,
                           'buyer': person(asset.commission.buyer), 'artist': person(asset.original_artist),
                           'license': {key: value for key, value in asset.license_terms.items() if key in
                                       ('license_type', 'exclusivity', 'duration_months', 'allow_resale', 'royalty_percentage', 'resale_calculation', 'copyright_policy', 'note')},
                           'record_hash': asset.record_hash} if asset else None,
            'page': page, 'page_size': size, 'has_more': more, 'next_page': page + 1 if any(more.values()) else None,
            'sections': sections,
            'notice': 'Blockchain sections show recorded confirmations/pending attempts. Sales, agreements, copies and support activity are platform records unless linked to a blockchain proof. A traced copy does not prove an outside sale occurred.'}
