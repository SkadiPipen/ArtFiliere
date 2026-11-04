"""Versioned platform policy. New agreements freeze their selected rates."""
from copy import deepcopy
from decimal import Decimal, InvalidOperation, ROUND_HALF_UP
from django.db import transaction
from rest_framework.response import Response
from authentication.views import AuthenticatedAPIView
from authentication.permissions import IsAuthenticatedUser, IsPlatformAdmin
from .models import PlatformDefaults

DEFAULTS = {
    'platform_fee_percentage': '10.00',
    'royalty_platform_fee_percentage': '0.00',
    'royalty_platform_fee_basis': 'artist_royalty',
    'default_artist_royalty_percentage': '5.00',
    'default_exclusivity': 'non-exclusive',
    'default_license_duration_months': 12,
    'license_multipliers': {'personal': '1.00', 'commercial': '1.50'},
    'exclusivity_multipliers': {'non-exclusive': '1.00', 'exclusive': '1.50', 'sole': '1.30'},
}


def current_defaults():
    row = PlatformDefaults.objects.filter(pk=1).first()
    return {**deepcopy(DEFAULTS), **(row.values if row else {}), 'revision': row.revision if row else 0}


def validate_defaults(raw):
    if not isinstance(raw, dict) or set(raw) != set(DEFAULTS):
        raise ValueError('Submit all platform default fields.')
    result = deepcopy(raw)
    def decimal(value, label, minimum, maximum):
        try:
            number = Decimal(str(value))
            if not number.is_finite() or not minimum <= number <= maximum or number != number.quantize(Decimal('.01')):
                raise ValueError()
            return str(number.quantize(Decimal('.01')))
        except (ValueError, TypeError, InvalidOperation):
            raise ValueError(f'{label} must be between {minimum} and {maximum}, with up to two decimals.') from None
    for key in ('platform_fee_percentage', 'royalty_platform_fee_percentage', 'default_artist_royalty_percentage'):
        result[key] = decimal(raw[key], key.replace('_', ' '), 0, 100)
    for key in ('license_multipliers', 'exclusivity_multipliers'):
        if not isinstance(raw[key], dict) or set(raw[key]) != set(DEFAULTS[key]):
            raise ValueError('Provide all license and exclusivity multipliers.')
        result[key] = {name: decimal(value, name + ' multiplier', Decimal('.01'), 100) for name, value in raw[key].items()}
    if raw['default_exclusivity'] not in DEFAULTS['exclusivity_multipliers']:
        raise ValueError('Choose a valid default exclusivity.')
    if raw['royalty_platform_fee_basis'] != 'artist_royalty':
        raise ValueError('Choose the platform royalty fee calculation basis.')
    duration = raw['default_license_duration_months']
    if type(duration) is not int or not 1 <= duration <= 60:
        raise ValueError('License duration must be 1 to 60 whole months.')
    return result


def fee_percent(agreement=None):
    if agreement is not None:
        return Decimal(str(agreement.pricing_terms.get('platform_fee_percent', agreement.platform_defaults_snapshot.get('platform_fee_percentage', '10.00'))))
    return Decimal(current_defaults()['platform_fee_percentage'])


def included_fee(total, percent):
    return (total - total / (1 + Decimal(str(percent)) / 100)).quantize(Decimal('.01'), rounding=ROUND_HALF_UP)


def royalty_split(period):
    artist = period.amount or Decimal(0)
    snapshot = period.agreement.platform_defaults_snapshot
    percent = Decimal(str(snapshot.get('royalty_platform_fee_percentage', 0)))
    base = artist
    fee = (base * percent / 100).quantize(Decimal('.01'), rounding=ROUND_HALF_UP) if artist > 0 else Decimal(0)
    if artist + fee > Decimal('9999999999.99'):
        raise ValueError('The total royalty payment exceeds the supported amount.')
    return artist, fee, artist + fee


def royalty_fee_text(snapshot):
    percent = Decimal(str(snapshot.get('royalty_platform_fee_percentage', 0)))
    if not percent:
        return ''
    basis = "the artist's calculated royalty"
    return f"Platform royalty service fee: {percent}% of {basis}, payable by the buyer in addition to the artist royalty. The artist receives the full agreed royalty. This rate is fixed for this agreement."


class PlatformDefaultsView(AuthenticatedAPIView):
    permission_classes = [IsAuthenticatedUser]
    def get(self, request):
        response = Response(current_defaults())
        response['Cache-Control'] = 'private, no-store'
        return response


class PlatformDefaultsAdminView(PlatformDefaultsView):
    permission_classes = [IsPlatformAdmin]
    @transaction.atomic
    def post(self, request):
        try:
            values = validate_defaults(request.data.get('values'))
        except ValueError as error:
            return Response({'error': str(error)}, status=400)
        row, _ = PlatformDefaults.objects.get_or_create(pk=1)
        row = PlatformDefaults.objects.select_for_update().get(pk=row.pk)
        if request.data.get('revision') != row.revision and not (request.data.get('revision') == 0 and not row.values):
            return Response({'error': 'Platform defaults changed. Refresh before saving your changes.'}, status=409)
        row.values, row.updated_by = values, self.get_request_user(request)
        row.revision += 1
        row.save()
        from users.models import ActivityLog
        ActivityLog.objects.create(user=row.updated_by, action='platform_defaults_updated', description=f'Updated platform defaults to revision {row.revision}.', reference_type='platform_defaults', reference_id=row.pk)
        return Response(current_defaults())
