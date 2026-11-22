"""Versioned image-copy evidence. No model downloads or plagiarism verdicts."""
import cv2
import imagehash
import numpy as np
from PIL import Image, ImageOps
from .hashing import load_image, similarity_confidence, is_review_worthy

VERSION = 'geometry-v2'


def prepare_image(data):
    image = ImageOps.exif_transpose(load_image(data))
    image.thumbnail((960, 960))
    variants = []
    feature_images = []
    for mirrored in (False, True):
        base = ImageOps.mirror(image) if mirrored else image
        gray = cv2.cvtColor(np.asarray(base), cv2.COLOR_RGB2GRAY)
        feature_images.append(gray)
        for angle in (0, 90, 180, 270):
            rotated = base.rotate(angle, expand=True)
            edges = cv2.Canny(cv2.cvtColor(np.asarray(rotated), cv2.COLOR_RGB2GRAY), 80, 180)
            variants.append({'mirrored': mirrored, 'rotation': angle,
                             'p': imagehash.phash(rotated), 'd': imagehash.dhash(rotated),
                             'e': imagehash.phash(Image.fromarray(edges))})
    return {'variants': variants, 'feature_images': feature_images,
            'gray': feature_images[0]}


def geometric_match(left, right):
    result = {'feature_score': 0.0, 'matches': 0, 'inliers': 0, 'inlier_ratio': 0.0,
              'coverage_left': 0.0, 'coverage_right': 0.0, 'verified': False}
    try:
        orb = cv2.ORB_create(nfeatures=1200)
        ka, da = orb.detectAndCompute(left, None)
        kb, db = orb.detectAndCompute(right, None)
        if da is None or db is None or min(len(ka), len(kb)) < 12:
            return result
        matcher = cv2.BFMatcher(cv2.NORM_HAMMING)

        def distinctive(a, b):
            return {m.queryIdx: m for pair in matcher.knnMatch(a, b, k=2) if len(pair) == 2
                    for m, n in [pair] if m.distance <= 45 and m.distance < .75 * n.distance}

        forward, backward = distinctive(da, db), distinctive(db, da)
        good = [m for m in forward.values() if m.trainIdx in backward
                and backward[m.trainIdx].trainIdx == m.queryIdx]
        result['matches'] = len(good)
        if len(good) < 12:
            return result
        a = np.float32([ka[m.queryIdx].pt for m in good])
        b = np.float32([kb[m.trainIdx].pt for m in good])
        homography, mask = cv2.findHomography(a, b, cv2.RANSAC, 4.0, maxIters=2000, confidence=.995)
        if homography is None or mask is None or not np.isfinite(homography).all():
            return result
        inliers = mask.ravel().astype(bool)
        count = int(inliers.sum())
        ratio = count / len(good)

        def coverage(points, shape):
            return float(cv2.contourArea(cv2.convexHull(points))) / (shape[0] * shape[1]) if len(points) >= 3 else 0.0

        ca, cb = coverage(a[inliers], left.shape), coverage(b[inliers], right.shape)
        # A few coincident points or a shared tiny logo are insufficient evidence.
        verified = count >= 8 and ratio >= .55 and min(ca, cb) >= .02
        result.update(inliers=count, inlier_ratio=round(ratio, 4), coverage_left=round(ca, 4),
                      coverage_right=round(cb, 4), verified=verified,
                      feature_score=round(count / min(len(ka), len(kb)), 4) if verified else 0.0)
    except cv2.error:
        pass  # Missing geometry must never be interpreted as a positive match.
    return result


def strong_copy_evidence(result, threshold):
    """Experimental blocking gate: score + spatial evidence + signal agreement."""
    g = result['geometry']
    votes = sum((result['phash_distance'] <= 8, result['dhash_distance'] <= 10,
                 result['edge_hash_distance'] <= 6))
    geometry = g['verified'] and g['inliers'] >= 16 and g['inlier_ratio'] >= .65 and min(g['coverage_left'], g['coverage_right']) >= .08
    return bool(result['confidence_score'] >= threshold and geometry and votes >= 2)


def compare_images(left, right):
    """Compare prepared images; all hash measurements come from one orientation."""
    reference = right['variants'][0]
    geometries = [geometric_match(gray, right['gray']) for gray in left['feature_images']]
    candidates = []
    for variant in left['variants']:
        geometry = geometries[int(variant['mirrored'])]
        p, d, e = (int(variant[key] - reference[key]) for key in ('p', 'd', 'e'))
        score = similarity_confidence(p, d, geometry['feature_score'], e)
        candidates.append({'algorithm_version': VERSION, 'phash_distance': p, 'dhash_distance': d,
                           'edge_hash_distance': e, 'feature_match_score': geometry['feature_score'],
                           'confidence_score': score, 'rotation': variant['rotation'],
                           'mirrored': variant['mirrored'], 'geometry': geometry})
    result = max(candidates, key=lambda row: (row['confidence_score'], row['geometry']['inliers']))
    result['review_worthy'] = is_review_worthy(result['phash_distance'], result['dhash_distance'],
        result['feature_match_score'], result['confidence_score'], result['edge_hash_distance'])
    return result
