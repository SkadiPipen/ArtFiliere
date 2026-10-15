"""Versioned contractual resale schedule based on IPOPHL MC 2020-023, section 14.1.

This adopts the calculation schedule; it does not determine statutory eligibility,
registration, nationality, term, or whether a non-waivable legal right applies.
"""
from decimal import Decimal, ROUND_HALF_UP

POLICY = 'ipophil_mc_2020_023_s14_1_v1'
SOURCE = 'https://ilaw.ipophil.gov.ph/pluginfile.php/150/mod_resource/content/2/Copyright%20Reference%20Book%202021.pdf#page=56'
BANDS = [('150000', '5'), ('350000', '4'), ('600000', '3'), ('1000000', '2'), ('2000000', '1.5'), (None, '1')]
SUMMARY = ('Graduated royalties on consecutive portions of future resale artwork selling price, excluding VAT and before platform fees: '
           'first PHP 150,000 at 5%; next PHP 200,000 at 4%; next PHP 250,000 at 3%; next PHP 400,000 at 2%; '
           'next PHP 1,000,000 at 1.5%; remainder at 1%. Not charged on the initial commission. '
           'This contractual setting does not waive any statutory resale rights applicable to covered works.')


def calculate_resale(gross_selling_price):
    gross = Decimal(str(gross_selling_price))
    if not gross.is_finite() or gross < 0: raise ValueError('Invalid resale selling price.')
    previous = Decimal('0'); amount = Decimal('0')
    for upper, rate in BANDS:
        end = min(gross, Decimal(upper)) if upper is not None else gross
        amount += max(Decimal('0'), end - previous) * Decimal(rate) / 100
        if upper is None or gross <= Decimal(upper): break
        previous = Decimal(upper)
    return amount.quantize(Decimal('.01'), rounding=ROUND_HALF_UP)
