"""Build the optional customer details without sending empty name fields."""
import uuid


def checkout_customer(buyer):
    # Accounts created by external authentication may have no profile names or
    # username. This is a checkout display label, not verified legal identity.
    given_names = (buyer.first_name or '').strip() or (buyer.username or '').strip() or 'Buyer'
    detail = {'given_names': given_names}
    surname = (buyer.last_name or '').strip()
    if surname:
        detail['surname'] = surname
    return {'reference_id': uuid.uuid4().hex, 'type': 'INDIVIDUAL',
            'individual_detail': detail}
