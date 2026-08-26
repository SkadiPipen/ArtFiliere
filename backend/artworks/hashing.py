import base64
import hashlib
import io
import re

import imagehash
import cv2
import numpy as np  
from PIL import Image

# Matches strings like "data:image/jpeg;base64,/9j/4AAQ..." and captures
# just the base64 payload after the comma.
DATA_URL_PATTERN = re.compile(r"^data:image/(?:jpeg|jpg|png|webp);base64,([A-Za-z0-9+/=\s]+)$", re.DOTALL | re.IGNORECASE)
MAX_IMAGE_BYTES = 10 * 1024 * 1024


def decode_image_data(image_data: str) -> bytes:
    """
    Decodes a base64 data URL (e.g. "data:image/jpeg;base64,...") into raw
    image bytes.

    Raises ValueError if the string isn't a recognizable data URL -- this
    lets the caller return a clean 400 instead of a raw 500 on malformed
    input.
    """
    match = DATA_URL_PATTERN.match((image_data or "").strip())
    if not match:
        raise ValueError("image_data is not a valid base64 data URL.")

    try:
        raw_bytes = base64.b64decode(re.sub(r"\s+", "", match.group(1)), validate=True)
    except (base64.binascii.Error, ValueError):
        raise ValueError("image_data could not be decoded as base64.")
    if not raw_bytes or len(raw_bytes) > MAX_IMAGE_BYTES:
        raise ValueError("image_data exceeds the 10 MB upload limit.")
    return raw_bytes


def load_image(image_data: str) -> Image.Image:
    raw_bytes = decode_image_data(image_data)
    try:
        image = Image.open(io.BytesIO(raw_bytes))
        image.verify()
        image = Image.open(io.BytesIO(raw_bytes)).convert("RGB")
        image.load()
        return image
    except Exception as exc:
        raise ValueError("image_data is not a valid image.") from exc


def compute_sha256(image_data: str) -> str:
    """
    Tier 1 of the anti-plagiarism pipeline: exact-file-match detection.

    Returns the hex-encoded SHA-256 digest of the decoded image bytes. Two
    uploads of the *exact same file* (even re-encoded through a different
    upload path) will produce the same hash, so this catches byte-for-byte
    duplicate uploads. It does NOT catch resized, recompressed, cropped, or
    otherwise modified copies -- that's what tiers 2-4 (perceptual hashing,
    CLIP embeddings, ORB) are for.
    """
    raw_bytes = decode_image_data(image_data)
    return hashlib.sha256(raw_bytes).hexdigest()

def compute_perceptual_hash(image_data: str) -> str:
    """
    Tier 2 of the anti-plagiarism pipeline.

    Computes a perceptual hash (pHash) based on the visual appearance
    of the image.

    Unlike SHA-256, this can produce similar hashes for visually similar
    images even when the files themselves are different.
    """
    raw_bytes = decode_image_data(image_data)

    try:
        image = load_image(image_data)
    except ValueError:
        raise

    perceptual_hash = imagehash.phash(image)

    return str(perceptual_hash)


def compute_difference_hash(image_data: str) -> str:
    return str(imagehash.dhash(load_image(image_data)))


def compute_edge_hash(image_data: str) -> str:
    """Fingerprint composition and outlines while deliberately ignoring colour."""
    image = np.array(load_image(image_data))
    gray = cv2.cvtColor(image, cv2.COLOR_RGB2GRAY)
    edges = cv2.Canny(gray, 80, 180)
    return str(imagehash.phash(Image.fromarray(edges)))

def calculate_phash_distance(hash1: str, hash2: str) -> int:
    """
    Calculates the Hamming distance between two perceptual hashes.

    Lower values mean the images are more visually similar.
    Higher values mean they are more visually different.
    """
    try:
        image_hash1 = imagehash.hex_to_hash(hash1)
        image_hash2 = imagehash.hex_to_hash(hash2)
    except Exception:
        raise ValueError("Invalid perceptual hash.")

    return int(image_hash1 - image_hash2)


def calculate_feature_match_score(image_data: str, reference_image_data: str) -> float:
    """Returns a conservative ORB inlier ratio for crops and overlays."""
    def descriptors(data: str):
        image = np.array(load_image(data))
        return cv2.ORB_create(nfeatures=800).detectAndCompute(cv2.cvtColor(image, cv2.COLOR_RGB2GRAY), None)

    try:
        keypoints_a, descriptors_a = descriptors(image_data)
        keypoints_b, descriptors_b = descriptors(reference_image_data)
        if descriptors_a is None or descriptors_b is None or len(keypoints_a) < 8 or len(keypoints_b) < 8:
            return 0.0
        matches = cv2.BFMatcher(cv2.NORM_HAMMING, crossCheck=True).match(descriptors_a, descriptors_b)
        good_matches = [match for match in matches if match.distance <= 45]
        return round(len(good_matches) / max(1, min(len(keypoints_a), len(keypoints_b))), 4)
    except (ValueError, cv2.error):
        return 0.0


def calculate_color_similarity_score(image_data: str, reference_image_data: str) -> float:
    """Compare HSV colour distributions; useful context, never sole evidence."""
    try:
        def histogram(data: str):
            image = np.array(load_image(data))
            hsv = cv2.cvtColor(image, cv2.COLOR_RGB2HSV)
            hist = cv2.calcHist([hsv], [0, 1], None, [32, 32], [0, 180, 0, 256])
            return cv2.normalize(hist, hist).flatten()

        distance = cv2.compareHist(histogram(image_data), histogram(reference_image_data), cv2.HISTCMP_BHATTACHARYYA)
        return round(max(0.0, min(1.0, 1.0 - float(distance))), 4)
    except (ValueError, cv2.error):
        return 0.0


def similarity_confidence(phash_distance: int, dhash_distance: int, feature_match_score: float, edge_hash_distance: int | None = None) -> float:
    """A deliberately conservative ensemble score; 1.0 is a near duplicate."""
    phash_score = max(0.0, 1 - phash_distance / 20)
    dhash_score = max(0.0, 1 - dhash_distance / 20)
    base_score = (0.45 * phash_score) + (0.30 * dhash_score) + (0.25 * min(feature_match_score / 0.2, 1))
    if edge_hash_distance is None:
        return round(base_score, 3)
    edge_score = max(0.0, 1 - edge_hash_distance / 20)
    # A recolour should retain outlines. This lifts strong edge matches while
    # keeping weak/ambiguous edge matches in the normal review range.
    colour_invariant_score = (0.85 * edge_score) + (0.15 * min(feature_match_score / 0.2, 1))
    return round(max(base_score, colour_invariant_score), 3)


def is_review_worthy(phash_distance: int, dhash_distance: int, feature_match_score: float, confidence: float, edge_hash_distance: int | None = None) -> bool:
    return ((phash_distance <= 8 and dhash_distance <= 10) or feature_match_score >= 0.08 or confidence >= 0.72 or (edge_hash_distance is not None and edge_hash_distance <= 6))

