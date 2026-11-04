"""HR evaluation and separate administrator authorization for moderator appointments."""
import base64
from uuid import uuid4
from django.core.validators import validate_email
from django.core.exceptions import ValidationError as DjangoValidationError
from django.utils.dateparse import parse_date

from django.db import transaction, IntegrityError
from django.http import HttpResponse
from django.shortcuts import get_object_or_404
from rest_framework.exceptions import PermissionDenied, ValidationError
from rest_framework.response import Response
from authentication.permissions import IsAuthenticatedUser
from authentication.views import AuthenticatedAPIView
from .models import User, ModeratorApplication, ModeratorApplicationReview
from .resellers import validate_document

ROLES = {'creative_moderator', 'customer_support'}


def profile(user):
    address = user.addresses.order_by('-is_default', '-pk').first()
    return dict(name=' '.join(filter(None, [user.first_name, user.middle_name, user.last_name])) or user.username,
                username=user.username, email=user.email, phone=user.contact_number,
                date_of_birth=str(user.date_of_birth) if user.date_of_birth else '',
                address=', '.join(filter(None, [getattr(address, field, '') for field in ['street', 'barangay', 'city', 'province', 'region', 'postal_code']])),
                photo=user.profile_image, joined_at=user.created_at)


def serialize(item, detail=False):
    data = dict(id=item.pk, user_id=item.user_id, profile=item.profile_snapshot, requested_role=item.requested_role,
                status=item.status, submitted_at=item.submitted_at, updated_at=item.updated_at, version=item.version,
                assigned_to=item.assigned_to_id, assigned_name=item.assigned_to.username if item.assigned_to else '',
                education=item.education, motivation=item.motivation, application_details=item.application_details,
                documents=[dict(index=i, name=doc['name'], mime=doc['data_uri'].split(';')[0][5:]) for i, doc in enumerate(item.documents)])
    if detail:
        data['reviews'] = [dict(action=r.action, note=r.note, actor=r.actor.username, created_at=r.created_at) for r in item.reviews.select_related('actor').all()]
    return data


class ModeratorAccess(AuthenticatedAPIView):
    permission_classes = [IsAuthenticatedUser]
    kind = 'moderator'

    @property
    def application_roles(self):
        return {'driver'} if self.kind == 'driver' else ROLES

    def application(self, application_id, lock=False):
        rows = ModeratorApplication.objects.filter(requested_role__in=self.application_roles)
        return get_object_or_404(rows.select_for_update() if lock else rows, pk=application_id)

    def finalize_response(self, request, response, *args, **kwargs):
        response = super().finalize_response(request, response, *args, **kwargs)
        response['Cache-Control'] = 'private, no-store'
        return response

    def reviewer(self, request):
        user = self.get_request_user(request)
        if user.role not in {'hr', 'platform_admin'} or user.access_restricted:
            raise PermissionDenied('Unrestricted HR or platform administrator access is required.')
        return user


class ModeratorApplicationsView(ModeratorAccess):
    def get(self, request):
        actor = self.reviewer(request)
        items = ModeratorApplication.objects.filter(requested_role__in=self.application_roles).select_related('assigned_to', 'user')
        # A directory also includes existing moderators without fabricating an application.
        applications = [serialize(item) for item in items]
        active = [dict(id=user.pk, profile=profile(user), role=user.role, restricted=user.access_restricted,
                       deactivated=user.driver_deactivated,
                       application_id=next((item.pk for item in items if item.user_id == user.pk), None),
                       last_active=getattr(getattr(user, 'rider_profile', None), 'location_updated_at', None))
                  for user in User.objects.filter(role__in=self.application_roles).prefetch_related('addresses').select_related('rider_profile')]
        return Response(dict(applications=applications, moderators=active, actor_id=actor.pk, actor_role=actor.role))

    @transaction.atomic
    def post(self, request):
        actor = self.reviewer(request)
        if actor.role != 'hr':
            raise PermissionDenied('HR registers moderator applications for evaluation.')
        email = str(request.data.get('email', '')).strip().lower()
        try:
            validate_email(email)
        except DjangoValidationError:
            raise ValidationError('Enter a valid applicant email address.') from None
        user = User.objects.select_for_update().filter(email__iexact=email).first()
        if user and (user.role not in ({'buyer', 'artist', 'driver'} if self.kind == 'driver' else {'buyer', 'artist'}) or user.access_restricted):
            raise ValidationError('This existing account is restricted or already has a staff role.')
        if user and user.pk == actor.pk:
            raise PermissionDenied('You cannot evaluate your own application.')
        from django.db.models import Q
        identity = Q(email__iexact=email)
        if user:
            identity |= Q(user=user)
        if ModeratorApplication.objects.filter(identity, status__in=['pending', 'under_review', 'sent_to_admin', 'approved']).exists():
            return Response({'error': 'This account already has an open or approved moderator application.'}, status=409)
        role = request.data.get('requested_role')
        if role not in self.application_roles:
            raise ValidationError('Select a supported moderator role.')
        values = {}
        for field, limit in [('education', 250), ('motivation', 3000)]:
            value = request.data.get(field)
            if not isinstance(value, str) or not value.strip() or len(value) > limit:
                raise ValidationError(f'Enter {field} (up to {limit} characters).')
            values[field] = value.strip()
        docs = request.data.get('documents')
        if not isinstance(docs, list) or not 1 <= len(docs) <= 3:
            raise ValidationError('Attach one to three application documents.')
        documents = []
        for value in docs:
            uri, name = validate_document(value)
            documents.append(dict(name=name, data_uri=uri))
        details = {}
        if self.kind == 'driver':
            if len(documents) < 2:
                raise ValidationError('Attach the driver’s license and application form as separate files.')
            license_number = request.data.get('license_number')
            if not isinstance(license_number, str) or not 3 <= len(license_number.strip()) <= 80:
                raise ValidationError('Enter the driver’s license number (3–80 characters).')
            try:
                expires = parse_date(request.data.get('license_expires_on', ''))
            except (TypeError, ValueError):
                expires = None
            from django.utils import timezone
            if not expires or expires < timezone.localdate():
                raise ValidationError('Enter a valid, unexpired driver’s license expiration date.')
            details = dict(license_number=license_number.strip(), license_expires_on=expires.isoformat())
        if sum(len(base64.b64decode(doc['data_uri'].split(',', 1)[1])) for doc in documents) > 5 * 1024 * 1024:
            raise ValidationError('The combined application attachments must be 5 MB or smaller.')
        # Datetimes must be JSON-safe in the immutable submitted profile snapshot.
        if user:
            snapshot = profile(user)
            snapshot['joined_at'] = snapshot['joined_at'].isoformat()
        else:
            snapshot = dict(email=email, username='', photo='', joined_at='')
            for field, limit in [('name', 250), ('phone', 20), ('address', 1000)]:
                value = request.data.get(field)
                if not isinstance(value, str) or not value.strip() or len(value) > limit:
                    raise ValidationError(f'Enter the external applicant’s {field} (up to {limit} characters).')
                snapshot[field] = value.strip()
            dob = request.data.get('date_of_birth', '')
            try:
                parsed = parse_date(dob) if isinstance(dob, str) else None
            except ValueError:
                parsed = None
            from django.utils import timezone
            if not parsed or parsed >= timezone.localdate():
                raise ValidationError('Enter a valid date of birth before today.')
            snapshot['date_of_birth'] = parsed.isoformat()
        try:
            with transaction.atomic():
                item = ModeratorApplication.objects.create(user=user, email=email, submitted_by=actor, requested_role=role,
                    documents=documents, profile_snapshot=snapshot, application_details=details, **values)
        except IntegrityError:
            return Response({'error': 'This email already has an open or approved moderator application.'}, status=409)
        ModeratorApplicationReview.objects.create(application=item, actor=actor, action='submitted')
        return Response(serialize(item, True), status=201)


class ModeratorApplicationDetail(ModeratorAccess):
    def get(self, request, application_id):
        self.reviewer(request)
        return Response(serialize(self.application(application_id), True))

    @transaction.atomic
    def patch(self, request, application_id):
        actor = self.reviewer(request)
        item = self.application(application_id, lock=True)
        if request.data.get('version') != item.version:
            return Response({'error': 'The application changed. Reload it before making a decision.'}, status=409)
        if item.user_id == actor.pk or item.submitted_by_id == actor.pk and actor.role == 'platform_admin':
            raise PermissionDenied('You cannot approve your own application or nomination.')
        action = request.data.get('action')
        note = request.data.get('note', '')
        if not isinstance(note, str) or len(note) > 2000:
            raise ValidationError('The evaluation note must be up to 2,000 characters.')
        note = note.strip()
        if actor.role == 'hr':
            if action == 'claim' and item.status == 'pending':
                item.assigned_to = actor
                item.status = 'under_review'
            elif action in {'reject', 'forward'} and item.status == 'under_review' and item.assigned_to_id == actor.pk:
                if not note:
                    raise ValidationError('Enter your evaluation or rejection reason.')
                item.status = 'rejected' if action == 'reject' else 'sent_to_admin'
            else:
                return Response({'error': 'Start the review first. Only the assigned HR reviewer may reject or send it to admin.'}, status=409)
        elif item.status == 'sent_to_admin' and action in {'approve', 'reject'}:
            if not note:
                raise ValidationError('Enter the final decision reason.')
            if action == 'approve':
                if self.kind == 'driver':
                    from django.utils import timezone
                    if not item.application_details.get('license_expires_on') or parse_date(item.application_details['license_expires_on']) < timezone.localdate():
                        return Response({'error': 'The driver’s license has expired. A new application with an updated license is required.'}, status=409)
                applicant = (User.objects.select_for_update().filter(pk=item.user_id).first() if item.user_id else
                             User.objects.select_for_update().filter(email__iexact=item.email).first())
                if not applicant:
                    # No account or access is created until the administrator's final decision.
                    from firebase_admin import auth as firebase_auth
                    try:
                        try:
                            firebase_user = firebase_auth.get_user_by_email(item.email)
                        except firebase_auth.UserNotFoundError:
                            firebase_user = firebase_auth.create_user(email=item.email, display_name=item.profile_snapshot['name'])
                        if firebase_user.disabled:
                            return Response({'error': 'The Firebase account is disabled. Approval cannot proceed.'}, status=409)
                    except Exception:
                        return Response({'error': 'Unable to prepare the approved account in Firebase. No moderator access was granted; retry approval.'}, status=503)
                    if User.objects.filter(firebase_uid=firebase_user.uid).exists():
                        return Response({'error': 'This Firebase identity is linked to another platform profile. Review the applicant account first.'}, status=409)
                    names = item.profile_snapshot['name'].split(' ', 1)
                    applicant = User.objects.create(firebase_uid=firebase_user.uid, email=item.email,
                        username=self.kind + '_' + uuid4().hex[:16], first_name=names[0], last_name=names[1] if len(names) > 1 else '',
                        contact_number=item.profile_snapshot['phone'], date_of_birth=item.profile_snapshot['date_of_birth'])
                if applicant.access_restricted or applicant.role not in ({'buyer', 'artist', 'driver'} if self.kind == 'driver' else {'buyer', 'artist'}):
                    return Response({'error': 'The applicant is restricted or their role has changed. Approval cannot proceed.'}, status=409)
                applicant.role = item.requested_role
                applicant.save(update_fields=['role'])
                if self.kind == 'driver':
                    from fulfillment.models import RiderProfile
                    RiderProfile.objects.get_or_create(user=applicant)
                item.user = applicant
            item.status = 'approved' if action == 'approve' else 'rejected'
        else:
            return Response({'error': 'Admin can decide only applications forwarded by HR.'}, status=409)
        item.version += 1
        item.save(update_fields=['status', 'assigned_to', 'version', 'updated_at', 'user'])
        ModeratorApplicationReview.objects.create(application=item, actor=actor, action=action, note=note)
        from notifications.models import UserNotification
        if action == 'forward':
            UserNotification.objects.bulk_create([UserNotification(user=admin, title=f'{self.kind.title()} application for final approval',
                message=f'HR forwarded application #{item.pk} for {item.profile_snapshot["name"]}. Review it in {self.kind.title()} approvals.')
                for admin in User.objects.filter(role='platform_admin')])
        elif action in {'approve', 'reject'} and item.user_id:
            UserNotification.objects.create(user=item.user, title=f'{self.kind.title()} application ' + item.status,
                message=f'Your {self.kind} application #{item.pk} was {item.status}. {note}')
        return Response(serialize(item, True))


class ModeratorDocumentView(ModeratorAccess):
    def get(self, request, application_id, index):
        self.reviewer(request)
        item = self.application(application_id)
        if not 0 <= index < len(item.documents):
            from rest_framework.exceptions import NotFound
            raise NotFound('Attachment not found.')
        document = item.documents[index]
        header, encoded = document['data_uri'].split(',', 1)
        response = HttpResponse(base64.b64decode(encoded), content_type=header[5:].split(';')[0])
        response['Content-Disposition'] = 'inline; filename="application-document"'
        response['Cache-Control'] = 'private, no-store'
        response['X-Content-Type-Options'] = 'nosniff'
        return response


class DriverAccountView(ModeratorAccess):
    @transaction.atomic
    def patch(self, request, user_id):
        actor = self.reviewer(request)
        driver = get_object_or_404(User.objects.select_for_update(), pk=user_id, role='driver')
        action, note = request.data.get('action'), request.data.get('note')
        if action not in {'deactivate', 'reactivate'} or not isinstance(note, str) or not note.strip() or len(note) > 2000:
            raise ValidationError('Select deactivate or reactivate and enter a reason (up to 2,000 characters).')
        deactivated = action == 'deactivate'
        if driver.driver_deactivated == deactivated:
            return Response({'error': 'The driver account status already changed. Refresh the list.'}, status=409)
        from fulfillment.models import DeliveryOrder, RiderProfile
        if deactivated and DeliveryOrder.objects.filter(driver=driver).exclude(status__in=['pending', 'delivered', 'cancelled']).exists():
            return Response({'error': 'This driver has an ongoing delivery. Complete or reassign it before deactivation.'}, status=409)
        if not deactivated and (driver.is_banned or driver.suspended_until):
            from django.utils import timezone
            if driver.is_banned or driver.suspended_until > timezone.now():
                raise PermissionDenied('Resolve the separate ban or suspension before reactivation.')
        driver.driver_deactivated = deactivated
        driver.save(update_fields=['driver_deactivated'])
        from django.utils import timezone
        if deactivated:
            RiderProfile.objects.filter(user=driver, is_clocked_in=True).update(is_clocked_in=False, clock_out_time=timezone.now())
        from .models import ActivityLog
        ActivityLog.objects.create(user=actor, action='driver_' + action, description=f'Driver #{driver.pk}: {note.strip()}'[:255], reference_type='driver_account', reference_id=driver.pk)
        from notifications.models import UserNotification
        UserNotification.objects.create(user=driver, title='Driver account ' + ('deactivated' if deactivated else 'reactivated'), message=note.strip())
        return Response({'id': driver.pk, 'deactivated': deactivated})
