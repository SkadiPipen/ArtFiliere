import base64
import io
import csv
import json
import tempfile
from pathlib import Path
from unittest.mock import patch
import cv2
import numpy as np
from PIL import Image, ImageDraw, ImageOps
from django.test import SimpleTestCase
from django.core.management import call_command, CommandError
from .hashing import similarity_confidence
from .matching import prepare_image, compare_images, geometric_match, strong_copy_evidence


def encode(image, quality=None):
    stream = io.BytesIO()
    image.save(stream, 'JPEG' if quality else 'PNG', **({'quality': quality} if quality else {}))
    return 'data:image/png;base64,' + base64.b64encode(stream.getvalue()).decode()


def artwork(seed):
    rng = np.random.default_rng(seed)
    image = Image.new('RGB', (480, 480), '#e7dcd1')
    draw = ImageDraw.Draw(image)
    for _ in range(120):
        x, y = rng.integers(10, 420, size=2)
        size = int(rng.integers(6, 45))
        color = tuple(int(v) for v in rng.integers(20, 225, size=3))
        draw.ellipse((int(x), int(y), int(x) + size, int(y) + size), fill=color, outline='black', width=2)
    return image


class MatchingTests(SimpleTestCase):
    @classmethod
    def setUpClass(cls):
        super().setUpClass()
        cls.image = artwork(17)
        cls.reference = prepare_image(encode(cls.image))

    def test_hashes_and_edges_without_geometry_cannot_reach_block_threshold(self):
        self.assertLess(similarity_confidence(0, 0, 0, 0), .8)
        self.assertLess(similarity_confidence(64, 64, 0, 0), .8)

    def test_transformed_copies_have_verified_geometry(self):
        for name, image in [('jpeg', self.image), ('flip', ImageOps.mirror(self.image)),
                            ('rotation', self.image.rotate(90)), ('crop', self.image.crop((50, 40, 430, 440))),
                            ('resize', self.image.resize((360, 360))),
                            ('recolor', ImageOps.colorize(ImageOps.grayscale(self.image), '#112255', '#ffeeaa'))]:
            with self.subTest(name=name):
                result = compare_images(prepare_image(encode(image, 70)), self.reference)
                self.assertTrue(result['geometry']['verified'], result)
                self.assertTrue(result['review_worthy'], result)

    def test_recompressed_copy_meets_multi_signal_gate(self):
        result = compare_images(prepare_image(encode(self.image, 80)), self.reference)
        self.assertTrue(strong_copy_evidence(result, .8), result)

    def test_independent_art_with_shared_style_does_not_meet_block_gate(self):
        for seed in (21, 54, 81):
            result = compare_images(prepare_image(encode(artwork(seed))), self.reference)
            self.assertFalse(strong_copy_evidence(result, .8), result)

    def test_low_detail_images_do_not_invent_geometry(self):
        result = compare_images(prepare_image(encode(Image.new('RGB', (200, 200), 'white'))),
                                prepare_image(encode(Image.new('RGB', (200, 200), 'gray'))))
        self.assertFalse(result['geometry']['verified'])
        self.assertFalse(strong_copy_evidence(result, .8))

    def test_geometry_failure_is_not_positive_evidence(self):
        with patch('artworks.matching.cv2.findHomography', side_effect=cv2.error('failed')):
            result = geometric_match(self.reference['gray'], self.reference['gray'])
        self.assertFalse(result['verified'])
        self.assertEqual(result['feature_score'], 0)


class EvaluationTests(SimpleTestCase):
    def make_manifest(self, directory, rows):
        for index, color in enumerate(('red', 'green', 'blue')):
            Image.new('RGB', (64, 64), color).save(directory / f'{index}.png')
        manifest = directory / 'pairs.csv'
        with manifest.open('w', newline='', encoding='utf-8') as file:
            writer = csv.writer(file)
            writer.writerow(['left', 'right', 'label', 'split', 'group'])
            writer.writerows(rows)
        return manifest

    def test_metrics_include_exact_duplicate_and_true_negative(self):
        with tempfile.TemporaryDirectory() as folder:
            manifest = self.make_manifest(Path(folder), [
                ['0.png', '0.png', 'copy', 'calibration', 'a'],
                ['1.png', '2.png', 'independent', 'calibration', 'b'],
            ])
            output = io.StringIO()
            call_command('evaluate_similarity', str(manifest), split='calibration', thresholds='0.8', stdout=output)
            metrics = json.loads(output.getvalue())['thresholds'][0]
            self.assertEqual((metrics['tp'], metrics['tn'], metrics['fp'], metrics['fn']), (1, 1, 0, 0))

    def test_image_and_group_leakage_are_rejected(self):
        for rows in ([['0.png', '1.png', 'copy', 'calibration', 'a'], ['0.png', '2.png', 'independent', 'test', 'b']],
                     [['0.png', '1.png', 'copy', 'calibration', 'a'], ['2.png', '2.png', 'copy', 'test', 'a']]):
            with self.subTest(rows=rows), tempfile.TemporaryDirectory() as folder:
                manifest = self.make_manifest(Path(folder), rows)
                with self.assertRaises(CommandError):
                    call_command('evaluate_similarity', str(manifest), split='calibration', stdout=io.StringIO())

    def test_invalid_threshold_and_single_class_are_rejected(self):
        with tempfile.TemporaryDirectory() as folder:
            manifest = self.make_manifest(Path(folder), [['0.png', '0.png', 'copy', 'test', 'a']])
            for threshold in ('nan', '1.5', '0', '0.8'):
                with self.subTest(threshold=threshold), self.assertRaises(CommandError):
                    call_command('evaluate_similarity', str(manifest), split='test', thresholds=threshold, stdout=io.StringIO())
