from rest_framework.permissions import BasePermission

from users.models import User


class _BaseRolePermission(BasePermission):
    """
    Resolves the request user via the view's get_request_user (provided by
    AuthenticatedAPIView) and checks it against `required_role`. Views using
    these permission classes must subclass AuthenticatedAPIView.
    """

    required_role = None
    message = "You do not have permission to perform this action."

    def has_permission(self, request, view):
        if not hasattr(view, "get_request_user"):
            raise TypeError(
                f"{view.__class__.__name__} must subclass AuthenticatedAPIView "
                f"to use {self.__class__.__name__}."
            )
        user = view.get_request_user(request)
        return bool(user and user.role == self.required_role)


class IsHR(_BaseRolePermission):
    required_role = User.Role.HR
    message = "HR access is required."


class IsArtist(_BaseRolePermission):
    required_role = User.Role.ARTIST
    message = "Only approved artists can perform this action."


class IsCreativeModerator(_BaseRolePermission):
    required_role = User.Role.CREATIVE_MODERATOR
    message = "Creative Moderator access is required."


class IsPlatformAdmin(_BaseRolePermission):
    required_role = User.Role.PLATFORM_ADMIN
    message = "Platform Admin access is required."


class IsCustomerSupport(_BaseRolePermission):
    required_role = User.Role.CUSTOMER_SUPPORT
    message = 'Customer Support moderator access is required.'


class IsAuthenticatedUser(BasePermission):
    """Just requires a resolvable Firebase-authenticated user, any role."""

    message = "Authentication is required."

    def has_permission(self, request, view):
        if not hasattr(view, "get_request_user"):
            raise TypeError(
                f"{view.__class__.__name__} must subclass AuthenticatedAPIView "
                f"to use {self.__class__.__name__}."
            )
        return bool(view.get_request_user(request))
