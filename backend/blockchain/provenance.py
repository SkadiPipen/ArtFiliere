"""Transactional ownership outbox. Only confirmed chain entries change ownership."""
import hashlib
from django.db import transaction
from django.db.models import Q
from rest_framework.exceptions import APIException
from .models import ProvenanceArtwork, ProvenanceEvent, ProvenanceListing
from .utils import sha256_record

DISCLAIMER = ('This record tracks platform attribution and the ownership entitlement defined by the sale terms. '
              'It does not automatically prove authorship, transfer copyright, or prevent external copying.')


class OwnershipConflict(APIException):
    status_code = 409
    default_detail = 'This artwork is unavailable for an exclusive transfer.'


def license_expiry(start, months):
    if not months:
        return None
    import calendar
    year, month = divmod(start.year * 12 + start.month - 1 + int(months), 12)
    return start.replace(year=year, month=month + 1, day=min(start.day, calendar.monthrange(year, month + 1)[1])).isoformat()


def event(record, kind, reference, previous=None, new=None, payload=None, payment=None):
    payload = dict(payload or {}, artwork_id=str(record.pk), kind=kind, reference=reference,
                   previous_owner=previous.pk if previous else None, new_owner=new.pk if new else None)
    return ProvenanceEvent.objects.get_or_create(reference=reference, defaults={
        'record': record, 'kind': kind, 'previous_owner': previous, 'new_owner': new,
        'payload': payload, 'record_hash': sha256_record(payload), 'payment': payment})[0]


@transaction.atomic
def ensure_artwork(artwork):
    from artworks.models import Artwork
    artwork = Artwork.objects.select_for_update().get(pk=artwork.pk)
    link = ProvenanceListing.objects.filter(artwork=artwork).select_related('record').first()
    if link:
        return link.record
    resale = getattr(artwork, 'commission_resale', None)
    if resale:
        record = ensure_commission(resale.asset)
    else:
        # Hash the original off-chain bytes, not the thumbnail or a client-supplied hash.
        try:
            from artworks.hashing import decode_image_data
            content = decode_image_data(artwork.image_data)
        except ValueError:
            raise OwnershipConflict('A valid original artwork file is required for provenance registration.')
        digest = hashlib.sha256(content).hexdigest()
        if artwork.sha256_hash and artwork.sha256_hash != digest:
            raise OwnershipConflict('Artwork file integrity changed. Creative moderation must review it.')
        record, _ = ProvenanceArtwork.objects.get_or_create(original_artwork=artwork, defaults={
            'file_hash': digest, 'claimed_creator': artwork.artist, 'credited_creator': artwork.artist,
            'initial_owner': artwork.artist, 'current_owner': artwork.artist})
        event(record, 'registration', f'registration:{record.pk}', new=record.initial_owner,
              payload={'file_hash': digest, 'claimed_creator': record.claimed_creator_id,
                       'initial_owner': record.initial_owner_id, 'claim_recorded_at': record.created_at.isoformat()})
    ProvenanceListing.objects.create(artwork=artwork, record=record)
    return record


@transaction.atomic
def ensure_commission(asset):
    record, _ = ProvenanceArtwork.objects.get_or_create(commission_asset=asset, defaults={
        'file_hash': asset.submission.sha256, 'claimed_creator': asset.original_artist,
        'credited_creator': asset.original_artist, 'initial_owner': asset.original_artist, 'current_owner': asset.original_artist})
    event(record, 'registration', f'registration:{record.pk}', new=record.initial_owner,
          payload={'file_hash': record.file_hash, 'claimed_creator': record.claimed_creator_id,
                   'initial_owner': record.initial_owner_id, 'claim_recorded_at': record.created_at.isoformat()})
    c = asset.commission
    if c.status == 'COMPLETE' and c.funded_at and asset.license_terms.get('exclusivity') == 'exclusive':
        rights = {k: asset.license_terms.get(k) for k in ('license_type', 'exclusivity', 'duration_months', 'allow_resale', 'royalty_percentage', 'resale_calculation', 'copyright_policy', 'note')}
        rights['original_commission_terms'] = dict(rights)
        rights['expires_at'] = license_expiry(asset.created_at, rights.get('duration_months'))
        event(record, 'transfer', f'commission:{asset.pk}', previous=asset.original_artist, new=c.buyer,
              payload={'rights': rights, 'commission_id': c.pk, 'payment_reference': c.funding_reference})
    return record


def exclusive(agreement):
    # Sole licenses are distinct: the artist retains use. They are not exclusive title transfers.
    return bool(agreement and agreement.exclusivity == 'exclusive')


def rights_for(agreement):
    result = {'license_type': agreement.license_type, 'exclusivity': agreement.exclusivity,
            'scope': agreement.license_scope, 'allow_resale': agreement.license_scope.get('allow_resale') is True,
            'terms': agreement.document_snapshot or agreement.terms_snapshot,
            'agreement_id': agreement.pk, 'copyright_transferred_automatically': False}
    resale = getattr(agreement.artwork, 'commission_resale', None)
    if resale:
        result['allow_resale'] = resale.asset.license_terms.get('allow_resale') is True
        result['original_commission_terms'] = {k: resale.asset.license_terms.get(k) for k in ('license_type', 'exclusivity', 'duration_months', 'allow_resale', 'royalty_percentage', 'resale_calculation', 'copyright_policy', 'note')}
    link = ProvenanceListing.objects.filter(artwork_id=agreement.artwork_id).first()
    previous = link.record.events.filter(kind='transfer', status='confirmed').order_by('-created_at').first() if link else None
    if previous and previous.payload.get('rights', {}).get('original_owner_restored'):
        previous = None
    if previous:
        result['original_rights_hash'] = previous.record_hash
        result['original_commission_terms'] = previous.payload.get('rights', {}).get('original_commission_terms', result.get('original_commission_terms'))
        result['expires_at'] = previous.payload.get('rights', {}).get('expires_at')
    elif agreement.license_scope.get('duration_months'):
        start = max(x for x in (agreement.artist_signed_at, agreement.buyer_signed_at) if x)
        result['expires_at'] = license_expiry(start, agreement.license_scope['duration_months'])
    return result


def reserve_checkout(payment):
    if payment.is_simulated or not exclusive(payment.agreement):
        return
    link = ProvenanceListing.objects.select_for_update().get(artwork=payment.artwork)
    link.reserved_payment = payment
    link.reserved_rights = rights_for(payment.agreement)
    link.save(update_fields=['reserved_payment', 'reserved_rights'])


def transfer_blockers(record):
    # Refunded requests that never reached the chain (or conclusively reverted) remain
    # in history, but do not permanently lock an artwork whose owner never changed.
    return record.events.filter(kind='transfer').exclude(status='confirmed').exclude(
        Q(status='failed', payment__status='refunded') & (Q(signed_transaction='') | Q(block_number__isnull=False)))


def check_refund(payment):
    item = getattr(payment, 'ownership_transfer', None)
    if not item:
        return
    record = ProvenanceArtwork.objects.select_for_update().get(pk=item.record_id)
    if item.status == 'pending' and item.signed_transaction:
        raise OwnershipConflict('Reconcile the pending blockchain transaction before refunding this exclusive purchase.')
    if item.status == 'confirmed' and (record.current_owner_id != payment.buyer_id or transfer_blockers(record).exists()):
        raise OwnershipConflict('Ownership has changed or another transfer is pending. Review the current owner before refunding.')


def queue_refund(payment):
    item = getattr(payment, 'ownership_transfer', None)
    if not item or payment.status != 'refunded':
        return
    record = ProvenanceArtwork.objects.select_for_update().get(pk=item.record_id)
    if item.status != 'confirmed':
        item.status = 'failed'; item.error = 'Purchase refunded before ownership transferred.'; item.save()
        return
    previous = record.events.filter(kind='transfer', status='confirmed', confirmed_at__lt=item.confirmed_at).order_by('-confirmed_at').first()
    rights = previous.payload.get('rights', {}) if previous else {'original_owner_restored': True}
    event(record, 'transfer', f'refund:{payment.pk}', previous=payment.buyer, new=payment.artist,
          payload={'reason': 'approved_refund', 'refunded_payment_id': payment.pk, 'rights': rights})


@transaction.atomic
def check_checkout(agreement):
    """Called while holding the artwork lock, before creating a provider checkout."""
    from wallets.models import PaymentSession
    listing_sales = PaymentSession.objects.filter(artwork=agreement.artwork, is_simulated=False, status__in=['pending', 'paid']).exclude(agreement=agreement)
    if (agreement.artwork.art_type == 'physical' and listing_sales.exists()) or listing_sales.filter(agreement__exclusivity__in=['exclusive', 'sole']).exists():
        raise OwnershipConflict('This listing is sold or reserved by another purchase.')
    if not exclusive(agreement) and not ProvenanceListing.objects.filter(artwork=agreement.artwork).exists():
        return None
    record = ensure_artwork(agreement.artwork)
    record = ProvenanceArtwork.objects.select_for_update().get(pk=record.pk)
    if record.disputed:
        raise OwnershipConflict('This artwork has an unresolved attribution dispute.')
    # A pending exclusive purchase reserves the entire identity across all listings.
    payments = PaymentSession.objects.filter(artwork__provenance_listing__record=record, is_simulated=False)
    active = payments.filter(status__in=['pending', 'paid']).exclude(agreement=agreement)
    if active.filter(agreement__exclusivity='exclusive').exists():
        # Previous confirmed sales are permitted only on a new resale listing.
        latest = record.events.filter(kind='transfer', status='confirmed').order_by('-created_at').first()
        if active.filter(status='pending', agreement__exclusivity='exclusive').exists() or not latest or latest.new_owner_id != agreement.artist_id:
            raise OwnershipConflict('An exclusive purchase already exists or is being processed.')
    if transfer_blockers(record).exists():
        raise OwnershipConflict('An ownership transfer is awaiting blockchain confirmation.')
    if record.current_owner_id != agreement.artist_id:
        raise OwnershipConflict('Only the confirmed current owner can sell this artwork.')
    latest = record.events.filter(kind='transfer', status='confirmed').order_by('-created_at').first()
    if latest and latest.payload.get('rights', {}).get('original_owner_restored'):
        latest = None
    if latest:
        if not latest.payload.get('rights', {}).get('allow_resale'):
            raise OwnershipConflict('The previous purchase terms do not permit resale.')
        if not exclusive(agreement):
            raise OwnershipConflict('Resale must preserve the exclusive ownership entitlement.')
        original_rights = latest.payload['rights']
        from django.utils.dateparse import parse_datetime
        from django.utils import timezone
        expiry = parse_datetime(original_rights['expires_at']) if original_rights.get('expires_at') else None
        if expiry and timezone.now() >= expiry:
            raise OwnershipConflict('The original ownership license has expired.')
        if (agreement.license_type != original_rights.get('license_type') or
                (original_rights.get('scope') and agreement.license_scope != original_rights['scope'])):
            raise OwnershipConflict('Resale must preserve the original license scope and restrictions.')
        if not original_rights.get('scope') and (agreement.license_scope.get('copyright_transfer') or agreement.license_scope.get('allow_resale') != original_rights.get('allow_resale')):
            raise OwnershipConflict('Preserve the original resale permission; a resale cannot add a copyright assignment.')
    if exclusive(agreement) and active.exists() and not latest:
        raise OwnershipConflict('Existing or pending licenses prevent a new exclusive sale.')
    return record


@transaction.atomic
def queue_payment(payment):
    link = ProvenanceListing.objects.filter(artwork_id=payment.artwork_id, reserved_payment=payment).first()
    if payment.status != 'paid' or payment.is_simulated or not (link or exclusive(payment.agreement)):
        return None
    record = ensure_artwork(payment.artwork)
    record = ProvenanceArtwork.objects.select_for_update().get(pk=record.pk)
    existing = ProvenanceEvent.objects.filter(payment=payment).first()
    if existing:
        return existing
    # Persist a failed request for support instead of undoing a verified charge.
    item = event(record, 'transfer', f'payment:{payment.pk}', previous=payment.artist, new=payment.buyer,
                 payment=payment, payload={'rights': link.reserved_rights if link else rights_for(payment.agreement), 'payment_reference': payment.reference_id,
                                          'paid_at': payment.paid_at.isoformat() if payment.paid_at else None})
    return item


def confirmed_event(item, timestamp, block):
    from datetime import datetime, timezone as dt_timezone
    from .models import ProvenanceReview
    item.status = 'confirmed'; item.error = ''; item.block_number = block
    item.confirmed_at = datetime.fromtimestamp(timestamp, tz=dt_timezone.utc); item.save()
    record = item.record
    if item.kind == 'registration':
        record.registered_at = item.confirmed_at
    elif item.kind == 'transfer':
        record.current_owner_id = item.new_owner_id
        if record.commission_asset_id:
            from commissions.models import CommissionAsset
            CommissionAsset.objects.filter(pk=record.commission_asset_id).update(owner_id=item.new_owner_id)
    else:
        review = ProvenanceReview.objects.get(event=item)
        if item.payload['decision'] == 'approve':
            record.credited_creator_id = review.proposed_creator_id or record.credited_creator_id
            record.creator_verified = True
        record.disputed = (record.reviews.filter(status='pending').exists() or
                           record.events.filter(kind='review').exclude(pk=item.pk).exclude(status='confirmed').exists())
    record.save()


def public_record(record):
    label = lambda user: {'id': user.pk, 'username': user.username}
    # Signed agreements can contain delivery addresses and signatures: never publish their text.
    visible_rights = lambda rights: {k: v for k, v in (rights or {}).items() if k in ('license_type', 'exclusivity', 'scope', 'allow_resale', 'expires_at', 'duration_months', 'copyright_transferred_automatically', 'original_rights_hash', 'royalty_percentage', 'resale_calculation', 'copyright_policy')}
    latest = record.events.filter(kind='transfer', status='confirmed').order_by('-created_at').first()
    return {'artwork_id': str(record.pk), 'file_hash': record.file_hash,
            'claimed_creator': label(record.claimed_creator), 'created_by': label(record.credited_creator),
            'creator_verification': 'reviewed' if record.creator_verified else 'claimed', 'disputed': record.disputed,
            'attribution_review_pending': record.reviews.filter(status='pending').exists(),
            'current_owner': label(record.current_owner) if record.registered_at else None,
            'initial_owner': label(record.initial_owner), 'registered_at': record.registered_at,
            'rights': visible_rights(latest.payload.get('rights')) if latest else None, 'disclaimer': DISCLAIMER,
            'history': [{'id': str(e.pk), 'kind': e.kind, 'status': e.status,
                         'previous_owner': label(e.previous_owner) if e.previous_owner else None,
                         'new_owner': label(e.new_owner) if e.new_owner else None,
                         'timestamp': e.confirmed_at, 'requested_at': e.created_at,
                         'transaction_reference': e.transaction_hash, 'reference': e.reference,
                         'reason': e.payload.get('reason'),
                         'retry_allowed': e.status == 'failed' and (not e.payment_id or e.payment.status == 'paid'),
                         'record_hash': e.record_hash, 'block_number': e.block_number,
                         'chain_id': e.chain_id, 'contract_address': e.contract_address,
                         'previous_attempts': e.previous_attempts,
                         'rights': visible_rights(e.payload.get('rights')), 'review_note': e.payload.get('note') if e.kind == 'review' and e.status == 'confirmed' else None}
                        for e in sorted(record.events.select_related('previous_owner', 'new_owner', 'payment').all(),
                                        key=lambda e: (e.status != 'confirmed', e.confirmed_at or e.created_at, e.created_at))]}
