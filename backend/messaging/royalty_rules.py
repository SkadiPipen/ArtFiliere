"""Structured royalty calculations; all money is calculated on the server."""
from decimal import Decimal, InvalidOperation, ROUND_HALF_UP

MONTHS = {'monthly': 1, 'quarterly': 3, 'semi_annually': 6, 'annually': 12}


def number(value, label, maximum=Decimal('9999999999.99')):
    try:
        value = Decimal(str(value))
        if not value.is_finite() or value < 0 or value > maximum or value != value.quantize(Decimal('.01')):
            raise ValueError()
        return value
    except (InvalidOperation, ValueError, TypeError):
        raise ValueError(f'Enter a valid nonnegative {label} with at most two decimals.') from None


def validate_rules(raw, subtype):
    rules = raw.get('calculation', {})
    if not isinstance(rules, dict):
        raise ValueError('Provide structured royalty calculation rules.')
    result = {}
    if subtype in ('tiered', 'upfront_tiered', 'minimum_guaranteed', 'minimum_guarantee_royalty'):
        basis = rules.get('basis')
        if basis not in ('units', 'gross_sales', 'net_sales', 'profit'):
            raise ValueError('Select units, gross sales, net sales or profit as the calculation basis.')
        result['basis'] = basis
        if 'tiered' in subtype:
            tiers = rules.get('tiers')
            if not isinstance(tiers, list) or not 1 <= len(tiers) <= 10:
                raise ValueError('Provide between 1 and 10 graduated royalty tiers.')
            result['tiers'] = []
            previous = Decimal('-1')
            for index, tier in enumerate(tiers):
                if not isinstance(tier, dict):
                    raise ValueError('Invalid royalty tier.')
                threshold = number(tier.get('from'), 'tier threshold')
                rate = number(tier.get('rate'), 'tier rate', Decimal('9999999999.99') if basis == 'units' else Decimal('100'))
                if (index == 0 and threshold != 0) or threshold <= previous or rate <= 0 or (basis == 'units' and threshold != int(threshold)):
                    raise ValueError('Tiers must start at zero, increase, and have positive rates; unit thresholds must be whole numbers.')
                previous = threshold
                result['tiers'].append({'from': str(threshold), 'rate': str(rate)})
        else:
            rate = number(rules.get('rate'), 'guarantee royalty rate', Decimal('9999999999.99') if basis == 'units' else Decimal('100'))
            if rate <= 0:
                raise ValueError('The royalty rate must be positive.')
            result['rate'] = str(rate)
            # Guarantee applies to EACH reporting period, and offsets calculated royalties.
            result['guarantee_scope'] = 'each_period'
    return result


def basis_for(terms):
    subtype = terms['subtype'].removeprefix('upfront_')
    return {'per_unit': 'units', 'gross_sales': 'gross_sales', 'net_sales': 'net_sales', 'profit_based': 'profit'}.get(subtype, terms.get('calculation', {}).get('basis'))


def calculate(terms, metrics):
    basis = basis_for(terms)
    required = {'units': ['units'], 'gross_sales': ['gross_sales'], 'net_sales': ['gross_sales', 'deductions'], 'profit': ['gross_sales', 'deductions', 'costs']}.get(basis)
    if not required:
        raise ValueError('This agreement requires structured calculation terms before reporting can begin.')
    if not isinstance(metrics, dict):
        raise ValueError('Provide the required reporting information.')
    values = {key: number(metrics.get(key), key.replace('_', ' ')) for key in required}
    if basis == 'units' and values['units'] != int(values['units']):
        raise ValueError('Items sold must be a whole number.')
    base = values.get('units', values.get('gross_sales', Decimal(0)))
    base -= values.get('deductions', 0) + values.get('costs', 0)
    if base < 0:
        # Losses yield zero royalty; negative earnings never create a credit.
        base = Decimal(0)
    rules = terms.get('calculation', {})
    if 'tiered' in terms['subtype']:
        amount = Decimal(0)
        tiers = rules['tiers']
        for index, tier in enumerate(tiers):
            start = Decimal(tier['from'])
            end = Decimal(tiers[index + 1]['from']) if index + 1 < len(tiers) else base
            amount += max(Decimal(0), min(base, end) - start) * Decimal(tier['rate'])
    else:
        amount = base * Decimal(terms.get('rate') or rules['rate'])
    if basis != 'units':
        amount /= 100
    if terms['subtype'] in ('minimum_guaranteed', 'minimum_guarantee_royalty'):
        amount = max(amount, Decimal(terms['minimum_guarantee']))
    amount = amount.quantize(Decimal('.01'), rounding=ROUND_HALF_UP)
    if amount > Decimal('9999999999.99'):
        raise ValueError('The calculated royalty exceeds the supported payment amount.')
    return {key: str(value) for key, value in values.items()}, amount
