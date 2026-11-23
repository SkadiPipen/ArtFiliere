"""Read-only tracking for the buyer of a paid physical delivery."""
from django.db.models import Q
from django.utils import timezone
from rest_framework.exceptions import NotFound
from rest_framework.response import Response
from authentication.permissions import IsAuthenticatedUser
from authentication.views import AuthenticatedAPIView
from .models import DeliveryOrder, RiderProfile
from commissions.shipping import verified_locations


class BuyerDeliveryTrackingView(AuthenticatedAPIView):
    permission_classes = [IsAuthenticatedUser]

    def get(self, request, order_id):
        buyer = self.get_request_user(request)
        order = DeliveryOrder.objects.filter(pk=order_id).filter(
            Q(payment__buyer=buyer, payment__status='paid') |
            Q(commission__buyer=buyer, commission__funded_at__isnull=False)
        ).select_related('driver').first()
        if not order:
            raise NotFound('Delivery not found.')
        locations = verified_locations(order)
        profile = RiderProfile.objects.filter(user_id=order.driver_id).first() if order.driver_id else None
        age = (timezone.now() - profile.location_updated_at).total_seconds() if profile and profile.location_updated_at else None
        live = bool(profile and profile.is_clocked_in and not order.driver.driver_deactivated
                    and order.status not in ('pending', 'delivered') and age is not None and 0 <= age <= 120
                    and profile.latitude is not None and profile.longitude is not None)
        data = {
            'id': order.pk, 'status': order.status, 'status_label': order.get_status_display(),
            'pickup_address': order.pickup_address, 'delivery_address': order.delivery_address,
            'pickup_coordinates': locations.get('pickup_coordinates'),
            'delivery_coordinates': locations.get('delivery_coordinates'),
            'location_notices': locations.get('location_notices', {}),
            'location_errors': locations.get('location_errors', {}),
            'timeline': order.timeline, 'delivered_at': order.delivered_at,
            'driver': {'name': ' '.join(filter(None, [order.driver.first_name, order.driver.last_name])) or order.driver.username,
                       'is_live': live, 'updated_at': profile.location_updated_at if profile else None,
                       'latitude': profile.latitude if live else None,
                       'longitude': profile.longitude if live else None} if order.driver else None,
        }
        response = Response(data)
        response['Cache-Control'] = 'private, no-store'
        return response
