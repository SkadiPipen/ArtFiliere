"""Per-admin read receipts, independent of the requests' business decisions."""
import hashlib
from django.core import signing
from django.db.models import Q
from rest_framework.exceptions import PermissionDenied, ValidationError
from rest_framework.response import Response
from authentication.views import AuthenticatedAPIView
from authentication.permissions import IsPlatformAdmin
from users.models import ResellerApplication, RoyaltyApplication
from wallets.models import AccountActionRequest, AccountModerationRequest, RestrictionAppeal, CancellationReturnRequest
from blockchain.models import ProvenanceReview, ProvenanceEvent
from messaging.models import RoyaltyPeriod
from commissions.models import CommissionRequest
from .models import AdminRequestRead

SALT = 'admin-request-notification-snapshot-v1'


def pending_requests():
    entries = []

    def add(kind, rows, title, destination, date_field='created_at', extra_version=None):
        for row in rows:
            date = getattr(row, date_field)
            version = f'{row.pk}:{getattr(row, "status", "")}:{date.isoformat() if date else ""}'
            if extra_version:
                version += ':' + str(extra_version(row))
            key = kind + ':' + str(row.pk) + ':' + hashlib.sha256(version.encode()).hexdigest()[:20]
            entries.append({'key': key, 'category': kind, 'title': f'{title} #{row.pk}',
                            'destination': destination, 'created_at': date.isoformat() if date else None})

    add('reseller', ResellerApplication.objects.filter(status='pending').only('id', 'status', 'submitted_at'), 'Reseller documents awaiting review', '/reseller-approvals', 'submitted_at')
    add('royalty', RoyaltyApplication.objects.filter(status='pending').only('id', 'status', 'submitted_at'), 'Royalty application awaiting review', '/royalty-approvals', 'submitted_at')
    add('attribution', ProvenanceReview.objects.filter(status='pending').only('id', 'status', 'created_at'), 'Attribution request awaiting review', '/attribution-reviews')
    add('blockchain', ProvenanceEvent.objects.filter(status='failed').only('id', 'status', 'created_at', 'transaction_hash'), 'Blockchain proof requires review', '/attribution-reviews', extra_version=lambda row: row.transaction_hash)
    add('account', AccountActionRequest.objects.filter(status='pending').only('id', 'status', 'created_at'), 'Reported account action awaiting approval', '/moderation-approvals')
    add('account_support', AccountModerationRequest.objects.filter(status='pending').only('id', 'status', 'created_at'), 'Support account action awaiting approval', '/moderation-approvals')
    add('appeal', RestrictionAppeal.objects.filter(status__in=['pending', 'recommended']).only('id', 'status', 'created_at'), 'Restriction appeal awaiting decision', '/moderation-approvals')
    add('transaction', CancellationReturnRequest.objects.filter(status='pending').only('id', 'status', 'created_at'), 'Cancellation or return awaiting review', '/report-management')
    add('royalty_report', RoyaltyPeriod.objects.filter(terms__review_mode='admin_held', status__in=['submitted', 'funded']).only('id', 'status', 'submitted_at'), 'Royalty report/payment awaiting review', '/admin-payments', 'submitted_at')
    add('commission', CommissionRequest.objects.filter(Q(disputed=True) | Q(milestones__payout_status__in=['FAILED', 'REVERSED', 'REJECTED', 'RETRY_PENDING', 'RECONCILE']), flow_version=2).only('commission_req_id', 'status', 'created_at').distinct(), 'Commission dispute/payout awaiting review', '/admin-dashboard')
    return sorted(entries, key=lambda entry: (entry['created_at'] or '', entry['key']), reverse=True)


def payload(user):
    rows = pending_requests()
    keys = [row['key'] for row in rows]
    read = set(AdminRequestRead.objects.filter(user=user, request_key__in=keys).values_list('request_key', flat=True))
    for row in rows:
        row['is_read'] = row['key'] in read
    categories = {}
    for row in rows:
        count = categories.setdefault(row['category'], {'pending': 0, 'unread': 0})
        count['pending'] += 1
        count['unread'] += int(not row['is_read'])
    snapshot = signing.dumps({'user': user.pk, 'keys': keys}, salt=SALT, compress=True)
    return {'unread_count': sum(not row['is_read'] for row in rows), 'pending_count': len(rows),
            'categories': categories, 'notifications': rows[:100], 'snapshot': snapshot,
            'has_more': len(rows) > 100}


class AdminRequestNotificationsView(AuthenticatedAPIView):
    permission_classes = [IsPlatformAdmin]

    def get(self, request):
        user = self.get_request_user(request)
        if user.access_restricted:
            raise PermissionDenied('An unrestricted administrator account is required.')
        response = Response(payload(user))
        response['Cache-Control'] = 'private, no-store'
        return response

    def patch(self, request):
        user = self.get_request_user(request)
        if user.access_restricted:
            raise PermissionDenied('An unrestricted administrator account is required.')
        token = request.data.get('snapshot')
        if not isinstance(token, str) or len(token) > 1_000_000:
            raise ValidationError('Refresh request notifications before marking them read.')
        try:
            snapshot = signing.loads(token, salt=SALT, max_age=3600)
        except signing.BadSignature:
            raise ValidationError('Request notifications expired. Refresh and try again.') from None
        if snapshot.get('user') != user.pk:
            raise PermissionDenied('This notification snapshot belongs to another administrator.')
        keys = snapshot.get('keys', [])
        category = request.data.get('category')
        if category is not None:
            ids = request.data.get('request_ids')
            if not isinstance(category, str) or not isinstance(ids, list) or len(ids) > 2000 or any(not isinstance(value, (str, int)) or isinstance(value, bool) for value in ids):
                raise ValidationError('Specify the request IDs displayed in this queue.')
            ids = {str(value) for value in ids}
            keys = [key for key in keys if key.split(':', 2)[0] == category and key.split(':', 2)[1] in ids]
        selected = request.data.get('request_key')
        if selected is not None:
            if not isinstance(selected, str) or selected not in keys:
                raise ValidationError('Select a notification from the current request list.')
            keys = [selected]
        AdminRequestRead.objects.bulk_create([AdminRequestRead(user=user, request_key=key) for key in keys], ignore_conflicts=True)
        response = Response(payload(user))
        response['Cache-Control'] = 'private, no-store'
        return response
