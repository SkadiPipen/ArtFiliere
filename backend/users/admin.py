from django.contrib import admin
from .models import User, Address, ArtistApplication

@admin.register(User)
class UserAdmin(admin.ModelAdmin):
    list_display = ('email', 'username', 'role', 'created_at')
    list_filter= ['role']
    search_fields = ('email', 'username')

@admin.register(Address)
class AddressAdmin(admin.ModelAdmin):
    list_display = ('user', 'region', 'province', 'city', 'postal_code', 'barangay', 'street')

@admin.register(ArtistApplication)
class ArtistApplicationAdmin(admin.ModelAdmin):
    list_display = ('user', 'hourly_rate', 'status', 'submitted_at')
    list_filter = ('status', 'submitted_at')
    search_fields = ('user__email', 'user__username', 'tin_number')
    readonly_fields = ('submitted_at', 'updated_at')

    actions = ['approve_application', 'reject_application']

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