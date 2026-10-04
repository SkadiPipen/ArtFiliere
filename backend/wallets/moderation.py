from datetime import timedelta
from django.db import transaction
from django.db.models import Q
from django.shortcuts import get_object_or_404
from django.utils import timezone
from rest_framework import serializers
from rest_framework.exceptions import PermissionDenied, ValidationError
from rest_framework.response import Response
from authentication.views import AuthenticatedAPIView
from authentication.permissions import IsAuthenticatedUser
from users.models import User
from .models import AccountModerationRequest, AccountActionRequest, SupportTicket, SupportReply, CancellationReturnRequest
from .support import TicketInput, can_handle, page


class AccountActionInput(serializers.Serializer):
    ticket_id = serializers.IntegerField(min_value=1)
    target_id = serializers.IntegerField(min_value=1)
    action = serializers.ChoiceField(choices=['suspend', 'ban', 'restore'])
    duration_days = serializers.IntegerField(min_value=1, max_value=365, required=False, allow_null=True)
    reason = serializers.CharField(min_length=10, max_length=4000)


def account_action_data(row):
    return dict(id=row.pk, ticket_id=row.ticket_id, target_id=row.target_id, target=row.target.username,
                requested_by=row.requested_by.username, action=row.action, duration_days=row.duration_days,
                reason=row.reason, status=row.status, review_note=row.review_note,
                revoked_at=row.revoked_at.isoformat() if row.revoked_at else None, reversal_reason=row.reversal_reason,
                created_at=row.created_at.isoformat(), reviewed_at=row.reviewed_at.isoformat() if row.reviewed_at else None)


class AccountModerationView(AuthenticatedAPIView):
    permission_classes = [IsAuthenticatedUser]

    def get(self, request):
        user = self.get_request_user(request)
        if user.role not in (User.Role.CUSTOMER_SUPPORT, User.Role.PLATFORM_ADMIN):
            raise PermissionDenied('Customer Support or admin approval access is required.')
        try:
            offset = max(0, int(request.query_params.get('offset', 0)))
        except (ValueError, TypeError):
            raise ValidationError({'error': 'Invalid page.'})
        tickets = AccountModerationRequest.objects.select_related('target', 'requested_by').order_by('-created_at', '-pk')
        reports = AccountActionRequest.objects.select_related('target', 'initiated_by').order_by('-created_at', '-pk')
        limit = offset + 20
        combined = [{**account_action_data(r), 'source': 'ticket'} for r in tickets[:limit]]
        combined += [dict(id=r.pk, report_id=r.report_id, ticket_id=None, target_id=r.target_id, target=r.target.username,
                         requested_by=r.initiated_by.username, action=r.action, duration_days=r.duration_days,
                         reason=r.reason, status=r.status, review_note=r.review_note, source='report',
                         revoked_at=r.revoked_at.isoformat() if r.revoked_at else None, reversal_reason=r.reversal_reason,
                         created_at=r.created_at.isoformat()) for r in reports[:limit]]
        combined.sort(key=lambda r: (r['created_at'], r['source'], r['id']), reverse=True)
        count = tickets.count() + reports.count()
        return Response(dict(results=combined[offset:limit], next_offset=limit if count > limit else None))

    @transaction.atomic
    def post(self, request):
        user = self.get_request_user(request)
        if user.role != User.Role.CUSTOMER_SUPPORT:
            raise PermissionDenied('Only Customer Support can request account action.')
        data = AccountActionInput(data=request.data); data.is_valid(raise_exception=True)
        values = data.validated_data
        ticket = get_object_or_404(SupportTicket.objects.select_for_update(), pk=values['ticket_id'])
        if not can_handle(user, ticket):
            raise PermissionDenied('This report belongs to another department.')
        target = get_object_or_404(User.objects.select_for_update(), pk=values['target_id'], role__in=[User.Role.BUYER, User.Role.ARTIST])
        if AccountModerationRequest.objects.filter(target=target, status='pending').exists():
            raise ValidationError({'error': 'This account already has a pending approval request.'})
        if values['action'] == 'suspend' and not values.get('duration_days'):
            raise ValidationError({'error': 'Specify a suspension duration from 1 to 365 days.'})
        row = AccountModerationRequest.objects.create(requested_by=user, **values)
        return Response(account_action_data(row), status=201)

    @transaction.atomic
    def patch(self, request, action_id):
        admin = self.get_request_user(request)
        if admin.role != User.Role.PLATFORM_ADMIN:
            raise PermissionDenied('Only Platform Admin can approve account restrictions.')
        source = request.query_params.get('source') or request.data.get('source')
        if source not in (None, 'report', 'ticket'):
            raise ValidationError({'error': 'Invalid account action source.'})
        if source is None:
            ticket_exists = AccountModerationRequest.objects.filter(pk=action_id).exists()
            report_exists = AccountActionRequest.objects.filter(pk=action_id).exists()
            if ticket_exists and report_exists:
                raise ValidationError({'error': 'Refresh the approval list before reviewing this request; its source is required.'})
            source = 'report' if report_exists else 'ticket'
        if source == 'report':
            from .management import AccountActionsView
            return AccountActionsView().patch(request, action_id)
        decision = serializers.ChoiceField(choices=['approved', 'rejected']).run_validation(request.data.get('status'))
        note = serializers.CharField(min_length=5, max_length=4000).run_validation(request.data.get('review_note'))
        row = get_object_or_404(AccountModerationRequest.objects.select_for_update(), pk=action_id)
        if row.status != 'pending':
            raise ValidationError({'error': 'This request has already been reviewed.'})
        target = User.objects.select_for_update().get(pk=row.target_id)
        if target.role not in (User.Role.BUYER, User.Role.ARTIST):
            raise ValidationError({'error': 'The account role changed. This request can no longer be applied.'})
        if decision == 'approved':
            if row.action == 'ban':
                target.is_banned = True
            elif row.action == 'suspend':
                if target.is_banned:
                    raise ValidationError({'error': 'A banned account needs an approved restoration first.'})
                target.suspended_until = timezone.now() + timedelta(days=row.duration_days)
            else:
                from .restrictions import restriction_rows, reverse_restriction
                for source, restriction in restriction_rows(target):
                    reverse_restriction(admin, source, restriction.pk, note)
                target.is_banned = False; target.suspended_until = None
            target.save(update_fields=['is_banned', 'suspended_until'])
        row.status = decision; row.review_note = note; row.reviewed_by = admin; row.reviewed_at = timezone.now()
        row.save(update_fields=['status', 'review_note', 'reviewed_by', 'reviewed_at'])
        return Response(account_action_data(row))


class ModeratorUsersView(AuthenticatedAPIView):
    permission_classes = [IsAuthenticatedUser]

    def get(self, request):
        user = self.get_request_user(request)
        if user.role != User.Role.CUSTOMER_SUPPORT:
            raise PermissionDenied('Moderator access is required.')
        roles = ['buyer', 'artist']
        rows = User.objects.filter(role__in=roles).order_by('username', 'pk')
        query = request.query_params.get('q', '').strip()[:150]
        if query:
            rows = rows.filter(Q(username__icontains=query) | Q(first_name__icontains=query) | Q(last_name__icontains=query))
        rows, next_offset = page(request, rows)
        return Response(dict(results=[dict(id=u.pk, username=u.username, name=f'{u.first_name} {u.last_name}'.strip(), role=u.role,
            restricted=u.access_restricted, is_banned=u.is_banned, suspended_until=u.suspended_until.isoformat() if u.suspended_until else None) for u in rows], next_offset=next_offset))


class TicketReturnReviewView(AuthenticatedAPIView):
    permission_classes = [IsAuthenticatedUser]

    @transaction.atomic
    def post(self, request, ticket_id):
        user = self.get_request_user(request)
        ticket = get_object_or_404(SupportTicket.objects.select_for_update(), pk=ticket_id)
        if user.role != User.Role.CUSTOMER_SUPPORT or not can_handle(user, ticket):
            raise PermissionDenied('Only Customer Support can review returns and refunds.')
        if not ticket.payment_id or ticket.payment.status not in ('paid', 'refunded'):
            raise ValidationError({'error': 'A paid transaction is required for a return or refund review.'})
        kind = serializers.ChoiceField(choices=['return', 'refund']).run_validation(request.data.get('type'))
        if kind == 'return' and ticket.payment.artwork.art_type.lower() != 'physical':
            raise ValidationError({'error': 'Only physical artwork can be returned.'})
        decision = serializers.ChoiceField(choices=['approved', 'declined']).run_validation(request.data.get('status'))
        note = serializers.CharField(min_length=10, max_length=2000).run_validation(request.data.get('note'))
        row = CancellationReturnRequest.objects.filter(payment_session=ticket.payment, request_type=kind, status='pending').first()
        if row is None:
            row = CancellationReturnRequest(payment_session=ticket.payment, requester=ticket.payment.buyer, request_type=kind, reason=ticket.details)
        row.status = decision; row.admin_note = note; row.reviewed_by = user; row.reviewed_at = timezone.now(); row.save()
        SupportReply.objects.create(ticket=ticket, sender=user, message=f'{kind.title()} review {decision}. {note}\nApproval is a support decision; payment settlement is tracked separately.')
        ticket.status = SupportTicket.Status.IN_PROGRESS; ticket.save(update_fields=['status', 'updated_at'])
        return Response(dict(id=row.pk, status=row.status, message='Review saved. This does not execute a payment refund.'))
