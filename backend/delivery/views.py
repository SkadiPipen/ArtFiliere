from django.shortcuts import render
from rest_framework.decorators import api_view
from rest_framework.views import APIView
from rest_framework.response import Response
from rest_framework import status
from .models import Order, RiderProfile
from .serializers import OrderSerializer, RiderProfileSerializer
from rest_framework.parsers import MultiPartParser, FormParser
from rest_framework.permissions import IsAuthenticated


# Create your views here.
@api_view(['GET'])
def get_pending_orders(requests):
    """ Fetch all pending order requests """
    orders = Order.objects.filter(status='PENDING').order_by('-created_at')
    serializer = OrderSerializer(orders, many=True)
    return Response(serializer.data)

@api_view(['POST'])
def accept_order(request, order_id):
    """ Accept order request """
    try:
        order = Order.objects.get(id=order_id, status='PENDING')
        order.status = 'ACCEPTED'
        # Pwede mag add rider logic ari, if naa
        order.save()
        return Response({'message': 'Order accepted successfully!', 'order_id': order_id}, status=status.HTTP_200_OK)
    except Order.DoesNotExist:
        return Response({'error': 'Order not found or already accepted.'}, status=status.HTTP_404_NOT_FOUND)

@api_view(['POST'])
def update_rider_location(request):
    """ Update rider GPS location """
    try:
        rider_id = request.data.get('rider_id')
        latitude = request.data.get('latitude')
        longitude = request.data.get('longitude')

        if latitude is None or longitude is None:
            return Response(
                {"error": "Latitude and longitude are required."},
                status=status.HTTP_400_BAD_REQUEST
            )

        # Handle nested lists/arrays
        if isinstance(latitude, list):
            latitude = latitude[0]
        if isinstance(longitude, list):
            longitude = longitude[0]

        lat_val = float(latitude)
        lng_val = float(longitude)

        # Fallback to first profile if rider is missing or invalid
        if rider_id:
            rider = RiderProfile.objects.filter(id=rider_id).first()
        else:
            rider = RiderProfile.objects.first()

        if not rider:
            rider = RiderProfile.objects.create(id=rider_id or 1)

        rider.current_latitude = lat_val
        rider.current_longitude = lng_val
        rider.save()

        return Response({'message': 'Location updated'}, status=status.HTTP_200_OK)

    except (ValueError, TypeError) as e:
        return Response({'error': f'Invalid coordinat numbers: {str(e)}'}, status=status.HTTP_400_BAD_REQUEST)
    except Exception as e:
        return Response({'error':str(e)}, status=status.HTTP_500_INTERNAL_SERVER_ERROR)
    
@api_view(['POST'])
def update_order_status(request, order_id):
    """ Update order status """
    try:
        order = Order.objects.get(id=order_id)
    except Order.DoesNotExist:
        return Response({'error': f'Order {order_id} not found in database'}, status=status.HTTP_404_NOT_FOUND)

    new_status = request.data.get('status')
    if not new_status:
        return Response(
            {'error': 'Invalid status provided.'}, 
            status=status.HTTP_400_BAD_REQUEST
        )

    order.status = new_status
    order.save()
        
    return Response({
        'message': 'Order status updated to {new_status}',
        'id': order.id,
        'status': order.status
    }, status.HTTP_200_OK )
    
@api_view(['GET'])
def get_active_delivery(request):
    """
    Fetches the recent orders handled by the rider.
    Statuses: ACCEPTED, ARRIVED_AT_FIRST, PICKED_UP, IN_TRANSIT, ARRIVED_AT_BUYER
    """
    active_statuses = [
        'ACCEPTED',
        'ARRIVED_AT_ARTIST',
        'PICKED_UP',
        'IN_TRANSIT',
        'ARRIVED_AT_BUYER'
    ]

    # Get order that is active
    order = Order.objects.filter(status__in=active_statuses).order_by('-id').first()

    if not order:
        return Response(None, status=status.HTTP_200_OK)

    # Retrieve artist name (purpose para di mag crash since ala pay connection sa main app)
    artist_id = getattr(order, 'artist_id', getattr(order, 'artistId', None))
    artist_name = getattr(order, 'artist_name', None) or (f"Artist #{artist_id}" if artist_id else "No Name")

    buyer_id = getattr(order, 'buyer_id', getattr(order, 'buyerId', getattr(order, 'id', 'Customer')))
    buyer_name = getattr(order, 'buyer_name', None) or f"Customer {buyer_id}"

    # Helper function to extract a clean float from scalar, list, or string
    def parse_coord(val, default):
        if val is None:
            return default
        if isinstance(val, list):
            val = val[0] if len(val) > 0 else default
        try:
            return float(val)
        except (ValueError, TypeError):
            return default

    data = {
        "id": order.id,
        "step": order.status,
        "paymentMethod": getattr(order, 'payment_method', 'COD'),
        "buyer": {
            "name": f"Buyer #{buyer_name}",
            "phone": getattr(order, 'buyer_phone', 'N/A'),
            "address": getattr(order, 'address', getattr(order, 'delivery_address', 'Customer Delivery Address')),
            "instructions": getattr(order, 'instructions', 'Handle with care.'),
            "latitude": float(getattr(order, 'buyer_lat', getattr(order, 'delivery_latitude', 10.3200))),
            "longitude": float(getattr(order, 'buyer_lng', getattr(order, 'delivery_longitude', 123.9000))),
        },
        "artist": {
            "name": str(artist_name),
            "phone": getattr(order, 'artist_phone', 'N/A'),
            "address": getattr(order, 'pickup_address', getattr(order, 'artist_address', 'N/A')),
            "latitude": float(getattr(order, 'artist_lat', getattr(order, 'pickup_latitude', 10.3157 ))),
            "longitude": float(getattr(order, 'artist_lng', getattr(order, 'pickup_longitude', 123.8854))),
        },
        "items": [
            {
                "name": getattr(order, 'item_name', "Artwork Item"), 
                "quantity": int(getattr(order,'item_count', getattr(order, 'itemCount', 1)))
            }
        ]
    }
    return Response(data, status=status.HTTP_200_OK)

class RiderDeliveryHistoryView(APIView):
    def get(self, request):
        queryset = Order.objects.filter(
            status__in=["DELIVERED", "COMPLETED", "delivered", "completed"]
        ).order_by('-id')

        data = []
        for order in queryset:
            payment = getattr(order, 'payment', None)
            artwork = getattr(payment, 'artwork', None) if payment else None

            order_total = float(getattr(payment, 'amount', 0) or getattr(artwork, 'price', 0) or 0.0)

            # Base fare 50 + 15 per km
            try:
                km_num = float(''.join(c for c in str(order.distance) if c.isdigit() or c == '.'))
                rider_fee = round(50.0 + (km_num * 15.0), 2)
            except Exception:
                rider_fee = 85.00

            order_date = None
            if hasattr(order, 'created_at') and order.created_at:
                order_date = order.created_at.isoformat()

            data.append({
                "id": order.id,
                "buyerId": order.buyerId,
                "customer_name": f"Buyer #{order.buyerId}",
                "address": order.address,
                "paymentMethod": order.paymentMethod,
                "distance": order.distance,
                "estimatedTime": order.estimatedTime,
                "items_count": order.items_count,
                "status": order.status,
                "order_total": order_total,
                "rider_earnings": rider_fee,
                "artworl_title": getattr(artwork, 'title', f"Artwork #{order.id}"),
            })

        return Response(data, status=status.HTTP_200_OK)

class OrderProofUploadView(APIView):
    parser_classes = [MultiPartParser, FormParser]

    def post(self, request, order_id):
        try:
            order = Order.objects.get(id=order_id)
        except Order.DoesNotExist:
            return Response({"error": "Order not found"}, status=status.HTTP_404_NOT_FOUND)

        photo = request.FILES.get('photo') or request.FILES.get('image')
        proof_type = request.data.get('type', 'delivery')  # 'pickup' or 'delivery'

        if photo:
            if hasattr(order, 'proof_image'):
                order.proof_image = photo
                order.save()
            return Response({"message": "Proof uploaded successfully"}, status=status.HTTP_200_OK)

        return Response({"error": "No photo provided"}, status=status.HTTP_400_BAD_REQUEST)


class RiderProfileView(APIView):
    def get(self, request):
        user = request.user
        
        if not user or not user.is_authenticated:
            from django.contrib.auth import get_user_model
            User = get_user_model()
            user = User.objects.filter(is_staff=True).first() or User.objects.first()

        if not user:
            return Response({"error": "No user found"}, status=status.HTTP_404_NOT_FOUND)

        completed_count = Order.objects.filter(
            status__in=["DELIVERED", "COMPLETED", "delivered", "completed"]
        ).count()

        profile = getattr(user, 'profile', None) or getattr(user, 'rider_profile', None)
        
        full_name = f"{user.first_name} {user.last_name}".strip() or user.username
        email = user.email or f"{user.username}@artfiliere.ph"
        phone = (
            getattr(profile, 'phone_number', None)
            or getattr(user, 'phone', None)
            or getattr(profile, 'phone', None)
            or "No phone provided"
        )
        address = (
            getattr(profile, 'address', None)
            or getattr(user, 'address', None)
            or "Cebu City, Philippines"
        )
        member_since = user.date_joined.strftime("%Y-%m-%d") if hasattr(user, 'date_joined') and user.date_joined else "2026-01-01"

        vehicle_type = getattr(profile, 'vehicle_type', 'Motorcycle')
        vehicle_model = getattr(profile, 'vehicle_model', 'Honda XRM 125')
        plate_number = getattr(profile, 'plate_number', 'ABC-1234')
        vehicle_color = getattr(profile, 'vehicle_color', 'Red')
        orcr_doc = getattr(profile, 'orcr_document', 'orcr_verified.pdf')

        license_number = getattr(profile, 'license_number', 'N01-26-891024')
        expiry_date = getattr(profile, 'license_expiry', '2028-11-30')
        license_doc = getattr(profile, 'license_document', 'driver_license.pdf')

        data = {
            "fullName": full_name,
            "email": email,
            "phoneNum": phone,
            "address": address,
            "rating": 4.9,
            "total_delivery": completed_count,
            "date_registered": member_since,
            "vehicle": {
                "type": vehicle_type,
                "model": vehicle_model,
                "plate_number": plate_number,
                "color": vehicle_color,
                "orcr_docs": str(orcr_doc).split('/')[-1]
            },
            "license": {
                "license_number": license_number,
                "expiry_date": expiry_date,
                "document_url": str(license_doc).split('/')[-1],
                "status": "Valid"
            }
        }

        return Response(data, status=status.HTTP_200_OK)