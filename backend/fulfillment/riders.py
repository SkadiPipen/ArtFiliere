import base64
import math
from io import BytesIO
from PIL import Image, ImageOps
from django.db import transaction
from django.utils import timezone
from rest_framework.response import Response
from authentication.permissions import IsAuthenticatedUser
from authentication.views import AuthenticatedAPIView
from users.models import User
from .models import DeliveryOrder, RiderProfile

NEXT = {'pending': 'accepted', 'accepted': 'arrived_at_artist', 'arrived_at_artist': 'picked_up',
        'picked_up': 'in_transit', 'in_transit': 'arrived_at_buyer', 'arrived_at_buyer': 'delivered'}


def orders():
    return DeliveryOrder.objects.filter(payment__status='paid').select_related('payment__artwork', 'payment__agreement', 'payment__buyer', 'payment__artist', 'driver')


def serialize(order, detail=False):
    p = order.payment
    quote = p.agreement.delivery_details if p.agreement else {}
    result = {'id': order.id, 'buyerId': p.buyer.username, 'customer_name': p.buyer.username,
              'address': order.delivery_address, 'pickupAddress': order.pickup_address,
              'itemsCount': 1, 'items_count': 1, 'paymentMethod': 'Paid online',
              'distance': f"{quote['distance_km']} km" if quote.get('distance_km') else 'Not recorded',
              'estimatedTime': 'Not available', 'status': order.status.upper(), 'step': order.status.upper(),
              'fee': str(order.fee), 'artwork_title': p.artwork.title,
              'created_at': order.created_at.isoformat(), 'delivered_at': order.delivered_at,
              'timeline': order.timeline,
              'artist': {'name': p.artist.username, 'phone': p.artist.contact_number, 'address': order.pickup_address},
              'buyer': {'name': p.buyer.username, 'phone': p.buyer.contact_number, 'address': order.delivery_address, 'instructions': ''},
              'items': [{'name': p.artwork.title, 'quantity': 1}],
              'has_pickup_proof': bool(order.pickup_proof), 'has_delivery_proof': bool(order.delivery_proof)}
    if detail:
        result.update(artistPhotoUri=order.pickup_proof or None, buyerPhotoUri=order.delivery_proof or None)
    return result


class RiderView(AuthenticatedAPIView):
    permission_classes = [IsAuthenticatedUser]
    def initial(self, request, *args, **kwargs):
        super().initial(request, *args, **kwargs)
        if self.get_request_user(request).role != 'driver':
            from rest_framework.exceptions import PermissionDenied
            raise PermissionDenied('Driver access required.')


class RiderOrdersView(RiderView):
    def get(self, request, scope='pending', order_id=None):
        user = self.get_request_user(request)
        if order_id is not None:
            order = orders().filter(pk=order_id, driver=user).first()
            return Response(serialize(order, True)) if order else Response({'error': 'Delivery not found.'}, status=404)
        rows = orders()
        if scope == 'pending':
            rows = rows.filter(driver=None, status='pending')
        elif scope == 'history':
            rows = rows.filter(driver=user, status='delivered')
        else:
            rows = rows.filter(driver=user).exclude(status__in=['pending', 'delivered'])
            order = rows.order_by('id').first()
            return Response(serialize(order, True) if order else None)
        return Response([serialize(row) for row in rows.order_by('-id')])

    @transaction.atomic
    def post(self, request, order_id, action='status'):
        # Lock rider before order, serializing simultaneous acceptance requests.
        user = User.objects.select_for_update().get(pk=self.get_request_user(request).pk)
        order = orders().select_for_update(of=('self',)).filter(pk=order_id).first()
        if not order or (order.driver_id and order.driver_id != user.id):
            return Response({'error': 'Delivery not found.'}, status=404)
        target = 'accepted' if action == 'accept' else str(request.data.get('status', '')).lower()
        if NEXT.get(order.status) != target:
            return Response({'error': 'Invalid delivery transition. Refresh the order.'}, status=409)
        if target == 'accepted':
            profile, _ = RiderProfile.objects.get_or_create(user=user)
            if not profile.is_clocked_in:
                return Response({'error': 'Clock in before accepting a delivery.'}, status=409)
            if orders().filter(driver=user).exclude(status__in=['pending', 'delivered']).exists():
                return Response({'error': 'Complete your active delivery first.'}, status=409)
        if target == 'picked_up' and not order.pickup_proof:
            return Response({'error': 'Upload pickup proof first.'}, status=409)
        if target == 'delivered' and not order.delivery_proof:
            return Response({'error': 'Upload delivery proof first.'}, status=409)
        order.driver = user
        order.status = target
        order.timeline = {**order.timeline, target: timezone.now().isoformat()}
        if target == 'delivered':
            order.delivered_at = timezone.now()
        order.save()
        return Response(serialize(order, True))


class RiderProofView(RiderView):
    @transaction.atomic
    def post(self, request, order_id):
        order = orders().select_for_update(of=('self',)).filter(pk=order_id, driver=self.get_request_user(request)).first()
        if not order:
            return Response({'error': 'Delivery not found.'}, status=404)
        kind = request.data.get('proof_type')
        if (kind, order.status) not in [('PICKUP', 'arrived_at_artist'), ('DELIVERY', 'arrived_at_buyer')]:
            return Response({'error': 'Proof cannot be changed at this delivery step.'}, status=409)
        raw = request.data.get('image', '')
        try:
            if not isinstance(raw, str) or len(raw) > 7_000_000 or not raw.startswith('data:image/'):
                raise ValueError()
            content = base64.b64decode(raw.split(',', 1)[1], validate=True)
            with Image.open(BytesIO(content)) as source:
                if source.width * source.height > 20_000_000:
                    raise ValueError()
                image = ImageOps.exif_transpose(source).convert('RGB')
                image.thumbnail((1600, 1600))
                output = BytesIO(); image.save(output, 'JPEG', quality=85)
        except (ValueError, IndexError, OSError, Image.DecompressionBombError):
            return Response({'error': 'Upload a valid image up to 5 MB and 20 megapixels.'}, status=400)
        field = 'pickup_proof' if kind == 'PICKUP' else 'delivery_proof'
        setattr(order, field, 'data:image/jpeg;base64,' + base64.b64encode(output.getvalue()).decode())
        order.timeline = {**order.timeline, field: timezone.now().isoformat()}
        order.save(update_fields=[field, 'timeline'])
        return Response(serialize(order, True))


class RiderProfileView(RiderView):
    def get(self, request):
        user = self.get_request_user(request)
        profile, _ = RiderProfile.objects.get_or_create(user=user)
        return Response({'fullName': ' '.join(filter(None, [user.first_name, user.middle_name, user.last_name])) or user.username,
                         'username': user.username, 'email': user.email, 'phoneNum': user.contact_number,
                         'is_clocked_in': profile.is_clocked_in, 'clock_in_time': profile.clock_in_time,
                         'clock_out_time': profile.clock_out_time, 'latitude': profile.latitude, 'longitude': profile.longitude,
                         'location_updated_at': profile.location_updated_at,
                         'total_delivery': orders().filter(driver=user, status='delivered').count()})

    @transaction.atomic
    def post(self, request):
        user = User.objects.select_for_update().get(pk=self.get_request_user(request).pk)
        profile, _ = RiderProfile.objects.get_or_create(user=user)
        active = request.data.get('is_clocked_in')
        if type(active) is not bool:
            return Response({'error': 'Specify clock in or clock out.'}, status=400)
        if not active and orders().filter(driver=user).exclude(status__in=['pending', 'delivered']).exists():
            return Response({'error': 'Complete your active delivery before clocking out.'}, status=409)
        if active != profile.is_clocked_in:
            profile.is_clocked_in = active
            if active:
                profile.clock_in_time = timezone.now(); profile.clock_out_time = None
            else:
                profile.clock_out_time = timezone.now()
            profile.save()
        return self.get(request)


class RiderLocationView(RiderView):
    @transaction.atomic
    def post(self, request):
        user = User.objects.select_for_update().get(pk=self.get_request_user(request).pk)
        profile, _ = RiderProfile.objects.get_or_create(user=user)
        if not profile.is_clocked_in:
            return Response({'error': 'Clock in before sharing location.'}, status=409)
        try:
            lat, lng = float(request.data['latitude']), float(request.data['longitude'])
            if not math.isfinite(lat) or not math.isfinite(lng) or not -90 <= lat <= 90 or not -180 <= lng <= 180:
                raise ValueError()
        except (KeyError, TypeError, ValueError):
            return Response({'error': 'Invalid coordinates.'}, status=400)
        profile.latitude, profile.longitude, profile.location_updated_at = lat, lng, timezone.now()
        profile.save(update_fields=['latitude', 'longitude', 'location_updated_at'])
        return Response({'saved': True})
