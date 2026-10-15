import base64
import binascii
from io import BytesIO
from PIL import Image


def validate_image(value):
    try:
        if not isinstance(value, str) or len(value) > 7 * 1024 * 1024:
            raise ValueError()
        header, encoded = value.split(',', 1)
        formats = {'data:image/jpeg;base64': 'JPEG', 'data:image/png;base64': 'PNG', 'data:image/webp;base64': 'WEBP'}
        if header not in formats:
            raise ValueError()
        raw = base64.b64decode(encoded, validate=True)
        if not raw or len(raw) > 5 * 1024 * 1024:
            raise ValueError()
        with Image.open(BytesIO(raw)) as image:
            if image.format != formats[header] or image.width * image.height > 25000000:
                raise ValueError()
            image.verify()
    except (ValueError, TypeError, binascii.Error, OSError, Image.DecompressionBombError):
        raise ValueError('Choose a valid JPEG, PNG or WebP photo up to 5 MB.') from None
    return value
