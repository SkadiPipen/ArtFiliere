from rest_framework.response import Response
from authentication.views import AuthenticatedAPIView
from authentication.permissions import IsAuthenticatedUser
from .models import DownloadFingerprint
from .watermarks import copy_code
from .tracking import find_code, proof_details


class FingerprintLookupView(AuthenticatedAPIView):
    permission_classes = [IsAuthenticatedUser]

    def post(self, request):
        actor = self.get_request_user(request)
        if actor.role not in ('platform_admin', 'customer_support'):
            return Response({'error': 'Admin or customer service access is required.'}, status=403)
        try:
            record = find_code(request.data.get('code', ''))
        except ValueError:
            return Response({'error': 'Enter a valid AF-TX- or legacy AF- code.'}, status=400)
        if not record:
            return Response({'error': 'No issued copy matches this code.'}, status=404)
        kind, pk, *_ = record.source_key.split(':')
        artwork = None
        if kind == 'payment':
            from wallets.models import PaymentSession
            source = PaymentSession.objects.select_related('artwork').filter(pk=pk).first()
            if source and source.artwork:
                artwork = {'id': source.artwork_id, 'title': source.artwork.title, 'kind': 'artwork'}
        elif kind == 'agreement':
            from messaging.models import Agreement
            source = Agreement.objects.select_related('artwork').filter(pk=pk).first()
            if source and source.artwork:
                artwork = {'id': source.artwork_id, 'title': source.artwork.title, 'kind': 'artwork'}
        elif kind == 'commission':
            from commissions.models import CommissionRequest
            source = CommissionRequest.objects.filter(pk=pk).first()
            if source:
                artwork = {'id': source.pk, 'title': source.title, 'kind': 'commission'}
        def person(user):
            return {'id': user.pk, 'username': user.username,
                    'name': ' '.join(filter(None, [user.first_name, user.last_name]))}
        from users.models import ActivityLog
        ActivityLog.objects.create(user=actor, action='artwork_code_lookup',
            description='Looked up an issued artwork copy.', reference_type='download_fingerprint', reference_id=record.pk)
        response = Response({'code': copy_code(record), 'source': record.source_key,
                             'artwork': artwork, 'buyer': person(record.buyer),
                             'artist': person(record.artist), 'license': record.license_snapshot,
                             'blockchain': proof_details(record),
                             'issued_at': record.issued_at.isoformat()})
        response['Cache-Control'] = 'private, no-store'
        return response
