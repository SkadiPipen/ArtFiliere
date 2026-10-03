from django.db import transaction
from django.utils import timezone
from rest_framework.response import Response
from authentication.services import account_access
from wallets.restrictions import RestrictedAccessView, restriction_rows
from users.models import ActivityLog
from notifications.models import UserNotification
from .models import CommissionRequest, CommissionPhoto, CommissionMessage, CommissionAccessDecision

ACTIVE = ('IN_PROGRESS', 'STAGE_1', 'STAGE_2', 'STAGE_3')


def restriction_key(user):
    rows = restriction_rows(user)
    return '|'.join(sorted(f'{source}:{row.pk}' for source, row in rows)) or f'account:{user.pk}:{user.is_banned}:{user.suspended_until}'


def eligible(commission):
    if commission.status not in ACTIVE or not commission.accepted_at:
        return False
    dates = [row.reviewed_at for _, row in restriction_rows(commission.artist) if row.reviewed_at]
    return not dates or commission.accepted_at <= min(dates)


def can_work(commission):
    access = account_access(commission.artist)
    if not (access['banned'] or access['suspended']):
        return commission.status in ACTIVE
    if not eligible(commission):
        return False
    if access['banned']:
        decision = commission.access_decisions.filter(restriction_key=restriction_key(commission.artist)).order_by('-pk').first()
        return bool(decision and decision.approved)
    return True


def serialize(commission, user):
    artist_access = account_access(commission.artist)
    decision = commission.access_decisions.order_by('-pk').first()
    user_access = account_access(user)
    writable = can_work(commission) and (user.pk == commission.artist_id or not (user_access['banned'] or user_access['suspended']))
    return {'id': commission.pk, 'title': commission.title, 'status': commission.status,
            'artist': commission.artist.username, 'buyer': commission.buyer.username,
            'artist_id': commission.artist_id, 'can_work': can_work(commission) if user.role in ('customer_support', 'platform_admin') else writable,
            'is_artist': commission.artist_id == user.pk, 'banned': artist_access['banned'],
            'eligible': eligible(commission),
            'restriction_reasons': [row.reason for _, row in restriction_rows(commission.artist)],
            'decision_note': decision.note if decision else '',
            'messages': [{'id': m.pk, 'sender': m.sender.username, 'body': m.body} for m in commission.workspace_messages.select_related('sender').order_by('pk')],
            'photos': [{'id': p.pk, 'url': p.image_url, 'caption': p.caption, 'progress': p.progress_percentage} for p in commission.photos.filter(photo_type='PROGRESS').order_by('pk')]}


class CommissionWorkspaceView(RestrictedAccessView):
    def get(self, request, pk=None):
        user = self.account(request)
        commissions = CommissionRequest.objects.filter(artist=user) if user.role == 'artist' else CommissionRequest.objects.filter(buyer=user)
        if account_access(user)['banned']:
            commissions = commissions.filter(status__in=ACTIVE)
        if pk is not None:
            commissions = commissions.filter(pk=pk)
        return Response([serialize(c, user) for c in commissions.select_related('artist', 'buyer').order_by('-pk')])

    @transaction.atomic
    def post(self, request, pk):
        user = self.account(request)
        commission = CommissionRequest.objects.select_for_update().select_related('artist', 'buyer').filter(pk=pk).first()
        if not commission or user.pk not in (commission.artist_id, commission.buyer_id):
            return Response({'error': 'Commission not found.'}, status=404)
        access = account_access(user)
        if not can_work(commission) or (user.pk != commission.artist_id and (access['banned'] or access['suspended'])):
            return Response({'error': 'This commission is unavailable for restricted work. Contact Customer Service.'}, status=403)
        action = request.data.get('action')
        if action == 'message':
            body = str(request.data.get('body') or '').strip()
            if not body or len(body) > 4000:
                return Response({'error': 'Enter a message of up to 4000 characters.'}, status=400)
            CommissionMessage.objects.create(commission=commission, sender=user, body=body)
            recipient = commission.buyer if user.pk == commission.artist_id else commission.artist
            UserNotification.objects.create(user=recipient, commission=commission, title='Commission message', message=f'New message for {commission.title}. Open the commission workspace.')
        elif action == 'progress' and user.pk == commission.artist_id:
            url = str(request.data.get('image_url') or '')
            try:
                pct = int(request.data.get('progress_percentage', 0))
            except (TypeError, ValueError):
                pct = -1
            if not 1 <= pct <= 100 or pct < commission.current_progress() or not url.startswith(('https://', 'http://', 'data:image/png;base64,', 'data:image/jpeg;base64,', 'data:image/webp;base64,')) or len(url) > 10 * 1024 * 1024:
                return Response({'error': 'Add an image and a progress percentage from 1 to 100, without reducing existing progress.'}, status=400)
            stage = 3 if pct >= 100 else 2 if pct >= 66 else 1
            CommissionPhoto.objects.create(commission_req=commission, image_url=url, photo_type='PROGRESS', stage_number=stage, progress_percentage=pct, caption=str(request.data.get('caption') or '')[:255])
            commission.status = f'STAGE_{stage}'
            commission.save(update_fields=['status'])
            UserNotification.objects.create(user=commission.buyer, commission=commission, title='Commission progress', message=f'{commission.title}: {pct}% complete.')
        else:
            return Response({'error': 'Only commission messages and artist progress submissions are allowed.'}, status=400)
        return Response({'message': 'Saved.'}, status=201)


class CommissionAccessReviewView(RestrictedAccessView):
    def staff(self, request):
        user = self.account(request, allow_restricted=False)
        return user if user.role in ('customer_support', 'platform_admin') else None

    def get(self, request, pk=None):
        user = self.staff(request)
        if not user:
            return Response({'error': 'Customer Service access required.'}, status=403)
        commissions = CommissionRequest.objects.filter(status__in=ACTIVE).select_related('artist', 'buyer')
        if pk is not None:
            commissions = commissions.filter(pk=pk)
        return Response([serialize(c, user) for c in commissions if account_access(c.artist)['banned']])

    @transaction.atomic
    def post(self, request, pk):
        user = self.staff(request)
        if not user:
            return Response({'error': 'Customer Service access required.'}, status=403)
        commission = CommissionRequest.objects.select_for_update().select_related('artist', 'buyer').filter(pk=pk).first()
        if not commission or not eligible(commission) or not account_access(commission.artist)['banned'] or user.pk in (commission.artist_id, commission.buyer_id):
            return Response({'error': 'This commission cannot be approved for restricted work.'}, status=400)
        note = str(request.data.get('note') or '').strip()
        if not note or request.data.get('approved') not in (True, False):
            return Response({'error': 'A decision and reason are required.'}, status=400)
        approved = request.data['approved']
        CommissionAccessDecision.objects.create(commission=commission, restriction_key=restriction_key(commission.artist), approved=approved, note=note[:4000], reviewed_by=user)
        ActivityLog.objects.create(user=user, action='commission_restricted_access', description=f'{"Approved" if approved else "Revoked"} commission work: {note[:200]}', reference_type='commission', reference_id=pk)
        UserNotification.objects.create(user=commission.artist, commission=commission, title='Commission access decision', message=f'{commission.title}: {"limited work approved" if approved else "limited work denied or revoked"}. {note[:500]}')
        return Response({'message': 'Commission access updated.'})
