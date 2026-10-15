from rest_framework.views import APIView
from rest_framework.response import Response
from rest_framework import status, permissions
from django.utils import timezone
from django.db import transaction
from django.db.models import Q
from django.conf import settings
from decimal import Decimal
import base64
import requests

from authentication.views import AuthenticatedAPIView
from users.models import User
from messaging.models import Agreement
from .models import CommissionRequest, CommissionMilestone, CommissionPhoto
from notifications.models import UserNotification
from .availability import conflicts


def resolve_buyer_or_user(view_instance, request):
    """
    Resolves the requesting user using the following sequence:
    1. AuthenticatedAPIView get_request_user (Firebase Bearer token)
    2. Explicit user_id / buyer_id in body or params
    3. Case-insensitive email matching
    4. Case-insensitive username matching
    5. Direct firebase_admin token decode fallback
    """
    user = None
    if hasattr(view_instance, 'get_request_user'):
        user = view_instance.get_request_user(request)

    if user:
        return user
    if request.method not in ('GET', 'HEAD', 'OPTIONS'):
        # Body identifiers cannot replace authentication for changes.
        return None

    user_id = request.data.get('user_id') or request.data.get('buyer_id') or request.query_params.get('user_id')
    if user_id:
        try:
            matched = User.objects.filter(pk=int(user_id)).first()
            if matched:
                return matched
        except (ValueError, TypeError):
            pass

    email = request.data.get('user_email') or request.data.get('email') or request.query_params.get('user_email') or request.query_params.get('email')
    if email and isinstance(email, str) and email.strip():
        matched = User.objects.filter(email__iexact=email.strip()).first()
        if matched:
            return matched

    username = (
        request.data.get('buyer_username')
        or request.data.get('username')
        or request.query_params.get('buyer_username')
        or request.query_params.get('username')
    )
    if username and isinstance(username, str) and username.strip():
        matched = User.objects.filter(username__iexact=username.strip()).first()
        if matched:
            return matched

    auth_header = request.headers.get('Authorization') or request.META.get('HTTP_AUTHORIZATION')
    if auth_header and auth_header.startswith('Bearer '):
        token_str = auth_header.split('Bearer ')[1].strip()
        try:
            import firebase_admin
            from firebase_admin import auth as fb_auth
            decoded = fb_auth.verify_id_token(token_str)
            fb_uid = decoded.get('uid')
            fb_email = decoded.get('email')
            if fb_email:
                matched = User.objects.filter(email__iexact=fb_email.strip()).first()
                if matched:
                    return matched
            if fb_uid:
                matched = User.objects.filter(firebase_uid=fb_uid).first()
                if matched:
                    return matched
        except Exception:
            pass

    return None


class CommissionRequestView(AuthenticatedAPIView):
    permission_classes = [permissions.AllowAny]

    def get(self, request):
        """Fetch commission history for either buyer or artist"""
        user = self.get_request_user(request)
        role = request.query_params.get('role', 'buyer')

        if not user:
            return Response({'error': 'Sign in to view your commissions.'}, status=401)
        elif role == 'artist':
            commissions = CommissionRequest.objects.filter(Q(flow_version=2) | ~Q(status='CANCELLED'), artist=user).order_by('-commission_req_id')
        else:
            commissions = CommissionRequest.objects.filter(Q(flow_version=2) | ~Q(status='CANCELLED'), buyer=user).order_by('-commission_req_id')

        data = []
        for c in commissions:
            milestones = [
                {
                    "milestone_id": m.milestone_id,
                    "milestone_number": m.milestone_number,
                    "stage_label": m.stage_label,
                    "status": m.status,
                    "percentage": m.percentage,
                    "amount": float(m.amount),
                    "paid_at": m.paid_at.isoformat() if m.paid_at else None,
                    'approved_at': m.approved_at.isoformat() if m.approved_at else None,
                    'revision_used': bool(m.revision_requested_at), 'revision_comment': m.revision_comment,
                    'payout_status': m.payout_status,
                }
                for m in c.milestones.all().order_by('milestone_number')
            ]
            data.append({
                "commission_req_id": c.commission_req_id,
                "flow_version": c.flow_version,
                "buyer_id": c.buyer.id,
                "buyer_name": getattr(c.buyer, 'username', 'Buyer'),
                "buyer_username": getattr(c.buyer, 'username', 'Buyer'),
                "artist_id": c.artist.id,
                "artist_name": getattr(c.artist, 'username', 'Artist'),
                "title": c.title,
                "subject": c.subject,
                "style": c.style,
                "description": c.description,
                "art_type": getattr(c, 'art_type', 'Physical'),
                "tags": getattr(c, 'tags', ''),
                "time_duration": float(c.time_duration or 0),
                "is_rush_job": bool(c.is_rush_job),
                "status": c.status,
                "created_at": c.created_at.isoformat() if c.created_at else None,
                "deadline": c.deadline.isoformat() if c.deadline else None,
                "milestones": milestones,
                'funded_at': c.funded_at.isoformat() if c.funded_at else None,
                'proposal_total': str(c.proposals.order_by('-version').first().terms.get('price', c.time_duration)) if c.flow_version == 2 and c.proposals.exists() else str(c.time_duration),
            })

        return Response(data, status=status.HTTP_200_OK)

    @transaction.atomic
    def post(self, request):
        """Submit a new commission request (Buyer)"""
        data = request.data
        buyer = resolve_buyer_or_user(self, request)

        if not buyer:
            return Response(
                {"error": "Could not identify logged-in user. Please ensure you are logged in."},
                status=status.HTTP_401_UNAUTHORIZED
            )

        artist_id = data.get('artist_id')
        if not artist_id:
            return Response({"error": "artist_id is required."}, status=status.HTTP_400_BAD_REQUEST)

        artist = User.objects.filter(pk=artist_id).first()
        if not artist:
            return Response({"error": "Selected artist does not exist."}, status=status.HTTP_404_NOT_FOUND)
        if artist.role != User.Role.ARTIST or not artist.is_accepting_commissions:
            return Response({"error": "This artist is not currently accepting commission requests."}, status=status.HTTP_409_CONFLICT)
        from authentication.services import account_access
        if any(account_access(artist)[key] for key in ('banned', 'suspended')):
            return Response({'error': 'This artist is not currently accepting commission requests.'}, status=409)

        subject = str(data.get('subject') or data.get('title') or '').strip()
        style = str(data.get('style') or data.get('art_type') or '').strip()
        if len(subject) < 3 or len(style) < 2:
            return Response({"error": "Add the commission subject and preferred style."}, status=status.HTTP_400_BAD_REQUEST)

        deadline = timezone.now() + timezone.timedelta(days=14)
        if data.get('deadline'):
            try:
                deadline = timezone.datetime.fromisoformat(data['deadline'])
                if timezone.is_naive(deadline):
                    deadline = timezone.make_aware(deadline)
            except Exception:
                return Response({"error": "Enter a valid preferred completion date."}, status=status.HTTP_400_BAD_REQUEST)
        if deadline <= timezone.now():
            return Response({"error": "Your preferred completion date must be in the future."}, status=status.HTTP_400_BAD_REQUEST)
        if conflicts(artist.pk, deadline):
            return Response({'error': 'This completion date is already booked. Choose another date.'}, status=409)

        try:
            total_price = Decimal(str(data.get('proposed_budget') or data.get('time_duration') or '0'))
            if not total_price.is_finite() or total_price <= 0:
                raise ValueError()
        except Exception:
            return Response({"error": "Enter a valid proposed budget."}, status=status.HTTP_400_BAD_REQUEST)

        from .lifecycle import create_request
        return create_request(buyer, artist, data, deadline, total_price)


class ManageCommissionStatusView(AuthenticatedAPIView):
    """Artist: Accept or Decline a Commission"""
    permission_classes = [permissions.AllowAny]

    @transaction.atomic
    def post(self, request, pk):
        action = request.data.get('action')
        commission = CommissionRequest.objects.filter(pk=pk).first()
        if not commission:
            return Response({"error": "Commission not found"}, status=status.HTTP_404_NOT_FOUND)
        artist = self.get_request_user(request)
        if not artist or artist.id != commission.artist_id:
            return Response({"error": "Only the assigned artist can update this commission."}, status=status.HTTP_403_FORBIDDEN)
        if commission.flow_version == 2:
            return Response({'error': 'Review the current proposal in the commission workspace.'}, status=409)
        # All acceptance operations for this artist share the same row lock.
        User.objects.select_for_update().get(pk=artist.pk)
        commission.refresh_from_db()

        if action == 'ACCEPT':
            if commission.status != 'PENDING':
                return Response({'error': 'Only pending commissions can be accepted.'}, status=409)
            if commission.deadline <= timezone.now():
                return Response({'error': 'The requested completion date has passed. Ask the buyer for a new request.'}, status=409)
            if conflicts(artist.pk, commission.deadline, exclude=commission.pk):
                return Response({'error': 'This completion date is already booked. Agree on another date before accepting.'}, status=409)
            commission.accepted_at = timezone.now()
            commission.status = 'IN_PROGRESS'
            commission.save()
            UserNotification.objects.create(
                user=commission.buyer,
                commission=commission,
                title="Commission request accepted",
                message=f"{commission.artist.username} accepted your commission request for {commission.title}. You can now continue the discussion.",
            )
            return Response({"message": "Commission accepted and in-progress.", "status": commission.status})
        elif action == 'REJECT':
            commission.status = 'CANCELLED'
            commission.save()
            UserNotification.objects.create(
                user=commission.buyer,
                commission=commission,
                title="Commission request declined",
                message=f"{commission.artist.username} declined your commission request for {commission.title}.",
            )
            return Response({"message": "Commission declined.", "status": commission.status})

        return Response({"error": "Invalid action. Use ACCEPT or REJECT."}, status=status.HTTP_400_BAD_REQUEST)


class CancelCommissionView(AuthenticatedAPIView):
    """Buyer: Cancels at Stage 1 or 2 with survey and automated refund"""
    permission_classes = [permissions.AllowAny]

    @transaction.atomic
    def post(self, request, pk):
        if CommissionRequest.objects.filter(pk=pk, flow_version=2).exists():
            return Response({'error': 'Use the commission workflow for this commission.'}, status=409)
        commission = CommissionRequest.objects.filter(pk=pk).first()
        if not commission:
            return Response({"error": "Commission not found."}, status=status.HTTP_404_NOT_FOUND)

        buyer = self.get_request_user(request)
        if not buyer or buyer.pk != commission.buyer_id:
            return Response({'error': 'Only the commission buyer can cancel.'}, status=403)

        current_progress = commission.current_progress()
        if current_progress >= 100 or commission.status == 'COMPLETE':
            return Response({"error": "Stage 3 is complete. Final commission cannot be cancelled."}, status=status.HTTP_400_BAD_REQUEST)

        reason = request.data.get('reason', 'Client requested cancellation')
        feedback = request.data.get('feedback', '')

        total = commission.time_duration
        stage = 1 if current_progress < 66 else 2

        if stage == 1:
            refund = round(total * Decimal('0.33'), 2)
        else:
            refund = round(total * Decimal('0.46'), 2)

        commission.status = 'CANCELLED'
        commission.cancel_reason = reason
        commission.cancel_feedback = feedback
        commission.refund_amount = refund
        commission.cancelled_at_stage = stage
        commission.save()

        return Response({
            "message": "Commission cancelled successfully.",
            "refund_amount": float(refund),
            "stage": stage,
        }, status=status.HTTP_200_OK)


class PayMilestoneView(AuthenticatedAPIView):
    """Creates a Xendit Invoice or processes fallback payment for milestones"""
    permission_classes = [permissions.AllowAny]

    @transaction.atomic
    def post(self, request, milestone_id):
        if CommissionMilestone.objects.filter(pk=milestone_id, commission_req__flow_version=2).exists():
            return Response({'error': 'This commission uses upfront funding and stage approval.'}, status=409)
        milestone = CommissionMilestone.objects.select_related('commission_req', 'commission_req__buyer').filter(pk=milestone_id).first()
        if not milestone:
            return Response({"error": "Milestone not found"}, status=status.HTTP_404_NOT_FOUND)

        buyer = self.get_request_user(request)
        if not buyer or buyer.pk != milestone.commission_req.buyer_id:
            return Response({'error': 'Only the commission buyer can pay.'}, status=403)

        if milestone.status == 'PAID':
            return Response({"error": "Milestone is already paid."}, status=status.HTTP_400_BAD_REQUEST)

        xendit_key = getattr(settings, 'XENDIT_SECRET_KEY', None)

        if not xendit_key:
            milestone.status = 'PAID'
            milestone.paid_at = timezone.now()
            milestone.save()

            comm = milestone.commission_req
            if milestone.milestone_number == 1:
                next_m = comm.milestones.filter(milestone_number=2).first()
                if next_m:
                    next_m.status = 'READY_TO_PAY'
                    next_m.save()
                comm.status = 'STAGE_1'
            elif milestone.milestone_number == 2:
                next_m = comm.milestones.filter(milestone_number=3).first()
                if next_m:
                    next_m.status = 'READY_TO_PAY'
                    next_m.save()
                comm.status = 'STAGE_2'
            elif milestone.milestone_number == 3:
                comm.status = 'COMPLETE'
            comm.save()

            return Response({
                "message": f"{milestone.stage_label} marked as PAID (Simulated).",
                "simulated": True,
                "commission_status": comm.status,
            }, status=status.HTTP_200_OK)

        external_id = f"commission-milestone-{milestone.milestone_id}-{int(timezone.now().timestamp())}"
        amount = int(float(milestone.amount))

        auth_header = base64.b64encode(f"{xendit_key}:".encode('utf-8')).decode('utf-8')
        headers = {
            "Authorization": f"Basic {auth_header}",
            "Content-Type": "application/json"
        }

        frontend_url = getattr(settings, 'FRONTEND_URL', 'http://localhost:8081')
        buyer_email = getattr(milestone.commission_req.buyer, 'email', '') or "buyer@artfiliere.com"

        payload = {
            "external_id": external_id,
            "amount": amount,
            "description": f"{milestone.commission_req.title} - {milestone.stage_label}",
            "payer_email": buyer_email,
            "currency": "PHP",
            "success_redirect_url": f"{frontend_url}/commissions?payment=success&milestone={milestone.milestone_id}",
            "failure_redirect_url": f"{frontend_url}/commissions?payment=failed",
        }

        try:
            xendit_res = requests.post("https://api.xendit.co/v2/invoices", json=payload, headers=headers)
            res_data = xendit_res.json()
            if xendit_res.status_code in [200, 201]:
                return Response({
                    "checkout_url": res_data.get("invoice_url"),
                    "external_id": external_id,
                    "simulated": False
                }, status=status.HTTP_200_OK)
            else:
                return Response({"error": res_data.get("message", "Failed to create Xendit invoice.")}, status=status.HTTP_400_BAD_REQUEST)
        except Exception as e:
            return Response({"error": f"Xendit connection error: {str(e)}"}, status=status.HTTP_500_INTERNAL_SERVER_ERROR)


class XenditMilestoneWebhookView(APIView):
    """Processes server-to-server webhook callbacks from Xendit"""
    permission_classes = [permissions.AllowAny]

    @transaction.atomic
    def post(self, request):
        import hmac
        expected = getattr(settings, 'XENDIT_WEBHOOK_TOKEN', '')
        if not expected or not hmac.compare_digest(str(request.headers.get('x-callback-token', '')), expected):
            return Response({'error': 'Invalid webhook authentication.'}, status=403)
        data = request.data
        status_val = data.get('status')
        external_id = data.get('external_id', '')

        if status_val in ['PAID', 'SETTLED'] and external_id.startswith('commission-milestone-'):
            try:
                parts = external_id.split('-')
                milestone_id = int(parts[2])

                milestone = CommissionMilestone.objects.select_related('commission_req').filter(pk=milestone_id).first()
                if milestone and milestone.commission_req.flow_version == 1 and milestone.status != 'PAID':
                    milestone.status = 'PAID'
                    milestone.paid_at = timezone.now()
                    milestone.save()

                    comm = milestone.commission_req
                    if milestone.milestone_number == 1:
                        next_m = comm.milestones.filter(milestone_number=2).first()
                        if next_m:
                            next_m.status = 'READY_TO_PAY'
                            next_m.save()
                        comm.status = 'STAGE_1'
                    elif milestone.milestone_number == 2:
                        next_m = comm.milestones.filter(milestone_number=3).first()
                        if next_m:
                            next_m.status = 'READY_TO_PAY'
                            next_m.save()
                        comm.status = 'STAGE_2'
                    elif milestone.milestone_number == 3:
                        comm.status = 'COMPLETE'
                    comm.save()

                    return Response({"message": "Milestone updated to PAID"}, status=status.HTTP_200_OK)
            except Exception as e:
                return Response({"error": str(e)}, status=status.HTTP_400_BAD_REQUEST)

        return Response({"message": "Webhook received"}, status=status.HTTP_200_OK)


class VerifyMilestonePaymentView(AuthenticatedAPIView):
    """Syncs payment status immediately when the user is redirected back from Xendit"""
    permission_classes = [permissions.AllowAny]

    @transaction.atomic
    def post(self, request, milestone_id):
        if CommissionMilestone.objects.filter(pk=milestone_id, commission_req__flow_version=2).exists():
            return Response({'error': 'This commission uses upfront funding and stage approval.'}, status=409)
        milestone = CommissionMilestone.objects.select_related('commission_req').filter(pk=milestone_id).first()
        if not milestone:
            return Response({"error": "Milestone not found"}, status=status.HTTP_404_NOT_FOUND)

        buyer = self.get_request_user(request)
        if not buyer or buyer.pk != milestone.commission_req.buyer_id:
            return Response({'error': 'Only the commission buyer can verify payment.'}, status=403)

        if milestone.status != 'PAID':
            milestone.status = 'PAID'
            milestone.paid_at = timezone.now()
            milestone.save()

            comm = milestone.commission_req
            if milestone.milestone_number == 1:
                next_m = comm.milestones.filter(milestone_number=2).first()
                if next_m:
                    next_m.status = 'READY_TO_PAY'
                    next_m.save()
                comm.status = 'STAGE_1'
            elif milestone.milestone_number == 2:
                next_m = comm.milestones.filter(milestone_number=3).first()
                if next_m:
                    next_m.status = 'READY_TO_PAY'
                    next_m.save()
                comm.status = 'STAGE_2'
            elif milestone.milestone_number == 3:
                comm.status = 'COMPLETE'
            comm.save()

        return Response({
            "message": "Milestone verified and updated to PAID",
            "commission_status": milestone.commission_req.status,
            "milestone_id": milestone.milestone_id,
        }, status=status.HTTP_200_OK)


class ProcessTrackView(AuthenticatedAPIView):
    permission_classes = [permissions.AllowAny]

    def get(self, request, pk):
        commission = CommissionRequest.objects.filter(pk=pk).first()
        if not commission:
            return Response({"error": "Commission not found"}, status=status.HTTP_404_NOT_FOUND)

        progress_photos = commission.photos.filter(photo_type='PROGRESS').order_by('uploaded_at')
        photos_data = [
            {
                "photo_id": p.photo_id,
                "image_url": p.image_url,
                "stage_number": p.stage_number,
                "progress_percentage": p.progress_percentage,
                "caption": p.caption,
                "uploaded_at": p.uploaded_at.isoformat(),
            }
            for p in progress_photos
        ]

        latest_pct = photos_data[-1]["progress_percentage"] if photos_data else 0

        return Response({
            "commission_req_id": commission.commission_req_id,
            "title": commission.title,
            "status": commission.status,
            "current_progress": latest_pct,
            "photos": photos_data,
        }, status=status.HTTP_200_OK)

    def post(self, request, pk):
        if CommissionRequest.objects.filter(pk=pk, flow_version=2).exists():
            return Response({'error': 'Use the commission workflow for this commission.'}, status=409)
        commission = CommissionRequest.objects.filter(pk=pk).first()
        if not commission:
            return Response({"error": "Commission not found"}, status=status.HTTP_404_NOT_FOUND)

        artist = self.get_request_user(request)
        if not artist or artist.pk != commission.artist_id:
            return Response({'error': 'Only the assigned artist can submit progress.'}, status=403)
        if commission.status not in ('IN_PROGRESS', 'STAGE_1', 'STAGE_2', 'STAGE_3'):
            return Response({'error': 'Only active accepted commissions can receive progress.'}, status=409)

        image_url = request.data.get('image_url')
        if not image_url:
            return Response({"error": "image_url is required."}, status=status.HTTP_400_BAD_REQUEST)

        stage_num = int(request.data.get('stage_number', 1))
        progress_percentage = int(request.data.get('progress_percentage', 33 if stage_num == 1 else 66 if stage_num == 2 else 100))
        caption = request.data.get('caption', f"Stage {stage_num} update")

        photo = CommissionPhoto.objects.create(
            commission_req=commission,
            image_url=image_url,
            photo_type='PROGRESS',
            stage_number=stage_num,
            progress_percentage=progress_percentage,
            caption=caption,
        )

        if stage_num == 3 or progress_percentage >= 100:
            commission.status = 'STAGE_3'
        elif stage_num == 2:
            commission.status = 'STAGE_2'
        else:
            commission.status = 'STAGE_1'
        commission.save()

        return Response({
            "message": f"Stage {stage_num} update posted successfully.",
            "progress_percentage": photo.progress_percentage,
        }, status=status.HTTP_201_CREATED)
