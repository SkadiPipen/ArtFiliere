import re
from rest_framework import serializers
from .models import RiderProfile, Order

class OrderSerializer(serializers.ModelSerializer):
    customer_name = serializers.SerializerMethodField()
    artwork_title = serializers.SerializerMethodField()
    delivery_fee = serializers.SerializerMethodField()
    formatted_address = serializers.SerializerMethodField()

    class Meta:
        model = Order
        fields = '__all__'

    def get_customer_name(self, obj):
        payment = getattr(obj, 'payment', None)
        if payment and getattr(payment, 'buyer', None):
            buyer = payment.buyer
            name = (f"{getattr(buyer, 'first_name', '')} {getattr(buyer, 'last_name', '')}").strip()
            return name or getattr(buyer, 'username', None) or f"Customer #{buyer.id}"

        raw_name = getattr(obj, 'buyer_name', None) or getattr(obj, 'buyerId', '')
        raw_str = str(raw_name).strip()

        cleaned = re.sub(r'^(Customer\s*#*|Buyer\s*#*)+', '', raw_str, flags=re.IGNORECASE).strip()
        
        if cleaned.isdigit():
            return f"Customer #{cleaned}"
        
        return cleaned if cleaned else f"Customer #{obj.id}"

    def get_artwork_title(self, obj):
        payment = getattr(obj, 'payment', None)
        if payment and getattr(payment, 'artwork', None):
            return payment.artwork.title
        return getattr(obj, 'item_name', None) or 'Physical Artwork Piece'

    def get_delivery_fee(self, obj):
        fee = getattr(obj, 'delivery_fee', None)
        if fee is not None:
            return float(fee)
        try:
            km = float(''.join(c for c in str(obj.distance) if c.isdigit() or c == '.'))
            return round(50.0 + max(0.0, km - 2.0) * 15.0, 2)
        except Exception:
            return 85.00

    def get_formatted_address(self, obj):
        addr = str(obj.address or '').strip()
        if addr in ['123', ''] or len(addr) < 5:
            return "123, Barangay 1, Mandaue City, Cebu"
        return addr


class RiderProfileSerializer(serializers.ModelSerializer):
    class Meta:
        model = RiderProfile
        fields = '__all__'