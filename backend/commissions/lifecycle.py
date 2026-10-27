"""Versioned commission contracts and verified money movement."""
import hashlib
import hmac
import json
import secrets
import re
from datetime import timedelta
from decimal import Decimal, InvalidOperation

import requests
from django.conf import settings
from django.db import transaction
from django.http import HttpResponse
from django.utils import timezone
from rest_framework.exceptions import APIException, ValidationError, PermissionDenied, NotFound
from rest_framework.response import Response
from rest_framework.views import APIView
from authentication.views import AuthenticatedAPIView
from authentication.services import account_access
from wallets.restrictions import RestrictedAccessView
from messaging.models import Agreement, AgreementTemplate, Conversation, ConversationParticipant
from messaging.compensation import validate_compensation, compensation_summary
from users.models import User
from notifications.models import UserNotification
from wallets.models import SupportTicket
from .models import (CommissionRequest, CommissionMilestone, CommissionProposal, CommissionSubmission,
                     CommissionPayoutProfile, CommissionLedger, CommissionAsset)
from .availability import conflicts
from .royalty_policy import POLICY as RESALE_POLICY, SUMMARY as RESALE_SUMMARY


class Conflict(APIException):
    status_code = 409
    default_detail = 'This action is unavailable in the current commission state.'


def money(value):
    try:
        value = Decimal(str(value))
        if not value.is_finite() or value < 0 or value > Decimal('999999999.99') or value != value.quantize(Decimal('.01')):
            raise ValueError()
        return value.quantize(Decimal('.01'))
    except (ValueError, InvalidOperation, TypeError):
        raise ValidationError('Enter a valid PHP amount with at most two decimal places.')


def notify(c, user, title, message):
    UserNotification.objects.create(user=user, commission=c, title=title, message=message)


def normalized_terms(c, data, accepting=False):
    price = money(data.get('price', c.time_duration))
    if price <= 0:
        raise ValidationError('The agreed total must be positive.')
    percentages = data.get('milestones', [30, 30, 40])
    if not isinstance(percentages, list) or len(percentages) != 3 or any(type(v) is not int or v <= 0 for v in percentages) or sum(percentages) != 100:
        raise ValidationError('The three milestone percentages must total 100.')
    license_type = data.get('license_type', 'personal')
    exclusivity = str(data.get('exclusivity', 'non_exclusive')).replace('-', '_')
    if license_type not in ('personal', 'commercial') or exclusivity not in ('non_exclusive', 'exclusive', 'sole'):
        raise ValidationError('Invalid license or exclusivity.')
    try:
        deadline = timezone.datetime.fromisoformat(str(data.get('deadline', c.deadline.isoformat())).replace('Z', '+00:00'))
        if timezone.is_naive(deadline) or deadline <= timezone.now(): raise ValueError()
    except (ValueError, TypeError):
        raise ValidationError('Choose a future completion date including timezone.')
    if conflicts(c.artist_id, deadline, c.pk):
        raise Conflict('That completion date is booked.')
    royalty = money(data.get('royalty_percentage', 0))
    if royalty > 100: raise ValidationError('Royalty percentage must be between 0 and 100.')
    allow_resale = data.get('allow_resale') is True
    category = data.get('compensation_type', 'one_time')
    raw_compensation = data.get('compensation_terms') or {}
    if not isinstance(raw_compensation, dict): raise ValidationError('Provide valid commercial royalty terms.')
    if license_type == 'personal' and category != 'one_time':
        raise ValidationError('Personal commissions use a one-time production fee; commercial-use royalties require a commercial license.')
    if royalty and not allow_resale: raise ValidationError('Resale royalties require explicit resale permission.')
    if royalty and not accepting:
        standard = getattr(settings, 'COMMISSION_RESALE_ROYALTY_PERCENTAGE', None)
        if standard is None:
            raise ValidationError('The system resale royalty percentage has not been configured.')
        if royalty != money(standard):
            raise ValidationError('Use the system standard resale royalty percentage.')
    if category not in ('one_time', 'hybrid') or (category == 'one_time' and raw_compensation.get('subtype', 'one_time_payment') != 'one_time_payment') or (category == 'hybrid' and not str(raw_compensation.get('subtype', '')).startswith('upfront_')):
        raise ValidationError('Commission production requires a full upfront fee. Choose one-time payment or upfront fee plus commercial royalties.')
    duration = data.get('duration_months', 0)
    if type(duration) is not int or not 0 <= duration <= 60 or (license_type == 'commercial' and duration == 0):
        raise ValidationError('Commercial licenses need a duration between 1 and 60 months.')
    if category == 'hybrid' and raw_compensation.get('reporting_duration_months', duration) != duration:
        raise ValidationError('Royalty reporting duration must match the agreed commercial license duration.')
    try:
        compensation = validate_compensation({'compensation_type': category, 'compensation_terms': {**raw_compensation, 'reporting_duration_months': duration}}, c.buyer, license_type)
    except PermissionError as error: raise PermissionDenied(str(error))
    except ValueError as error: raise ValidationError(str(error))
    if category == 'hybrid': compensation['reporting_policy'] = 'commission_delivery_plus_7_days_artist_approval'
    note = str(data.get('note', '')).strip()
    if len(note) > 4000: raise ValidationError('Notes must be at most 4000 characters.')
    delivery = {}
    delivery_token = data.get('delivery_quote', '')
    if c.art_type.lower() == 'physical':
        from .delivery import verify_delivery
        previous = c.proposals.order_by('-version').first() if c.pk else None
        trusted = accepting or bool(previous and previous.terms.get('delivery_quote') == delivery_token)
        delivery = verify_delivery(c, delivery_token, max_age=None if trusted else 900)
    delivery_fee = money(delivery.get('fee', 0))
    floor_unit = str(data.get('delivery_floor_unit', '')).strip()
    instruction = str(data.get('delivery_instruction', '')).strip()
    if len(floor_unit) > 200 or len(instruction) > 1000:
        raise ValidationError('Floor/unit must be at most 200 characters and delivery instructions at most 1000.')
    if delivery_fee >= price: raise ValidationError('Delivery fee must be below the total.')
    fee = ((price - delivery_fee) / Decimal('11')).quantize(Decimal('.01'))
    net = price - fee - delivery_fee
    amounts = [(net * Decimal(p) / 100).quantize(Decimal('.01')) for p in percentages]
    amounts[2] = net - amounts[0] - amounts[1]
    if any(amount <= 0 for amount in amounts):
        raise ValidationError('The total must fund a positive amount for every milestone.')
    delivery_address = str(delivery.get('delivery_address', '')).strip()
    pickup_address = str(delivery.get('pickup_address', '')).strip()
    if len(delivery_address) > 500 or len(pickup_address) > 500:
        raise ValidationError('Delivery addresses must be at most 500 characters.')
    return {'price': str(price), 'deadline': deadline.isoformat(), 'milestones': percentages,
            'license_type': license_type, 'exclusivity': exclusivity, 'duration_months': duration,
            'royalty_percentage': str(royalty), 'allow_resale': allow_resale,
            'compensation_type': category, 'compensation_terms': compensation,
            'commercial_royalty_policy': ('Production is funded fully upfront. Commercial royalties start after final delivery approval, use separate sales reports and artist approval, and require separate buyer payment authorization. Milestone approval never collects commercial royalties.' if category == 'hybrid' else 'No commercial-use royalties apply; the production fee is paid upfront.'),
            'resale_calculation': (data.get('resale_calculation', '') if accepting else RESALE_POLICY) if royalty else '',
            'royalty_policy': (data.get('royalty_policy', RESALE_SUMMARY) if accepting else RESALE_SUMMARY),
            'platform_fee': str(fee), 'delivery_fee': str(delivery_fee), 'artist_total': str(price - fee - delivery_fee),
            'delivery_address': delivery_address, 'pickup_address': pickup_address,
            'delivery_quote': delivery_token if delivery else '', 'delivery_details': delivery,
            'delivery_floor_unit': floor_unit if delivery else '', 'delivery_instruction': instruction if delivery else '',
            'delivery_policy': 'Physical delivery fee is paid to the artist with final approval to cover courier costs. Buyer confirms receipt before final approval.',
            'revision_limit_per_stage': 1, 'review_days': 5, 'note': note,
            'payment_policy': 'Full upfront funding within 48 hours of both signatures. Work starts after verified payment.',
            'cancellation_policy': 'Disputes freeze unreleased funds. Customer Service reviews refunds; released milestones are not automatically recoverable.',
            'fee_policy': 'Platform fee included. Provider transaction and payout fees borne by platform. Shipping separately allocated.',
            'copyright_policy': 'Artist retains copyright. Buyer owns the deliverable with the agreed license. Resale requires explicit permission.'}


@transaction.atomic
def create_request(buyer, artist, data, deadline, total_price):
    if buyer.pk == artist.pk: raise ValidationError('You cannot commission yourself.')
    c = CommissionRequest.objects.create(buyer=buyer, artist=artist, title=str(data.get('title') or data.get('subject'))[:100],
        subject=data.get('subject', ''), style=data.get('style', ''), description=data.get('description', ''),
        art_type=data.get('art_type', 'Digital'), tags=str(data.get('tags', ''))[:255], deadline=deadline,
        time_duration=total_price, is_rush_job=data.get('is_rush_job') is True, flow_version=2, status='NEGOTIATING')
    terms = normalized_terms(c, data.get('proposal') or {})
    CommissionProposal.objects.create(commission=c, proposer=buyer, version=1, terms=terms)
    notify(c, artist, 'Commission proposal received', f'{buyer.username}: PHP {terms["price"]}; deadline {terms["deadline"]}; milestones {terms["milestones"]}. One revision comment per stage.')
    from .models import CommissionPhoto
    for image in (data.get('reference_images') or [])[:4]:
        if isinstance(image, str) and len(image) <= 10 * 1024 * 1024:
            CommissionPhoto.objects.create(commission_req=c, image_url=image, photo_type='REFERENCE')
    return Response({'commission_req_id': c.pk, 'status': c.status}, status=201)


def check_frozen(c):
    if c.disputed or SupportTicket.objects.filter(commission=c).exclude(status__in=['resolved', 'closed']).exists():
        raise Conflict('Funds are frozen while Customer Service reviews this commission.')


def signed(c):
    a = c.agreement
    return bool(a and a.artist_signed_at and a.buyer_signed_at and a.artist_signature_image and a.buyer_signature_image)


@transaction.atomic
def signatures_completed(agreement):
    c = CommissionRequest.objects.select_for_update().filter(agreement=agreement, flow_version=2).first()
    if not c or c.status != 'SIGNING' or not signed(c): return
    User.objects.select_for_update().get(pk=c.artist_id)
    if conflicts(c.artist_id, c.deadline, c.pk):
        raise Conflict('The completion date is now booked. Contact Customer Service to renegotiate.')
    c.status = 'AWAITING_FUNDS'; c.accepted_at = timezone.now(); c.funding_due_at = timezone.now() + timedelta(hours=48); c.save()
    notify(c, c.buyer, 'Commission agreement signed', 'Artist accepted your commission request! Proceed to fund the full commission within 48 hours.')


def expire(c):
    if c.status == 'AWAITING_FUNDS' and c.funding_due_at and c.funding_due_at <= timezone.now() and not c.funded_at:
        c.status = 'CANCELLED'; c.save(update_fields=['status'])
        notify(c, c.artist, 'Commission funding expired', 'The funding deadline expired; the calendar date is available again.')


def serialize(c, user):
    latest = c.proposals.order_by('-version').first()
    milestones = []
    for m in c.milestones.order_by('milestone_number'):
        milestones.append({'id': m.pk, 'number': m.milestone_number, 'label': m.stage_label, 'percentage': m.percentage,
            'amount': str(m.amount), 'status': m.status, 'payout_status': m.payout_status, 'payout_error': m.payout_error,
            'revision_comment': m.revision_comment, 'revision_used': bool(m.revision_requested_at),
            'revision_requested_at': m.revision_requested_at, 'revision_reply': m.revision_reply, 'revision_replied_at': m.revision_replied_at,
            'review_due_at': m.review_due_at, 'delivery_ready_at': m.delivery_ready_at, 'approved_at': m.approved_at,
            'submissions': [{'id': s.pk, 'name': s.filename, 'type': s.content_type, 'sha256': s.sha256, 'cid': s.cid,
                'caption': s.caption, 'uploaded_at': s.uploaded_at, 'final_original': s.final_original,
                'proof': {'status': s.proof.status, 'transaction_hash': s.proof.transaction_hash, 'record_hash': s.proof.record_hash} if hasattr(s, 'proof') else None,
                'download_allowed': not s.final_original or user.pk == c.artist_id or c.status == 'COMPLETE'} for s in m.submissions.order_by('pk')]})
    from .shipping import delivery_status
    delivery = delivery_status(c)
    asset = CommissionAsset.objects.filter(commission=c).first()
    provenance = getattr(asset, 'provenance_origin', None) if asset else None
    asset_owner = (provenance.current_owner.username if provenance and provenance.registered_at else 'Awaiting blockchain confirmation') if asset and asset.license_terms.get('exclusivity') == 'exclusive' else asset.owner.username if asset else ''
    return {'id': c.pk, 'title': c.title, 'status': c.status, 'is_artist': user.pk == c.artist_id,
        'artist': c.artist.username, 'buyer': c.buyer.username, 'artist_id': c.artist_id, 'buyer_id': c.buyer_id,
        'buyer_royalty_enabled': c.buyer.royalty_enabled,
        'art_type': c.art_type, 'deadline': c.deadline, 'description': c.description, 'subject': c.subject, 'style': c.style,
        'reference_images': list(c.photos.filter(photo_type='REFERENCE').values_list('image_url', flat=True)),
        'proposal': {'id': latest.pk, 'version': latest.version, 'terms': latest.terms, 'status': latest.status,
                     'is_proposer': latest.proposer_id == user.pk} if latest else None,
        'agreement_id': c.agreement_id, 'fully_signed': signed(c), 'funding_due_at': c.funding_due_at,
        'funding_pending': bool(c.funding_provider_id and not c.funded_at),
        'funded_at': c.funded_at, 'held_amount': str(c.held_amount), 'platform_fee': str(c.platform_fee),
        'terms': c.locked_terms, 'milestones': milestones, 'disputed': c.disputed,
        'courier_tracking': c.courier_tracking, 'delivered_at': c.delivered_at, 'delivery': delivery,
          'asset': {'id': asset.pk, 'record_hash': asset.record_hash, 'license': asset.license_terms, 'owner': asset_owner,
              'provenance_id': str(asset.provenance_origin.pk) if hasattr(asset, 'provenance_origin') else None,
            'proof_status': asset.proof.status if hasattr(asset, 'proof') else 'PENDING',
            'transaction_hash': asset.proof.transaction_hash if hasattr(asset, 'proof') else ''} if asset else None}


def accept_proposal(c, latest):
    terms = normalized_terms(c, latest.terms, accepting=True)
    if c.art_type.lower() == 'physical' and (not terms['delivery_address'] or not terms['pickup_address']):
        raise ValidationError('Agree on the physical delivery destination and pickup address before accepting.')
    template, _ = AgreementTemplate.objects.get_or_create(name='Commission milestone agreement', defaults={'body': 'Commission milestone agreement'})
    conv = Conversation.objects.create()
    ConversationParticipant.objects.bulk_create([ConversationParticipant(conversation=conv, user=c.buyer), ConversationParticipant(conversation=conv, user=c.artist)])
    document = '\n\n'.join(['ART LICENSING AND COMMISSION AGREEMENT', f'Artist: {c.artist.username}; Buyer: {c.buyer.username}',
        f'Subject: {c.subject}; Style: {c.style}; Deliverable: {c.art_type}\nInstructions: {c.description}',
        *[f'{key.replace("_", " ").title()}: {value}' for key, value in terms.items() if key not in ('compensation_terms', 'delivery_quote', 'delivery_details')],
        compensation_summary(terms['compensation_type'], terms['compensation_terms']) if terms['license_type'] == 'commercial' else 'Personal commission: one-time production fee without commercial-use royalties. Optional resale permission and resale royalties apply only as explicitly agreed above.',
        'One consolidated buyer revision request/comment per stage. A revision does not create another entitlement. Extra scope requires a separate agreement.',
        'Copyright remains with the original artist. The buyer receives the agreed personal or commercial license; ownership of this asset record does not transfer copyright.',
        'Personal use permits non-commercial display and sharing. Commercial use permits reproduction, advertising and merchandise during the agreed license duration. Resale of the licensed asset is permitted only when Allow Resale above is True; subsequent owners inherit the same restrictions and expiry.',
        'Non-exclusive rights permit other licenses. Exclusive rights prevent the artist licensing the same work to others during the license term. Sole rights permit use by the artist and this buyer, without licenses to others during that term.',
        'Review within five days. Inactivity escalates to Customer Service, never automatic approval. Physical final approval requires receipt and inspection.'])
    a = Agreement.objects.create(conversation=conv, template=template, buyer=c.buyer, artist=c.artist, price=terms['price'],
        terms_snapshot=document, document_snapshot=document, status='accepted', buyer_accepted_at=timezone.now(), artist_accepted_at=timezone.now(),
        license_type=terms['license_type'], exclusivity=terms['exclusivity'], delivery_type=c.art_type.lower(), delivery_fee=terms['delivery_fee'], revision_limit=1,
        compensation_type=terms['compensation_type'], compensation_terms=terms['compensation_terms'])
    c.agreement = a; c.locked_terms = terms; c.time_duration = terms['price']; c.deadline = terms['deadline']; c.platform_fee = terms['platform_fee']; c.status = 'SIGNING'; c.save()
    latest.status = 'ACCEPTED'; latest.save(update_fields=['status'])
    net = money(terms['artist_total']); amounts = [(net * Decimal(p) / 100).quantize(Decimal('.01')) for p in terms['milestones']]
    amounts[2] = net - amounts[0] - amounts[1]
    amounts[2] += money(terms['delivery_fee'])
    for index, percentage in enumerate(terms['milestones']):
        CommissionMilestone.objects.create(commission_req=c, milestone_number=index + 1, percentage=percentage, amount=amounts[index], stage_label=['Sketch / Draft', 'WIP / Lineart', 'Final deliverable'][index])
    for user in (c.buyer, c.artist): notify(c, user, 'Commission terms agreed', 'Review and sign the locked agreement before funding.')


class CommissionFlowView(RestrictedAccessView):
    def participant(self, request, pk, locked=False):
        user = self.account(request)
        if not user: raise PermissionDenied('Sign in to access commissions.')
        rows = CommissionRequest.objects.select_related('artist', 'buyer', 'agreement')
        if locked: rows = rows.select_for_update(of=('self',))
        c = rows.filter(pk=pk, flow_version=2).first()
        if not c or user.pk not in (c.artist_id, c.buyer_id): raise NotFound('Commission not found.')
        access = account_access(user)
        if access['banned'] or access['suspended']:
            from .workspace import can_work, eligible
            allowed = user.pk == c.artist_id and eligible(c) and can_work(c)
            if access['banned'] and not allowed: raise PermissionDenied('This commission is unavailable for restricted work.')
            if request.method not in ('GET', 'HEAD', 'OPTIONS'):
                if not allowed or request.data.get('action') not in ('submit', 'ship', 'reply_revision', 'request_pickup'):
                    raise PermissionDenied('Restricted artists may only complete approved existing commissions; new negotiations and payments are blocked.')
        return user, c

    @transaction.atomic
    def get(self, request, pk):
        user, c = self.participant(request, pk, True)
        expire(c)
        return Response(serialize(c, user))

    @transaction.atomic
    def post(self, request, pk):
        user, c = self.participant(request, pk, True)
        expire(c)
        action = request.data.get('action')
        artist = user.pk == c.artist_id
        latest = c.proposals.order_by('-version').first()
        if action in ('counter', 'accept', 'decline'):
            if c.status != 'NEGOTIATING' or not latest or latest.status != 'PROPOSED': raise Conflict('This proposal is no longer open.')
            if request.data.get('version') != latest.version: raise Conflict('The proposal changed. Reload before responding.')
            if action != 'counter' and latest.proposer_id == user.pk: raise PermissionDenied('Only the counterpart can accept or decline.')
            if action == 'counter':
                terms = normalized_terms(c, request.data.get('terms') or {})
                latest.status = 'SUPERSEDED'; latest.save(update_fields=['status'])
                CommissionProposal.objects.create(commission=c, proposer=user, version=latest.version + 1, terms=terms)
                notify(c, c.buyer if artist else c.artist, 'Commission counter-offer', f'Proposal version {latest.version + 1} is ready to review.')
            elif action == 'decline':
                latest.status = 'DECLINED'; latest.save(update_fields=['status']); c.status = 'CANCELLED'; c.save()
                notify(c, c.buyer if artist else c.artist, 'Commission proposal declined', 'The commission proposal was declined.')
            else: accept_proposal(c, latest)
        elif action == 'fund':
            if artist: raise PermissionDenied('Only the buyer can fund the commission.')
            check_frozen(c)
            if c.status != 'AWAITING_FUNDS' or not signed(c): raise Conflict('Both signatures are required before funding.')
            return Response({'checkout_url': funding_checkout(c)})
        elif action == 'refresh_payment':
            if not c.funding_provider_id or not settings.XENDIT_SECRET_KEY: raise Conflict('No payment provider session exists.')
            try:
                response = requests.get(f'https://api.xendit.co/v2/invoices/{c.funding_provider_id}', auth=(settings.XENDIT_SECRET_KEY, ''), timeout=20)
                response.raise_for_status(); apply_funding(response.json()); c.refresh_from_db()
            except (requests.RequestException, ValueError): raise Conflict('Unable to verify payment with Xendit. Retry later.')
        elif action in ('revise', 'approve', 'submit', 'ship', 'receive', 'payout', 'reply_revision', 'ready_delivery', 'request_pickup'):
            production_action(c, user, request, action)
        elif action in ('dispute', 'cancel_request'):
            if c.status == 'CANCELLED': raise Conflict('This commission is already closed.')
            reason = str(request.data.get('reason', '')).strip()
            if not 5 <= len(reason) <= 4000: raise ValidationError('Explain the concern (5 to 4000 characters).')
            if action == 'cancel_request' and not c.funded_at:
                if c.funding_provider_id: raise Conflict('A checkout exists. Contact Customer Service to reconcile it before cancellation.')
                c.status = 'CANCELLED'
            else:
                c.disputed = True
                ticket = SupportTicket.objects.create(requester=user, commission=c, concern='commission_dispute', details=reason)
                for staff in User.objects.filter(role='customer_support'): notify(c, staff, 'Commission dispute / cancellation', f'Ticket #{ticket.pk}: {reason[:200]}')
            c.save()
        else: raise ValidationError('Unknown commission action.')
        return Response(serialize(c, user))


def production_action(c, user, request, action):
    check_frozen(c)
    artist = user.pk == c.artist_id
    if not c.funded_at or c.status not in ('STAGE_1', 'STAGE_2', 'STAGE_3', 'COMPLETE'): raise Conflict('Production requires verified upfront funding.')
    m = c.milestones.filter(pk=request.data.get('milestone_id')).first()
    if not m: raise NotFound('Milestone not found.')
    current = c.milestones.filter(approved_at__isnull=True).order_by('milestone_number').first()
    if action != 'payout' and (not current or current.pk != m.pk): raise Conflict('Only the current stage can be updated.')
    if action == 'submit':
        if not artist: raise PermissionDenied('Only the artist can submit work.')
        if m.status not in ('PENDING', 'REVISION_REQUESTED') or m.delivery_ready_at: raise Conflict('This stage is awaiting buyer review or already approved for delivery.')
        upload = request.FILES.get('file')
        if not upload or upload.size > 30 * 1024 * 1024: raise ValidationError('Upload a file up to 30 MB.')
        raw = upload.read(); mime = valid_file(raw)
        caption = str(request.data.get('caption', '')).strip()
        if len(caption) > 2000: raise ValidationError('Caption is too long.')
        final = m.milestone_number == 3 and c.art_type.lower() == 'digital'
        if final and mime == 'application/pdf': raise ValidationError('Final digital delivery currently accepts PNG, JPEG, WebP or TIFF for secure image inspection.')
        submission = CommissionSubmission.objects.create(milestone=m, uploader=user, filename=upload.name[:200], content_type=mime, content=raw, sha256=hashlib.sha256(raw).hexdigest(), caption=caption, final_original=final)
        from .proofs import submission_proof
        submission_proof(submission)
        if m.milestone_number == 3 and c.art_type.lower() == 'physical':
            c.delivered_at = None; c.courier_tracking = ''; c.save()
        m.status = 'SUBMITTED'; m.review_due_at = timezone.now() + timedelta(days=5); m.save()
        notify(c, c.buyer, 'Commission stage submitted', f'{m.stage_label} is ready. Review within five days; one revision comment is allowed.')
    elif action == 'revise':
        if artist: raise PermissionDenied('Only the buyer can request a revision.')
        if m.status != 'SUBMITTED' or m.revision_requested_at or m.delivery_ready_at: raise Conflict('Only one revision request/comment is allowed per stage.')
        comment = str(request.data.get('comment', '')).strip()
        if not 1 <= len(comment) <= 2000: raise ValidationError('Enter one consolidated revision comment up to 2000 characters.')
        m.revision_comment = comment; m.revision_requested_at = timezone.now(); m.status = 'REVISION_REQUESTED'; m.review_due_at = None; m.save()
        notify(c, c.artist, 'Commission revision requested', f'{m.stage_label}: {comment}')
    elif action == 'reply_revision':
        if not artist: raise PermissionDenied('Only the artist can reply to a revision request.')
        if not m.revision_requested_at or m.status != 'REVISION_REQUESTED' or m.revision_replied_at:
            raise Conflict('An artist reply is allowed once while the requested revision is awaiting an update.')
        reply = str(request.data.get('reply', '')).strip()
        if not 1 <= len(reply) <= 2000: raise ValidationError('Enter a revision reply up to 2000 characters.')
        m.revision_reply = reply; m.revision_replied_at = timezone.now(); m.save()
        notify(c, c.buyer, 'Artist replied to revision', f'{m.stage_label}: {reply}')
    elif action == 'approve':
        if artist: raise PermissionDenied('Only the buyer can approve a milestone.')
        if m.status != 'SUBMITTED': raise Conflict('Review the latest submission before approving.')
        if m.milestone_number == 3 and c.art_type.lower() == 'physical' and not c.delivered_at: raise Conflict('Confirm physical delivery and inspect the artwork before final approval.')
        m.status = 'APPROVED'; m.approved_at = timezone.now(); m.save()
        if m.milestone_number < 3: c.status = f'STAGE_{m.milestone_number + 1}'
        else:
            c.status = 'COMPLETE'; final = m.submissions.order_by('-pk').first()
            proof = {'commission': c.pk, 'agreement': c.agreement_id, 'file_hash': final.sha256, 'artist': c.artist_id, 'buyer': c.buyer_id, 'license': c.locked_terms,
                'document_hash': hashlib.sha256(c.agreement.document_snapshot.encode()).hexdigest(),
                'artist_signature_hash': hashlib.sha256(c.agreement.artist_signature_image.encode()).hexdigest(),
                'buyer_signature_hash': hashlib.sha256(c.agreement.buyer_signature_image.encode()).hexdigest(),
                'artist_signed_at': c.agreement.artist_signed_at.isoformat(), 'buyer_signed_at': c.agreement.buyer_signed_at.isoformat()}
            asset, created = CommissionAsset.objects.get_or_create(commission=c, defaults={'original_artist': c.artist, 'owner': c.artist if c.locked_terms.get('exclusivity') == 'exclusive' else c.buyer, 'submission': final, 'license_terms': c.locked_terms, 'record_hash': hashlib.sha256(json.dumps(proof, sort_keys=True).encode()).hexdigest()})
            if created:
                from blockchain.provenance import ensure_commission
                # The file and license stay off-chain; registration and exclusive transfer are queued.
                # Mark complete before validating the initial paid entitlement.
                c.save(update_fields=['status'])
                ensure_commission(asset)
                from .models import CommissionProof
                CommissionProof.objects.create(commission=c, asset=asset, record_hash=asset.record_hash, registry_id=str(2**192 + asset.pk))
        c.save()
        notify(c, c.artist, 'Milestone approved', f'{m.stage_label} approved. Payout queued separately from production progress.')
        if m.milestone_number == 3 and c.agreement.compensation_terms.get('reporting_policy') == 'commission_delivery_plus_7_days_artist_approval':
            from messaging.royalties import ensure_periods
            ensure_periods(c.agreement)
            for party in (c.buyer, c.artist):
                notify(c, party, 'Commercial royalty reporting started', 'Final delivery approved. View the separate sales reporting periods in Royalty reports; production funding does not pay future commercial royalties.')
        transaction.on_commit(lambda: attempt_payout(m.pk))
    elif action in ('ready_delivery', 'request_pickup'):
        if c.art_type.lower() != 'physical' or m.milestone_number != 3 or m.status != 'SUBMITTED':
            raise Conflict('Submit the final physical artwork preview before arranging delivery.')
        if action == 'ready_delivery':
            if artist: raise PermissionDenied('Only the buyer can approve the artwork as ready for delivery.')
            if not m.delivery_ready_at:
                m.delivery_ready_at = timezone.now(); m.review_due_at = None; m.save()
                notify(c, c.artist, 'Commission ready for delivery', 'Buyer approved the final preview for delivery. Request pickup when the artwork is packed. Final payment remains locked.')
        else:
            if not artist: raise PermissionDenied('Only the artist can request pickup.')
            if not m.delivery_ready_at: raise Conflict('The buyer must approve the final preview as ready for delivery first.')
            from .shipping import request_pickup, tracking_reference
            if c.courier_tracking and not hasattr(c, 'delivery_order'): raise Conflict('An external courier shipment is already recorded.')
            order = request_pickup(c)
            c.courier_tracking = tracking_reference(order); c.save(update_fields=['courier_tracking'])
    elif action == 'ship':
        if not artist or c.art_type.lower() != 'physical' or m.milestone_number != 3 or m.status != 'SUBMITTED': raise Conflict('Only the final physical stage can be shipped by the artist.')
        if not m.delivery_ready_at: raise Conflict('The buyer must approve the final preview as ready for delivery first.')
        if hasattr(c, 'delivery_order'): raise Conflict('Track the assigned platform delivery; external tracking cannot replace it.')
        if c.courier_tracking: raise Conflict('A courier shipment is already recorded.')
        tracking = str(request.data.get('tracking', '')).strip()
        if not 3 <= len(tracking) <= 500: raise ValidationError('Enter the courier and tracking reference.')
        c.courier_tracking = tracking; c.save(); notify(c, c.buyer, 'Commission shipped', tracking)
    elif action == 'receive':
        if artist or not c.courier_tracking or c.art_type.lower() != 'physical': raise Conflict('Only the buyer can confirm a shipped physical delivery.')
        if m.milestone_number != 3 or m.status != 'SUBMITTED': raise Conflict('Only the final physical delivery can be received.')
        if hasattr(c, 'delivery_order'):
            order = c.delivery_order
            if order.status != 'delivered' or not order.delivery_proof: raise Conflict('Wait for the driver to record delivery with proof before confirming receipt.')
        c.delivered_at = c.delivered_at or timezone.now(); c.save(); m.review_due_at = timezone.now() + timedelta(days=5); m.save()
    elif action == 'payout':
        if not artist: raise PermissionDenied('Only the artist can retry their payout.')
        if not m.approved_at: raise Conflict('Buyer approval is required.')
        transaction.on_commit(lambda: attempt_payout(m.pk))


def valid_file(raw):
    if raw.startswith(b'%PDF-'): return 'application/pdf'
    from PIL import Image
    from io import BytesIO
    try:
        image = Image.open(BytesIO(raw))
        if image.width * image.height > 40_000_000: raise ValueError()
        image.verify()
        return {'PNG': 'image/png', 'JPEG': 'image/jpeg', 'WEBP': 'image/webp', 'TIFF': 'image/tiff'}[image.format]
    except Exception: raise ValidationError('Use a valid PNG, JPEG, WebP, TIFF or PDF file.')


class SubmissionFileView(CommissionFlowView):
    def get(self, request, pk, submission_id):
        user, c = self.participant(request, pk)
        s = CommissionSubmission.objects.filter(pk=submission_id, milestone__commission_req=c).first()
        if not s: raise NotFound('File not found.')
        raw = bytes(s.content); mime = s.content_type
        preview = request.query_params.get('preview') == '1'
        if user.pk == c.buyer_id and s.final_original and c.status != 'COMPLETE' and not preview: raise Conflict('The original is available after final approval.')
        if preview and mime.startswith('image/'):
            from PIL import Image, ImageDraw
            from io import BytesIO
            image = Image.open(BytesIO(raw)).convert('RGB'); image.thumbnail((1400, 1400))
            draw = ImageDraw.Draw(image)
            for y in range(20, image.height, 100):
                for x in range(10, image.width, 180): draw.text((x, y), 'ArtFiliere PREVIEW', fill=(200, 65, 65))
            out = BytesIO(); image.save(out, 'JPEG', quality=80); raw = out.getvalue(); mime = 'image/jpeg'
        response = HttpResponse(raw, content_type=mime)
        response['Cache-Control'] = 'private, no-store'; response['X-Content-Type-Options'] = 'nosniff'
        response['Content-Disposition'] = f'attachment; filename="commission-{c.pk}-submission-{s.pk}"'
        return response


def funding_checkout(c):
    if not settings.XENDIT_SECRET_KEY or not getattr(settings, 'COMMISSION_HOLDING_ENABLED', False):
        raise Conflict('Commission holding payments are not enabled. Configure the Xendit holding arrangement first.')
    if c.funding_url: return c.funding_url
    if not c.funding_reference: c.funding_reference = f'commission-funding-{c.pk}-{secrets.token_hex(8)}'
    payload = {'external_id': c.funding_reference, 'amount': float(c.time_duration), 'currency': 'PHP',
        'invoice_duration': max(1, int((c.funding_due_at-timezone.now()).total_seconds())),
        'payer_email': c.buyer.email, 'description': f'Full upfront funding: {c.title}',
        'success_redirect_url': settings.FRONTEND_URL.rstrip('/') + '/',
        'failure_redirect_url': f'{getattr(settings, "FRONTEND_URL", "http://localhost:8081")}/commission-detail?id={c.pk}'}
    c.funding_payload = payload; c.save()
    try:
        # Reconcile a previous uncertain request before creating another invoice.
        response = requests.get('https://api.xendit.co/v2/invoices', params={'external_id': c.funding_reference}, auth=(settings.XENDIT_SECRET_KEY, ''), timeout=20)
        response.raise_for_status(); rows = response.json()
        data = next((row for row in rows if row.get('external_id') == c.funding_reference), None) if isinstance(rows, list) else None
        if not data:
            response = requests.post('https://api.xendit.co/v2/invoices', json=payload, auth=(settings.XENDIT_SECRET_KEY, ''), timeout=20)
            response.raise_for_status(); data = response.json()
        c.funding_provider_id = data['id']; c.funding_url = data['invoice_url']; c.save()
        return c.funding_url
    except (requests.RequestException, KeyError, ValueError):
        # Return normally to retain the stable reference for safe reconciliation.
        return ''


def payout_profile_data(user, profile=None):
    recipient = profile.recipient if profile else {}
    account = recipient.get('account_details', {})
    saved_address = recipient.get('address', {})
    address = user.address
    full_name = ' '.join(part.strip() for part in (user.first_name, user.middle_name, user.last_name) if part and part.strip())
    fields = {
        'given_name': recipient.get('given_name') or user.first_name or '',
        'surname': recipient.get('surname') or user.last_name or '',
        'account_holder_name': account.get('account_holder_name') or full_name,
        'account_number': '',  # Never return a stored account number to the browser.
        'routing_type': account.get('routing_type_1') or 'WALLET',
        'routing_value': account.get('routing_value_1') or 'PH_GCASH',
        'street': saved_address.get('street_line_1') or (', '.join(filter(None, [address.street, address.barangay])) if address else ''),
        'city': saved_address.get('city') or (address.city if address else ''),
        'province': saved_address.get('province_state') or (address.province if address else ''),
        'postal_code': saved_address.get('postal_code') or (address.postal_code if address else ''),
    }
    return {'configured': bool(account.get('account_number')), 'fields': fields,
        'account_holder': fields['account_holder_name'], 'account_last4': account.get('account_number', '')[-4:], 'routing': fields['routing_value'],
        'xendit': {'configured': bool(settings.XENDIT_SECRET_KEY), 'mode': 'test' if settings.XENDIT_SECRET_KEY.startswith('xnd_development_') else 'live' if settings.XENDIT_SECRET_KEY else 'unconfigured',
            'payouts_enabled': settings.COMMISSION_PAYOUTS_ENABLED, 'webhook_configured': bool(settings.XENDIT_WEBHOOK_TOKEN)}}


class PayoutProfileView(AuthenticatedAPIView):
    def get(self, request):
        user = self.get_request_user(request)
        if not user or user.role != 'artist': raise PermissionDenied('Artist account required.')
        profile = CommissionPayoutProfile.objects.filter(artist=user).first()
        data = payout_profile_data(user, profile)
        if request.query_params.get('check_connection') == '1':
            data['xendit']['reachable'] = False
            if not settings.XENDIT_SECRET_KEY:
                data['xendit']['detail'] = 'The platform Xendit key is not configured.'
            else:
                try:
                    response = requests.get('https://api.xendit.co/balance', params={'account_type': 'CASH', 'currency': 'PHP'}, auth=(settings.XENDIT_SECRET_KEY, ''), timeout=10)
                    response.raise_for_status()
                    if not isinstance(response.json().get('balance'), (int, float)): raise ValueError()
                    data['xendit']['reachable'] = True
                    data['xendit']['detail'] = 'Xendit API connection confirmed. Payouts also require MONEY-OUT access and a supported recipient destination.'
                except (requests.RequestException, ValueError, AttributeError):
                    data['xendit']['detail'] = 'Xendit connection could not be confirmed. Ask the platform administrator to check API key permissions and service availability.'
        response = Response(data); response['Cache-Control'] = 'private, no-store'; return response

    def post(self, request):
        user = self.get_request_user(request)
        if not user or user.role != 'artist': raise PermissionDenied('Artist account required.')
        data = dict(request.data)
        data['routing_type'] = str(data.get('routing_type', '')).strip().upper()
        data['routing_value'] = str(data.get('routing_value', '')).strip().upper()
        previous = CommissionPayoutProfile.objects.filter(artist=user).first()
        previous_account = previous.recipient.get('account_details', {}) if previous else {}
        if not str(data.get('account_number', '')).strip():
            if data['routing_type'] == previous_account.get('routing_type_1') and data['routing_value'] == previous_account.get('routing_value_1'):
                data['account_number'] = previous_account.get('account_number', '')
        required = ('given_name', 'surname', 'account_holder_name', 'account_number', 'routing_type', 'routing_value', 'street', 'city', 'province', 'postal_code')
        limits = {'given_name': 50, 'surname': 50, 'account_holder_name': 255, 'street': 255, 'city': 255, 'province': 255, 'postal_code': 10}
        if any(not isinstance(data.get(k), str) or not 1 <= len(data[k].strip()) <= limits.get(k, 100) for k in required): raise ValidationError('Complete the payout recipient and bank/e-wallet details within the supported field lengths.')
        if len(data['given_name'].strip()) > 50 or len(data['surname'].strip()) > 50: raise ValidationError('Recipient names must be at most 50 characters.')
        if data['routing_type'] not in ('SWIFT', 'WALLET'): raise ValidationError('Select SWIFT for bank routing or WALLET for e-wallet routing.')
        account_number = re.sub(r'[\s-]', '', data['account_number'])
        if data['routing_type'] == 'WALLET': account_number = account_number.lstrip('+')
        if not re.fullmatch(r'\d{4,34}', account_number): raise ValidationError('Enter a valid bank or e-wallet account number using digits.')
        if data['routing_type'] == 'WALLET':
            if not re.fullmatch(r'PH_[A-Z0-9_]{2,50}', data['routing_value']): raise ValidationError('Enter a supported Philippine Xendit e-wallet routing code.')
            if data['routing_value'] == 'PH_GCASH':
                if account_number.startswith('639') and len(account_number) == 12: account_number = '0' + account_number[2:]
                if not re.fullmatch(r'09\d{9}', account_number): raise ValidationError('GCash account number must be an 11-digit mobile number starting with 09.')
        elif not re.fullmatch(r'[A-Z]{6}[A-Z0-9]{2}(?:[A-Z0-9]{3})?', data['routing_value']):
            raise ValidationError('Enter the bank’s valid 8- or 11-character SWIFT/BIC code.')
        recipient = {'type': 'INDIVIDUAL', 'given_name': data['given_name'].strip(), 'surname': data['surname'].strip(), 'relationship': 'SUPPLIER',
            'address': {'country': 'PH', 'street_line_1': data['street'].strip(), 'city': data['city'].strip(), 'province_state': data['province'].strip(), 'postal_code': data['postal_code'].strip()},
            'account_details': {'currency': 'PHP', 'account_country': 'PH', 'account_holder_name': data['account_holder_name'].strip(),
            'account_number': account_number, 'routing_type_1': data['routing_type'], 'routing_value_1': data['routing_value'].strip()}}
        profile, _ = CommissionPayoutProfile.objects.update_or_create(artist=user, defaults={'recipient': recipient})
        result = Response(payout_profile_data(user, profile)); result['Cache-Control'] = 'private, no-store'; return result


@transaction.atomic
def attempt_payout(milestone_id):
    m = CommissionMilestone.objects.get(pk=milestone_id)
    c = CommissionRequest.objects.select_for_update().get(pk=m.commission_req_id)
    m.refresh_from_db()
    if not m.approved_at or not c.funded_at or c.status not in ('STAGE_1', 'STAGE_2', 'STAGE_3', 'COMPLETE') or m.payout_status in ('SUCCEEDED', 'PROCESSING', 'FAILED', 'REVERSED', 'REJECTED', 'RECONCILE'): return
    if c.held_amount < m.amount or c.refunds.filter(status__in=['AUTHORIZED', 'PROCESSING', 'RECONCILE', 'CONFIG_REQUIRED']).exists(): return
    try:
        check_frozen(c)
    except Conflict:
        return
    try:
        if m.payout_provider_id and settings.XENDIT_SECRET_KEY:
            response = requests.get(f'https://api.xendit.co/v3/payouts/{m.payout_provider_id}', auth=(settings.XENDIT_SECRET_KEY, ''), headers={'api-version': '2025-09-01'}, timeout=20)
            response.raise_for_status(); apply_payout(m, response.json()); return
        profile = CommissionPayoutProfile.objects.filter(artist=c.artist).first()
        if not settings.XENDIT_SECRET_KEY or not getattr(settings, 'COMMISSION_PAYOUTS_ENABLED', False) or not profile:
            m.payout_status = 'CONFIG_REQUIRED'; m.payout_error = 'Configure Xendit payouts and the artist payout recipient.'; m.save(); return
        if not m.payout_reference:
            m.payout_reference = f'commission-stage-{m.pk}-{secrets.token_hex(8)}'
            m.payout_payload = {'reference_id': m.payout_reference, 'recipient': profile.recipient,
                'payout_details': {'source_currency': 'PHP', 'source_amount': int(m.amount * 100), 'destination_currency': 'PHP'},
                'source_of_fund': 'BUSINESS_REVENUE', 'purpose_code': 'OTHER', 'description': f'Commission #{c.pk}: {m.stage_label}'}
        attempt, _ = CommissionLedger.objects.get_or_create(reference=m.payout_reference + '-attempt', defaults={'commission': c, 'kind': 'PAYOUT_ATTEMPT', 'amount': 0})
        if not m.payout_provider_id and attempt.created_at <= timezone.now() - timedelta(hours=23):
            m.payout_status = 'RECONCILE'; m.payout_error = 'Provider lookup required before retrying an uncertain payout.'; m.save(); return
        m.payout_status = 'RETRY_PENDING'; m.save()
        response = requests.post('https://api.xendit.co/v3/payouts', auth=(settings.XENDIT_SECRET_KEY, ''),
            headers={'api-version': '2025-09-01', 'idempotency-key': m.payout_reference}, json=m.payout_payload, timeout=20)
        response.raise_for_status(); data = response.json()
        m.payout_provider_id = data['payout_id']; m.payout_status = 'PROCESSING'; m.payout_error = ''; m.save()
        apply_payout(m, data)
    except (requests.RequestException, KeyError, ValueError, APIException):
        m.payout_status = 'RETRY_PENDING'; m.payout_error = 'Payout pending reconciliation. Retry uses the same payment reference.'; m.save()


@transaction.atomic
def apply_payout(m, data):
    c = CommissionRequest.objects.select_for_update().get(pk=m.commission_req_id)
    m.refresh_from_db()
    if data.get('payout_id') != m.payout_provider_id or data.get('reference_id') != m.payout_reference or data.get('source_currency') != 'PHP' or Decimal(str(data.get('source_amount', -1))) != m.amount * 100:
        raise ValidationError('Payout details do not match.')
    status = data.get('status')
    if status == 'SUCCEEDED' and m.payout_status != 'SUCCEEDED':
        if m.payout_status == 'REVERSED': return
        _, created = CommissionLedger.objects.get_or_create(reference=m.payout_reference, defaults={'commission': c, 'kind': 'MILESTONE_RELEASE', 'amount': m.amount})
        if created:
            if c.held_amount < m.amount: raise Conflict('Insufficient holding balance.')
            c.held_amount -= m.amount; c.save()
        m.payout_status = 'SUCCEEDED'; m.paid_at = timezone.now(); m.save()
        notify(c, c.artist, 'Commission payout completed', f'PHP {m.amount} for {m.stage_label} was paid.')
    elif status == 'REVERSED' and m.payout_status == 'SUCCEEDED':
        _, created = CommissionLedger.objects.get_or_create(reference=m.payout_reference + '-reversed', defaults={'commission': c, 'kind': 'PAYOUT_REVERSAL', 'amount': m.amount})
        if created: c.held_amount += m.amount; c.save()
        m.payout_status = 'REVERSED'; m.save()
    elif status in ('FAILED', 'REJECTED') and m.payout_status not in ('SUCCEEDED', 'REVERSED'):
        m.payout_status = status; m.payout_error = str(data.get('failure_code', status))[:300]; m.save()


@transaction.atomic
def apply_funding(data):
    c = CommissionRequest.objects.select_for_update().filter(funding_reference=data.get('external_id'), flow_version=2).first()
    if not c: raise NotFound('Funding reference not found.')
    if data.get('id') != c.funding_provider_id or data.get('currency') != 'PHP' or money(data.get('amount')) != c.time_duration: raise ValidationError('Payment details do not match.')
    if c.funded_at:
        if data.get('status') in ('PAID', 'SETTLED') and data.get('payment_request_id') and not c.funding_payload.get('payment_request_id'):
            c.funding_payload['payment_request_id'] = data['payment_request_id']; c.save(update_fields=['funding_payload'])
        return
    if data.get('status') in ('PAID', 'SETTLED'):
        if not signed(c): raise Conflict('Commission is not signed.')
        c.funded_at = timezone.now(); c.held_amount = c.time_duration
        if data.get('payment_request_id'):
            c.funding_payload['payment_request_id'] = data['payment_request_id']
        if c.status != 'AWAITING_FUNDS' or (c.funding_due_at and c.funding_due_at <= timezone.now()):
            c.disputed = True
            SupportTicket.objects.create(requester=c.buyer, commission=c, concern='commission_dispute', details='Late funding received. Reconcile booking and refund before allowing production.')
        else: c.status = 'STAGE_1'
        c.save()
        CommissionLedger.objects.get_or_create(reference=c.funding_reference, defaults={'commission': c, 'kind': 'UPFRONT_FUNDING', 'amount': c.time_duration})
        notify(c, c.artist, 'Commission funded', 'Full payment confirmed. Begin Stage 1.' if not c.disputed else 'Late funding frozen for Customer Service review.')


class CommissionPaymentWebhook(APIView):
    def post(self, request):
        token = getattr(settings, 'XENDIT_WEBHOOK_TOKEN', '')
        if not token or not hmac.compare_digest(str(request.headers.get('x-callback-token', '')), token): raise PermissionDenied('Invalid webhook authentication.')
        data = request.data
        if str(data.get('external_id', '')).startswith('commission-funding-'): apply_funding(data)
        elif str(data.get('event', '')).startswith('refund.'):
            from .models import CommissionRefund
            from .reviews import apply_refund
            payload = data.get('data') or {}
            refund = CommissionRefund.objects.filter(reference=payload.get('reference_id')).first()
            if refund: apply_refund(refund, payload)
        elif str(data.get('event', '')).startswith('v3_payout.'):
            payload = data.get('data') or {}
            m = CommissionMilestone.objects.filter(payout_reference=payload.get('reference_id')).first()
            if m: apply_payout(m, payload)
            else:
                from .models import CommissionResale
                from .resale import royalty_status
                resale = CommissionResale.objects.filter(payout_reference=payload.get('reference_id')).first()
                if resale: royalty_status(resale, payload)
        return Response({'received': True})
