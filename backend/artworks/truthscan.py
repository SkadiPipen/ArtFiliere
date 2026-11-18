"""TruthScan's documented presign -> private upload -> detect -> query flow."""
import hashlib
import io
import logging
import math
import uuid
from datetime import timedelta
from urllib.parse import parse_qs, quote, unquote, urlsplit, urlunsplit

import httpx
from django.conf import settings
from django.db import transaction
from django.utils import timezone
from PIL import Image

from .ai_detector import DetectorUnavailable, ScreeningPending
from .models import ArtworkAIScan

API = 'https://detect-image.truthscan.com'
VERSION = 'truthscan-generic-adapter-v1'
logger = logging.getLogger(__name__)


def _send(method, url, **kwargs):
    # The production upload gateway interrupted HTTP/1.1 transfers in the live
    # check. HTTP/2 successfully uploads original images without recompression.
    timeout = settings.TRUTHSCAN_UPLOAD_TIMEOUT if method == 'PUT' else settings.TRUTHSCAN_REQUEST_TIMEOUT
    if 'data' in kwargs:
        kwargs['content'] = kwargs.pop('data')
    with httpx.Client(http2=True, timeout=httpx.Timeout(timeout, connect=5), follow_redirects=False) as client:
        return client.request(method, url, **kwargs)


def _request(method, url, **kwargs):
    response = _send(method, url, **kwargs)
    if not 200 <= response.status_code < 300:
        # Neither response bodies nor request URLs/keys belong in error logs.
        reason = ''
        try:
            payload = response.json()
            detail = payload.get('error', payload.get('detail', '')) if isinstance(payload, dict) else ''
            if isinstance(detail, str):
                detail = detail[:2048].lower()
                if any(text in detail for text in ('not enough credits', 'insufficient credits', 'out of credits', 'no credits', 'zero credits')):
                    reason = 'credits'
        except (ValueError, TypeError):
            pass
        raise ProviderHTTPError(response.status_code, reason)
    return response


class ProviderHTTPError(Exception):
    def __init__(self, status, reason=''):
        self.status = status
        self.reason = reason


FAILURES = {
    'credits': ('TruthScan has no available screening credits. The platform administrator must activate or add API credits before image screening can continue. Your image has not received a screening verdict.', 'screening_credits_exhausted'),
    'authentication': ('TruthScan denied access. The platform administrator must check the screening API key, account access and credits.', 'screening_access_denied'),
    'rate_limit': ('TruthScan is receiving too many requests. Wait at least one minute before retrying screening.', 'screening_rate_limited'),
    'request': ('TruthScan rejected the screening request. The platform administrator must check the provider integration; refreshing alone will not fix it.', 'screening_request_rejected'),
    'unavailable': ('TruthScan could not finish screening. Please retry shortly or contact platform support.', 'screening_unavailable'),
}


def failure_reason(error):
    if isinstance(error, ProviderHTTPError):
        if error.reason == 'credits':
            return 'credits'
        if error.status == 429:
            return 'rate_limit'
        if error.status in {401, 403}:
            return 'authentication'
        if error.status in {400, 422}:
            return 'request'
    return 'unavailable'


def normalise_result(payload):
    details = payload.get('result_details')
    if not isinstance(details, dict) or details.get('is_valid') is False:
        raise ValueError('Invalid detection result')
    label = details.get('final_result')
    labels = {'AI Generated', 'AI Edited', 'Digitally Edited', 'Real'}
    if label not in labels:
        raise ValueError('Unrecognised classification')
    value = details.get('final_label_confidence', details.get('confidence'))
    if isinstance(value, bool) or not isinstance(value, (int, float)):
        raise ValueError('Missing classification confidence')
    confidence = float(value) / 100
    if not math.isfinite(confidence) or not 0 <= confidence <= 1:
        raise ValueError('Invalid classification confidence')
    # This routing score is NOT an invented binary AI probability for Real or
    # Digitally Edited. Clients display the original label/confidence instead.
    return {'provider': 'truthscan', 'provider_name': 'TruthScan', 'model_version': VERSION,
            'score_kind': 'label_confidence', 'provider_label': label, 'label_confidence': confidence,
            'score': confidence if label in {'AI Generated', 'AI Edited'} else 0.0,
            'checked_at': timezone.now().isoformat()}


def _upload_location(payload):
    signed = payload.get('presigned_url')
    path = payload.get('file_path')
    if not isinstance(signed, str) or not isinstance(path, str) or not path:
        raise ValueError('Missing upload location')
    parsed = urlsplit(signed)
    if (parsed.scheme != 'https' or not parsed.hostname
            or parsed.username or parsed.password or parsed.port not in (None, 443)
            or parsed.fragment):
        raise ValueError('Unexpected provider upload location')
    if parsed.hostname == 'image-presigned-upload.ai-assets-cdn.com':
        # Current production responses use a signed upload proxy; file_path is
        # still the object key used by /detect, not the proxy's root URL.
        filename = parse_qs(parsed.query).get('filename', [''])[0]
        if (not path.startswith('uploads/') or '\\' in path or '..' in path.split('/')
                or filename not in {path, path.rsplit('/', 1)[-1]}):
            raise ValueError('Unexpected provider object key')
        return signed, 'https://ai-image-detector-prod.nyc3.digitaloceanspaces.com/' + quote(path, safe='/')
    if (not parsed.hostname.endswith('.digitaloceanspaces.com')
            or not unquote(parsed.path).endswith('/' + path.lstrip('/'))):
        raise ValueError('Unexpected provider storage host')
    return signed, urlunsplit((parsed.scheme, parsed.netloc, parsed.path, '', ''))


def validate_truthscan_image(raw):
    if len(raw) < 1024:
        raise ValueError('TruthScan requires an image of at least 1 KB. Upload a larger original image.')
    with Image.open(io.BytesIO(raw)) as image:
        kind = image.format
    formats = {'JPEG': ('jpg', 'image/jpeg'), 'PNG': ('png', 'image/png'), 'WEBP': ('webp', 'image/webp')}
    if kind not in formats:
        raise ValueError('Use a JPG, PNG or WebP image for screening.')
    return formats[kind]


def screen_with_truthscan(raw):
    key = settings.TRUTHSCAN_API_KEY
    if not key:
        raise DetectorUnavailable('TruthScan is not configured. Ask the administrator to add its API key.')
    extension, content_type = validate_truthscan_image(raw)
    digest = hashlib.sha256(raw).hexdigest()
    identity = hashlib.sha256((VERSION + ':' + hashlib.sha256(key.encode()).hexdigest() + ':' + digest).encode()).hexdigest()
    now = timezone.now()
    with transaction.atomic():
        ArtworkAIScan.objects.get_or_create(cache_key=identity)
        scan = ArtworkAIScan.objects.select_for_update().get(pk=identity)
        if scan.state == 'done' and scan.expires_at and scan.expires_at > now:
            return dict(scan.result)
        if scan.state == 'failed' and scan.expires_at and scan.expires_at > now:
            reason = scan.result.get('failure_reason', 'unavailable')
            raise DetectorUnavailable(*FAILURES.get(reason, FAILURES['unavailable']))
        if scan.lease_until and scan.lease_until > now:
            raise ScreeningPending('Your images are still being checked.')
        resume = bool(scan.job_id and scan.state == 'pending')
        scan.lease_until = now + timedelta(seconds=120)
        scan.state = 'pending' if resume else 'working'
        if not resume:
            scan.job_id = ''
        scan.save()
        owned_lease = scan.lease_until
    submitted = resume
    stage = 'query' if resume else 'upload'
    try:
        if not resume:
            filename = digest + '.' + extension
            location = _request('GET', API + '/get-presigned-url',
                                headers={'apikey': key}, params={'file_name': filename}).json()
            signed, object_url = _upload_location(location)
            _request('PUT', signed, data=raw, headers={'Content-Type': content_type, 'x-amz-acl': 'private'})
            # Save a client-generated ID BEFORE the billable call. If the reply
            # is lost, subsequent requests query this job, never submit another.
            with transaction.atomic():
                scan = ArtworkAIScan.objects.select_for_update().get(pk=identity)
                if scan.lease_until != owned_lease or scan.state != 'working':
                    raise ScreeningPending('Your images are already being checked.')
                scan.job_id = str(uuid.uuid4())
                scan.state = 'pending'
                scan.save(update_fields=['job_id', 'state', 'updated_at'])
            submitted = True
            stage = 'submit'
            accepted = _request('POST', API + '/detect', json={
                'key': key, 'id': scan.job_id, 'url': object_url, 'model': 'generic',
                'generate_preview': False, 'generate_analysis_details': False,
                'generate_heatmap': False, 'generate_heatmap_overlayed': False,
                'generate_heatmap_normalized': False,
            }).json()
            if not isinstance(accepted, dict) or not isinstance(accepted.get('id'), str):
                raise ValueError('Invalid job response')
            uuid.UUID(accepted['id'])
            scan.job_id = accepted['id']
            scan.save(update_fields=['job_id', 'updated_at'])
        stage = 'query'
        payload = _request('POST', API + '/query', json={'id': scan.job_id}).json()
        if not isinstance(payload, dict):
            raise ValueError('Invalid provider response')
        if payload.get('status') in {'pending', 'processing', 'queued', 'analyzing'}:
            raise ScreeningPending('Your images are still being checked.')
        if payload.get('status') != 'done':
            raise ValueError('Detection did not finish successfully')
        result = normalise_result(payload)
        scan.state, scan.result = 'done', result
        scan.expires_at = timezone.now() + timedelta(seconds=settings.TRUTHSCAN_RESULT_CACHE_SECONDS)
        scan.save(update_fields=['state', 'result', 'expires_at', 'updated_at'])
        return result
    except ScreeningPending:
        raise
    except Exception as error:
        # A definite rejection cannot have produced a charged job. An ambiguous
        # timeout/server failure keeps the ID so a retry only polls that job.
        rejected = stage == 'submit' and isinstance(error, ProviderHTTPError) and error.status in {400, 401, 403, 422, 429}
        reason = failure_reason(error)
        if not submitted or rejected:
            ArtworkAIScan.objects.filter(pk=identity, lease_until=owned_lease).update(
                state='failed', result={'failure_reason': reason}, expires_at=timezone.now() + timedelta(seconds=60))
        if submitted and isinstance(error, ProviderHTTPError) and error.status == 404:
            raise ScreeningPending('Your scan is awaiting confirmation. Please retry shortly.') from None
        logger.warning('TruthScan screening failed (%s at %s; provider_status=%s; reason=%s).',
                       type(error).__name__, stage, getattr(error, 'status', None), reason)
        raise DetectorUnavailable(*FAILURES[reason]) from None
    finally:
        ArtworkAIScan.objects.filter(pk=identity, lease_until=owned_lease).update(lease_until=None)
