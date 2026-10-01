from django.conf import settings
from django.utils import timezone
from rest_framework.response import Response
from rest_framework.views import APIView
from authentication.views import AuthenticatedAPIView
from artworks.models import Artwork
from messaging.models import Agreement
from wallets.models import PaymentSession
from .models import BlockchainTransaction
from .service import BlockchainError, register_artwork, verify_artwork, verify_license, verify_sale


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


class AgreementBlockchainProofView(AuthenticatedAPIView):
    def get(self, request, agreement_id, action):
        # A proof exposes hashes only, never the private agreement contents.
        # Keeping this read-only endpoint public makes it usable in a browser.
        agreement = Agreement.objects.filter(id=agreement_id).first()
        if not agreement:
            return Response({"error": "Agreement not found."}, status=404)
        item = BlockchainTransaction.objects.filter(operation="license_record", entity_type="agreement", entity_id=agreement.id).order_by("-created_at").first()
        if not item:
            return Response({"agreement_id": agreement.id, "status": "not_registered"})
        if action == "proof":
            return Response({"agreement_id": agreement.id, "proof_hash": item.proof_hash, "transaction_hash": item.transaction_hash, "block_number": item.block_number, "network": item.network, "status": item.status})
        try:
            valid, chain = verify_license(agreement.id, item.proof_hash)
            return Response({"verified": valid, "agreement_id": agreement.id, "proof_hash": item.proof_hash, "blockchain_hash": bytes(chain[0]).hex(), "transaction_hash": item.transaction_hash, "network": item.network})
        except BlockchainError as error:
            return Response({"error": str(error)}, status=503)


class SaleBlockchainProofView(AuthenticatedAPIView):
    def get(self, request, payment_id, action):
        # A proof exposes hashes only, never buyer, artist, price, or provider data.
        payment = PaymentSession.objects.filter(id=payment_id).first()
        if not payment:
            return Response({"error": "Transaction not found."}, status=404)
        item = BlockchainTransaction.objects.filter(operation="sale_record", entity_type="payment", entity_id=payment.id).order_by("-created_at").first()
        if not item:
            return Response({"payment_id": payment.id, "status": "not_registered"})
        if action == "proof":
            return Response({"payment_id": payment.id, "proof_hash": item.proof_hash, "transaction_hash": item.transaction_hash, "block_number": item.block_number, "network": item.network, "status": item.status})
        try:
            valid, chain = verify_sale(payment.id, item.proof_hash)
            return Response({"verified": valid, "payment_id": payment.id, "proof_hash": item.proof_hash, "blockchain_hash": bytes(chain[0]).hex(), "transaction_hash": item.transaction_hash, "network": item.network})
        except BlockchainError as error:
            return Response({"error": str(error)}, status=503)


class PublicVerificationView(APIView):
    """Verify a shareable record code without exposing private business data."""
    authentication_classes = []
    permission_classes = []

    def get(self, request):
        code = str(request.query_params.get("code", "")).strip().upper()
        if not code:
            return Response({"verified": False, "message": "Enter an agreement or sale verification code."}, status=400)
        if code.startswith("AF-AGR-"):
            agreement = Agreement.objects.filter(verification_code=code).first()
            item = agreement and BlockchainTransaction.objects.filter(operation="license_record", entity_type="agreement", entity_id=agreement.id, status="confirmed").order_by("-created_at").first()
            if not agreement or not item:
                return Response({"verified": False, "record_type": "agreement", "message": "No finalized blockchain record was found for this code."})
            try:
                valid, _ = verify_license(agreement.id, item.proof_hash)
                return Response({"verified": valid, "record_type": "agreement", "verification_code": code, "message": "Agreement record is verified by ArtFiliere." if valid else "Agreement proof does not match the current blockchain record."})
            except BlockchainError as error:
                return Response({"verified": False, "message": str(error)}, status=503)
        if code.startswith("AF-SALE-"):
            payment = PaymentSession.objects.filter(verification_code=code).first()
            item = payment and BlockchainTransaction.objects.filter(operation="sale_record", entity_type="payment", entity_id=payment.id, status="confirmed").order_by("-created_at").first()
            if not payment or not item:
                return Response({"verified": False, "record_type": "sale", "message": "No completed blockchain record was found for this code."})
            try:
                valid, _ = verify_sale(payment.id, item.proof_hash)
                return Response({"verified": valid, "record_type": "sale", "verification_code": code, "message": "Completed sale is verified by ArtFiliere." if valid else "Sale proof does not match the current blockchain record."})
            except BlockchainError as error:
                return Response({"verified": False, "message": str(error)}, status=503)
        return Response({"verified": False, "message": "Use an ArtFiliere agreement or sale verification code."}, status=400)
