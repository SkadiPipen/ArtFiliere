"""In-app negotiation updates sent only to the other agreement participant."""
from notifications.models import UserNotification


def notify_negotiation(agreement, actor, event):
    if actor.pk not in (agreement.buyer_id, agreement.artist_id):
        return
    recipient_id = agreement.artist_id if actor.pk == agreement.buyer_id else agreement.buyer_id
    if recipient_id == actor.pk:
        return
    descriptions = {
        'proposed': ('New negotiation', 'started a negotiation'),
        'edited': ('Negotiation edited', 'edited the negotiation and sent a new offer'),
        'renegotiated': ('New counteroffer', 'sent the negotiation back with revised terms'),
        'accepted': ('Negotiation accepted', 'accepted the negotiation terms'),
        'cancelled': ('Negotiation cancelled', 'cancelled the negotiation'),
        'signed': ('Agreement signed', 'signed the negotiation agreement'),
    }
    title, action = descriptions[event]
    artwork_title = agreement.artwork.title if agreement.artwork else 'the artwork'
    UserNotification.objects.get_or_create(user_id=recipient_id, agreement=agreement, title=title,
        defaults={'artwork_id': agreement.artwork_id, 'message': f'{actor.username} {action} for "{artwork_title}". Open the chat to review.'})
