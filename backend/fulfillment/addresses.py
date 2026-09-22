import math
from django.db import transaction
from rest_framework.exceptions import ValidationError, NotFound
from rest_framework.response import Response
from authentication.views import AuthenticatedAPIView
from authentication.permissions import IsAuthenticatedUser
from users.models import Address, User

FIELDS = ('street', 'barangay', 'city', 'province', 'region', 'postal_code')


def address_data(address):
    if not address:
        return None
    return {'id': address.id, 'label': address.label, 'is_default': address.is_default,
            'latitude': address.latitude, 'longitude': address.longitude,
            **{field: getattr(address, field) for field in FIELDS},
            'formatted': ', '.join(getattr(address, field).strip() for field in FIELDS)}


class AddressesView(AuthenticatedAPIView):
    permission_classes = [IsAuthenticatedUser]

    def get(self, request):
        return Response([address_data(a) for a in self.get_request_user(request).addresses.order_by('-is_default', 'id')])

    @transaction.atomic
    def post(self, request, address_id=None):
        user = self.get_request_user(request)
        User.objects.select_for_update().get(pk=user.pk)
        address = user.addresses.filter(pk=address_id).first() if address_id else Address(user=user)
        if not address:
            raise NotFound('Address not found.')
        if not address_id and user.addresses.count() >= 20:
            raise ValidationError({'error': 'You can save up to 20 addresses.'})
        text_changed = any(field in request.data and request.data[field] != getattr(address, field) for field in FIELDS)
        for field in (*FIELDS, 'label'):
            value = request.data.get(field, getattr(address, field))
            if not isinstance(value, str) or not value.strip() or len(value.strip()) > Address._meta.get_field(field).max_length:
                raise ValidationError({'error': f'Enter a valid {field.replace("_", " ")}.'})
            setattr(address, field, value.strip())
        if 'latitude' in request.data or 'longitude' in request.data:
            lat, lng = request.data.get('latitude'), request.data.get('longitude')
            if not (lat is None and lng is None):
                if (any(isinstance(n, bool) or not isinstance(n, (int, float)) or not math.isfinite(n) for n in (lat, lng))
                        or not -85 <= lat <= 85 or not -180 <= lng <= 180):
                    raise ValidationError({'error': 'Select a valid location on the map.'})
            address.latitude, address.longitude = lat, lng
        elif text_changed:
            address.latitude = address.longitude = None
        default = request.data.get('is_default', address.is_default)
        if not isinstance(default, bool):
            raise ValidationError({'error': 'Default address must be true or false.'})
        # A default is replaced explicitly; never leave an existing address book without one.
        address.is_default = default or address.is_default or not user.addresses.exclude(pk=address.pk).exists()
        if address.is_default:
            user.addresses.exclude(pk=address.pk).update(is_default=False)
        address.save()
        return Response(address_data(address), status=200 if address_id else 201)

    def patch(self, request, address_id):
        return self.post(request, address_id)

    @transaction.atomic
    def delete(self, request, address_id):
        user = self.get_request_user(request)
        User.objects.select_for_update().get(pk=user.pk)
        address = user.addresses.filter(pk=address_id).first()
        if not address:
            raise NotFound('Address not found.')
        address.delete()
        if not user.addresses.filter(is_default=True).exists():
            first = user.addresses.order_by('id').first()
            if first:
                first.is_default = True
                first.save(update_fields=['is_default'])
        return Response({'deleted': True})
