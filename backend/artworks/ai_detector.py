"""TruthScan-only artwork screening; no local model or training data required."""
import math

from django.conf import settings

from .hashing import decode_image_data, load_image


class DetectorUnavailable(Exception):
    pass


class ScreeningPending(DetectorUnavailable):
    pass


def screening_configuration():
    return {'provider': 'truthscan', 'provider_name': 'TruthScan', 'external_service': True,
            'configured': bool(settings.TRUTHSCAN_API_KEY)}


def screen_image(image_data):
    from .truthscan import screen_with_truthscan
    load_image(image_data)
    threshold = float(settings.ARTWORK_AUTO_AI_THRESHOLD)
    if not math.isfinite(threshold) or not 0 < threshold < 1:
        raise DetectorUnavailable('Image screening threshold is not configured correctly.')
    result = screen_with_truthscan(decode_image_data(image_data))
    return {**result, 'threshold': threshold,
            'status': 'review_required' if result['score'] >= threshold else 'clear'}


def screen_upload(cover, gallery=()):
    from .truthscan import validate_truthscan_image
    # Validate every image before spending any external-service credits.
    data_items = [cover, *gallery]
    for data in data_items:
        load_image(data)
        validate_truthscan_image(decode_image_data(data))
    images = [dict(screen_image(data), image_index=index) for index, data in enumerate(data_items)]
    highest = max(images, key=lambda item: (item['score'], item.get('label_confidence', 0)))
    return {**highest, 'images': images,
            'review_status': 'pending' if highest['status'] == 'review_required' else 'not_required'}
