import base64
from django.db import transaction
from django.db.models import Q
from django.http import HttpResponse
from django.utils import timezone
from rest_framework.response import Response
from authentication.views import AuthenticatedAPIView
from authentication.permissions import IsAuthenticatedUser
from artworks.models import Artwork
from wallets.models import PaymentSession
from .models import DeliveryOrder, PurchaseReview
from .services import delivery_context, png_bytes
from messaging.models import Agreement
from commissions.models import CommissionRequest, CommissionPhoto
from .certificates import issue_certificate, commission_completed


class DeliveryRoutesView(AuthenticatedAPIView):
    permission_classes = [IsAuthenticatedUser]
    def get(self, request, artwork_id):
        artwork = Artwork.objects.select_related('artist').filter(pk=artwork_id, status='approved').first()
        if not artwork:
            return Response({'error': 'Artwork not found.'}, status=404)
        buyer = self.get_request_user(request)
        agreement_id = request.query_params.get('agreement_id')
        if agreement_id:
            try:
                agreement = Agreement.objects.filter(pk=int(agreement_id), artwork=artwork).filter(Q(buyer=buyer) | Q(artist=buyer)).first()
            except (ValueError, TypeError):
                agreement = None
            if not agreement:
                return Response({'error': 'Agreement not found.'}, status=404)
            buyer = agreement.buyer
        if buyer.id == artwork.artist_id:
            return Response({'error': 'Choose a buyer negotiation to view delivery details.'}, status=400)
        try:
            return Response(delivery_context(artwork, buyer))
        except ValueError as error:
            return Response({'error': str(error)}, status=400)



def delivery_data(order):
    return {'id': order.id, 'status': order.status, 'status_label': order.get_status_display(),
            'pickup_address': order.pickup_address, 'delivery_address': order.delivery_address,
            'fee': str(order.fee), 'driver': order.driver.username if order.driver else None,
            'artwork': order.payment.artwork.title,
            'artist': {'name': order.payment.artist.username, 'phone': order.payment.artist.contact_number, 'address': order.pickup_address},
            'buyer': {'name': order.payment.buyer.username, 'phone': order.payment.buyer.contact_number, 'address': order.delivery_address}}


class PurchasesView(AuthenticatedAPIView):
    permission_classes = [IsAuthenticatedUser]
    def get(self, request):
        user = self.get_request_user(request)
        payments = PaymentSession.objects.filter(buyer=self.get_request_user(request)).select_related('artwork', 'artist', 'agreement', 'delivery_order__driver', 'review').order_by('-id')
        from messaging.royalties import purchase_royalty_reminder
        reminders = {}
        def reminder(agreement):
            if not agreement: return None
            if agreement.pk not in reminders: reminders[agreement.pk] = purchase_royalty_reminder(agreement, user)
            return reminders[agreement.pk]
        from messaging.download_access import royalty_download_block, restricted_preview
        download_blocks = {}
        def download_block(agreement):
            if not agreement: return None
            if agreement.pk not in download_blocks: download_blocks[agreement.pk] = royalty_download_block(agreement)
            return download_blocks[agreement.pk]
        rows = []
        for p in payments:
            delivery = getattr(p, 'delivery_order', None)
            review = getattr(p, 'review', None)
            paid = p.status == 'paid'
            certificate = issue_certificate(p) if paid else None
            blocked = download_block(p.agreement) if paid else None
            digital = p.agreement.delivery_type == 'digital' if p.agreement else p.artwork.art_type == 'digital'
            from wallets.auction_delivery import auction_agreement
            is_auction = bool(p.agreement and auction_agreement(p.agreement)) or str(p.artwork.sale_type).upper() == 'AUCTION'
            rows.append({'art_type': 'digital' if digital else 'physical', 'purchase_type': 'auction' if is_auction else 'direct', 'is_auction': is_auction,
                         'purchase_date': p.paid_at or p.created_at, 'created_at': p.created_at, 'id': p.id, 'title': p.artwork.title, 'artist': p.artist.username,
                         'image': restricted_preview(bytes(p.artwork_png) if p.artwork_png else png_bytes(p.artwork)) if paid and digital and blocked else ('data:image/png;base64,' + base64.b64encode(bytes(p.artwork_png)).decode() if digital and p.artwork_png else p.artwork.image_data) if paid else None,
                         'is_simulated': p.is_simulated, 'status': p.status, 'amount': str(p.gross_amount), 'agreement_id': p.agreement_id, 'verification_code': p.verification_code,
                         'royalty_reminder': reminder(p.agreement) if paid else None,
                         'artwork_id': p.artwork_id,
                         'checkout_url': p.checkout_url if p.status == 'pending' else None,
                         'download_block': blocked, 'can_download': paid and digital and not blocked, 'can_rate': paid and not review,
                         'certificate_code': certificate.code if certificate else None,
                         'certificate_path': f'purchases/{p.id}/coa/' if certificate else None,
                         'delivery': delivery_data(delivery) if delivery else None,
                         'review': {'artist_rating': review.artist_rating, 'artwork_rating': review.artwork_rating, 'comment': review.comment, 'artist_comment': review.artist_comment, 'artwork_comment': review.artwork_comment, 'images': review.images} if review else None})

        # Royalty-only licenses need no upfront checkout session to appear here.
        royalty_licenses = Agreement.objects.filter(
            buyer=user, status='accepted', compensation_type='royalty', artwork__isnull=False,
            artist_signed_at__isnull=False, buyer_signed_at__isnull=False,
            commission_contract__isnull=True,
        ).exclude(artist_signature_image='').exclude(buyer_signature_image='').exclude(
            pk__in=payments.values_list('agreement_id', flat=True)
        ).select_related('artwork', 'artist')
        for license in royalty_licenses:
            blocked = download_block(license)
            digital = license.delivery_type == 'digital'
            rows.append({
                'id': f'royalty-{license.pk}', 'agreement_id': license.pk,
                'artwork_id': license.artwork_id, 'title': license.artwork.title,
                'artist': license.artist.username, 'image': license.artwork.image_data,
                'art_type': 'digital' if digital else 'physical', 'purchase_type': 'direct',
                'purchase_date': max(license.artist_signed_at, license.buyer_signed_at),
                'created_at': license.created_at, 'status': 'active', 'amount': str(license.price),
                'is_royalty_license': True, 'is_simulated': False,
                'royalty_reminder': reminder(license), 'download_block': blocked,
                'can_download': digital and not blocked, 'can_rate': False,
                'download_path': f'purchases/royalty-licenses/{license.pk}/png/' if digital else None,
                'download_filename': f'artwork-{license.artwork_id}.png', 'download_mime': 'image/png',
            })

        commissions = CommissionRequest.objects.filter(buyer=user).select_related('artist', 'agreement', 'purchase_review').prefetch_related('milestones', 'photos').order_by('-commission_req_id')
        for c in commissions:
            if c.flow_version == 2 and not c.funded_at and c.status != 'COMPLETE': continue
            complete = commission_completed(c)
            blocked = download_block(c.agreement) if complete else None
            digital = c.art_type.lower() == 'digital'
            review = getattr(c, 'purchase_review', None)
            image = None; submission = None
            if c.flow_version == 2:
                from commissions.models import CommissionSubmission
                submission = CommissionSubmission.objects.filter(milestone__commission_req=c, milestone__milestone_number=3).order_by('-pk').first()
                if submission and submission.content_type.startswith('image/'):
                    from PIL import Image, ImageDraw
                    from io import BytesIO
                    with Image.open(BytesIO(bytes(submission.content))) as original:
                        preview = original.convert('RGB'); preview.thumbnail((900, 900))
                        ImageDraw.Draw(preview).text((10, 10), 'ArtFiliere preview', fill=(190, 70, 70))
                        output = BytesIO(); preview.save(output, 'JPEG', quality=80)
                        image = 'data:image/jpeg;base64,' + base64.b64encode(output.getvalue()).decode()
            else:
                photo = c.photos.filter(photo_type='PROGRESS').order_by('-progress_percentage').first()
                image = photo.image_url if photo else None
            certificate = issue_certificate(c, commission=True) if complete else None
            from commissions.shipping import delivery_status
            delivery = delivery_status(c) if not digital else None
            if delivery:
                delivery['driver'] = delivery['driver']['name'] if delivery['driver'] else None
            elif not digital:
                delivery = {'status': 'delivered' if c.delivered_at else 'in_production',
                    'status_label': 'Received by buyer' if c.delivered_at else 'In production / awaiting dispatch',
                    'driver': None, 'delivery_address': c.locked_terms.get('delivery_address', ''), 'fee': str(c.locked_terms.get('delivery_fee', '0'))}
            completion_dates = [m.approved_at or m.paid_at for m in c.milestones.all() if m.milestone_number == 3 and (m.approved_at or m.paid_at)]
            purchase_date = max(completion_dates) if complete and completion_dates else c.funded_at or c.created_at
            asset = getattr(c, 'asset', None)
            provenance = getattr(asset, 'provenance_origin', None) if asset else None
            rows.append({'art_type': c.art_type.lower(), 'purchase_type': 'commission', 'is_auction': False,
                'provenance_id': str(provenance.pk) if provenance else None,
                'purchase_date': purchase_date, 'created_at': c.created_at, 'id': f'commission-{c.pk}', 'commission_id': c.pk, 'is_commission': True,
                'title': c.title, 'artist': c.artist.username, 'image': image, 'is_simulated': False,
                'status': 'paid' if complete else 'cancelled' if c.status == 'CANCELLED' else 'in_progress',
                'commission_status': c.status, 'amount': str(c.time_duration), 'agreement_id': c.agreement_id,
                'royalty_reminder': reminder(c.agreement),
                'checkout_url': None, 'download_block': blocked, 'can_download': bool(complete and digital and (submission or image) and not blocked),
                'download_path': f'commissions/flow/{c.pk}/files/{submission.pk}/' if complete and digital and submission else None,
                'download_filename': submission.filename if submission else None,
                'download_mime': submission.content_type if submission else None,
                'can_rate': bool(complete and not review),
                'certificate_code': certificate.code if certificate else None,
                'certificate_path': f'commissions/{c.pk}/coa/' if certificate else None,
                'delivery': delivery,
                'review': {'artist_rating': review.artist_rating, 'artwork_rating': review.artwork_rating,
                           'comment': review.comment, 'artist_comment': review.artist_comment, 'artwork_comment': review.artwork_comment, 'images': review.images} if review else None})

        rows.sort(key=lambda row: (row['purchase_date'], str(row['id'])), reverse=True)
        return Response(rows)


class PurchaseCertificateView(AuthenticatedAPIView):
    permission_classes = [IsAuthenticatedUser]

    def get(self, request, payment_id=None, commission_id=None):
        user = self.get_request_user(request)
        if commission_id is not None:
            source = CommissionRequest.objects.filter(pk=commission_id, buyer=user).first()
        else:
            source = PaymentSession.objects.filter(pk=payment_id, buyer=user, status='paid').first()
        certificate = issue_certificate(source, commission=commission_id is not None) if source else None
        if not certificate:
            return Response({'error': 'A certificate is available only for your confirmed purchase or fully paid completed commission.'}, status=404)
        response = HttpResponse(bytes(certificate.pdf), content_type='application/pdf')
        response['Content-Disposition'] = f'attachment; filename="{certificate.code}.pdf"'
        response['Cache-Control'] = 'private, no-store'
        return response


class PurchaseDownloadView(AuthenticatedAPIView):
    permission_classes = [IsAuthenticatedUser]
    def get(self, request, payment_id):
        payment = PaymentSession.objects.select_related('artwork', 'agreement').filter(pk=payment_id, buyer=self.get_request_user(request), status='paid').first()
        if not payment:
            return Response({'error': 'Paid purchase not found.'}, status=404)
        if (payment.agreement and payment.agreement.delivery_type != 'digital') or (not payment.agreement and payment.artwork.art_type != 'digital'):
            return Response({'error': 'This artwork is delivered physically.'}, status=409)
        from messaging.download_access import royalty_download_block
        blocked = royalty_download_block(payment.agreement)
        if blocked:
            return Response({'error': blocked['message'], 'download_block': blocked}, status=403)
        try:
            payload = bytes(payment.artwork_png) if payment.artwork_png else png_bytes(payment.artwork)
        except ValueError as error:
            return Response({'error': str(error)}, status=409)
        response = HttpResponse(payload, content_type='image/png')
        response['Content-Disposition'] = f'attachment; filename="artwork-{payment.artwork_id}.png"'
        response['Cache-Control'] = 'private, no-store'
        return response


class RoyaltyLicenseDownloadView(AuthenticatedAPIView):
    permission_classes = [IsAuthenticatedUser]

    def get(self, request, agreement_id):
        license = Agreement.objects.select_related('artwork').filter(
            pk=agreement_id, buyer=self.get_request_user(request), status='accepted',
            compensation_type='royalty', artwork__isnull=False, delivery_type='digital',
            artist_signed_at__isnull=False, buyer_signed_at__isnull=False,
            commission_contract__isnull=True,
        ).exclude(artist_signature_image='').exclude(buyer_signature_image='').first()
        if not license:
            return Response({'error': 'Signed royalty license not found.'}, status=404)
        from messaging.download_access import royalty_download_block
        blocked = royalty_download_block(license)
        if blocked:
            return Response({'error': blocked['message'], 'download_block': blocked}, status=403)
        try:
            payload = png_bytes(license.artwork)
        except ValueError as error:
            return Response({'error': str(error)}, status=409)
        response = HttpResponse(payload, content_type='image/png')
        response['Content-Disposition'] = f'attachment; filename="artwork-{license.artwork_id}.png"'
        response['Cache-Control'] = 'private, no-store'
        return response


class PurchaseReviewView(AuthenticatedAPIView):
    permission_classes = [IsAuthenticatedUser]
    @transaction.atomic
    def post(self, request, payment_id=None, commission_id=None):
        if commission_id is not None:
            source = CommissionRequest.objects.select_for_update().filter(pk=commission_id, buyer=self.get_request_user(request)).first()
            if not source: return Response({'error': 'Commission purchase not found.'}, status=404)
            if not commission_completed(source): return Response({'error': 'Complete the commission, including physical receipt and final approval, before rating.'}, status=409)
            lookup = {'commission': source}
        else:
            source = PaymentSession.objects.select_for_update().filter(pk=payment_id, buyer=self.get_request_user(request), status='paid').first()
            if not source: return Response({'error': 'Paid purchase not found.'}, status=404)
            lookup = {'payment': source}
        return self.save_review(request, lookup)

    def save_review(self, request, lookup):
        if PurchaseReview.objects.filter(**lookup).exists():
            return Response({'error': 'You have already rated this purchase.'}, status=409)
        ratings = {key: request.data.get(key) for key in ('artist_rating', 'artwork_rating')}
        if any(type(v) is not int or not 1 <= v <= 5 for v in ratings.values()):
            return Response({'error': 'Rate both the artist and artwork from 1 to 5.'}, status=400)
        comment = request.data.get('comment', '')
        if not isinstance(comment, str) or len(comment) > 2000:
            return Response({'error': 'Comment must be at most 2,000 characters.'}, status=400)
        comments = {key: request.data.get(key, '') for key in ('artist_comment', 'artwork_comment')}
        if any(not isinstance(value, str) or len(value) > 2000 for value in comments.values()):
            return Response({'error': 'Each review must be at most 2,000 characters.'}, status=400)
        from .review_images import validate_review_images
        try:
            images = validate_review_images(request.data.get('images', []))
        except ValueError as exc:
            return Response({'error': str(exc)}, status=400)
        PurchaseReview.objects.create(**lookup, images=images, comment=comment.strip(), **{key: value.strip() for key, value in comments.items()}, **ratings)
        return Response({'saved': True}, status=201)


from .riders import RiderOrdersView


class DriverOrdersView(RiderOrdersView):
    permission_classes = [IsAuthenticatedUser]
    def get(self, request):
        user = self.get_request_user(request)
        if user.role != 'driver':
            return Response({'error': 'Driver access required.'}, status=403)
        orders = DeliveryOrder.objects.filter(Q(driver=user) | Q(driver=None, status='pending'), payment__status='paid').select_related('payment__artwork', 'payment__artist', 'payment__buyer', 'driver').order_by('-id')
        return Response([delivery_data(order) for order in orders])

