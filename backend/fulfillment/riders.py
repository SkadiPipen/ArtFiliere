import base64
import math
from datetime import timedelta
from zoneinfo import ZoneInfo
from io import BytesIO
from PIL import Image, ImageOps
from django.db import transaction
from django.http import JsonResponse
from django.db.models import Q
from django.utils import timezone
from rest_framework.response import Response
from authentication.permissions import IsAuthenticatedUser
from authentication.views import AuthenticatedAPIView
from users.models import User
from .models import DeliveryOrder, RiderProfile

NEXT = {'pending': 'accepted', 'accepted': 'arrived_at_artist', 'arrived_at_artist': 'picked_up',
        'picked_up': 'in_transit', 'in_transit': 'arrived_at_buyer', 'arrived_at_buyer': 'delivered'}


def expire_stale_shift(profile):
    # A forgotten shift must not resume for several days on the next login.
    now = timezone.now()
    if profile.is_clocked_in and (not profile.clock_in_time or now - profile.clock_in_time >= timedelta(hours=24)):
        ended = profile.clock_in_time + timedelta(hours=24) if profile.clock_in_time else now
        RiderProfile.objects.filter(pk=profile.pk, is_clocked_in=True, clock_in_time=profile.clock_in_time).update(is_clocked_in=False, clock_out_time=ended)
        profile.refresh_from_db()
    return profile


def orders():
    return DeliveryOrder.objects.filter(Q(payment__status='paid') | Q(commission__flow_version=2, commission__funded_at__isnull=False)).select_related('payment__artwork', 'payment__agreement', 'payment__buyer', 'payment__artist', 'driver', 'commission__buyer', 'commission__artist')


def serialize(order, detail=False):
    p, c = order.payment, order.commission
    quote = order.route_details or (c.locked_terms.get('delivery_details', {}) if c else p.agreement.delivery_details if p.agreement else {})
    from commissions.shipping import verified_locations
    quote = verified_locations(order)
    buyer, artist = (c.buyer, c.artist) if c else (p.buyer, p.artist)
    title = c.title if c else p.artwork.title
    instructions = ' - '.join(filter(None, [quote.get('delivery_floor_unit'), quote.get('delivery_instruction')]))
    pickup_point = quote.get('pickup_coordinates') or []
    delivery_point = quote.get('delivery_coordinates') or []
    result = {'id': order.id, 'buyerId': buyer.username, 'customer_name': buyer.username,
              'address': order.delivery_address, 'formatted_address': order.delivery_address, 'pickupAddress': order.pickup_address,
              'itemsCount': 1, 'items_count': 1, 'paymentMethod': 'Paid online',
              'distance': f"{quote['distance_km']} km" if quote.get('distance_km') is not None else 'Not recorded',
              'estimatedTime': 'Not available', 'status': order.status.upper(), 'step': order.status.upper(),
              'fee': str(order.fee), 'delivery_fee': str(order.fee), 'artwork_title': title,
              'created_at': order.created_at.isoformat(), 'delivered_at': order.delivered_at,
              'location_errors': quote.get('location_errors', {}),
              'timeline': order.timeline, 'commission_id': c.pk if c else None, 'payment_id': order.payment_id,
              'artist': {'name': artist.username, 'phone': artist.contact_number, 'address': order.pickup_address,
                         'latitude': pickup_point[1] if len(pickup_point) == 2 else None, 'longitude': pickup_point[0] if len(pickup_point) == 2 else None},
              'buyer': {'name': buyer.username, 'phone': buyer.contact_number, 'address': order.delivery_address, 'instructions': instructions,
                        'latitude': delivery_point[1] if len(delivery_point) == 2 else None, 'longitude': delivery_point[0] if len(delivery_point) == 2 else None},
              'items': [{'name': title, 'quantity': 1}],
              'has_pickup_proof': bool(order.pickup_proof), 'has_delivery_proof': bool(order.delivery_proof)}
    if c:
        from commissions.shipping import tracking_reference
        result['tracking_reference'] = tracking_reference(order)
    if detail:
        result.update(artistPhotoUri=order.pickup_proof or None, buyerPhotoUri=order.delivery_proof or None)
    return result


class RiderView(AuthenticatedAPIView):
    permission_classes = [IsAuthenticatedUser]
    def initial(self, request, *args, **kwargs):
        super().initial(request, *args, **kwargs)
        if self.get_request_user(request).role not in ('driver', 'rider'):
            from rest_framework.exceptions import PermissionDenied
            raise PermissionDenied('Driver access required.')
        if request.method not in ('GET', 'HEAD', 'OPTIONS'):
            from authentication.services import account_access
            access = account_access(self.get_request_user(request))
            if access['banned'] or access['suspended']:
                from rest_framework.exceptions import PermissionDenied
                raise PermissionDenied('Restricted driver accounts cannot accept or update deliveries.')


class RiderOrdersView(RiderView):
    def get(self, request, scope='pending', order_id=None):
        user = self.get_request_user(request)
        if order_id is not None:
            order = orders().filter(pk=order_id, driver=user).first()
            return Response(serialize(order, True)) if order else Response({'error': 'Delivery not found.'}, status=404)
        rows = orders()
        if scope == 'pending':
            rows = rows.filter(driver=None, status='pending').exclude(commission__disputed=True)
        elif scope == 'history':
            rows = rows.filter(driver=user, status='delivered')
        else:
            rows = rows.filter(driver=user).exclude(status__in=['pending', 'delivered'])
            if scope == 'active':
                order = rows.order_by('id').first()
                return Response(serialize(order, True)) if order else JsonResponse(None, safe=False)
        return Response([serialize(row) for row in rows.order_by('-id')])

    @transaction.atomic
    def post(self, request, order_id, action='status'):
        # Lock rider before order, serializing simultaneous acceptance requests.
        user = User.objects.select_for_update().get(pk=self.get_request_user(request).pk)
        order = orders().select_for_update(of=('self',)).filter(pk=order_id).first()
        if not order or (order.driver_id and order.driver_id != user.id):
            return Response({'error': 'Delivery not found.'}, status=404)
        if order.commission_id and (order.commission.disputed or order.commission.status not in ('STAGE_3', 'COMPLETE')):
            return Response({'error': 'This commission delivery is on hold. Contact Customer Service.'}, status=409)
        target = 'accepted' if action == 'accept' else str(request.data.get('status', '')).lower()
        if NEXT.get(order.status) != target:
            return Response({'error': 'Invalid delivery transition. Refresh the order.'}, status=409)
        if target == 'accepted':
            profile, _ = RiderProfile.objects.get_or_create(user=user)
            expire_stale_shift(profile)
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
        if order.commission_id:
            from commissions.shipping import notify_delivery_update
            notify_delivery_update(order)
        return Response(serialize(order, True))


class RiderProofView(RiderView):
    @transaction.atomic
    def post(self, request, order_id):
        order = orders().select_for_update(of=('self',)).filter(pk=order_id, driver=self.get_request_user(request)).first()
        if not order:
            return Response({'error': 'Delivery not found.'}, status=404)
        if order.commission_id and order.commission.disputed:
            return Response({'error': 'This delivery is on hold for Customer Service review.'}, status=409)
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
        expire_stale_shift(profile)
        day_start = timezone.now().astimezone(ZoneInfo('Asia/Manila')).replace(hour=0, minute=0, second=0, microsecond=0)
        return Response({'fullName': ' '.join(filter(None, [user.first_name, user.middle_name, user.last_name])) or user.username,
                         'username': user.username, 'email': user.email, 'phoneNum': user.contact_number,
                         'is_clocked_in': profile.is_clocked_in, 'clock_in_time': profile.clock_in_time,
                         'clock_out_time': profile.clock_out_time, 'latitude': profile.latitude, 'longitude': profile.longitude,
                         'location_updated_at': profile.location_updated_at,
                         'today_deliveries': orders().filter(driver=user, status='delivered', delivered_at__gte=day_start, delivered_at__lt=day_start + timedelta(days=1)).count(),
                         'active_tasks': orders().filter(driver=user).exclude(status__in=['pending', 'delivered']).count(),
                         'total_delivery': orders().filter(driver=user, status='delivered').count()})

    @transaction.atomic
    def post(self, request):
        user = User.objects.select_for_update().get(pk=self.get_request_user(request).pk)
        profile, _ = RiderProfile.objects.get_or_create(user=user)
        expire_stale_shift(profile)
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
        expire_stale_shift(profile)
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


class RiderResolveLocationView(RiderView):
    def post(self, request, order_id):
        order = orders().filter(pk=order_id, driver=self.get_request_user(request)).first()
        if not order:
            return Response({'error': 'Delivery not found.'}, status=404)
        side = request.data.get('side', 'pickup')
        if side not in ('pickup', 'delivery'):
            return Response({'error': 'Choose pickup or delivery.'}, status=400)
        from commissions.shipping import verified_locations
        from .routing import geocode_address
        details = dict(verified_locations(order))
        errors = dict(details.get('location_errors') or {})
        if not details.get(f'{side}_coordinates'):
            try:
                details[f'{side}_coordinates'] = geocode_address(getattr(order, f'{side}_address'))
                errors.pop(side, None)
            except ValueError as error:
                errors[side] = str(error)
            details['location_errors'] = errors
            # Update location metadata only; signed addresses and delivery fees stay locked.
            order.route_details = details
            order.save(update_fields=['route_details'])
        return Response(serialize(order, True))
