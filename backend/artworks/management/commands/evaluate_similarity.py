"""Evaluate labeled image pairs without database writes or network requests."""
import base64
import csv
import hashlib
import json
import math
from pathlib import Path
from django.core.management.base import BaseCommand, CommandError
from artworks.matching import VERSION, prepare_image, compare_images, strong_copy_evidence


class Command(BaseCommand):
    help = 'Evaluate image-copy thresholds using a CSV: left,right,label,split,group. Labels: copy or independent.'

    def add_arguments(self, parser):
        parser.add_argument('manifest')
        parser.add_argument('--split', choices=['calibration', 'test'], required=True)
        parser.add_argument('--thresholds', default='0.80,0.85,0.90,0.95')
        parser.add_argument('--output', help='Optional JSON report path; refuses to overwrite an existing file.')

    def handle(self, *args, **options):
        manifest = Path(options['manifest']).resolve()
        try:
            thresholds = [float(value) for value in options['thresholds'].split(',')]
            if not thresholds or any(not math.isfinite(t) or not 0 < t <= 1 for t in thresholds):
                raise ValueError('Thresholds must be between 0 and 1.')
            with manifest.open(encoding='utf-8-sig', newline='') as file:
                reader = csv.DictReader(file)
                if not {'left', 'right', 'label', 'split', 'group'} <= set(reader.fieldnames or []):
                    raise ValueError('Required CSV columns: left,right,label,split,group.')
                rows = list(reader)
            if not rows:
                raise ValueError('The manifest is empty.')
            groups, identities, cache = {}, {}, {}
            selected = []
            for row in rows:
                if row['label'] not in ('copy', 'independent') or row['split'] not in ('calibration', 'test') or not row['group'].strip():
                    raise ValueError('Each row needs a valid label, split and nonempty source-artwork group.')
                group, split = row['group'], row['split']
                if group in groups and groups[group] != split:
                    raise ValueError(f'Source group {group!r} appears in both splits.')
                groups[group] = split
                paths = [(manifest.parent / row[key]).resolve() for key in ('left', 'right')]
                if any(not row[key].strip() for key in ('left', 'right')):
                    raise ValueError('Image paths must not be empty.')
                digests = []
                for path in paths:
                    raw = path.read_bytes()
                    if not raw or len(raw) > 10 * 1024 * 1024:
                        raise ValueError('Evaluation images must be nonempty and at most 10 MB.')
                    digest = hashlib.sha256(raw).hexdigest()
                    if digest in identities and identities[digest] != split:
                        raise ValueError(f'Image {path.name!r} leaks across calibration and test splits.')
                    identities[digest] = split
                    digests.append(digest)
                    if split == options['split'] and digest not in cache:
                        uri = 'data:image/png;base64,' + base64.b64encode(raw).decode()
                        cache[digest] = prepare_image(uri)
                if split == options['split']:
                    selected.append((row, digests))
            if {row['label'] for row, _ in selected} != {'copy', 'independent'}:
                raise ValueError('The chosen split must include both copies and independent artworks.')
            measurements = []
            for row, (left, right) in selected:
                evidence = compare_images(cache[left], cache[right])
                measurements.append({'left': row['left'], 'right': row['right'], 'label': row['label'],
                                     'exact_duplicate': left == right, 'evidence': evidence})
            def divide(a, b):
                return round(a / b, 4) if b else None
            reports = []
            for threshold in thresholds:
                tp = fp = tn = fn = 0
                for pair in measurements:
                    positive = pair['exact_duplicate'] or strong_copy_evidence(pair['evidence'], threshold)
                    copied = pair['label'] == 'copy'
                    tp += int(positive and copied); fp += int(positive and not copied)
                    tn += int(not positive and not copied); fn += int(not positive and copied)
                reports.append({'threshold': threshold, 'tp': tp, 'fp': fp, 'tn': tn, 'fn': fn,
                    'precision': divide(tp, tp + fp), 'recall': divide(tp, tp + fn),
                    'false_positive_rate': divide(fp, fp + tn), 'accuracy': divide(tp + tn, len(measurements))})
            result = {'algorithm_version': VERSION, 'split': options['split'], 'pairs': len(measurements),
                'notice': 'Experimental copy-detection results, not plagiarism probabilities. Tune on calibration only; report a frozen threshold on test. Source groups must include all variants of an original.',
                'thresholds': reports, 'measurements': measurements}
            output = json.dumps(result, indent=2)
            if options['output']:
                with Path(options['output']).open('x', encoding='utf-8') as file:
                    file.write(output + '\n')
            else:
                self.stdout.write(output)
        except (OSError, ValueError, csv.Error) as exc:
            raise CommandError(str(exc)) from exc
