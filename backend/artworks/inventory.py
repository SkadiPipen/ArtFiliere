"""One physical copy per purchase; pending provider checkouts reserve stock.

Quantities are derived from durable payment state so repeated callbacks cannot
decrement twice. Call checkout validation while holding the artwork row lock.
"""
from django.db.models import Count, Q


def positive_quantity(value, label):
    if isinstance(value, bool) or not isinstance(value, (str, int)):
        raise ValueError(f'{label} must be a whole number from 1 to 99,999.')
    text = str(value)
    if not text.isascii() or not text.isdecimal() or not 1 <= int(text) <= 99999:
        raise ValueError(f'{label} must be a whole number from 1 to 99,999.')
    return int(text)


def listing_inventory(data, art_type, sale_type):
    kind = data.get('physical_format', 'original')
    if art_type != 'physical':
        return dict(physical_format='original', stock_quantity=1, edition_size=None)
    if kind not in ('original', 'print', 'limited_edition'):
        raise ValueError('Choose an original artwork, print or limited-edition print.')
    stock = positive_quantity(data.get('stock_quantity', 1), 'Available quantity')
    if kind == 'original' and stock != 1:
        raise ValueError('An original artwork must have an available quantity of 1.')
    edition = data.get('edition_size')
    if kind == 'limited_edition':
        edition = positive_quantity(edition, 'Total edition size')
        if edition < stock:
            raise ValueError('Available quantity cannot exceed the total edition size.')
    elif edition not in (None, ''):
        raise ValueError('Only limited-edition prints have a total edition size.')
    else:
        edition = None
    if 'auction' in str(sale_type).lower() and stock != 1:
        raise ValueError('An auction sells one physical item. Set available quantity to 1 or use Direct Sell.')
    return dict(physical_format=kind, stock_quantity=stock, edition_size=edition)


def inventory_summary(artwork):
    if artwork.art_type != 'physical':
        return None
    counts = artwork.payment_sessions.filter(is_simulated=False).aggregate(
        sold=Count('pk', filter=Q(status='paid')),
        reserved=Count('pk', filter=Q(status='pending')))
    return {'total': artwork.stock_quantity, **counts,
            'available': max(0, artwork.stock_quantity - counts['sold'] - counts['reserved'])}


def validate_copy_rights(artwork, exclusivity, scope):
    if artwork.art_type == 'physical' and artwork.physical_format != 'original':
        if exclusivity != 'non_exclusive' or (scope or {}).get('copyright_transfer'):
            raise ValueError('Physical print listings sell individual copies with non-exclusive terms. Exclusive rights and copyright assignments require a separate original artwork listing.')
