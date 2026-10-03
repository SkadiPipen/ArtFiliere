from firebase_admin import auth

class AccountRestrictedError(ValueError):
    pass

def verify_token(id_token):
    
    decoded_token = auth.verify_id_token(id_token)
    from django.db.models import Q
    from django.utils import timezone
    from wallets.models import AccountActionRequest
    restriction = AccountActionRequest.objects.filter(target__firebase_uid=decoded_token['uid'], status='approved').filter(
        Q(action='ban') | Q(action='suspension', expires_at__gt=timezone.now())).first()
    if restriction:
        raise AccountRestrictedError('This account is banned.' if restriction.action == 'ban' else 'This account is temporarily suspended.')

    return decoded_token
