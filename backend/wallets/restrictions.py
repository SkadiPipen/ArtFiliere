"""Restricted-account access is limited to the notice, appeal and evidence endpoints."""
import json
from pathlib import Path
from datetime import timedelta
from django.db import transaction
from django.db.models import Q
from django.utils import timezone
from django.core.validators import URLValidator
from django.core.exceptions import ValidationError as DjangoValidationError
from django.http import HttpResponse
from django.utils.http import content_disposition_header
from rest_framework.views import APIView
from rest_framework.permissions import AllowAny
from rest_framework.exceptions import PermissionDenied, ValidationError, NotFound
from rest_framework.response import Response
from authentication.services import verify_token
from users.models import User, ActivityLog
from .models import AccountActionRequest, AccountModerationRequest, RestrictionAppeal, ReportAttachment


def restriction_rows(user):
    now = timezone.now()
    rows = [('report', r) for r in AccountActionRequest.objects.filter(target=user, status='approved', revoked_at__isnull=True).filter(Q(action='ban') | Q(action='suspension', expires_at__gt=now))]
    restored = AccountModerationRequest.objects.filter(target=user, status='approved', action='restore').order_by('-reviewed_at').first()
    tickets = AccountModerationRequest.objects.filter(target=user, status='approved', revoked_at__isnull=True, action__in=['ban', 'suspend'])
    if restored:
        tickets = tickets.filter(reviewed_at__gt=restored.reviewed_at)
    for row in tickets:
        end = row.reviewed_at + timedelta(days=row.duration_days or 0) if row.reviewed_at else None
        if row.action == 'ban' or (end and end > now):
            rows.append(('ticket', row))
    return rows


def restriction_data(source, row):
    end = row.expires_at if source == 'report' else (row.reviewed_at + timedelta(days=row.duration_days or 0) if row.action == 'suspend' and row.reviewed_at else None)
    return dict(source=source, id=row.pk, action='ban' if row.action == 'ban' else 'suspension', reason=row.reason,
                review_note=row.review_note, ends_at=end.isoformat() if end else None)


def audit(user, action, reason, source, pk):
    ActivityLog.objects.create(user=user, action=action, description=reason[:255], reference_type=f'{source}_restriction', reference_id=pk)


@transaction.atomic
def reverse_restriction(admin, source, pk, reason):
    if admin.role != 'platform_admin':
        raise PermissionDenied('Only Platform Admin can restore account access.')
    model = AccountActionRequest if source == 'report' else AccountModerationRequest if source == 'ticket' else None
    if not model:
        raise ValidationError({'error': 'Invalid restriction source.'})
    row = model.objects.select_for_update().filter(pk=pk, status='approved').first()
    if not row or row.action == 'restore':
        raise NotFound('Approved restriction not found.')
    if row.target_id == admin.pk:
        raise PermissionDenied('You cannot restore your own account.')
    if row.revoked_at:
        raise ValidationError({'error': 'This restriction has already been lifted.'})
    target = User.objects.select_for_update().get(pk=row.target_id)
    row.revoked_at, row.revoked_by, row.reversal_reason = timezone.now(), admin, reason
    row.save(update_fields=['revoked_at', 'revoked_by', 'reversal_reason'])
    active_tickets = [r for src, r in restriction_rows(target) if src == 'ticket']
    target.is_banned = any(r.action == 'ban' for r in active_tickets)
    ends = [r.reviewed_at + timedelta(days=r.duration_days) for r in active_tickets if r.action == 'suspend']
    target.suspended_until = max(ends) if ends else None
    target.save(update_fields=['is_banned', 'suspended_until'])
    audit(admin, 'restriction_reversed', reason, source, pk)
    audit(target, 'restriction_lifted', reason, source, pk)
    from notifications.models import UserNotification
    UserNotification.objects.create(user=target, title='Account restriction lifted', message=reason)
    return row


def appeal_data(row):
    model = AccountActionRequest if row.source == 'report' else AccountModerationRequest if row.source == 'ticket' else None
    restriction = model.objects.filter(pk=row.restriction_id, target=row.user).first() if model else None
    return dict(id=row.pk, user=row.user.username, source=row.source, restriction_id=row.restriction_id,
                restriction=restriction_data(row.source, restriction) if restriction else None,
                explanation=row.explanation, links=row.links, status=row.status, recommendation=row.recommendation,
                moderator_note=row.moderator_note, decision_note=row.decision_note,
                attachments=[dict(id=a.pk, name=a.name, size=a.size) for a in row.attachments.defer('content')])


class RestrictedAccessView(APIView):
    permission_classes = [AllowAny]

    def account(self, request, allow_restricted=True):
        header = request.headers.get('Authorization', '')
        if not header.startswith('Bearer '):
            raise PermissionDenied('Please sign in to view your account restriction.')
        decoded = verify_token(header[7:], allow_restricted=allow_restricted)
        user = User.objects.filter(firebase_uid=decoded['uid']).first()
        if not user:
            raise PermissionDenied('Account not found.')
        return user


class RestrictionStatusView(RestrictedAccessView):
    def get(self, request):
        user = self.account(request)
        active = [restriction_data(src, row) for src, row in restriction_rows(user)]
        if user.access_restricted and (not active or user.is_banned and not any(r['action'] == 'ban' for r in active)):
            active.append(dict(source='account', id=user.pk, action='ban' if user.is_banned else 'suspension', reason='Account access was restricted by an administrator. Contact Customer Service for review.', ends_at=user.suspended_until.isoformat() if user.suspended_until else None))
        return Response(dict(restricted=bool(active), restrictions=active,
                             appeals=[appeal_data(a) for a in RestrictionAppeal.objects.filter(user=user).select_related('user').order_by('-pk')[:50]]))


class RestrictionAppealsView(RestrictedAccessView):
    def get(self, request):
        user = self.account(request, False)
        if user.role not in {'customer_support', 'platform_admin'}:
            raise PermissionDenied('Appeal review is restricted to Customer Service and Platform Admin.')
        rows = RestrictionAppeal.objects.select_related('user').order_by('-pk')[:200]
        return Response([appeal_data(row) for row in rows])

    @transaction.atomic
    def post(self, request):
        user = self.account(request)
        user = User.objects.select_for_update().get(pk=user.pk)
        from .management import text, number
        data = request.data
        if 'payload' in data:
            try:
                data = json.loads(data['payload'])
                if not isinstance(data, dict):
                    raise ValueError
            except (ValueError, TypeError):
                raise ValidationError({'error': 'Invalid appeal.'})
        source, pk = data.get('source'), number(data, 'restriction_id', True)
        active = restriction_rows(user)
        if not any(src == source and row.pk == pk for src, row in active):
            if not (source == 'account' and pk == user.pk and user.access_restricted and not active):
                raise NotFound('Your active restriction was not found.')
        if RestrictionAppeal.objects.filter(user=user, source=source, restriction_id=pk, status__in=['pending', 'recommended']).exists():
            raise ValidationError({'error': 'An appeal is already awaiting review for this restriction.'})
        links = data.get('links', [])
        if not isinstance(links, list) or len(links) > 5:
            raise ValidationError({'error': 'Attach up to five links.'})
        for link in links:
            try:
                if not isinstance(link, str) or len(link) > 2000:
                    raise DjangoValidationError('Invalid link')
                URLValidator(schemes=['https', 'http'])(link)
            except DjangoValidationError:
                raise ValidationError({'error': 'Enter valid HTTP or HTTPS evidence links.'})
        files = request.FILES.getlist('files')
        if len(files) > 5:
            raise ValidationError({'error': 'Attach up to five files.'})
        validated = []
        for file in files:
            ext = Path(file.name).suffix.lower()
            types = {'.pdf': 'application/pdf', '.png': 'image/png', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.webp': 'image/webp'}
            if ext not in types or not 0 < file.size <= 5 * 1024 * 1024:
                raise ValidationError({'error': 'Use JPG, PNG, WebP or PDF files up to 5 MB each.'})
            content = file.read()
            if not (ext == '.pdf' and content.startswith(b'%PDF-') or ext == '.png' and content.startswith(b'\x89PNG\r\n\x1a\n') or ext in {'.jpg', '.jpeg'} and content.startswith(b'\xff\xd8\xff') or ext == '.webp' and content[:4] == b'RIFF' and content[8:12] == b'WEBP'):
                raise ValidationError({'error': 'File content does not match its type.'})
            validated.append((file, types[ext], content))
        row = RestrictionAppeal.objects.create(user=user, source=source, restriction_id=pk, explanation=text(data, 'explanation', 4000), links=links)
        for file, content_type, content in validated:
            ReportAttachment.objects.create(appeal=row, name=Path(file.name).name[:200], content_type=content_type, content=content, size=len(content))
        audit(user, 'restriction_appealed', row.explanation, source, pk)
        from notifications.models import UserNotification
        for admin in User.objects.filter(role='platform_admin'):
            UserNotification.objects.create(user=admin, title='New restriction appeal', message=f'Appeal #{row.pk} from {user.username} awaits your decision.')
        return Response(appeal_data(row), status=201)

    @transaction.atomic
    def patch(self, request, appeal_id):
        user = self.account(request, False)
        if user.role not in {'customer_support', 'platform_admin'}:
            raise PermissionDenied('Staff review access is required.')
        row = RestrictionAppeal.objects.select_for_update().select_related('user').filter(pk=appeal_id).first()
        if not row:
            raise NotFound('Appeal not found.')
        if row.user_id == user.pk:
            raise PermissionDenied('You cannot review your own appeal.')
        from .management import text
        note = text(request.data, 'note', 4000)
        if user.role == 'customer_support':
            if row.status != 'pending' or request.data.get('recommendation') not in {'reinstate', 'uphold'}:
                raise ValidationError({'error': 'Choose a recommendation for a pending appeal.'})
            row.recommendation, row.moderator_note, row.recommended_by, row.status = request.data['recommendation'], note, user, 'recommended'
        else:
            decision = request.data.get('decision')
            if row.status not in {'pending', 'recommended'} or decision not in {'approved', 'denied'}:
                raise ValidationError({'error': 'Choose approve or deny for an open appeal.'})
            if decision == 'approved':
                if row.source == 'account':
                    target = User.objects.select_for_update().get(pk=row.user_id)
                    if restriction_rows(target):
                        raise ValidationError({'error': 'Review the newer restrictions before restoring this account.'})
                    target.is_banned = False; target.suspended_until = None
                    target.save(update_fields=['is_banned', 'suspended_until'])
                    audit(user, 'restriction_reversed', note, row.source, row.restriction_id)
                else:
                    model = AccountActionRequest if row.source == 'report' else AccountModerationRequest
                    restriction = model.objects.select_for_update().get(pk=row.restriction_id, target=row.user)
                    if not restriction.revoked_at:
                        reverse_restriction(user, row.source, row.restriction_id, note)
            row.status, row.decision_note, row.decided_by, row.decided_at = decision, note, user, timezone.now()
        row.save()
        audit(user, 'appeal_reviewed', note, row.source, row.restriction_id)
        from notifications.models import UserNotification
        UserNotification.objects.create(user=row.user, title='Appeal updated', message=f'Appeal #{row.pk}: {row.status}.')
        if row.status == 'recommended':
            for admin in User.objects.filter(role='platform_admin'):
                UserNotification.objects.create(user=admin, title='Appeal requires decision', message=f'Customer Service reviewed appeal #{row.pk}. Recommendation: {row.recommendation}.')
        return Response(appeal_data(row))


class ReverseRestrictionView(RestrictedAccessView):
    def post(self, request, source, restriction_id):
        admin = self.account(request, False)
        from .management import text
        reverse_restriction(admin, source, restriction_id, text(request.data, 'reason', 4000))
        return Response({'message': 'Restriction lifted. Original approval and reversal remain in the audit history.'})


class AppealAttachmentView(RestrictedAccessView):
    def get(self, request, attachment_id):
        user = self.account(request)
        rows = ReportAttachment.objects.filter(appeal__isnull=False)
        if user.role not in {'customer_support', 'platform_admin'} or user.access_restricted or restriction_rows(user):
            rows = rows.filter(appeal__user=user)
        row = rows.filter(pk=attachment_id).first()
        if not row:
            raise NotFound('Attachment not found.')
        response = HttpResponse(bytes(row.content), content_type=row.content_type)
        response['Content-Disposition'] = content_disposition_header(True, row.name)
        response['Cache-Control'] = 'private, no-store'
        response['X-Content-Type-Options'] = 'nosniff'
        return response
