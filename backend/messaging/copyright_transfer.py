"""Express assignment terms, separate from license permissions."""
RIGHTS = {'reproduction': 'Reproduction', 'adaptation': 'Adaptation and transformation',
          'distribution': 'Distribution', 'rental': 'Rental where applicable',
          'public_display': 'Public display', 'public_performance': 'Public performance',
          'communication': 'Communication to the public'}


def validate_transfer(raw):
    if raw is None:
        return None
    if not isinstance(raw, dict) or raw.get('kind') not in ('full', 'partial'):
        raise ValueError('Choose full or partial copyright assignment.')
    kind = raw['kind']
    rights = list(RIGHTS) if kind == 'full' else raw.get('rights')
    if not isinstance(rights, list) or not rights or any(not isinstance(x, str) or x not in RIGHTS for x in rights):
        raise ValueError('Select the economic rights to assign.')
    result = {'kind': kind, 'rights': sorted(set(rights))}
    for key in ('existing_commitments', 'artist_reserved_uses', 'additional_terms'):
        value = raw.get(key, '')
        if not isinstance(value, str) or not value.strip() or len(value) > 2000:
            raise ValueError(f'Specify {key.replace("_", " ")} (up to 2,000 characters; enter None when applicable).')
        result[key] = value.strip()
    if raw.get('effective') not in ('both_signed', 'signed_and_paid'):
        raise ValueError('Choose when the copyright assignment takes effect.')
    result['effective'] = raw['effective']
    if raw.get('acknowledged') is not True:
        raise ValueError('Acknowledge the copyright ownership transfer and retained moral rights.')
    result['acknowledged'] = True
    return result


def transfer_text(terms):
    timing = 'after both parties sign this agreement' if terms['effective'] == 'both_signed' else 'only after both parties sign and the full agreed platform checkout payment, excluding future recurring royalties, has settled successfully'
    return '\n'.join([
        'COPYRIGHT ASSIGNMENT - ' + ('FULL ECONOMIC RIGHTS' if terms['kind'] == 'full' else 'SELECTED ECONOMIC RIGHTS'),
        'The Artist hereby assigns to the Client ownership of the following transferable economic rights in the identified artwork, effective ' + timing + ': ' + ', '.join(RIGHTS[x] for x in terms['rights']) + '.',
        'Assignment territory: worldwide. Assignment duration: the remaining statutory term of the assigned economic rights. Unassigned rights remain with their lawful owner.',
        'The assignment is separate from the license permissions. License territory, use restrictions, exclusivity and license duration do not limit or override the assigned rights. For assigned rights, this assignment controls in case of conflict.',
        'Consideration for the assignment is included in the agreed checkout fee, not an additional charge. Any separately agreed recurring royalties remain payable and do not automatically delay the assignment.',
        'Existing licenses, co-ownership and other commitments disclosed by the Artist: ' + terms['existing_commitments'],
        'Uses expressly reserved to the Artist after assignment (including portfolio use, if any): ' + terms['artist_reserved_uses'],
        'Additional assignment conditions: ' + terms['additional_terms'],
        'The Artist remains the author. Moral rights are not assigned, licensed or waived by this assignment. Applicable statutory resale rights and statutory exceptions are preserved.',
        'The Artist confirms ownership or authority to assign these rights and prior written consent or authority from all required co-owners and other right holders. Disclosed commitments are not extinguished by this agreement.',
        'A checkbox or proposal alone does not transfer ownership. The stated signature and payment conditions must be met. This platform record is not IPOPHL registration or independent proof of ownership.'
    ])
