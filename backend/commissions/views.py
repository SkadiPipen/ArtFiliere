from rest_framework.views import APIView
from rest_framework.response import Response
from rest_framework import status, permissions
from django.utils import timezone
from django.contrib.auth import get_user_model
from django.db import transaction

# 1. Imported CommissionPhoto
from .models import CommissionRequest, CommissionMilestone, CommissionPhoto

User = get_user_model()


def resolve_user(request):
    if request.user and request.user.is_authenticated:
        return request.user
    email = request.data.get('user_email') or request.query_params.get('user_email')
    if email:
        return User.objects.filter(email=email).first()
    return None


class CommissionRequestView(APIView):
    permission_classes = [permissions.AllowAny]

    def get(self, request):
        """Fetch commission history for either buyer or artist"""
        user = resolve_user(request)
        role = request.query_params.get('role', 'buyer')

        if not user:
            commissions = CommissionRequest.objects.all().order_by('-commission_req_id')
        elif role == 'artist':
            commissions = CommissionRequest.objects.filter(artist=user).order_by('-commission_req_id')
        else:
            commissions = CommissionRequest.objects.filter(buyer=user).order_by('-commission_req_id')

        data = []
        for c in commissions:
            milestones = [
                {
                    "milestone_id": m.milestone_id,
                    "milestone_number": float(m.milestone_number),
                    "status": m.status,
                    "percentage": m.percentage,
                    "amount": m.amount,
                    "paid_at": m.paid_at.isoformat() if m.paid_at else None,
                }
                for m in c.milestones.all().order_by('milestone_number')
            ]
            data.append({
                "commission_req_id": c.commission_req_id,
                "buyer_name": getattr(c.buyer, 'username', 'Buyer'),
                "artist_name": getattr(c.artist, 'username', 'Artist'),
                "title": c.title,
                "description": c.description,
                "art_type": getattr(c, 'art_type', 'Physical'),
                "tags": getattr(c, 'tags', ''),
                "time_duration": float(c.time_duration or 0),
                "is_rush_job": bool(c.is_rush_job),
                "status": c.status,
                "created_at": c.created_at.isoformat() if c.created_at else None,
                "deadline": c.deadline.isoformat() if c.deadline else None,
                "milestones": milestones,
            })

        return Response(data, status=status.HTTP_200_OK)

    @transaction.atomic
    def post(self, request):
        """Submit a new commission request (Buyer)"""
        data = request.data
        buyer = resolve_user(request) or User.objects.first()
        artist_id = data.get('artist_id')

        if not artist_id:
            return Response({"error": "artist_id is required."}, status=status.HTTP_400_BAD_REQUEST)

        # Parse deadline
        deadline = timezone.now() + timezone.timedelta(days=14)
        if data.get('deadline'):
            try:
                deadline = timezone.datetime.fromisoformat(data['deadline'])
            except Exception:
                pass

        total_price = float(data.get('time_duration', 2000.00) or 2000.00)

        # Build commission with fields from the new form
        commission = CommissionRequest.objects.create(
            buyer=buyer,
            artist_id=artist_id,
            title=data.get('title', 'Custom Art Commission'),
            description=data.get('description', ''),
            art_type=data.get('art_type', 'Physical'),
            tags=data.get('tags', ''),
            time_duration=total_price,
            deadline=deadline,
            is_rush_job=bool(data.get('is_rush_job', False)),
            status='PENDING',
        )

        # Save any initial reference images provided by the buyer
        ref_images = data.get('reference_images', [])
        if isinstance(ref_images, list):
            for img in ref_images:
                if img:
                    CommissionPhoto.objects.create(
                        commission_req=commission,
                        image_url=str(img),
                        photo_type='REFERENCE',
                        caption="Buyer reference",
                    )

        # Milestone 1: 50% upfront deposit
        # Milestone 2: 50% final upon completion
        half = int(total_price / 2)
        CommissionMilestone.objects.create(
            commission_req=commission,
            milestone_number=1,
            percentage=50,
            amount=half,
            status='PENDING',
        )
        CommissionMilestone.objects.create(
            commission_req=commission,
            milestone_number=2,
            percentage=50,
            amount=half,
            status='PENDING',
        )

        return Response({
            "message": "Commission request created",
            "commission_req_id": commission.commission_req_id,
        }, status=status.HTTP_201_CREATED)


class ManageCommissionStatusView(APIView):
    """Artist: Accept or Cancel a Commission"""
    permission_classes = [permissions.AllowAny]

    def post(self, request, pk):
        action = request.data.get('action')  # 'ACCEPT' or 'REJECT'
        commission = CommissionRequest.objects.filter(pk=pk).first()
        if not commission:
            return Response({"error": "Commission not found"}, status=status.HTTP_404_NOT_FOUND)

        if action == 'ACCEPT':
            commission.status = 'IN_PROGRESS'
            commission.save()
            return Response({"message": "Commission accepted and in-progress.", "status": commission.status})
        elif action == 'REJECT':
            commission.status = 'CANCELLED'
            commission.save()
            return Response({"message": "Commission declined.", "status": commission.status})

        return Response({"error": "Invalid action. Use ACCEPT or REJECT."}, status=status.HTTP_400_BAD_REQUEST)


class PayMilestoneView(APIView):
    """Buyer / Artist: Process Milestone Payments"""
    permission_classes = [permissions.AllowAny]

    @transaction.atomic
    def post(self, request, milestone_id):
        milestone = CommissionMilestone.objects.select_related('commission_req').filter(pk=milestone_id).first()
        if not milestone:
            return Response({"error": "Milestone not found"}, status=status.HTTP_404_NOT_FOUND)

        milestone.status = 'PAID'
        milestone.paid_at = timezone.now()
        milestone.save()

        # Check if all milestones are paid; if so, mark commission complete
        all_paid = not milestone.commission_req.milestones.filter(status='PENDING').exists()
        if all_paid:
            milestone.commission_req.status = 'COMPLETE'
            milestone.commission_req.save()

        return Response({
            "message": f"Milestone #{milestone.milestone_number} marked as PAID.",
            "commission_status": milestone.commission_req.status,
        }, status=status.HTTP_200_OK)


class ProcessTrackView(APIView):
    permission_classes = [permissions.AllowAny]

    def get(self, request, pk):
        """Fetch timeline of progress images and current % for Process Track screen"""
        commission = CommissionRequest.objects.filter(pk=pk).first()
        if not commission:
            return Response({"error": "Commission not found"}, status=status.HTTP_404_NOT_FOUND)

        progress_photos = commission.photos.filter(photo_type='PROGRESS').order_by('uploaded_at')
        reference_photos = commission.photos.filter(photo_type='REFERENCE')

        photos_data = [
            {
                "photo_id": p.photo_id,
                "image_url": p.image_url,
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
            "reference_count": reference_photos.count(),
        }, status=status.HTTP_200_OK)

    def post(self, request, pk):
        """Artist uploads a new progress photo update (e.g., 33% sketch, 66% lineart, 100% final)"""
        commission = CommissionRequest.objects.filter(pk=pk).first()
        if not commission:
            return Response({"error": "Commission not found"}, status=status.HTTP_404_NOT_FOUND)

        image_url = request.data.get('image_url')
        if not image_url:
            return Response({"error": "image_url is required."}, status=status.HTTP_400_BAD_REQUEST)

        progress_percentage = int(request.data.get('progress_percentage', 33))
        caption = request.data.get('caption', f"Stage update: {progress_percentage}%")

        photo = CommissionPhoto.objects.create(
            commission_req=commission,
            image_url=image_url,
            photo_type='PROGRESS',
            progress_percentage=progress_percentage,
            caption=caption,
        )

        if progress_percentage >= 100:
            commission.status = 'COMPLETE'
            commission.save()
        elif commission.status == 'PENDING':
            commission.status = 'IN_PROGRESS'
            commission.save()

        return Response({
            "message": "Progress update posted",
            "progress_percentage": photo.progress_percentage,
        }, status=status.HTTP_201_CREATED)