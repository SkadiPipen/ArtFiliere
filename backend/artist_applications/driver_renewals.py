from django.db import transaction
from django.shortcuts import get_object_or_404
from django.utils.dateparse import parse_date
from rest_framework.exceptions import PermissionDenied, ValidationError

from authentication.permissions import IsPlatformAdmin
from authentication.views import AuthenticatedAPIView
from notifications.models import UserNotification
from users.models import DriverLicenseRenewal, ModeratorApplication
from users.resellers import validate_document

from .document_details import tax_today
from .sworn_renewals import private


def summary(item):
    return dict(id=item.pk, expires_on=item.expires_on, status=item.status,
                note=item.note, document_name=item.document_name)


class DriverLicenseRenewalView(AuthenticatedAPIView):
    def application(self, request, lock=False):
        user = self.get_request_user(request)
        if not user or user.role != 'driver':
            raise PermissionDenied('Driver access is required.')
        applications = ModeratorApplication.objects.all()
        if lock:
            applications = applications.select_for_update()
        return get_object_or_404(applications, user=user, requested_role='driver', status='approved')

    def get(self, request):
        application = self.application(request)
        latest = application.license_renewals.defer('document').order_by('-pk').first()
        return private(dict(current_expiry=application.application_details.get('license_expires_on'),
                            latest=summary(latest) if latest else None))

    @transaction.atomic
    def post(self, request):
        application = self.application(request, lock=True)
        if getattr(self.get_request_user(request), 'view_only', False):
            raise PermissionDenied('Your account has view-only access.')
        if application.license_renewals.filter(status='pending').exists():
            return private({'error': 'A renewal is already awaiting review.'}, 409)
        try:
            expiry = parse_date(request.data.get('expires_on', ''))
        except (TypeError, ValueError):
            expiry = None
        current = application.application_details.get('license_expires_on')
        if not expiry or expiry < tax_today() or (current and expiry.isoformat() <= current):
            raise ValidationError('Choose an unexpired date later than the current license expiry.')
        try:
            document, name = validate_document(request.data.get('document'))
        except ValidationError:
            raise ValidationError('Upload a valid PDF, JPEG, PNG, or WebP license up to 5 MB.') from None
        return private(summary(application.license_renewals.create(
            expires_on=expiry, document=document, document_name=name)), 201)


class AdminDriverLicenseRenewalView(AuthenticatedAPIView):
    permission_classes = [IsPlatformAdmin]

    def get(self, request, renewal_id=None):
        if renewal_id is not None:
            item = get_object_or_404(DriverLicenseRenewal, pk=renewal_id)
            return private({**summary(item), 'document': item.document})
        items = DriverLicenseRenewal.objects.filter(status='pending').select_related(
            'application__user').defer('document').order_by('pk')
        return private({'results': [
            {**summary(item), 'driver': item.application.user.username}
            for item in items
        ]})

    @transaction.atomic
    def patch(self, request, renewal_id):
        reviewer = self.get_request_user(request)
        if getattr(reviewer, 'view_only', False):
            raise PermissionDenied('Your account has view-only access.')
        action, note = request.data.get('action'), request.data.get('note', '')
        if action not in ('approve', 'reject') or not isinstance(note, str) or len(note) > 1000 or (action == 'reject' and not note.strip()):
            raise ValidationError('Choose approve or reject. Rejection requires a reason of up to 1,000 characters.')
        item = get_object_or_404(DriverLicenseRenewal.objects.defer('document'), pk=renewal_id)
        application = ModeratorApplication.objects.select_for_update().get(pk=item.application_id)
        item.refresh_from_db(fields=['status'])
        if item.status != 'pending':
            return private({'error': 'This renewal has already been reviewed.'}, 409)
        if action == 'approve':
            current = application.application_details.get('license_expires_on')
            if application.status != 'approved' or application.user.role != 'driver' or item.expires_on < tax_today() or (current and item.expires_on.isoformat() <= current):
                raise ValidationError('The renewal must extend the license of an active driver.')
            application.application_details = {**application.application_details, 'license_expires_on': item.expires_on.isoformat()}
            application.save(update_fields=['application_details', 'updated_at'])
        item.status = 'approved' if action == 'approve' else 'rejected'
        item.note = note.strip()
        item.reviewed_by = reviewer
        item.save(update_fields=['status', 'note', 'reviewed_by'])
        UserNotification.objects.create(
            user_id=application.user_id, title=f'Driver license renewal {item.status}',
            message=item.note or f'Your driver license renewal was {item.status}.',
        )
        return private(summary(item))
