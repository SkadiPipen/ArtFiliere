"""Portfolio entries never expose commission originals or private contract details."""
import base64
from io import BytesIO
from PIL import Image, ImageDraw, UnidentifiedImageError
from artworks.serializers import ArtworkSerializer
from commissions.models import CommissionRequest, CommissionSubmission
from fulfillment.certificates import commission_completed


def commission_preview(commission):
    submission = CommissionSubmission.objects.filter(
        milestone__commission_req=commission, milestone__milestone_number=3,
        content_type__startswith='image/').order_by('-pk').first()
    content = bytes(submission.content) if submission else None
    if content is None:
        photo = commission.photos.filter(photo_type='PROGRESS', stage_number=3).order_by('-uploaded_at').first()
        if photo and photo.image_url.startswith('data:image/'):
            try:
                content = base64.b64decode(photo.image_url.split(',', 1)[1], validate=True)
            except (ValueError, IndexError):
                pass
    if content:
        try:
            with Image.open(BytesIO(content)) as original:
                preview = original.convert('RGB')
                preview.thumbnail((900, 900))
                draw = ImageDraw.Draw(preview)
                for y in range(20, preview.height, 120):
                    draw.text((10, y), 'ArtFiliere preview', fill=(190, 70, 70), stroke_width=1, stroke_fill='white')
                output = BytesIO()
                preview.save(output, 'JPEG', quality=75)
                return 'data:image/jpeg;base64,' + base64.b64encode(output.getvalue()).decode()
        except (UnidentifiedImageError, OSError, ValueError):
            pass
    return None


def artist_portfolio(artist, *, own=False):
    artworks = artist.artworks.all()
    if not own:
        artworks = artworks.filter(status='approved')
    entries = list(ArtworkSerializer(artworks, many=True).data)
    for entry in entries:
        entry['source'] = 'artwork'
        entry['portfolio_date'] = entry['created_at']
    commissions = CommissionRequest.objects.filter(artist=artist, status='COMPLETE').prefetch_related('milestones')
    for commission in commissions:
        if not commission_completed(commission):
            continue
        milestones = list(commission.milestones.all())
        dates = [m.approved_at or m.paid_at for m in milestones if m.approved_at or m.paid_at]
        completed_at = max(dates) if dates else commission.created_at
        entries.append({
            'id': f'commission-{commission.pk}', 'commission_id': commission.pk,
            'source': 'commission', 'artist_id': artist.pk, 'title': commission.title,
            'art_type': commission.art_type, 'category': 'Completed commission',
            'status': 'approved', 'image_data': commission_preview(commission),
            'is_for_sale': False, 'portfolio_date': completed_at.isoformat(),
            'completed_at': completed_at.isoformat(),
        })
    from django.utils.dateparse import parse_datetime
    entries.sort(key=lambda entry: parse_datetime(entry['portfolio_date']).timestamp(), reverse=True)
    return entries
