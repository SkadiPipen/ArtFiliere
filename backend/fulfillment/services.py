import base64
from decimal import Decimal
from io import BytesIO
from PIL import Image, ImageOps
from notifications.models import UserNotification
from users.models import ActivityLog
from .models import DeliveryOrder, DeliveryRoute


def physical(artwork):
    return artwork.art_type == 'physical'


def routes_for(artwork):
    address = getattr(artwork.artist, 'address', None)
    if not address:
        return DeliveryRoute.objects.none()
    return DeliveryRoute.objects.filter(active=True, pickup_city__iexact=address.city.strip()).order_by('destination_city')


def full_address(user):
    address = getattr(user, 'address', None)
    fields = ('street', 'barangay', 'city', 'province', 'region', 'postal_code')
    if not address or any(not str(getattr(address, field, '')).strip() for field in fields):
        raise ValueError(f'{user.username} needs a complete address in their profile before physical delivery.')
    return ', '.join(str(getattr(address, field)).strip() for field in fields)


def delivery_context(artwork, buyer):
    pickup = full_address(artwork.artist)
    destination = full_address(buyer)
    routes = routes_for(artwork).filter(destination_city__iexact=buyer.address.city.strip())
    return {'pickup_address': pickup, 'delivery_address': destination,
            'destination_city': buyer.address.city.strip(),
            'routes': [{'id': r.id, 'zone': r.destination_city, 'pickup_city': r.pickup_city,
                        'distance_km': str(r.distance_km), 'fee': str(r.fee)} for r in routes]}


def shipping_details(artwork, data, buyer, actor=None, original=None):
    if not physical(artwork):
        return {}, 0
    from .routing import verify_quote
    return verify_quote(artwork, buyer, actor or buyer, original, data.get('delivery_quote'))


def png_bytes(artwork):
    raw = artwork.image_data
    if not raw or not raw.startswith('data:image/') or ';base64,' not in raw:
        raise ValueError('The artwork image is unavailable. Contact the artist before paying.')
    try:
        source = base64.b64decode(raw.split(',', 1)[1], validate=True)
        with Image.open(BytesIO(source)) as image:
            if image.width * image.height > 40_000_000:
                raise ValueError('Artwork image is too large to deliver.')
            output = BytesIO()
            ImageOps.exif_transpose(image).convert('RGBA').save(output, format='PNG')
            return output.getvalue()
    except (OSError, ValueError, Image.DecompressionBombError) as error:
        raise ValueError('The artwork image could not be prepared for delivery.') from error


def fulfill_payment(payment):
    agreement = payment.agreement
    if agreement and agreement.delivery_type == 'physical':
        info = agreement.delivery_details
        delivery_order, created = DeliveryOrder.objects.get_or_create(payment=payment, defaults={
            'pickup_address': info['pickup_address'],
            'delivery_address': info['delivery_address'] if info.get('address_source') == 'profiles' else f"{info['delivery_address']}, {info['destination_city']}",
            'fee': agreement.delivery_fee,
        })

        if created:
            ActivityLog.objects.create(user=payment.buyer, action='delivery_requested', description=f'Delivery requested for {payment.artwork.title}.', reference_type='delivery_order', reference_id=delivery_order.id)

    UserNotification.objects.create(user=payment.buyer, artwork=payment.artwork,
        title='Test purchase ready - no money charged' if payment.is_simulated else 'Purchase ready', message=(
            f"Payment confirmed for {payment.artwork.title}. Track delivery in My Purchases."
            if agreement and agreement.delivery_type == 'physical' else
            f"Payment confirmed for {payment.artwork.title}. Your PNG is ready in My Purchases. You can now rate the artist and artwork."
        ))
    UserNotification.objects.create(user=payment.artist, artwork=payment.artwork,
        title='Test sale - no money charged' if payment.is_simulated else 'Artwork sold', message=(
            f"Payment confirmed for {payment.artwork.title}. Prepare the artwork for pickup at the address in your agreement."
            if agreement and agreement.delivery_type == 'physical' else
            f"Payment confirmed for {payment.artwork.title}. The buyer can now download the PNG."
        ))
