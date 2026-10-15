from datetime import date
from decimal import Decimal, InvalidOperation


OPTIONS = {
    'one_time': {
        'one_time_payment': 'One-Time Payment',
        'milestone_payments': 'Milestone Payments',
        'installment_payments': 'Installment Payments',
        'per_deliverable_fee': 'Per-Deliverable Fee',
    },
    'royalty': {
        'per_unit': 'Per-Unit Royalty',
        'gross_sales': 'Gross Sales Royalty',
        'net_sales': 'Net Sales Royalty',
        'profit_based': 'Profit-Based Royalty',
        'tiered': 'Tiered Royalty',
        'minimum_guaranteed': 'Minimum Guaranteed Royalty',
    },
    'hybrid': {
        'upfront_per_unit': 'Upfront Fee + Per-Unit Royalty',
        'upfront_gross_sales': 'Upfront Fee + Gross Sales Royalty',
        'upfront_net_sales': 'Upfront Fee + Net Sales Royalty',
        'upfront_profit_based': 'Upfront Fee + Profit-Based Royalty',
        'upfront_tiered': 'Upfront Fee + Tiered Royalty',
        'minimum_guarantee_royalty': 'Minimum Guarantee + Royalty',
    },
}
FREQUENCIES = {'monthly': 'Monthly', 'quarterly': 'Quarterly', 'semi_annually': 'Semi-Annually', 'annually': 'Annually'}
RATE_TYPES = {'per_unit', 'gross_sales', 'net_sales', 'profit_based', 'upfront_per_unit', 'upfront_gross_sales', 'upfront_net_sales', 'upfront_profit_based'}
SCHEDULE_TYPES = {'milestone_payments', 'installment_payments', 'per_deliverable_fee'}
DETAIL_TYPES = { 'net_sales', 'profit_based', 'tiered', 'minimum_guaranteed', 'upfront_net_sales', 'upfront_profit_based', 'upfront_tiered', 'minimum_guarantee_royalty'}


def positive_decimal(value, label, maximum=Decimal('9999999999.99')):
    try:
        number = Decimal(str(value))
        if not number.is_finite() or number <= 0 or number > maximum or number != number.quantize(Decimal('0.01')):
            raise ValueError()
    except (InvalidOperation, ValueError):
        raise ValueError(f'Enter a positive {label} with at most two decimal places (maximum {maximum}).') from None
    return str(number)


def validate_compensation(data, user, license_type):
    category = data.get('compensation_type', 'one_time')
    if category not in OPTIONS:
        raise ValueError('Choose Flat-Fee, Royalty-Based, or Hybrid compensation.')
    if category != 'one_time':
        if license_type != 'commercial':
            raise ValueError('Royalty-based and hybrid compensation require a commercial license.')
        if not user.royalty_enabled:
            raise PermissionError('Admin approval of an unexpired business permit is required for royalty access.')
    raw = data.get('compensation_terms', {})
    if not isinstance(raw, dict):
        raise ValueError('Provide valid commercial compensation settings.')
    subtype = raw.get('subtype', 'one_time_payment' if category == 'one_time' else '')
    if subtype not in OPTIONS[category] or (license_type != 'commercial' and subtype != 'one_time_payment'):
        raise ValueError('Choose a compensation option that matches the selected license and category.')
    if license_type != 'commercial':
        return {}
    result = {'subtype': subtype}
    if subtype in SCHEDULE_TYPES:
        entries = raw.get('entries')
        if not isinstance(entries, list) or not 1 <= len(entries) <= 20:
            raise ValueError('Add between 1 and 20 payment entries.')
        result['entries'] = []
        for index, entry in enumerate(entries, 1):
            if not isinstance(entry, dict):
                raise ValueError(f'Provide valid fields for payment {index}.')
            name = entry.get('name', '')
            acceptance = entry.get('acceptance', '')
            if not isinstance(name, str) or not name.strip() or len(name) > 200:
                raise ValueError(f'Enter a payment {index} name (up to 200 characters).')
            if not isinstance(acceptance, str) or len(acceptance) > 500 or (subtype != 'installment_payments' and not acceptance.strip()):
                raise ValueError(f'Define completion and acceptance for payment {index} (up to 500 characters).')
            due_date = entry.get('due_date', '')
            try:
                if not isinstance(due_date, str) or date.fromisoformat(due_date).isoformat() != due_date:
                    raise ValueError()
            except (ValueError, TypeError):
                raise ValueError(f'Enter a valid payment {index} due date (YYYY-MM-DD).') from None
            result['entries'].append({'name': name.strip(), 'amount': positive_decimal(entry.get('amount'), f'payment {index} amount'), 'due_date': due_date, 'acceptance': acceptance.strip()})
    if subtype in RATE_TYPES:
        maximum = Decimal('9999999999.99') if 'per_unit' in subtype else Decimal('100')
        result['rate'] = positive_decimal(raw.get('rate'), 'royalty rate', maximum)
    if subtype in ('minimum_guaranteed', 'minimum_guarantee_royalty'):
        result['minimum_guarantee'] = positive_decimal(raw.get('minimum_guarantee'), 'minimum guarantee')
    details = raw.get('details', '')
    if not isinstance(details, str) or len(details) > 3000 or (subtype in DETAIL_TYPES and not details.strip()):
        raise ValueError('Specify the payment schedule, deliverables, royalty basis, deductions, tiers, or guarantee threshold (up to 3,000 characters).')
    if details.strip():
        result['details'] = details.strip()
    if category != 'one_time':
        frequency = raw.get('reporting_frequency')
        if frequency not in FREQUENCIES:
            raise ValueError('Choose a separate royalty reporting and payment frequency.')
        result['reporting_frequency'] = frequency
        from .royalty_rules import validate_rules
        result['calculation'] = validate_rules(raw, subtype)
        duration = raw.get('reporting_duration_months', 12)
        if type(duration) is not int or not 1 <= duration <= 60:
            raise ValueError('Royalty reporting duration must be between 1 and 60 months.')
        result['reporting_duration_months'] = duration
        result['reporting_policy'] = 'signing_date_plus_7_days_artist_approval'
    return result


def compensation_summary(category, values):
    subtype = values.get('subtype')
    label = OPTIONS.get(category, {}).get(subtype, 'One-Time Payment')
    lines = [f'Commercial compensation: {label}']
    for index, entry in enumerate(values.get('entries', []), 1):
        lines.append(f"Payment {index}: {entry['name']} | PHP {entry['amount']} | Due: {entry['due_date']}")
        if entry.get('acceptance'):
            lines.append(f"Completion and acceptance: {entry['acceptance']}")
    if values.get('rate'):
        basis = 'PHP per licensed item sold' if 'per_unit' in subtype else '% of ' + ('Gross Sales' if 'gross_sales' in subtype else 'Net Sales' if 'net_sales' in subtype else 'Defined Profit')
        lines.append(f'Royalty rate: {values["rate"]} {basis}')
    if values.get('minimum_guarantee'):
        lines.append(f'Minimum guaranteed royalty: PHP {values["minimum_guarantee"]}')
    if values.get('details'):
        lines.append(f'Agreed payment and calculation details: {values["details"]}')
    if values.get('reporting_frequency'):
        lines.append(f'Royalty Reporting & Payment: {FREQUENCIES[values["reporting_frequency"]]}')
    if values.get('reporting_policy'):
        import json
        anchor = 'final commission delivery approval' if values['reporting_policy'] == 'commission_delivery_plus_7_days_artist_approval' else 'the later signing date'
        lines += [f"Reporting lasts {values['reporting_duration_months']} months from {anchor}. Periods are anchored to that date, with reports and payment due seven days after each period ends.",
                  'The buyer must submit sales or profit information and supporting evidence, including zero-sales periods. The artist must approve the report before collection. Late or missing reports are overdue and are never treated as zero.',
                  'Automatic collection requires a separately authorized, supported payment method. Approved royalties are collected on or after the due date. Authorization can be revoked; revocation does not cancel contractual payment obligations.',
                  'Calculation rules: ' + json.dumps(values.get('calculation', {}), sort_keys=True)]
        if values.get('calculation', {}).get('guarantee_scope'):
            lines.append('The minimum guarantee applies to EACH reporting period and offsets the calculated royalty: payable = max(guarantee, calculated royalty).')
    return '\n'.join(lines)


def validate_schedule_total(values, artwork_price):
    if values.get('subtype') in SCHEDULE_TYPES:
        total = sum((Decimal(entry['amount']) for entry in values['entries']), Decimal('0'))
        if total != Decimal(str(artwork_price)):
            raise ValueError('Payment amounts must add up to the proposed artwork price, excluding delivery.')
