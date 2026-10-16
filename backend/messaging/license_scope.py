"""Validated, explicit permissions for new negotiated licenses."""
USES = {'personal_display', 'social_media', 'advertising', 'packaging', 'merchandise', 'editorial'}


def validate_scope(raw, license_type):
    if raw is None:  # Older clients and existing agreements retain their original terms.
        return {}
    if not isinstance(raw, dict):
        raise ValueError('Provide valid license permissions.')
    result = {}
    for key, choices in {'territory': ('philippines', 'worldwide', 'custom'),
                         'modifications': ('none', 'technical', 'adaptations'),
                         'sublicensing': ('none', 'production_partners'),
                         'credit': ('required', 'where_practicable')}.items():
        if raw.get(key) not in choices:
            raise ValueError(f'Choose a valid {key} option.')
        result[key] = raw[key]
    for key in ('territory_details', 'products', 'credit_name'):
        value = raw.get(key, '')
        if not isinstance(value, str) or len(value) > 500:
            raise ValueError(f'Enter {key.replace("_", " ")} in at most 500 characters.')
        result[key] = value.strip()
    if result['territory'] == 'custom' and not result['territory_details']:
        raise ValueError('Specify the licensed countries or regions.')
    uses = raw.get('uses')
    allowed = USES if license_type == 'commercial' else {'personal_display', 'social_media'}
    if not isinstance(uses, list) or not uses or any(not isinstance(x, str) or x not in allowed for x in uses):
        raise ValueError('Select permitted uses matching the license type.')
    result['uses'] = sorted(set(uses))
    if license_type == 'commercial' and not result['products']:
        raise ValueError('Specify the licensed products, media, or campaign.')
    duration = raw.get('duration_months')
    if type(duration) is not int or not 1 <= duration <= 60:
        raise ValueError('License duration must be 1 to 60 whole months.')
    result['duration_months'] = duration
    from .copyright_transfer import validate_transfer
    transfer = validate_transfer(raw.get('copyright_transfer'))
    if transfer:
        result['copyright_transfer'] = transfer
    return result


def scope_text(scope):
    if not scope:
        return ''
    territory = {'philippines': 'Philippines only', 'worldwide': 'Worldwide', 'custom': scope['territory_details']}[scope['territory']]
    modifications = {'none': 'No alterations or adaptations are authorized.', 'technical': 'Only resizing, file conversion and necessary production formatting are authorized; creative changes require written permission.', 'adaptations': 'Adaptations are authorized only for the selected uses and products, subject to the Artist’s moral rights.'}[scope['modifications']]
    partners = 'No sublicensing is authorized.' if scope['sublicensing'] == 'none' else 'Production partners may use the work solely to perform the Client’s licensed project. No independent exploitation or further sublicensing is permitted; the Client remains responsible.'
    credit = 'Credit the Artist on copies and public uses.' if scope['credit'] == 'required' else 'Credit the Artist on copies and public uses wherever practicable.'
    return '\n'.join([f'Territory: {territory}.', f'Permitted uses only: {", ".join(scope["uses"])}.',
        f'Licensed products / media: {scope["products"] or "Personal, non-commercial uses only"}.',
        f'License term: {scope["duration_months"]} months from the later signature date; renewal requires written agreement.',
        modifications, partners, credit + f' Credit name: {scope["credit_name"] or "Artist name stated in this agreement"}.',
        'Rights not expressly granted are reserved. Personal licenses do not authorize commercial exploitation.'])
