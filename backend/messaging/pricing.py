"""Contract-specific pricing; platform fees are never client-controlled."""
from decimal import Decimal, InvalidOperation, ROUND_HALF_UP
from artworks.pricing import base_cost


def positive(value, label, maximum):
    try:
        amount = Decimal(str(value))
        if not amount.is_finite() or amount <= 0 or amount > maximum or amount != amount.quantize(Decimal('.01')):
            raise ValueError()
        return amount
    except (InvalidOperation, ValueError, TypeError):
        raise ValueError(f'Enter a positive {label} with up to two decimals (maximum {maximum}).') from None


def validate_pricing(raw, artwork, checkout_amount):
    if raw is None:
        return {}
    if not isinstance(raw, dict) or raw.get('mode') not in ('multipliers', 'fixed'):
        raise ValueError('Choose multiplier pricing or an agreed fixed fee.')
    result = {'mode': raw['mode']}
    if raw['mode'] == 'multipliers':
        license_rate = positive(raw.get('license_multiplier'), 'license multiplier', Decimal('100'))
        exclusive_rate = positive(raw.get('exclusivity_multiplier'), 'exclusivity multiplier', Decimal('100'))
        base = base_cost(artwork)
        amount = (base * license_rate * exclusive_rate).quantize(Decimal('.01'), rounding=ROUND_HALF_UP)
        result.update(base_price=str(base), license_multiplier=str(license_rate), exclusivity_multiplier=str(exclusive_rate))
    else:
        amount = positive(raw.get('fixed_fee'), 'fixed license fee', Decimal('9999999999.99'))
    if amount <= 0:
        raise ValueError('The calculated license fee must be positive.')
    # Match checkout's split of the fee-inclusive total.
    total = (amount * Decimal('1.10')).quantize(Decimal('.01'), rounding=ROUND_HALF_UP)
    minimum = base_cost(artwork).quantize(Decimal('.01'), rounding=ROUND_HALF_UP)
    if total < minimum:
        raise ValueError(f'The proposed artwork price must be at least PHP {minimum} (artwork base price), excluding delivery.')
    if total > Decimal('9999999999.99') or total != checkout_amount:
        raise ValueError('Checkout amount does not match the agreed pricing plus the platform fee. Reload and review the proposal.')
    platform_fee = (total - total / Decimal('1.10')).quantize(Decimal('.01'), rounding=ROUND_HALF_UP)
    result.update(license_fee=str(total - platform_fee), platform_fee=str(platform_fee), platform_fee_percent='10', checkout_excluding_delivery=str(total))
    return result


def pricing_summary(values):
    if not values:
        return ''
    lines = ['Agreed pricing: ' + ('Calculated using negotiated multipliers' if values['mode'] == 'multipliers' else 'Agreed fixed license fee')]
    if values['mode'] == 'multipliers':
        lines.append(f"Base: PHP {values['base_price']} x license {values['license_multiplier']} x exclusivity {values['exclusivity_multiplier']}")
    lines += [f"License fee: PHP {values['license_fee']}", f"Platform fee (10%, not negotiable): PHP {values['platform_fee']}",
              f"Checkout excluding delivery: PHP {values['checkout_excluding_delivery']}",
              'Multipliers adjust the license price only. They do not change the granted rights or the separately agreed recurring royalty rate.']
    return '\n'.join(lines)
