from django.conf import settings
from django.utils import timezone
from rest_framework.response import Response
from authentication.views import AuthenticatedAPIView
from artworks.models import Artwork
from .models import BlockchainTransaction
from .service import BlockchainError, register_artwork, verify_artwork


class ArtworkBlockchainView(AuthenticatedAPIView):
    def post(self, request, artwork_id):
        artwork = Artwork.objects.filter(id=artwork_id, artist=self.get_request_user(request), status=Artwork.Status.APPROVED).first()
        if not artwork: return Response({"error": "Approved artwork not found."}, status=404)
        if not artwork.sha256_hash: return Response({"error": "Artwork hash is missing."}, status=400)
        if artwork.blockchain_transactions.filter(operation="artwork_registration", status="confirmed").exists(): return Response({"error": "Artwork is already registered."}, status=409)
        item = BlockchainTransaction.objects.create(artwork=artwork, network=settings.BLOCKCHAIN_NETWORK)
        try:
            result = register_artwork(artwork.id, artwork.sha256_hash)
            item.transaction_hash, item.block_number, item.status, item.confirmed_at = result["transaction_hash"], result["block_number"], "confirmed", timezone.now(); item.save()
            return Response({"artwork_id": artwork.id, "transaction_hash": item.transaction_hash, "block_number": item.block_number, "network": item.network, "status": item.status}, status=201)
        except BlockchainError as error:
            item.status, item.error_message = "failed", str(error); item.save(); return Response({"error": str(error)}, status=503)

    def get(self, request, artwork_id, action):
        artwork = Artwork.objects.filter(id=artwork_id).first()
        if not artwork: return Response({"error": "Artwork not found."}, status=404)
        item = artwork.blockchain_transactions.order_by("-created_at").first()
        if action == "proof": return Response({"artwork_id": artwork.id, "artwork_hash": artwork.sha256_hash, "transaction_hash": item.transaction_hash if item else None, "block_number": item.block_number if item else None, "network": item.network if item else None, "status": item.status if item else "not_registered"})
        try:
            valid, chain = verify_artwork(artwork.id, artwork.sha256_hash)
            return Response({"verified": valid, "artwork_id": artwork.id, "artwork_hash": artwork.sha256_hash, "blockchain_hash": bytes(chain[0]).hex(), "transaction_hash": item.transaction_hash if item else None, "network": settings.BLOCKCHAIN_NETWORK})
        except BlockchainError as error: return Response({"error": str(error)}, status=503)
