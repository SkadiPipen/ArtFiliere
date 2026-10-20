"""All-time admin totals. Payment volume, artist royalties and platform fees are distinct."""
from decimal import Decimal
from django.db.models import Sum
from django.utils import timezone
from artist_applications.models import ArtistApplication
from auctions.models import AuctionListing
from artworks.models import Artwork
from commissions.models import CommissionRequest, CommissionRefund, CommissionResale
from messaging.models import RoyaltyReceipt
from fulfillment.models import DeliveryOrder
from users.models import User
from .models import PaymentSession, IncidentReport, SupportTicket, AccountModerationRequest


def amount(rows, field):
    return rows.aggregate(total=Sum(field))['total'] or Decimal('0')


def admin_analytics():
    paid = PaymentSession.objects.filter(status='paid', is_simulated=False)
    funded = CommissionRequest.objects.filter(flow_version=2, funded_at__isnull=False)
    refunds = amount(CommissionRefund.objects.filter(status__in=['SUCCEEDED', 'WALLET_CREDITED']), 'amount')
    shop_volume = amount(paid, 'gross_amount')
    commission_volume = max(Decimal('0'), amount(funded, 'time_duration') - refunds)
    shop_fees = amount(paid, 'platform_fee')
    commission_fees = amount(funded.filter(status='COMPLETE'), 'platform_fee')
    commercial_royalties = amount(RoyaltyReceipt.objects.filter(period__status='paid'), 'amount')
    resale_royalties = amount(CommissionResale.objects.filter(payment__status='paid', payment__is_simulated=False), 'royalty_amount')
    artworks = Artwork.objects.all()
    return {
        'as_of': timezone.now().isoformat(), 'period': 'All time',
        'artworks': {'total': artworks.count(), 'digital': artworks.filter(art_type__iexact='digital').count(),
                     'physical': artworks.filter(art_type__iexact='physical').count(),
                     'approved': artworks.filter(status='approved').count(), 'pending': artworks.filter(status='pending').count(),
                     'declined': artworks.filter(status='declined').count()},
        'revenue': {
            'shop_collected': str(shop_volume), 'commission_collected': str(commission_volume),
            'commercial_royalties': str(commercial_royalties), 'resale_royalties': str(resale_royalties),
            'artist_royalties': str(commercial_royalties + resale_royalties),
            'shop_platform_fees': str(shop_fees), 'commission_platform_fees': str(commission_fees),
            'royalty_platform_fees': '0.00', 'total_platform_fees': str(shop_fees + commission_fees),
            'commission_holding': str(amount(funded, 'held_amount')),
            'shop_refunded': str(amount(PaymentSession.objects.filter(status='refunded', is_simulated=False), 'gross_amount')),
            'commission_refunded': str(refunds),
        },
        'activity': {
            'active_auctions': AuctionListing.objects.filter(status='ACTIVE', end_time__gt=timezone.now()).count(),
            'artist_applications': ArtistApplication.objects.filter(status='pending').count(),
            'users': User.objects.count(), 'artists': User.objects.filter(role='artist').count(),
            'paid_purchases': paid.count(), 'pending_payments': PaymentSession.objects.filter(status='pending', is_simulated=False).count(),
            'active_commissions': CommissionRequest.objects.filter(status__in=['STAGE_1', 'STAGE_2', 'STAGE_3', 'IN_PROGRESS']).count(),
            'completed_commissions': CommissionRequest.objects.filter(status='COMPLETE').count(),
            'disputed_commissions': CommissionRequest.objects.filter(disputed=True).exclude(status='CANCELLED').count(),
            'pending_deliveries': DeliveryOrder.objects.filter(status='pending').count(),
            'active_deliveries': DeliveryOrder.objects.exclude(status__in=['pending', 'delivered']).count(),
            'open_reports': IncidentReport.objects.filter(status__in=['open', 'under_review']).count(),
            'open_support_tickets': SupportTicket.objects.filter(status__in=['open', 'in_progress', 'awaiting_customer']).count(),
            'account_approvals': AccountModerationRequest.objects.filter(status='pending').count(),
        },
    }
