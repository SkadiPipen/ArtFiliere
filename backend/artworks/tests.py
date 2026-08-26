import base64
import io

from PIL import Image, ImageDraw
from django.test import SimpleTestCase

from .hashing import (
    calculate_phash_distance,
    compute_difference_hash,
    compute_perceptual_hash,
    compute_sha256,
    is_review_worthy,
    similarity_confidence,
)


def image_data_url(*, quality=95, accent="#1d4ed8"):
    image = Image.new("RGB", (256, 256), "#f8fafc")
    draw = ImageDraw.Draw(image)
    draw.rectangle((28, 28, 220, 220), outline=accent, width=9)
    draw.ellipse((75, 70, 185, 180), fill=accent)
    buffer = io.BytesIO()
    image.save(buffer, format="JPEG", quality=quality)
    return "data:image/jpeg;base64," + base64.b64encode(buffer.getvalue()).decode()


class ImageFingerprintTests(SimpleTestCase):
    def test_exact_hash_changes_when_a_file_is_reencoded(self):
        original = image_data_url(quality=95)
        recompressed = image_data_url(quality=55)
        self.assertNotEqual(compute_sha256(original), compute_sha256(recompressed))

    def test_perceptual_hash_recognises_a_recompressed_copy(self):
        original = image_data_url(quality=95)
        recompressed = image_data_url(quality=55)
        self.assertLessEqual(
            calculate_phash_distance(compute_perceptual_hash(original), compute_perceptual_hash(recompressed)),
            8,
        )
        self.assertLessEqual(
            calculate_phash_distance(compute_difference_hash(original), compute_difference_hash(recompressed)),
            10,
        )

    def test_similarity_policy_is_conservative(self):
        confidence = similarity_confidence(3, 4, 0.11)
        self.assertTrue(is_review_worthy(3, 4, 0.11, confidence))
        self.assertFalse(is_review_worthy(19, 20, 0.0, similarity_confidence(19, 20, 0.0)))
