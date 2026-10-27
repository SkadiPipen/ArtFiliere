import base64
from io import BytesIO
import unittest
from PIL import Image
from fulfillment.review_images import validate_review_images

class ReviewImageTests(unittest.TestCase):
    def test_valid_png_round_trip(self):
        stream = BytesIO()
        Image.new('RGB', (4, 4)).save(stream, format='PNG')
        photo = 'data:image/png;base64,' + base64.b64encode(stream.getvalue()).decode()
        self.assertEqual(validate_review_images([photo]), [photo])

    def test_rejects_invalid_attachments(self):
        for photos in (None, {}, ['x'] * 4, ['data:image/png;base64,bm90IGFuIGltYWdl'], ['data:image/svg+xml;base64,PHN2Zy8+'], ['x' * 1400051]):
            with self.subTest(photos_type=type(photos).__name__), self.assertRaises(ValueError):
                validate_review_images(photos)

    def test_optional_images(self):
        self.assertEqual(validate_review_images([]), [])
