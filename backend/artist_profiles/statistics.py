from django.db.models import Q

from fulfillment.models import PurchaseReview


def profile_counts(user):
    return {
        'reviews_count': PurchaseReview.objects.filter(
            Q(payment__artist=user, payment__status='paid') |
            Q(commission__artist=user, commission__status='COMPLETE'),
        ).count(),
        'followers_count': user.artist_followers.count(),
        'following_count': user.artist_follows.count(),
    }
