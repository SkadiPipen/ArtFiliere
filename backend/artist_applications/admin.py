from django.contrib import admin
from users.models import User
from .models import ArtistApplication, ArtistApplicationLog


@admin.register(ArtistApplication)
class ArtistApplicationAdmin(admin.ModelAdmin):
    list_display = ('user', 'hourly_rate', 'status', 'submitted_at')
    list_filter = ('status', 'submitted_at')
    search_fields = ('user__email', 'user__username', 'tin_number')
    readonly_fields = ('submitted_at', 'updated_at')

    actions = ['approve_applications', 'reject_applications']

    # Admin action to approve appplicants
    def approve_applications(self, request, queryset):
        for app in queryset:
            app.status = ArtistApplication.ApprovalStatus.APPROVED
            app.save()
            app.user.role = User.Role.ARTIST
            app.user.save()
        self.message_user(request, "Selected applications have been approved.")
    approve_applications.short_description = "Approve selected applications"

    def reject_applications(self, request, queryset):
        queryset.update(status=ArtistApplication.ApprovalStatus.REJECTED)
        self.message_user(request, "Selected applications are marked as Rejected.")
    reject_applications.short_description = "Reject selected applications"


@admin.register(ArtistApplicationLog)
class ArtistApplicationLogAdmin(admin.ModelAdmin):
    list_display = ('application', 'action', 'actor', 'previous_status', 'new_status', 'created_at')
    list_filter = ('action', 'created_at')
    search_fields = ('application__user__email', 'actor__email')
    readonly_fields = ('application', 'actor', 'action', 'previous_status', 'new_status', 'reason', 'created_at')
