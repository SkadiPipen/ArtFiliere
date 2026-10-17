"""Issue a frozen certificate once, using the paid purchase and agreed document."""
import hashlib
import base64
import uuid
from io import BytesIO
from xml.sax.saxutils import escape
from django.db import transaction
from reportlab.lib.colors import HexColor
from reportlab.lib.pagesizes import A4
from reportlab.lib.styles import ParagraphStyle
from reportlab.platypus import SimpleDocTemplate, Paragraph, Spacer, Table, TableStyle, PageBreak, Image
from .models import CertificateOfAuthenticity
from messaging.signing import branded_document_header, NumberedCanvas


def person(user):
    return ' '.join(filter(None, [user.first_name, user.middle_name, user.last_name])).strip() or user.username


def certificate_preview(source, commission=False):
    """Freeze a small preview; never put full-resolution artwork into the PDF."""
    from PIL import Image as PILImage
    try:
        if not commission and source.artwork_png:
            raw = bytes(source.artwork_png)
        elif not commission and source.artwork.image_data.startswith('data:image/'):
            raw = base64.b64decode(source.artwork.image_data.split(',', 1)[1], validate=True)
        else:
            return ''
        with PILImage.open(BytesIO(raw)) as image:
            image.thumbnail((900, 600))
            if image.mode not in ('RGB', 'RGBA'):
                image = image.convert('RGB')
            output = BytesIO()
            image.save(output, format='PNG')
            return base64.b64encode(output.getvalue()).decode()
    except (ValueError, OSError, IndexError):
        return ''


def render_certificate(snapshot):
    from pathlib import Path
    from reportlab.pdfgen.canvas import Canvas
    from reportlab.lib.utils import ImageReader
    from reportlab.lib.enums import TA_CENTER
    output = BytesIO()
    width, height = A4
    canvas = Canvas(output, pagesize=A4)
    canvas.setTitle('Certificate of Authenticity')
    canvas.setAuthor('ArtFilier')
    accent, ink, muted = HexColor('#CB5053'), HexColor('#362D2A'), HexColor('#80716B')
    canvas.setFillColor(HexColor('#FFFCF8')); canvas.rect(0, 0, width, height, fill=1, stroke=0)
    canvas.setStrokeColor(accent); canvas.setLineWidth(1.3); canvas.rect(22, 22, width-44, height-44)
    canvas.setStrokeColor(HexColor('#E9D8CD')); canvas.setLineWidth(.5); canvas.rect(29, 29, width-58, height-58)
    canvas.setFillColor(accent); canvas.rect(22, height-29, width-44, 7, fill=1, stroke=0)
    logo = Path(__file__).resolve().parents[2] / 'assets' / 'images' / 'logo.png'
    if logo.exists():
        canvas.drawImage(str(logo), width/2-72, height-93, width=44, height=44, preserveAspectRatio=True, mask='auto')
    canvas.setFont('Times-Bold', 24); canvas.setFillColor(accent); canvas.drawString(width/2-23, height-76, 'ArtFilier')
    def text(value, x, top, box_width, max_height, size=11, center=False, bold=False, color=ink):
        # Fit long user-provided titles/names without spilling into another field.
        for font_size in range(size, 6, -1):
            style = ParagraphStyle('COA', fontName='Times-Bold' if bold else 'Times-Roman', fontSize=font_size,
                leading=font_size*1.35, textColor=color, alignment=TA_CENTER if center else 0, wordWrap='CJK')
            paragraph = Paragraph(escape(str(value)), style)
            _, needed = paragraph.wrap(box_width, max_height)
            if needed <= max_height:
                break
        paragraph.drawOn(canvas, x, top-needed)
    text('CERTIFICATE', 55, height-113, width-110, 35, 27, True, True)
    text('of Authenticity', 55, height-148, width-110, 35, 25, True, color=accent)
    text('ARTWORK & PURCHASE RECORD', 55, height-186, width-110, 18, 10, True, color=muted)
    text('Issued through ArtFilier for the artwork attributed to the artist named below, following the recorded purchase.', 67, height-213, width-134, 35, 10, True)
    image_y, image_h = height-434, 174
    canvas.setFillColor(HexColor('#F5EEE7')); canvas.roundRect(115, image_y, width-230, image_h, 5, fill=1, stroke=0)
    try:
        raw = base64.b64decode(snapshot.get('artwork_preview', ''), validate=True)
        if not raw:
            raise ValueError()
        canvas.drawImage(ImageReader(BytesIO(raw)), 121, image_y+6, width=width-242, height=image_h-12, preserveAspectRatio=True, anchor='c', mask='auto')
    except (ValueError, OSError):
        text('Artwork preview not recorded', 121, image_y+95, width-242, 30, 11, True, color=muted)
    rows = [('TITLE OF ARTWORK', snapshot['title']), ('ARTIST', snapshot['artist']), ('PURCHASED BY', snapshot['buyer']),
            ('FORMAT', str(snapshot['format']).title()), ('PURCHASE DATE', snapshot['purchased_at']),
            ('AGREEMENT', snapshot.get('agreement_code') or 'Not recorded')]
    top = image_y-19
    for label, value in rows:
        text(label, 64, top, 137, 26, 9, bold=True, color=muted)
        text(value, 205, top+1, width-269, 29, 11)
        canvas.setStrokeColor(HexColor('#E7DBD2')); canvas.line(205, top-28, width-64, top-28)
        top -= 34
    # Reproduce the recorded agreement signature without inventing a new attestation.
    try:
        signature = snapshot.get('artist_signature_image', '')
        if signature:
            canvas.drawImage(ImageReader(BytesIO(base64.b64decode(signature.split(',', 1)[1]))), width-220, 137, width=145, height=40, preserveAspectRatio=True, anchor='c', mask='auto')
    except (ValueError, OSError, IndexError):
        pass
    canvas.setStrokeColor(muted); canvas.line(66, 134, 233, 134); canvas.line(width-233, 134, width-66, 134)
    text(snapshot['purchased_at'], 66, 153, 167, 18, 9, True)
    text('RECORDED PURCHASE DATE', 66, 126, 167, 18, 8, True, color=muted)
    text('ARTIST SIGNATURE ON AGREEMENT' if snapshot.get('artist_signature_image') else 'ARTIST: ' + snapshot['artist'], width-233, 126, 167, 22, 8, True, color=muted)
    note = 'The signed agreement governs usage and any copyright transfer. This certificate records the purchase and artist attribution; it is not independent proof of authorship or IPOPHL registration.'
    text(note, 64, 98, width-128, 32, 8, True, color=muted)
    text(snapshot['code'], 55, 59, width-110, 17, 9, True, True, accent)
    if snapshot.get('simulated'):
        text('TEST PURCHASE - NO MONEY CHARGED', 55, 43, width-110, 12, 7, True, True, accent)
    canvas.showPage(); canvas.save()
    return output.getvalue()


def commission_completed(source):
    if source.status != 'COMPLETE': return False
    if source.flow_version == 2:
        return bool(source.funded_at and not source.disputed and source.milestones.count() == 3
                    and not source.milestones.exclude(status='APPROVED').exists()
                    and (source.art_type.lower() != 'physical' or source.delivered_at))
    return source.milestones.exists() and not source.milestones.exclude(status='PAID').exists()


def build_snapshot(source, commission=False):
    agreement = source.agreement if not commission or source.flow_version == 2 else None
    document = (agreement.document_snapshot or agreement.terms_snapshot) if agreement else 'No licensing agreement is recorded for this purchase. This certificate grants no additional usage rights.'
    purchased_at = max((m.paid_at for m in source.milestones.all() if m.paid_at), default=None) if commission else source.paid_at
    if commission and source.flow_version == 2: purchased_at = source.funded_at
    snapshot = {
        'pdf_style': 3,
        'artwork_preview': certificate_preview(source, commission),
        'code': 'AF-COA-' + uuid.uuid4().hex[:16].upper(),
        'title': source.title if commission else source.artwork.title,
        'artist': person(source.artist), 'buyer': person(source.buyer),
        'format': source.art_type if commission else source.artwork.art_type,
        'purchased_at': purchased_at.strftime('%Y-%m-%d %H:%M UTC') if purchased_at else 'Not recorded',
        'reference': f'Commission #{source.pk}' if commission else source.reference_id,
        'simulated': False if commission else source.is_simulated,
        'license': agreement.license_type.replace('_', ' ').title() if agreement else 'Not recorded',
        'exclusivity': agreement.exclusivity.replace('_', ' ').title() if agreement else 'Not recorded',
        'rights_note': 'The agreement includes a conditional copyright assignment. Refer to its assigned rights, reservations, signature and payment conditions; this certificate alone does not establish that ownership transferred.' if agreement and agreement.license_scope.get('copyright_transfer') else 'Copyright ownership remains with the artist. Only the rights stated in the attached agreement are licensed to the buyer.' if agreement else 'This purchase certificate does not transfer copyright or grant a commercial license.',
        'document': document, 'document_hash': hashlib.sha256(document.encode()).hexdigest() if agreement else '',
        'artwork_hash': '' if commission else source.artwork.sha256_hash,
        'agreement_code': agreement.verification_code if agreement else '',
        'artist_signature_image': agreement.artist_signature_image if agreement else '',
    }
    if agreement:
        for role in ('artist', 'buyer'):
            signed_at = getattr(agreement, role + '_signed_at')
            snapshot[role + '_signing'] = f"{role.title()}: {getattr(agreement, role + '_signature') or 'Not recorded'} | Signed: {signed_at.strftime('%Y-%m-%d %H:%M UTC') if signed_at else 'Not recorded'}"
    return snapshot


@transaction.atomic
def issue_certificate(source, commission=False):
    source = type(source).objects.select_for_update().get(pk=source.pk)
    if commission:
        if not commission_completed(source):
            return None
    elif source.status != 'paid':
        return None
    lookup = {'commission': source} if commission else {'payment': source}
    existing = CertificateOfAuthenticity.objects.filter(**lookup).first()
    if existing:
        if existing.snapshot.get('pdf_style') != 3:
            snapshot = {**existing.snapshot, 'pdf_style': 3, 'artwork_preview': existing.snapshot.get('artwork_preview') or certificate_preview(source, commission)}
            existing.pdf = render_certificate(snapshot)
            existing.snapshot = snapshot
            existing.save(update_fields=['pdf', 'snapshot'])
        return existing
    snapshot = build_snapshot(source, commission)
    return CertificateOfAuthenticity.objects.create(**lookup, code=snapshot['code'], snapshot=snapshot, pdf=render_certificate(snapshot))
