import base64
import binascii
from io import BytesIO

from PIL import Image, UnidentifiedImageError
from firebase_admin import auth as firebase_auth
from django.core.cache import cache
from django.db import transaction
from django.db.models import Q
from django.shortcuts import get_object_or_404
from django.utils import timezone
from rest_framework import serializers
from rest_framework.exceptions import PermissionDenied, ValidationError
from rest_framework.response import Response

from artworks.models import Artwork
from auctions.models import AuctionListing
from authentication.permissions import IsAuthenticatedUser
from authentication.views import AuthenticatedAPIView
from commissions.models import CommissionRequest
from users.models import User
from .models import PaymentSession, SupportReply, SupportTicket
from .support_catalog import CONCERNS, FAQS


MODERATOR_ROLES = (User.Role.CREATIVE_MODERATOR, User.Role.CUSTOMER_SUPPORT)
DEPARTMENTS = {'hr': 'HR', 'creative_moderator': 'Creative Director', 'customer_support': 'Customer Support'}


def is_moderator(user):
    return user.role in MODERATOR_ROLES


def department(concern):
    return next((c['department'] for c in CONCERNS if c['id'] == concern), 'customer_support')


def queue_filter(user):
    return Q(concern__in=[c['id'] for c in CONCERNS if c['department'] == user.role])


def can_handle(user, ticket):
    return (is_moderator(user) and department(ticket.concern) == user.role and ticket.requester_id != user.pk
            and (user.role != User.Role.CUSTOMER_SUPPORT or ticket.assigned_to_id == user.pk))


def get_concern(key, user):
    item = next((item for item in CONCERNS if item['id'] == key), None)
    if not item:
        raise ValidationError({'error': 'Select a valid concern.'})
    if item['artist_only'] and user.role != User.Role.ARTIST:
        raise PermissionDenied('This concern is available to artists only.')
    return item


def references(item, user):
    kind = item['reference']
    if kind.endswith('payment'):
        rows = PaymentSession.objects.filter(Q(buyer=user) | Q(artist=user)).select_related('artwork')
        if item['id'] == 'payout':
            rows = rows.filter(artist=user)
        if kind == 'physical_payment':
            rows = rows.filter(artwork__art_type__iexact='physical')
        elif kind == 'digital_payment':
            rows = rows.filter(artwork__art_type__iexact='digital')
        return rows.order_by('-created_at'), 'payment'
    if kind == 'own_artwork':
        rows = Artwork.objects.filter(artist=user)
        if item['id'] == 'rejected_artwork':
            rows = rows.filter(status=Artwork.Status.DECLINED)
        return rows.order_by('-created_at'), 'artwork'
    if kind == 'artwork':
        return Artwork.objects.filter(Q(status=Artwork.Status.APPROVED) | Q(artist=user)).order_by('-created_at'), 'artwork'
    if kind == 'commission':
        return CommissionRequest.objects.filter(Q(buyer=user) | Q(artist=user)).order_by('-created_at'), 'commission'
    if kind == 'auction':
        access = Q(artist=user) | Q(highest_bidder=user) | Q(bids__bidder=user)
        if item['id'] == 'bidding':
            access |= Q(status='ACTIVE', artwork__status=Artwork.Status.APPROVED)
        return AuctionListing.objects.filter(access).select_related('artwork').distinct().order_by('-created_at'), 'auction'
    return None, None


def reference_data(obj, kind, image=False):
    artwork = obj.artwork if kind in ('payment', 'auction') else obj if kind == 'artwork' else None
    return dict(id=obj.pk, kind=kind, title=artwork.title if artwork else obj.title,
                status=obj.status, date=obj.created_at.isoformat(),
                decline_reason=obj.decline_reason if kind == 'artwork' else None,
                image=artwork.image_data if image and artwork else None,
                label=f"Transaction #{obj.pk}" if kind == 'payment' else f"{kind.title()} #{obj.pk}")


def page(request, rows):
    try:
        offset = max(0, int(request.query_params.get('offset', 0)))
    except (ValueError, TypeError):
        raise ValidationError({'error': 'Invalid page.'})
    count = rows.count()
    return list(rows[offset:offset + 20]), offset + 20 if count > offset + 20 else None


class TicketInput(serializers.Serializer):
    reported_username = serializers.CharField(max_length=151, required=False, allow_blank=True, default='')
    concern = serializers.CharField(max_length=60)
    reference_id = serializers.IntegerField(min_value=1, required=False, allow_null=True)
    details = serializers.CharField(max_length=4000, min_length=10)
    evidence = serializers.CharField(max_length=2000, required=False, allow_blank=True, default='')
    image_data = serializers.CharField(max_length=2100000, required=False, allow_blank=True, default='')

    def validate_image_data(self, value):
        if not value:
            return value
        try:
            prefix, encoded = value.split(',', 1)
            if prefix not in ('data:image/jpeg;base64', 'data:image/png;base64', 'data:image/webp;base64'):
                raise ValueError()
            decoded = base64.b64decode(encoded, validate=True)
            if len(decoded) > 1536 * 1024:
                raise ValueError()
            with Image.open(BytesIO(decoded)) as img:
                if img.format not in ('JPEG', 'PNG', 'WEBP') or img.width * img.height > 16000000:
                    raise ValueError()
                img.verify()
        except (ValueError, binascii.Error, OSError, UnidentifiedImageError, Image.DecompressionBombError):
            raise serializers.ValidationError('Attach a valid JPG, PNG or WebP image under 1.5 MB and 16 megapixels.')
        return value


def ticket_data(ticket, detail=False, viewer=None):
    item = next((c for c in CONCERNS if c['id'] == ticket.concern), None)
    linked = next(((kind, getattr(ticket, kind)) for kind in ('payment', 'artwork', 'commission', 'auction') if getattr(ticket, f'{kind}_id')), None)
    result = dict(id=ticket.pk, number=f'SUP-{ticket.pk:06d}', concern=ticket.concern,
                  label=item['label'] if item else ticket.concern,
                  assigned_department=department(ticket.concern), department_label=DEPARTMENTS[department(ticket.concern)],
                  requester=ticket.requester.username or 'Member', status=ticket.status, department=department(ticket.concern),
                  created_at=ticket.created_at.isoformat(), updated_at=ticket.updated_at.isoformat(),
                  reference=reference_data(linked[1], linked[0]) if linked else None)
    result['reported_username'] = ticket.reported_username
    if viewer and viewer.role == User.Role.CUSTOMER_SUPPORT and ticket.reported_user_id:
        result['reported_user'] = dict(id=ticket.reported_user_id, username=ticket.reported_user.username, role=ticket.reported_user.role)
    if detail:
        result.update(details=ticket.details, evidence=ticket.evidence, image_data=ticket.image_data,
                      replies=[dict(id=r.pk, message=r.message, is_staff=is_moderator(r.sender) and r.sender_id != ticket.requester_id,
                                    sender=DEPARTMENTS.get(r.sender.role, 'Support team') if is_moderator(r.sender) and r.sender_id != ticket.requester_id else r.sender.username or 'Member',
                                    created_at=r.created_at.isoformat()) for r in ticket.replies.select_related('sender')])
    if viewer and is_moderator(viewer):
        result.update(assigned_to_id=ticket.assigned_to_id, assigned_to=ticket.assigned_to.username if ticket.assigned_to_id else None,
                      transfer_to_id=ticket.transfer_to_id, transfer_to=ticket.transfer_to.username if ticket.transfer_to_id else None,
                      can_handle=can_handle(viewer, ticket))
    return result


class SupportView(AuthenticatedAPIView):
    permission_classes = [IsAuthenticatedUser]

    def ticket(self, request, ticket_id, lock=False):
        user = self.get_request_user(request)
        rows = SupportTicket.objects.all()
        rows = rows.filter(Q(requester=user) | queue_filter(user)) if is_moderator(user) else rows.filter(requester=user)
        if lock:
            rows = rows.select_for_update()
        return get_object_or_404(rows, pk=ticket_id)

    def get(self, request, action=None, ticket_id=None):
        user = self.get_request_user(request)
        if action == 'accounts':
            query = request.query_params.get('q', '').strip().removeprefix('@')[:150]
            if len(query) < 2:
                return Response({'results': []})
            members = list(User.objects.filter(username__icontains=query).exclude(pk=user.pk).order_by('username', 'pk')[:8])
            pictures = {}
            missing = []
            for member in members:
                picture = cache.get(f'support-avatar:{member.firebase_uid}')
                if picture is None:
                    missing.append(member)
                else:
                    pictures[member.firebase_uid] = picture
            if missing:
                try:
                    records = firebase_auth.get_users([firebase_auth.UidIdentifier(member.firebase_uid) for member in missing])
                    for record in records.users:
                        picture = record.photo_url or ''
                        pictures[record.uid] = picture
                        cache.set(f'support-avatar:{record.uid}', picture, 300)
                    for member in missing:
                        if member.firebase_uid not in pictures:
                            cache.set(f'support-avatar:{member.firebase_uid}', '', 300)
                except Exception:
                    # Account lookup remains usable while the avatar provider is unavailable.
                    pass
            return Response({'results': [dict(username=member.username, profile_image=pictures.get(member.firebase_uid) or None) for member in members]})
        if action == 'catalog':
            artist = user.role == User.Role.ARTIST
            return Response(dict(user_id=user.pk, is_moderator=is_moderator(user), role=user.role, department_label=DEPARTMENTS.get(user.role, ''), concerns=[c for c in CONCERNS if not c['artist_only'] or artist],
                                 faqs=[f for f in FAQS if not f.get('artist_only') or artist], statuses=dict(SupportTicket.Status.choices)))
        if action == 'agents':
            if user.role != User.Role.CUSTOMER_SUPPORT:
                raise PermissionDenied('Customer Support access is required.')
            agents = User.objects.filter(role=User.Role.CUSTOMER_SUPPORT, is_banned=False).filter(Q(suspended_until__isnull=True) | Q(suspended_until__lte=timezone.now())).exclude(pk=user.pk).order_by('username')
            return Response(list(agents.values('id', 'username')))
        if action == 'references':
            item = get_concern(request.query_params.get('concern'), user)
            rows, kind = references(item, user)
            if rows is None:
                return Response(dict(results=[], next_offset=None))
            ref_id = request.query_params.get('reference_id')
            if ref_id is not None:
                ref_id = serializers.IntegerField(min_value=1).run_validation(ref_id)
                rows = rows.filter(pk=ref_id)
            query = request.query_params.get('q', '').strip()[:150]
            if query:
                title_field = 'artwork__title' if kind in ('payment', 'auction') else 'title'
                search = Q(**{f'{title_field}__icontains': query})
                if query.isdigit():
                    search |= Q(pk=int(query))
                rows = rows.filter(search)
            rows, next_offset = page(request, rows)
            return Response(dict(results=[reference_data(row, kind, image=True) for row in rows], next_offset=next_offset))
        if ticket_id:
            if action == 'reported-profile':
                if user.role != User.Role.CUSTOMER_SUPPORT:
                    raise PermissionDenied('Customer Support access is required.')
                ticket = self.ticket(request, ticket_id)
                if department(ticket.concern) != user.role or not ticket.reported_user_id:
                    raise ValidationError({'error': 'This report has no reported account profile.'})
                member = ticket.reported_user
                application = getattr(member, 'artist_application', None)
                return Response(dict(
                    id=member.pk, username=member.username,
                    name=f'{member.first_name} {member.last_name}'.strip() or member.username,
                    role=member.role, joined_at=member.created_at.isoformat(),
                    bio=application.bio if application else '', restricted=member.access_restricted,
                    artworks=list(member.artworks.filter(status=Artwork.Status.APPROVED).values('id', 'title', 'image_data')[:20]),
                ))
            return Response(ticket_data(self.ticket(request, ticket_id), detail=True, viewer=user))
        rows = SupportTicket.objects.select_related('requester', 'payment__artwork', 'artwork', 'commission', 'auction__artwork')
        if request.query_params.get('admin') == '1':
            raise PermissionDenied('Reports are handled in the moderator panel.')
        if request.query_params.get('moderator') == '1':
            if not is_moderator(user):
                raise PermissionDenied('Moderator access is required.')
            rows = rows.filter(queue_filter(user)).exclude(requester=user)
            if user.role == User.Role.CUSTOMER_SUPPORT:
                queue = request.query_params.get('queue', 'waiting')
                if queue == 'waiting':
                    rows = rows.filter(assigned_to__isnull=True).exclude(status__in=['resolved', 'closed']).order_by('created_at', 'pk')
                elif queue == 'mine':
                    rows = rows.filter(assigned_to=user)
                elif queue == 'transfers':
                    rows = rows.filter(transfer_to=user)
                else:
                    raise ValidationError({'error': 'Invalid queue.'})
        else:
            rows = rows.filter(requester=user)
        concern = request.query_params.get('concern')
        if concern:
            get_concern(concern, user)
            rows = rows.filter(concern=concern)
        artwork_id = request.query_params.get('artwork_id')
        if artwork_id is not None:
            artwork_id = serializers.IntegerField(min_value=1).run_validation(artwork_id)
            rows = rows.filter(artwork_id=artwork_id)
        if request.query_params.get('active') == '1':
            rows = rows.exclude(status__in=[SupportTicket.Status.RESOLVED, SupportTicket.Status.CLOSED])
        status = request.query_params.get('status')
        if status:
            if status not in SupportTicket.Status.values:
                raise ValidationError({'error': 'Invalid status.'})
            rows = rows.filter(status=status)
        rows, next_offset = page(request, rows)
        return Response(dict(results=[ticket_data(row, viewer=user) for row in rows], next_offset=next_offset))

    @transaction.atomic
    def post(self, request, ticket_id=None, action=None):
        user = self.get_request_user(request)
        if ticket_id:
            ticket = self.ticket(request, ticket_id, lock=True)
            if user.pk != ticket.requester_id and not can_handle(user, ticket):
                raise PermissionDenied('Accept this concern before replying. Only its assigned moderator can reply.')
            message = serializers.CharField(max_length=4000, min_length=1).run_validation(request.data.get('message'))
            SupportReply.objects.create(ticket=ticket, sender=user, message=message)
            if not can_handle(user, ticket):
                ticket.status = SupportTicket.Status.OPEN
            elif ticket.status in (SupportTicket.Status.OPEN, SupportTicket.Status.IN_PROGRESS):
                ticket.status = SupportTicket.Status.AWAITING_CUSTOMER
            ticket.save(update_fields=['status', 'updated_at'])
            return Response(ticket_data(ticket, detail=True, viewer=user), status=201)
        data = TicketInput(data=request.data)
        data.is_valid(raise_exception=True)
        values = data.validated_data
        item = get_concern(values['concern'], user)
        username = values.pop('reported_username', '').strip().removeprefix('@')
        reported = {}
        if item['id'] in ('suspicious', 'harassment'):
            if not username:
                raise ValidationError({'reported_username': 'Enter the username of the account you are reporting.'})
            members = list(User.objects.filter(username__iexact=username)[:2])
            if len(members) != 1:
                raise ValidationError({'reported_username': 'Enter an exact, existing username.'})
            member = members[0]
            if member.pk == user.pk:
                raise ValidationError({'reported_username': 'You cannot report your own account.'})
            reported = dict(reported_user=member, reported_username=member.username)
        elif username:
            raise ValidationError({'reported_username': 'A reported username is only used for account safety reports.'})
        rows, kind = references(item, user)
        ref_id = values.pop('reference_id', None)
        linked = {}
        if rows is not None:
            if ref_id is None:
                raise ValidationError({'error': 'Select the related transaction or artwork.'})
            if item['id'] == 'rejected_artwork':
                rows = rows.select_for_update()
            obj = rows.filter(pk=ref_id).first()
            if not obj:
                raise ValidationError({'error': 'That record is unavailable for this concern.'})
            linked[kind] = obj
        elif ref_id is not None:
            raise ValidationError({'error': 'This concern does not require a linked record.'})
        if item['id'] == 'plagiarism' and not values['evidence'].strip():
            raise ValidationError({'error': 'Provide the original work link or describe evidence of ownership.'})
        if item['id'] == 'rejected_artwork':
            existing = SupportTicket.objects.filter(
                requester=user, artwork=obj, concern='rejected_artwork',
            ).exclude(status__in=[SupportTicket.Status.RESOLVED, SupportTicket.Status.CLOSED]).first()
            if existing:
                return Response({'error': 'An active appeal already exists for this artwork. Open it in My reports to follow up.', 'ticket_id': existing.pk}, status=409)
        ticket = SupportTicket.objects.create(requester=user, **linked, **reported, **values)
        return Response(ticket_data(ticket, detail=True), status=201)

    @transaction.atomic
    def patch(self, request, ticket_id):
        ticket = self.ticket(request, ticket_id, lock=True)
        user = self.get_request_user(request)
        action = request.data.get('action')
        if action:
            if user.role != User.Role.CUSTOMER_SUPPORT or department(ticket.concern) != user.role or ticket.requester_id == user.pk:
                raise PermissionDenied('Only Customer Support can manage this assignment.')
            if action == 'claim':
                # A conditional UPDATE also protects against stale clients and databases without row locks.
                claimed = SupportTicket.objects.filter(pk=ticket.pk, assigned_to__isnull=True).exclude(status__in=['resolved', 'closed']).update(assigned_to=user, status='in_progress', updated_at=timezone.now())
                if not claimed:
                    return Response({'error': 'This concern has already been accepted or closed. Refresh the queue.'}, status=409)
            elif action == 'transfer':
                if not can_handle(user, ticket):
                    raise PermissionDenied('Only the assigned moderator can request a transfer.')
                if ticket.transfer_to_id or ticket.status in ('resolved', 'closed'):
                    return Response({'error': 'Cancel the pending transfer or reopen the concern first.'}, status=409)
                target_id = serializers.IntegerField(min_value=1).run_validation(request.data.get('target_id'))
                target = get_object_or_404(User, pk=target_id, role=User.Role.CUSTOMER_SUPPORT)
                if target.pk in (user.pk, ticket.requester_id) or target.access_restricted:
                    raise ValidationError({'error': 'Choose another available customer support moderator.'})
                ticket.transfer_to = target
                ticket.save(update_fields=['transfer_to', 'updated_at'])
            elif action in ('accept_transfer', 'decline_transfer', 'cancel_transfer'):
                if action == 'cancel_transfer':
                    allowed = can_handle(user, ticket) and ticket.transfer_to_id
                else:
                    allowed = ticket.transfer_to_id == user.pk
                if not allowed:
                    return Response({'error': 'This transfer is no longer available to you.'}, status=409)
                if action == 'accept_transfer':
                    ticket.assigned_to = user
                ticket.transfer_to = None
                ticket.save(update_fields=['assigned_to', 'transfer_to', 'updated_at'])
            else:
                raise ValidationError({'error': 'Invalid assignment action.'})
            ticket.refresh_from_db()
            return Response(ticket_data(ticket, detail=True, viewer=user))
        if not can_handle(user, ticket):
            raise PermissionDenied('Only the assigned moderator department can change report status.')
        ticket.status = serializers.ChoiceField(choices=SupportTicket.Status.choices).run_validation(request.data.get('status'))
        if ticket.status in ('resolved', 'closed'):
            ticket.transfer_to = None
        ticket.save(update_fields=['status', 'transfer_to', 'updated_at'])
        return Response(ticket_data(ticket, detail=True, viewer=user))
