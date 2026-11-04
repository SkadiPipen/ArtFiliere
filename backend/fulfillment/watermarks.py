"""Buyer-specific pixel watermarks. Personal data stays in the database."""
import hashlib
import logging
import secrets
from io import BytesIO
from threading import RLock

from django.conf import settings
from PIL import Image, ImageOps, ImageDraw, ImageFont, ImageFilter, ImageChops
from rest_framework.exceptions import APIException

from .models import DownloadFingerprint

logger = logging.getLogger(__name__)
_lock = RLock()


def license_details(source_key):
    """Record the governing agreement at issuance, including its exact scope."""
    from messaging.models import Agreement
    kind, pk, *_ = source_key.split(':')
    agreement = None
    if kind == 'agreement':
        agreement = Agreement.objects.filter(pk=pk).first()
    elif kind == 'payment':
        from wallets.models import PaymentSession
        payment = PaymentSession.objects.select_related('agreement').filter(pk=pk).first()
        agreement = payment.agreement if payment else None
    elif kind == 'commission':
        from commissions.models import CommissionRequest
        commission = CommissionRequest.objects.select_related('agreement').filter(pk=pk).first()
        agreement = commission.agreement if commission else None
    if not agreement:
        return {'reference': source_key, 'license_type': 'See purchase terms'}
    return {'reference': f'AGR-{agreement.pk}', 'agreement_id': agreement.pk,
            'license_type': agreement.license_type, 'exclusivity': agreement.exclusivity,
            'license_scope': agreement.license_scope, 'terms_snapshot': agreement.terms_snapshot}


def copy_code(record):
    return record.transaction_code or f'AF-{int(record.token, 2):016X}'


def tag_lines(record, artist_name):
    return (copy_code(record),)


# Five-by-seven dot-matrix alphabet for the hexadecimal transaction code.
MICRO_GLYPHS = {
    '0': ('01110','10001','10011','10101','11001','10001','01110'),
    '1': ('00100','01100','00100','00100','00100','00100','01110'),
    '2': ('01110','10001','00001','00010','00100','01000','11111'),
    '3': ('11110','00001','00001','01110','00001','00001','11110'),
    '4': ('00010','00110','01010','10010','11111','00010','00010'),
    '5': ('11111','10000','10000','11110','00001','00001','11110'),
    '6': ('01110','10000','10000','11110','10001','10001','01110'),
    '7': ('11111','00001','00010','00100','01000','01000','01000'),
    '8': ('01110','10001','10001','01110','10001','10001','01110'),
    '9': ('01110','10001','10001','01111','00001','00001','01110'),
    'A': ('01110','10001','10001','11111','10001','10001','10001'),
    'B': ('11110','10001','10001','11110','10001','10001','11110'),
    'C': ('01111','10000','10000','10000','10000','10000','01111'),
    'D': ('11110','10001','10001','10001','10001','10001','11110'),
    'E': ('11111','10000','10000','11110','10000','10000','11111'),
    'F': ('11111','10000','10000','11110','10000','10000','10000'),
    'T': ('11111','00100','00100','00100','00100','00100','00100'),
    'X': ('10001','10001','01010','00100','01010','10001','10001'),
    '-': ('00000','00000','00000','11111','00000','00000','00000'),
}


def dotted_code(label, height, max_width):
    """Render real separated dots; magnification reveals the code characters."""
    scale = 4
    pitch = max(2, height / 7)
    width = max(1, round((len(label) * 6 - 1) * pitch * 1.15 + 2))
    height = max(1, round(7 * pitch + 2))
    mask = Image.new('L', (width * scale, height * scale), 0)
    draw = ImageDraw.Draw(mask)
    radius = pitch * .31 * scale
    for index, char in enumerate(label):
        for row, bits in enumerate(MICRO_GLYPHS[char]):
            for column, bit in enumerate(bits):
                if bit == '1':
                    x = (1 + (index * 6 + column + .5) * pitch * 1.15) * scale
                    y = (1 + (row + .5) * pitch) * scale
                    draw.ellipse((x-radius, y-radius, x+radius, y+radius), fill=255)
    ratio = min(1, max_width / width)
    return mask.resize((max(1, round(width * ratio)), max(1, round(height * ratio))), Image.Resampling.LANCZOS)


def code_outline(label, size, max_width):
    """Compact hollow block lettering with slightly stretched proportions."""
    scale = 4
    font = ImageFont.load_default(size=max(4, size) * scale)
    box = font.getbbox(label)
    padding = scale * 2
    glyph = Image.new('L', (box[2] - box[0] + padding * 2,
                            box[3] - box[1] + padding * 2), 0)
    ImageDraw.Draw(glyph).text((padding - box[0], padding - box[1]),
                              label, font=font, fill=255)
    glyph = glyph.filter(ImageFilter.MaxFilter(3))
    width = max(1, round(glyph.width / scale * 1.30))
    height = max(1, round(glyph.height / scale))
    if width > max_width:
        height = max(1, round(height * max_width / width))
        width = max_width
    glyph = glyph.resize((width * scale, height * scale), Image.Resampling.LANCZOS)
    outline = ImageChops.subtract(glyph.filter(ImageFilter.MaxFilter(5)), glyph)
    return outline.resize((width, height), Image.Resampling.LANCZOS)


def faint_tag(image, record):
    """Hollow central code and lower-left dotted microtext; no hidden signal."""
    label = copy_code(record)
    result = image.convert('RGB')
    size = max(14, round(min(image.size) / 75))
    margin = max(3, round(min(image.size) * .025))

    def paint(outline, x, y, light_opacity, dark_opacity):
        nonlocal result
        mask = Image.new('L', image.size, 0)
        mask.paste(outline, (round(x), round(y)))
        dark = mask.point(lambda value: round(value * dark_opacity))
        light = mask.point(lambda value: round(value * light_opacity))
        # Only the mask is painted; hollow interiors and dot gaps retain the artwork.
        result = Image.composite(Image.new('RGB', image.size, 'black'), result, dark)
        result = Image.composite(Image.new('RGB', image.size, 'white'), result, light)

    central = code_outline(label, max(10, round(min(image.size) / 46)),
                           max(1, round(image.width * .70)))
    paint(central, (image.width - central.width) / 2,
          image.height * .60 - central.height / 2, .055, .035)
    corner = dotted_code(label, max(14, round(size * .65)),
                          max(1, image.width - margin * 2))
    paint(corner, margin, image.height - margin - corner.height, .34, .24)
    return result


class WatermarkUnavailable(APIException):
    status_code = 503
    default_detail = 'Protected download is temporarily unavailable. Please try again later.'


def protected_image(raw, *, source_key, buyer_id, artist_id):
    if not getattr(settings, 'DOWNLOAD_WATERMARK_ENABLED', False):
        return raw
    digest = hashlib.sha256(raw).hexdigest()
    try:
        record, _ = DownloadFingerprint.objects.get_or_create(
            source_key=source_key, source_sha256=digest,
            defaults={'token': format(secrets.randbits(61), '061b'),
                      'buyer_id': buyer_id, 'artist_id': artist_id})
        if not record.license_snapshot:
            record.license_snapshot = license_details(source_key)
            record.save(update_fields=['license_snapshot'])
        if record.buyer_id != buyer_id or record.artist_id != artist_id:
            raise ValueError('Fingerprint identity mismatch')
        from .tracking import attach_transaction
        attach_transaction(record)
        with _lock, Image.open(BytesIO(raw)) as original:
            image = ImageOps.exif_transpose(original)
            if getattr(original, 'n_frames', 1) != 1:
                raise ValueError('Animated images are not supported')
            alpha = image.convert('RGBA').getchannel('A') if 'A' in image.getbands() or 'transparency' in image.info else None
            cover = faint_tag(image, record) if getattr(settings, 'DOWNLOAD_VISIBLE_TAG_ENABLED', True) else image.convert('RGB')
            marked = cover
            if alpha is not None:
                marked.putalpha(alpha)
            output = BytesIO()
            marked.save(output, 'PNG')
            payload = output.getvalue()
        from django.utils import timezone
        DownloadFingerprint.objects.filter(pk=record.pk).update(issued_at=timezone.now())
        return payload
    except Exception as error:
        logger.exception('Protected image generation failed for %s', source_key)
        raise WatermarkUnavailable() from error
