import base64
from django.db import transaction
from django.db.models import Q
from django.http import HttpResponse
from django.utils import timezone
from rest_framework.response import Response
from authentication.views import AuthenticatedAPIView
from authentication.permissions import IsAuthenticatedUser
from artworks.models import Artwork
from wallets.models import PaymentSession
from .models import DeliveryOrder, PurchaseReview
from .services import delivery_context, png_bytes
from messaging.models import Agreement


class DeliveryRoutesView(AuthenticatedAPIView):
    permission_classes = [IsAuthenticatedUser]
    def get(self, request, artwork_id):
        artwork = Artwork.objects.select_related('artist').filter(pk=artwork_id, status='approved').first()
        if not artwork:
            return Response({'error': 'Artwork not found.'}, status=404)
        buyer = self.get_request_user(request)
        agreement_id = request.query_params.get('agreement_id')
        if agreement_id:
            try:
                agreement = Agreement.objects.filter(pk=int(agreement_id), artwork=artwork).filter(Q(buyer=buyer) | Q(artist=buyer)).first()
            except (ValueError, TypeError):
                agreement = None
            if not agreement:
                return Response({'error': 'Agreement not found.'}, status=404)
            buyer = agreement.buyer
        if buyer.id == artwork.artist_id:
            return Response({'error': 'Choose a buyer negotiation to view delivery details.'}, status=400)
        try:
            return Response(delivery_context(artwork, buyer))
        except ValueError as error:
            return Response({'error': str(error)}, status=400)



def delivery_data(order):
    return {'id': order.id, 'status': order.status, 'status_label': order.get_status_display(),
            'pickup_address': order.pickup_address, 'delivery_address': order.delivery_address,
            'fee': str(order.fee), 'driver': order.driver.username if order.driver else None,
            'artwork': order.payment.artwork.title,
            'artist': {'name': order.payment.artist.username, 'phone': order.payment.artist.contact_number, 'address': order.pickup_address},
            'buyer': {'name': order.payment.buyer.username, 'phone': order.payment.buyer.contact_number, 'address': order.delivery_address}}


class PurchasesView(AuthenticatedAPIView):
    permission_classes = [IsAuthenticatedUser]
    def get(self, request):
        payments = PaymentSession.objects.filter(buyer=self.get_request_user(request)).select_related('artwork', 'artist', 'agreement', 'delivery_order__driver', 'review').order_by('-id')
        rows = []
        for p in payments:
            delivery = getattr(p, 'delivery_order', None)
            review = getattr(p, 'review', None)
            paid = p.status == 'paid'
            digital = p.agreement.delivery_type == 'digital' if p.agreement else p.artwork.art_type == 'digital'
            rows.append({'id': p.id, 'title': p.artwork.title, 'artist': p.artist.username,
                         'image': ('data:image/png;base64,' + base64.b64encode(bytes(p.artwork_png)).decode() if digital and p.artwork_png else p.artwork.image_data) if paid else None,
                         'is_simulated': p.is_simulated, 'status': p.status, 'amount': str(p.gross_amount), 'agreement_id': p.agreement_id,
                         'checkout_url': p.checkout_url if p.status == 'pending' else None,
                         'can_download': paid and digital, 'can_rate': paid and not review,
                         'delivery': delivery_data(delivery) if delivery else None,
                         'review': {'artist_rating': review.artist_rating, 'artwork_rating': review.artwork_rating, 'comment': review.comment, 'artist_comment': review.artist_comment, 'artwork_comment': review.artwork_comment} if review else None})
        return Response(rows)


class PurchaseDownloadView(AuthenticatedAPIView):
    permission_classes = [IsAuthenticatedUser]
    def get(self, request, payment_id):
        payment = PaymentSession.objects.select_related('artwork', 'agreement').filter(pk=payment_id, buyer=self.get_request_user(request), status='paid').first()
        if not payment:
            return Response({'error': 'Paid purchase not found.'}, status=404)
        if (payment.agreement and payment.agreement.delivery_type != 'digital') or (not payment.agreement and payment.artwork.art_type != 'digital'):
            return Response({'error': 'This artwork is delivered physically.'}, status=409)
        try:
            payload = bytes(payment.artwork_png) if payment.artwork_png else png_bytes(payment.artwork)
        except ValueError as error:
            return Response({'error': str(error)}, status=409)
        response = HttpResponse(payload, content_type='image/png')
        response['Content-Disposition'] = f'attachment; filename="artwork-{payment.artwork_id}.png"'
        response['Cache-Control'] = 'private, no-store'
        return response


class PurchaseReviewView(AuthenticatedAPIView):
    permission_classes = [IsAuthenticatedUser]
    @transaction.atomic
    def post(self, request, payment_id):
        payment = PaymentSession.objects.select_for_update().filter(pk=payment_id, buyer=self.get_request_user(request), status='paid').first()
        if not payment:
            return Response({'error': 'Paid purchase not found.'}, status=404)
        if PurchaseReview.objects.filter(payment=payment).exists():
            return Response({'error': 'You have already rated this purchase.'}, status=409)
        ratings = {key: request.data.get(key) for key in ('artist_rating', 'artwork_rating')}
        if any(type(v) is not int or not 1 <= v <= 5 for v in ratings.values()):
            return Response({'error': 'Rate both the artist and artwork from 1 to 5.'}, status=400)
        comment = request.data.get('comment', '')
        if not isinstance(comment, str) or len(comment) > 2000:
            return Response({'error': 'Comment must be at most 2,000 characters.'}, status=400)
        comments = {key: request.data.get(key, '') for key in ('artist_comment', 'artwork_comment')}
        if any(not isinstance(value, str) or len(value) > 2000 for value in comments.values()):
            return Response({'error': 'Each review must be at most 2,000 characters.'}, status=400)
        PurchaseReview.objects.create(payment=payment, comment=comment.strip(), **{key: value.strip() for key, value in comments.items()}, **ratings)
        return Response({'saved': True}, status=201)


from .riders import RiderOrdersView


class DriverOrdersView(RiderOrdersView):
    permission_classes = [IsAuthenticatedUser]
    def get(self, request):
        user = self.get_request_user(request)
        if user.role != 'driver':
            return Response({'error': 'Driver access required.'}, status=403)
        orders = DeliveryOrder.objects.filter(Q(driver=user) | Q(driver=None, status='pending'), payment__status='paid').select_related('payment__artwork', 'payment__artist', 'payment__buyer', 'driver').order_by('-id')
        return Response([delivery_data(order) for order in orders])

