from django.contrib import admin
from .models import UserNotification


@admin.register(UserNotification)
class UserNotificationAdmin(admin.ModelAdmin):
    list_display = ('user', 'title', 'is_read', 'created_at')
    list_filter = ('is_read', 'created_at')
    search_fields = ('user__email', 'title', 'message')
    readonly_fields = ('user', 'application', 'title', 'message', 'created_at')
