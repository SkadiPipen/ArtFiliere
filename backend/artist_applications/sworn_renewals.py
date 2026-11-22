from django.db import transaction
from django.utils import timezone
from rest_framework.exceptions import ValidationError
from rest_framework.response import Response

from authentication.permissions import IsArtist, IsPlatformAdmin
from authentication.views import AuthenticatedAPIView
from users.models import ActivityLog, User
from users.resellers import validate_document
from notifications.models import UserNotification

from .document_details import tax_today, validate_sworn_details
from .models import ArtistApplication, SwornDeclarationRenewal


def private(data, status=200):
    return Response(data, status=status, headers={'Cache-Control': 'private, no-store'})


def renewal_data(item):
    return {'id': item.pk, 'artist': item.artist.username, 'details': item.details,
            'status': item.status, 'review_note': item.review_note,
            'submitted_at': item.submitted_at, 'document_name': item.document_name}


def approved_taxable_year(artist, application):
    year = artist.sworn_renewals.filter(status='approved').order_by('-reviewed_at', '-pk').values_list('details__taxable_year', flat=True).first()
    if year is not None:
        return year
    return application.document_details.get('taxable_year') if application and application.sworn_declaration else None


class ArtistSwornRenewalView(AuthenticatedAPIView):
    permission_classes = [IsArtist]

    def get(self, request):
        artist = self.get_request_user(request)
        application = ArtistApplication.objects.filter(user=artist, status='approved').first()
        return private({
            'taxable_year': tax_today().year,
            'approved_year': approved_taxable_year(artist, application),
            'renewals': [renewal_data(item) for item in artist.sworn_renewals.defer('document', 'previous_record').order_by('-pk')[:10]],
        })

    @transaction.atomic
    def post(self, request):
        user = self.get_request_user(request)
        if getattr(user, 'view_only', False):
            return private({'error': 'Your account has view-only access.'}, 403)
        artist = User.objects.select_for_update().get(pk=user.pk)
        if artist.role != User.Role.ARTIST:
            return private({'error': 'Artist access is required.'}, 403)
        application = ArtistApplication.objects.filter(user=artist, status='approved').first()
        if artist.sworn_renewals.filter(status='pending').exists():
            return private({'error': 'A declaration is already awaiting review.'}, 409)
        if str(approved_taxable_year(artist, application)) == str(tax_today().year):
            return private({'error': 'A declaration for this taxable year is already on file.'}, 409)
        try:
            details = validate_sworn_details(request.data.get('details'))
            document, name = validate_document(request.data.get('document'))
        except ValueError as error:
            return private({'error': str(error)}, 400)
        except ValidationError:
            return private({'error': 'Upload a valid PDF, JPEG, PNG, or WebP declaration up to 5 MB.'}, 400)
        item = artist.sworn_renewals.create(document=document, document_name=name, details=details)
        ActivityLog.objects.create(user=user, action='sworn_renewal_submitted', description=f'Submitted sworn declaration for {details["taxable_year"]}.')
        return private(renewal_data(item), 201)


class AdminSwornRenewalView(AuthenticatedAPIView):
    permission_classes = [IsPlatformAdmin]

    def get(self, request, renewal_id=None):
        items = SwornDeclarationRenewal.objects.select_related('artist')
        if renewal_id is None:
            pending = items.filter(status='pending').defer('document', 'previous_record').order_by('pk')
            return private({'count': pending.count(), 'results': [renewal_data(item) for item in pending[:50]]})
        item = items.filter(pk=renewal_id).first()
        if not item:
            return private({'error': 'Renewal not found.'}, 404)
        return private({**renewal_data(item), 'document': item.document})

    @transaction.atomic
    def patch(self, request, renewal_id):
        reviewer = self.get_request_user(request)
        if getattr(reviewer, 'view_only', False):
            return private({'error': 'Your account has view-only access.'}, 403)
        action, note = request.data.get('action'), request.data.get('note', '')
        if action not in ('approve', 'reject') or not isinstance(note, str) or len(note) > 1000 or (action == 'reject' and not note.strip()):
            return private({'error': 'Choose approve or reject. Rejection requires a reason of up to 1,000 characters.'}, 400)
        artist_id = SwornDeclarationRenewal.objects.filter(pk=renewal_id).values_list('artist_id', flat=True).first()
        if artist_id is None:
            return private({'error': 'Renewal not found.'}, 404)
        artist = User.objects.select_for_update().get(pk=artist_id)
        item = artist.sworn_renewals.select_for_update().get(pk=renewal_id)
        if item.status != 'pending':
            return private({'error': 'This renewal has already been reviewed.'}, 409)
        if action == 'approve':
            if artist.role != User.Role.ARTIST or item.details.get('taxable_year') != tax_today().year:
                return private({'error': 'Approval requires an active artist and a declaration for the current taxable year.'}, 400)
            application = ArtistApplication.objects.select_for_update().filter(user=artist, status='approved').first()
            if application:
                item.previous_record = {
                    'document': application.sworn_declaration, 'name': application.sworn_declaration_name,
                    'details': {key: application.document_details.get(key) for key in item.details},
                }
                application.sworn_declaration = item.document
                application.sworn_declaration_name = item.document_name
                application.document_details = {**application.document_details, **item.details}
                application.save(update_fields=['sworn_declaration', 'sworn_declaration_name', 'document_details', 'updated_at'])
        item.status = 'approved' if action == 'approve' else 'rejected'
        item.review_note, item.reviewed_by, item.reviewed_at = note.strip(), reviewer, timezone.now()
        item.save(update_fields=['status', 'review_note', 'reviewed_by', 'reviewed_at', 'previous_record'])
        UserNotification.objects.create(user=artist, title=f'Sworn declaration {item.status}',
                                        message=note.strip() or f'Your sworn declaration renewal was {item.status}.')
        return private(renewal_data(item))
