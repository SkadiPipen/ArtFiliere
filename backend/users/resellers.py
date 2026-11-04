"""Independent seller verification. Documents never enter public profiles or blockchain."""
import base64
import binascii
from io import BytesIO
import re

from PIL import Image, UnidentifiedImageError
from django.db import transaction
from django.http import HttpResponse
from django.utils import timezone
from rest_framework.exceptions import NotFound, PermissionDenied, ValidationError
from rest_framework.response import Response
from authentication.permissions import IsAuthenticatedUser
from authentication.views import AuthenticatedAPIView
from .models import User, ResellerApplication, ResellerReview

REVIEWERS = {User.Role.PLATFORM_ADMIN, User.Role.HR}
BADGE_NOTE = 'Seller documents reviewed by ArtFiliere. Resale eligibility is checked separately for each artwork.'


def seller_compliant(user):
    if not user or user.access_restricted:
        return False
    if user.reseller_verified:
        return True
    # Existing approved artist seller documents remain valid; no duplicate onboarding.
    application = getattr(user, 'artist_application', None)
    return bool(user.role == User.Role.ARTIST and application and application.status == 'approved'
                and application.bir_certificate and application.tin_number
                and (not application.bir_expires_on or application.bir_expires_on >= timezone.localdate()))


def require_seller(user):
    if not seller_compliant(user):
        raise PermissionDenied('Complete reseller verification in your profile before listing this purchase for resale.')


def validate_document(value, required=True):
    if not value and not required:
        return '', ''
    if not isinstance(value, dict):
        raise ValidationError('Upload the required BIR certificate as a PDF, JPEG, PNG or WebP file.')
    uri, name = value.get('data_uri'), value.get('name')
    if not isinstance(name, str) or not 1 <= len(name.strip()) <= 180 or any(ord(c) < 32 for c in name):
        raise ValidationError('Enter a valid document filename (up to 180 characters).')
    if not isinstance(uri, str) or len(uri) > 7 * 1024 * 1024:
        raise ValidationError('Each document must be 5 MB or smaller.')
    try:
        header, encoded = uri.split(',', 1)
        content = base64.b64decode(encoded, validate=True)
        if not content or len(content) > 5 * 1024 * 1024:
            raise ValueError()
        if header == 'data:application/pdf;base64':
            if not content.startswith(b'%PDF-') or b'%%EOF' not in content[-2048:]:
                raise ValueError()
        else:
            allowed = {'data:image/jpeg;base64': 'JPEG', 'data:image/png;base64': 'PNG', 'data:image/webp;base64': 'WEBP'}
            with Image.open(BytesIO(content)) as image:
                if allowed.get(header) != image.format or image.width * image.height > 25_000_000:
                    raise ValueError()
                image.verify()
    except (ValueError, binascii.Error, OSError, UnidentifiedImageError, Image.DecompressionBombError):
        raise ValidationError('Upload a valid PDF, JPEG, PNG or WebP document up to 5 MB.') from None
    return uri, name.strip()


def application_data(item, reviewer=False):
    result = dict(id=item.pk, status=item.status, submitted_at=item.submitted_at,
                  reviewed_at=item.reviewed_at, review_note=item.review_note,
                  bir_certificate_name=item.bir_certificate_name,
                  sworn_declaration_name=item.sworn_declaration_name,
                  verified=item.user.reseller_verified)
    if reviewer:
        result.update(username=item.user.username, name=f'{item.user.first_name} {item.user.last_name}'.strip(), tin_number=item.tin_number)
    return result


class ResellerApplicationView(AuthenticatedAPIView):
    permission_classes = [IsAuthenticatedUser]

    def get(self, request):
        user = self.get_request_user(request)
        latest = ResellerApplication.objects.filter(user=user).defer('bir_certificate', 'sworn_declaration').order_by('-pk').first()
        return Response({'verified': user.reseller_verified, 'badge_note': BADGE_NOTE,
                         'application': application_data(latest) if latest else None})

    @transaction.atomic
    def post(self, request):
        user = User.objects.select_for_update().get(pk=self.get_request_user(request).pk)
        if user.role not in {User.Role.BUYER, User.Role.ARTIST} or user.access_restricted:
            raise PermissionDenied('An unrestricted buyer or artist account is required.')
        if ResellerApplication.objects.filter(user=user, status__in=['pending', 'approved']).exists():
            return Response({'error': 'You already have a pending or approved reseller application.'}, status=409)
        tin = request.data.get('tin_number')
        if not isinstance(tin, str) or not re.fullmatch(r'[0-9 -]+', tin):
            raise ValidationError('Enter your 9-digit TIN, optionally followed by its 3-digit branch code.')
        tin = re.sub(r'[ -]', '', tin)
        if len(tin) not in (9, 12):
            raise ValidationError('Enter your 9-digit TIN, optionally followed by its 3-digit branch code.')
        if request.data.get('consent') is not True:
            raise ValidationError('Confirm the documents are yours and that seller verification does not grant resale rights.')
        bir, bir_name = validate_document(request.data.get('bir_certificate'))
        sworn, sworn_name = validate_document(request.data.get('sworn_declaration'), required=False)
        item = ResellerApplication.objects.create(user=user, tin_number=tin, bir_certificate=bir,
            bir_certificate_name=bir_name, sworn_declaration=sworn, sworn_declaration_name=sworn_name)
        ResellerReview.objects.create(application=item, actor=user, action='submitted')
        return Response(application_data(item), status=201)


class ResellerReviewsView(AuthenticatedAPIView):
    permission_classes = [IsAuthenticatedUser]

    def reviewer(self, request):
        user = self.get_request_user(request)
        if user.role not in REVIEWERS or user.access_restricted:
            raise PermissionDenied('Platform administrator or HR access is required.')
        return user

    def get(self, request):
        self.reviewer(request)
        return Response([application_data(item, True) for item in ResellerApplication.objects.select_related('user').defer('bir_certificate', 'sworn_declaration').order_by('-submitted_at')])

    @transaction.atomic
    def patch(self, request, application_id):
        reviewer = self.reviewer(request)
        item = ResellerApplication.objects.select_for_update().filter(pk=application_id).first()
        if not item:
            raise NotFound('Application not found.')
        # Match the applicant lock used on submission, serializing state changes.
        User.objects.select_for_update().get(pk=item.user_id)
        action = request.data.get('action')
        note = request.data.get('review_note', '')
        if not isinstance(note, str) or len(note) > 1000:
            raise ValidationError('Review notes must be up to 1,000 characters.')
        states = {'approve': ('pending', 'approved'), 'reject': ('pending', 'rejected'), 'revoke': ('approved', 'revoked')}
        if not isinstance(action, str) or action not in states:
            raise ValidationError('Choose approve, reject or revoke.')
        if action != 'approve' and not note.strip():
            raise ValidationError('Explain the rejection or revocation.')
        source, target = states[action]
        if item.status != source:
            return Response({'error': 'This application has already changed. Refresh before reviewing.'}, status=409)
        item.status, item.review_note = target, note.strip()
        item.reviewed_by, item.reviewed_at = reviewer, timezone.now()
        item.save(update_fields=['status', 'review_note', 'reviewed_by', 'reviewed_at'])
        ResellerReview.objects.create(application=item, actor=reviewer, action=action, note=note.strip())
        from notifications.models import UserNotification
        UserNotification.objects.create(user=item.user, title=f'Reseller verification {target}',
            message=('Your seller documents are approved. You can list eligible purchases for resale; your account role is unchanged.' if target == 'approved' else f'Reseller verification {target}: {note.strip()}'))
        return Response(application_data(item, True))


class ResellerDocumentView(AuthenticatedAPIView):
    permission_classes = [IsAuthenticatedUser]

    def get(self, request, application_id, document):
        user = self.get_request_user(request)
        item = ResellerApplication.objects.filter(pk=application_id).first()
        if not item or (item.user_id != user.pk and user.role not in REVIEWERS) or user.access_restricted:
            raise NotFound('Document not found.')
        if document not in {'bir_certificate', 'sworn_declaration'}:
            raise NotFound('Document not found.')
        uri = getattr(item, document)
        if not uri:
            raise NotFound('Document not provided.')
        header, encoded = uri.split(',', 1)
        response = HttpResponse(base64.b64decode(encoded), content_type=header[5:].split(';')[0])
        response['Content-Disposition'] = 'attachment; filename="seller-document.' + ('pdf' if 'application/pdf' in header else 'image') + '"'
        response['Cache-Control'] = 'private, no-store'
        response['X-Content-Type-Options'] = 'nosniff'
        return response
