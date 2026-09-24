from django.db import transaction
from rest_framework.response import Response
from authentication.views import AuthenticatedAPIView
from authentication.permissions import IsAuthenticatedUser
from artworks.models import Artwork
from .models import Cart, CartItem
from messaging.models import Agreement, Conversation
from wallets.models import PaymentSession


def payload(cart):
    return {"cart_id": cart.pk, "items": [{
        "id": str(item.pk), "artworkId": str(item.listing_id),
        "artistName": item.listing.artist.username, "title": item.listing.title,
        "price": str(item.listing.price), "type": item.listing.category.split(" \u00b7 ")[0],
        "image": item.listing.image_data, "quantity": item.quantity,
    } for item in cart.items.select_related("listing__artist").order_by("cart_item_id")]}


def quantity(data):
    value = data.get("quantity", 1)
    if isinstance(value, bool) or not isinstance(value, int) or not 1 <= value <= 999:
        return None
    return value

class CartView(AuthenticatedAPIView):
    permission_classes = [IsAuthenticatedUser]

    def get(self, request):
        cart, _ = Cart.objects.get_or_create(buyer=self.get_request_user(request))
        return Response(payload(cart))

    @transaction.atomic
    def post(self, request):
        user = self.get_request_user(request)
        qty = quantity(request.data)
        listing_id = str(request.data.get("listing_id", ""))
        if qty is None or not listing_id.isdecimal():
            return Response({"error": "Provide a valid listing and quantity (1-999)."}, status=400)
        artwork = Artwork.objects.filter(pk=listing_id, status=Artwork.Status.APPROVED).first()
        if not artwork or artwork.artist_id == user.id:
            return Response({"error": "This artwork is unavailable or belongs to you."}, status=400)
        cart, _ = Cart.objects.get_or_create(buyer=user)
        cart = Cart.objects.select_for_update().get(pk=cart.pk)
        item, created = CartItem.objects.get_or_create(cart=cart, listing=artwork, defaults={"quantity": qty})
        # Adding the same listing is idempotent; quantity has its own update endpoint.
        return Response(payload(cart), status=201 if created else 200)

class CartItemView(AuthenticatedAPIView):
    permission_classes = [IsAuthenticatedUser]

    def patch(self, request, item_id):
        qty = quantity(request.data)
        if qty is None:
            return Response({"error": "Quantity must be an integer from 1 to 999."}, status=400)
        item = CartItem.objects.filter(pk=item_id, cart__buyer=self.get_request_user(request)).first()
        if not item:
            return Response({"error": "Cart item not found."}, status=404)
        item.quantity = qty
        item.save(update_fields=["quantity"])
        return Response(payload(item.cart))

    @transaction.atomic
    def delete(self, request, item_id):
        item = CartItem.objects.filter(pk=item_id, cart__buyer=self.get_request_user(request)).first()
        if not item:
            return Response({"error": "Cart item not found."}, status=404)
        cart = item.cart
        Artwork.objects.select_for_update().get(pk=item.listing_id)
        agreements = list(Agreement.objects.select_for_update().filter(buyer=cart.buyer, artwork_id=item.listing_id))
        if PaymentSession.objects.filter(buyer=cart.buyer, artwork_id=item.listing_id, status=PaymentSession.Status.PENDING).exists():
            return Response({"error": "Checkout is already in progress. Finish or resolve that payment before removing this artwork."}, status=409)
        paid_ids = PaymentSession.objects.filter(agreement_id__in=[a.id for a in agreements], status=PaymentSession.Status.PAID).values_list('agreement_id', flat=True)
        cancelled = [a for a in agreements if a.id not in paid_ids and a.status in (Agreement.Status.PROPOSED, Agreement.Status.ACCEPTED)]
        Agreement.objects.filter(pk__in=[a.pk for a in cancelled]).update(status=Agreement.Status.CANCELLED)
        Conversation.objects.filter(pk__in=[a.conversation_id for a in cancelled]).update(status=Conversation.Status.CANCELLED)
        item.delete()
        return Response(payload(cart))
