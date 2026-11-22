from django.conf import settings

from artworks.categories import validate_categories
from artworks.hashing import compute_sha256
from artworks.matching import compare_images, prepare_image
from artworks.metadata import artwork_metadata
from artworks.models import Artwork
from artworks.tagging import validate_final_tags

from .models import ArtistApplication


def prepare_portfolio(items, applicant):
    samples = []
    for number, item in enumerate(items, start=1):
        if not isinstance(item, dict):
            raise ValueError(f'Portfolio piece {number} is invalid.')
        title, description = item.get('title'), item.get('description')
        if not isinstance(title, str) or not title.strip() or len(title.strip()) > 200:
            raise ValueError(f'Enter a title for portfolio piece {number}, up to 200 characters.')
        if not isinstance(description, str) or not description.strip() or len(description.strip()) > 4000:
            raise ValueError(f'Enter a description for portfolio piece {number}, up to 4,000 characters.')
        art_type = item.get('art_type')
        if art_type not in ('physical', 'digital'):
            raise ValueError(f'Select the artwork type for portfolio piece {number}.')
        image = item.get('imageDataUri') or item.get('imageUri')
        try:
            metadata = artwork_metadata(item, art_type, required=True)
            categories = validate_categories(item)
            tags = validate_final_tags(item.get('selected_ai_tags'), item.get('custom_tags'))
            prepared = prepare_image(image)
            fingerprint = compute_sha256(image)
        except (ValueError, OSError) as error:
            raise ValueError(f'Portfolio piece {number}: {error}') from error
        samples.append(({
            'title': title.strip(), 'description': description.strip(), 'imageDataUri': image,
            'art_type': art_type, 'categories': categories, 'tags': tags, **metadata,
        }, prepared, fingerprint))

    matches = [[] for _ in samples]
    for reference in approved_references(applicant):
        try:
            fingerprint = compute_sha256(reference['image'])
            prepared = prepare_image(reference['image'])
        except (ValueError, OSError):
            continue
        for index, (_, sample_image, sample_fingerprint) in enumerate(samples):
            exact = sample_fingerprint == fingerprint
            if exact:
                score = 1.0
            else:
                result = compare_images(sample_image, prepared)
                score = result['confidence_score']
                if not result['review_worthy'] and score < settings.ARTWORK_AUTO_SIMILARITY_THRESHOLD:
                    continue
            matches[index].append({'title': reference['title'], 'artist': reference['artist'],
                                   'score': score, 'exact': exact, 'reference': reference['key']})

    return [dict(sample, similarity_match_count=len(found),
                 similarity_matches=sorted(found, key=lambda item: (item['exact'], item['score']), reverse=True)[:5])
            for (sample, _, _), found in zip(samples, matches)]


def approved_references(applicant):
    artworks = Artwork.objects.filter(status=Artwork.Status.APPROVED, automated_block_reason='').exclude(artist=applicant)
    for artwork_id, title, artist, image in artworks.values_list('pk', 'title', 'artist__username', 'image_data').iterator():
        yield {'title': title, 'artist': artist, 'image': image, 'key': {'artwork_id': artwork_id}}
    applications = ArtistApplication.objects.filter(status=ArtistApplication.ApprovalStatus.APPROVED).exclude(user=applicant)
    for application_id, artist, portfolio in applications.values_list('pk', 'user__username', 'portfolio').iterator():
        for index, item in enumerate(portfolio or []):
            if isinstance(item, dict):
                yield {'title': item.get('title') or 'Portfolio sample', 'artist': artist,
                       'image': item.get('imageDataUri') or item.get('imageUri'),
                       'key': {'application_id': application_id, 'sample_index': index}}
