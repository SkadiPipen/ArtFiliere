"""Role-scoped reports, counterpart cancellation responses, and approval requests."""
from django.db import transaction
import json
from pathlib import Path
from django.http import HttpResponse
from django.core.validators import URLValidator
from django.core.exceptions import ValidationError as DjangoValidationError
from decimal import Decimal, InvalidOperation
from django.db.models import Sum
from django.db.models import Q, Prefetch
from django.utils import timezone
from rest_framework.exceptions import ValidationError, NotFound, PermissionDenied
from rest_framework.response import Response
from authentication.views import AuthenticatedAPIView
from authentication.permissions import IsAuthenticatedUser
from users.models import User, ActivityLog
from notifications.models import UserNotification
from .models import PaymentSession, IncidentReport, AccountActionRequest, CancellationReturnRequest, FinancialAuthorization, ReportAttachment

STAFF = {'customer_support', 'platform_admin'}
REPORTERS = {'buyer', 'artist', 'driver'}


def text(data, field, limit, required=True):
    value = data.get(field, '')
    if not isinstance(value, str) or len(value.strip()) > limit or (required and not value.strip()):
        raise ValidationError({'error': f'Enter a valid {field.replace("_", " ")} (up to {limit} characters).'})
    return value.strip()


def number(data, field, required=False):
    value = data.get(field)
    if value in (None, '') and not required:
        return None
    if type(value) is not int or value < 1:
        raise ValidationError({'error': f'Enter a valid {field.replace("_", " ")}.'})
    return value


def payments_for(user):
    rows = PaymentSession.objects.select_related('buyer', 'artist', 'artwork')
    if user.role in STAFF:
        return rows
    if user.role == 'driver':
        # Delivery riders use Django auth profiles; their verified account email links the two identities.
        return rows.filter(Q(delivery_orders__assigned_rider__user__email__iexact=user.email) | Q(delivery_order__driver=user)).distinct()
    return rows.filter(Q(buyer=user) | Q(artist=user))


def notify(user, title, message):
    UserNotification.objects.create(user=user, title=title, message=message)
    ActivityLog.objects.create(user=user, action='management_update', description=message)


def report_data(row):
    return {'id': row.pk, 'reporter': row.reporter.username, 'reporter_id': row.reporter_id,
            'reported_user_id': row.reported_user_id, 'reported_user': row.reported_user.username if row.reported_user else None,
            'payment_id': row.payment_id, 'category': row.category, 'title': row.title,
            'description': row.description, 'evidence': row.evidence, 'status': row.status,
            'attachments': [{'id': a.pk, 'name': a.name, 'size': a.size} for a in row.attachments.all()],
            'links': [line for line in row.evidence.splitlines() if line.startswith(('https://', 'http://'))],
            'resolution': row.resolution, 'created_at': row.created_at.isoformat()}


def action_data(row):
    return {'id': row.pk, 'report_id': row.report_id, 'target': row.target.username, 'target_id': row.target_id,
            'action': row.action, 'reason': row.reason, 'status': row.status, 'duration_days': row.duration_days,
            'initiated_by': row.initiated_by.username, 'review_note': row.review_note,
            'expires_at': row.expires_at.isoformat() if row.expires_at else None}


def financial_data(row):
    return {'id': row.pk, 'report_id': row.report_id, 'payment_id': row.payment_id,
            'recipient': row.recipient.username, 'authorized_by': row.authorized_by.username,
            'kind': row.kind, 'amount': str(row.amount), 'currency': 'PHP', 'reason': row.reason,
            'status': row.status, 'created_at': row.created_at.isoformat()}


def request_data(row, user):
    from .views import serialize_request
    counterpart = row.payment_session.artist if row.requester_id == row.payment_session.buyer_id else row.payment_session.buyer
    return {**serialize_request(row), 'requester_id': row.requester_id, 'requester': row.requester.username,
            'counterpart': counterpart.username, 'counterpart_decision': row.counterpart_decision,
            'counterpart_note': row.counterpart_note, 'can_respond': row.status == 'pending' and row.request_type == 'cancellation'
            and row.counterpart_decision == 'pending' and user.pk == counterpart.pk}


class ManagementView(AuthenticatedAPIView):
    permission_classes = [IsAuthenticatedUser]

    def get(self, request):
        user = self.get_request_user(request)
        if user.role not in STAFF | REPORTERS:
            raise PermissionDenied('This role does not have report management access.')
        reports = IncidentReport.objects.select_related('reporter', 'reported_user').prefetch_related(Prefetch('attachments', queryset=ReportAttachment.objects.defer('content')))
        requests = CancellationReturnRequest.objects.select_related('requester', 'payment_session__artwork', 'payment_session__buyer', 'payment_session__artist')
        if user.role not in STAFF:
            reports = reports.filter(reporter=user)
            requests = requests.filter(Q(payment_session__buyer=user) | Q(payment_session__artist=user)) if user.role in {'buyer', 'artist'} else requests.none()
        actions = AccountActionRequest.objects.select_related('target', 'initiated_by').all() if user.role in STAFF else AccountActionRequest.objects.none()
        financials = FinancialAuthorization.objects.select_related('recipient', 'authorized_by')
        if user.role not in STAFF:
            financials = financials.filter(Q(payment__buyer=user) | Q(payment__artist=user)) if user.role in {'buyer', 'artist'} else financials.none()
        return Response({'role': user.role, 'reports': [report_data(r) for r in reports.order_by('-pk')[:200]],
            'requests': [request_data(r, user) for r in requests.order_by('-pk')[:200]],
            'actions': [action_data(r) for r in actions.order_by('-pk')[:200]],
            'financials': [financial_data(r) for r in financials.order_by('-pk')[:200]],
            'payments': [{'id': p.pk, 'title': p.artwork.title, 'buyer': p.buyer.username, 'artist': p.artist.username,
                          'status': p.status, 'amount': str(p.gross_amount), 'physical': p.artwork.art_type == 'physical'}
                         for p in payments_for(user).order_by('-pk')[:200]]})


class ReportUserSearchView(AuthenticatedAPIView):
    permission_classes = [IsAuthenticatedUser]

    def get(self, request):
        user = self.get_request_user(request)
        if user.role not in REPORTERS:
            raise PermissionDenied('Only report authors can search reported accounts.')
        query = request.query_params.get('q', '').strip()
        if len(query) < 3 or len(query) > 150:
            return Response([])
        matches = User.objects.exclude(pk=user.pk).filter(role__in=REPORTERS, username__istartswith=query).order_by('username')
        return Response(list(matches.values('id', 'username', 'role')[:5]))


class ReportsView(AuthenticatedAPIView):
    permission_classes = [IsAuthenticatedUser]

    @transaction.atomic
    def post(self, request):
        user = self.get_request_user(request)
        if user.role not in REPORTERS:
            raise PermissionDenied('Only buyers, artists, and drivers can file incident reports.')
        data = request.data
        if 'payload' in data:
            try:
                data = json.loads(data['payload'])
                if not isinstance(data, dict):
                    raise ValueError
            except (ValueError, TypeError):
                raise ValidationError({'error': 'Invalid report payload.'})
        links = data.get('links', [])
        if not isinstance(links, list) or len(links) > 5:
            raise ValidationError({'error': 'Attach up to five reference links.'})
        for link in links:
            try:
                if not isinstance(link, str) or len(link) > 2000:
                    raise DjangoValidationError('Invalid link')
                URLValidator(schemes=['http', 'https'])(link)
            except DjangoValidationError:
                raise ValidationError({'error': 'Reference links must be valid HTTP or HTTPS URLs.'})
        files = request.FILES.getlist('files')
        if len(files) > 5:
            raise ValidationError({'error': 'Attach up to five files.'})
        allowed = {'.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.png': 'image/png', '.webp': 'image/webp', '.pdf': 'application/pdf'}
        validated_files = []
        for file in files:
            ext = Path(file.name).suffix.lower()
            if ext not in allowed or not 0 < file.size <= 5 * 1024 * 1024:
                raise ValidationError({'error': 'Use JPG, PNG, WebP or PDF files up to 5 MB each.'})
            content = file.read()
            valid = (ext in {'.jpg', '.jpeg'} and content.startswith(b'\xff\xd8\xff') or ext == '.png' and content.startswith(b'\x89PNG\r\n\x1a\n') or ext == '.pdf' and content.startswith(b'%PDF-') or ext == '.webp' and content[:4] == b'RIFF' and content[8:12] == b'WEBP')
            if not valid:
                raise ValidationError({'error': 'File content does not match its type.'})
            validated_files.append((file, allowed[ext], content))
        payment_id = number(data, 'payment_id')
        payment = payments_for(user).filter(pk=payment_id).first() if payment_id else None
        if payment_id and not payment:
            raise NotFound('Transaction not found.')
        target_id = number(data, 'reported_user_id')
        target = User.objects.filter(pk=target_id, role__in=REPORTERS).exclude(pk=user.pk).first() if target_id else None
        if target_id and not target:
            raise NotFound('Reported account not found.')
        category = data.get('category', 'incident')
        if category not in {'incident', 'dispute'}:
            raise ValidationError({'error': 'Choose incident or dispute.'})
        row = IncidentReport.objects.create(reporter=user, reported_user=target, payment=payment,
            category=category, title=text(data, 'title', 150), description=text(data, 'description', 5000),
            evidence='\n'.join(links) if 'links' in data else text(data, 'evidence', 2000, False))
        for file, content_type, content in validated_files:
            ReportAttachment.objects.create(report=row, name=Path(file.name).name[:200], content_type=content_type, content=content, size=len(content))
        notify(user, 'Report submitted', f'Report #{row.pk} is awaiting moderator review.')
        for moderator in User.objects.filter(role='customer_support'):
            notify(moderator, 'New incident / dispute report', f'Report #{row.pk}: {row.title}')
        return Response(report_data(row), status=201)

    @transaction.atomic
    def patch(self, request, report_id):
        user = self.get_request_user(request)
        if user.role not in STAFF:
            raise PermissionDenied('Moderator access is required.')
        row = IncidentReport.objects.select_for_update().filter(pk=report_id).first()
        if not row:
            raise NotFound('Report not found.')
        status = request.data.get('status')
        if status not in {'under_review', 'resolved', 'dismissed'} or row.status in {'resolved', 'dismissed'}:
            raise ValidationError({'error': 'Choose a valid decision for an open report.'})
        row.resolution = text(request.data, 'resolution', 2000, status in {'resolved', 'dismissed'})
        row.status, row.reviewed_by = status, user
        row.save()
        notify(row.reporter, 'Report updated', f'Report #{row.pk}: {status.replace("_", " ")}. {row.resolution}')
        return Response(report_data(row))


class ReportAttachmentView(AuthenticatedAPIView):
    permission_classes = [IsAuthenticatedUser]

    def get(self, request, attachment_id):
        user = self.get_request_user(request)
        rows = ReportAttachment.objects.select_related('report').defer('content')
        if user.role not in STAFF:
            rows = rows.filter(report__reporter=user)
        attachment = rows.filter(pk=attachment_id).first()
        if not attachment:
            raise NotFound('Attachment not found.')
        response = HttpResponse(bytes(attachment.content), content_type=attachment.content_type)
        from django.utils.http import content_disposition_header
        response['Content-Disposition'] = content_disposition_header(True, attachment.name)
        response['Cache-Control'] = 'private, no-store'
        response['X-Content-Type-Options'] = 'nosniff'
        return response


class AccountActionsView(AuthenticatedAPIView):
    permission_classes = [IsAuthenticatedUser]

    @transaction.atomic
    def post(self, request):
        user = self.get_request_user(request)
        if user.role != 'customer_support':
            raise PermissionDenied('Only moderators can initiate suspension or ban requests.')
        report_id = number(request.data, 'report_id', True)
        report = IncidentReport.objects.filter(pk=report_id).first()
        if not report or not report.reported_user_id:
            raise ValidationError({'error': 'Select a report with a reported account.'})
        target = User.objects.select_for_update().get(pk=report.reported_user_id)
        if target.pk == user.pk or target.role not in REPORTERS:
            raise PermissionDenied('This account cannot be targeted.')
        action = request.data.get('action')
        if action not in {'suspension', 'ban'}:
            raise ValidationError({'error': 'Choose suspension or ban.'})
        days = number(request.data, 'duration_days', action == 'suspension') if action == 'suspension' else None
        if days and days > 365:
            raise ValidationError({'error': 'Suspension must be between 1 and 365 days.'})
        if AccountActionRequest.objects.filter(target=target, status='pending').exists():
            raise ValidationError({'error': 'This account already has a pending approval request.'})
        row = AccountActionRequest.objects.create(report=report, target=target, initiated_by=user,
            action=action, duration_days=days, reason=text(request.data, 'reason', 2000))
        for admin in User.objects.filter(role='platform_admin'):
            notify(admin, 'Account action requires approval', f'{user.username} requested {action} for {target.username}. Request #{row.pk}.')
        return Response(action_data(row), status=201)

    @transaction.atomic
    def patch(self, request, action_id):
        admin = self.get_request_user(request)
        if admin.role != 'platform_admin':
            raise PermissionDenied('Platform Admin approval is required.')
        row = AccountActionRequest.objects.select_for_update().filter(pk=action_id, status='pending').first()
        if not row:
            raise NotFound('Pending approval request not found.')
        if row.initiated_by_id == admin.pk or row.target_id == admin.pk:
            raise PermissionDenied('You cannot approve your own request or an action against yourself.')
        if row.target.role not in REPORTERS:
            raise ValidationError({'error': 'The target account role changed. Submit a new request after review.'})
        status = request.data.get('status')
        if status not in {'approved', 'declined'}:
            raise ValidationError({'error': 'Choose approved or declined.'})
        row.status, row.reviewed_by, row.reviewed_at = status, admin, timezone.now()
        row.review_note = text(request.data, 'review_note', 2000)
        if status == 'approved' and row.action == 'suspension':
            row.expires_at = row.reviewed_at + timezone.timedelta(days=row.duration_days)
        row.save()
        notify(row.target, 'Account action reviewed', f'{row.action.capitalize()} request #{row.pk} was {status}. {row.review_note}')
        notify(row.initiated_by, 'Approval decision', f'Account action #{row.pk} was {status}.')
        return Response(action_data(row))


class FinancialAuthorizationsView(AuthenticatedAPIView):
    permission_classes = [IsAuthenticatedUser]

    @transaction.atomic
    def post(self, request):
        actor = self.get_request_user(request)
        if actor.role not in STAFF:
            raise PermissionDenied('Only moderators and Platform Admin can authorize refunds or wallet credits.')
        report = IncidentReport.objects.filter(pk=number(request.data, 'report_id', True)).first()
        if not report or not report.payment_id:
            raise ValidationError({'error': 'Select a transaction-linked report.'})
        payment = PaymentSession.objects.select_for_update().get(pk=report.payment_id)
        if actor.pk in {payment.buyer_id, payment.artist_id, report.reporter_id, report.reported_user_id}:
            raise PermissionDenied('You cannot authorize compensation on your own dispute or transaction.')
        if payment.status != 'paid' or report.status == 'dismissed':
            raise ValidationError({'error': 'Compensation requires a paid transaction and a report that is not dismissed.'})
        kind = request.data.get('kind')
        if kind not in {'refund', 'wallet_credit'}:
            raise ValidationError({'error': 'Choose refund or wallet credit.'})
        try:
            raw_amount = request.data.get('amount')
            if isinstance(raw_amount, bool):
                raise ValueError
            amount = Decimal(str(raw_amount))
            if not amount.is_finite() or amount <= 0 or amount != amount.quantize(Decimal('.01')):
                raise ValueError
        except (InvalidOperation, ValueError, TypeError):
            raise ValidationError({'error': 'Enter a positive PHP amount with at most two decimal places.'})
        reserved = payment.financial_authorizations.exclude(status='denied').aggregate(total=Sum('amount'))['total'] or Decimal('0')
        if amount + reserved > payment.gross_amount:
            raise ValidationError({'error': f'Amount exceeds the remaining transaction compensation limit (PHP {payment.gross_amount - reserved}).'})
        row = FinancialAuthorization.objects.create(report=report, payment=payment, recipient=payment.buyer,
            authorized_by=actor, kind=kind, amount=amount, reason=text(request.data, 'reason', 2000))
        notify(payment.buyer, 'Compensation authorized', f'{kind.replace("_", " ").capitalize()} of PHP {amount:.2f} authorized for transaction #{payment.pk}. Processing is pending.')
        ActivityLog.objects.create(user=actor, action=f'{kind}_authorized', description=f'Authorized PHP {amount:.2f} for transaction #{payment.pk}. Authorization #{row.pk}.', reference_type='financial_authorization', reference_id=row.pk)
        return Response(financial_data(row), status=201)


class TransactionRequestsView(AuthenticatedAPIView):
    permission_classes = [IsAuthenticatedUser]

    def get(self, request):
        user = self.get_request_user(request)
        rows = CancellationReturnRequest.objects.filter(Q(payment_session__buyer=user) | Q(payment_session__artist=user)).select_related('payment_session__artwork', 'payment_session__buyer', 'payment_session__artist', 'requester')
        return Response([request_data(row, user) for row in rows.order_by('-pk')[:200]])

    @transaction.atomic
    def post(self, request, payment_id):
        user = self.get_request_user(request)
        if user.role not in {'buyer', 'artist'}:
            raise PermissionDenied('Only buyers and artists can request cancellation or return.')
        payment = PaymentSession.objects.select_for_update().filter(pk=payment_id).filter(Q(buyer=user) | Q(artist=user)).first()
        if not payment:
            raise NotFound('Transaction not found.')
        kind = request.data.get('request_type')
        if kind not in {'cancellation', 'return'}:
            raise ValidationError({'error': 'Choose cancellation or return.'})
        if payment.status not in {'pending', 'paid'} or (kind == 'return' and (payment.status != 'paid' or payment.artwork.art_type != 'physical')):
            raise ValidationError({'error': 'Returns require a paid physical purchase. Cancellation requires an active transaction.'})
        if CancellationReturnRequest.objects.filter(payment_session=payment, request_type=kind, status='pending').exists():
            raise ValidationError({'error': 'There is already an open request of this type for this transaction.'})
        row = CancellationReturnRequest.objects.create(payment_session=payment, requester=user, request_type=kind, reason=text(request.data, 'reason', 2000))
        counterpart = payment.artist if user.pk == payment.buyer_id else payment.buyer
        notify(counterpart, 'Transaction request', f'{user.username} requested {kind} for transaction #{payment.pk}.')
        return Response(request_data(row, user), status=201)

    @transaction.atomic
    def patch(self, request, request_id):
        user = self.get_request_user(request)
        if user.role not in {'buyer', 'artist'}:
            raise PermissionDenied('Only the buyer or artist counterpart can respond.')
        row = CancellationReturnRequest.objects.select_for_update().select_related('payment_session').filter(pk=request_id).first()
        if not row or user.pk not in {row.payment_session.buyer_id, row.payment_session.artist_id}:
            raise NotFound('Transaction request not found.')
        if row.requester_id == user.pk:
            raise PermissionDenied('You cannot respond to your own cancellation request.')
        if row.status != 'pending' or row.request_type != 'cancellation' or row.counterpart_decision != 'pending':
            raise ValidationError({'error': 'This request is not awaiting a counterpart response.'})
        decision = request.data.get('decision')
        if decision not in {'accepted', 'declined'}:
            raise ValidationError({'error': 'Choose accepted or declined.'})
        row.counterpart_decision, row.responded_by, row.responded_at = decision, user, timezone.now()
        row.counterpart_note = text(request.data, 'note', 2000, False)
        if decision == 'declined':
            row.status = 'declined'
        row.save()
        notify(row.requester, 'Cancellation response', f'Cancellation request #{row.pk} was {decision} by {user.username}.')
        return Response(request_data(row, user))
