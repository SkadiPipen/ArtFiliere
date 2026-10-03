"""Delivery selected at checkout, independently of the fixed auction agreement."""
from decimal import Decimal, ROUND_HALF_UP
from django.core import signing
from rest_framework.response import Response
from authentication.views import AuthenticatedAPIView
from messaging.models import Agreement
from fulfillment.services import full_address

SALT = 'auction-checkout-delivery-v1'
AUCTION_MESSAGE = 'Auction terms were accepted at bid time. Only delivery details may be discussed.'


def auction_agreement(agreement):
    return agreement.conversation.messages.filter(agreement=agreement, sender__isnull=True,
        body=AUCTION_MESSAGE).exists()


def checkout_context(agreement):
    buyer = agreement.buyer
    try:
        address = full_address(buyer)
    except ValueError:
        address = ''
    details = agreement.delivery_details or {}
    return {'is_auction': auction_agreement(agreement), 'delivery_type': agreement.delivery_type,
            'price': str(agreement.price), 'recipient_name': details.get('recipient_name') or
            f'{buyer.first_name} {buyer.last_name}'.strip() or buyer.username,
            'phone': details.get('recipient_phone') or buyer.contact_number,
            'delivery_address': details.get('delivery_address') or address,
            'notes': details.get('delivery_notes', '')}


def checked_delivery(agreement, data):
    details = {}
    for field, limit in [('recipient_name', 150), ('recipient_phone', 20), ('delivery_address', 255)]:
        value = data.get(field)
        if not isinstance(value, str) or not value.strip() or len(value.strip()) > limit:
            raise ValueError(f'Enter a valid {field.replace("_", " ")}.')
        details[field] = value.strip()
    if len(''.join(c for c in details['recipient_phone'] if c.isdigit())) < 7:
        raise ValueError('Enter a valid recipient phone number.')
    notes = data.get('delivery_notes', '')
    if not isinstance(notes, str) or len(notes) > 1000:
        raise ValueError('Delivery notes must be at most 1,000 characters.')
    details['delivery_notes'] = notes.strip()
    # The current local rider service supports Cebu deliveries only.
    if 'cebu' not in details['delivery_address'].lower():
        raise ValueError('Delivery is currently available within Cebu. Include Cebu in the address.')
    details['pickup_address'] = full_address(agreement.artist)
    if 'cebu' not in details['pickup_address'].lower():
        raise ValueError('The artist pickup address is outside the current Cebu delivery area.')
    from delivery.views import estimate_distance_from_addresses
    distance = Decimal(str(estimate_distance_from_addresses(details['pickup_address'], details['delivery_address'])))
    fee = (Decimal('50') + max(Decimal('0'), distance - 2) * 15).quantize(Decimal('.01'), rounding=ROUND_HALF_UP)
    details.update(distance_km=str(distance), fee=str(fee), is_priority=False,
                   distance_source='local_delivery_estimate')
    return details, fee


def verify_delivery(agreement, token):
    try:
        quote = signing.loads(token, salt=SALT, max_age=900)
        if quote['agreement'] != agreement.pk or quote['buyer'] != agreement.buyer_id or quote['price'] != str(agreement.price):
            raise ValueError('This delivery quote belongs to another checkout.')
        return quote['details'], Decimal(quote['details']['fee'])
    except (signing.BadSignature, KeyError, TypeError, ValueError):
        raise ValueError('Calculate delivery again; the quote is invalid or expired.')


class AuctionDeliveryQuoteView(AuthenticatedAPIView):
    def post(self, request, agreement_id):
        buyer = self.get_request_user(request)
        if not buyer:
            return Response({'error': 'Authentication is required.'}, status=401)
        agreement = Agreement.objects.select_related('buyer', 'artist', 'artwork').filter(pk=agreement_id, buyer=buyer).first()
        if not agreement:
            return Response({'error': 'Agreement not found.'}, status=404)
        if not auction_agreement(agreement) or agreement.status != 'accepted' or agreement.delivery_type != 'physical':
            return Response({'error': 'Delivery checkout is only available for accepted physical auction purchases.'}, status=409)
        try:
            details, fee = checked_delivery(agreement, request.data)
        except ValueError as error:
            return Response({'error': str(error)}, status=400)
        token = signing.dumps({'agreement': agreement.pk, 'buyer': buyer.pk, 'price': str(agreement.price), 'details': details}, salt=SALT, compress=True)
        return Response({'token': token, 'delivery_fee': str(fee), 'winning_bid': str(agreement.price),
                         'total': str(agreement.price + fee), 'details': details, 'expires_in': 900})
