from django.contrib import admin
from .models import Order, RiderProfile

# Register your models here.
@admin.register(Order)
class OrderAdmin(admin.ModelAdmin):
    list_display = ('id', 'buyerId', 'address', 'paymentMethod', 'status', 'created_at')
    list_filter = ('status', 'paymentMethod')
    search_fields = ('buyerId', 'address')

@admin.register(RiderProfile)
class RiderProfileAdmin(admin.ModelAdmin):
    list_display = ('user', 'phone', 'is_clocked_in')
