from datetime import date, datetime
from zoneinfo import ZoneInfo


def tax_today():
    return datetime.now(ZoneInfo('Asia/Manila')).date()


def validate_document_details(value):
    if not isinstance(value, dict):
        raise ValueError('Complete the required document details.')
    result = {}
    for key, label in [('registered_name', 'BIR registered name'), ('rdo_code', 'RDO code')]:
        text = str(value.get(key) or '').strip()
        if not text or len(text) > 180:
            raise ValueError(f'Enter a valid {label}.')
        result[key] = text
    if not result['rdo_code'].isdigit() or len(result['rdo_code']) not in (3, 4):
        raise ValueError('Enter a 3 or 4-digit RDO code.')
    result['registration_date'] = document_date(value, 'registration_date', tax_today())
    result.update(validate_sworn_details(value))
    return result


def document_date(value, key, today):
    try:
        parsed = date.fromisoformat(value.get(key))
    except (ValueError, TypeError):
        raise ValueError(f'Enter {key.replace("_", " ")} as YYYY-MM-DD.') from None
    if parsed > today:
        raise ValueError('Document dates cannot be in the future.')
    return parsed.isoformat()


def validate_sworn_details(value):
    if not isinstance(value, dict):
        raise ValueError('Complete the sworn declaration details.')
    today = tax_today()
    result = {}
    for key in ('notarized_date', 'bir_received_date'):
        result[key] = document_date(value, key, today)
    if result['bir_received_date'] < result['notarized_date']:
        raise ValueError('BIR received date cannot precede notarization.')
    if str(value.get('taxable_year')) != str(today.year):
        raise ValueError('Submit the sworn declaration for the current taxable year.')
    result['taxable_year'] = today.year
    if value.get('remittance_status') not in ('not_exceed_500000', 'exceed_500000'):
        raise ValueError('Select the remittance status stated in your declaration.')
    result['remittance_status'] = value['remittance_status']
    if value.get('confirmed') is not True:
        raise ValueError('Confirm that the entered details match the uploaded documents.')
    result['confirmed'] = True
    return result
