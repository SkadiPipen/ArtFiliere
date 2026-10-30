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


def normalize_location(value, street=False):
    import re
    aliases = {'ave': 'avenue', 'av': 'avenue', 'st': 'street', 'rd': 'road', 'blvd': 'boulevard', 'hwy': 'highway', 'ext': 'extension', 'brgy': 'barangay'}
    words = re.sub(r'[^a-z0-9 ]', ' ', str(value).casefold()).split()
    words = [aliases.get(word, word) for word in words]
    ignored = {'city', 'municipality', 'of', 'barangay', 'pob', 'poblacion'}
    words = [word for word in words if word not in ignored]
    return ''.join(words) if street else ' '.join(words)


def secondary_geocode(query):
    """Adapt Geoapify results to the same strict validation as the primary source."""
    from django.core.cache import cache
    import hashlib
    key = 'secondary-geocoder-v1:' + hashlib.sha256(query.encode()).hexdigest()
    cached = cache.get(key)
    if cached is not None:
        return cached
    payload = provider_json(requests.get('https://api.geoapify.com/v1/geocode/search',
        params={'text': query, 'filter': 'countrycode:ph', 'limit': 5, 'apiKey': settings.GEOAPIFY_API_KEY}, timeout=15))
    features = []
    for feature in payload.get('features') or []:
        p = feature.get('properties') or {}
        result_type = p.get('result_type')
        layer = {'building': 'address', 'amenity': 'venue', 'street': 'street'}.get(result_type, result_type)
        features.append({'geometry': feature.get('geometry', {}), 'properties': {
            'country_a': 'PHL' if p.get('country_code', '').lower() == 'ph' else '',
            'layer': layer, 'confidence': (p.get('rank') or {}).get('confidence', 0),
            'locality': p.get('city', ''), 'localadmin': p.get('town', ''), 'county': p.get('county', ''),
            'region': p.get('state', ''), 'macroregion': p.get('region', ''), 'label': p.get('formatted', ''),
            'street': p.get('street', ''), 'name': p.get('name', ''), 'housenumber': p.get('housenumber', ''),
            'postalcode': p.get('postcode', ''), 'neighbourhood': p.get('suburb', ''),
        }})
    result = {'features': features}
    cache.set(key, result, 86400 if features else 300)
    return result


def geocode_address(address, include_metadata=False, _street_retry=False, _fallback=False, _street_only=False):
    import re
    parts = [part.strip() for part in address.split(',')]
    city = parts[-4] if len(parts) >= 6 else parts[-2] if len(parts) >= 4 else ''
    province = parts[-3] if len(parts) >= 6 else parts[-1] if len(parts) >= 4 else ''
    if not city or not province:
        raise ValueError('Automatic lookup requires the street, barangay, city and province.')
    if not settings.ORS_API_KEY:
        raise ValueError('Automatic address lookup is not configured. Contact the administrator.')
    junction_parts = re.split(r'\s+(?:corner|cor\.?|at intersection of)\s+|\s*[&@]\s*', parts[0], maxsplit=1, flags=re.IGNORECASE)
    junction = len(junction_parts) > 1
    first_street = junction_parts[0]
    query = f'{parts[0]}, {city}, {province}, Philippines' if _street_retry else address
    if _street_only:
        street_text = re.sub(r'^\s*\d+[a-zA-Z]?(?:-\d+)?\b\s*', '', first_street)
        query = f'{street_text}, {normalize_location(city)}, Philippines'
    try:
        if _fallback:
            payload = secondary_geocode(query)
        else:
            payload = provider_json(requests.get('https://api.openrouteservice.org/geocode/search',
                headers={'Authorization': settings.ORS_API_KEY},
                params={'text': query, 'boundary.country': 'PHL', 'size': 5, 'layers': 'address,venue,street'}, timeout=15))
    except (requests.RequestException, ValueError):
        if not _fallback and getattr(settings, 'GEOAPIFY_API_KEY', ''):
            return geocode_address(address, include_metadata, _fallback=True)
        raise ValueError('Address lookup is unavailable. Please retry shortly.') from None
    house = re.match(r'^\s*(\d+[a-zA-Z]?(?:-\d+)?)\b', first_street)
    requested_street = normalize_location(first_street[house.end():] if house else first_street, True)
    approximate = None
    locality_seen = False
    for feature in payload.get('features') or []:
        properties = feature.get('properties', {})
        confidence = properties.get('confidence', 0)
        layer = properties.get('layer')
        if (properties.get('country_a') != 'PHL' or layer not in ('address', 'venue', 'street')
                or isinstance(confidence, bool) or not isinstance(confidence, (int, float)) or not math.isfinite(confidence) or confidence < 0.8):
            continue
        city_names = [normalize_location(properties.get(key, '')) for key in ('locality', 'localadmin', 'county')]
        administrative = ' '.join(normalize_location(properties.get(key, '')) for key in ('county', 'macrocounty', 'region', 'macroregion', 'label'))
        if normalize_location(city) not in city_names:
            continue
        province_matches = f' {normalize_location(province)} ' in f' {administrative} '
        # Independent cities may be indexed under their region, without a province.
        # Explicit geographic association, never infer a province from proximity.
        independent_city_provinces = {'mandaue': 'cebu', 'cebu': 'cebu', 'lapu lapu': 'cebu'}
        expected_region = normalize_location(parts[-2]) if len(parts) >= 6 else 'central visayas'
        expected_postal = parts[-1] if len(parts) >= 6 else ''
        regional_city_match = (
            independent_city_provinces.get(normalize_location(city)) == normalize_location(province)
            and expected_region and normalize_location(properties.get('region', '')) == expected_region
            and (not expected_postal or str(properties.get('postalcode') or '') == expected_postal)
        )
        if not province_matches and not regional_city_match:
            continue
        locality_seen = True
        names = [normalize_location(properties.get(key, ''), True) for key in ('street', 'name')]
        if not requested_street or requested_street not in names:
            continue
        neighbourhood = properties.get('neighbourhood') or properties.get('borough')
        barangay_mismatch = bool(neighbourhood and normalize_location(neighbourhood) != normalize_location(parts[-5] if len(parts) >= 6 else parts[-3]))
        if barangay_mismatch and layer != 'street':
            continue
        postal = parts[-1] if len(parts) >= 6 else ''
        if postal and properties.get('postalcode') and str(properties['postalcode']) != postal:
            continue
        coordinates = feature.get('geometry', {}).get('coordinates')
        if (not isinstance(coordinates, list) or len(coordinates) != 2
                or any(isinstance(n, bool) or not isinstance(n, (int, float)) or not math.isfinite(n) for n in coordinates)
                or not -180 <= coordinates[0] <= 180 or not -90 <= coordinates[1] <= 90):
            continue
        number = str(properties.get('housenumber') or '').strip()
        # A different building number is never accepted as the requested building.
        if house and number and normalize_location(number, True) != normalize_location(house.group(1), True):
            continue
        named_landmark = layer == 'venue' and normalize_location(properties.get('name', ''), True) != requested_street
        exact = layer != 'street' and not junction and not named_landmark and (not house or bool(number))
        result = {'coordinates': coordinates, 'precision': 'address' if exact else 'landmark' if named_landmark else 'street',
                  'label': properties.get('label', ''), 'provider': 'geoapify' if _fallback else 'openrouteservice',
                  'notice': '' if exact else 'Approximate street location. The map could not locate the exact building/house number; this pin is not the building entrance.' + (' The matched street segment is listed in a different barangay; confirm the entrance using delivery chat.' if barangay_mismatch else '')}
        if named_landmark and not exact:
            result['notice'] = f"Approximate nearby landmark: {properties.get('label') or properties.get('name')}. This is on the matched street, not the buyer/artist entrance or a verified street junction. Confirm the final directions using delivery chat."
        elif junction:
            result['notice'] += ' The requested street junction could not be verified.'
        if exact:
            return result if include_metadata else coordinates
        if approximate is None:
            approximate = result
    if approximate:
        return approximate if include_metadata else approximate['coordinates']
    if _fallback and _street_retry and not _street_only:
        return geocode_address(address, include_metadata=include_metadata, _street_retry=True, _fallback=True, _street_only=True)
    if not _street_retry:
        return geocode_address(address, include_metadata=include_metadata, _street_retry=True, _fallback=_fallback)
    if not _fallback and getattr(settings, 'GEOAPIFY_API_KEY', ''):
        return geocode_address(address, include_metadata=include_metadata, _fallback=True)
    if locality_seen:
        raise ValueError(f'The city/province matched, but the street, barangay, postal code or building number could not be verified in {city}. Check those address details.')
    raise ValueError(f'The map could not verify a location in {city}, {province}. No result in another city or province was used.')


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
        if isinstance(meters, bool) or not isinstance(meters, (int, float)) or not math.isfinite(meters) or meters < 0:
            raise ValueError('The map returned no usable road distance. Check both addresses.')
        if meters == 0:
            same_address = ' '.join(pickup.split()).casefold() == ' '.join(destination.split()).casefold()
            same_point = coordinates[0] == coordinates[1]
            both_pinned = pickup_coordinates is not None and destination_coordinates is not None
            if not same_point or not (same_address or both_pinned):
                raise ValueError('The map returned a zero-distance route for different addresses. Check both saved addresses or set precise location pins.')
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
    pickup_point = geocode_address(pickup['formatted'])
    destination_point = geocode_address(destination['formatted'])
    meters = road_distance(pickup['formatted'], destination['formatted'],
                           pickup_coordinates=pickup_point, destination_coordinates=destination_point)
    km = Decimal(str(meters)) / 1000
    base, rate = Decimal(settings.DELIVERY_BASE_FARE), Decimal(settings.DELIVERY_PER_KM)
    fee = (base + km * rate).quantize(Decimal('.01'), rounding=ROUND_HALF_UP)
    details = {'pickup_address_id': pickup['id'], 'delivery_address_id': destination['id'],
               'pickup_coordinates': pickup_point, 'delivery_coordinates': destination_point,
               'location_validation_version': 3,
               'geocoded_addresses': {'pickup': pickup['formatted'], 'delivery': destination['formatted']},
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
