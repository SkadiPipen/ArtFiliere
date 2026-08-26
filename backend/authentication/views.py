from django.db import IntegrityError, transaction
from django.utils.dateparse import parse_date
from rest_framework.decorators import api_view, permission_classes
from rest_framework.permissions import AllowAny
from rest_framework.response import Response
from rest_framework.views import APIView

from users.models import Address, User
from .services import verify_token


@api_view(["POST"])
@permission_classes([AllowAny])
def login(request):
    header = request.headers.get("Authorization")

    if not header:
        return Response({"error": "No Token"}, status=401)

    try:
        token = header.split(" ")[1]
        decoded = verify_token(token)
    except Exception as e:
        return Response({"error": "Invalid token"}, status=401)

    firebase_uid = decoded["uid"]
    email = decoded["email"]

    user, created = User.objects.get_or_create(
        firebase_uid=firebase_uid,
        defaults={"email": email}
    )

    return Response({
        "id": user.id,
        "firebase_uid": user.firebase_uid,
        "email": user.email,
        "username": user.username,
        "first_name": user.first_name,
        "last_name": user.last_name,
        "role": user.role,
        "new_user": created,
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
        decoded = verify_token(header.split(" ", 1)[1])
        user = User.objects.get(firebase_uid=decoded["uid"])
    except (User.DoesNotExist, KeyError):
        return Response({"error": "User profile not found."}, status=404)
    except Exception:
        return Response({"error": "Invalid or expired token."}, status=401)

    if request.method == 'GET':
        address = getattr(user, 'address', None)
        return Response({
            'id': user.id,
            'username': user.username,
            'email': user.email,
            'first_name': user.first_name,
            'last_name': user.last_name,
            'contact_number': getattr(user, 'contact_number', ''),
            'role': getattr(user, 'role', 'Buyer'),
            'profile_image': getattr(user, 'profile_image', None),
            'address': {
                'street': address.street if address else ''
            }
        })

    elif request.method == 'PATCH':
        data = request.data
        if 'first_name' in data or 'firstName' in data:
            user.first_name = data.get('first_name') or data.get('firstName')
        if 'last_name' in data or 'lastName' in data:
            user.last_name = data.get('last_name') or data.get('lastName')
        if 'username' in data:
            user.username = data['username']
        if 'contact_number' in data:
            user.contact_number = data['contact_number']

        user.save()

        if 'street' in data and hasattr(user, 'address'):
            user.address.street = data['street']
            user.address.save()

        return Response({
            'message': 'Profile updated successfully',
            'first_name': user.first_name,
            'last_name': user.last_name,
            'username': user.username,
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
            decoded = verify_token(header.split(" ", 1)[1])
            user = User.objects.get(firebase_uid=decoded["uid"])
        except Exception:
            user = None

        request.artfiliere_user = user
        return user
