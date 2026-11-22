from datetime import date, datetime, timedelta
from zoneinfo import ZoneInfo

from django.db.models import OuterRef, Subquery
from django.utils import timezone
from django.utils.dateparse import parse_date, parse_datetime

from authentication.permissions import IsPlatformAdmin
from authentication.views import AuthenticatedAPIView
from auctions.models import AuctionListing
from blockchain.provenance import license_expiry
from commissions.models import CommissionMilestone, CommissionRequest
from messaging.models import Agreement, RoyaltyPeriod
from messaging.royalties import royalty_license_window, royalty_title
from users.models import ModeratorApplication, ResellerApplication, RoyaltyApplication, User
from wallets.models import AccountActionRequest, PaymentSession

from .document_details import tax_today
from .models import ArtistApplication, SwornDeclarationRenewal
from .sworn_renewals import private


def declaration_end(raw_year):
    try:
        year = int(str(raw_year))
        return date(year, 12, 31) if 1900 <= year <= 9999 else None
    except (TypeError, ValueError):
        return None


def records(category):
    if category in ('all', 'contracts', 'royalties'):
        agreements = Agreement.objects.filter(status='accepted', artist_signed_at__isnull=False, buyer_signed_at__isnull=False)
        agreements = agreements.select_related('artist', 'buyer', 'artwork', 'commission_contract__asset').defer(
            'terms_snapshot', 'document_snapshot', 'artist_presigned_document', 'artist_signature_image',
            'buyer_signature_image', 'artwork__image_data', 'commission_contract__funding_payload',
        )
        for item in agreements.iterator():
            if category in ('all', 'contracts'):
                months = (item.license_scope or {}).get('duration_months')
                end = parse_datetime(license_expiry(max(item.artist_signed_at, item.buyer_signed_at), months)) if type(months) is int and 0 < months <= 60 else None
                yield 'contracts', f'agreement-{item.pk}', royalty_title(item), item.artist.username, 'Agreement license term', end, False, None
            if category in ('all', 'royalties') and item.compensation_type in ('royalty', 'hybrid'):
                _, end, waiting = royalty_license_window(item)
                yield 'royalties', f'royalty-{item.pk}', royalty_title(item), item.artist.username, waiting or 'Royalty license term', end, True, None
        if category in ('all', 'royalties'):
            periods = RoyaltyPeriod.objects.exclude(status__in=['paid', 'zero_due']).values_list(
                'pk', 'agreement_id', 'agreement__artist__username', 'due_on', 'status', 'terms',
            )
            for pk, agreement, artist, end, status, terms in periods.iterator():
                if status in ('awaiting_report', 'rejected'):
                    report_due = end - timedelta(days=7) if terms.get('review_mode') == 'admin_held' else end
                    yield 'royalties', f'royalty-report-{pk}', f'Agreement #{agreement}', artist, 'Royalty report deadline', report_due, False, None
                if status == 'funded':
                    continue
                yield 'royalties', f'royalty-period-{pk}', f'Agreement #{agreement}', artist, 'Royalty payment deadline', end, False, None
    if category in ('all', 'permits'):
        for model, label in ((RoyaltyApplication, 'Royalty access permit'), (ResellerApplication, 'Reseller permit')):
            permits = model.objects.filter(status__in=['approved', 'pending', 'revoked'] if model is ResellerApplication else ['approved', 'pending'])
            for pk, owner, end, status in permits.values_list('pk', 'user__username', 'permit_expires_on', 'status').iterator():
                if status != 'revoked' or (end and end < tax_today()):
                    yield 'permits', f'{model._meta.model_name}-{pk}', label, owner, status.title(), end, False, None
    if category in ('all', 'declarations'):
        renewals = SwornDeclarationRenewal.objects.filter(artist_id=OuterRef('pk'), status='approved').order_by('-reviewed_at', '-pk')
        applications = ArtistApplication.objects.filter(user_id=OuterRef('pk'), status='approved').exclude(sworn_declaration='')
        artists = User.objects.filter(role=User.Role.ARTIST).annotate(
            renewed_year=Subquery(renewals.values('details__taxable_year')[:1]),
            application_year=Subquery(applications.values('document_details__taxable_year')[:1]),
        )
        for pk, owner, renewed, original in artists.values_list('pk', 'username', 'renewed_year', 'application_year').iterator():
            end = declaration_end(renewed or original)
            yield 'declarations', f'declaration-{pk}', 'Sworn declaration', owner, f'Taxable year {end.year}' if end else 'Taxable year not recorded', end, False, None
    if category in ('all', 'registration'):
        applications = ArtistApplication.objects.filter(status='approved', user__role='artist', bir_expires_on__isnull=False)
        for pk, owner, bir_end in applications.values_list('pk', 'user__username', 'bir_expires_on').iterator():
            yield 'registration', f'registration-{pk}', 'BIR registration record', owner, 'Recorded document expiry', bir_end, False, None
    if category in ('all', 'drivers'):
        drivers = ModeratorApplication.objects.filter(requested_role='driver', status='approved')
        for pk, user, email, details in drivers.values_list('pk', 'user__username', 'email', 'application_details').iterator():
            try:
                end = parse_date((details or {}).get('license_expires_on') or '')
            except (TypeError, ValueError):
                end = None
            yield 'drivers', f'driver-{pk}', 'Driver’s license', user or email, 'Approved driver application', end, False, None
    if category in ('all', 'auctions'):
        for pk, title, owner, status, end, pay, backup in AuctionListing.objects.exclude(status__in=['PENDING_APPROVAL', 'CANCELLED']).values_list(
            'pk', 'artwork__title', 'artist__username', 'status', 'end_time', 'payment_deadline', 'backup_offer_expires_at',
        ).iterator():
            yield 'auctions', f'auction-{pk}', title, owner, 'Auction closing', end, False, None
            if pay and status in ('PAYMENT_PENDING', 'FORFEITED', 'BACKUP_OFFER'):
                yield 'auctions', f'auction-payment-{pk}', title, owner, 'Winner payment deadline', pay, False, None
            if backup and status in ('BACKUP_OFFER', 'FORFEITED'):
                yield 'auctions', f'auction-offer-{pk}', title, owner, 'Runner-up offer expiry', backup, False, None
    if category in ('all', 'commissions'):
        ongoing = CommissionRequest.objects.exclude(status__in=['COMPLETE', 'CANCELLED'])
        for pk, title, artist, due, funding, status in ongoing.values_list('pk', 'title', 'artist__username', 'deadline', 'funding_due_at', 'status').iterator():
            yield 'commissions', f'commission-{pk}', title, artist, 'Completion deadline', due, False, None
            if funding and status == 'AWAITING_FUNDS':
                yield 'commissions', f'commission-funding-{pk}', title, artist, 'Funding deadline', funding, False, None
        reviews = CommissionMilestone.objects.filter(commission_req__in=ongoing, approved_at__isnull=True, review_due_at__isnull=False)
        for pk, title, owner, milestone, due in reviews.values_list('pk', 'commission_req__title', 'commission_req__buyer__username', 'milestone_number', 'review_due_at').iterator():
            yield 'commissions', f'milestone-{pk}', title, owner, f'Stage {milestone} review deadline', due, False, None
    if category in ('all', 'payments'):
        for pk, artwork, buyer in PaymentSession.objects.filter(status='expired').values_list('pk', 'artwork__title', 'buyer__username').iterator():
            yield 'payments', f'payment-{pk}', artwork, buyer, 'Expired checkout session', None, False, 'expired'
    if category in ('all', 'restrictions'):
        restrictions = AccountActionRequest.objects.filter(action='suspension', status='approved', expires_at__isnull=False, revoked_at__isnull=True)
        for pk, owner, end in restrictions.values_list('pk', 'target__username', 'expires_at').iterator():
            yield 'restrictions', f'restriction-{pk}', 'Account suspension', owner, 'Restriction end date', end, False, None


def record_status(end, exclusive, now, today):
    if end is None:
        return 'review'
    if isinstance(end, datetime):
        expired = end <= now
        remaining = (end.astimezone(ZoneInfo('Asia/Manila')).date() - today).days
    else:
        expired = end <= today if exclusive else end < today
        remaining = (end - today).days
    return 'expired' if expired else 'due_soon' if remaining <= 30 else 'current'


class AdminDeadlinesView(AuthenticatedAPIView):
    permission_classes = [IsPlatformAdmin]

    def get(self, request):
        category = request.query_params.get('category', 'all')
        status = request.query_params.get('status', 'all')
        categories = ('all', 'contracts', 'royalties', 'permits', 'declarations', 'registration', 'drivers', 'auctions', 'commissions', 'payments', 'restrictions')
        if category not in categories or status not in ('all', 'expired', 'due_soon', 'current', 'review'):
            return private({'error': 'Choose a valid category and status.'}, 400)
        try:
            page = max(1, int(request.query_params.get('page', '1')))
        except ValueError:
            return private({'error': 'Invalid page.'}, 400)
        now, today = timezone.now(), tax_today()
        results = []
        counts = dict.fromkeys(('expired', 'due_soon', 'current', 'review'), 0)
        for kind, key, title, owner, detail, end, exclusive, fixed_status in records(category):
            state = fixed_status or record_status(end, exclusive, now, today)
            counts[state] += 1
            if status in ('all', state):
                results.append({'id': key, 'category': kind, 'title': title, 'owner': owner,
                                'detail': detail, 'ends_on': end.isoformat() if end else None, 'status': state})
        order = dict(expired=0, due_soon=1, review=2, current=3)
        results.sort(key=lambda item: (order[item['status']], item['ends_on'] or '9999', item['id']))
        return private({'results': results[(page - 1) * 50:page * 50], 'count': len(results), 'counts': counts, 'page': page})
