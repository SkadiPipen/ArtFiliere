from decimal import Decimal, ROUND_HALF_UP
from django.conf import settings
from django.core import signing
from rest_framework.exceptions import ValidationError, PermissionDenied, NotFound
from rest_framework.response import Response
from authentication.views import AuthenticatedAPIView
from users.models import User
from fulfillment.addresses import address_data, FIELDS
from fulfillment.routing import road_distance
from .models import CommissionRequest

SALT = 'commission-road-delivery-v1'


def verify_delivery(c, token, max_age=900):
    try:
        if not isinstance(token, str) or not token or len(token) > 20000: raise ValueError()
        quote = signing.loads(token, salt=SALT, max_age=max_age)
        if quote['buyer'] != c.buyer_id or quote['artist'] != c.artist_id: raise ValueError()
        details = quote['details']
        for user, key, snapshot in ((c.artist, 'pickup_address_id', 'pickup_snapshot'), (c.buyer, 'delivery_address_id', 'delivery_snapshot')):
            address = user.addresses.filter(pk=details[key]).first()
            if not address or address_data(address) != details[snapshot]: raise ValueError()
        return details
    except (signing.BadSignature, ValueError, TypeError, KeyError):
        raise ValidationError('Calculate delivery again: the quote expired, does not match these parties, or a saved address changed.')


class CommissionDeliveryQuoteView(AuthenticatedAPIView):
    def get(self, request):
        user = self.get_request_user(request)
        if not user: raise PermissionDenied('Sign in to calculate commission delivery.')
        for key in ('commission_id', 'artist_id', 'address_id'):
            value = request.query_params.get(key)
            if value and (not value.isdecimal() or int(value) <= 0):
                raise ValidationError(f'Invalid {key}.')
        commission_id = request.query_params.get('commission_id')
        if commission_id:
            c = CommissionRequest.objects.filter(pk=commission_id).select_related('artist', 'buyer').first()
            if not c or user.pk not in (c.artist_id, c.buyer_id): raise NotFound('Commission not found.')
            artist, buyer = c.artist, c.buyer
        else:
            artist = User.objects.filter(pk=request.query_params.get('artist_id'), role='artist', is_accepting_commissions=True).first()
            if not artist: raise NotFound('Available artist not found.')
            buyer = user
        address_id = request.query_params.get('address_id')
        destination = buyer.addresses.filter(pk=address_id).first() if address_id and user.pk == buyer.pk else buyer.address
        pickup = artist.address
        for label, address in (('Artist pickup', pickup), ('Buyer delivery', destination)):
            if not address or any(not getattr(address, field, '').strip() for field in FIELDS):
                raise ValidationError(f'{label} requires a complete saved street, barangay, city, province, region and postal code.')
        pickup_data, delivery_data = address_data(pickup), address_data(destination)
        try:
            meters = road_distance(pickup_data['formatted'], delivery_data['formatted'](pickup_data)(delivery_data))
        except ValueError as error: raise ValidationError(str(error))
        km = Decimal(str(meters)) / 1000
        base, rate = Decimal(settings.DELIVERY_BASE_FARE), Decimal(settings.DELIVERY_PER_KM)
        included = Decimal(getattr(settings, 'DELIVERY_INCLUDED_KM', '2'))
        distance_fee = (max(Decimal('0'), km - included) * rate).quantize(Decimal('.01'), rounding=ROUND_HALF_UP)
        fee = base + distance_fee
        details = {'pickup_address_id': pickup.pk, 'delivery_address_id': destination.pk,
            'pickup_snapshot': pickup_data, 'delivery_snapshot': delivery_data,
            'pickup_address': pickup_data['formatted'], 'delivery_address': delivery_data['formatted'],
            'distance_km': str(km.quantize(Decimal('.001'))), 'base_fare': str(base), 'included_km': str(included),
            'per_km': str(rate), 'distance_fee': str(distance_fee), 'fee': str(fee), 'distance_source': 'openrouteservice',
            'recipient_name': ' '.join(filter(None, [buyer.first_name, buyer.middle_name, buyer.last_name])), 'recipient_phone': buyer.contact_number}
        token = signing.dumps({'artist': artist.pk, 'buyer': buyer.pk, 'details': details}, salt=SALT, compress=True)
        response = Response({**details, 'token': token, 'expires_in': 900, 'addresses': [address_data(a) for a in buyer.addresses.order_by('-is_default', 'id')] if user.pk == buyer.pk else []})
        response['Cache-Control'] = 'private, no-store'
        return response


class CommissionPolicyView(AuthenticatedAPIView):
    def get(self, request):
        if not self.get_request_user(request): raise PermissionDenied('Sign in to view commission policy.')
        from .royalty_policy import POLICY, SOURCE, BANDS, SUMMARY
        return Response({'resale_calculation': POLICY, 'resale_source': SOURCE, 'resale_schedule': BANDS, 'resale_summary': SUMMARY, 'resale_royalty_percentage': getattr(settings, 'COMMISSION_RESALE_ROYALTY_PERCENTAGE', None),
                         'resale_basis': 'Future resale artwork selling price excluding VAT, before platform fees; graduated portions.'})
