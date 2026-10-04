from django.db import IntegrityError, transaction
from django.utils.dateparse import parse_date
from decimal import Decimal, InvalidOperation
from rest_framework.decorators import api_view, permission_classes
from rest_framework.permissions import AllowAny
from rest_framework.response import Response
from rest_framework.views import APIView

from users.models import Address, User
from artist_applications.models import ArtistApplication
from .services import verify_token, account_access, AccountRestricted, TokenVerificationUnavailable, TokenRejected


@api_view(["POST"])
@permission_classes([AllowAny])
def login(request):
    header = request.headers.get("Authorization")

    if not header:
        return Response({"error": "No Token"}, status=401)

    try:
        token = header.split(" ")[1]
        decoded = verify_token(token, allow_suspended=True)
    except AccountRestricted as error:
        return Response({'error': str(error), 'code': 'account_restricted'}, status=403)
    except (AccountRestricted, TokenVerificationUnavailable, TokenRejected):
        raise
    except Exception as e:
        return Response({"error": "Invalid token"}, status=401)

    firebase_uid = decoded["uid"]
    email = decoded["email"]

    # A staff/rider account may be provisioned by an administrator before its
    # Firebase login is linked. Match the verified Firebase email once, rather
    # than leaving that account unusable to authenticated API endpoints.
    user = User.objects.filter(firebase_uid=firebase_uid).first()
    created = False
    if not user:
        user = User.objects.filter(email=email).first()
        if user:
            user.firebase_uid = firebase_uid
            user.save(update_fields=["firebase_uid"])
        else:
            user, created = User.objects.get_or_create(
                firebase_uid=firebase_uid,
                defaults={"email": email}
            )

    access = account_access(user)
    if access['banned']:
        return Response({'error': 'Account access is restricted. Contact customer support.', 'code': 'account_restricted'}, status=403)

    return Response({
        "id": user.id,
        "firebase_uid": user.firebase_uid,
        "email": user.email,
        "username": user.username,
        "first_name": user.first_name,
        "last_name": user.last_name,
        "role": user.role,
        "new_user": created,
        "read_only": access['read_only'],
    })


@api_view(["POST"])
@permission_classes([AllowAny])
def register(request):
    header = request.headers.get("Authorization")

    if not header:
        return Response({"error": "No token provided"}, status=401)

    try:
        token = header.split(" ")[1]
        decoded = verify_token(token)
    except (AccountRestricted, TokenVerificationUnavailable, TokenRejected):
        raise
    except Exception:
        return Response({"error": "Invalid or expired token"}, status=401)

    firebase_uid = decoded["uid"]
    email = decoded.get("email", "")

    data = request.data

    username = data.get("username")
    first_name = data.get("first_name") or data.get("firstName")
    last_name = data.get("last_name") or data.get("lastName")
    date_of_birth = data.get("date_of_birth") or data.get("dateOfBirth")
    contact_number = data.get("contact_number") or data.get("contactNumber")

    if not all([username, first_name, last_name, date_of_birth, contact_number]):
        return Response(
            {"error": "Please complete all required profile fields."},
            status=400
        )

    if not parse_date(date_of_birth):
        return Response({"error": "Enter your date of birth in YYYY-MM-DD format."}, status=400)

    # Address Validation
    address_data = data.get("address") or {}
    required_address_fields = ["region", "province", "city", "postal_code", "barangay", "street"]
    missing_address = [field for field in required_address_fields if not address_data.get(field)]

    if missing_address:
        return Response(
            {"error": f"Missing required address fields: {', '.join(missing_address)}"},
            status=400
        )

    # Uniqueness checks
    if User.objects.filter(firebase_uid=firebase_uid).exists():
        return Response({"error": "User already registered"}, status=409)

    if User.objects.filter(username=username).exists():
        return Response({"error": "Username already taken"}, status=409)

    # Database Creation
    try:
        with transaction.atomic():
            user = User.objects.create(
                firebase_uid=firebase_uid,
                email=email,
                username=username,
                first_name=first_name,
                middle_name=data.get("middle_name", ""),
                last_name=last_name,
                date_of_birth=date_of_birth,
                contact_number=contact_number,
                wants_royalty=data.get("wants_royalty", User.RoyaltyStatus.NO),
            )

            Address.objects.create(
                is_default=True,
                user=user,
                region=address_data["region"],
                province=address_data["province"],
                city=address_data["city"],
                postal_code=address_data["postal_code"],
                barangay=address_data["barangay"],
                street=address_data["street"],
            )
    except IntegrityError:
        return Response({"error": "An account with these details already exists."}, status=409)

    return Response({
        "id": user.id,
        "firebase_uid": user.firebase_uid,
        "email": user.email,
        "username": user.username,
        "first_name": user.first_name,
        "last_name": user.last_name,
        "new_user": True,
    }, status=201)


@api_view(['GET', 'PATCH'])
@permission_classes([AllowAny])
def me(request):
    header = request.headers.get("Authorization", "")
    if not header.startswith("Bearer "):
        return Response({"error": "Authentication is required."}, status=401)

    try:
        decoded = verify_token(header.split(" ", 1)[1], allow_suspended=request.method in ('GET', 'HEAD', 'OPTIONS'))
        user = User.objects.get(firebase_uid=decoded["uid"])
    except AccountRestricted as error:
        return Response({'error': str(error), 'code': 'account_restricted'}, status=403)
    except (User.DoesNotExist, KeyError):
        return Response({"error": "User profile not found."}, status=404)
    except (AccountRestricted, TokenVerificationUnavailable, TokenRejected):
        raise
    except Exception:
        return Response({"error": "Invalid or expired token."}, status=401)

    if request.method == 'GET':
        address = getattr(user, 'address', None)
        artist_application = ArtistApplication.objects.filter(user=user).only('hourly_rate').first()
        return Response({
            'id': user.id,
            'username': user.username,
            'email': user.email,
            'first_name': user.first_name,
            'last_name': user.last_name,
            'contact_number': getattr(user, 'contact_number', ''),
            'role': getattr(user, 'role', 'Buyer'),
            'read_only': account_access(user)['read_only'],
            'is_accepting_commissions': user.is_accepting_commissions,
            'default_hourly_rate': str(artist_application.hourly_rate) if artist_application else None,
            'profile_image': getattr(user, 'profile_image', None),
            'address': {field: getattr(address, field, '') if address else '' for field in ('street', 'barangay', 'city', 'province', 'region', 'postal_code')}
        })

    elif request.method == 'PATCH':
        data = request.data
        address_fields = ('street', 'barangay', 'city', 'province', 'region', 'postal_code')
        address_updates = {field: data[field] for field in address_fields if field in data}
        for field, value in address_updates.items():
            limit = Address._meta.get_field(field).max_length
            if not isinstance(value, str) or not value.strip() or len(value) > limit:
                return Response({'error': f'Enter a valid {field.replace("_", " ")} (up to {limit} characters).'}, status=400)
        if address_updates and not user.address and len(address_updates) != len(address_fields):
            return Response({'error': 'Enter all address fields.'}, status=400)
        if 'first_name' in data or 'firstName' in data:
            user.first_name = data.get('first_name') or data.get('firstName')
        if 'last_name' in data or 'lastName' in data:
            user.last_name = data.get('last_name') or data.get('lastName')
        if 'username' in data:
            user.username = data['username']
        if 'contact_number' in data:
            user.contact_number = data['contact_number']
        if 'is_accepting_commissions' in data:
            if user.role != User.Role.ARTIST:
                return Response({'error': 'Only artists can change commission availability.'}, status=403)
            if not isinstance(data['is_accepting_commissions'], bool):
                return Response({'error': 'Commission availability must be true or false.'}, status=400)
            user.is_accepting_commissions = data['is_accepting_commissions']
        if 'default_hourly_rate' in data:
            if user.role != User.Role.ARTIST:
                return Response({'error': 'Only artists can change a default hourly rate.'}, status=403)
            try:
                default_hourly_rate = Decimal(str(data['default_hourly_rate']))
                if not default_hourly_rate.is_finite() or default_hourly_rate <= 0 or default_hourly_rate > 99999999:
                    raise InvalidOperation
            except (InvalidOperation, ValueError, TypeError):
                return Response({'error': 'Enter a valid default hourly rate.'}, status=400)
            application = ArtistApplication.objects.filter(user=user).first()
            if not application:
                return Response({'error': 'Artist application not found.'}, status=404)
            application.hourly_rate = default_hourly_rate
            application.save(update_fields=['hourly_rate'])
        user.save()

        if address_updates:
            with transaction.atomic():
                User.objects.select_for_update().get(pk=user.pk)
                address = user.address or Address(user=user, is_default=True)
                for field, value in address_updates.items():
                    setattr(address, field, value.strip())
                address.save()

        return Response({
            'message': 'Profile updated successfully',
            'first_name': user.first_name,
            'last_name': user.last_name,
            'username': user.username,
            'is_accepting_commissions': user.is_accepting_commissions,
            'default_hourly_rate': str(ArtistApplication.objects.filter(user=user).values_list('hourly_rate', flat=True).first() or ''),
        })


class AuthenticatedAPIView(APIView):
    """
    Base view for any endpoint that needs to resolve the requesting User
    from a Firebase Bearer token. Subclass this instead of APIView directly,
    then call self.get_request_user(request) inside get/post/patch/etc.

    Caches the resolved user on the request object so permission classes
    (see authentication/permissions.py) and the view method itself don't
    verify the same token twice per request.
    """

    def get_request_user(self, request):
        if hasattr(request, "artfiliere_user"):
            return request.artfiliere_user

        header = request.headers.get("Authorization", "")
        if not header.startswith("Bearer "):
            request.artfiliere_user = None
            return None

        try:
            decoded = verify_token(header.split(" ", 1)[1], allow_suspended=request.method in ('GET', 'HEAD', 'OPTIONS') or (getattr(self, 'allow_suspended_support', False) and request.method in ('POST', 'PATCH')))
            user = User.objects.get(firebase_uid=decoded["uid"])
            user.view_only = decoded.get('artfiliere_read_only', False)
        except (AccountRestricted, TokenVerificationUnavailable, TokenRejected):
            raise
        except Exception:
            user = None

        request.artfiliere_user = user
        return user


class ChatUsersView(AuthenticatedAPIView):
    """Public chat labels for authenticated application users."""

    def get(self, request):
        if not self.get_request_user(request):
            return Response({"error": "Authentication is required."}, status=401)
        return Response(list(User.objects.order_by("username").values(
            "firebase_uid", "username", "role"
        )))
