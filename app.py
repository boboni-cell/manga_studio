import os, json, uuid, time, threading, requests, functools
import tos
from datetime import datetime
from flask import Flask, request, jsonify, send_from_directory, redirect, session
from werkzeug.utils import secure_filename
from volcenginesdkarkruntime import Ark

BASE = os.path.dirname(os.path.abspath(__file__))

def load_env_file(path):
    if not os.path.exists(path):
        return
    with open(path, 'r', encoding='utf-8') as f:
        for line in f:
            line = line.strip()
            if not line or line.startswith('#') or '=' not in line:
                continue
            key, value = line.split('=', 1)
            os.environ.setdefault(key.strip(), value.strip().strip('"').strip("'"))

load_env_file(os.path.join(BASE, '.env'))

app = Flask(__name__, static_folder='static', static_url_path='/static')
app.secret_key = os.environ.get('APP_SECRET_KEY', os.urandom(24).hex())

# ── Upload size limit (default 512MB) ────────────────────────
MAX_UPLOAD_MB = int(os.environ.get('MAX_UPLOAD_MB', '512'))
app.config['MAX_CONTENT_LENGTH'] = MAX_UPLOAD_MB * 1024 * 1024

UPLOAD   = os.path.join(BASE, 'static', 'uploads')
DATA     = os.path.join(BASE, 'data')
os.makedirs(UPLOAD, exist_ok=True)
os.makedirs(DATA,   exist_ok=True)

# ── Secrets (all from environment, no hardcoded fallbacks) ───
def _require_env(key):
    val = os.environ.get(key, '')
    if not val:
        raise RuntimeError(f'缺少环境变量 {key}，请参考 .env.example 配置')
    return val

ARK_API_KEY = os.environ.get('ARK_API_KEY', '')
TOS_AK     = os.environ.get('TOS_AK', '')
TOS_SK     = os.environ.get('TOS_SK', '')
NANO_GPT_API_KEY = os.environ.get('NANO_GPT_API_KEY', '')

# TOS config (non-secret)
TOS_ENDPOINT = "tos-cn-beijing.volces.com"
TOS_REGION   = "cn-beijing"
TOS_BUCKET   = "movie1"
TOS_PUBLIC_BASE = f"https://{TOS_BUCKET}.{TOS_ENDPOINT}"
MODEL_ID = "doubao-seedance-2-0-fast-260128"
TEXT_MODEL_ID = "doubao-seed-character-251128"

# Script text models (for brainstorm + split)
SCRIPT_MODELS = {
    "doubao": {"label": "豆包", "provider": "volcengine", "model_id": "doubao-seed-character-251128"},
    "glm46": {"label": "GPT-4.1 Mini", "provider": "nano", "model_id": "openai/gpt-4.1-mini"},
    "claude46": {"label": "Claude4.6", "provider": "nano", "model_id": "anthropic/claude-opus-4.6"}
}
SCRIPT_MODEL_DEFAULT = "doubao"

# Nano-GPT adapter
NANO_GPT_BASE = "https://nano-gpt.com/api/v1"
NANO_GPT_MODELS = {
    "kling-v30-pro": "kling-v30-pro",
    "grok-imagine-video": "grok-imagine-video-reference-to-video",
    "vidu-q3": "vidu-q3",
    "seedance-v15-pro": "bytedance-seedance-v1.5-pro",
}
NANO_GPT_NAMES = set(NANO_GPT_MODELS.keys())

# Third-party generic adapter
THIRD_PARTY_API_BASE = os.environ.get("THIRD_PARTY_API_BASE", "")
THIRD_PARTY_API_KEY = os.environ.get("THIRD_PARTY_API_KEY", "")
THIRD_PARTY_MODEL_ID = "third-party"

ALL_MODELS = ["seedance"] + sorted(NANO_GPT_NAMES) + ([THIRD_PARTY_MODEL_ID] if THIRD_PARTY_API_KEY or THIRD_PARTY_API_BASE else [])

# Model capabilities
MODEL_CAPS = {
    "seedance": {"supports_first_frame": True, "supports_last_frame": True, "supports_reference_images": True, "resolutions": ["480p","720p"]},
    "kling-v30-pro": {"supports_first_frame": True, "supports_last_frame": True, "supports_reference_images": True, "resolutions": ["480p","720p","1080p"]},
    "grok-imagine-video": {"supports_first_frame": False, "supports_last_frame": False, "supports_reference_images": True, "resolutions": ["480p","720p","1080p"]},
    "vidu-q3": {"supports_first_frame": True, "supports_last_frame": False, "supports_reference_images": True, "resolutions": ["480p","720p","1080p"]},
    "seedance-v15-pro": {"supports_first_frame": True, "supports_last_frame": True, "supports_reference_images": True, "resolutions": ["480p","720p"]},
    THIRD_PARTY_MODEL_ID: {"supports_first_frame": False, "supports_last_frame": False, "supports_reference_images": True, "resolutions": ["480p","720p","1080p"]},
}

# Image generation configs
NANO_GPT_IMAGE_MODELS = {"gpt-image-2", "nano-banana-2", "midjourney"}
VOLC_IMAGE_MODEL_ID = "doubao-seedream-4-5-251128"
ALL_IMAGE_MODELS = sorted(NANO_GPT_IMAGE_MODELS) + ["volc-seedream-4-5"]
IMAGE_RATIOS = ["1:1", "2:3", "3:2", "3:4", "4:3", "9:16", "16:9", "4:5", "5:4", "custom"]
# Ratio → pixel size for Nano models (moderate sizes)
RATIO_TO_SIZE_NANO = {
    "1:1": "1024x1024", "2:3": "1024x1536", "3:2": "1536x1024",
    "3:4": "1536x2048", "4:3": "2048x1536",
    "9:16": "768x1344", "16:9": "1344x768",
    "4:5": "1536x1920", "5:4": "1920x1536"
}
# Ratio → pixel size for Seedream (requires ≥3.6M pixels)
RATIO_TO_SIZE_VOLC = {
    "1:1": "1920x1920", "2:3": "2048x3072", "3:2": "3072x2048",
    "3:4": "1728x2304", "4:3": "2304x1728",
    "9:16": "1440x2560", "16:9": "2560x1440",
    "4:5": "1728x2160", "5:4": "2160x1728"
}
DEFAULT_RATIO = "1:1"

QUALITY_PROMPT = """【画面质量强制要求】
1. 人体结构：四肢、手指、面部必须保持真实比例，严禁肢体扭曲、穿模变形。
2. 服装：衣物完整贴合身体，严禁穿透或消失。
3. 声音：包含符合场景的环境音，严禁无声输出。
4. 画幅：严格9:16竖屏，人物主体居中，不得裁切头部或脚部。
5. 连贯性：画面流畅，严禁跳帧闪烁。
6. 人物一致性：全程保持参考图脸部特征、发型、肤色不变。
7. 肤色：严格还原参考图正常肤色，严禁绿色、灰色等异常颜色叠加。
"""

JOBS = {}

def load_json(path, default):
    try:
        with open(path, 'r', encoding='utf-8') as f: return json.load(f)
    except: return default

def save_json(path, data):
    os.makedirs(os.path.dirname(path), exist_ok=True)
    with open(path, 'w', encoding='utf-8') as f:
        json.dump(data, f, ensure_ascii=False, indent=2)

def characters_path(): return os.path.join(DATA, 'characters.json')
def assets_path(cat):  return os.path.join(DATA, f'{cat}.json')
def history_path():    return os.path.join(DATA, 'history.json')
def styles_path():     return os.path.join(DATA, 'styles.json')

# Ensure data directory and files exist (for fresh Volume mounts)
def init_data():
    os.makedirs(DATA, exist_ok=True)
    for path, default in [
        (characters_path(), {}),
        (history_path(), []),
        (styles_path(), []),
        (assets_path('outfits'), []),
        (assets_path('scenes'), []),
        (assets_path('audios'), []),
    ]:
        if not os.path.exists(path):
            save_json(path, default)

init_data()

# ── TOS upload helper ─────────────────────────────────────────
def get_tos_client():
    return tos.TosClientV2(TOS_AK, TOS_SK, TOS_ENDPOINT, TOS_REGION)

def upload_to_tos(file_data, object_key, content_type='application/octet-stream', content_length=None):
    """Upload bytes or stream to TOS, return (public_url, success)."""
    try:
        client = get_tos_client()
        if hasattr(file_data, 'read'):
            # Stream: use put_object with streaming body
            client.put_object(TOS_BUCKET, object_key,
                              content=file_data,
                              content_type=content_type,
                              content_length=content_length)
        else:
            client.put_object(TOS_BUCKET, object_key,
                              content=file_data,
                              content_type=content_type)
        return f"{TOS_PUBLIC_BASE}/{object_key}", True
    except Exception as e:
        print(f'[TOS] upload failed: {e}')
        return None, False


# ── Login middleware ──────────────────────────────────────────
LOGIN_PASSWORD = os.environ.get('LOGIN_PASSWORD', '')
LOGIN_REQUIRED = bool(LOGIN_PASSWORD)

def login_required(f):
    """Simple password gate. If LOGIN_PASSWORD not set, skip auth."""
    if not LOGIN_REQUIRED:
        return f
    @functools.wraps(f)
    def wrap(*a, **kw):
        pwd = request.args.get('p', '')
        if pwd == LOGIN_PASSWORD:
            session['_auth'] = True
        if session.get('_auth'):
            return f(*a, **kw)
        return jsonify(error='unauthorized'), 401
    return wrap
# ── static pages ──────────────────────────────────────────────
@app.route('/')
def index():
    pwd = request.args.get('p', '')
    if pwd:
        if LOGIN_REQUIRED and pwd == LOGIN_PASSWORD:
            session['_auth'] = True
        elif LOGIN_REQUIRED:
            return '<h2 style="text-align:center;margin-top:100px;">密码错误</h2>', 403
    if LOGIN_REQUIRED and not session.get('_auth'):
        return '<h2 style="text-align:center;margin-top:100px;">请输入密码</h2><form style="text-align:center;margin-top:20px;" method="get"><input name="p" type="password" placeholder="密码" autofocus style="padding:8px;font-size:14px;"><button style="padding:8px 16px;">登录</button></form>', 401
    return send_from_directory('static', 'index.html')

# ── uploads ───────────────────────────────────────────────────
@app.route('/api/tos-presign', methods=['POST'])
@login_required
def tos_presign():
    body = request.json or {}
    filename = secure_filename(body.get('filename') or 'upload')
    content_type = body.get('content_type') or 'application/octet-stream'
    ext = os.path.splitext(filename)[1].lower()
    date_prefix = datetime.now().strftime('%Y%m%d')
    object_key = f"uploads/{date_prefix}/{uuid.uuid4().hex}{ext}"
    try:
        client = get_tos_client()
        from tos.enum import HttpMethodType
        signed = client.pre_signed_url(
            HttpMethodType.Http_Method_Put,
            TOS_BUCKET,
            object_key,
            expires=3600,
            header={'Content-Type': content_type}
        )
        upload_url = getattr(signed, 'signed_url', None) or getattr(signed, 'url', None) or str(signed)
        return jsonify({
            'upload_url': upload_url,
            'public_url': f"{TOS_PUBLIC_BASE}/{object_key}",
            'object_key': object_key
        })
    except Exception as e:
        print(f'[TOS] presign failed: {e}')
        return jsonify(error=str(e)), 500

@app.route('/api/upload', methods=['POST'])
@login_required
def upload():
    f = request.files.get('file')
    if not f: return jsonify(error='no file'), 400
    ext  = os.path.splitext(secure_filename(f.filename))[1].lower()
    name = uuid.uuid4().hex + ext
    ct = f.content_type or 'application/octet-stream'
    file_bytes = f.read()

    # Upload to TOS
    public_url, ok = upload_to_tos(file_bytes, name, ct)
    if ok:
        return jsonify(url=public_url, name=name, storage='tos')

    # Fallback to local
    path = os.path.join(UPLOAD, name)
    with open(path, 'wb') as fw:
        fw.write(file_bytes)
    return jsonify(url=f'/static/uploads/{name}', name=name, storage='local')

# ── characters ────────────────────────────────────────────────
@app.route('/api/characters', methods=['GET'])
@login_required
def get_chars():
    return jsonify(load_json(characters_path(), {}))

@app.route('/api/characters', methods=['POST'])
@login_required
def save_chars():
    data = request.json
    save_json(characters_path(), data)
    return jsonify(ok=True)

# ── asset libraries (outfits / scenes / audios) ───────────────
@app.route('/api/assets/<cat>', methods=['GET'])
@login_required
def get_assets(cat):
    return jsonify(load_json(assets_path(cat), []))

@app.route('/api/assets/<cat>', methods=['POST'])
@login_required
def save_assets_api(cat):
    data = request.json
    save_json(assets_path(cat), data)
    return jsonify(ok=True)

# ── history ───────────────────────────────────────────────────
@app.route('/api/history', methods=['GET'])
@login_required
def get_history():
    return jsonify(load_json(history_path(), []))

# ── models ────────────────────────────────────────────────────
@app.route('/api/models', methods=['GET'])
@login_required
def get_models():
    has_nano = bool(NANO_GPT_API_KEY)
    has_third = bool(THIRD_PARTY_API_KEY and THIRD_PARTY_API_BASE)
    return jsonify({
        'models': ALL_MODELS,
        'nano_available': has_nano,
        'third_party_available': has_third,
        'default': 'seedance',
        'caps': MODEL_CAPS
    })

@app.route('/api/image-models', methods=['GET'])
@login_required
def get_image_models():
    return jsonify({
        'models': ALL_IMAGE_MODELS,
        'ratios': IMAGE_RATIOS,
        'default_model': 'gpt-image-2',
        'default_ratio': DEFAULT_RATIO
    })

# ── prompt refinement ──────────────────────────────────────────
def refine_prompt(script, images, ratio, duration):
    """Use text model to optimize the user's script into a video-ready Chinese prompt."""
    role_desc = '、'.join([img.get('role_label', '参考图') for img in images]) if images else '无参考图'

    system_prompt = (
        '你是一个专业的漫剧分镜优化师。用户会提供一段分镜描述和参考素材信息，'
        '你需要将其优化为适合 AI 视频生成模型理解的中文 prompt。\n'
        '优化规则：\n'
        '1. 描述要具体、视觉化，包含画面构图、人物动作、镜头运动、光线氛围\n'
        '2. 必须提及画幅比例和时长信息\n'
        '3. 明确区分各参考图的用途（人物/服装/场景），不得混用\n'
        '4. 保留用户原始描述的意图和内容，只做结构化和润色\n'
        '5. 输出纯中文，不要英文，不要 markdown，不超过 500 字'
    )

    user_prompt = (
        f'画面比例：{ratio}\n'
        f'视频时长：{duration} 秒\n'
        f'参考素材：{role_desc}\n'
        f'用户分镜描述：\n{script}\n\n'
        f'请输出优化后的分镜 prompt：'
    )

    try:
        client = Ark(api_key=ARK_API_KEY)
        resp = client.chat.completions.create(
            model=TEXT_MODEL_ID,
            messages=[
                {'role': 'system', 'content': system_prompt},
                {'role': 'user', 'content': user_prompt}
            ],
            temperature=0.7,
            max_tokens=1000
        )
        refined = resp.choices[0].message.content.strip()
        if refined:
            return refined
    except Exception as e:
        print(f'[refine_prompt] 优化失败，使用原始脚本: {e}')
    return script  # fallback to original


# ── Nano-GPT video generation adapter ─────────────────────────
def nano_gpt_generate(job_id, model_key, script, images, audio_url, video_url, ratio, duration, host_url, resolution='720p'):
    """Generate video via Nano-GPT API. Runs in a background thread."""
    try:
        if not NANO_GPT_API_KEY:
            JOBS[job_id] = {'status': 'failed', 'video_url': None, 'error': 'NANO_GPT_API_KEY 未设置，请配置环境变量'}
            return

        model_real = NANO_GPT_MODELS[model_key]
        headers = {
            'x-api-key': NANO_GPT_API_KEY,
            'Content-Type': 'application/json'
        }

        payload = {
            'model': model_real,
            'prompt': script,
            'aspect_ratio': ratio,
            'duration': str(duration),
            'resolution': resolution,
            'showExplicitContent': True,
            'wan27_has_video_input': bool(video_url),
            'wan27_has_reference_images': len(images) > 0,
            'voice': 'af_bella',
            'generateAudio': True,
            'camera_fixed': False,
        }

        JOBS[job_id]['status'] = 'running'

        # Submit generation task
        r = requests.post('https://nano-gpt.com/api/generate-video', headers=headers, json=payload, timeout=30)
        if r.status_code != 200:
            JOBS[job_id] = {'status': 'failed', 'video_url': None, 'error': f'Nano-GPT 提交失败: {r.status_code} {r.text[:200]}'}
            return

        data = r.json()
        task_id = data.get('task_id') or data.get('id')
        if not task_id:
            # Maybe returned video directly
            vurl = data.get('video_url') or data.get('url') or data.get('output', {}).get('video_url')
            if vurl:
                JOBS[job_id] = {'status': 'succeeded', 'video_url': vurl, 'error': None}
            else:
                JOBS[job_id] = {'status': 'failed', 'video_url': None, 'error': f'Nano-GPT 返回无 task_id: {data}'}
            return

        # Poll for completion
        while True:
            pr = requests.get(f'{NANO_GPT_BASE}/video/status/{task_id}', headers=headers, timeout=30)
            if pr.status_code != 200:
                JOBS[job_id] = {'status': 'failed', 'video_url': None, 'error': f'Nano-GPT 查询失败: {pr.status_code}'}
                return

            pd = pr.json()
            status = pd.get('status', '')
            if status in ('completed', 'succeeded', 'done'):
                vurl = pd.get('video_url') or pd.get('url') or pd.get('output', {}).get('video_url')
                if not vurl:
                    JOBS[job_id] = {'status': 'failed', 'video_url': None, 'error': 'Nano-GPT 完成但无 video_url'}
                    return
                JOBS[job_id] = {'status': 'succeeded', 'video_url': vurl, 'error': None}
                return
            elif status in ('failed', 'error', 'cancelled'):
                err = pd.get('error') or pd.get('message', '未知错误')
                JOBS[job_id] = {'status': 'failed', 'video_url': None, 'error': f'Nano-GPT 生成失败: {err}'}
                return
            else:
                time.sleep(10)

    except Exception as e:
        JOBS[job_id] = {'status': 'failed', 'video_url': None, 'error': f'Nano-GPT 异常: {str(e)}'}


# ── Third-party generic video adapter ─────────────────────────
def third_party_video_adapter(job_id, script, images, audio_url, video_url, ratio, duration, host_url):
    """Generic adapter for any third-party video generation API.
    Reads api_base and api_key from env vars. Sends prompt + refs, polls for result."""
    try:
        api_base = THIRD_PARTY_API_BASE
        api_key  = THIRD_PARTY_API_KEY
        if not api_base:
            JOBS[job_id] = {'status': 'failed', 'video_url': None, 'error': 'THIRD_PARTY_API_BASE 未设置'}
            return
        if not api_key:
            JOBS[job_id] = {'status': 'failed', 'video_url': None, 'error': 'THIRD_PARTY_API_KEY 未设置'}
            return

        headers = {
            'Authorization': f'Bearer {api_key}',
            'Content-Type': 'application/json'
        }

        # Build reference images
        ref_images = []
        for img in images:
            url = img['url']
            if url.startswith('/static/'):
                url = host_url + url
            ref_images.append({'url': url, 'label': img.get('role_label', 'reference')})

        payload = {
            'prompt': script,
            'aspect_ratio': ratio,
            'duration': duration,
            'reference_images': ref_images,
        }
        if audio_url:
            final_audio = host_url + audio_url if audio_url.startswith('/static/') else audio_url
            payload['reference_audio'] = final_audio
        if video_url:
            payload['reference_video'] = video_url

        JOBS[job_id]['status'] = 'running'

        # Submit
        r = requests.post(f'{api_base}/video/generate', headers=headers, json=payload, timeout=30)
        if r.status_code != 200 and r.status_code != 201:
            JOBS[job_id] = {'status': 'failed', 'video_url': None, 'error': f'第三方提交失败: {r.status_code} {r.text[:200]}'}
            return

        data = r.json()
        task_id = data.get('task_id') or data.get('id') or data.get('job_id')
        if not task_id:
            JOBS[job_id] = {'status': 'failed', 'video_url': None, 'error': f'第三方返回无 task_id: {data}'}
            return

        # Poll
        while True:
            pr = requests.get(f'{api_base}/video/status/{task_id}', headers=headers, timeout=30)
            if pr.status_code != 200:
                JOBS[job_id] = {'status': 'failed', 'video_url': None, 'error': f'第三方查询失败: {pr.status_code}'}
                return

            pd = pr.json()
            status = pd.get('status', '')
            if status in ('completed', 'succeeded', 'done'):
                vurl = pd.get('video_url') or pd.get('output', {}).get('video_url') or pd.get('result', {}).get('video_url')
                if not vurl:
                    JOBS[job_id] = {'status': 'failed', 'video_url': None, 'error': '第三方完成但无 video_url'}
                    return
                JOBS[job_id] = {'status': 'succeeded', 'video_url': vurl, 'error': None}
                return
            elif status in ('failed', 'error', 'cancelled'):
                err = pd.get('error') or pd.get('message', '未知错误')
                JOBS[job_id] = {'status': 'failed', 'video_url': None, 'error': f'第三方生成失败: {err}'}
                return
            else:
                time.sleep(10)

    except Exception as e:
        JOBS[job_id] = {'status': 'failed', 'video_url': None, 'error': f'第三方异常: {str(e)}'}


# ── Image generation helpers ──────────────────────────────────
def download_and_save_image(image_url):
    """Download image from URL, upload to TOS, fallback to local."""
    r = requests.get(image_url, timeout=120)
    if r.status_code != 200:
        raise Exception(f'下载图片失败: {r.status_code}')
    ct = r.headers.get('Content-Type', 'image/png')
    ext = '.png'
    if 'jpeg' in ct or 'jpg' in ct:
        ext = '.jpg'
    elif 'webp' in ct:
        ext = '.webp'
    name = uuid.uuid4().hex + ext
    img_bytes = r.content

    # Try TOS
    public_url, ok = upload_to_tos(img_bytes, name, ct)
    if ok:
        return public_url, name

    # Fallback to local
    path = os.path.join(UPLOAD, name)
    with open(path, 'wb') as f:
        f.write(img_bytes)
    return f'/static/uploads/{name}', name


def build_image_content(prompt, input_images, host_url):
    """Build Ark image generation content list."""
    content = [{'type': 'text', 'text': prompt}]
    for img in (input_images or []):
        url = img['url']
        if url.startswith('/static/'):
            url = host_url + url
        content.append({'type': 'image_url', 'image_url': {'url': url}})
    return content


# ── Nano image generation ─────────────────────────────────────
def nano_image_generate(prompt, model_id, ratio, custom_size=''):
    """Call Nano-GPT images/generations API."""
    if ratio == 'custom' and custom_size:
        size = custom_size
    else:
        size = RATIO_TO_SIZE_NANO.get(ratio, "1024x1024")
    headers = {
        'Content-Type': 'application/json',
        'x-api-key': NANO_GPT_API_KEY
    }
    payload = {'model': model_id, 'prompt': prompt, 'size': size}
    r = requests.post(f'{NANO_GPT_BASE}/images/generations', headers=headers, json=payload, timeout=120)
    if r.status_code not in (200, 201):
        raise Exception(f'Nano 图片生成失败: {r.status_code} {r.text[:200]}')
    data = r.json()
    # Handle url or base64 response
    items = data.get('data', [])
    if isinstance(items, list) and len(items) > 0:
        item = items[0]
        if item.get('url'):
            return download_and_save_image(item['url'])
        if item.get('b64_json'):
            import base64
            img_bytes = base64.b64decode(item['b64_json'])
            name = uuid.uuid4().hex + '.png'
            public_url, ok = upload_to_tos(img_bytes, name, 'image/png')
            if ok:
                return public_url, name
            path = os.path.join(UPLOAD, name)
            with open(path, 'wb') as f:
                f.write(img_bytes)
            return f'/static/uploads/{name}', name
    raise Exception(f'Nano 返回无图片: {str(data)[:200]}')


# ── Volc Seedream image generation ────────────────────────────
def volc_image_generate(prompt, input_images, host_url, ratio, custom_size=''):
    """Call Volc Ark Seedream for image generation."""
    if ratio == 'custom' and custom_size:
        size = custom_size
    else:
        size = RATIO_TO_SIZE_VOLC.get(ratio, "1920x1920")
    client = Ark(api_key=ARK_API_KEY)
    ref_url = None
    for img in (input_images or []):
        url = img['url']
        if url.startswith('/static/'):
            url = host_url + url
        ref_url = url
        break
    kwargs = {'model': VOLC_IMAGE_MODEL_ID, 'prompt': prompt, 'size': size, 'watermark': False}
    if ref_url:
        kwargs['image'] = ref_url
    resp = client.images.generate(**kwargs)
    img_url = None
    if hasattr(resp, 'data') and resp.data:
        img_url = resp.data[0].url
    if not img_url:
        raise Exception('Seedream 返回无图片 URL')
    return download_and_save_image(img_url)


# ── Generate image endpoint ───────────────────────────────────
@app.route('/api/generate-image', methods=['POST'])
@login_required
def generate_image():
    body = request.json
    prompt = body.get('prompt', '').strip()
    image_model = body.get('image_model', 'gpt-image-2')
    ratio = body.get('ratio', DEFAULT_RATIO)
    custom_size = body.get('custom_size', '')
    mode = body.get('mode', 'storyboard')
    input_images = body.get('input_images') or []
    style_id = body.get('style_id')
    host_url = request.host_url.rstrip('/')

    if not prompt:
        return jsonify(error='prompt 不能为空'), 400

    # Inject style
    if style_id:
        styles = load_json(styles_path(), [])
        style = next((s for s in styles if s.get('id') == style_id), None)
        if style:
            prompt = style.get('prompt', '') + '\n' + prompt
            if style.get('negative_prompt'):
                prompt += '\n\n避免：' + style.get('negative_prompt', '')
            if style.get('thumbnail_url'):
                input_images.append({'url': style['thumbnail_url'], 'role_label': '风格参考'})

    job_id = uuid.uuid4().hex
    JOBS[job_id] = {'status': 'pending', 'url': None, 'name': None, 'error': None,
                     'model': image_model, 'ratio': ratio, 'mode': mode}

    def run():
        try:
            if image_model in NANO_GPT_IMAGE_MODELS:
                local_url, filename = nano_image_generate(prompt, image_model, ratio, custom_size)
            elif image_model == 'volc-seedream-4-5':
                local_url, filename = volc_image_generate(prompt, input_images, host_url, ratio, custom_size)
            else:
                JOBS[job_id] = {'status': 'failed', 'url': None, 'error': f'不支持的图片模型: {image_model}'}
                return

            # save history
            hist = load_json(history_path(), [])
            hist.insert(0, {
                'time': datetime.now().strftime('%Y-%m-%d %H:%M'),
                'type': 'image',
                'image_url': local_url,
                'script': prompt[:80],
                'original_script': prompt,
                'model': image_model,
                'ratio': ratio
            })
            save_json(history_path(), hist[:50])
            JOBS[job_id] = {'status': 'succeeded', 'url': local_url, 'name': filename,
                             'model': image_model, 'ratio': ratio, 'mode': mode}
        except Exception as e:
            JOBS[job_id] = {'status': 'failed', 'url': None, 'error': str(e)}

    threading.Thread(target=run, daemon=True).start()
    return jsonify(job_id=job_id)


# ── Image job status (polling) ────────────────────────────────
@app.route('/api/image-status/<job_id>', methods=['GET'])
@login_required
def image_status(job_id):
    return jsonify(JOBS.get(job_id, {'status': 'not_found'}))


# ── generate ──────────────────────────────────────────────────
@app.route('/api/generate', methods=['POST'])
@login_required
def generate():
    body      = request.json
    script    = body.get('script', '')
    images    = body.get('images', [])   # [{url, role_label}]
    audio_url = body.get('audio_url')
    video_url = body.get('video_url')
    first_frame_url = body.get('first_frame_url')
    last_frame_url  = body.get('last_frame_url')
    storyboard_ref_url = body.get('storyboard_ref_url')
    style_id   = body.get('style_id')

    ratio       = body.get('ratio', '9:16')
    duration    = int(body.get('duration', 5))
    resolution  = body.get('resolution', '720p')
    optimize    = body.get('optimize_prompt', True)
    video_model = body.get('video_model', 'seedance')
    host_url    = request.host_url.rstrip('/')
    job_id      = uuid.uuid4().hex
    JOBS[job_id] = {'status': 'pending', 'video_url': None, 'error': None}

    # Inject style
    if style_id:
        styles = load_json(styles_path(), [])
        style = next((s for s in styles if s.get('id') == style_id), None)
        if style:
            # add thumbnail as reference
            if style.get('thumbnail_url'):
                images.append({'url': style['thumbnail_url'], 'role_label': '风格参考'})
            # prepend style prompt to script
            if style.get('prompt'):
                script = style.get('prompt', '') + '\n' + script
            # append negative prompt to quality constraints
            if style.get('negative_prompt'):
                script += '\n【风格约束】避免：' + style.get('negative_prompt', '')
            # add style reference instruction
            style_instruction = '\n【风格参考】已提供风格参考图，该图仅用于约束画面风格、色彩倾向、光影质感、材质表现和视觉语言。不要把风格参考当作角色身份、服装设计或具体场景结构。角色以角色参考为准，场景以场景参考为准。'
            script = script.rstrip() + style_instruction + '\n'

    original_script = script
    if optimize and script.strip():
        script = refine_prompt(script, images, ratio, duration)

    # ── Nano-GPT path ──
    if video_model in NANO_GPT_NAMES:
        if not NANO_GPT_API_KEY:
            JOBS[job_id] = {'status': 'failed', 'video_url': None,
                            'error': 'NANO_GPT_API_KEY 未设置。请 export NANO_GPT_API_KEY=sk-nano-xxx 后重启服务'}
            return jsonify(job_id=job_id)
        threading.Thread(target=nano_gpt_generate, args=(
            job_id, video_model, script, images, audio_url, video_url, ratio, duration, host_url, resolution
        ), daemon=True).start()
        return jsonify(job_id=job_id)

    # ── Third-party path ──
    if video_model == THIRD_PARTY_MODEL_ID:
        if not THIRD_PARTY_API_KEY or not THIRD_PARTY_API_BASE:
            JOBS[job_id] = {'status': 'failed', 'video_url': None,
                            'error': '第三方模型未配置。请设置 THIRD_PARTY_API_BASE 和 THIRD_PARTY_API_KEY 环境变量后重启服务'}
            return jsonify(job_id=job_id)
        threading.Thread(target=third_party_video_adapter, args=(
            job_id, script, images, audio_url, video_url, ratio, duration, host_url
        ), daemon=True).start()
        return jsonify(job_id=job_id)

    # ── Ark Seedance path (default) ──
    def run():
        try:
            # build role description
            lines = ['【严格参考说明，必须遵守】']
            for i, img in enumerate(images, 1):
                lines.append(f'- 图{i+1}：{img["role_label"]}，仅参考此用途，不得混用')
            lines.append('请严格区分各参考图用途，不得将穿搭图用于脸部，不得将场景图用于人物。')
            # Storyboard reference instructions
            if storyboard_ref_url:
                lines.append('\n【分镜参考使用规则】')
                lines.append('已提供一张分镜构图参考图。该图只用于指导镜头设计，不用于角色身份识别。')
                lines.append('必须严格参考：镜头景别、机位角度、人物站位、动作关系、构图重心、场景空间关系、前景/中景/背景层次、光线氛围、运镜方向和镜头节奏。')
                lines.append('必须忽略：分镜参考图中的具体脸部细节、五官长相、人物身份、可能出现的文字标记、不准确的服装细节。')
                lines.append('角色脸部身份必须严格参考角色参考图。')
                lines.append('服装款式必须严格参考服装参考图。')
                lines.append('场景细节必须严格参考场景参考图。')
                lines.append('风格质感必须严格参考风格参考图。')
                lines.append('分镜参考图只决定怎么拍，不决定人物长什么样。')
                lines.append('如果分镜参考图是多格分镜板：选择其中最符合当前视频段落的镜头顺序进行参考。不要把多格画面同时塞进同一帧。生成视频时应表现为连续镜头或自然剪辑，而不是拼贴画面。')
                if first_frame_url:
                    lines.append('注意：首帧图优先决定第一帧画面，分镜参考用于约束后续镜头构图和运镜。')
                else:
                    lines.append('注意：分镜参考图用于约束视频开头画面构图。')
            prefix = '\n'.join(lines) + '\n' + QUALITY_PROMPT

            content = [{'type': 'text', 'text': prefix + '\n' + script}]
            for img in images:
                url = img['url']
                if url.startswith('/static/'):
                    url = host_url + url
                content.append({'type':'image_url','image_url':{'url':url},'role':'reference_image'})
            if audio_url:
                final_audio_url = host_url + audio_url if audio_url.startswith('/static/') else audio_url
                content.append({'type':'audio_url','audio_url':{'url':final_audio_url},'role':'reference_audio'})
            if video_url:
                content.append({'type':'video_url','video_url':{'url':video_url},'role':'reference_video'})
            if first_frame_url:
                url = first_frame_url
                if url.startswith('/static/'): url = host_url + url
                content.append({'type':'image_url','image_url':{'url':url},'role':'reference_image'})
            if last_frame_url:
                url = last_frame_url
                if url.startswith('/static/'): url = host_url + url
                content.append({'type':'image_url','image_url':{'url':url},'role':'reference_image'})

            try:
                if 'content' in locals() and isinstance(content, list):
                    for item in content:
                        if isinstance(item, dict) and item.get('type') == 'image_url':
                            if 'image_url' in item and 'url' in item['image_url']:
                                orig_url = item['image_url']['url']
                                if orig_url:
                                    item['image_url']['url'] = wash_seedance_image_by_url(orig_url)
            except Exception as wash_err:
                print(f"专属洗图执行出现异常，已降级回原图: {wash_err}")

            client = Ark(api_key=ARK_API_KEY)
            JOBS[job_id]['status'] = 'running'
            res = client.content_generation.tasks.create(
                model=MODEL_ID, content=content,
                generate_audio=True, ratio=ratio, duration=duration, watermark=False)
            task_id = res.id

            while True:
                r = client.content_generation.tasks.get(task_id=task_id)
                if r.status == 'succeeded':
                    vurl = r.content.video_url
                    JOBS[job_id] = {'status':'succeeded','video_url':vurl,'error':None}
                    # save history
                    hist = load_json(history_path(), [])
                    entry = {
                        'time': datetime.now().strftime('%Y-%m-%d %H:%M'),
                        'type': 'video',
                        'video_url': vurl,
                        'script': script[:80],
                        'original_script': original_script,
                        'refined_script': script if optimize else original_script
                    }
                    hist.insert(0, entry)
                    save_json(history_path(), hist[:50])
                    break
                elif r.status == 'failed':
                    JOBS[job_id] = {'status':'failed','video_url':None,'error':str(r.error)}
                    break
                else:
                    time.sleep(10)
        except Exception as e:
            JOBS[job_id] = {'status':'failed','video_url':None,'error':str(e)}

    threading.Thread(target=run, daemon=True).start()
    return jsonify(job_id=job_id)

@app.route('/api/status/<job_id>')
@login_required
def status(job_id):
    return jsonify(JOBS.get(job_id, {'status':'not_found'}))

@app.route('/api/model-caps')
@login_required
def model_caps():
    return jsonify(MODEL_CAPS)

# ── Styles CRUD ───────────────────────────────────────────────
@app.route('/api/styles', methods=['GET'])
@login_required
def get_styles():
    return jsonify(load_json(styles_path(), []))

@app.route('/api/styles', methods=['POST'])
@login_required
def save_styles():
    data = request.json
    if isinstance(data, list):
        save_json(styles_path(), data)
    return jsonify(ok=True)

@app.route('/api/styles/<style_id>', methods=['DELETE'])
@login_required
def delete_style(style_id):
    styles = load_json(styles_path(), [])
    styles = [s for s in styles if s.get('id') != style_id]
    save_json(styles_path(), styles)
    return jsonify(ok=True)

# ── Frame extraction ──────────────────────────────────────────
@app.route('/api/extract-frame', methods=['POST'])
@login_required
def extract_frame():
    body = request.json
    video_url = body.get('video_url', '')
    position = body.get('position', 'first')

    if not video_url:
        return jsonify(error='video_url required'), 400

    import subprocess, tempfile
    name = uuid.uuid4().hex + '.png'
    out_path = os.path.join(UPLOAD, name)

    try:
        # Use ffmpeg to extract frame
        if position == 'last':
            # Get video duration first, extract from near end
            probe = subprocess.run(['ffprobe', '-v', 'quiet', '-print_format', 'json',
                                    '-show_format', video_url],
                                    capture_output=True, text=True, timeout=30)
            duration = 5
            if probe.returncode == 0:
                import json as _json
                info = _json.loads(probe.stdout)
                duration = float(info.get('format', {}).get('duration', 5))
            seek_time = max(0, duration - 2)
            subprocess.run(['ffmpeg', '-y', '-ss', str(seek_time), '-i', video_url,
                            '-vframes', '1', '-q:v', '2', out_path],
                        capture_output=True, timeout=60)
        else:
            subprocess.run(['ffmpeg', '-y', '-i', video_url, '-vframes', '1',
                            '-q:v', '2', out_path],
                        capture_output=True, timeout=60)

        if not os.path.exists(out_path):
            return jsonify(error='截帧失败'), 500

        # Upload to TOS
        with open(out_path, 'rb') as f:
            img_bytes = f.read()
        public_url, ok = upload_to_tos(img_bytes, name, 'image/png')
        if ok:
            return jsonify(url=public_url, name=name)
        return jsonify(url=f'/static/uploads/{name}', name=name)

    except Exception as e:
        return jsonify(error=f'截帧异常: {str(e)}'), 500


# ── Local upscale to 1080p ───────────────────────────────────
@app.route('/api/upscale-local', methods=['POST'])
@login_required
def upscale_local():
    import subprocess, shutil
    body = request.json
    video_url = body.get('video_url', '')
    ratio = body.get('ratio', '9:16')
    if not video_url:
        return jsonify(error='video_url required'), 400

    # Check ffmpeg
    if not shutil.which('ffmpeg'):
        return jsonify(error='未检测到 ffmpeg，请先安装 ffmpeg'), 500

    # Ratio → target resolution (1080p)
    RATIO_SIZE = {
        '9:16': (1080, 1920),
        '16:9': (1920, 1080),
        '1:1': (1080, 1080),
        '4:3': (1440, 1080),
        '3:4': (1080, 1440),
        '21:9': (1920, 822),
    }
    tw, th = RATIO_SIZE.get(ratio, (1080, 1920))

    tmp_dir = os.path.join(BASE, 'tmp_upscale')
    os.makedirs(tmp_dir, exist_ok=True)
    tmp_input = os.path.join(tmp_dir, uuid.uuid4().hex + '_in.mp4')
    tmp_output = os.path.join(tmp_dir, uuid.uuid4().hex + '_out.mp4')

    try:
        # Download input
        r = requests.get(video_url, timeout=120, stream=True)
        if r.status_code != 200:
            return jsonify(error=f'下载视频失败: {r.status_code}'), 500
        with open(tmp_input, 'wb') as f:
            for chunk in r.iter_content(8192): f.write(chunk)

        # ffmpeg: lanczos scale + unsharp sharpen + re-encode h264
        cmd = [
            'ffmpeg', '-y', '-i', tmp_input,
            '-vf', f'scale={tw}:{th}:flags=lanczos,unsharp=5:5:0.5:3:3:0.25',
            '-c:v', 'libx264', '-crf', '18', '-preset', 'medium',
            '-c:a', 'aac', '-b:a', '128k',
            '-movflags', '+faststart',
            tmp_output
        ]
        result = subprocess.run(cmd, capture_output=True, text=True, timeout=600)
        if result.returncode != 0:
            return jsonify(error=f'ffmpeg 处理失败: {result.stderr[-300:]}'), 500

        # Upload to TOS
        name = uuid.uuid4().hex + '.mp4'
        with open(tmp_output, 'rb') as f:
            vid_bytes = f.read()
        public_url, ok = upload_to_tos(vid_bytes, name, 'video/mp4')
        if ok:
            out_url = public_url
        else:
            out_path = os.path.join(UPLOAD, name)
            shutil.copy(tmp_output, out_path)
            out_url = f'/static/uploads/{name}'

        return jsonify(url=out_url, width=tw, height=th, ratio=ratio, target='1080p')

    except Exception as e:
        return jsonify(error=str(e)), 500
    finally:
        import shutil as _shutil
        for f in [tmp_input, tmp_output]:
            try: os.remove(f)
            except: pass
        try: _shutil.rmtree(tmp_dir, ignore_errors=True)
        except: pass


# ── Script text model helper ─────────────────────────────────
def call_script_text_model(model_key, system_prompt, user_content, temperature=0.7, max_tokens=4000):
    """Call script text model (brainstorm/split). Routes to Ark or Nano based on model_key."""
    model_cfg = SCRIPT_MODELS.get(model_key, SCRIPT_MODELS[SCRIPT_MODEL_DEFAULT])
    provider = model_cfg["provider"]
    model_id = model_cfg["model_id"]

    if provider == "volcengine":
        client = Ark(api_key=ARK_API_KEY)
        resp = client.chat.completions.create(
            model=model_id,
            messages=[
                {'role': 'system', 'content': system_prompt},
                {'role': 'user', 'content': user_content}
            ],
            temperature=temperature, max_tokens=max_tokens
        )
        return resp.choices[0].message.content.strip()

    elif provider == "nano":
        api_key = os.environ.get("NANO_GPT_API_KEY", "").strip() or NANO_GPT_API_KEY
        if not api_key:
            raise Exception('NANO_GPT_API_KEY 未设置，请配置环境变量后使用 GLM4.6 或 Claude4.6 模型')
        headers = {
            'Content-Type': 'application/json',
            'x-api-key': api_key
        }
        payload = {
            'model': model_id,
            'messages': [
                {'role': 'system', 'content': system_prompt},
                {'role': 'user', 'content': user_content}
            ],
            'temperature': temperature,
            'max_tokens': max_tokens
        }
        r = requests.post(f'{NANO_GPT_BASE}/chat/completions', headers=headers, json=payload, timeout=120)
        if r.status_code != 200:
            raise Exception(f'Nano 文本模型调用失败: {r.status_code} {r.text[:300]}')
        data = r.json()
        return data['choices'][0]['message']['content'].strip()

    else:
        raise Exception(f'不支持的剧本模型: {model_key}')


# ── Script workspace endpoints ────────────────────────────────
@app.route('/api/script/import', methods=['POST'])
@login_required
def script_import():
    f = request.files.get('file')
    if not f: return jsonify(error='no file'), 400
    ext = os.path.splitext(secure_filename(f.filename))[1].lower()
    try:
        if ext == '.txt' or ext == '.md':
            text = f.read().decode('utf-8')
        elif ext == '.docx':
            try:
                from docx import Document
                import io
                doc = Document(io.BytesIO(f.read()))
                text = '\n'.join([p.text for p in doc.paragraphs])
            except ImportError:
                return jsonify(error='python-docx 未安装，请 pip install python-docx'), 500
        elif ext == '.pdf':
            return jsonify(error='PDF 暂不支持，请转为 txt 或 md 后上传'), 400
        else:
            return jsonify(error=f'不支持的文件格式: {ext}'), 400
        return jsonify(text=text, length=len(text))
    except Exception as e:
        return jsonify(error=str(e)), 500


@app.route('/api/script/brainstorm', methods=['POST'])
@login_required
def script_brainstorm():
    body = request.json
    topic = body.get('topic', '').strip()
    script_model = body.get('script_model', SCRIPT_MODEL_DEFAULT)
    if not topic:
        return jsonify(error='请输入主题或关键词'), 400

    system_prompt = (
        '你是一个专业的短剧编剧。根据用户提供的主题或关键词，'
        '创作一个1-2分钟的真人短剧片段。输出格式：\n'
        '【场景】xxx\n'
        '【人物】xxx\n'
        '【剧情】xxx\n\n'
        '直接输出剧本文本，不要markdown格式，不要角色列表。'
    )
    try:
        text = call_script_text_model(script_model, system_prompt, topic, temperature=0.8, max_tokens=2000)
        return jsonify(text=text)
    except Exception as e:
        return jsonify(error=f'生成失败: {str(e)}'), 500


@app.route('/api/script/split', methods=['POST'])
@login_required
def script_split():
    body = request.json
    script_text = body.get('script', '').strip()
    mode = body.get('mode', 'smart')  # smart | short | long
    script_model = body.get('script_model', SCRIPT_MODEL_DEFAULT)
    if not script_text:
        return jsonify(error='请输入剧本文本'), 400

    mode_instructions = {
        'short': '\n当前模式：短镜头模式。每个输出项只包含 1 个 beat，时长 4-6 秒，适合快速反应、特写、动作切点。',
        'long': '\n当前模式：长段落模式。每个输出项优先包含 2-3 个 beat，时长 8-15 秒，适合连续剧情推进。',
        'smart': '\n当前模式：智能段落模式（默认）。能合并就合并，该拆才拆，同一场景、同一情绪、同一动作线尽量合成一个段落。'
    }

    system_prompt = (
        '你是专业真人AI短剧分镜导演。用户会提供剧本、剧情梗概或灵感，你要把它拆成"可直接生成的视频段落"，而不是机械拆成单个镜头。\n\n'
        '核心目标：\n'
        '每个输出项是一段可直接交给视频生成模型生成的视频段落，时长 4-15 秒。一个视频段落内部可以包含 1-3 个连续镜头变化或运镜阶段，但必须发生在同一场景、同一时间、同一情绪推进中，保证场景统一、人物连续、动作连贯。\n\n'
        '拆分原则：\n'
        '1. 优先按"剧情动作段落"拆分，不按句子拆分。\n'
        '2. 同一场景、同一人物、同一情绪连续推进的内容，尽量合成一个视频段落。\n'
        '3. 一个视频段落内部允许包含 1-3 个镜头 beat。\n'
        '4. 只有在场景改变、时间跳跃、人物关系改变、情绪爆点需要单独强调、动作无法在一个连续视频里自然完成、需要明显转场时才拆成独立短段落。\n'
        '5. 不要把简单动作拆成多个独立视频段落。不要为了凑数量拆分。\n'
        '6. 每段默认 6-10 秒；动作简单可 4-6 秒；信息密集或包含 2-3 个 beat 可 10-15 秒。\n'
        '7. 每段必须能单独生成，不依赖上一段才能看懂画面。\n'
        '8. 台词要短，符合短剧口语，不能像旁白作文。\n\n'
        '每个视频段落必须包含：segment_no、duration、scene、characters（数组）、emotion、story_action、beats（1-3个）、dialogue、video_prompt。\n\n'
        'beats 写法：每个 beat 写清楚时间比例（如"前3秒"）、景别、机位/运镜、人物动作、画面重点。\n\n'
        'video_prompt 写法：\n'
        '1. 必须把 beats 融合成一段连续视频指令，使用直接命令式。\n'
        '2. 写清楚机位如何变化、人物如何运动、台词什么时候说。\n'
        '3. 同一场景内多个 beat 要强调"同一连续镜头感"或"自然剪辑感"。\n'
        '4. 保持人物、服装、场景一致。\n'
        '5. 质量约束放在最后：真人短剧质感，真实摄影风格，人物五官稳定，表情自然，动作连贯，手部和肢体正常，服装不穿模，场景保持一致，画面清晰，无字幕，无水印。\n\n'
        '如果用户输入很短或没灵感：自动补成一个短剧冲突片段，优先使用强冲突场景：误会、重逢、隐瞒、摊牌、反转、救场、背叛、追问。\n\n'
        + mode_instructions.get(mode, mode_instructions['smart']) + '\n\n'
        '输出格式必须是 JSON 数组，不要 Markdown，不要解释，只输出 JSON 数组。'
    )
    try:
        raw = call_script_text_model(script_model, system_prompt, script_text, temperature=0.7, max_tokens=4000)
        # Strip markdown code fences if present
        if raw.startswith('```'): raw = raw.split('\n', 1)[1]
        if raw.endswith('```'): raw = raw.rsplit('\n', 1)[0]
        shots = json.loads(raw)
        # save to history
        hist = load_json(history_path(), [])
        hist.insert(0, {
            'time': datetime.now().strftime('%Y-%m-%d %H:%M'),
            'type': 'script',
            'script_text': script_text[:200],
            'original_script': script_text,
            'segment_count': len(shots),
            'shots': shots
        })
        save_json(history_path(), hist[:50])
        return jsonify(shots=shots, count=len(shots))
    except json.JSONDecodeError as e:
        return jsonify(error=f'解析分镜结果失败: {str(e)}', raw=raw), 500
    except Exception as e:
        return jsonify(error=f'拆分失败: {str(e)}'), 500


if __name__ == '__main__':
    port = int(os.environ.get('PORT', '5001'))
    debug = os.environ.get('FLASK_DEBUG', '1') == '1'
    app.run(debug=debug, port=port, threaded=True)
import io
import requests
from PIL import Image, ImageFilter, ImageEnhance

def wash_tos_image(tos_url):
    """
    黑箱洗图机：输入火山 TOS 链接，在内存里洗完后，上传一个处理后的临时字节流
    """
    try:
        # 1. 从你的 TOS 链接把原图下载到内存里
        response = requests.get(tos_url, timeout=5)
        if response.status_code != 200:
            return tos_url
            
        # 2. 用 PIL 打开图片并进行微观脱敏
        img = Image.open(io.BytesIO(response.content))
        if img.mode == 'RGBA':
            img = img.convert('RGB')
            
        # 轻微模糊，打碎面部特征
        img = img.filter(ImageFilter.GaussianBlur(radius=0.8))
        enhancer = ImageEnhance.Contrast(img)
        img = enhancer.enhance(1.03)
        
        # 3. 重新导出为二进制字节
        output_buffer = io.BytesIO()
        img.save(output_buffer, format='JPEG', quality=85)
        washed_bytes = output_buffer.getvalue()
        
        # 4. 这里需要调用你现有的 upload_to_tos 函数，把洗好的图重新传一份
        # 为了防止文件名冲突，加个前缀
        import os
        from datetime import datetime
        new_name = "washed_" + datetime.now().strftime("%H%M%S") + ".jpg"
        
        # 借用你写好的 upload_to_tos 函数（在图三能看到这个函数定义）
        new_url, ok = upload_to_tos(washed_bytes, new_name, 'image/jpeg')
        if ok:
            print(f"--- 后端：Seedance 专属洗图成功！新链接已生成: {new_url} ---")
            return new_url
            
    except Exception as e:
        print(f"洗图失败，降级使用原链接: {e}")
        
    return tos_url
