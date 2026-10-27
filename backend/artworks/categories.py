"""A curated marketplace subset, not the entire Getty AAT taxonomy."""
import json
from pathlib import Path

CATALOGUE = json.loads((Path(__file__).resolve().parents[2] / 'shared' / 'artwork_categories.json').read_text(encoding='utf-8'))
CATEGORIES = {item['id']: item for item in CATALOGUE['categories']}
MAX_CATEGORIES = CATALOGUE['max_categories']


def normalize(value):
    return value.strip().lower().replace('_', ' ').replace('-', ' ')


ALIASES = {normalize(term): item['id'] for item in CATEGORIES.values() for term in [item['id'], item['label'], *item['aliases']]}


def category_ids(raw):
    return [ALIASES[normalize(raw)]] if isinstance(raw, str) and normalize(raw) in ALIASES else []


def validate_categories(data):
    selected = data.get('categories') if 'categories' in data else category_ids(data.get('category'))
    if not isinstance(selected, list) or not 1 <= len(selected) <= MAX_CATEGORIES:
        raise ValueError(f'Choose 1 to {MAX_CATEGORIES} artwork categories. The first is your primary category.')
    if any(not isinstance(item, str) or item not in CATEGORIES for item in selected):
        raise ValueError('Choose categories from the built-in list.')
    if len(set(selected)) != len(selected):
        raise ValueError('Choose each category only once.')
    return selected
