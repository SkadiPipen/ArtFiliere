from django.core.management.base import BaseCommand
from django.db import transaction
from django.utils import timezone

from artworks.models import Artwork, ArtworkReviewLog


class Command(BaseCommand):
    help = 'Move previous AI-only automatic declines to private evidence review; preserve audit history.'

    @transaction.atomic
    def handle(self, *args, **options):
        count = 0
        for artwork in Artwork.objects.select_for_update().filter(automated_block_reason='high_ai_score', status='declined'):
            screening = artwork.ai_screening
            if screening.get('review_status') == 'cleared':
                continue
            artwork.ai_screening = {**screening, 'status': 'review_required', 'review_status': 'pending',
                'previous_automatic_decision': {'reason': artwork.decline_reason, 'status': artwork.status, 'reopened_at': timezone.now().isoformat()}}
            artwork.status, artwork.automated_block_reason, artwork.decline_reason = 'pending', '', ''
            artwork.save(update_fields=['ai_screening', 'status', 'automated_block_reason', 'decline_reason', 'updated_at'])
            artwork.auction_listings.filter(status='CANCELLED', end_time__gt=timezone.now(), bids__isnull=True).update(status='PENDING_APPROVAL')
            ArtworkReviewLog.objects.create(artwork=artwork, action='ai_hold_reopened', previous_status='declined', new_status='pending',
                                            reason='Pilot detector colour sensitivity identified. AI-only automatic rejection replaced by evidence review.')
            count += 1
        self.stdout.write(self.style.SUCCESS(f'Reopened {count} AI-only submissions for private review.'))
