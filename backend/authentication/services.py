from firebase_admin import auth
from rest_framework.exceptions import APIException
import logging

logger = logging.getLogger(__name__)


class TokenRejected(APIException):
    status_code = 401
    default_code = 'invalid_token'
    default_detail = 'Login token could not be verified. Please sign in again.'


class TokenVerificationUnavailable(APIException):
    status_code = 503
    default_detail = 'Unable to reach Firebase to verify your login. Please try again shortly.'
    default_code = 'token_verification_unavailable'


class AccountRestricted(APIException):
    status_code = 403
    default_code = 'account_restricted'
    default_detail = 'Account access is restricted. Contact customer support.'

def verify_token(id_token):
    
    try:
        decoded_token = auth.verify_id_token(id_token, clock_skew_seconds=5)
    except auth.CertificateFetchError as error:
        raise TokenVerificationUnavailable() from error
    except (auth.InvalidIdTokenError, ValueError) as error:
        reason = str(error).lower()
        if 'too early' in reason or 'future' in reason:
            code, message = 'clock_mismatch', 'Login token is ahead of the server clock. Sync Windows date and time, then try again.'
        elif isinstance(error, auth.ExpiredIdTokenError) or 'expired' in reason:
            code, message = 'expired_token', 'Your login token expired. Please sign in again.'
        elif 'audience' in reason or 'issuer' in reason:
            code, message = 'project_mismatch', 'Login token belongs to a different Firebase project. Check the frontend and backend project connection.'
        else:
            code, message = 'invalid_token', TokenRejected.default_detail
        logger.warning('Firebase token verification rejected: %s (%s)', code, type(error).__name__)
        raise TokenRejected(detail={'error': message, 'code': code}) from error
    except Exception as error:
        logger.error('Firebase token verification unavailable (%s)', type(error).__name__)
        raise TokenVerificationUnavailable() from error
    from users.models import User
    user = User.objects.filter(firebase_uid=decoded_token.get('uid')).first()
    if user and user.access_restricted:
        raise AccountRestricted('Account access is restricted. Contact customer support.')
    return decoded_token
