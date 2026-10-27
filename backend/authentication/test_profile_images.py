import base64
from io import BytesIO
from unittest.mock import patch
from PIL import Image
from django.test import TestCase
from rest_framework.test import APIRequestFactory
from users.models import User
from .views import me


class ProfileImagesTests(TestCase):
    def setUp(self):
        self.user = User.objects.create(firebase_uid='cover-owner', email='cover@test.com', username='cover-owner')
        image = BytesIO()
        Image.new('RGB', (36, 10), 'red').save(image, format='PNG')
        self.image = 'data:image/png;base64,' + base64.b64encode(image.getvalue()).decode()

    def call(self, method, data=None):
        request = getattr(APIRequestFactory(), method)('/auth/me/', data, format='json', HTTP_AUTHORIZATION='Bearer test')
        with patch('authentication.views.verify_token', return_value={'uid': self.user.firebase_uid}):
            return me(request)

    def test_cover_and_avatar_persist_and_cover_can_be_reset(self):
        response = self.call('patch', {'cover_image': self.image, 'profile_image': self.image})
        self.assertEqual(response.status_code, 200)
        self.user.refresh_from_db()
        self.assertEqual(self.user.cover_image, self.image)
        self.assertEqual(self.user.profile_image, self.image)
        self.assertEqual(self.call('get').data['cover_image'], self.image)
        self.assertEqual(self.call('patch', {'cover_image': ''}).status_code, 200)
        self.user.refresh_from_db()
        self.assertEqual(self.user.cover_image, '')
        self.assertEqual(self.user.profile_image, self.image)

    def test_invalid_images_do_not_change_profile(self):
        for invalid in ['file:///local/photo.png', 'data:image/svg+xml;base64,PHN2Zz4=', 'data:image/png;base64,bm90IGFuIGltYWdl', None, 'x' * 4200001]:
            with self.subTest(value=str(invalid)[:40]):
                response = self.call('patch', {'cover_image': invalid, 'first_name': 'Changed'})
                self.assertEqual(response.status_code, 400)
                self.user.refresh_from_db()
                self.assertEqual(self.user.cover_image, '')
                self.assertEqual(self.user.first_name, '')

    def test_photo_changes_require_authentication(self):
        request = APIRequestFactory().patch('/auth/me/', {'cover_image': self.image}, format='json')
        self.assertEqual(me(request).status_code, 401)
