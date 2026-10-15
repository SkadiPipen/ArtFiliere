from decimal import Decimal
from datetime import timedelta
from django.db import transaction
from django.utils import timezone
from rest_framework.exceptions import PermissionDenied, NotFound
from rest_framework.response import Response
from authentication.views import AuthenticatedAPIView
from artworks.models import Artwork
from wallets.models import WalletAccount
from .models import CommissionAsset, CommissionResale, CommissionLedger
from .lifecycle import money, Conflict


def license_active(asset):
    months = asset.license_terms.get('duration_months', 0)
    if not months: return True
    import calendar
    start = asset.created_at
    year, month = divmod(start.year * 12 + start.month - 1 + months, 12)
    end = start.replace(year=year, month=month + 1, day=min(start.day, calendar.monthrange(year, month + 1)[1]))
    return timezone.now() < end


class CommissionResaleView(AuthenticatedAPIView):
    @transaction.atomic
    def post(self, request, asset_id):
        user = self.get_request_user(request)
        asset = CommissionAsset.objects.select_for_update().filter(pk=asset_id).first()
        if not asset: raise NotFound('Asset not found.')
        if not user or asset.owner_id != user.pk: raise PermissionDenied('Only the current asset owner may list it.')
        if not asset.license_terms.get('allow_resale'): raise Conflict('This commission license does not permit resale.')
        if not license_active(asset): raise Conflict('The original license has expired.')
        if asset.resales.filter(payment__isnull=True).exclude(artwork__status='declined').exists(): raise Conflict('An active resale listing already exists.')
        price = money(request.data.get('price'))
        if price <= 0: raise Conflict('Set a positive listing price.')
        # Publish a watermarked preview, never the protected original.
        from PIL import Image, ImageDraw
        from io import BytesIO
        import base64
        submission = asset.submission
        if not submission.content_type.startswith('image/'): raise Conflict('An image preview is required for resale.')
        image = Image.open(BytesIO(bytes(submission.content))).convert('RGB'); image.thumbnail((1400, 1400))
        draw = ImageDraw.Draw(image)
        for y in range(20, image.height, 100):
            for x in range(10, image.width, 180): draw.text((x, y), 'ArtFiliere PREVIEW', fill=(200, 65, 65))
        output = BytesIO(); image.save(output, 'JPEG', quality=85)
        artwork = Artwork.objects.create(artist=user, title=asset.commission.title, description=f'Licensed resale of commission #{asset.commission_id}. Original artist: {asset.original_artist.username}.',
            category='Commission resale', price=price, art_type=asset.commission.art_type.lower(), image_data='data:image/jpeg;base64,' + base64.b64encode(output.getvalue()).decode(), status='pending', sale_type='DIRECT')
        CommissionResale.objects.create(asset=asset, seller=user, artwork=artwork)
        return Response({'artwork_id': artwork.pk, 'status': 'pending'}, status=201)


def allocate_royalty(payment):
    """Called within payment confirmation, before seller holding funds are posted."""
    resale = CommissionResale.objects.select_for_update().filter(artwork_id=payment.artwork_id).first()
    if not resale or resale.payment_id: return
    asset = CommissionAsset.objects.select_for_update().get(pk=resale.asset_id)
    if asset.owner_id != resale.seller_id: raise Conflict('Resale ownership changed.')
    amount = (payment.artist_amount * Decimal(str(asset.license_terms.get('royalty_percentage', 0))) / 100).quantize(Decimal('.01'))
    if payment.artist_id == asset.original_artist_id: amount = Decimal('0')
    payment.artist_amount -= amount; payment.save(update_fields=['artist_amount'])
    resale.royalty_amount = amount; resale.payment = payment; resale.save()
    if amount:
        wallet, _ = WalletAccount.objects.get_or_create(user=asset.original_artist)
        wallet = WalletAccount.objects.select_for_update().get(pk=wallet.pk)
        wallet.pending_balance += amount; wallet.save()
        CommissionLedger.objects.create(commission=asset.commission, reference=f'resale-{payment.pk}-royalty-held', kind='ROYALTY_HELD', amount=amount)
    asset.owner = payment.buyer; asset.save(update_fields=['owner'])


def settle_royalty(payment, refund=False):
    resale = CommissionResale.objects.select_for_update().filter(payment=payment).first()
    if not resale or resale.settled_at: return
    if resale.royalty_amount:
        wallet = WalletAccount.objects.select_for_update().get(user=resale.asset.original_artist)
        wallet.pending_balance -= resale.royalty_amount
        if not refund: wallet.available_balance += resale.royalty_amount
        wallet.save()
        CommissionLedger.objects.create(commission=resale.asset.commission, reference=f'resale-{payment.pk}-royalty-settled', kind='ROYALTY_REFUNDED' if refund else 'ROYALTY_AVAILABLE', amount=resale.royalty_amount)
    if refund:
        resale.asset.owner = resale.seller; resale.asset.save(update_fields=['owner'])
    resale.settled_at = timezone.now(); resale.save()
    if not refund and resale.royalty_amount:
        transaction.on_commit(lambda: remit_royalty(resale.pk))


@transaction.atomic
def remit_royalty(resale_id):
    import requests
    from django.conf import settings
    from .models import CommissionPayoutProfile
    resale = CommissionResale.objects.select_for_update().select_related('asset').get(pk=resale_id)
    if resale.payout_status in ('PROCESSING', 'SUCCEEDED', 'FAILED', 'REVERSED', 'RECONCILE') or not resale.settled_at: return
    profile = CommissionPayoutProfile.objects.filter(artist=resale.asset.original_artist).first()
    if not settings.COMMISSION_PAYOUTS_ENABLED or not settings.XENDIT_SECRET_KEY or not profile:
        resale.payout_status = 'CONFIG_REQUIRED'; resale.save(); return
    wallet = WalletAccount.objects.select_for_update().get(user=resale.asset.original_artist)
    if not resale.payout_reference:
        resale.payout_reference = f'commission-royalty-{resale.pk}'
        resale.payout_payload = {'reference_id': resale.payout_reference, 'recipient': profile.recipient,
            'payout_details': {'source_currency': 'PHP', 'source_amount': int(resale.royalty_amount * 100), 'destination_currency': 'PHP'},
            'source_of_fund': 'BUSINESS_REVENUE', 'purpose_code': 'OTHER', 'description': 'Commission resale royalty'}
        if wallet.available_balance < resale.royalty_amount: raise Conflict('Insufficient available royalty funds.')
        wallet.available_balance -= resale.royalty_amount; wallet.pending_balance += resale.royalty_amount; wallet.save()
    attempt, _ = CommissionLedger.objects.get_or_create(reference=resale.payout_reference + '-attempt', defaults={'commission': resale.asset.commission, 'kind': 'ROYALTY_PAYOUT_ATTEMPT', 'amount': 0})
    if not resale.payout_provider_id and attempt.created_at <= timezone.now() - timedelta(hours=23):
        resale.payout_status = 'RECONCILE'; resale.save(); return
    resale.payout_status = 'RETRY_PENDING'; resale.save()
    try:
        response = requests.post('https://api.xendit.co/v3/payouts', auth=(settings.XENDIT_SECRET_KEY, ''),
            headers={'api-version': '2025-09-01', 'idempotency-key': resale.payout_reference}, json=resale.payout_payload, timeout=20)
        response.raise_for_status(); data = response.json()
        resale.payout_provider_id = data['payout_id']; resale.payout_status = 'PROCESSING'; resale.save()
        royalty_status(resale, data)
    except (requests.RequestException, KeyError, ValueError):
        resale.payout_status = 'RETRY_PENDING'; resale.save()


@transaction.atomic
def royalty_status(resale, data):
    resale = CommissionResale.objects.select_for_update().get(pk=resale.pk)
    if data.get('payout_id') != resale.payout_provider_id or data.get('reference_id') != resale.payout_reference or data.get('source_currency') != 'PHP' or Decimal(str(data.get('source_amount', -1))) != resale.royalty_amount * 100:
        raise Conflict('Royalty payout details do not match.')
    wallet = WalletAccount.objects.select_for_update().get(user=resale.asset.original_artist)
    status = data.get('status')
    if status == 'SUCCEEDED' and resale.payout_status not in ('SUCCEEDED', 'REVERSED', 'FAILED'):
        wallet.pending_balance -= resale.royalty_amount; wallet.paid_out_balance += resale.royalty_amount; wallet.save()
        resale.payout_status = 'SUCCEEDED'; resale.save()
    elif status in ('FAILED', 'REJECTED') and resale.payout_status not in ('SUCCEEDED', 'FAILED', 'REVERSED'):
        wallet.pending_balance -= resale.royalty_amount; wallet.available_balance += resale.royalty_amount; wallet.save()
        resale.payout_status = 'FAILED'; resale.save()
    elif status == 'REVERSED' and resale.payout_status == 'SUCCEEDED':
        wallet.paid_out_balance -= resale.royalty_amount; wallet.available_balance += resale.royalty_amount; wallet.save()
        resale.payout_status = 'REVERSED'; resale.save()
