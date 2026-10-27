"""Validate bounded raster photos before persisting review attachments."""
import base64
import binascii
from io import BytesIO
import warnings
from PIL import Image

def validate_review_images(images):
    if not isinstance(images, list) or len(images) > 3:
        raise ValueError('Attach up to 3 review photos.')
    for value in images:
        try:
            if not isinstance(value, str) or len(value) > 1400050:
                raise ValueError()
            prefix, encoded = value.split(',', 1)
            expected = {'data:image/jpeg;base64': 'JPEG', 'data:image/png;base64': 'PNG'}.get(prefix)
            raw = base64.b64decode(encoded, validate=True)
            if not expected or len(raw) > 1024 * 1024:
                raise ValueError()
            with warnings.catch_warnings():
                warnings.simplefilter('error', Image.DecompressionBombWarning)
                with Image.open(BytesIO(raw)) as image:
                    if image.format != expected or image.width * image.height > 20000000:
                        raise ValueError()
                    image.verify()
        except (ValueError, TypeError, binascii.Error, OSError, Image.DecompressionBombError, Image.DecompressionBombWarning):
            raise ValueError('Use valid JPEG or PNG review photos up to 1 MB each.') from None
    return images
