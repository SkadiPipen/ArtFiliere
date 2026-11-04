from django.db.models import Q
from rest_framework.response import Response
from authentication.views import AuthenticatedAPIView
from users.models import User


class UserManagementView(AuthenticatedAPIView):
    def scope(self, request):
        actor = self.get_request_user(request)
        if not actor or actor.role not in (User.Role.PLATFORM_ADMIN, User.Role.HR):
            return actor, None
        users = User.objects.all()
        if actor.role == User.Role.HR:
            users = users.filter(Q(role__in=[User.Role.ARTIST, User.Role.DRIVER]) | Q(artist_application__isnull=False)).exclude(role__in=[User.Role.PLATFORM_ADMIN, User.Role.HR, User.Role.CREATIVE_MODERATOR, User.Role.CUSTOMER_SUPPORT]).distinct()
        return actor, users

    def get(self, request):
        actor, users = self.scope(request)
        if users is None:
            return Response({'error': 'Admin or HR access is required.'}, status=403)
        query = str(request.query_params.get('q', '')).strip()[:150]
        role = request.query_params.get('role', '')
        status = request.query_params.get('status', '')
        if query:
            users = users.filter(Q(username__icontains=query) | Q(email__icontains=query) | Q(first_name__icontains=query) | Q(last_name__icontains=query))
        if role:
            users = users.filter(role=role)
        from django.utils import timezone
        if status == 'restricted':
            users = users.filter(Q(is_banned=True) | Q(suspended_until__gt=timezone.now()) | Q(driver_deactivated=True))
        elif status == 'active':
            users = users.filter(is_banned=False, driver_deactivated=False).filter(Q(suspended_until__isnull=True) | Q(suspended_until__lte=timezone.now()))
        try:
            page = max(1, int(request.query_params.get('page', 1)))
        except (ValueError, TypeError):
            return Response({'error': 'Invalid page.'}, status=400)
        count = users.count()
        items = []
        for user in users.select_related('artist_application').order_by('username', 'pk')[(page-1)*25:page*25]:
            application = getattr(user, 'artist_application', None)
            items.append(dict(id=user.pk, username=user.username, email=user.email, first_name=user.first_name, last_name=user.last_name, contact_number=user.contact_number, role=user.role, status='banned' if user.is_banned else 'deactivated' if user.driver_deactivated else 'suspended' if user.access_restricted else 'active', joined=user.created_at.date().isoformat(), registration_status=application.status if application else None, can_edit=False))
        response = Response(dict(results=items, count=count, page=page, page_size=25))
        response['Cache-Control'] = 'private, no-store'
        return response

    def patch(self, request, user_id):
        return Response({'error': 'User management is read-only. Users maintain their own profile details.'}, status=405)
