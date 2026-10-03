from unittest.mock import Mock, patch
from django.test import SimpleTestCase
from .tagging import generate_tags


class TaggingTests(SimpleTestCase):
    def response(self, code=200, content='{"tags":["landscape","watercolor","mountain"]}'):
        response = Mock(status_code=code, ok=code == 200, text='provider error')
        response.json.return_value = {'choices':[{'message':{'content':content}}]} if code == 200 else {'error':{'code':'json_validate_failed'}}
        return response

    @patch.dict('os.environ', {'GROQ_API_KEY':'test-key'})
    @patch('artworks.tagging.candidates_for', return_value=['landscape','watercolor','mountain'])
    @patch('artworks.tagging.requests.post')
    def test_schema_failure_retries_json_mode_and_preserves_validation(self, post, candidates):
        post.side_effect = [self.response(400), self.response()]
        self.assertEqual(generate_tags('A watercolor mountain landscape'), ['landscape','watercolor','mountain'])
        self.assertEqual(post.call_count, 2)
        self.assertEqual(post.call_args_list[0].kwargs['json']['reasoning_effort'], 'low')
        self.assertEqual(post.call_args_list[1].kwargs['json']['response_format'], {'type':'json_object'})

    @patch.dict('os.environ', {'GROQ_API_KEY':'test-key'})
    @patch('artworks.tagging.candidates_for', return_value=['landscape','watercolor','mountain'])
    @patch('artworks.tagging.requests.post')
    def test_invalid_and_unapproved_tags_are_rejected(self, post, candidates):
        for content in ('[]', '{"tags":"landscape"}', '{"tags":[{},"invented","landscape"]}', '{"tags":null}'):
            post.return_value = self.response(content=content)
            with self.assertRaises(RuntimeError):
                generate_tags('A watercolor mountain landscape')

    @patch.dict('os.environ', {'GROQ_API_KEY':'test-key'})
    @patch('artworks.tagging.requests.post')
    def test_provider_failure_is_not_retried_forever(self, post):
        post.return_value = self.response(400)
        with self.assertRaises(RuntimeError):
            generate_tags('A watercolor mountain landscape')
        self.assertEqual(post.call_count, 2)
