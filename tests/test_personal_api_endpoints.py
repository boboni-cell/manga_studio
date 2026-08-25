import os
import tempfile
import unittest
from unittest import mock

import app as app_module


class FakeResponse:
    def __init__(self, status_code=200, payload=None, content=b'video-bytes'):
        self.status_code = status_code
        self._payload = payload or {}
        self.content = content
        self.text = ''
        self.headers = {'Content-Type': 'video/mp4', 'Content-Length': str(len(content))}

    def json(self):
        return self._payload

    def iter_content(self, _chunk_size):
        yield self.content


class PersonalApiEndpointTest(unittest.TestCase):
    def setUp(self):
        self.data_dir = tempfile.mkdtemp(prefix='personal_api_endpoint_test_')
        app_module.DATA = self.data_dir
        os.makedirs(app_module.DATA, exist_ok=True)
        self.client = app_module.app.test_client()
        with self.client.session_transaction() as session:
            session['user_id'] = 'endpoint-user'

    def test_new_custom_video_requires_full_submit_and_status_urls(self):
        base = {
            'kind': 'video',
            'provider': 'custom',
            'name': '自定义视频',
            'api_key': 'secret',
            'model': 'video-model',
        }

        missing_submit = self.client.post('/api/settings', json=base)
        self.assertEqual(missing_submit.status_code, 400)
        self.assertIn('完整提交接口', missing_submit.get_json()['error'])

        missing_status = self.client.post('/api/settings', json={
            **base,
            'submit_url': 'https://provider.example/v1/video/create',
        })
        self.assertEqual(missing_status.status_code, 400)
        self.assertIn('完整查询接口', missing_status.get_json()['error'])

        saved = self.client.post('/api/settings', json={
            **base,
            'submit_url': 'https://provider.example/v1/video/create',
            'status_url': 'https://provider.example/v1/video/{task_id}',
        })
        self.assertEqual(saved.status_code, 200)
        profile = saved.get_json()['profile']
        self.assertEqual(profile['endpoint_mode'], 'full')
        self.assertEqual(profile['submit_url'], 'https://provider.example/v1/video/create')
        self.assertEqual(profile['status_url'], 'https://provider.example/v1/video/{task_id}')

    def test_new_custom_text_and_image_require_full_submit_url(self):
        for kind in ('text', 'image'):
            with self.subTest(kind=kind):
                base = {
                    'kind': kind,
                    'provider': 'custom',
                    'name': f'自定义{kind}',
                    'api_key': 'secret',
                    'model': f'{kind}-model',
                }
                missing = self.client.post('/api/settings', json=base)
                self.assertEqual(missing.status_code, 400)
                self.assertIn('完整提交接口', missing.get_json()['error'])

                saved = self.client.post('/api/settings', json={
                    **base,
                    'submit_url': f'https://provider.example/v1/{kind}/generate',
                })
                self.assertEqual(saved.status_code, 200)
                profile = saved.get_json()['profile']
                self.assertEqual(profile['endpoint_mode'], 'full')
                self.assertEqual(profile['submit_url'], f'https://provider.example/v1/{kind}/generate')

    def test_existing_custom_profile_keeps_legacy_path_compatibility(self):
        app_module.save_json(app_module.settings_path('endpoint-user'), {
            'api_profiles': {
                'video': [{
                    'id': 'legacy-video',
                    'name': '现有可用配置',
                    'provider': 'custom',
                    'base_url': 'https://legacy.example/v1',
                    'api_key': 'secret',
                    'model': 'legacy-model',
                }],
            },
            'selected_api_profiles': {'video': 'legacy-video'},
        })

        response = self.client.post('/api/settings', json={
            'kind': 'video',
            'profile_id': 'legacy-video',
            'name': '现有可用配置',
            'provider': 'custom',
            'base_url': 'https://legacy.example/v1',
            'model': 'legacy-model',
        })

        self.assertEqual(response.status_code, 200)
        profile = response.get_json()['profile']
        self.assertEqual(profile['endpoint_mode'], '')
        self.assertEqual(profile['submit_url'], '')
        self.assertEqual(profile['base_url'], 'https://legacy.example/v1')

    @mock.patch.object(app_module, 'is_persistent_storage_url', return_value=False)
    @mock.patch.object(app_module, 'persistent_storage_configured', return_value=True)
    @mock.patch.object(app_module, 'upload_to_tos', return_value=(None, False))
    @mock.patch.object(app_module.requests, 'get', return_value=FakeResponse())
    def test_video_storage_failure_preserves_provider_url(self, _get, _upload, _configured, _persistent_url):
        source_url = 'https://provider.example/result.mp4'

        saved_url, file_name = app_module.download_and_save_video(source_url)

        self.assertEqual(saved_url, source_url)
        self.assertIsNone(file_name)

    @mock.patch.object(app_module, 'save_video_history')
    @mock.patch.object(app_module, 'download_and_save_video', return_value=('https://storage.example/video.mp4', 'video.mp4'))
    @mock.patch.object(app_module.requests, 'get', return_value=FakeResponse(payload={
        'status': 'succeeded',
        'video_url': 'https://provider.example/result.mp4',
    }))
    @mock.patch.object(app_module.requests, 'post', return_value=FakeResponse(payload={'task_id': 'task-1'}))
    def test_custom_video_uses_exact_submit_and_status_urls(self, post, get, _download, _history):
        app_module.JOBS['exact-endpoint-job'] = {'status': 'pending'}

        app_module.third_party_video_adapter(
            'exact-endpoint-job', 'prompt', [], None, None, None, None,
            '16:9', 5, 'https://studio.example',
            model_key='video-model', resolution='720p',
            api_base='https://ignored.example', api_key='secret', user_id='endpoint-user',
            submit_url='https://provider.example/v9/create-video',
            status_url='https://provider.example/v9/tasks/{task_id}',
        )

        self.assertEqual(post.call_args.args[0], 'https://provider.example/v9/create-video')
        self.assertEqual(get.call_args.args[0], 'https://provider.example/v9/tasks/task-1')
        self.assertEqual(app_module.JOBS['exact-endpoint-job']['status'], 'succeeded')


if __name__ == '__main__':
    unittest.main()
