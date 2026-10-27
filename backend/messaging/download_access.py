"""Original downloads pause seven days before an unsettled royalty deadline."""
from datetime import timedelta
from django.utils import timezone
from .royalties import ensure_periods

def royalty_download_block(agreement, today=None):
    if not agreement or agreement.compensation_type not in ('royalty', 'hybrid'):
        return None
    today = today or timezone.localdate()
    ensure_periods(agreement, today)
    period = agreement.royalty_periods.filter(due_on__lte=today + timedelta(days=7)).exclude(status__in=['paid', 'funded', 'zero_due']).order_by('due_on', 'pk').first()
    if period is None:
        return None
    return {'period_id': period.pk, 'due_on': str(period.due_on),
            'blocked_from': str(period.due_on - timedelta(days=7)),
            'message': f'Downloads are paused from seven days before your royalty payment due on {period.due_on}. Complete the royalty report and payment to restore access. Access resumes once payment is verified.'}

def restricted_preview(raw):
    import base64
    from io import BytesIO
    from PIL import Image, ImageDraw
    with Image.open(BytesIO(raw)) as original:
        image = original.convert('RGB')
        image.thumbnail((480, 480))
        draw = ImageDraw.Draw(image)
        for y in range(10, image.height, 70):
            for x in range(5, image.width, 140):
                draw.text((x, y), 'ArtFiliere PREVIEW', fill=(190, 70, 70))
        out = BytesIO()
        image.save(out, 'JPEG', quality=65)
    return 'data:image/jpeg;base64,' + base64.b64encode(out.getvalue()).decode()
