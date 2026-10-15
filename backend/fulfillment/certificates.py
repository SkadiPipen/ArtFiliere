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


def render_certificate(snapshot):
    output = BytesIO()
    accent, ink = HexColor('#CB5053'), HexColor('#000000')
    body = ParagraphStyle('CertificateBody', fontName='Times-Roman', fontSize=11, leading=13, textColor=ink)
    small = ParagraphStyle('CertificateSmall', parent=body, fontSize=9, leading=13)
    heading = ParagraphStyle('CertificateHeading', parent=body, fontName='Times-Bold', fontSize=18, leading=22, spaceAfter=7)
    sub = ParagraphStyle('CertificateSubtitle', parent=body, fontName='Times-Bold', fontSize=14, leading=18, textColor=ink)
    def paragraph(text, style=body):
        return Paragraph(escape(str(text)).replace('\n', '<br/>'), style)
    story = [paragraph('CERTIFICATE OF AUTHENTICITY', heading), Spacer(1, 12),
             paragraph('Issued for the artwork attributed to the artist named below, following the recorded purchase through ArtFiliere. The attached license record identifies the rights agreed by the parties.'), Spacer(1, 20)]
    rows = [('ARTWORK', snapshot['title']), ('ARTIST', snapshot['artist']), ('BUYER / LICENSEE', snapshot['buyer']),
            ('FORMAT', snapshot['format']), ('PURCHASE DATE (UTC)', snapshot['purchased_at']),
            ('CERTIFICATE ID', snapshot['code']), ('PURCHASE REFERENCE', snapshot['reference']),
            ('LICENSE', snapshot['license']), ('EXCLUSIVITY', snapshot['exclusivity'])]
    table = Table([[paragraph(k, small), paragraph(v)] for k, v in rows], colWidths=[150, A4[0] - 222])
    table.setStyle(TableStyle([('VALIGN', (0, 0), (-1, -1), 'TOP'), ('LINEBELOW', (0, 0), (-1, -1), .35, HexColor('#DDDDDD')), ('TOPPADDING', (0, 0), (-1, -1), 9), ('BOTTOMPADDING', (0, 0), (-1, -1), 9)]))
    story += [table, Spacer(1, 20), paragraph(snapshot['rights_note']), Spacer(1, 12),
              paragraph('The signed agreement governs the license scope, duration, restrictions and payment obligations. This certificate records the purchase and artist attribution; it does not independently establish authorship.', small)]
    if snapshot.get('simulated'):
        story += [Spacer(1, 12), paragraph('TEST PURCHASE - NO MONEY CHARGED', sub)]
    story += [PageBreak(), paragraph('LICENSE & PURCHASE RECORD', sub), Spacer(1, 18),
              paragraph(f"Certificate: {snapshot['code']}", small),
              paragraph(f"Agreement reference: {snapshot.get('agreement_code') or 'Not recorded'}", small), Spacer(1, 12)]
    for line in snapshot['document'].split('\n'):
        story.append(paragraph(line or ' ', body))
    story += [Spacer(1, 16), paragraph('Recorded signing details', sub)]
    for key in ('artist_signing', 'buyer_signing'):
        story.append(paragraph(snapshot.get(key) or 'Not recorded', small))
    if snapshot.get('artist_signature_image'):
        try:
            signature = Image(BytesIO(base64.b64decode(snapshot['artist_signature_image'].split(',', 1)[1])))
            signature._restrictSize(180, 50)
            signature.hAlign = 'LEFT'
            story += [Spacer(1, 10), paragraph('Artist signature reproduced from the agreed license', small), signature]
        except (ValueError, IndexError, OSError):
            pass
    story += [Spacer(1, 14), paragraph(f"Artwork SHA-256: {snapshot.get('artwork_hash') or 'Not recorded'}", small),
              paragraph(f"Agreement SHA-256: {snapshot.get('document_hash') or 'Not recorded'}", small)]
    def canvas_factory(*args, **kwargs):
        canvas = NumberedCanvas(*args, **kwargs)
        canvas.draw_header = lambda canvas, doc: branded_document_header(canvas, doc, 'CERTIFICATE OF AUTHENTICITY')
        return canvas
    SimpleDocTemplate(output, pagesize=A4, leftMargin=36, rightMargin=36, topMargin=160, bottomMargin=35,
                      title='Certificate of Authenticity', author='ArtFilier').build(story, canvasmaker=canvas_factory)
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
        'pdf_style': 2,
        'code': 'AF-COA-' + uuid.uuid4().hex[:16].upper(),
        'title': source.title if commission else source.artwork.title,
        'artist': person(source.artist), 'buyer': person(source.buyer),
        'format': source.art_type if commission else source.artwork.art_type,
        'purchased_at': purchased_at.strftime('%Y-%m-%d %H:%M UTC') if purchased_at else 'Not recorded',
        'reference': f'Commission #{source.pk}' if commission else source.reference_id,
        'simulated': False if commission else source.is_simulated,
        'license': agreement.license_type.replace('_', ' ').title() if agreement else 'Not recorded',
        'exclusivity': agreement.exclusivity.replace('_', ' ').title() if agreement else 'Not recorded',
        'rights_note': 'Copyright ownership remains with the artist. Only the rights stated in the attached agreement are licensed to the buyer.' if agreement else 'This purchase certificate does not transfer copyright or grant a commercial license.',
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
        if existing.snapshot.get('pdf_style') != 2:
            snapshot = {**existing.snapshot, 'pdf_style': 2}
            existing.pdf = render_certificate(snapshot)
            existing.snapshot = snapshot
            existing.save(update_fields=['pdf', 'snapshot'])
        return existing
    snapshot = build_snapshot(source, commission)
    return CertificateOfAuthenticity.objects.create(**lookup, code=snapshot['code'], snapshot=snapshot, pdf=render_certificate(snapshot))
