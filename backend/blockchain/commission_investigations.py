from django.db.models import Q
from rest_framework.exceptions import NotFound, PermissionDenied, ValidationError
from rest_framework.response import Response
from authentication.views import AuthenticatedAPIView
from commissions.models import CommissionRequest
from users.models import ActivityLog


class CommissionInvestigationView(AuthenticatedAPIView):
    @staticmethod
    def summary(c):
        return {'id': c.pk, 'title': c.title, 'artist': c.artist.username, 'buyer': c.buyer.username,
                'status': c.status, 'status_label': c.get_status_display(), 'disputed': c.disputed,
                'created_at': c.created_at, 'funded_at': c.funded_at}

    def get(self, request, commission_id=None):
        user = self.get_request_user(request)
        if not user or user.role != 'platform_admin':
            raise PermissionDenied('Administrator access is required for commission investigations.')
        try:
            page = int(request.query_params.get('page', '1'))
            if not 1 <= page <= 1000000:
                raise ValueError()
        except (ValueError, TypeError):
            raise ValidationError('Choose a valid page.')
        rows = CommissionRequest.objects.select_related('artist', 'buyer', 'agreement')
        start = (page - 1) * 25
        if commission_id is None:
            query = request.query_params.get('q', '').strip()[:200]
            if query:
                match = Q(title__icontains=query) | Q(artist__username__icontains=query) | Q(buyer__username__icontains=query)
                if query.isascii() and query.isdecimal() and len(query) <= 18:
                    match |= Q(pk=int(query))
                rows = rows.filter(match)
            items = list(rows.order_by('-created_at', '-pk')[start:start + 26])
            data = {'items': [self.summary(c) for c in items[:25]], 'next_page': page + 1 if len(items) > 25 else None}
        else:
            c = rows.filter(pk=commission_id).first()
            if not c:
                raise NotFound('Commission not found.')
            data = self.summary(c)
            data['sections'] = {}
            data['more'] = {}

            def section(name, queryset, render):
                items = list(queryset[start:start + 26])
                data['sections'][name] = [render(item) for item in items[:25]]
                data['more'][name] = len(items) > 25

            section('proposals', c.proposals.select_related('proposer').order_by('version'), lambda p: {
                'id': p.pk, 'version': p.version, 'proposer': p.proposer.username, 'status': p.status,
                'created_at': p.created_at, 'terms': {key: p.terms.get(key) for key in
                    ('price', 'deadline', 'milestones', 'license_type', 'exclusivity', 'duration_months', 'allow_resale', 'royalty_percentage')}})
            section('proofs', c.proofs.select_related('submission__milestone').order_by('pk'), lambda p: {
                'id': p.pk, 'label': f'{p.submission.milestone.stage_label} submission' if p.submission_id else 'Completion proof',
                'filename': p.submission.filename if p.submission_id else None,
                'uploaded_at': p.submission.uploaded_at if p.submission_id else None,
                'file_hash': p.submission.sha256 if p.submission_id else None,
                'status': p.status, 'record_hash': p.record_hash, 'transaction_hash': p.transaction_hash,
                'block_number': p.block_number, 'error': p.error})
            section('payments', c.ledger.order_by('created_at', 'pk'), lambda p: {
                'id': p.pk, 'kind': p.kind, 'amount': str(p.amount), 'created_at': p.created_at})
            data['milestones'] = list(c.milestones.order_by('milestone_number').values(
                'milestone_number', 'stage_label', 'status', 'revision_comment', 'revision_requested_at',
                'revision_reply', 'revision_replied_at', 'approved_at', 'payout_status'))
            agreement = c.agreement
            data['agreement'] = {'id': agreement.pk, 'artist_signed_at': agreement.artist_signed_at,
                                 'buyer_signed_at': agreement.buyer_signed_at} if agreement else None
            from .models import ProvenanceEvent
            section('ownership', ProvenanceEvent.objects.filter(record__commission_asset__commission=c).order_by('created_at', 'pk'), lambda e: {
                'id': str(e.pk), 'label': e.get_kind_display(), 'status': e.status,
                'record_hash': e.record_hash, 'transaction_hash': e.transaction_hash,
                'block_number': e.block_number, 'error': e.error})
            if page == 1:
                ActivityLog.objects.create(user=user, action='commission_history_view',
                    description='Viewed private commission investigation.', reference_type='commission', reference_id=str(c.pk))
        response = Response(data)
        response['Cache-Control'] = 'private, no-store'
        return response
