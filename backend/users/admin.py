from django.contrib import admin
from .models import User, Address


@admin.register(User)
class UserAdmin(admin.ModelAdmin):
    list_display = ('email', 'username', 'role', 'created_at')
    list_filter = ['role']
    search_fields = ('email', 'username')


@admin.register(Address)
class AddressAdmin(admin.ModelAdmin):
    list_display = ('user', 'region', 'province', 'city', 'postal_code', 'barangay', 'street')
