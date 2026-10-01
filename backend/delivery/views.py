import math
from decimal import Decimal
from django.shortcuts import render
from django.contrib.auth import get_user_model
from django.core import signing
from rest_framework.decorators import api_view, permission_classes
from rest_framework.views import APIView
from rest_framework.response import Response
from rest_framework import status, permissions
from .models import Order, RiderProfile
from .serializers import OrderSerializer, RiderProfileSerializer
from artworks.models import Artwork
from rest_framework.parsers import MultiPartParser, FormParser

CEBU_COORDINATES = {
    'cebu city': (10.3157, 123.8854),
    'mandaue': (10.3333, 123.9333),
    'lapu-lapu': (10.3111, 123.9494),
    'talisay': (10.2447, 123.8494),
    'lahug': (10.3382, 123.8967),
    'banilad': (10.3400, 123.9100),
    'consolacion': (10.3778, 123.9575),
}

try:
    from fulfillment.routing import SALT
except ImportError:
    SALT = 'fulfillment.delivery.quote'

User = get_user_model()


def format_address_str(addr):
    """Safely converts an Address model instance or dict to a plain string for JSON serialization."""
    if not addr:
        return ""
    if isinstance(addr, str):
        return addr
    fields = ('street', 'barangay', 'city', 'province', 'region', 'postal_code')
    parts = [str(getattr(addr, f, '')).strip() for f in fields if getattr(addr, f, None)]
    return ", ".join(parts) if parts else str(addr)


def calculate_haversine_km(lat1, lon1, lat2, lon2):
    """Calculates ground distance between two points in km."""
    R = 6371.0
    dlat = math.radians(lat2 - lat1)
    dlon = math.radians(lon2 - lon1)
    a = (math.sin(dlat / 2) ** 2 +
         math.cos(math.radians(lat1)) * math.cos(math.radians(lat2)) * math.sin(dlon / 2) ** 2)
    c = 2 * math.atan2(math.sqrt(a), math.sqrt(1 - a))
    return round(R * c * 1.3, 1)


def estimate_distance_from_addresses(origin_str, dest_str):
    origin = (origin_str or '').lower()
    dest = (dest_str or '').lower()

    c1 = (10.3157, 123.8854)
    for name, coords in CEBU_COORDINATES.items():
        if name in origin:
            c1 = coords
            break

    c2 = (10.3333, 123.9333)
    for name, coords in CEBU_COORDINATES.items():
        if name in dest:
            c2 = coords
            break

    return max(1.5, calculate_haversine_km(c1[0], c1[1], c2[0], c2[1]))


@api_view(['POST'])
@permission_classes([permissions.AllowAny])
def get_delivery_quote(request):
    artwork_id = request.data.get('artwork_id')
    delivery_address = str(request.data.get('delivery_address') or 'Cebu City, Philippines')
    artist_address = str(request.data.get('artist_address') or 'Cebu City Art Studio')
    is_priority = bool(request.data.get('is_priority', False))

    if 'cebu' not in delivery_address.lower():
        return Response(
            {"error": "Physical delivery is currently exclusive to addresses in Cebu."},
            status=status.HTTP_400_BAD_REQUEST
        )

    if request.data.get('distance_km'):
        distance_km = float(request.data.get('distance_km'))
    else:
        distance_km = estimate_distance_from_addresses(artist_address, delivery_address)

    base_fare = 50.00
    base_km = 2.0
    distance_fee = max(0.0, distance_km - base_km) * 15.00
    priority_fee = 40.00 if is_priority else 0.00
    total_fee = round(base_fare + distance_fee + priority_fee, 2)

    artwork = Artwork.objects.filter(pk=artwork_id).first() if artwork_id else None
    actor = request.user if request.user and request.user.is_authenticated else User.objects.first()
    buyer = actor

    artwork_pk = artwork.pk if artwork else int(artwork_id or 1)
    buyer_pk = buyer.pk if buyer else 1
    actor_pk = actor.pk if actor else 1
    revision_pk = request.data.get('revision_id') or None

    raw_pickup = getattr(artwork.artist, 'address', artist_address) if artwork and hasattr(artwork, 'artist') else artist_address
    pickup_addr_str = format_address_str(raw_pickup) or str(artist_address)
    delivery_addr_str = format_address_str(delivery_address)

    # Ensure all values in quote_payload are standard JSON-serializable primitives
    quote_payload = {
        'artwork': artwork_pk,
        'buyer': buyer_pk,
        'actor': actor_pk,
        'revision': revision_pk,
        'details': {
            'fee': str(total_fee),
            'distance_km': float(distance_km),
            'is_priority': is_priority,
            'pickup_address_id': 1,
            'delivery_address_id': 1,
            'pickup_address': str(pickup_addr_str),
            'delivery_address': str(delivery_addr_str),
            'pickup_coordinates': (10.3157, 123.8854),
            'delivery_coordinates': (10.3333, 123.9333),
        }
    }

    signed_token = signing.dumps(quote_payload, salt=SALT)

    return Response({
        "token": signed_token,
        "delivery_address": delivery_addr_str,
        "distance_km": distance_km,
        "fee": total_fee,
        "base_fee": round(base_fare + distance_fee, 2),
        "priority_fee": priority_fee,
        "is_priority": is_priority,
        "estimated_time": f"{int(distance_km * 3 + 10)} mins",
    }, status=status.HTTP_200_OK)


@api_view(['GET'])
@permission_classes([permissions.AllowAny])
def get_pending_orders(request):
    """ Fetch pending order requests for riders """
    orders = Order.objects.filter(status='PENDING').order_by('-created_at')
    data = []
    for o in orders:
        raw_buyer = getattr(o, 'buyer_name', None) or getattr(o, 'buyerId', str(o.id))
        buyer_label = raw_buyer if str(raw_buyer).startswith("Customer #") else f"Customer #{raw_buyer}"

        try:
            km_val = float(''.join(c for c in str(o.distance) if c.isdigit() or c == '.'))
            fee_val = round(50.0 + max(0.0, km_val - 2.0) * 15.0, 2)
        except Exception:
            fee_val = 129.50

        data.append({
            "id": str(o.id),
            "buyerId": buyer_label,
            "customer_name": buyer_label,
            "artwork_title": getattr(o, 'item_name', 'Physical Artwork Piece'),
            "address": o.address,
            "formatted_address": o.address,
            "itemsCount": o.items_count,
            "items_count": o.items_count,
            "distance": o.distance,
            "estimatedTime": o.estimatedTime,
            "paymentMethod": o.paymentMethod,
            "delivery_fee": fee_val,
        })
    return Response(data, status=status.HTTP_200_OK)


@api_view(['POST'])
@permission_classes([permissions.AllowAny])
def accept_order(request, order_id):
    """ Accept order request without strict PENDING constraint """
    try:
        order = Order.objects.get(id=order_id)
        
        if order.status == 'ACCEPTED':
            return Response({
                'message': 'Order is already accepted.',
                'order_id': order.id,
                'status': order.status
            }, status=status.HTTP_200_OK)

        order.status = 'ACCEPTED'
        
        rider = RiderProfile.objects.first()
        if rider:
            order.assigned_rider = rider
            
        order.save()
        return Response({
            'message': 'Order accepted successfully!',
            'order_id': order.id,
            'status': order.status
        }, status=status.HTTP_200_OK)

    except Order.DoesNotExist:
        return Response({
            'error': f'Order #{order_id} does not exist in the database.'
        }, status=status.HTTP_404_NOT_FOUND)


def serialize_active_order(order):
    """ Helper that matches ActiveDelivery interface dynamically with live DB records """
    rider = order.assigned_rider or RiderProfile.objects.first()

    return {
        "id": order.id,
        "paymentMethod": order.paymentMethod,
        "step": order.status,
        "fee": str(order.delivery_fee),
        "rider_location": {
            "latitude": rider.current_latitude if rider and rider.current_latitude else 10.3157,
            "longitude": rider.current_longitude if rider and rider.current_longitude else 123.8854,
        },
        "artist": {
            "name": order.artist_name or (order.payment.artist.username if order.payment and order.payment.artist else "Artist"),
            "phone": order.artist_phone or "No phone on file",
            "address": order.pickup_address or "Artist Studio Address",
            "latitude": float(order.pickup_latitude),
            "longitude": float(order.pickup_longitude),
        },
        "buyer": {
            "name": order.buyer_name or (order.payment.buyer.username if order.payment and order.payment.buyer else f"Customer #{order.buyerId}"),
            "phone": order.buyer_phone or "No phone on file",
            "address": order.address,
            "instructions": "Please handle the artwork with care.",
            "latitude": float(order.delivery_latitude),
            "longitude": float(order.delivery_longitude),
        },
        "items": [
            {
                "name": order.item_name,
                "quantity": order.items_count or 1
            }
        ],
        "has_pickup_proof": bool(order.pickup_proof),
        "has_delivery_proof": bool(order.delivery_proof),
        "artistPhotoUri": order.pickup_proof or None,
        "buyerPhotoUri": order.delivery_proof or None,
    }


@api_view(['GET'])
@permission_classes([permissions.AllowAny])
def get_order_by_id(request, order_id):
    try:
        order = Order.objects.get(id=order_id)
        return Response(serialize_active_order(order), status=status.HTTP_200_OK)
    except Order.DoesNotExist:
        return Response({'error': 'Order not found'}, status=status.HTTP_404_NOT_FOUND)


@api_view(['GET'])
@permission_classes([permissions.AllowAny])
def get_active_delivery(request):
    active_statuses = [
        'ACCEPTED',
        'ARRIVED_AT_ARTIST',
        'PICKED_UP',
        'IN_TRANSIT',
        'ARRIVED_AT_BUYER'
    ]
    order = Order.objects.filter(status__in=active_statuses).order_by('-id').first()
    if not order:
        return Response(None, status=status.HTTP_200_OK)

    return Response(serialize_active_order(order), status=status.HTTP_200_OK)


@api_view(['POST'])
@permission_classes([permissions.AllowAny])
def update_order_status(request, order_id):
    """ Update order status safely and return serialized order """
    try:
        order = Order.objects.get(id=order_id)
    except Order.DoesNotExist:
        return Response(
            {'error': f'Order #{order_id} not found in database'}, 
            status=status.HTTP_404_NOT_FOUND
        )

    new_status = request.data.get('status')
    if not new_status:
        return Response(
            {'error': 'No status provided in request body.'}, 
            status=status.HTTP_400_BAD_REQUEST
        )

    order.status = str(new_status).strip()
    order.save()

    try:
        data = serialize_active_order(order)
        return Response(data, status=status.HTTP_200_OK)
    except Exception:
        return Response({
            'message': f'Status updated to {order.status}',
            'id': order.id,
            'status': order.status
        }, status=status.HTTP_200_OK)


@api_view(['POST'])
@permission_classes([permissions.AllowAny])
def update_rider_location(request):
    rider = RiderProfile.objects.first()
    if rider:
        rider.current_latitude = float(request.data.get('latitude', 10.3157))
        rider.current_longitude = float(request.data.get('longitude', 123.8854))
        rider.save()
    return Response({'message': 'Location updated'}, status=status.HTTP_200_OK)


class RiderDeliveryHistoryView(APIView):
    permission_classes = [permissions.AllowAny]

    def get(self, request):
        queryset = Order.objects.filter(status__in=['DELIVERED', 'COMPLETED']).order_by('-id')
        data = []
        for o in queryset:
            data.append({
                "id": o.id,
                "artwork_title": getattr(o, 'item_name', f"Artwork #{o.id}"),
                "customer_name": getattr(o, 'buyer_name', f"Customer #{o.buyerId}"),
                "address": o.address,
                "delivered_at": o.created_at.isoformat() if hasattr(o, 'created_at') and o.created_at else None,
                "fee": "129.50",
            })
        return Response(data, status=status.HTTP_200_OK)


class RiderProfileView(APIView):
    permission_classes = [permissions.AllowAny]

    def get(self, request):
        completed_count = Order.objects.filter(status__in=['DELIVERED', 'COMPLETED']).count()
        return Response({
            "fullName": "ArtFiliere Express Rider",
            "email": "rider@artfiliere.ph",
            "is_clocked_in": True,
            "total_delivery": completed_count,
            "date_registered": "2026-01-01",
            "vehicle": {
                "type": "Motorcycle",
                "model": "Honda XRM 125",
                "plate_number": "ABC-1234",
                "color": "Red",
                "orcr_docs": "orcr_verified.pdf"
            },
            "license": {
                "license_number": "N01-26-891024",
                "expiry_date": "2028-11-30",
                "document_url": "driver_license.pdf",
                "status": "Valid"
            }
        }, status=status.HTTP_200_OK)


class OrderProofUploadView(APIView):
    parser_classes = [MultiPartParser, FormParser]
    permission_classes = [permissions.AllowAny]

    def post(self, request, order_id):
        try:
            order = Order.objects.get(id=order_id)
        except Order.DoesNotExist:
            return Response({"error": "Order not found"}, status=status.HTTP_404_NOT_FOUND)

        photo = request.FILES.get('photo') or request.FILES.get('image')

        if photo:
            if hasattr(order, 'proof_image'):
                order.proof_image = photo
                order.save()
            return Response({"message": "Proof uploaded successfully"}, status=status.HTTP_200_OK)

        return Response({"error": "No photo provided"}, status=status.HTTP_400_BAD_REQUEST)


def create_delivery_and_notify_driver_order(
    payment,
    buyer_id, 
    address, 
    payment_method='PAYPAL', 
    artwork_title='Artwork Asset', 
    price=0.0, 
    is_physical=True, 
    is_priority=False, 
    distance_km=5.0,
    delivery_coords=None,
    pickup_coords=None
):
    if not is_physical:
        return None

    if 'cebu' not in str(address).lower():
        return None

    agreement = getattr(payment, 'agreement', None)
    artwork = getattr(payment, 'artwork', None)
    artist = getattr(payment, 'artist', getattr(artwork, 'artist', None)) if (payment or artwork) else None
    buyer = getattr(payment, 'buyer', None)

    # 1. Dynamic Artist Data
    a_name = ''
    if artist:
        a_name = f"{getattr(artist, 'first_name', '')} {getattr(artist, 'last_name', '')}".strip() or artist.username
    a_phone = ''
    if artist:
        a_prof = getattr(artist, 'profile', None)
        a_phone = getattr(a_prof, 'phone_number', '') or getattr(artist, 'phone', '')

    pickup_str = ''
    if artist:
        a_addr = getattr(artist, 'address', None)
        pickup_str = format_address_str(a_addr) if a_addr else ''
    if not pickup_str and agreement and hasattr(agreement, 'delivery_details'):
        pickup_str = str(agreement.delivery_details.get('pickup_address', ''))

    # 2. Dynamic Buyer Data
    b_name = ''
    if buyer:
        b_name = f"{getattr(buyer, 'first_name', '')} {getattr(buyer, 'last_name', '')}".strip() or buyer.username
    b_phone = ''
    if buyer:
        b_prof = getattr(buyer, 'profile', None)
        b_phone = getattr(b_prof, 'phone_number', '') or getattr(buyer, 'phone', '')

    # 3. Coordinates
    p_lat = pickup_coords[0] if pickup_coords else 10.3157
    p_lng = pickup_coords[1] if pickup_coords else 123.8854
    d_lat = delivery_coords[0] if delivery_coords else 10.3333
    d_lng = delivery_coords[1] if delivery_coords else 123.9333

    base_fare = 50.00
    base_km = 2.0
    dist_fee = max(0.0, float(distance_km) - base_km) * 15.00
    prio_fee = 40.00 if is_priority else 0.00
    total_fee = round(base_fare + dist_fee + prio_fee, 2)

    order = Order.objects.create(
        payment=payment,
        buyerId=str(buyer_id),
        buyer_name=b_name or f"Customer #{buyer_id}",
        buyer_phone=b_phone,
        address=address,
        delivery_latitude=d_lat,
        delivery_longitude=d_lng,
        artist_name=a_name or 'Artist',
        artist_phone=a_phone,
        pickup_address=pickup_str or 'Artist Studio',
        pickup_latitude=p_lat,
        pickup_longitude=p_lng,
        item_name=artwork_title,
        items_count=1,
        distance=f"{distance_km:.1f} km",
        estimatedTime=f"{int(distance_km * 3 + 10)} mins",
        delivery_fee=total_fee,
        is_priority=is_priority,
        paymentMethod=payment_method,
        status='PENDING'
    )
    return order