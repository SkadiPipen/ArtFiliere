from django.db import transaction
from rest_framework.decorators import api_view
from rest_framework.response import Response

from users.models import User, Address
from .services import verify_token


@api_view(["POST"])
def login(request):

    header = request.headers.get("Authorization")

    if not header:
        return Response(
            {"error": "No Token"},
            status=401
        )

    token = header.split(" ")[1]

    decoded = verify_token(token)

    firebase_uid = decoded["uid"]
    email = decoded["email"]

    user, created = User.objects.get_or_create(
        firebase_uid=firebase_uid,
        defaults={
            "email": email,
        }
    )

    return Response({
        "id": user.id,
        "firebase_uid": user.firebase_uid,
        "email": user.email,
        "new_user": created,
    })


@api_view(["POST"])
def register(request):

    header = request.headers.get("Authorization")

    if not header:
        return Response(
            {"error": "No token"},
            status=401
        )

    token = header.split(" ")[1]

    decoded = verify_token(token)

    firebase_uid = decoded["uid"]
    email = decoded["email"]

    data = request.data

    required_fields = [
        "username",
        "first_name",
        "last_name",
        "date_of_birth",
        "contact_number",
    ]

    missing = [field for field in required_fields if not data.get(field)]

    if missing:
        return Response(
            {"error": f"Missing required fields: {', '.join(missing)}"},
            status=400
        )

    address_data = data.get("address") or {}

    required_address_fields = [
        "region",
        "province",
        "city",
        "postal_code",
        "barangay",
        "street",
    ]

    missing_address = [field for field in required_address_fields if not address_data.get(field)]

    if missing_address:
        return Response(
            {"error": f"Missing required address fields: {', '.join(missing_address)}"},
            status=400
        )

    if User.objects.filter(firebase_uid=firebase_uid).exists():
        return Response(
            {"error": "User already registered"},
            status=409
        )

    if User.objects.filter(username=data["username"]).exists():
        return Response(
            {"error": "Username already taken"},
            status=409
        )

    with transaction.atomic():
        user = User.objects.create(
            firebase_uid=firebase_uid,
            email=email,
            username=data["username"],
            first_name=data["first_name"],
            middle_name=data.get("middle_name", ""),
            last_name=data["last_name"],
            date_of_birth=data["date_of_birth"],
            contact_number=data["contact_number"],
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

    return Response({
        "id": user.id,
        "firebase_uid": user.firebase_uid,
        "email": user.email,
        "username": user.username,
        "new_user": True,
    }, status=201)