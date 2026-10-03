from django.http import JsonResponse
from rest_framework.exceptions import APIException
from .services import verify_token, account_access
from users.models import User


class ReadOnlyAccountMiddleware:
    """Enforce restrictions even on API handlers using their own token resolution."""
    def __init__(self, get_response):
        self.get_response = get_response

    def __call__(self, request):
        header = request.headers.get('Authorization', '')
        if request.method not in ('GET', 'HEAD', 'OPTIONS') and header.startswith('Bearer ') and request.path.startswith(('/api/', '/auth/')):
            try:
                decoded = verify_token(header[7:], allow_restricted=True)
                user = User.objects.filter(firebase_uid=decoded['uid']).first()
                if user:
                    access = account_access(user)
                    appeal = request.path == '/api/account/appeals/' and request.method == 'POST'
                    support = request.path.startswith('/api/support/tickets/') and user.role in ('buyer', 'artist', 'driver') and request.method in ('POST', 'PATCH')
                    login = request.path == '/auth/login/'
                    # Dedicated handlers authenticate again and enforce commission,
                    # participant, action and per-ban approval checks.
                    workspace = request.path.startswith('/api/commissions/workspace/')
                    if access['banned'] and not (appeal or workspace):
                        return JsonResponse({'error': 'Your account is banned. View your decision or submit an appeal.', 'code': 'account_restricted'}, status=403)
                    if access['suspended'] and not (appeal or support or login or workspace):
                        return JsonResponse({'error': 'Your account is suspended. You have view-only access; changes are unavailable.', 'code': 'account_read_only'}, status=403)
            except APIException as error:
                detail = error.detail
                return JsonResponse(detail if isinstance(detail, dict) else {'error': str(detail), 'code': error.default_code}, status=error.status_code)
        return self.get_response(request)
