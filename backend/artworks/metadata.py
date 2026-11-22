def artwork_metadata(data, art_type, *, required=False):
    dimensions = data.get('dimensions', '')
    medium = data.get('medium', '')
    if not isinstance(dimensions, str) or len(dimensions.strip()) > 120:
        raise ValueError('Enter dimensions up to 120 characters.')
    if not isinstance(medium, str) or len(medium.strip()) > 120:
        raise ValueError('Enter a medium up to 120 characters.')
    dimensions = dimensions.strip()
    medium = 'Digital' if art_type == 'digital' else medium.strip()
    if required and (not dimensions or not medium):
        raise ValueError('Enter the artwork dimensions and, for physical artwork, the medium used.')
    return {'medium': medium, 'dimensions': dimensions}
