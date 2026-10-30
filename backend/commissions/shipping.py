"""Physical commission dispatch, with no milestone approval or payment side effects."""
from django.utils import timezone
from fulfillment.models import DeliveryOrder
from notifications.models import UserNotification
from users.models import User


def tracking_reference(order):
    return f'AF-COM-{order.commission_id}-D{order.pk}'


def request_pickup(c):
    existing = DeliveryOrder.objects.filter(commission=c).first()
    if existing: return existing
    from fulfillment.routing import geocode_address
    from rest_framework.exceptions import ValidationError
    details = dict(c.locked_terms.get('delivery_details') or {})
    try:
        for party in ('pickup', 'delivery'):
            details[f'{party}_coordinates'] = geocode_address(c.locked_terms[f'{party}_address'])
    except ValueError as error: raise ValidationError(str(error))
    details['location_validation_version'] = 3
    details['geocoded_addresses'] = {party: c.locked_terms[f'{party}_address'] for party in ('pickup', 'delivery')}
    details['delivery_floor_unit'] = c.locked_terms.get('delivery_floor_unit', '')
    details['delivery_instruction'] = c.locked_terms.get('delivery_instruction', '')
    order, created = DeliveryOrder.objects.get_or_create(commission=c, defaults={
        'pickup_address': c.locked_terms['pickup_address'], 'delivery_address': c.locked_terms['delivery_address'],
        'fee': c.locked_terms.get('delivery_fee', '0'), 'route_details': details, 'timeline': {'pending': timezone.now().isoformat()}})
    reference = tracking_reference(order)
    if created:
        from authentication.services import account_access
        for driver in User.objects.filter(role__in=['driver', 'rider'], rider_profile__is_clocked_in=True):
            access = account_access(driver)
            if not access['banned'] and not access['suspended']:
                UserNotification.objects.create(user=driver, commission=c, title='Commission pickup available', message=f'{reference}: {c.title}. Open Delivery Requests to accept.')
        for party in (c.artist, c.buyer):
            UserNotification.objects.create(user=party, commission=c, title='Commission pickup requested', message=f'{reference}: Waiting for a driver. Final payment remains locked until buyer receipt and approval.')
    return order


def verified_locations(order, force_side=None):
    """Bind coordinates to the immutable order address, never a mutable profile pin."""
    from fulfillment.routing import geocode_address
    from django.core.cache import cache
    import hashlib
    details = dict(order.route_details or {})
    errors = dict(details.get('location_errors') or {})
    addresses = dict(details.get('geocoded_addresses') or {})
    precision = dict(details.get('location_precision') or {})
    providers = dict(details.get('location_providers') or {})
    notices = dict(details.get('location_notices') or {})
    changed = details.get('location_validation_version') != 7
    for party in ('pickup', 'delivery'):
        text = getattr(order, f'{party}_address')
        valid = details.get('location_validation_version') == 7 and addresses.get(party) == text and details.get(f'{party}_coordinates') and party not in errors
        if valid and party != force_side:
            continue
        key = 'order-geocode-v7:' + hashlib.sha256(text.encode()).hexdigest()
        if party == force_side:
            cache.delete(key)
        result = cache.get(key)
        if result is None:
            try:
                match = geocode_address(text, include_metadata=True)
                result = {'point': match['coordinates'], 'precision': match['precision'], 'notice': match['notice'], 'provider': match.get('provider', '')}
            except ValueError as error:
                result = {'error': str(error)}
            cache.set(key, result, 60 if 'error' in result else 3600)
        details[f'{party}_coordinates'] = result.get('point')
        precision[party] = result.get('precision')
        providers[party] = result.get('provider', '')
        notices[party] = result.get('notice', '')
        if notices[party]:
            notices[party] += ' Confirm the entrance with the artist using delivery chat.' if party == 'pickup' else ' Confirm the entrance with the buyer using delivery chat.'
        if 'error' in result:
            errors[party] = result['error']
        else:
            errors.pop(party, None)
        addresses[party] = text
        changed = True
    if changed:
        details.update(location_validation_version=7, location_errors=errors, geocoded_addresses=addresses, location_precision=precision, location_notices=notices, location_providers=providers)
        order.route_details = details
        order.save(update_fields=['route_details'])
    return details


def delivery_status(c):
    order = DeliveryOrder.objects.filter(commission=c).select_related('driver').first()
    if not order: return None
    labels = dict(DeliveryOrder.Status.choices)
    return {'id': order.pk, 'tracking_reference': tracking_reference(order), 'status': order.status,
            'status_label': labels.get(order.status, order.status), 'timeline': order.timeline,
            'pickup_address': order.pickup_address, 'delivery_address': order.delivery_address,
            'fee': str(order.fee), 'delivered_at': order.delivered_at,
            'has_pickup_proof': bool(order.pickup_proof), 'has_delivery_proof': bool(order.delivery_proof),
            'driver': {'name': ' '.join(filter(None, [order.driver.first_name, order.driver.last_name])) or order.driver.username,
                       'phone': order.driver.contact_number} if order.driver else None}


def notify_delivery_update(order):
    if not order.commission_id: return
    c = order.commission
    label = dict(DeliveryOrder.Status.choices).get(order.status, order.status)
    for party in (c.buyer, c.artist):
        UserNotification.objects.create(user=party, commission=c, title='Commission delivery update',
            message=f'{tracking_reference(order)}: {label}. ' + ('Please confirm receipt, inspect the artwork and approve the final milestone.' if order.status == 'delivered' else ''))
