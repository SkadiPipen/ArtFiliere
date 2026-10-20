from decimal import Decimal, InvalidOperation
from urllib.parse import urlparse
from django.db import transaction
from django.utils import timezone
from rest_framework.response import Response
from rest_framework.exceptions import NotFound, PermissionDenied, ValidationError
from authentication.views import AuthenticatedAPIView
from artworks.models import Artwork
from users.models import User
from .models import ProvenanceArtwork, ProvenanceEvent, ProvenanceListing, ProvenanceReview
from .provenance import ensure_artwork, event, public_record, OwnershipConflict


def get_record(artwork_id):
    import uuid
    if isinstance(artwork_id, uuid.UUID):
        record = ProvenanceArtwork.objects.filter(pk=artwork_id).first()
        if not record:
            raise NotFound('Artwork identity not found.')
        return record
    link = ProvenanceListing.objects.select_related('record').filter(artwork_id=artwork_id).first()
    if not link:
        raise NotFound('Provenance registration has not been requested yet.')
    return link.record


class ProvenanceView(AuthenticatedAPIView):
    def get(self, request, artwork_id):
        record = get_record(artwork_id)
        data = public_record(record)
        user = self.get_request_user(request)
        data['can_review'] = bool(user and user.role in ('platform_admin', 'creative_moderator'))
        data['can_admin'] = bool(user and user.role == 'platform_admin')
        data['can_resell'] = bool(user and record.current_owner_id == user.pk and data['rights'] and data['rights'].get('allow_resale') and not record.disputed and not record.events.filter(kind='transfer').exclude(status='confirmed').exists())
        data['commission_asset_id'] = record.commission_asset_id
        data['can_download_original'] = bool(user and record.registered_at and record.current_owner_id == user.pk)
        data['original_filename'] = record.commission_asset.submission.filename if record.commission_asset_id else f'artwork-{record.pk}.' + {'image/jpeg': 'jpg', 'image/jpg': 'jpg', 'image/webp': 'webp'}.get(record.original_artwork.image_data.split(';', 1)[0].removeprefix('data:'), 'png')
        return Response(data)

    def post(self, request, artwork_id):
        import uuid
        if isinstance(artwork_id, uuid.UUID):
            raise ValidationError('Registration is requested through the original approved listing.')
        user = self.get_request_user(request)
        artwork = Artwork.objects.filter(pk=artwork_id, status='approved').first()
        if not user or not artwork or artwork.artist_id != user.pk:
            raise PermissionDenied('Only the approved listing owner can request registration.')
        return Response(public_record(ensure_artwork(artwork)), status=202)


class FileIntegrityView(AuthenticatedAPIView):
    def post(self, request, artwork_id):
        import hashlib
        record = get_record(artwork_id)
        file = request.FILES.get('file')
        if not file or file.size > 10 * 1024 * 1024:
            raise ValidationError('Choose an original file of at most 10 MB.')
        digest = hashlib.sha256()
        for chunk in file.chunks():
            digest.update(chunk)
        return Response({'matches': digest.hexdigest() == record.file_hash, 'registered_hash': record.file_hash,
                         'file_hash': digest.hexdigest(), 'registration_confirmed': bool(record.registered_at)})


class ProvenanceOriginalView(AuthenticatedAPIView):
    def get(self, request, artwork_id):
        import hashlib
        from django.http import HttpResponse
        from artworks.hashing import decode_image_data
        record = get_record(artwork_id)
        user = self.get_request_user(request)
        if not user or not record.registered_at or record.current_owner_id != user.pk:
            raise PermissionDenied('Only the confirmed current owner may download the registered original here.')
        if record.commission_asset_id:
            submission = record.commission_asset.submission
            raw = bytes(submission.content); mime = submission.content_type
        else:
            image = record.original_artwork.image_data
            try:
                raw = decode_image_data(image)
            except ValueError:
                raise OwnershipConflict('The registered original file is unavailable. Contact support.')
            mime = image.split(';', 1)[0].removeprefix('data:')
        if hashlib.sha256(raw).hexdigest() != record.file_hash:
            raise OwnershipConflict('The original file no longer matches the registered hash. Contact support.')
        response = HttpResponse(raw, content_type=mime)
        response['Content-Disposition'] = 'attachment; filename="artwork-original"'
        response['Cache-Control'] = 'private, no-store'
        response['X-Content-Type-Options'] = 'nosniff'
        return response


class ProvenanceReviewQueueView(AuthenticatedAPIView):
    def get(self, request):
        user = self.get_request_user(request)
        if not user or user.role not in ('platform_admin', 'creative_moderator'):
            raise PermissionDenied('An admin or creative moderator account is required.')
        reviews = ProvenanceReview.objects.filter(status='pending').select_related('record', 'requested_by').order_by('created_at')[:100]
        failed = ProvenanceEvent.objects.filter(status='failed').select_related('record').order_by('created_at')[:100]
        return Response({'reviews': [{'id': r.pk, 'artwork_id': str(r.record_id), 'requested_by': r.requested_by.username, 'reason': r.reason} for r in reviews],
                         'failed_transactions': [{'id': str(e.pk), 'artwork_id': str(e.record_id), 'kind': e.kind} for e in failed]})


class ProvenanceResaleView(AuthenticatedAPIView):
    @transaction.atomic
    def post(self, request, artwork_id):
        user = self.get_request_user(request)
        record = ProvenanceArtwork.objects.select_for_update().get(pk=get_record(artwork_id).pk)
        if not user or record.current_owner_id != user.pk or not record.registered_at:
            raise PermissionDenied('Only the confirmed current owner may list a resale.')
        latest = record.events.filter(kind='transfer', status='confirmed').order_by('-created_at').first()
        if not latest or not latest.payload.get('rights', {}).get('allow_resale') or record.disputed:
            raise OwnershipConflict('The confirmed purchase terms do not authorize resale.')
        if record.commission_asset_id:
            # Retain the existing royalty allocation path; a generic listing must not bypass it.
            from commissions.resale import CommissionResaleView
            return CommissionResaleView().post(request, asset_id=record.commission_asset_id)
        if record.events.filter(kind='transfer').exclude(status='confirmed').exists():
            raise OwnershipConflict('Wait for the current ownership transaction to be confirmed.')
        from django.utils.dateparse import parse_datetime
        expiry = latest.payload['rights'].get('expires_at')
        if expiry and timezone.now() >= parse_datetime(expiry):
            raise OwnershipConflict('The original license has expired.')
        if record.listings.filter(artwork__artist=user, artwork__status__in=['approved', 'pending']).exclude(artwork__payment_sessions__status='paid').exists():
            raise OwnershipConflict('An active resale listing already exists.')
        try:
            price = Decimal(str(request.data.get('price')))
            if not price.is_finite() or price <= 0 or price > Decimal('99999999.99') or price != price.quantize(Decimal('.01')):
                raise ValueError()
        except (ValueError, InvalidOperation):
            raise ValidationError('Enter a positive price in PHP with at most two decimal places.')
        original = record.original_artwork or Artwork.objects.get(pk=artwork_id)
        listing = Artwork.objects.create(artist=user, title=original.title, description=original.description,
            category=original.category, tags=original.tags, price=price, art_type=original.art_type,
            image_data=original.image_data, status='pending', sale_type='DIRECT')
        ProvenanceListing.objects.create(artwork=listing, record=record)
        return Response({'artwork_id': str(record.pk), 'listing_id': listing.pk, 'status': 'pending', 'required_rights': latest.payload['rights']}, status=201)


class ProvenanceReviewView(AuthenticatedAPIView):
    def get(self, request, artwork_id):
        user = self.get_request_user(request)
        if not user or user.role not in ('platform_admin', 'creative_moderator', 'customer_support'):
            raise PermissionDenied('Moderator access is required.')
        return Response(list(get_record(artwork_id).reviews.values('id', 'reason', 'evidence_links', 'proposed_creator_id', 'status', 'requested_by_id', 'reviewed_by_id', 'decision_note', 'created_at')))

    @transaction.atomic
    def post(self, request, artwork_id):
        user = self.get_request_user(request)
        if not user:
            raise PermissionDenied('Sign in to submit an attribution dispute.')
        record = ProvenanceArtwork.objects.select_for_update().get(pk=get_record(artwork_id).pk)
        reason = str(request.data.get('reason', '')).strip()
        links = request.data.get('evidence_links', [])
        if not reason or len(reason) > 4000 or not isinstance(links, list) or len(links) > 10 or any(not isinstance(x, str) or len(x) > 2000 or urlparse(x).scheme not in ('http', 'https') or not urlparse(x).netloc for x in links):
            raise ValidationError('Provide a reason and up to 10 valid evidence links.')
        creator_id = request.data.get('proposed_creator_id')
        creator = User.objects.filter(pk=creator_id).first() if creator_id else None
        if creator_id and not creator:
            raise ValidationError('Proposed creator account does not exist.')
        if record.reviews.filter(requested_by=user, status='pending').exists():
            raise OwnershipConflict('Your attribution review is already pending.')
        review = ProvenanceReview.objects.create(record=record, requested_by=user, proposed_creator=creator, reason=reason, evidence_links=links)
        # An arbitrary third-party allegation cannot unilaterally freeze someone else's sale.
        if user.pk in (record.claimed_creator_id, record.current_owner_id) or user.role in ('platform_admin', 'creative_moderator'):
            record.disputed = True; record.save(update_fields=['disputed'])
        return Response({'review_id': review.pk, 'status': review.status}, status=201)

    @transaction.atomic
    def patch(self, request, artwork_id):
        user = self.get_request_user(request)
        if not user or user.role not in ('platform_admin', 'creative_moderator'):
            raise PermissionDenied('An admin or creative moderator must review attribution.')
        record = ProvenanceArtwork.objects.select_for_update().get(pk=get_record(artwork_id).pk)
        review = record.reviews.select_for_update().filter(pk=request.data.get('review_id'), status='pending').first()
        if not review:
            raise OwnershipConflict('Review is missing or already decided.')
        if user.pk in (review.requested_by_id, review.proposed_creator_id, record.claimed_creator_id):
            raise PermissionDenied('An independent reviewer is required.')
        decision = request.data.get('decision'); note = str(request.data.get('note', '')).strip()
        if decision not in ('approve', 'reject') or not note or len(note) > 4000:
            raise ValidationError('Provide an approve/reject decision and a review explanation.')
        review.reviewed_by = user; review.decision_note = note; review.reviewed_at = timezone.now(); review.status = decision
        record.disputed = True; record.save(update_fields=['disputed'])
        review.event = event(record, 'review', f'review:{review.pk}', payload={
            'review_id': review.pk, 'decision': decision, 'note': note, 'reviewer_id': user.pk,
            'proposed_creator_id': review.proposed_creator_id, 'reason': review.reason, 'evidence_links': review.evidence_links})
        review.save()
        return Response({'status': 'pending_blockchain', 'event_id': str(review.event_id)}, status=202)


class ProvenanceRetryView(AuthenticatedAPIView):
    @transaction.atomic
    def post(self, request, artwork_id):
        user = self.get_request_user(request)
        record = ProvenanceArtwork.objects.select_for_update().get(pk=get_record(artwork_id).pk)
        if not user or user.pk != record.current_owner_id and user.role != 'platform_admin':
            raise PermissionDenied('Only the current owner or administrator may request reconciliation.')
        failed = record.events.select_for_update().filter(pk=request.data.get('event_id'), status='failed').first() if request.data.get('event_id') else None
        if failed:
            if user.role != 'platform_admin':
                raise PermissionDenied('An administrator must review a failed ownership transfer.')
            if failed.payment_id and failed.payment.status == 'refunded':
                raise OwnershipConflict('This purchase was refunded; its failed transfer must not be retried.')
            if record.disputed or failed.kind == 'transfer' and record.current_owner_id != failed.previous_owner_id:
                raise OwnershipConflict('Resolve the ownership or attribution conflict before retrying.')
            if failed.signed_transaction:
                from .ownership_chain import connection
                w3, registry = connection()
                if failed.chain_id != w3.eth.chain_id or failed.contract_address.lower() != registry.address.lower():
                    raise OwnershipConflict('Restore the original chain configuration before retrying.')
                receipt = w3.eth.get_transaction_receipt(failed.transaction_hash)
                if receipt.status != 0:
                    raise OwnershipConflict('This transaction has not conclusively reverted. Reconcile its original hash.')
                failed.previous_attempts.append({'transaction_hash': failed.transaction_hash, 'status': 'failed', 'block_number': receipt.blockNumber})
                failed.signed_transaction = ''; failed.transaction_hash = ''; failed.nonce = None; failed.sender = ''
            failed.status = 'pending'; failed.error = ''; failed.save()
        # Pending transactions are always resent with the identical signed hash.
        count = record.events.filter(status='pending').count()
        return Response({'pending_transactions': count, 'message': 'The blockchain worker will reconcile pending transactions. Failed transfers require support review.'}, status=202)
