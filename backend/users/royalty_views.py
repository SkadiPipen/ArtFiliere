from django.db import transaction
from django.utils import timezone
from rest_framework.response import Response

from authentication.permissions import IsAuthenticatedUser, IsPlatformAdmin
from authentication.views import AuthenticatedAPIView
from .models import RoyaltyApplication
from .royalty_validation import validate_permit


def application_data(item, admin=False):
    today = timezone.localdate()
    dob = item.user.date_of_birth
    data = {
        'id': item.pk, 'status': item.status,
        'permit_expires_on': item.permit_expires_on.isoformat(),
        'royalty_enabled': item.status == 'approved' and item.permit_expires_on >= today,
        'review_note': item.review_note, 'submitted_at': item.submitted_at.isoformat(),
    }
    if admin:
        data.update(username=item.user.username,
                    name=' '.join(filter(None, [item.user.first_name, item.user.middle_name, item.user.last_name])),
                    age=today.year - dob.year - ((today.month, today.day) < (dob.month, dob.day)) if dob else None,
                    business_permit_image=item.business_permit_image)
    return data


class RoyaltyApplicationView(AuthenticatedAPIView):
    permission_classes = [IsAuthenticatedUser]

    def get(self, request):
        item = RoyaltyApplication.objects.filter(user=self.get_request_user(request)).first()
        response = Response(application_data(item) if item else {'status': 'not_applied', 'royalty_enabled': False})
        response['Cache-Control'] = 'private, no-store'
        return response

    @transaction.atomic
    def post(self, request):
        user = self.get_request_user(request)
        # Lock the user as well as any existing application to serialize first submissions.
        type(user).objects.select_for_update().get(pk=user.pk)
        item = RoyaltyApplication.objects.select_for_update().filter(user=user).first()
        if item and (item.status == 'pending' or (item.status == 'approved' and item.permit_expires_on >= timezone.localdate())):
            return Response({'error': 'Your application is already pending or approved.'}, status=409)
        try:
            values = validate_permit(request.data)
        except ValueError as error:
            return Response({'error': str(error)}, status=400)
        item, _ = RoyaltyApplication.objects.update_or_create(user=user, defaults={**values, 'status': 'pending', 'reviewed_at': None, 'reviewed_by': None, 'review_note': '', 'submitted_at': timezone.now()})
        user.wants_royalty = 'yes'
        user.save(update_fields=['wants_royalty'])
        return Response(application_data(item), status=201)


class RoyaltyPermitView(AuthenticatedAPIView):
    permission_classes = [IsAuthenticatedUser]

    def get(self, request):
        # A caller cannot supply another applicant's ID to view their permit.
        item = RoyaltyApplication.objects.filter(user=self.get_request_user(request)).first()
        if not item:
            return Response({'error': 'No submitted permit was found.'}, status=404)
        response = Response({'business_permit_image': item.business_permit_image})
        response['Cache-Control'] = 'private, no-store'
        return response


class RoyaltyReviewView(AuthenticatedAPIView):
    permission_classes = [IsPlatformAdmin]

    def get(self, request):
        items = RoyaltyApplication.objects.select_related('user').order_by('-submitted_at')
        response = Response([application_data(item, admin=True) for item in items])
        response['Cache-Control'] = 'private, no-store'
        return response

    @transaction.atomic
    def patch(self, request, application_id):
        item = RoyaltyApplication.objects.select_for_update().select_related('user').filter(pk=application_id).first()
        if not item:
            return Response({'error': 'Application not found.'}, status=404)
        if item.status != 'pending':
            return Response({'error': 'This application has already been reviewed.'}, status=409)
        action = request.data.get('action')
        note = request.data.get('review_note', '')
        if action not in ('approve', 'reject') or not isinstance(note, str) or len(note) > 1000:
            return Response({'error': 'Choose approve or reject and a note up to 1,000 characters.'}, status=400)
        if action == 'approve' and item.permit_expires_on < timezone.localdate():
            return Response({'error': 'This business permit has expired.'}, status=400)
        item.status = 'approved' if action == 'approve' else 'rejected'
        item.review_note = note.strip()
        item.reviewed_at = timezone.now()
        item.reviewed_by = self.get_request_user(request)
        item.save()
        return Response(application_data(item, admin=True))
