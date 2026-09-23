from django.contrib import admin
from .models import DeliveryRoute, DeliveryOrder, PurchaseReview

@admin.register(DeliveryRoute)
class RouteAdmin(admin.ModelAdmin):
    list_display = ('pickup_city', 'destination_city', 'distance_km', 'base_fare', 'per_km', 'fee', 'active')
    search_fields = ('pickup_city', 'destination_city')

@admin.register(DeliveryOrder)
class OrderAdmin(admin.ModelAdmin):
    list_display = ('id', 'payment', 'driver', 'status', 'fee')
    readonly_fields = ('payment', 'pickup_address', 'delivery_address', 'fee', 'created_at', 'delivered_at', 'status', 'driver', 'pickup_proof', 'delivery_proof', 'timeline')
    def has_add_permission(self, request):
        return False
    def has_delete_permission(self, request, obj=None):
        return False

@admin.register(PurchaseReview)
class ReviewAdmin(admin.ModelAdmin):
    list_display = ('payment', 'artist_rating', 'artwork_rating', 'created_at')
    readonly_fields = ('payment', 'artist_rating', 'artwork_rating', 'comment', 'artist_comment', 'artwork_comment', 'created_at')
    def has_add_permission(self, request):
        return False

from .models import RiderProfile
admin.site.register(RiderProfile)
