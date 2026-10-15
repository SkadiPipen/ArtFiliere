from django.db import transaction, IntegrityError
from django.utils import timezone
from django.utils.dateparse import parse_date
from rest_framework.response import Response
from authentication.views import AuthenticatedAPIView
from authentication.permissions import IsAuthenticatedUser, IsCreativeModerator
from artist_applications.models import ArtistApplication, ArtistRegistrationUpdate
from notifications.models import UserNotification
from .models import User, ActivityLog
from .image_validation import validate_image


def date_field(raw, birthday=False):
    try:
        day = parse_date(raw) if isinstance(raw, str) else None
        if not day or day.isoformat() != raw or (day > timezone.localdate() if birthday else day < timezone.localdate()):
            raise ValueError()
        return day
    except (ValueError, TypeError):
        raise ValueError('Enter a valid birthday that is not in the future.' if birthday else 'Choose a valid, unexpired document date.') from None


def update_data(item, include_evidence=False):
    data = {'id': item.pk, 'tin_number': item.tin_number, 'expires_on': item.expires_on,
            'status': item.status, 'review_note': item.review_note, 'submitted_at': item.submitted_at, 'reviewed_at': item.reviewed_at}
    if include_evidence:
        data.update(evidence_image=item.evidence_image, artist_name=item.application.user.username,
                    current_tin=item.application.tin_number, current_expiry=item.application.bir_expires_on,
                    current_evidence=item.application.bir_certificate)
    return data


class AccountSettingsView(AuthenticatedAPIView):
    permission_classes = [IsAuthenticatedUser]

    def get(self, request):
        user = self.get_request_user(request)
        application = ArtistApplication.objects.filter(user=user).first()
        data = {field: getattr(user, field) for field in ['username', 'email', 'firebase_uid', 'role', 'first_name', 'middle_name', 'last_name', 'date_of_birth', 'contact_number', 'profile_image', 'created_at', 'is_accepting_commissions']}
        data['addresses'] = list(user.addresses.values('label', 'is_default', 'street', 'barangay', 'city', 'province', 'region', 'postal_code'))
        data['artist_registration'] = {'tin_number': application.tin_number, 'expires_on': application.bir_expires_on,
            'certificate': application.bir_certificate, 'certificate_name': application.bir_certificate_name,
            'status': application.status, 'hourly_rate': str(application.hourly_rate), 'bio': application.bio,
            'updates': [update_data(item) for item in application.record_updates.order_by('-submitted_at')[:10]]} if application else None
        response = Response(data); response['Cache-Control'] = 'private, no-store'
        return response

    def patch(self, request):
        user = self.get_request_user(request)
        allowed = {'username', 'first_name', 'middle_name', 'last_name', 'date_of_birth', 'contact_number', 'profile_image'}
        if set(request.data) - allowed:
            return Response({'error': 'Only your profile fields can be updated here.'}, status=400)
        values = {}
        try:
            for field, value in request.data.items():
                if field == 'profile_image':
                    values[field] = validate_image(value) if value else ''
                elif field == 'date_of_birth':
                    values[field] = date_field(value, birthday=True)
                else:
                    limit = User._meta.get_field(field).max_length
                    if not isinstance(value, str) or len(value.strip()) > limit or (field in ('username', 'first_name', 'last_name') and not value.strip()):
                        raise ValueError(f'Enter a valid {field.replace("_", " ")} (up to {limit} characters).')
                    values[field] = value.strip()
            if 'username' in values and User.objects.filter(username__iexact=values['username']).exclude(pk=user.pk).exists():
                raise ValueError('That username is already taken.')
            with transaction.atomic():
                record = User.objects.select_for_update().get(pk=user.pk)
                for field, value in values.items():
                    setattr(record, field, value)
                if values:
                    record.save(update_fields=list(values))
                    ActivityLog.objects.create(user=record, action='profile_updated', description='Updated account settings: ' + ', '.join(values) + '.')
        except (ValueError, IntegrityError) as error:
            return Response({'error': str(error) if isinstance(error, ValueError) else 'That username is already taken.'}, status=400)
        return Response({'message': 'Your changes have been saved.'})


class ArtistRecordUpdateView(AuthenticatedAPIView):
    permission_classes = [IsAuthenticatedUser]

    @transaction.atomic
    def post(self, request):
        user = self.get_request_user(request)
        application = ArtistApplication.objects.select_for_update().filter(user=user, status='approved').first()
        if user.role != User.Role.ARTIST or not application:
            return Response({'error': 'An approved artist registration is required.'}, status=403)
        if application.record_updates.filter(status='pending').exists():
            return Response({'error': 'Your BIR update is already awaiting Creative Moderator review.'}, status=409)
        try:
            tin = request.data.get('tin_number', '')
            if not isinstance(tin, str) or not tin.replace('-', '').isdigit() or len(tin.replace('-', '')) != 9:
                raise ValueError('Enter a valid 9-digit TIN.')
            evidence = validate_image(request.data.get('evidence_image'))
            expires = date_field(request.data['expires_on']) if request.data.get('expires_on') else None
        except ValueError as error:
            return Response({'error': str(error)}, status=400)
        item = ArtistRegistrationUpdate.objects.create(application=application, tin_number=tin.replace('-', ''), evidence_image=evidence, expires_on=expires,
            previous_record={'tin_number': application.tin_number, 'expires_on': str(application.bir_expires_on) if application.bir_expires_on else None, 'certificate': application.bir_certificate, 'certificate_name': application.bir_certificate_name})
        for reviewer in User.objects.filter(role=User.Role.CREATIVE_MODERATOR):
            UserNotification.objects.create(user=reviewer, title='Artist BIR update for review', message=f'{user.username} submitted updated BIR registration with photo evidence. Review it in the Creative Moderator dashboard.')
        ActivityLog.objects.create(user=user, action='bir_update_submitted', description='Submitted BIR registration update for Creative Moderator review.')
        return Response(update_data(item), status=201)


class ArtistRecordReviewView(AuthenticatedAPIView):
    permission_classes = [IsCreativeModerator]

    def get(self, request, update_id=None):
        items = ArtistRegistrationUpdate.objects.select_related('application__user').order_by('-submitted_at')
        if update_id is not None:
            item = items.filter(pk=update_id).first()
            if not item:
                return Response({'error': 'BIR update not found.'}, status=404)
            data = update_data(item, True)
        else:
            data = [{**update_data(item), 'artist_name': item.application.user.username} for item in items[:100]]
        response = Response(data)
        response['Cache-Control'] = 'private, no-store'
        return response

    @transaction.atomic
    def patch(self, request, update_id):
        item = ArtistRegistrationUpdate.objects.select_for_update(of=('self',)).select_related('application__user').filter(pk=update_id).first()
        if not item:
            return Response({'error': 'BIR update not found.'}, status=404)
        if item.status != 'pending':
            return Response({'error': 'This update has already been reviewed.'}, status=409)
        action, note = request.data.get('action'), request.data.get('note', '')
        if action not in ('approve', 'reject') or not isinstance(note, str) or len(note) > 1000 or (action == 'reject' and not note.strip()):
            return Response({'error': 'Choose approve or reject. Rejection requires a reason (up to 1,000 characters).'}, status=400)
        if action == 'approve':
            if item.expires_on and item.expires_on < timezone.localdate():
                return Response({'error': 'The submitted document date has expired.'}, status=400)
            application = ArtistApplication.objects.select_for_update().get(pk=item.application_id)
            application.tin_number, application.bir_expires_on = item.tin_number, item.expires_on
            application.bir_certificate, application.bir_certificate_name = item.evidence_image, 'Updated BIR registration photo'
            application.save(update_fields=['tin_number', 'bir_expires_on', 'bir_certificate', 'bir_certificate_name', 'updated_at'])
        item.status, item.review_note = ('approved' if action == 'approve' else 'rejected'), note.strip()
        item.reviewed_by, item.reviewed_at = self.get_request_user(request), timezone.now()
        item.save()
        UserNotification.objects.create(user=item.application.user, title=f'BIR registration update {item.status}', message=f'Your BIR registration update was {item.status} by a Creative Moderator.' + (f' Reason: {note.strip()}' if note.strip() else ''))
        return Response(update_data(item))
