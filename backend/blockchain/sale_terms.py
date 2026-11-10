"""Capture negotiated licence fields, not the document's personal/delivery data."""
from copy import deepcopy
from .models import SaleTermsSnapshot
from .utils import sha256_bytes


def agreement_terms(agreement):
    if not agreement:
        return {}
    scope = agreement.license_scope or {}
    allowed = ('allow_resale', 'territory', 'territory_details', 'products', 'credit_name',
               'uses', 'duration_months', 'modifications', 'sublicensing', 'credit')
    permitted = {key: deepcopy(scope[key]) for key in allowed if key in scope}
    assignment = scope.get('copyright_transfer')
    if isinstance(assignment, dict):
        permitted['copyright_transfer'] = {key: deepcopy(assignment[key]) for key in
            ('kind', 'rights', 'effective', 'acknowledged', 'existing_commitments', 'artist_reserved_uses', 'additional_terms') if key in assignment}
    return {'license_type': agreement.license_type, 'exclusivity': agreement.exclusivity,
            'scope': permitted, 'compensation_type': agreement.compensation_type,
            'compensation_terms': {key: deepcopy(value) for key, value in (agreement.compensation_terms or {}).items()
                                   if key in ('subtype', 'rate', 'entries', 'details', 'calculation', 'royalty_percentage',
                                              'reporting_frequency', 'reporting_duration_months', 'reporting_policy',
                                              'review_mode', 'minimum_guarantee', 'calculation_basis')},
            'agreed_price': str(agreement.price),
            'artist_signed_at': agreement.artist_signed_at.isoformat() if agreement.artist_signed_at else None,
            'buyer_signed_at': agreement.buyer_signed_at.isoformat() if agreement.buyer_signed_at else None}


def capture_sale_terms(payment, source='sale_recording'):
    existing = SaleTermsSnapshot.objects.filter(payment=payment).first()
    if existing:
        return existing
    agreement = payment.agreement
    document = (agreement.document_snapshot or agreement.terms_snapshot) if agreement else ''
    return SaleTermsSnapshot.objects.get_or_create(payment=payment, defaults={
        'agreement': agreement, 'terms': agreement_terms(agreement), 'source': source,
        'document_hash': sha256_bytes(document.encode('utf-8')) if document else ''})[0]
