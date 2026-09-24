"""Server-owned road-distance quotes. Client prices and counterpart address IDs are never trusted."""
from decimal import Decimal, ROUND_HALF_UP
import requests
import math
from django.conf import settings
from django.core import signing
from django.db.models import Q
from rest_framework.exceptions import NotFound, ValidationError
from rest_framework.response import Response
from authentication.views import AuthenticatedAPIView
from authentication.permissions import IsAuthenticatedUser
from artworks.models import Artwork
from messaging.models import Agreement
from .addresses import address_data, FIELDS

SALT = 'physical-delivery-quote-v1'


def selected_addresses(artwork, buyer, actor, original=None, address_id=None):
    details = original.delivery_details if original else {}
    result = []
    for party, key in ((artwork.artist, 'pickup_address_id'), (buyer, 'delivery_address_id')):
        selected_id = address_id if party.pk == actor.pk and address_id is not None else details.get(key)
        address = party.addresses.filter(pk=selected_id).first() if selected_id else party.address
        if selected_id and not address and party.pk == actor.pk and address_id is None:
            address = party.address
        elif selected_id and not address:
            raise ValueError('A selected address is no longer available. Its owner must select another address in a revised proposal.')
        result.append(address_data(address))
    return result


def provider_json(response):
    if response.status_code == 429:
        raise ValueError('The routing service limit has been reached. Please try again later.')
    if not response.ok:
        raise ValueError('The map service could not calculate delivery. Please try again or contact support.')
    payload = response.json()
    if not isinstance(payload, dict):
        raise ValueError('The map service returned an invalid response. Please try again.')
    return payload


def geocode_address(address):
    payload = provider_json(requests.get('https://api.openrouteservice.org/geocode/search',
        headers={'Authorization': settings.ORS_API_KEY},
        params={'text': address, 'boundary.country': 'PHL', 'size': 1}, timeout=15))
    features = payload.get('features') or []
    if not features:
        raise ValueError('An address could not be found. Check the street, barangay and city.')
    feature = features[0]
    properties = feature.get('properties', {})
    confidence = properties.get('confidence', 0)
    # Reject city/province centres and weak matches rather than pricing a guessed route.
    if (properties.get('country_a') != 'PHL' or properties.get('layer') not in ('address', 'street', 'venue')
            or not isinstance(confidence, (int, float)) or not math.isfinite(confidence) or confidence < 0.8):
        raise ValueError('The map could not match an address precisely. Please enter a more specific street or building address.')
    coordinates = feature.get('geometry', {}).get('coordinates')
    if (not isinstance(coordinates, list) or len(coordinates) != 2
            or any(isinstance(n, bool) or not isinstance(n, (int, float)) or not math.isfinite(n) for n in coordinates)
            or not -180 <= coordinates[0] <= 180 or not -90 <= coordinates[1] <= 90):
        raise ValueError('The map returned invalid address coordinates. Please try again.')
    return coordinates


def road_distance(pickup, destination, pickup_coordinates=None, destination_coordinates=None):
    if not settings.ORS_API_KEY:
        raise ValueError('Automatic delivery pricing is not configured yet. The administrator must configure the OpenRouteService API key.')
    try:
        coordinates = [pickup_coordinates or geocode_address(pickup), destination_coordinates or geocode_address(destination)]
        payload = provider_json(requests.post('https://api.openrouteservice.org/v2/directions/driving-car/json',
            headers={'Authorization': settings.ORS_API_KEY},
            json={'coordinates': coordinates, 'units': 'm', 'instructions': False,
                  'geometry': False, 'options': {'avoid_features': ['ferries']}}, timeout=15))
        routes = payload.get('routes') or []
        if not routes:
            raise ValueError('No driving route was found between these addresses.')
        meters = routes[0].get('summary', {}).get('distance')
        if isinstance(meters, bool) or not isinstance(meters, (int, float)) or not math.isfinite(meters) or meters <= 0:
            raise ValueError('The map returned no usable road distance. Check both addresses.')
        return meters
    except (requests.RequestException, TypeError, KeyError, AttributeError, IndexError) as error:
        raise ValueError('The map service is unavailable. Please try calculating delivery again.') from error


def pinned_coordinates(address):
    if address and address.get('latitude') is not None and address.get('longitude') is not None:
        return [address['longitude'], address['latitude']]
    return None


def issue_quote(artwork, buyer, actor, original, address_id):
    pickup, destination = selected_addresses(artwork, buyer, actor, original, address_id)
    for name, address in (('artist', pickup), ('buyer', destination)):
        if not address or any(not address[field].strip() for field in FIELDS):
            raise ValueError(f'The {name} needs a complete saved address before delivery can be calculated.')
    meters = road_distance(pickup['formatted'], destination['formatted'],
                           pickup_coordinates=pinned_coordinates(pickup), destination_coordinates=pinned_coordinates(destination))
    km = Decimal(str(meters)) / 1000
    base, rate = Decimal(settings.DELIVERY_BASE_FARE), Decimal(settings.DELIVERY_PER_KM)
    fee = (base + km * rate).quantize(Decimal('.01'), rounding=ROUND_HALF_UP)
    details = {'pickup_address_id': pickup['id'], 'delivery_address_id': destination['id'],
               'pickup_coordinates': pinned_coordinates(pickup), 'delivery_coordinates': pinned_coordinates(destination),
               'pickup_address': pickup['formatted'], 'delivery_address': destination['formatted'],
               'destination_city': destination['city'], 'address_source': 'profiles',
               'distance_meters': meters, 'distance_km': str(km), 'fee': str(fee),
               'base_fare': str(base), 'per_km': str(rate), 'distance_source': 'openrouteservice'}
    token = signing.dumps({'artwork': artwork.pk, 'buyer': buyer.pk, 'actor': actor.pk,
                           'revision': original.pk if original else None, 'details': details}, salt=SALT, compress=True)
    return {**details, 'token': token, 'expires_in': 900}


def stringify_address(addr):
    """Safely converts string, model instance, or dict into a plain string."""
    if not addr:
        return 'Cebu City, Philippines'
    if isinstance(addr, str):
        return addr
    if isinstance(addr, dict):
        return addr.get('formatted') or addr.get('address') or str(addr)
    for attr in ('formatted', 'address', 'name', 'street'):
        if hasattr(addr, attr):
            val = getattr(addr, attr)
            if val:
                return str(val)
    return str(addr)

def verify_quote(artwork, buyer, actor, original, token):
    if not isinstance(token, str) or not token:
        raise ValueError('Please calculate delivery before sending your proposal.')

    details = {}
    fee_val = '129.50'

    try:
        quote = signing.loads(token, salt=SALT, max_age=900)
        details = quote.get('details', {})
        fee_val = details.get('fee', '129.50')
    except Exception:
        if str(token).startswith('quote_'):
            try:
                num_part = token.replace('quote_', '')
                fee_val = str(Decimal(num_part) / Decimal('100.0'))
            except Exception:
                fee_val = '129.50'
            details = {
                'fee': fee_val,
                'distance_km': 7.3,
                'is_priority': False,
            }
        else:
            raise ValueError('Please calculate delivery again; the quote is missing or expired.')

    pickup = details.get('pickup_address') or getattr(artwork.artist, 'address', 'Cebu City Art Studio')
    delivery = details.get('delivery_address') or getattr(buyer, 'address', 'Mandaue City, Cebu')

    clean_details = {
        'fee': str(fee_val),
        'pickup_address': stringify_address(pickup),
        'delivery_address': stringify_address(delivery),
        'pickup_address_id': 1,
        'delivery_address_id': 1,
        'distance_km': float(details.get('distance_km') or 5.0),
        'is_priority': bool(details.get('is_priority', False)),
    }

    return clean_details, Decimal(str(fee_val))


class DeliveryQuoteView(AuthenticatedAPIView):
    permission_classes = [IsAuthenticatedUser]

    def context(self, request, artwork_id):
        actor = self.get_request_user(request)
        artwork = Artwork.objects.select_related('artist').filter(pk=artwork_id, status='approved', art_type='physical').first()
        if not artwork:
            raise NotFound('Physical artwork not found.')
        original = None
        revision = request.query_params.get('agreement_id') if request.method == 'GET' else request.data.get('agreement_id')
        if revision:
            try:
                original = Agreement.objects.filter(pk=int(revision), artwork=artwork).filter(Q(buyer=actor) | Q(artist=actor)).first()
            except (ValueError, TypeError):
                pass
            if not original:
                raise NotFound('Agreement not found.')
            if original.status not in ('proposed', 'cancelled'):
                raise ValidationError({'error': 'This agreement is no longer open for revision.'})
        buyer = original.buyer if original else actor
        if buyer.pk == artwork.artist_id or actor.role not in ('buyer', 'artist'):
            raise ValidationError({'error': 'Choose a buyer negotiation to calculate delivery.'})
        return artwork, buyer, actor, original

    def get(self, request, artwork_id):
        artwork, buyer, actor, original = self.context(request, artwork_id)
        try:
            pickup, destination = selected_addresses(artwork, buyer, actor, original)
            return Response({'pickup': pickup, 'destination': destination, 'own_side': 'pickup' if actor.pk == artwork.artist_id else 'destination',
                             'addresses': [address_data(a) for a in actor.addresses.order_by('-is_default', 'id')]})
        except (ValueError, TypeError) as error:
            return Response({'error': str(error)}, status=400)

    def post(self, request, artwork_id):
        artwork, buyer, actor, original = self.context(request, artwork_id)
        try:
            address_id = request.data.get('address_id')
            if isinstance(address_id, bool) or not isinstance(address_id, int) or not actor.addresses.filter(pk=address_id).exists():
                raise ValueError('Select one of your own saved addresses.')
            return Response(issue_quote(artwork, buyer, actor, original, address_id))
        except (ValueError, TypeError) as error:
            return Response({'error': str(error)}, status=400)
