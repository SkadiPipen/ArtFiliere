import base64
from decimal import Decimal
from io import BytesIO
from PIL import Image, ImageOps
from notifications.models import UserNotification
from users.models import ActivityLog
from .models import DeliveryOrder, DeliveryRoute
from delivery.views import create_delivery_and_notify_driver_order


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
    # Safely resolve agreement and artwork
    agreement = getattr(payment, 'agreement', None)
    artwork = getattr(payment, 'artwork', None)
    artwork_title = getattr(artwork, 'title', 'Artwork') if artwork else 'Commission Asset'

    # Determine if physical or digital
    is_physical = False
    if agreement and getattr(agreement, 'delivery_type', '').lower() == 'physical':
        is_physical = True
    elif agreement and getattr(agreement, 'is_physical', False):
        is_physical = True
    elif artwork and 'physical' in str(getattr(artwork, 'art_type', '')).lower():
        is_physical = True

    # Physical Dispatch to Rider
    if is_physical:
        info = (agreement.delivery_details if agreement else {}) or {}
        
        # Resolve destination address safely
        buyer_addr = getattr(payment.buyer, 'address', None)
        if not buyer_addr and hasattr(payment.buyer, 'profile'):
            buyer_addr = getattr(payment.buyer.profile, 'address', None)
        
        dest_addr = info.get('delivery_address') or buyer_addr or 'Cebu City'
        dist_km = float(info.get('distance_km', 5.0))
        is_prio = bool(info.get('is_priority', False))

        create_delivery_and_notify_driver_order(
            payment=payment,
            buyer_id=payment.buyer.id,
            address=str(dest_addr),
            payment_method=str(getattr(payment, 'payment_method', 'PAYPAL')),
            artwork_title=artwork_title,
            price=float(getattr(payment, 'gross_amount', 0.0) or 0.0),
            is_physical=True,
            is_priority=is_prio,
            distance_km=dist_km,
            delivery_coords=info.get('delivery_coordinates'),
            pickup_coords=info.get('pickup_coordinates'),
        )
    else:
        # Digital Asset Access Grant (Unlock download)
        if artwork and hasattr(artwork, 'unlocked_by'):
            artwork.unlocked_by.add(payment.buyer)

    # User Notifications
    is_simulated = getattr(payment, 'is_simulated', False)

    # Buyer notification
    buyer_msg = (
        f"Payment confirmed for {artwork_title}. Track delivery in My Purchases."
        if is_physical else
        f"Payment confirmed for {artwork_title}. Your high-resolution file is ready in My Purchases. You can now rate the artist and artwork."
    )
    UserNotification.objects.create(
        user=payment.buyer,
        artwork=artwork,
        title='Test purchase ready - no money charged' if is_simulated else 'Purchase ready',
        message=buyer_msg
    )

    # Artist notification
    if getattr(payment, 'artist', None):
        artist_msg = (
            f"Payment confirmed for {artwork_title}. Prepare the artwork for courier pickup at the address in your agreement."
            if is_physical else
            f"Payment confirmed for {artwork_title}. The buyer can now download the digital file."
        )
        UserNotification.objects.create(
            user=payment.artist,
            artwork=artwork,
            title='Test sale - no money charged' if is_simulated else 'Artwork sold',
            message=artist_msg
        )