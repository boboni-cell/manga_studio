import hashlib
import json
import os
import sys
import tempfile
import unittest
from unittest import mock

REPO = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
REAL_DATA = os.path.join(REPO, 'data')


def hash_json_tree(root):
    result = {}
    for dirpath, _dirnames, filenames in os.walk(root):
        for filename in sorted(filenames):
            if not filename.endswith('.json'):
                continue
            path = os.path.join(dirpath, filename)
            try:
                with open(path, 'rb') as fh:
                    result[os.path.relpath(path, root)] = hashlib.sha256(fh.read()).hexdigest()
            except OSError:
                pass
    return result


BASELINE = hash_json_tree(REAL_DATA)

sys.path.insert(0, REPO)
import app as app_module  # noqa: E402

TEST_DATA = tempfile.mkdtemp(prefix='canvas_api_test_')
app_module.DATA = TEST_DATA
os.makedirs(app_module.DATA, exist_ok=True)


def result_node(node_id='n1', **data):
    return {'id': node_id, 'type': 'result', 'position': {'x': 0, 'y': 0}, 'data': data}


class CanvasApiTest(unittest.TestCase):
    def setUp(self):
        self.client = app_module.app.test_client()

    def login(self, user_id):
        with self.client.session_transaction() as sess:
            sess['user_id'] = user_id

    def create(self, user_id, payload):
        self.login(user_id)
        return self.client.post('/api/canvas', json=payload)

    def test_unauthorized(self):
        self.assertEqual(self.client.get('/api/canvas').status_code, 401)
        self.assertEqual(self.client.post('/api/canvas', json={}).status_code, 401)
        self.assertEqual(self.client.get('/api/canvas/nope').status_code, 401)

    def test_user_isolation(self):
        self.login('alice')
        resp = self.client.post('/api/canvas', json={'title': 'A', 'nodes': [], 'edges': []})
        self.assertEqual(resp.status_code, 201)
        canvas_id = resp.get_json()['canvas']['id']

        self.login('bob')
        listed = [item['id'] for item in self.client.get('/api/canvas').get_json()['canvases']]
        self.assertNotIn(canvas_id, listed)
        self.assertEqual(self.client.get('/api/canvas/' + canvas_id).status_code, 404)
        self.assertEqual(self.client.put('/api/canvas/' + canvas_id, json={'title': 'hijack'}).status_code, 404)
        self.assertEqual(self.client.delete('/api/canvas/' + canvas_id).status_code, 404)

    def test_crud_roundtrip(self):
        self.login('alice')
        nodes = [
            {'id': 'n1', 'type': 'script', 'position': {'x': 0, 'y': 0}, 'data': {
                'label': '剧本文本', 'script': '咖啡馆里相遇', 'script_model': 'doubao', 'split_mode': 'smart',
                'split': {'job_id': None, 'status': 'idle', 'shots': [], 'error': None}}},
            {'id': 'n2', 'type': 'result', 'position': {'x': 200, 'y': 0}, 'data': {'label': '结果', 'kind': 'image', 'media_url': None}},
        ]
        edges = [{'id': 'e1', 'source': 'n1', 'target': 'n2', 'label': '结果'}]
        payload = {'title': 'Round', 'nodes': nodes, 'edges': edges, 'viewport': {'x': 1.5, 'y': 2, 'zoom': 0.8}}
        resp = self.client.post('/api/canvas', json=payload)
        self.assertEqual(resp.status_code, 201)
        canvas_id = resp.get_json()['canvas']['id']

        canvas = self.client.get('/api/canvas/' + canvas_id).get_json()['canvas']
        self.assertEqual(canvas['title'], 'Round')
        self.assertEqual(len(canvas['nodes']), 2)
        self.assertEqual(canvas['edges'][0]['source'], 'n1')
        self.assertEqual(canvas['viewport']['zoom'], 0.8)

        resp = self.client.put('/api/canvas/' + canvas_id, json={'title': 'Updated', 'nodes': [nodes[0]], 'edges': [], 'viewport': {'x': 0, 'y': 0, 'zoom': 1}})
        self.assertEqual(resp.status_code, 200)
        canvas = self.client.get('/api/canvas/' + canvas_id).get_json()['canvas']
        self.assertEqual(canvas['title'], 'Updated')
        self.assertEqual(len(canvas['nodes']), 1)

        self.assertEqual(self.client.delete('/api/canvas/' + canvas_id).status_code, 200)
        self.assertEqual(self.client.get('/api/canvas/' + canvas_id).status_code, 404)

    def test_missing_canvas_404(self):
        self.login('alice')
        self.assertEqual(self.client.get('/api/canvas/missing').status_code, 404)

    def test_unknown_node_type(self):
        resp = self.create('alice', {'title': 't', 'nodes': [{'id': 'n1', 'type': 'bogus', 'position': {'x': 0, 'y': 0}, 'data': {}}], 'edges': []})
        self.assertEqual(resp.status_code, 400)

    def test_unknown_top_level_field(self):
        resp = self.create('alice', {'title': 't', 'foo': 1})
        self.assertEqual(resp.status_code, 400)

    def test_unknown_node_field(self):
        resp = self.create('alice', {'title': 't', 'nodes': [{'id': 'n1', 'type': 'result', 'position': {'x': 0, 'y': 0}, 'data': {}, 'foo': 1}], 'edges': []})
        self.assertEqual(resp.status_code, 400)

    def test_unknown_data_field(self):
        resp = self.create('alice', {'title': 't', 'nodes': [result_node('n1', bar=1)], 'edges': []})
        self.assertEqual(resp.status_code, 400)

    def test_sensitive_key_rejected(self):
        resp = self.create('alice', {'title': 't', 'nodes': [result_node('n1', api_key='x')], 'edges': []})
        self.assertEqual(resp.status_code, 400)
        resp = self.create('alice', {'title': 't', 'nodes': [result_node('n1', token='x')], 'edges': []})
        self.assertEqual(resp.status_code, 400)

    def test_data_url_rejected(self):
        resp = self.create('alice', {'title': 't', 'nodes': [result_node('n1', media_url='data:image/png;base64,AAAA')], 'edges': []})
        self.assertEqual(resp.status_code, 400)

    def test_nan_viewport_rejected(self):
        resp = self.create('alice', {'title': 't', 'nodes': [], 'edges': [], 'viewport': {'x': 0, 'y': 0, 'zoom': float('nan')}})
        self.assertEqual(resp.status_code, 400)

    def test_edge_missing_node(self):
        resp = self.create('alice', {'title': 't', 'nodes': [result_node('n1')], 'edges': [{'id': 'e1', 'source': 'n1', 'target': 'n2'}]})
        self.assertEqual(resp.status_code, 400)

    def test_title_too_long(self):
        resp = self.create('alice', {'title': 'x' * 101, 'nodes': [], 'edges': []})
        self.assertEqual(resp.status_code, 400)

    def test_too_many_nodes(self):
        nodes = [result_node('n' + str(i)) for i in range(301)]
        resp = self.create('alice', {'title': 't', 'nodes': nodes, 'edges': []})
        self.assertEqual(resp.status_code, 400)

    def test_too_many_edges(self):
        nodes = [result_node('n1'), result_node('n2')]
        edges = [{'id': 'e' + str(i), 'source': 'n1', 'target': 'n2'} for i in range(601)]
        resp = self.create('alice', {'title': 't', 'nodes': nodes, 'edges': edges})
        self.assertEqual(resp.status_code, 400)

    def test_body_too_large(self):
        big = 'x' * (600 * 1024)
        resp = self.create('alice', {'title': big, 'nodes': [], 'edges': []})
        self.assertEqual(resp.status_code, 413)

    def test_wrong_types(self):
        self.assertEqual(self.create('alice', {'title': 5}).status_code, 400)
        self.assertEqual(self.create('alice', {'title': 't', 'nodes': {}}).status_code, 400)
        self.assertEqual(self.create('alice', {'title': 't', 'nodes': [{'id': 'n1', 'type': 'result', 'position': {'x': 'a', 'y': 0}, 'data': {}}], 'edges': []}).status_code, 400)

    def test_put_id_mismatch(self):
        self.login('alice')
        resp = self.client.post('/api/canvas', json={'title': 't', 'nodes': [], 'edges': []})
        canvas_id = resp.get_json()['canvas']['id']
        self.assertEqual(self.client.put('/api/canvas/' + canvas_id, json={'id': 'other', 'title': 'x'}).status_code, 400)

    def test_reactflow_runtime_field_rejected(self):
        node = {'id': 'n1', 'type': 'result', 'position': {'x': 0, 'y': 0}, 'data': {}, 'measured': {'width': 100, 'height': 50}, 'selected': True, 'dragging': False}
        resp = self.create('alice', {'title': 't', 'nodes': [node], 'edges': []})
        self.assertEqual(resp.status_code, 400)

    def test_video_asset_source_accepted(self):
        node = {'id': 'n1', 'type': 'asset', 'position': {'x': 0, 'y': 0}, 'data': {'asset_type': 'video', 'refs': [{'source': 'video', 'ref_id': None, 'name': '历史视频', 'url': 'https://example.com/v.mp4', 'role_label': '参考视频'}]}}
        resp = self.create('alice', {'title': 't', 'nodes': [node], 'edges': []})
        self.assertEqual(resp.status_code, 201)

    def test_canvas_page_requires_login_and_serves_spa(self):
        resp = self.client.get('/canvas')
        self.assertEqual(resp.status_code, 200)
        self.assertIn('账号登录', resp.get_data(as_text=True))

        self.login('alice')
        resp = self.client.get('/canvas')
        self.assertEqual(resp.status_code, 200)
        text = resp.get_data(as_text=True)
        self.assertIn('画布工作台', text)
        self.assertIn('id="root"', text)

    def test_canvas_static_assets_served(self):
        import re
        dist_index = os.path.join(REPO, 'static', 'canvas', 'dist', 'index.html')
        self.assertTrue(os.path.exists(dist_index))
        with open(dist_index, 'r', encoding='utf-8') as fh:
            html = fh.read()
        assets = re.findall('/static/canvas/dist/assets/[^" ]+', html)
        self.assertTrue(len(assets) > 0)
        for asset in assets:
            resp = self.client.get(asset)
            self.assertEqual(resp.status_code, 200)

    def test_existing_data_unchanged(self):
        self.assertEqual(hash_json_tree(REAL_DATA), BASELINE)


class ProjectApiTest(unittest.TestCase):
    def setUp(self):
        self.client = app_module.app.test_client()

    def login(self, user_id):
        with self.client.session_transaction() as sess:
            sess['user_id'] = user_id

    def test_projects_crud_and_isolation(self):
        self.login('proj_alice')
        resp = self.client.post('/api/projects', json={'title': '项目A'})
        self.assertEqual(resp.status_code, 201)
        pid = resp.get_json()['project']['id']
        canvas_id = resp.get_json()['project']['canvas_id']
        self.assertTrue(canvas_id)

        self.assertEqual(self.client.get('/api/projects').get_json()['projects'][0]['id'], pid)
        self.assertEqual(self.client.get('/api/projects/' + pid).get_json()['project']['title'], '项目A')

        resp = self.client.put('/api/projects/' + pid, json={'title': '项目A改'})
        self.assertEqual(resp.status_code, 200)
        self.assertEqual(self.client.get('/api/projects/' + pid).get_json()['project']['title'], '项目A改')

        self.assertEqual(self.client.post('/api/projects/' + pid + '/open').status_code, 200)

        self.login('proj_bob')
        self.assertNotIn(pid, [p['id'] for p in self.client.get('/api/projects').get_json()['projects']])
        self.assertEqual(self.client.get('/api/projects/' + pid).status_code, 404)
        self.assertEqual(self.client.put('/api/projects/' + pid, json={'title': 'hack'}).status_code, 404)

    def test_project_rejects_sensitive_state(self):
        self.login('proj_alice2')
        resp = self.client.post('/api/projects', json={'title': 'P'})
        pid = resp.get_json()['project']['id']
        self.assertEqual(self.client.put('/api/projects/' + pid, json={'classic_state': {'api_key': 'x'}}).status_code, 400)

    def test_project_migration_idempotent(self):
        user = 'mig_user'
        self.login(user)
        cid = 'mig_canvas_1'
        app_module.save_json(app_module.canvases_path(user), {'version': 1, 'canvases': {cid: {'id': cid, 'title': '旧画布', 'created_at': '2026-01-01T00:00:00', 'updated_at': '2026-01-01T00:00:00', 'viewport': {'x': 0, 'y': 0, 'zoom': 1}, 'nodes': [], 'edges': []}}})
        first = self.client.get('/api/projects').get_json()['projects']
        second = self.client.get('/api/projects').get_json()['projects']
        migrated = [p for p in second if p['canvas_id'] == cid]
        self.assertEqual(len(migrated), 1)
        self.assertEqual(migrated[0]['title'], '旧画布')
        self.assertEqual(len(first), len(second))

    def test_project_soft_delete_restore_and_isolation(self):
        self.login('proj_del_alice')
        resp = self.client.post('/api/projects', json={'title': '可删项目', 'initial_mode': 'canvas'})
        self.assertEqual(resp.status_code, 201)
        pid = resp.get_json()['project']['id']
        cid = resp.get_json()['project']['canvas_id']

        canvas_before = app_module._canvas_load('proj_del_alice')['canvases'][cid]

        self.assertEqual(self.client.delete('/api/projects/' + pid).status_code, 200)
        self.assertNotIn(pid, [p['id'] for p in self.client.get('/api/projects').get_json()['projects']])
        self.assertIn(pid, [p['id'] for p in self.client.get('/api/projects?trash=1').get_json()['projects']])

        canvas_after = app_module._canvas_load('proj_del_alice')['canvases'][cid]
        self.assertEqual(canvas_before, canvas_after)

        self.assertEqual(self.client.post('/api/projects/' + pid + '/restore').status_code, 200)
        self.assertIn(pid, [p['id'] for p in self.client.get('/api/projects').get_json()['projects']])

        self.login('proj_del_bob')
        self.assertEqual(self.client.delete('/api/projects/' + pid).status_code, 404)
        self.assertEqual(self.client.post('/api/projects/' + pid + '/restore').status_code, 404)

    def test_history_is_scoped_to_workspace_project_and_keeps_legacy_records(self):
        user = 'project_history_user'
        self.login(user)
        app_module.save_json(app_module.history_path(user), [
            {'type': 'image', 'image_url': 'https://example.com/a.png', 'project_id': 'project-a'},
            {'type': 'video', 'video_url': 'https://example.com/b.mp4', 'project_id': 'project-b'},
            {'type': 'image', 'image_url': 'https://example.com/legacy.png'},
        ])

        project_a = self.client.get('/api/history', headers={'X-Project-ID': 'project-a'}).get_json()
        self.assertEqual([item.get('project_id') for item in project_a], ['project-a', None])

        project_b = self.client.get('/api/history', headers={
            'Referer': 'http://localhost/classic?embedded=1&project_id=project-b'
        }).get_json()
        self.assertEqual([item.get('project_id') for item in project_b], ['project-b', None])

        all_history = self.client.get('/api/history').get_json()
        self.assertEqual(len(all_history), 3)


class SkillAndImportTest(unittest.TestCase):
    def setUp(self):
        self.client = app_module.app.test_client()

    def login(self, user_id):
        with self.client.session_transaction() as sess:
            sess['user_id'] = user_id

    def test_skills_meta_sanitized(self):
        self.login('skill_user')
        resp = self.client.get('/api/skills')
        self.assertEqual(resp.status_code, 200)
        skills = resp.get_json()['skills']
        self.assertGreaterEqual(len(skills), 17)
        for skill in skills:
            self.assertNotIn('prompt_file', skill)
            self.assertNotIn('estimated_text_cost', skill)
            self.assertNotIn('api_key', skill)

    def test_import_export_roundtrip(self):
        self.login('import_alice')
        resp = self.client.post('/api/projects', json={'title': '源项目', 'initial_mode': 'canvas'})
        pid = resp.get_json()['project']['id']
        cid = resp.get_json()['project']['canvas_id']

        note = {'id': 'n1', 'type': 'note', 'position': {'x': 0, 'y': 0}, 'data': {'label': '便签', 'text': 'hi', 'color': '#5b8def'}}
        self.assertEqual(self.client.put('/api/canvas/' + cid, json={'title': '源项目', 'nodes': [note], 'edges': [], 'viewport': {'x': 0, 'y': 0, 'zoom': 0.85}}).status_code, 200)

        exported = self.client.get('/api/canvas/' + cid + '/export').get_json()
        self.assertEqual(exported['format'], 'manga-studio-canvas')
        self.assertEqual(exported['schema_version'], 1)

        projects_before = len(self.client.get('/api/projects').get_json()['projects'])
        canvases_before = len(app_module._canvas_load('import_alice')['canvases'])

        resp = self.client.post('/api/projects/import', json=exported)
        self.assertEqual(resp.status_code, 201)
        imp = resp.get_json()['project']
        self.assertEqual(imp['last_mode'], 'canvas')

        projects_after = len(self.client.get('/api/projects').get_json()['projects'])
        canvases_after = len(app_module._canvas_load('import_alice')['canvases'])
        self.assertEqual(projects_after, projects_before + 1)
        self.assertEqual(canvases_after, canvases_before + 1)

        imported_canvas = app_module._canvas_load('import_alice')['canvases'][imp['canvas_id']]
        self.assertEqual(len(imported_canvas['nodes']), 1)
        self.assertEqual(imported_canvas['nodes'][0]['type'], 'note')

    def test_import_rejects_invalid(self):
        self.login('import_alice2')
        bad_sensitive = {'format': 'manga-studio-canvas', 'schema_version': 1, 'nodes': [{'id': 'n1', 'type': 'note', 'position': {'x': 0, 'y': 0}, 'data': {'api_key': 'x'}}], 'edges': []}
        self.assertEqual(self.client.post('/api/projects/import', json=bad_sensitive).status_code, 400)
        bad_type = {'format': 'manga-studio-canvas', 'schema_version': 1, 'nodes': [{'id': 'n1', 'type': 'bogus', 'position': {'x': 0, 'y': 0}, 'data': {}}], 'edges': []}
        self.assertEqual(self.client.post('/api/projects/import', json=bad_type).status_code, 400)
        bad_format = {'format': 'other', 'schema_version': 1, 'nodes': [], 'edges': []}
        self.assertEqual(self.client.post('/api/projects/import', json=bad_format).status_code, 400)

    def test_export_isolation(self):
        self.login('import_a3')
        resp = self.client.post('/api/projects', json={'title': 'A'})
        cid = resp.get_json()['project']['canvas_id']
        self.login('import_b3')
        self.assertEqual(self.client.get('/api/canvas/' + cid + '/export').status_code, 404)



class AssetItemTest(unittest.TestCase):
    def setUp(self):
        self.client = app_module.app.test_client()

    def login(self, user_id):
        with self.client.session_transaction() as sess:
            sess['user_id'] = user_id

    def test_asset_item_crud_and_isolation(self):
        self.login('asset_crud_alice')
        resp = self.client.post('/api/assets/scenes/item', json={'name': '咖啡馆', 'url': 'https://example.com/cafe.jpg'})
        self.assertEqual(resp.status_code, 201)
        item_id = resp.get_json()['id']
        scenes = self.client.get('/api/assets/scenes').get_json()
        self.assertTrue(any(isinstance(s, dict) and s.get('id') == item_id for s in scenes))
        self.assertEqual(self.client.put('/api/assets/scenes/item/' + item_id, json={'name': '咖啡厅'}).status_code, 200)
        self.assertEqual(self.client.delete('/api/assets/scenes/item/' + item_id).status_code, 200)
        self.login('asset_crud_bob')
        self.assertEqual(self.client.delete('/api/assets/scenes/item/' + item_id).status_code, 404)

    def test_canvas_character_asset_endpoint_accepts_character_alias(self):
        self.login('asset_character_alias')
        resp = self.client.post('/api/assets/character/item', json={
            'name': '主角',
            'images': ['https://example.com/hero.png'],
        })
        self.assertEqual(resp.status_code, 201)
        item_id = resp.get_json()['id']
        characters = self.client.get('/api/characters').get_json()
        self.assertEqual(characters[item_id]['name'], '主角')
        self.assertEqual(characters[item_id]['images'], [{'url': 'https://example.com/hero.png'}])


class CanvasV2ApiTest(unittest.TestCase):
    def setUp(self):
        self.client = app_module.app.test_client()

    def login(self, user_id):
        with self.client.session_transaction() as sess:
            sess['user_id'] = user_id

    def grant_text_permission(self, user_id):
        users = app_module.load_json(app_module.users_path(), {})
        users.setdefault(user_id, {})['model_permissions'] = ['text']
        app_module.save_json(app_module.users_path(), users)

    def v2_node(self, nid='n1', ntype='aiTextNode', **data):
        return {'id': nid, 'type': ntype, 'position': {'x': 0, 'y': 0}, 'data': data or {}}

    def test_crud_roundtrip_isolation(self):
        self.login('v2_alice')
        resp = self.client.post('/api/canvas-v2', json={'title': 'V2', 'nodes': [self.v2_node('n1', 'aiTextNode', displayName='文本', prompt='你好')], 'edges': [], 'viewport': {'x': 1, 'y': 2, 'zoom': 0.9}})
        self.assertEqual(resp.status_code, 201)
        cid = resp.get_json()['canvas']['id']
        canvas = self.client.get('/api/canvas-v2/' + cid).get_json()['canvas']
        self.assertEqual(canvas['nodes'][0]['type'], 'aiTextNode')
        self.assertEqual(self.client.put('/api/canvas-v2/' + cid, json={'title': '改', 'nodes': [self.v2_node('n1', 'imageNode', prompt='p')], 'edges': []}).status_code, 200)
        self.assertEqual(self.client.delete('/api/canvas-v2/' + cid).status_code, 200)
        self.assertEqual(self.client.get('/api/canvas-v2/' + cid).status_code, 404)
        self.login('v2_bob')
        self.assertEqual(self.client.get('/api/canvas-v2/' + cid).status_code, 404)

    def test_v2_rejects_data_url_sensitive_and_dangling_edges(self):
        self.login('v2_safe')
        resp = self.client.post('/api/canvas-v2', json={'title': 't', 'nodes': [self.v2_node('n1', 'imageNode', imageUrl='data:image/png;base64,AAAA')], 'edges': []})
        self.assertEqual(resp.status_code, 400)
        resp = self.client.post('/api/canvas-v2', json={'title': 't', 'nodes': [self.v2_node('n1', 'imageNode', api_key='x')], 'edges': []})
        self.assertEqual(resp.status_code, 400)
        resp = self.client.post('/api/canvas-v2', json={'title': 't', 'nodes': [self.v2_node('n1')], 'edges': [{'id': 'e1', 'source': 'n1', 'target': 'nope'}]})
        self.assertEqual(resp.status_code, 400)
        resp = self.client.post('/api/canvas-v2', json={'title': 't', 'nodes': [self.v2_node('n1'), self.v2_node('n1')], 'edges': []})
        self.assertEqual(resp.status_code, 400)

    def test_project_v2_binding_get_or_create_and_legacy_read(self):
        self.login('v2_proj')
        resp = self.client.post('/api/projects', json={'title': '旧项目', 'initial_mode': 'classic'})
        pid = resp.get_json()['project']['id']
        cid = resp.get_json()['project']['canvas_id']
        # seed a legacy node for the one-time migration read
        legacy_data = app_module._canvas_load('v2_proj')
        legacy_data['canvases'][cid]['nodes'] = [{'id': 'n1', 'type': 'note', 'position': {'x': 0, 'y': 0}, 'data': {'label': '便签', 'text': 'hi', 'color': '#5b8def'}}]
        app_module._canvas_save('v2_proj', legacy_data)

        resp = self.client.get('/api/projects/' + pid + '/canvas-v2')
        self.assertEqual(resp.status_code, 201)
        j = resp.get_json()
        self.assertTrue(j['canvas']['id'])
        self.assertEqual(j['legacy_canvas']['nodes'][0]['type'], 'note')
        # second call is stable (idempotent)
        j2 = self.client.get('/api/projects/' + pid + '/canvas-v2').get_json()
        self.assertEqual(j2['canvas']['id'], j['canvas']['id'])
        # project now carries canvas_v2_id in list
        listed = self.client.get('/api/projects').get_json()['projects']
        proj = next(p for p in listed if p['id'] == pid)
        self.assertEqual(proj['canvas_v2_id'], j['canvas']['id'])
        # PUT binding validates ownership
        other = self.client.post('/api/canvas-v2', json={'title': 'other'}).get_json()['canvas']['id']
        self.login('v2_proj_bob')
        self.assertEqual(self.client.put('/api/projects/' + pid + '/canvas-v2', json={'canvas_v2_id': other}).status_code, 404)

    def test_skills_run_text_only_mocked(self):
        self.login('v2_skill')
        self.grant_text_permission('v2_skill')
        import unittest.mock as mock
        real = app_module.call_script_text_model
        app_module.call_script_text_model = mock.Mock(return_value='技能草稿文本')
        try:
            resp = self.client.post('/api/skills/seedance-prompt/run', json={'input': {'shot': '雨夜', 'requirement': '电影感'}})
            self.assertEqual(resp.status_code, 200)
            self.assertEqual(resp.get_json()['text'], '技能草稿文本')
            self.assertEqual(app_module.call_script_text_model.call_count, 1)
            self.assertEqual(self.client.post('/api/skills/nope/run', json={'input': {}}).status_code, 404)
            self.assertEqual(self.client.post('/api/skills/seedance-prompt/run', json={'input': 'not-a-dict'}).status_code, 400)
        finally:
            app_module.call_script_text_model = real

    def test_canvas_v2_uses_classic_text_model_catalog(self):
        self.login('v2_text_models')
        resp = self.client.get('/api/text-models')
        self.assertEqual(resp.status_code, 200)
        body = resp.get_json()
        self.assertEqual(body['models'], list(app_module.SCRIPT_MODELS))
        self.assertEqual(body['default'], app_module.SCRIPT_MODEL_DEFAULT)

    def test_canvas_v2_text_generation_uses_classic_provider_pipeline(self):
        self.login('v2_text_generate')
        self.grant_text_permission('v2_text_generate')
        import unittest.mock as mock
        with mock.patch.object(app_module, 'resolve_api', return_value={'provider': 'mock'}) as resolve_mock, \
             mock.patch.object(app_module, 'reserve_model_points', return_value=2) as reserve_mock, \
             mock.patch.object(app_module, 'call_script_text_model', return_value='平台文本结果') as call_mock:
            resp = self.client.post('/api/text/generate', json={
                'prompt': '写一个雨夜开场',
                'script_model': app_module.SCRIPT_MODEL_DEFAULT,
                'use_personal_api': False,
            })
        self.assertEqual(resp.status_code, 200)
        self.assertEqual(resp.get_json(), {'text': '平台文本结果', 'points': 2})
        self.assertEqual(resolve_mock.call_args.args[0], 'text')
        self.assertEqual(reserve_mock.call_args.args[:2], ('text', app_module.SCRIPT_MODEL_DEFAULT))
        self.assertEqual(call_mock.call_args.args[2], '写一个雨夜开场')

    def test_canvas_v2_text_generation_refunds_failed_platform_call(self):
        self.login('v2_text_refund')
        self.grant_text_permission('v2_text_refund')
        import unittest.mock as mock
        with mock.patch.object(app_module, 'resolve_api', return_value={'provider': 'mock'}), \
             mock.patch.object(app_module, 'reserve_model_points', return_value=3), \
             mock.patch.object(app_module, 'call_script_text_model', side_effect=RuntimeError('mock failure')), \
             mock.patch.object(app_module, 'refund_model_points') as refund_mock:
            resp = self.client.post('/api/text/generate', json={
                'prompt': '测试失败退款',
                'script_model': app_module.SCRIPT_MODEL_DEFAULT,
            })
        self.assertEqual(resp.status_code, 500)
        refund_mock.assert_called_once_with('v2_text_refund', 3)

    def test_asset_soft_delete_and_restore(self):
        self.login('v2_assets')
        resp = self.client.post('/api/assets/scenes/item', json={'name': '雨夜小巷', 'url': 'https://example.com/rain.jpg'})
        item_id = resp.get_json()['id']
        self.assertEqual(self.client.delete('/api/assets/scenes/item/' + item_id).status_code, 200)
        scenes = self.client.get('/api/assets/scenes').get_json()
        item = next(s for s in scenes if s.get('id') == item_id)
        self.assertTrue(item.get('deleted_at'))
        self.assertEqual(self.client.post('/api/assets/scenes/item/' + item_id + '/restore').status_code, 200)
        scenes = self.client.get('/api/assets/scenes').get_json()
        item = next(s for s in scenes if s.get('id') == item_id)
        self.assertIsNone(item.get('deleted_at'))


class NanoGptMidjourneyTest(unittest.TestCase):
    def test_legacy_midjourney_model_id_maps_to_current_nano_id(self):
        self.assertEqual(
            app_module.LEGACY_IMAGE_MODEL_ALIASES['midjourney'],
            'midjourney/text-to-image',
        )
        self.assertIn('midjourney/text-to-image', app_module.ALL_IMAGE_MODELS)
        self.assertNotIn('midjourney', app_module.ALL_IMAGE_MODELS)

    @mock.patch.object(app_module, 'download_and_save_image', return_value=('/stored/mj.png', 'mj.png'))
    @mock.patch.object(app_module.requests, 'post')
    def test_midjourney_uses_normalized_image_api(self, post_mock, download_mock):
        response = mock.Mock(status_code=200)
        response.json.return_value = {'data': [{'url': 'https://example.com/mj.png'}]}
        post_mock.return_value = response

        result = app_module.nano_image_generate(
            '电影感海边日落',
            app_module.NANO_GPT_MIDJOURNEY_MODEL_ID,
            '16:9',
            api_key='test-key',
            input_images=[],
        )

        self.assertEqual(result, ('/stored/mj.png', 'mj.png'))
        request = post_mock.call_args
        self.assertEqual(request.args[0], 'https://nano-gpt.com/api/v1/images')
        self.assertEqual(request.kwargs['json']['model'], 'midjourney/text-to-image')
        self.assertEqual(request.kwargs['json']['resolution'], '16:9')
        self.assertEqual(request.kwargs['json']['aspect_ratio'], '16:9')
        self.assertEqual(request.kwargs['json']['version'], '8.2')
        self.assertEqual(request.kwargs['json']['n'], 4)
        self.assertNotIn('size', request.kwargs['json'])
        download_mock.assert_called_once_with('https://example.com/mj.png')

    @mock.patch.object(app_module.requests, 'post')
    def test_midjourney_rejects_reference_images_before_paid_request(self, post_mock):
        with self.assertRaisesRegex(Exception, '仅支持文生图'):
            app_module.nano_image_generate(
                '角色设定',
                app_module.NANO_GPT_MIDJOURNEY_MODEL_ID,
                '1:1',
                api_key='test-key',
                input_images=[{'url': 'https://example.com/reference.png'}],
            )
        post_mock.assert_not_called()


class VolcSeedream5ProTest(unittest.TestCase):
    def test_seedream_5_pro_is_a_builtin_ark_image_model(self):
        model_id = 'doubao-seedream-5-0-pro-260628'
        self.assertEqual(app_module.VOLC_IMAGE_MODELS[model_id], model_id)
        self.assertIn(model_id, app_module.ALL_IMAGE_MODELS)

    @mock.patch.object(app_module, 'download_and_save_image', return_value=('/stored/seedream5.jpg', 'seedream5.jpg'))
    @mock.patch.object(app_module, 'Ark')
    def test_seedream_5_pro_uses_ark_image_api_with_legal_size(self, ark_mock, download_mock):
        response = mock.Mock()
        response.data = [mock.Mock(url='https://example.com/seedream5.jpg')]
        ark_mock.return_value.images.generate.return_value = response

        result = app_module.volc_image_generate(
            '电影角色设定',
            [],
            'https://studio.example.com',
            '2:3',
            api_key='test-key',
            model_id=app_module.VOLC_SEEDREAM_5_PRO_MODEL_ID,
        )

        self.assertEqual(result, ('/stored/seedream5.jpg', 'seedream5.jpg'))
        ark_mock.assert_called_once_with(api_key='test-key')
        ark_mock.return_value.images.generate.assert_called_once_with(
            model='doubao-seedream-5-0-pro-260628',
            prompt='电影角色设定',
            size='1664x2496',
            watermark=False,
        )
        download_mock.assert_called_once_with('https://example.com/seedream5.jpg')


if __name__ == '__main__':
    unittest.main()
