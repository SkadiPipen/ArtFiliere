from unittest.mock import patch
from django.test import SimpleTestCase, TestCase
from rest_framework.test import APIRequestFactory
from users.models import User
from .categories import CATEGORIES, MAX_CATEGORIES, category_ids, validate_categories
from .models import Artwork
from .serializers import ArtworkSerializer
from .views import ArtworkView
from .tests import image_data_url


class CategoryValidationTests(SimpleTestCase):
    def test_primary_order_is_preserved_and_five_are_allowed(self):
        selected = ['illustration', 'painting', 'collage', 'mixed_media', 'digital_art']
        self.assertEqual(validate_categories({'categories': selected}), selected)
        self.assertEqual(MAX_CATEGORIES, 5)

    def test_rejects_empty_duplicates_unknown_and_over_limit(self):
        for selected in [[], None, 'painting', ['painting', 'painting'], ['landscape'], [None], list(CATEGORIES)[:6]]:
            with self.subTest(selected=selected), self.assertRaises(ValueError):
                validate_categories({'categories': selected})

    def test_legacy_matching_is_explicit_and_does_not_guess_from_format(self):
        self.assertEqual(category_ids('Oil_Painting'), ['painting'])
        self.assertEqual(category_ids('sketches'), ['drawing'])
        self.assertEqual(category_ids('Digital'), [])
        self.assertEqual(category_ids('Portrait'), [])
        self.assertEqual(validate_categories({'category': 'Photography'}), ['photography'])


class CategoryPostingTests(TestCase):
    def setUp(self):
        self.artist = User.objects.create(firebase_uid='category-artist', username='category-artist', email='category@artist.test', role='artist')

    def post(self, extra):
        data = {'title': 'Mixed artwork', 'description': 'A painted illustration with collage.', 'price': '110',
                'hours': '1', 'hourly_rate': '100', 'art_type': 'digital', 'image_data': image_data_url(), **extra}
        request = APIRequestFactory().post('/', data, format='json')
        with patch('authentication.views.AuthenticatedAPIView.get_request_user', return_value=self.artist):
            return ArtworkView.as_view()(request)

    def test_post_saves_primary_and_secondary_categories(self):
        response = self.post({'categories': ['illustration', 'painting', 'collage'], 'category': 'Untrusted free text'})
        self.assertEqual(response.status_code, 201, response.data)
        artwork = Artwork.objects.get()
        self.assertEqual(artwork.category, 'Illustration')
        self.assertEqual(artwork.categories, ['illustration', 'painting', 'collage'])
        result = ArtworkSerializer(artwork).data
        self.assertEqual(result['category_labels'], ['Illustration', 'Painting', 'Collage'])

    def test_invalid_categories_cannot_be_posted_by_bypassing_picker(self):
        response = self.post({'categories': ['not-a-category']})
        self.assertEqual(response.status_code, 400)
        self.assertFalse(Artwork.objects.exists())

    def test_known_legacy_category_still_posts_but_unknown_is_rejected(self):
        self.assertEqual(self.post({'category': 'Portrait'}).status_code, 400)
        response = self.post({'category': 'Painting'})
        self.assertEqual(response.status_code, 201, response.data)
        self.assertEqual(Artwork.objects.get().categories, ['painting'])

    def edit(self, user, data):
        artwork = Artwork.objects.get()
        request = APIRequestFactory().patch('/', data, format='json')
        with patch('authentication.views.AuthenticatedAPIView.get_request_user', return_value=user):
            return ArtworkView.as_view()(request, artwork_id=artwork.pk)

    def test_owner_can_reclassify_existing_work_without_changing_price(self):
        self.post({'category': 'Painting'})
        response = self.edit(self.artist, {'categories': ['collage', 'mixed_media']})
        self.assertEqual(response.status_code, 200, response.data)
        artwork = Artwork.objects.get()
        self.assertEqual(artwork.categories, ['collage', 'mixed_media'])
        self.assertEqual(artwork.category, 'Collage')
        self.assertEqual(str(artwork.price), '110.00')
        response = self.edit(self.artist, {'categories': ['painting'], 'price': '1'})
        self.assertEqual(response.status_code, 400)

    def test_other_accounts_cannot_change_categories(self):
        self.post({'category': 'Painting'})
        other = User.objects.create(firebase_uid='other-category', username='other-category', email='other@category.test', role='artist')
        self.assertEqual(self.edit(other, {'categories': ['collage']}).status_code, 404)
        self.assertIn(self.edit(None, {'categories': ['collage']}).status_code, [401, 403])
        self.assertEqual(Artwork.objects.get().categories, ['painting'])
