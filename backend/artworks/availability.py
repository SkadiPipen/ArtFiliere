"""Catalogue exclusivity uses the signed license term, not payment age."""
from django.utils import timezone
from messaging.royalties import add_months
from wallets.models import PaymentSession

def blocks_public_listing(agreement, today=None):
    if agreement.status != 'accepted' or agreement.exclusivity not in ('exclusive', 'sole'):
        return False
    if not agreement.artist_signed_at or not agreement.buyer_signed_at:
        return False
    start = timezone.localdate(max(agreement.artist_signed_at, agreement.buyer_signed_at))
    today = today or timezone.localdate()
    duration = agreement.license_scope.get('duration_months') or agreement.compensation_terms.get('reporting_duration_months')
    # Legacy paid exclusive contracts without a recorded term remain restricted.
    return start <= today and (type(duration) is not int or duration <= 0 or today < add_months(start, duration))

def restricted_artwork_ids():
    payments = PaymentSession.objects.filter(status='paid', agreement__status='accepted', agreement__exclusivity__in=['exclusive', 'sole']).select_related('agreement')
    return {payment.artwork_id for payment in payments if blocks_public_listing(payment.agreement)}
