import base64
import binascii
from io import BytesIO

from PIL import Image, UnidentifiedImageError
from django.utils import timezone
from django.utils.dateparse import parse_date


def validate_permit(data):
    raw_date = data.get('permit_expires_on')
    try:
        expires = parse_date(raw_date) if isinstance(raw_date, str) else None
    except ValueError:
        expires = None
    if not expires or expires < timezone.localdate():
        raise ValueError('Enter an unexpired business permit date in YYYY-MM-DD format.')
    image = data.get('business_permit_image')
    if not isinstance(image, str) or len(image) > 7 * 1024 * 1024:
        raise ValueError('Upload a business permit image up to 5 MB.')
    try:
        header, encoded = image.split(',', 1)
        if header not in ('data:image/jpeg;base64', 'data:image/png;base64', 'data:image/webp;base64'):
            raise ValueError()
        content = base64.b64decode(encoded, validate=True)
        if len(content) > 5 * 1024 * 1024:
            raise ValueError()
        with Image.open(BytesIO(content)) as permit:
            if permit.format not in ('JPEG', 'PNG', 'WEBP') or permit.width * permit.height > 25000000:
                raise ValueError()
            permit.verify()
    except (ValueError, binascii.Error, UnidentifiedImageError, OSError, Image.DecompressionBombError):
        raise ValueError('Upload a valid JPEG, PNG, or WebP business permit image up to 5 MB.') from None
    return {'business_permit_image': image, 'permit_expires_on': expires}
