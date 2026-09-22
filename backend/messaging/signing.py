import hashlib
import base64
from pathlib import Path
from .signature_images import signature_image
from io import BytesIO
from xml.sax.saxutils import escape
from django.db import transaction
from django.db.models import Q
from django.http import HttpResponse
from django.utils import timezone
from rest_framework.response import Response
from reportlab.lib.styles import getSampleStyleSheet
from reportlab.lib.enums import TA_CENTER
from reportlab.platypus import SimpleDocTemplate, Paragraph, Spacer, Image, KeepTogether
from reportlab.pdfgen.canvas import Canvas
from reportlab.lib.colors import HexColor
from reportlab.lib.pagesizes import A4
from authentication.views import AuthenticatedAPIView
from authentication.permissions import IsAuthenticatedUser
from .models import Agreement


def party_name(user):
    full_name = " ".join(part.strip() for part in (user.first_name, user.middle_name, user.last_name) if part and part.strip())
    return f"({user.username}) {full_name}".strip()


def document_text(item):
    # Use the supplied wording with accepted values, without invented dates or fees.
    title = item.artwork.title if item.artwork else "Unavailable artwork"
    rights = (
        f"The Artist grants the Client an {item.exclusivity.replace('_', '-')}, worldwide license to reproduce, publicly display, distribute, and use the Images for commercial purposes including but not limited to advertising, marketing, product packaging, and merchandise."
        if item.license_type == "commercial" else
        f"The Artist grants the Client an {item.exclusivity.replace('_', '-')}, worldwide license to reproduce, publicly display, and distribute the Images solely for personal, non-commercial purposes."
    )
    exclusivity = {
        "exclusive": "During the term of this Agreement, the Artist shall not license, sell, or otherwise transfer the same Images to any other party for any purpose.",
        "sole": "During the term of this Agreement, the Artist shall not license, sell, or otherwise transfer the same Images to any other party, and shall not create any derivative works based on the Images.",
    }.get(item.exclusivity, "The Artist retains the right to license the same Images to other parties.")
    sections = [
        "ART LICENSING AGREEMENT",
        f'between: {party_name(item.artist)} ("Artist"), and {party_name(item.buyer)} ("Client").',
        'The Artist and Client are each referred to herein as a "Party" and collectively as the "Parties."',
        '1. Scope of this Agreement',
        f'This Agreement applies to the artwork titled "{title}" (the "IMAGES"). This Agreement governs the relationship between the parties and no communication or other exchange shall modify the terms of this Agreement unless agreed to in writing.',
        '2. Rights', rights, exclusivity,
        'The Artist retains the right to display the Images in their portfolio, website, and for self-promotional purposes.',
        '3. Term and agreed details', item.terms_snapshot,
        '4. Fees', f'The Client shall pay a total license fee of PHP {item.price}.',
        "The total fee is due and payable through the Platform's payment system no later than ten (10) business days from the delivery of the Images.",
    ]
    if item.delivery_type == "digital":
        sections += ['5. Digital Delivery', "The Artist shall deliver the Images to the Client in digital format via the Platform's delivery system or such other electronic means as the parties may agree. It is the Client's responsibility to verify that the Images are suitable for reproduction and to notify the Artist within five (5) business days if the Images are not deemed suitable."]
    sections += ['6. Termination for Breach', 'If either party materially breaches this Agreement and fails to cure within fifteen (15) days after written notice, the non-breaching party may terminate this Agreement immediately. Upon termination for breach by Client, all rights granted shall immediately cease, and Client shall destroy all copies of the Images and certify such destruction in writing.']
    return "\n\n".join(sections)


def signing_data(item, user):
    text = item.document_snapshot or document_text(item)
    middle = (user.middle_name or '').strip()
    signing_name = ' '.join(part for part in (
        (user.first_name or '').strip(),
        middle[0].upper() + '.' if middle else '',
        (user.last_name or '').strip(),
    ) if part)
    return {"id": item.id, "document": text, "document_hash": hashlib.sha256(text.encode()).hexdigest(),
            "signing_name": signing_name,
            "artist_signature_image": item.artist_signature_image, "buyer_signature_image": item.buyer_signature_image,
            "artist_signature": item.artist_signature, "buyer_signature": item.buyer_signature,
            "artist_signed_at": item.artist_signed_at, "buyer_signed_at": item.buyer_signed_at,
            "my_role": "artist" if user.id == item.artist_id else "buyer",
            "fully_signed": bool(item.artist_signed_at and item.buyer_signed_at and item.artist_signature_image and item.buyer_signature_image)}


class NumberedCanvas(Canvas):
    def __init__(self, *args, **kwargs):
        super().__init__(*args, **kwargs)
        self.pages = []
    def showPage(self):
        self.pages.append(dict(self.__dict__))
        self._startPage()
    def save(self):
        count = len(self.pages)
        for state in self.pages:
            self.__dict__.update(state)
            self.draw_header(self, None)
            self.setFillColor(HexColor('#000000'))
            self.setFont('Times-Roman', 9)
            self.drawString(20, A4[1] - 94, f'Page {self._pageNumber} of {count}')
            super().showPage()
        super().save()


def render_pdf(item):
    output = BytesIO()
    styles = getSampleStyleSheet()
    for name in ('BodyText', 'Heading2'):
        styles[name].fontName = 'Times-Roman' if name == 'BodyText' else 'Times-Bold'
    styles['BodyText'].fontSize = 11
    styles['BodyText'].leading = 13
    styles['BodyText'].spaceAfter = 7
    flow = []
    for block in (item.document_snapshot or document_text(item)).split('\n\n'):
        heading = block == 'ART LICENSING AGREEMENT' or (len(block) < 80 and block[:1].isdigit() and '. ' in block)
        flow.append(Paragraph(escape(block).replace('\n', '<br/>'), styles['Heading2'] if heading else styles['BodyText']))
    signatures = [Paragraph('SIGNATURES', styles['Heading2'])]
    for role, label in [('artist', 'ARTIST'), ('buyer', 'BUYER / CLIENT')]:
        name = getattr(item, role + '_signature')
        date = getattr(item, role + '_signed_at')
        encoded = getattr(item, role + '_signature_image')
        signatures.append(Paragraph(label, styles['Heading2']))
        if encoded:
            image = Image(BytesIO(base64.b64decode(encoded.split(',', 1)[1])))
            image._restrictSize(200, 55)
            image.hAlign = 'LEFT'
            signatures.append(image)
        signatures.append(Paragraph(escape(f"Name: {name or 'Pending signature'}"), styles['BodyText']))
        signatures.append(Paragraph(escape(f"Date (UTC): {date.strftime('%Y-%m-%d %H:%M') if date else 'Pending'}"), styles['BodyText']))
    signatures.append(Paragraph(f'Document ID: {item.id}', styles['BodyText']))
    flow.append(KeepTogether(signatures))
    def header(canvas, doc):
        width, height = A4
        canvas.saveState()
        logo = Path(__file__).resolve().parents[2] / 'assets' / 'images' / 'logo.png'
        if logo.exists(): canvas.drawImage(str(logo), width/2-82, height-83, width=60, height=60, preserveAspectRatio=True, mask='auto')
        canvas.setFillColor(HexColor('#CB5053'))
        canvas.setFont('Times-Bold', 26)
        canvas.drawString(width/2-14, height-62, 'ArtFilier')
        canvas.setFillColor(HexColor('#000000')); canvas.setFont('Times-Roman', 9)
        for i, line in enumerate(['ArtFilier', 'Cebu, Philippines', '+63 931 445 5671', 'artfilier@gmail.com']):
            canvas.drawRightString(width-24, height-32-i*10, line)
        canvas.setFillColor(HexColor('#CB5053')); canvas.rect(0, height-138, width, 36, fill=1, stroke=0)
        canvas.setFillColor(HexColor('#FFFFFF')); canvas.setFont('Times-Bold', 21)
        canvas.drawCentredString(width/2, height-126, 'ART LICENSE AGREEMENT')
        canvas.restoreState()
    doc = SimpleDocTemplate(output, pagesize=A4, title='Art License Agreement', author='ArtFilier', leftMargin=36, rightMargin=36, topMargin=160, bottomMargin=35)
    def canvas_factory(*args, **kwargs):
        canvas = NumberedCanvas(*args, **kwargs)
        canvas.draw_header = header
        return canvas
    doc.build(flow, canvasmaker=canvas_factory)
    return output.getvalue()

class AgreementSigningView(AuthenticatedAPIView):
    permission_classes = [IsAuthenticatedUser]

    def get(self, request, agreement_id, pdf=False):
        user = self.get_request_user(request)
        item = Agreement.objects.filter(pk=agreement_id).filter(Q(buyer=user) | Q(artist=user)).first()
        if not item:
            return Response({"error": "Agreement not found."}, status=404)
        if item.status != Agreement.Status.ACCEPTED:
            return Response({"error": "Both parties must agree before signing."}, status=409)
        if pdf:
            response = HttpResponse(render_pdf(item), content_type='application/pdf')
            response['Content-Disposition'] = f'inline; filename="agreement-{item.id}.pdf"'
            response['Cache-Control'] = 'private, no-store'
            return response
        return Response(signing_data(item, user))

    @transaction.atomic
    def post(self, request, agreement_id):
        user = self.get_request_user(request)
        item = Agreement.objects.select_for_update().filter(pk=agreement_id).filter(Q(buyer=user) | Q(artist=user)).first()
        if not item:
            return Response({"error": "Agreement not found."}, status=404)
        if item.status != Agreement.Status.ACCEPTED or not item.buyer_accepted_at or not item.artist_accepted_at:
            return Response({"error": "Both parties must agree before signing."}, status=409)
        name = request.data.get('signature', '')
        if not isinstance(name, str) or not 2 <= len(name.strip()) <= 200 or request.data.get('consent') is not True:
            return Response({"error": "Enter your full name and confirm your consent to sign."}, status=400)
        data = signing_data(item, user)
        if request.data.get('document_hash') != data['document_hash']:
            return Response({"error": "The document changed. Reload and review it before signing."}, status=409)
        role = data['my_role']
        if getattr(item, role + '_signed_at') and getattr(item, role + '_signature_image'):
            return Response(data)
        try:
            image = signature_image(request.data)
        except ValueError as error:
            return Response({'error': str(error)}, status=400)
        setattr(item, role + '_signature_image', image)
        item.document_snapshot = data['document']
        setattr(item, role + '_signature', name.strip())
        setattr(item, role + '_signed_at', timezone.now())
        item.save()
        return Response(signing_data(item, user))
