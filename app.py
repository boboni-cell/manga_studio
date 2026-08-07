import os, json, uuid, time, threading, requests, functools, sys, re, secrets
import tos
from datetime import datetime, timezone
from urllib.parse import quote
from flask import Flask, request, jsonify, send_from_directory, redirect, session
from werkzeug.utils import secure_filename
from werkzeug.security import generate_password_hash, check_password_hash
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

try:
    from supabase import create_client
    SUPABASE_URL = os.environ.get('SUPABASE_URL', '').strip()
    SUPABASE_KEY = os.environ.get('SUPABASE_SERVICE_KEY', '').strip()
    _supabase = create_client(SUPABASE_URL, SUPABASE_KEY) if (SUPABASE_URL and SUPABASE_KEY) else None
except Exception as e:
    print(f'[Supabase] disabled: {e}')
    _supabase = None

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
AGNES_API_KEY = os.environ.get('AGNES_API_KEY', '')

# TOS config (non-secret)
TOS_ENDPOINT = "tos-cn-beijing.volces.com"
TOS_REGION   = "cn-beijing"
TOS_BUCKET   = "movie1"
TOS_PUBLIC_BASE = f"https://{TOS_BUCKET}.{TOS_ENDPOINT}"

# Cloudflare R2 config. If these are set, new media is saved to R2 first.
R2_ACCOUNT_ID = os.environ.get('R2_ACCOUNT_ID', '')
R2_ACCESS_KEY_ID = os.environ.get('R2_ACCESS_KEY_ID', '')
R2_SECRET_ACCESS_KEY = os.environ.get('R2_SECRET_ACCESS_KEY', '')
R2_BUCKET = os.environ.get('R2_BUCKET', 'image-web-storage')
R2_PUBLIC_BASE = os.environ.get('R2_PUBLIC_BASE', '').rstrip('/')
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
    "kling-v30-std": "kling-v30-std",
    "grok-imagine-video": "grok-imagine-video-reference-to-video",
    "vidu-q3": "vidu-q3",
    "seedance-v15-pro": "bytedance-seedance-v1.5-pro",
}
NANO_GPT_NAMES = set(NANO_GPT_MODELS.keys())

# Third-party generic adapter
THIRD_PARTY_API_BASE = os.environ.get("THIRD_PARTY_API_BASE", "")
THIRD_PARTY_API_KEY = os.environ.get("THIRD_PARTY_API_KEY", "")
THIRD_PARTY_MODEL_ID = "third-party"

AGNES_API_BASE = "https://apihub.agnes-ai.com/v1"
AGNES_VIDEO_MODEL_ID = "agnes-video-v2.0"
AGNES_IMAGE_MODEL_ID = "agnes-image-2.1-flash"
ATLAS_API_BASE = "https://api.atlascloud.ai/api/v1"

ALL_MODELS = ["seedance", AGNES_VIDEO_MODEL_ID] + sorted(NANO_GPT_NAMES) + ([THIRD_PARTY_MODEL_ID] if THIRD_PARTY_API_KEY or THIRD_PARTY_API_BASE else [])

# Model capabilities
MODEL_CAPS = {
    "seedance": {"supports_first_frame": True, "supports_last_frame": True, "supports_reference_images": True, "resolutions": ["480p","720p"]},
    "kling-v30-std": {"supports_first_frame": True, "supports_last_frame": False, "supports_reference_images": True, "resolutions": ["720p"]},
    "grok-imagine-video": {"supports_first_frame": False, "supports_last_frame": False, "supports_reference_images": True, "resolutions": ["480p","720p","1080p"]},
    "vidu-q3": {"supports_first_frame": True, "supports_last_frame": False, "supports_reference_images": True, "resolutions": ["480p","720p","1080p"]},
    "seedance-v15-pro": {"supports_first_frame": True, "supports_last_frame": True, "supports_reference_images": True, "resolutions": ["480p","720p"]},
    AGNES_VIDEO_MODEL_ID: {
        "supports_first_frame": False,
        "supports_last_frame": False,
        "supports_reference_images": False,
        "resolutions": ["480p", "720p", "1080p"],
        "ratios": ["16:9", "9:16", "1:1", "4:3", "3:4"],
        "min_duration": 4,
        "max_duration": 15,
    },
    THIRD_PARTY_MODEL_ID: {"supports_first_frame": False, "supports_last_frame": False, "supports_reference_images": True, "resolutions": ["480p","720p","1080p"]},
}

# Image generation configs
NANO_GPT_IMAGE_MODELS = {"gpt-image-2", "nano-banana-2", "midjourney"}
VOLC_IMAGE_MODEL_ID = "doubao-seedream-4-5-251128"
ALL_IMAGE_MODELS = sorted(NANO_GPT_IMAGE_MODELS) + [AGNES_IMAGE_MODEL_ID, "volc-seedream-4-5"]
IMAGE_RATIOS = ["1:1", "2:3", "3:2", "3:4", "4:3", "9:16", "16:9", "4:5", "5:4", "custom"]
# Ratio → pixel size for Nano models (moderate sizes)
RATIO_TO_SIZE_NANO = {
    "1:1": "1024x1024", "2:3": "1024x1536", "3:2": "1536x1024",
    "3:4": "1536x2048", "4:3": "2048x1536",
    "9:16": "768x1344", "16:9": "1344x768",
    "4:5": "1536x1920", "5:4": "1920x1536"
}
RATIO_TO_SIZE_AGNES = {
    "1:1": "1024x1024", "2:3": "768x1152", "3:2": "1152x768",
    "3:4": "768x1024", "4:3": "1024x768", "9:16": "768x1365",
    "16:9": "1365x768", "4:5": "819x1024", "5:4": "1024x819"
}
# GPT Image style models sometimes ignore uncommon size strings and fall back
# to 1024x1024, so use stricter/common dimensions plus aspect_ratio below.
RATIO_TO_SIZE_GPT_IMAGE = {
    "1:1": "1024x1024", "2:3": "1024x1536", "3:2": "1536x1024",
    "3:4": "1024x1365", "4:3": "1365x1024",
    "9:16": "864x1536", "16:9": "1536x864",
    "4:5": "1024x1280", "5:4": "1280x1024"
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
SCRIPT_JOBS = {}
JOB_OWNERS = {}
HISTORY_LOCK = threading.Lock()

def load_json(path, default):
    """Load data from Supabase or local JSON file."""
    key = os.path.relpath(path, DATA).replace(os.sep, '/').replace('.json', '')
    if _supabase:
        try:
            r = _supabase.table('kv_store').select('data').eq('key', key).execute()
            if r.data:
                return r.data[0]['data']
        except Exception:
            pass
    try:
        with open(path, 'r', encoding='utf-8') as f: return json.load(f)
    except: return default

def save_json(path, data):
    """Save data to Supabase and local JSON file."""
    key = os.path.relpath(path, DATA).replace(os.sep, '/').replace('.json', '')
    os.makedirs(os.path.dirname(path), exist_ok=True)
    with open(path, 'w', encoding='utf-8') as f:
        json.dump(data, f, ensure_ascii=False, indent=2)
    if _supabase:
        try:
            _supabase.table('kv_store').upsert({
                'key': key,
                'data': data,
                'updated_at': datetime.now(timezone.utc).isoformat()
            }, on_conflict='key').execute()
        except Exception:
            pass

def current_user_id():
    return session.get('user_id')

def user_data_path(name, user_id=None):
    user_id = user_id or current_user_id()
    if not user_id:
        raise RuntimeError('unauthorized')
    folder = os.path.join(DATA, 'users', secure_filename(user_id))
    os.makedirs(folder, exist_ok=True)
    return os.path.join(folder, f'{name}.json')

def characters_path(user_id=None): return user_data_path('characters', user_id)
def assets_path(cat, user_id=None): return user_data_path(cat, user_id)
def history_path(user_id=None): return user_data_path('history', user_id)
def styles_path(user_id=None): return user_data_path('styles', user_id)
def settings_path(user_id=None): return user_data_path('api_settings', user_id)
def users_path(): return os.path.join(DATA, 'users.json')
def invitations_path(): return os.path.join(DATA, 'invitations.json')

def insert_history(entry, limit=100, user_id=None):
    with HISTORY_LOCK:
        path = history_path(user_id)
        hist = load_json(path, [])
        hist.insert(0, entry)
        save_json(path, hist[:limit])

def save_video_history(video_url, script, original_script=None, refined_script=None,
                       model=None, ratio=None, duration=None, resolution=None,
                       ref_count=None, user_id=None):
    entry = {
        'time': datetime.now().strftime('%Y-%m-%d %H:%M'),
        'type': 'video',
        'video_url': video_url,
        'script': (script or '')[:80],
        'original_script': original_script or script or '',
        'refined_script': refined_script or script or ''
    }
    if model: entry['model'] = model
    if ratio: entry['ratio'] = ratio
    if duration: entry['duration'] = duration
    if resolution: entry['resolution'] = resolution
    if ref_count is not None: entry['ref_count'] = ref_count
    insert_history(entry, user_id=user_id)
    return entry

def ensure_default_styles(styles):
    if not isinstance(styles, list):
        styles = []
    merged = list(styles)
    changed = False
    existing_ids = {s.get('id') for s in merged if isinstance(s, dict)}
    existing_names = {s.get('name') for s in merged if isinstance(s, dict)}
    for style in DEFAULT_STYLES:
        if style.get('id') not in existing_ids and style.get('name') not in existing_names:
            merged.append(style)
            changed = True
            existing_ids.add(style.get('id'))
            existing_names.add(style.get('name'))
    default_by_id = {s.get('id'): s for s in DEFAULT_STYLES}
    for i, style in enumerate(merged):
        if not isinstance(style, dict):
            continue
        default = default_by_id.get(style.get('id'))
        if not default:
            continue
        refreshed = dict(style)
        for key in ('name', 'thumbnail_url', 'prompt', 'negative_prompt', 'use_for_image', 'use_for_video'):
            if refreshed.get(key) != default.get(key):
                refreshed[key] = default.get(key)
                changed = True
        merged[i] = refreshed
    return merged, changed

# Ensure data directory and files exist (for fresh Volume mounts)
DEFAULT_STYLES = [{'id': 'style_1',
  'name': '真人短剧',
  'thumbnail_url': 'https://movie1.tos-cn-beijing.volces.com/6765e87c2c4540c09f4ede7be5e2bb2b',
  'prompt': '整体呈现真人短剧剧照风格，画面像真实拍摄的竖屏短剧或网络剧。人物外貌自然好看，五官清晰稳定，皮肤真实不过度磨皮，不要塑料感和廉价网红滤镜。服装、发型、妆容符合现实生活审美，表情有戏但不过分夸张。光线以柔和自然光或室内影视灯为主，面部受光清楚，背景不过曝不死黑。构图服务剧情，人物关系明确，画面干净，情绪直接，适合连续生成真人AI短剧视频。',
  'negative_prompt': '低清晰度，模糊，画面脏乱，构图混乱，人物五官变形，脸部崩坏，年龄漂移，性别变化，多余人物，肢体畸形，手指错误，手部融合，服装穿模，身体比例异常，主体被裁切，背景物体扭曲，字幕，水印，文字，Logo，边框，拼贴，多格漫画',
  'use_for_image': True,
  'use_for_video': True,
  'created_at': '2026-06-14 12:00'},
 {'id': 'style_2',
  'name': '电影写实',
  'thumbnail_url': 'https://movie1.tos-cn-beijing.volces.com/d338bd0fb5654fb1879044fa0fa918c0',
  'prompt': '整体呈现电影级写实风格，画面像高质量实拍电影剧照。光影有层次，色彩克制统一，环境材质真实可信，人物与场景融合自然。镜头语言稳重，构图有明确视觉中心，前景、中景、背景层次清楚。人物表情自然，动作真实，避免过度摆拍和广告感。画面保留真实摄影的细节、景深、光线方向和空间质感，适合严肃剧情、情绪戏和高质感叙事镜头。',
  'negative_prompt': '低清晰度，模糊，画面脏乱，构图混乱，人物五官变形，脸部崩坏，年龄漂移，性别变化，多余人物，肢体畸形，手指错误，手部融合，服装穿模，身体比例异常，主体被裁切，背景物体扭曲，字幕，水印，文字，Logo，边框，拼贴，多格漫画',
  'use_for_image': True,
  'use_for_video': True,
  'created_at': '2026-06-14 12:00'},
 {'id': 'style_3',
  'name': '都市偶像剧',
  'thumbnail_url': 'https://movie1.tos-cn-beijing.volces.com/897b8b73295647678b55ca7293f43df7',
  'prompt': '整体呈现现代都市偶像剧风格，画面明亮、干净、精致，人物外貌清爽好看，服装时尚但不夸张。场景具有现代城市生活质感，如咖啡馆、公寓、办公室、街道、商场等，环境整洁有设计感。光线柔和通透，肤色自然，色彩偏温暖或清新，画面浪漫但不过度梦幻。人物互动自然，情绪细腻，适合暧昧、重逢、误会、告白、职场和日常情节。',
  'negative_prompt': '低清晰度，模糊，画面脏乱，构图混乱，人物五官变形，脸部崩坏，年龄漂移，性别变化，多余人物，肢体畸形，手指错误，手部融合，服装穿模，身体比例异常，主体被裁切，背景物体扭曲，字幕，水印，文字，Logo，边框，拼贴，多格漫画',
  'use_for_image': True,
  'use_for_video': True,
  'created_at': '2026-06-14 12:00'},
 {'id': 'style_4',
  'name': '悬疑冷色',
  'thumbnail_url': 'https://movie1.tos-cn-beijing.volces.com/c884c1315ae449fa809b5cc9878ea72c',
  'prompt': '整体呈现悬疑剧冷色调风格，画面低饱和、冷蓝灰、阴影层次明显，氛围紧张压抑。光线方向明确，常带有窗外冷光、走廊灯、监控感顶光或局部硬光，形成强烈明暗对比。场景保持真实可信，细节克制，不夸张恐怖怪诞。人物表情内敛、警觉、压抑或怀疑，镜头构图留有适当空白和不安感。适合秘密、追踪、对峙、调查、背叛和反转情节。',
  'negative_prompt': '低清晰度，模糊，画面脏乱，构图混乱，人物五官变形，脸部崩坏，年龄漂移，性别变化，多余人物，肢体畸形，手指错误，手部融合，服装穿模，身体比例异常，主体被裁切，背景物体扭曲，字幕，水印，文字，Logo，边框，拼贴，多格漫画',
  'use_for_image': True,
  'use_for_video': True,
  'created_at': '2026-06-14 12:00'},
 {'id': 'style_5',
  'name': '古风权谋',
  'thumbnail_url': 'https://movie1.tos-cn-beijing.volces.com/67b94fcde64046a58233c4523acad92d',
  'prompt': '整体呈现古风影视剧权谋风格，画面庄重、精致、克制，具有中式建筑、古代服饰、木质结构、屏风、烛火、庭院、宫殿或书房等视觉元素。色彩以暖金、墨色、深红、青灰、木色为主，光影层次丰富，氛围沉稳大气。人物服装完整考究，发型、配饰、妆容符合古装审美，表情含蓄有张力。构图讲究人物站位和权力关系，适合对峙、密谈、审问、谋划和情感压抑的戏。',
  'negative_prompt': '低清晰度，模糊，画面脏乱，构图混乱，人物五官变形，脸部崩坏，年龄漂移，性别变化，多余人物，肢体畸形，手指错误，手部融合，服装穿模，身体比例异常，主体被裁切，背景物体扭曲，字幕，水印，文字，Logo，边框，拼贴，多格漫画',
  'use_for_image': True,
  'use_for_video': True,
  'created_at': '2026-06-14 12:00'},
 {'id': 'style_6',
  'name': '国漫3D',
  'thumbnail_url': 'https://movie1.tos-cn-beijing.volces.com/595d66045bf74804b0376dd8b366dc6d.jpg',
  'prompt': '整体呈现高质量国漫3D风格，人物为精致三维角色，五官清晰，面部表情细腻，发丝、服装、材质和光影具有影视级CG质感。画面华丽但不塑料，皮肤和布料材质有层次，动作姿态自然。场景空间完整，灯光具有戏剧性和层次感，色彩鲜明但不杂乱。适合奇幻、都市幻想、古风玄幻、热血、情绪爆发和高视觉冲击的AI漫剧内容。',
  'negative_prompt': '低清晰度，模糊，画面脏乱，构图混乱，人物五官变形，脸部崩坏，年龄漂移，性别变化，多余人物，肢体畸形，手指错误，手部融合，服装穿模，身体比例异常，主体被裁切，背景物体扭曲，字幕，水印，文字，Logo，边框，拼贴，多格漫画',
  'use_for_image': True,
  'use_for_video': True,
  'created_at': '2026-06-14 12:00'},
 {'id': 'style_7',
  'name': '日系动画',
  'thumbnail_url': 'https://movie1.tos-cn-beijing.volces.com/a05e6f30728a4c86bf9ba6f667059ade',
  'prompt': '整体呈现日系动画风格，画面线条干净，角色轮廓清晰，色彩柔和明亮，人物表情细腻，动作姿态自然。背景绘制精致，有生活气息或电影动画质感，光线温柔，有明确时间氛围，如清晨、黄昏、雨天、夜晚灯光等。人物服装和发型保持一致，不写实真人化，不变成3D塑料感。适合青春、校园、治愈、恋爱、日常、奇幻和情绪细腻的分镜。',
  'negative_prompt': '低清晰度，模糊，画面脏乱，构图混乱，人物五官变形，脸部崩坏，年龄漂移，性别变化，多余人物，肢体畸形，手指错误，手部融合，服装穿模，身体比例异常，主体被裁切，背景物体扭曲，字幕，水印，文字，Logo，边框，拼贴，多格漫画',
  'use_for_image': True,
  'use_for_video': True,
  'created_at': '2026-06-14 12:00'},
 {'id': 'style_8',
  'name': '赛博霓虹',
  'thumbnail_url': 'https://movie1.tos-cn-beijing.volces.com/1af24b6d7c8b462ca8b6bb158ed7d452',
  'prompt': '整体呈现赛博朋克霓虹风格，画面以夜景城市、霓虹灯牌、湿润街道、玻璃反射、金属材质、电子屏幕和未来科技元素为主。色彩以蓝、紫、粉、青色霓虹光为核心，暗部深邃，高光强烈，反射丰富。人物造型具有未来都市感，但不杂乱堆砌。构图强调城市纵深、光影对比和科技氛围，适合追逐、交易、黑客、夜晚对峙、未来都市短剧和强视觉风格镜头。',
  'negative_prompt': '低清晰度，模糊，画面脏乱，构图混乱，人物五官变形，脸部崩坏，年龄漂移，性别变化，多余人物，肢体畸形，手指错误，手部融合，服装穿模，身体比例异常，主体被裁切，背景物体扭曲，字幕，水印，文字，Logo，边框，拼贴，多格漫画',
  'use_for_image': True,
  'use_for_video': True,
  'created_at': '2026-06-14 12:00'},
 {'id': 'style_9',
  'name': '韩漫短剧',
  'thumbnail_url': 'https://movie1.tos-cn-beijing.volces.com/16e04c823639433e8d83f7cec108c588',
  'prompt': '【强制画风：韩漫 / 韩国 Webtoon 2D 插画】画面必须是精致韩系网络漫画、恋爱条漫、动态漫关键帧风格，不是真人照片，不是3D渲染，不是AI真人写真，不是服装商品图。人物使用干净细腻的黑色或深棕线稿，柔和赛璐璐上色，半透明皮肤阴影，精致眼睫和眼神高光，薄唇，清爽脸型，细腻发丝分束，整体有韩漫男主/女主的修长肩颈、小脸、挺拔身形和高级感。色彩偏粉白、浅蓝、奶油光或清透暖光，背景可以是校园、樱花、都市街道、咖啡馆、公寓、办公室、医院、豪宅等韩漫场景，浅景深、柔光、花瓣或细腻空气感可以使用。构图像高质量韩国恋爱漫画封面或单格大画面，人物情绪细腻，适合暧昧、重逢、误会、追妻、契约恋爱、财阀、复仇、职场和都市情感剧情。即使生成角色三视图、服装设定或分镜构图，也必须保持同一个韩漫2D插画画风，不能变成写实模特照、3D人偶、棚拍白底商品图。可参考韩国条漫的细线稿、柔和阴影、清透肤色、精致五官和浪漫氛围，但不要生成文字、对白框、字幕或水印。',
  'negative_prompt': '真人照片，真实摄影，AI真人写真，写实皮肤纹理，3D渲染，CG人偶，塑料感，服装商品图，模特棚拍，白底真人设定照，证件照，欧美漫画，厚涂油画，低幼Q版，粗糙线条，夸张表情包风格，韩文文字，对白框，字幕，水印，Logo，低清晰度，模糊，画面脏乱，构图混乱，人物五官变形，脸部崩坏，年龄漂移，性别变化，多余人物，肢体畸形，手指错误，手部融合，服装穿模，身体比例异常，主体被裁切，背景物体扭曲，边框，拼贴，多格漫画',
  'use_for_image': True,
  'use_for_video': True,
  'created_at': '2026-06-14 12:00'}]

def init_data():
    os.makedirs(DATA, exist_ok=True)
    for path, default in [
        (users_path(), {}),
        (invitations_path(), []),
    ]:
        if not os.path.exists(path) or os.path.getsize(path) < 10:
            save_json(path, default)

    initial_password = os.environ.get('ADMIN_INITIAL_PASSWORD', '')
    admin_ids = [item.strip().lower() for item in os.environ.get('ADMIN_USERS', '').split(',') if item.strip()]
    if initial_password and admin_ids:
        users = load_json(users_path(), {})
        changed = False
        for admin_id in admin_ids:
            if admin_id not in users:
                users[admin_id] = {
                    'username': admin_id,
                    'password_hash': generate_password_hash(initial_password, method='pbkdf2:sha256'),
                    'created_at': datetime.now(timezone.utc).isoformat(),
                    'model_permissions': ['text', 'image', 'video'],
                    'points': 0
                }
                changed = True
        if changed:
            save_json(users_path(), users)

init_data()

# ── Object storage upload helper ──────────────────────────────
def get_tos_client():
    return tos.TosClientV2(TOS_AK, TOS_SK, TOS_ENDPOINT, TOS_REGION)

def r2_configured():
    return all([R2_ACCOUNT_ID, R2_ACCESS_KEY_ID, R2_SECRET_ACCESS_KEY, R2_BUCKET, R2_PUBLIC_BASE])

def persistent_storage_configured():
    return r2_configured() or bool(TOS_AK and TOS_SK)

def active_storage_name():
    if r2_configured():
        return 'r2'
    if TOS_AK and TOS_SK:
        return 'tos'
    return 'local'

def storage_name_for_url(url):
    if R2_PUBLIC_BASE and url and url.startswith(R2_PUBLIC_BASE):
        return 'r2'
    if TOS_PUBLIC_BASE and url and url.startswith(TOS_PUBLIC_BASE):
        return 'tos'
    return 'local'

def get_r2_client():
    import boto3
    return boto3.client(
        's3',
        endpoint_url=f'https://{R2_ACCOUNT_ID}.r2.cloudflarestorage.com',
        aws_access_key_id=R2_ACCESS_KEY_ID,
        aws_secret_access_key=R2_SECRET_ACCESS_KEY,
        region_name='auto',
    )

def r2_public_url(object_key):
    return f"{R2_PUBLIC_BASE}/{quote(object_key, safe='/')}"

def upload_to_r2(file_data, object_key, content_type='application/octet-stream', content_length=None):
    """Upload bytes or stream to R2, return (public_url, success)."""
    if not r2_configured():
        return None, False
    try:
        kwargs = {
            'Bucket': R2_BUCKET,
            'Key': object_key,
            'Body': file_data,
            'ContentType': content_type,
        }
        if content_length:
            kwargs['ContentLength'] = content_length
        get_r2_client().put_object(**kwargs)
        return r2_public_url(object_key), True
    except Exception as e:
        print(f'[R2] upload failed: {e}', flush=True)
        return None, False

def is_persistent_storage_url(url):
    return bool(
        url and (
            (R2_PUBLIC_BASE and url.startswith(R2_PUBLIC_BASE)) or
            (TOS_PUBLIC_BASE and url.startswith(TOS_PUBLIC_BASE))
        )
    )

def upload_to_tos(file_data, object_key, content_type='application/octet-stream', content_length=None):
    """Upload bytes or stream to durable object storage, return (public_url, success)."""
    public_url, ok = upload_to_r2(file_data, object_key, content_type, content_length)
    if ok:
        return public_url, True

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


# ── User authentication ──────────────────────────────────────
USERS_LOCK = threading.Lock()

class QuotaError(Exception): pass

def minimax_api_root(api_base):
    base_url = (api_base or '').rstrip('/')
    for suffix in ('/v2/video_generation', '/v2'):
        if base_url.lower().endswith(suffix):
            return base_url[:-len(suffix)]
    return base_url

def normalize_api_profile(profile):
    profile = dict(profile or {})
    base_url = (profile.get('base_url') or '').rstrip('/')
    provider = profile.get('provider', '')
    if 'api.atlascloud.ai' in base_url.lower():
        provider = 'atlas'
        base_url = ATLAS_API_BASE
    if str(profile.get('model') or '').lower() == 'minimax-h3' and any(host in base_url.lower() for host in ('api.minimaxi.com', 'api.minimax.io')):
        provider = 'minimax'
        base_url = minimax_api_root(base_url)
    normalized = {
        'id': profile.get('id') or uuid.uuid4().hex,
        'name': (profile.get('name') or '').strip(),
        'provider': provider, 'base_url': base_url,
        'api_key': profile.get('api_key', ''), 'model': profile.get('model', ''),
        'last_test': profile.get('last_test'),
        'created_at': profile.get('created_at') or datetime.now(timezone.utc).isoformat()
    }
    if not normalized['name']:
        normalized['name'] = ' · '.join(filter(None, [provider or 'Custom API', normalized['model']]))
    return normalized

def get_api_profiles(kind, user_id=None):
    path = settings_path(user_id)
    settings = load_json(path, {})
    stored_profiles = settings.get('api_profiles', {}).get(kind)
    changed = not isinstance(stored_profiles, list)
    if isinstance(stored_profiles, list):
        profiles = [normalize_api_profile(item) for item in stored_profiles if isinstance(item, dict)]
        changed = changed or profiles != stored_profiles
    else:
        legacy = settings.get('apis', {}).get(kind, {})
        profiles = [normalize_api_profile(legacy)] if isinstance(legacy, dict) and any(legacy.get(key) for key in ('provider', 'base_url', 'api_key', 'model')) else []

    selected = settings.get('selected_api_profiles', {}).get(kind)
    ids = {item['id'] for item in profiles}
    if selected not in ids:
        selected = profiles[0]['id'] if profiles else None
        changed = True
    if changed:
        settings.setdefault('api_profiles', {})[kind] = profiles
        settings.setdefault('selected_api_profiles', {})[kind] = selected
        if profiles:
            settings.setdefault('apis', {})[kind] = dict(next(item for item in profiles if item['id'] == selected))
        save_json(path, settings)
    return profiles, selected

def public_api_profile(profile):
    return {
        'id': profile.get('id'), 'name': profile.get('name', ''),
        'provider': profile.get('provider', ''), 'base_url': profile.get('base_url', ''),
        'model': profile.get('model', ''), 'configured': bool(profile.get('api_key')),
        'last_test': profile.get('last_test')
    }

def get_personal_api(kind, user_id=None, profile_id=None):
    profiles, selected = get_api_profiles(kind, user_id)
    target_id = profile_id or selected
    profile = next((item for item in profiles if item['id'] == target_id), None)
    return dict(profile or {'provider': '', 'base_url': '', 'api_key': '', 'model': '', 'last_test': None})

def use_personal_api(user_id=None):
    user_id = user_id or current_user_id()
    if is_admin(user_id): return False
    user = load_json(users_path(), {}).get(user_id, {})
    return int(user.get('points') or 0) <= 0

def resolve_api(kind, builtin, user_id=None, force_personal=False, profile_id=None, strict_builtin=False):
    if not force_personal and not use_personal_api(user_id): return builtin
    if not force_personal and strict_builtin:
        raise QuotaError('平台积分已用完，请在模型中选择「自己的 API」')
    personal = get_personal_api(kind, user_id, profile_id)
    if personal.get('api_key') and personal.get('base_url') and personal.get('model'): return personal
    if force_personal:
        raise QuotaError('请选择一个已保存且配置完整的个人 API')
    raise QuotaError('平台积分已用完，请先在「我的 API」中接入自己的接口')

def get_user_api_settings(user_id=None):
    return {
        'ark_api_key': ARK_API_KEY, 'nano_api_key': NANO_GPT_API_KEY,
        'third_party_api_base': THIRD_PARTY_API_BASE, 'third_party_api_key': THIRD_PARTY_API_KEY,
    }

def is_admin(user_id=None):
    user_id = (user_id or current_user_id() or '').lower()
    admins = {item.strip().lower() for item in os.environ.get('ADMIN_USERS', '').split(',') if item.strip()}
    return user_id in admins

def admin_required(f):
    @functools.wraps(f)
    def wrap(*a, **kw):
        if not current_user_id(): return jsonify(error='unauthorized'), 401
        if not is_admin(): return jsonify(error='forbidden'), 403
        return f(*a, **kw)
    return wrap

def model_access_required(kind):
    def decorator(f):
        @functools.wraps(f)
        def wrap(*a, **kw):
            if is_admin(): return f(*a, **kw)
            user = load_json(users_path(), {}).get(current_user_id(), {})
            if kind not in user.get('model_permissions', []):
                return jsonify(error=f'当前账号未开放{kind}模型权限，请联系管理员获取邀请码'), 403
            return f(*a, **kw)
        return wrap
    return decorator

def login_required(f):
    @functools.wraps(f)
    def wrap(*a, **kw):
        user_id = current_user_id()
        if not user_id: return jsonify(error='unauthorized'), 401
        if load_json(users_path(), {}).get(user_id, {}).get('disabled'):
            session.clear()
            return jsonify(error='账号已停用'), 403
        return f(*a, **kw)
    return wrap
# ── static pages ──────────────────────────────────────────────
@app.route('/')
def index():
    if not current_user_id():
        return send_from_directory('static', 'login.html')
    return send_from_directory('static', 'index.html')

@app.route('/admin')
def admin_page():
    if not current_user_id(): return redirect('/')
    if not is_admin(): return '<h2 style="text-align:center;margin-top:100px">无管理员权限</h2>', 403
    return send_from_directory('static', 'admin.html')

@app.route('/api-settings')
@login_required
def api_settings_page():
    return send_from_directory('static', 'api-settings.html')

@app.route('/api/auth/register', methods=['POST'])
def register():
    body = request.json or {}
    username = (body.get('username') or '').strip()
    password = body.get('password') or ''
    invite_code = (body.get('invite_code') or '').strip().upper()
    valid_name = 3 <= len(username) <= 120 and re.fullmatch(r'[A-Za-z0-9._@+-]+', username)
    valid_email = '@' not in username or re.fullmatch(r'[^@\s]+@[^@\s]+\.[^@\s]+', username)
    if not valid_name or not valid_email:
        return jsonify(error='请输入有效的邮箱或用户名'), 400
    if len(password) < 8:
        return jsonify(error='密码至少需要 8 位'), 400
    user_id = username.lower()
    with USERS_LOCK:
        users = load_json(users_path(), {})
        if user_id in users:
            return jsonify(error='用户名已存在'), 409
        invitations = load_json(invitations_path(), [])
        invite = next((item for item in invitations if item.get('code') == invite_code and item.get('active', True) and item.get('used', 0) < item.get('max_uses', 1)), None)
        if not invite:
            return jsonify(error='邀请码无效或已用完'), 400
        invite['used'] = invite.get('used', 0) + 1
        users[user_id] = {'username': username, 'password_hash': generate_password_hash(password, method='pbkdf2:sha256'), 'created_at': datetime.now(timezone.utc).isoformat(), 'model_permissions': invite.get('permissions', []), 'points': invite.get('points', 0), 'invite_code': invite_code}
        save_json(users_path(), users)
        save_json(invitations_path(), invitations)
    session.clear()
    session['user_id'] = user_id
    return jsonify(ok=True, username=username)

@app.route('/api/auth/login', methods=['POST'])
def login():
    body = request.json or {}
    user_id = (body.get('username') or '').strip().lower()
    user = load_json(users_path(), {}).get(user_id)
    if not user or not check_password_hash(user.get('password_hash', ''), body.get('password') or ''):
        return jsonify(error='用户名或密码错误'), 401
    if user.get('disabled'):
        return jsonify(error='账号已停用，请联系管理员'), 403
    session.clear()
    session['user_id'] = user_id
    return jsonify(ok=True, username=user.get('username', user_id))

@app.route('/api/auth/logout', methods=['POST'])
def logout():
    session.clear()
    return jsonify(ok=True)

@app.route('/api/auth/me')
@login_required
def auth_me():
    user = load_json(users_path(), {}).get(current_user_id(), {})
    return jsonify(username=user.get('username', current_user_id()), is_admin=is_admin(), model_permissions=user.get('model_permissions', []), points=user.get('points', 0))

@app.route('/api/settings', methods=['GET', 'POST'])
@login_required
def api_settings():
    if request.method == 'POST':
        body = request.json or {}
        kind = body.get('kind')
        if kind not in ('text', 'image', 'video'): return jsonify(error='无效接口类型'), 400
        profiles, _ = get_api_profiles(kind)
        settings = load_json(settings_path(), {})
        profile_id = str(body.get('profile_id') or '').strip()
        if profile_id:
            cfg = next((item for item in profiles if item['id'] == profile_id), None)
            if not cfg: return jsonify(error='接口配置不存在'), 404
        else:
            cfg = normalize_api_profile({'id': uuid.uuid4().hex})
            profiles.append(cfg)
            profile_id = cfg['id']
        if 'name' in body:
            cfg['name'] = str(body.get('name') or '').strip()
        for key in ('provider', 'base_url', 'model'):
            if key in body: cfg[key] = str(body.get(key) or '').strip().rstrip('/') if key == 'base_url' else str(body.get(key) or '').strip()
        if body.get('api_key'): cfg['api_key'] = str(body['api_key']).strip()
        cfg = normalize_api_profile(cfg)
        profiles = [cfg if item['id'] == profile_id else item for item in profiles]
        settings.setdefault('api_profiles', {})[kind] = profiles
        settings.setdefault('selected_api_profiles', {})[kind] = profile_id
        settings.setdefault('apis', {})[kind] = dict(cfg)
        save_json(settings_path(), settings)
        return jsonify(ok=True, profile=public_api_profile(cfg), selected_profile_id=profile_id)

    apis = {}
    api_profiles = {}
    selected_profiles = {}
    for kind in ('text', 'image', 'video'):
        profiles, selected = get_api_profiles(kind)
        selected_cfg = next((item for item in profiles if item['id'] == selected), {})
        apis[kind] = public_api_profile(selected_cfg)
        api_profiles[kind] = [public_api_profile(item) for item in profiles]
        selected_profiles[kind] = selected
    return jsonify(
        apis=apis, api_profiles=api_profiles, selected_api_profiles=selected_profiles,
        using_personal=use_personal_api(),
        points=load_json(users_path(), {}).get(current_user_id(), {}).get('points', 0)
    )

@app.route('/api/settings/<kind>/<profile_id>/select', methods=['POST'])
@login_required
def select_personal_api(kind, profile_id):
    if kind not in ('text', 'image', 'video'): return jsonify(error='无效接口类型'), 400
    profiles, _ = get_api_profiles(kind)
    cfg = next((item for item in profiles if item['id'] == profile_id), None)
    if not cfg: return jsonify(error='接口配置不存在'), 404
    settings = load_json(settings_path(), {})
    settings.setdefault('selected_api_profiles', {})[kind] = profile_id
    settings.setdefault('apis', {})[kind] = dict(cfg)
    save_json(settings_path(), settings)
    return jsonify(ok=True, selected_profile_id=profile_id)

@app.route('/api/settings/<kind>/<profile_id>', methods=['DELETE'])
@login_required
def delete_personal_api(kind, profile_id):
    if kind not in ('text', 'image', 'video'): return jsonify(error='无效接口类型'), 400
    profiles, selected = get_api_profiles(kind)
    if not any(item['id'] == profile_id for item in profiles): return jsonify(error='接口配置不存在'), 404
    profiles = [item for item in profiles if item['id'] != profile_id]
    if selected == profile_id:
        selected = profiles[0]['id'] if profiles else None
    settings = load_json(settings_path(), {})
    settings.setdefault('api_profiles', {})[kind] = profiles
    settings.setdefault('selected_api_profiles', {})[kind] = selected
    if selected:
        settings.setdefault('apis', {})[kind] = dict(next(item for item in profiles if item['id'] == selected))
    else:
        settings.setdefault('apis', {}).pop(kind, None)
    save_json(settings_path(), settings)
    return jsonify(ok=True, selected_profile_id=selected)

def test_personal_api(kind, profile_id=None):
    profiles, selected = get_api_profiles(kind)
    target_id = profile_id or selected
    cfg = next((item for item in profiles if item['id'] == target_id), None)
    if not cfg: return jsonify(error='接口配置不存在'), 404
    if not cfg.get('api_key') or not cfg.get('base_url') or not cfg.get('model'): return jsonify(error='请先保存完整接口配置'), 400
    try:
        headers = {'Authorization': f"Bearer {cfg['api_key']}", 'x-api-key': cfg['api_key']}
        if cfg.get('provider') == 'anthropic':
            headers['anthropic-version'] = '2023-06-01'
        base_url = ATLAS_API_BASE if cfg.get('provider') == 'atlas' else cfg['base_url']
        if kind == 'video' and cfg.get('provider') == 'minimax':
            base_url = minimax_api_root(base_url)
            r = requests.get(f"{base_url}/v2/query/video_generation/0", headers=headers, timeout=20)
            if r.status_code in (401, 403) or r.status_code >= 500 or (r.status_code == 404 and 'page not found' in r.text.lower()):
                return jsonify(error=f'连接失败：HTTP {r.status_code} {r.text[:160]}'), 502
        else:
            r = requests.get(f"{base_url}/models", headers=headers, timeout=20)
            if r.status_code not in (200, 201): return jsonify(error=f'连接失败：HTTP {r.status_code} {r.text[:160]}'), 502
        tested_at = datetime.now(timezone.utc).isoformat()
        cfg['last_test'] = tested_at
        settings = load_json(settings_path(), {})
        settings.setdefault('api_profiles', {})[kind] = [cfg if item['id'] == target_id else item for item in profiles]
        if selected == target_id:
            settings.setdefault('apis', {})[kind] = dict(cfg)
        save_json(settings_path(), settings)
        return jsonify(ok=True, message='连接成功，额度用完后将使用此接口', last_test=tested_at)
    except requests.RequestException as e:
        return jsonify(error=f'连接失败：{str(e)}'), 502

@app.route('/api/settings/<kind>/test', methods=['POST'])
@login_required
def personal_api_test(kind):
    if kind not in ('text', 'image', 'video'): return jsonify(error='无效接口类型'), 400
    return test_personal_api(kind)

@app.route('/api/settings/<kind>/<profile_id>/test', methods=['POST'])
@login_required
def personal_api_profile_test(kind, profile_id):
    if kind not in ('text', 'image', 'video'): return jsonify(error='无效接口类型'), 400
    return test_personal_api(kind, profile_id)

@app.route('/api/admin/users')
@admin_required
def admin_users():
    users = load_json(users_path(), {})
    result = []
    for user_id, user in users.items():
        history = load_json(history_path(user_id), [])
        result.append({'id': user_id, 'username': user.get('username', user_id), 'created_at': user.get('created_at', ''), 'disabled': bool(user.get('disabled')), 'is_admin': is_admin(user_id), 'history_count': len(history) if isinstance(history, list) else 0, 'permissions': user.get('model_permissions', []), 'points': user.get('points', 0)})
    result.sort(key=lambda item: item['created_at'], reverse=True)
    return jsonify(users=result, total=len(result))

@app.route('/api/admin/users/<user_id>/status', methods=['POST'])
@admin_required
def admin_user_status(user_id):
    user_id = user_id.lower()
    users = load_json(users_path(), {})
    if user_id not in users: return jsonify(error='用户不存在'), 404
    disabled = bool((request.json or {}).get('disabled'))
    if is_admin(user_id) and disabled: return jsonify(error='不能停用管理员账号'), 400
    users[user_id]['disabled'] = disabled
    save_json(users_path(), users)
    return jsonify(ok=True)

@app.route('/api/admin/personal-apis')
@admin_required
def admin_personal_apis():
    users = load_json(users_path(), {})
    rows = []
    for user_id, user in users.items():
        for kind in ('text', 'image', 'video'):
            profiles, selected = get_api_profiles(kind, user_id)
            for profile in profiles:
                rows.append({
                    'user_id': user_id,
                    'username': user.get('username', user_id),
                    'kind': kind,
                    'id': profile['id'],
                    'name': profile.get('name', ''),
                    'provider': profile.get('provider', ''),
                    'base_url': profile.get('base_url', ''),
                    'model': profile.get('model', ''),
                    'configured': bool(profile.get('api_key')),
                    'selected': profile['id'] == selected,
                    'created_at': profile.get('created_at', '')
                })
    rows.sort(key=lambda item: item.get('created_at', ''), reverse=True)
    return jsonify(profiles=rows, total=len(rows))

@app.route('/api/admin/users/<user_id>/apis/<kind>/<profile_id>', methods=['DELETE'])
@admin_required
def admin_delete_personal_api(user_id, kind, profile_id):
    user_id = user_id.lower()
    if user_id not in load_json(users_path(), {}): return jsonify(error='用户不存在'), 404
    if kind not in ('text', 'image', 'video'): return jsonify(error='无效接口类型'), 400
    profiles, selected = get_api_profiles(kind, user_id)
    if not any(item['id'] == profile_id for item in profiles): return jsonify(error='接口配置不存在'), 404
    profiles = [item for item in profiles if item['id'] != profile_id]
    if selected == profile_id:
        selected = profiles[0]['id'] if profiles else None
    path = settings_path(user_id)
    settings = load_json(path, {})
    settings.setdefault('api_profiles', {})[kind] = profiles
    settings.setdefault('selected_api_profiles', {})[kind] = selected
    if selected:
        settings.setdefault('apis', {})[kind] = dict(next(item for item in profiles if item['id'] == selected))
    else:
        settings.setdefault('apis', {}).pop(kind, None)
    save_json(path, settings)
    return jsonify(ok=True, selected_profile_id=selected)

@app.route('/api/admin/invitations', methods=['GET', 'POST'])
@admin_required
def admin_invitations():
    invitations = load_json(invitations_path(), [])
    if request.method == 'POST':
        body = request.json or {}
        permissions = [kind for kind in ('text', 'image', 'video') if kind in body.get('permissions', [])]
        code = (body.get('code') or secrets.token_hex(4)).strip().upper()
        if any(item.get('code') == code for item in invitations): return jsonify(error='邀请码已存在'), 409
        invitations.insert(0, {'code': code, 'permissions': permissions, 'points': int(body.get('points') or 0), 'max_uses': max(1, int(body.get('max_uses') or 1)), 'used': 0, 'active': True, 'created_at': datetime.now(timezone.utc).isoformat()})
        save_json(invitations_path(), invitations)
    return jsonify(invitations=invitations)

@app.route('/api/admin/invitations/<code>/status', methods=['POST'])
@admin_required
def admin_invitation_status(code):
    invitations = load_json(invitations_path(), [])
    invite = next((item for item in invitations if item.get('code') == code.upper()), None)
    if not invite: return jsonify(error='邀请码不存在'), 404
    invite['active'] = bool((request.json or {}).get('active'))
    save_json(invitations_path(), invitations)
    return jsonify(ok=True)

@app.route('/api/admin/apis')
@admin_required
def admin_apis():
    r2_fields = {
        'R2_ACCOUNT_ID': R2_ACCOUNT_ID,
        'R2_ACCESS_KEY_ID': R2_ACCESS_KEY_ID,
        'R2_SECRET_ACCESS_KEY': R2_SECRET_ACCESS_KEY,
        'R2_BUCKET': R2_BUCKET,
        'R2_PUBLIC_BASE': R2_PUBLIC_BASE,
    }
    return jsonify(apis={
        'text': {'configured': bool(ARK_API_KEY or NANO_GPT_API_KEY)},
        'image': {'configured': bool(ARK_API_KEY or NANO_GPT_API_KEY or AGNES_API_KEY)},
        'video': {'configured': bool(ARK_API_KEY or NANO_GPT_API_KEY or AGNES_API_KEY or THIRD_PARTY_API_KEY)}
    }, storage={
        'backend': active_storage_name(),
        'persistent': persistent_storage_configured(),
        'r2_configured': r2_configured(),
        'r2_missing': [key for key, value in r2_fields.items() if not value],
    })

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
        if r2_configured():
            upload_url = get_r2_client().generate_presigned_url(
                'put_object',
                Params={'Bucket': R2_BUCKET, 'Key': object_key, 'ContentType': content_type},
                ExpiresIn=3600,
            )
            return jsonify({
                'upload_url': upload_url,
                'public_url': r2_public_url(object_key),
                'object_key': object_key,
                'storage': 'r2'
            })

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
            'object_key': object_key,
            'storage': 'tos'
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

    # Upload to durable object storage
    public_url, ok = upload_to_tos(file_bytes, name, ct)
    if ok:
        return jsonify(url=public_url, name=name, storage=storage_name_for_url(public_url))

    if persistent_storage_configured():
        return jsonify(error='永久存储上传失败，请检查 R2/TOS 配置后重试'), 503

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
    cfg = get_user_api_settings()
    has_nano = bool(cfg['nano_api_key'])
    has_third = bool(cfg['third_party_api_key'] and cfg['third_party_api_base'])
    return jsonify({
        'models': ALL_MODELS + ([THIRD_PARTY_MODEL_ID] if has_third and THIRD_PARTY_MODEL_ID not in ALL_MODELS else []),
        'nano_available': has_nano, 'agnes_available': bool(AGNES_API_KEY),
        'third_party_available': has_third, 'default': 'seedance', 'caps': MODEL_CAPS
    })

@app.route('/api/image-models', methods=['GET'])
@login_required
def get_image_models():
    return jsonify({
        'models': ALL_IMAGE_MODELS,
        'ratios': IMAGE_RATIOS,
        'agnes_available': bool(AGNES_API_KEY),
        'default_model': 'gpt-image-2',
        'default_ratio': DEFAULT_RATIO
    })

# ── prompt refinement ──────────────────────────────────────────
def builtin_text_api(model_key=SCRIPT_MODEL_DEFAULT):
    model_cfg = SCRIPT_MODELS.get(model_key, SCRIPT_MODELS[SCRIPT_MODEL_DEFAULT])
    if model_cfg['provider'] == 'volcengine':
        return {'provider': 'ark', 'base_url': 'https://ark.cn-beijing.volces.com/api/v3', 'api_key': ARK_API_KEY, 'model': model_cfg['model_id']}
    return {'provider': 'nano', 'base_url': NANO_GPT_BASE, 'api_key': NANO_GPT_API_KEY, 'model': model_cfg['model_id']}

def call_platform_text(system_prompt, user_content, temperature=0.7, max_tokens=4000, cfg=None, user_id=None):
    cfg = cfg or resolve_api('text', builtin_text_api(), user_id)
    if not cfg.get('api_key'): raise Exception('文本 API 尚未配置')
    messages = [{'role': 'system', 'content': system_prompt}, {'role': 'user', 'content': user_content}]
    if cfg.get('provider') == 'ark':
        client = Ark(api_key=cfg['api_key'])
        resp = client.chat.completions.create(model=cfg['model'], messages=messages, temperature=temperature, max_tokens=max_tokens)
        return resp.choices[0].message.content.strip()
    headers = {'Content-Type': 'application/json', 'Authorization': f"Bearer {cfg['api_key']}", 'x-api-key': cfg['api_key']}
    if cfg.get('provider') == 'anthropic':
        headers['anthropic-version'] = '2023-06-01'
    payload = {'model': cfg['model'], 'messages': messages, 'temperature': temperature, 'max_tokens': max_tokens}
    r = requests.post(f"{cfg['base_url']}/chat/completions", headers=headers, json=payload, timeout=120)
    if r.status_code != 200: raise Exception(f'文本 API 调用失败: {r.status_code} {r.text[:300]}')
    return r.json()['choices'][0]['message']['content'].strip()

def refine_prompt(script, images, ratio, duration, ark_api_key=None, user_id=None):
    """Use text model to optimize the user's script into a video-ready Chinese prompt."""
    role_desc = '、'.join([img.get('role_label', '参考图') for img in images]) if images else '无参考图'

    system_prompt = (
        '你是一个专业的漫剧分镜优化师。用户会提供一段分镜描述和参考素材信息，'
        '你需要将其优化为适合 AI 视频生成模型理解的中文 prompt。\n'
        '优化规则：\n'
        '1. 描述要具体、视觉化，包含画面构图、人物动作、镜头运动、光线氛围\n'
        '2. 必须提及画幅比例和时长信息\n'
        '3. 明确区分各参考图的用途（人物/服装/场景），不得混用\n'
        '4. 保留用户原始描述中的风格要求；原文没有风格要求时，不得自行添加真人拍摄、真实摄影、动漫、漫画、3D或其他视觉风格\n'
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
        refined = call_platform_text(system_prompt, user_prompt, temperature=0.7, max_tokens=1000, user_id=user_id)
        if refined:
            return refined
    except Exception as e:
        print(f'[refine_prompt] 优化失败，使用原始脚本: {e}')
    return script  # fallback to original


# ── Nano-GPT video generation adapter ─────────────────────────
def nano_gpt_generate(job_id, model_key, script, images, audio_url, video_url, ratio, duration, host_url,
                      resolution='720p', original_script=None, optimize=False, api_key=None, user_id=None, base_url=None):
    """Generate video via Nano-GPT API. Runs in a background thread."""
    try:
        if not api_key:
            JOBS[job_id] = {'status': 'failed', 'video_url': None, 'error': 'NANO_GPT_API_KEY 未设置，请配置环境变量'}
            return

        model_real = NANO_GPT_MODELS.get(model_key, model_key)
        api_root = (base_url or NANO_GPT_BASE).rstrip('/')
        if api_root.endswith('/v1'): api_root = api_root[:-3]
        headers = {
            'x-api-key': api_key,
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
        ref_images = []
        for img in images:
            url = img.get('url', '')
            if url.startswith('/static/'):
                url = host_url + url
            if url:
                ref_images.append({'url': url, 'label': img.get('role_label', 'reference')})
        if ref_images:
            payload['reference_images'] = ref_images
            payload['image_urls'] = [img['url'] for img in ref_images]
            payload['images'] = [img['url'] for img in ref_images]
        if video_url:
            payload['reference_video'] = video_url
            payload['video_url'] = video_url

        JOBS[job_id]['status'] = 'running'
        print(f'[nano-start] model={model_key}', flush=True)

        # Submit generation task
        r = requests.post(f'{api_root}/generate-video', headers=headers, json=payload, timeout=30)
        print(f'[nano-submit] status={r.status_code} body={r.text[:200]}', flush=True)
        if r.status_code not in (200, 202):
            JOBS[job_id] = {'status': 'failed', 'video_url': None, 'error': f'Nano-GPT 提交失败: {r.status_code} {r.text[:200]}'}
            return

        data = r.json()
        task_id = data.get('runId') or data.get('id')
        if not task_id:
            JOBS[job_id] = {'status': 'failed', 'video_url': None, 'error': f'Nano-GPT 返回无 runId: {data}'}
            return

        # The submit response may include an eventsUrl, but Nano can return only
        # {"reason":"snapshot_complete"} there. Use the official status endpoint
        # as the authoritative result poller, with a legacy fallback.
        status_endpoints = [
            (f'{api_root}/video/status', {'requestId': task_id}),
            (f'{api_root}/generate-video/status', {'runId': task_id, 'model': model_real, 'modelSlug': model_real}),
        ]
        events_url_path = data.get('eventsUrl', '')
        if events_url_path and events_url_path.startswith('/'):
            events_url = f'https://nano-gpt.com{events_url_path}'
        else:
            events_url = None
        print(f'[nano-poll] status_endpoints={status_endpoints} events_url={events_url}', flush=True)
        for _ in range(240):  # 20 minutes max
            def _parse_poll_response(resp):
                try:
                    return resp.json()
                except json.JSONDecodeError:
                    pass

                # Nano may return text/event-stream from eventsUrl. Use the latest JSON data event.
                last_data = None
                for line in resp.text.splitlines():
                    line = line.strip()
                    if not line.startswith('data:'):
                        continue
                    data_text = line[5:].strip()
                    if not data_text or data_text == '[DONE]':
                        continue
                    last_data = data_text
                if last_data:
                    try:
                        return json.loads(last_data)
                    except json.JSONDecodeError:
                        return {'status': 'running', 'raw_event': last_data}
                return {'status': 'running', 'raw_text': resp.text[:1000]}

            pd = None
            last_http_error = None
            for status_url, params in status_endpoints:
                try:
                    pr = requests.get(status_url, headers=headers, params=params, timeout=30)
                except requests.RequestException as e:
                    print(f'[nano-poll] request error: {e}', flush=True)
                    last_http_error = {'request_error': str(e), 'url': status_url, 'params': params}
                    continue

                if pr.status_code in (200, 202):
                    pd = _parse_poll_response(pr)
                    if pd.get('reason') != 'snapshot_complete':
                        break
                else:
                    print(f'[nano-poll] http {pr.status_code} url={status_url} body={pr.text[:200]}', flush=True)
                    last_http_error = {'http_status': pr.status_code, 'url': status_url, 'params': params, 'body': pr.text[:500]}

            if pd is None:
                JOBS[job_id]['_last_poll'] = last_http_error or {'error': 'no poll response'}
                time.sleep(5)
                continue

            status_obj = pd.get('data') if isinstance(pd.get('data'), dict) else pd
            st = str(status_obj.get('status') or status_obj.get('state') or status_obj.get('stage') or '').lower()
            # Store raw poll response in job for frontend debugging
            JOBS[job_id]['_last_poll'] = {'status': st, 'keys': list(pd.keys()), 'raw': pd}
            sys.stdout.write(f'[nano-poll] status={st!r} keys={list(pd.keys())} raw={json.dumps(pd, ensure_ascii=False)[:500]}\n')
            sys.stdout.flush()

            # Try to find video URL anywhere in response (flat or nested)
            def _find_url(obj, depth=0):
                if depth > 8:
                    return None
                if isinstance(obj, str) and obj.startswith('http') and (
                    '.mp4' in obj.lower() or '.webm' in obj.lower() or '.mov' in obj.lower()
                ):
                    return obj
                if isinstance(obj, dict):
                    preferred_keys = (
                        'video_url', 'videoUrl', 'video', 'fileUrl', 'file_url', 'assetUrl', 'asset_url',
                        'mp4', 'output_url', 'outputUrl', 'result_url', 'resultUrl', 'download_url',
                        'downloadUrl', 'media_url', 'mediaUrl', 'url'
                    )
                    for key in preferred_keys:
                        if obj.get(key) and isinstance(obj[key], str) and obj[key].startswith('http'):
                            return obj[key]
                    for key, value in obj.items():
                        if isinstance(value, str) and value.startswith('http'):
                            key_l = str(key).lower()
                            if any(x in key_l for x in ('video', 'output', 'result', 'download', 'file', 'asset', 'media')):
                                return value
                    for v in obj.values():
                        found = _find_url(v, depth + 1)
                        if found:
                            return found
                if isinstance(obj, list):
                    for item in obj:
                        found = _find_url(item, depth + 1)
                        if found:
                            return found
                return None

            vurl = _find_url(pd)

            if st in ('completed', 'succeeded', 'done', 'success', 'complete', 'finished') or vurl:
                if vurl:
                    stored_vurl, _ = download_and_save_video(vurl)
                    save_video_history(
                        stored_vurl, script,
                        original_script=original_script or script,
                        refined_script=script if optimize else (original_script or script),
                        model=model_key, ratio=ratio, duration=duration,
                        resolution=resolution, ref_count=len(images), user_id=user_id)
                    JOBS[job_id] = {'status': 'succeeded', 'video_url': stored_vurl, 'source_video_url': vurl, 'error': None}
                    return
                else:
                    JOBS[job_id] = {'status': 'failed', 'video_url': None, 'error': f'Nano-GPT 成功但找不到视频URL，返回字段: {list(pd.keys())}，最后返回: {json.dumps(pd, ensure_ascii=False)[:500]}'}
                    return
            elif st in ('failed', 'error', 'cancelled', 'canceled'):
                err = status_obj.get('error') or status_obj.get('message') or pd.get('error') or pd.get('message') or '未知错误'
                JOBS[job_id] = {'status': 'failed', 'video_url': None, 'error': f'Nano-GPT 失败: {err}'}
                return
            time.sleep(5)

        JOBS[job_id] = {'status': 'failed', 'video_url': None, 'error': 'Nano-GPT 轮询超时（20分钟）'}

    except Exception as e:
        JOBS[job_id] = {'status': 'failed', 'video_url': None, 'error': f'Nano-GPT 异常: {str(e)}'}


# ── Third-party generic video adapter ─────────────────────────
def _find_media_url(obj, depth=0):
    if depth > 8:
        return None
    if isinstance(obj, str) and obj.startswith('http') and any(ext in obj.lower() for ext in ('.mp4', '.webm', '.mov')):
        return obj
    if isinstance(obj, dict):
        for key in ('video_url', 'videoUrl', 'output_url', 'outputUrl', 'download_url'):
            value = obj.get(key)
            if isinstance(value, str) and value.startswith('http'):
                return value
        value = obj.get('url')
        if isinstance(value, str) and value.startswith('http') and any(ext in value.lower() for ext in ('.mp4', '.webm', '.mov')):
            return value
        for value in obj.values():
            found = _find_media_url(value, depth + 1)
            if found:
                return found
    if isinstance(obj, list):
        for value in obj:
            found = _find_media_url(value, depth + 1)
            if found:
                return found
    return None


AGNES_VIDEO_SIZES = {
    '480p': {
        '16:9': (864, 480), '9:16': (480, 864), '1:1': (480, 480),
        '4:3': (640, 480), '3:4': (480, 640),
    },
    '720p': {
        '16:9': (1280, 720), '9:16': (720, 1280), '1:1': (720, 720),
        '4:3': (960, 720), '3:4': (720, 960),
    },
    '1080p': {
        '16:9': (1920, 1080), '9:16': (1080, 1920), '1:1': (1080, 1080),
        '4:3': (1440, 1080), '3:4': (1080, 1440),
    },
}

def agnes_num_frames(duration, frame_rate=24):
    """Return the closest Agnes-valid frame count (8n + 1, at most 441)."""
    target = max(1, int(duration)) * frame_rate
    frames = 8 * round((target - 1) / 8) + 1
    return min(441, max(9, frames))

def agnes_video_meta(payload, requested_ratio, requested_duration, requested_resolution):
    data = payload.get('data') if isinstance(payload, dict) and isinstance(payload.get('data'), dict) else payload
    data = data if isinstance(data, dict) else {}
    metadata = data.get('metadata') if isinstance(data.get('metadata'), dict) else {}
    mapping = metadata.get('size_mapping') if isinstance(metadata.get('size_mapping'), dict) else {}
    seconds = data.get('seconds') or metadata.get('seconds')
    try:
        actual_duration = round(float(seconds), 2)
    except (TypeError, ValueError):
        actual_duration = requested_duration
    size = data.get('size') or metadata.get('size') or mapping.get('size')
    if isinstance(size, dict):
        size = f"{size.get('width')}x{size.get('height')}" if size.get('width') and size.get('height') else None
    if not size and mapping.get('width') and mapping.get('height'):
        size = f"{mapping['width']}x{mapping['height']}"
    return {
        'ratio': mapping.get('ratio') or data.get('ratio') or requested_ratio,
        'duration': actual_duration,
        'resolution': mapping.get('resolution') or data.get('resolution') or requested_resolution,
        'size': size,
    }

def agnes_video_generate(job_id, script, ratio, duration, resolution='720p', original_script=None,
                         optimize=False, api_key=None, user_id=None, api_base=AGNES_API_BASE,
                         model_id=AGNES_VIDEO_MODEL_ID):
    """Create and poll an Agnes OpenAI-compatible video task."""
    try:
        if not api_key:
            raise Exception('AGNES_API_KEY 未设置')
        if resolution not in AGNES_VIDEO_SIZES:
            resolution = '720p'
        if ratio not in AGNES_VIDEO_SIZES[resolution]:
            ratio = '9:16'
        width, height = AGNES_VIDEO_SIZES[resolution][ratio]
        frame_rate = 24
        num_frames = agnes_num_frames(duration, frame_rate)
        headers = {'Authorization': f'Bearer {api_key}', 'Content-Type': 'application/json'}
        payload = {
            'model': model_id,
            'prompt': script,
            'width': width,
            'height': height,
            'num_frames': num_frames,
            'frame_rate': frame_rate,
        }
        api_base = api_base.rstrip('/')
        JOBS[job_id]['status'] = 'running'
        response = requests.post(f'{api_base}/videos', headers=headers, json=payload, timeout=60)
        if response.status_code not in (200, 201, 202):
            try:
                error_data = response.json()
                message = error_data.get('message') or error_data.get('error', {}).get('message') or response.text[:300]
            except (ValueError, AttributeError):
                message = response.text[:300]
            raise Exception(f'Agnes 视频提交失败: HTTP {response.status_code} {message}')

        created = response.json()
        created_data = created.get('data') if isinstance(created.get('data'), dict) else {}
        task_id = created.get('id') or created.get('task_id') or created.get('job_id') or created_data.get('id') or created_data.get('task_id')
        direct_url = _find_media_url(created)
        if direct_url:
            actual = agnes_video_meta(created, ratio, duration, resolution)
            stored_url, _ = download_and_save_video(direct_url)
            save_video_history(stored_url, script, original_script=original_script or script,
                               refined_script=script if optimize else (original_script or script),
                               model=model_id, ratio=actual['ratio'], duration=actual['duration'], resolution=actual['resolution'],
                               ref_count=0, user_id=user_id)
            JOBS[job_id] = {'status': 'succeeded', 'video_url': stored_url, 'source_video_url': direct_url,
                            'ratio': actual['ratio'], 'duration': actual['duration'],
                            'resolution': actual['resolution'], 'size': actual['size'], 'error': None}
            return
        if not task_id:
            raise Exception(f'Agnes 返回中没有任务 ID: {json.dumps(created, ensure_ascii=False)[:500]}')

        for _ in range(240):
            poll = requests.get(f'{api_base}/videos/{task_id}', headers=headers, timeout=30)
            if poll.status_code not in (200, 202):
                raise Exception(f'Agnes 视频查询失败: HTTP {poll.status_code} {poll.text[:300]}')
            result = poll.json()
            result_data = result.get('data') if isinstance(result.get('data'), dict) else result
            status = str(result_data.get('status') or result_data.get('state') or '').lower()
            video_url = _find_media_url(result)
            if video_url:
                actual = agnes_video_meta(result, ratio, duration, resolution)
                stored_url, _ = download_and_save_video(video_url)
                save_video_history(stored_url, script, original_script=original_script or script,
                                   refined_script=script if optimize else (original_script or script),
                                   model=model_id, ratio=actual['ratio'], duration=actual['duration'], resolution=actual['resolution'],
                                   ref_count=0, user_id=user_id)
                JOBS[job_id] = {'status': 'succeeded', 'video_url': stored_url, 'source_video_url': video_url,
                                'ratio': actual['ratio'], 'duration': actual['duration'],
                                'resolution': actual['resolution'], 'size': actual['size'], 'error': None}
                return
            if status in ('failed', 'error', 'cancelled', 'canceled'):
                message = result_data.get('error') or result_data.get('message') or '未知错误'
                raise Exception(f'Agnes 视频生成失败: {message}')
            time.sleep(5)
        raise Exception('Agnes 视频轮询超时（20分钟）')
    except Exception as e:
        JOBS[job_id] = {'status': 'failed', 'video_url': None, 'error': str(e)}


def minimax_video_generate(job_id, script, images, audio_url, video_url, first_frame_url, last_frame_url,
                           ratio, duration, resolution, host_url, model_id, api_key, api_base,
                           original_script=None, optimize=False, user_id=None):
    """Create and poll a MiniMax H3 V2 multimodal video task."""
    try:
        api_root = minimax_api_root(api_base)
        headers = {'Authorization': f'Bearer {api_key}', 'Content-Type': 'application/json'}
        content = [{'type': 'text', 'text': script}]
        seen_urls = set()

        def public_url(url):
            if url and url.startswith('/static/'):
                return host_url + url
            return url

        def append_image(url, role):
            url = public_url(url)
            if url and url not in seen_urls:
                content.append({'type': 'image_url', 'image_url': {'url': url}, 'role': role})
                seen_urls.add(url)

        append_image(first_frame_url, 'first_frame')
        append_image(last_frame_url, 'last_frame')
        for image in images or []:
            append_image(image.get('url'), 'reference_image')
        if video_url:
            content.append({'type': 'video_url', 'video_url': {'url': public_url(video_url)}, 'role': 'reference_video'})
        if audio_url:
            content.append({'type': 'audio_url', 'audio_url': {'url': public_url(audio_url)}, 'role': 'reference_audio'})

        minimax_resolution = '2K' if resolution in ('1080p', '1440p', '2K') else '768P'
        minimax_ratio = ratio if ratio in ('21:9', '16:9', '4:3', '1:1', '3:4', '9:16') else '16:9'
        minimax_duration = max(4, min(15, int(duration)))
        payload = {
            'model': model_id or 'MiniMax-H3',
            'content': content,
            'resolution': minimax_resolution,
            'duration': minimax_duration,
            'ratio': minimax_ratio,
        }

        JOBS[job_id]['status'] = 'running'
        response = requests.post(f'{api_root}/v2/video_generation', headers=headers, json=payload, timeout=60)
        if response.status_code not in (200, 201, 202):
            raise Exception(f'MiniMax 视频提交失败: HTTP {response.status_code} {response.text[:300]}')
        created = response.json()
        task_id = created.get('task_id') or created.get('id')
        if not task_id:
            raise Exception(f'MiniMax 返回中没有 task_id: {json.dumps(created, ensure_ascii=False)[:400]}')

        for _ in range(240):
            poll = requests.get(f'{api_root}/v2/query/video_generation/{task_id}', headers=headers, timeout=30)
            if poll.status_code not in (200, 202):
                raise Exception(f'MiniMax 视频查询失败: HTTP {poll.status_code} {poll.text[:300]}')
            result = poll.json()
            task = result.get('task') if isinstance(result.get('task'), dict) else result
            status = str(task.get('status') or '').lower()
            output_url = _find_media_url(result)
            if status == 'succeeded' or output_url:
                if not output_url:
                    raise Exception('MiniMax 任务已完成但没有返回视频地址')
                stored_url, _ = download_and_save_video(output_url)
                save_video_history(
                    stored_url, script, original_script=original_script or script,
                    refined_script=script if optimize else (original_script or script),
                    model=model_id or 'MiniMax-H3', ratio=task.get('ratio') or minimax_ratio,
                    duration=task.get('duration') or minimax_duration,
                    resolution=task.get('resolution') or minimax_resolution,
                    ref_count=len(seen_urls), user_id=user_id
                )
                JOBS[job_id] = {
                    'status': 'succeeded', 'video_url': stored_url, 'source_video_url': output_url,
                    'ratio': task.get('ratio') or minimax_ratio,
                    'duration': task.get('duration') or minimax_duration,
                    'resolution': task.get('resolution') or minimax_resolution,
                    'error': None
                }
                return
            if status in ('failed', 'cancelled', 'canceled'):
                error = task.get('error') or result.get('error') or '未知错误'
                raise Exception(f'MiniMax 视频生成失败: {error}')
            time.sleep(5)
        raise Exception('MiniMax 视频轮询超时（20分钟）')
    except Exception as e:
        JOBS[job_id] = {'status': 'failed', 'video_url': None, 'error': str(e)}


def third_party_video_adapter(job_id, script, images, audio_url, video_url, ratio, duration, host_url,
                              model_key=THIRD_PARTY_MODEL_ID, resolution='720p',
                              original_script=None, optimize=False, api_base=None, api_key=None, user_id=None):
    """Generic adapter for any third-party video generation API.
    Reads api_base and api_key from env vars. Sends prompt + refs, polls for result."""
    try:
        api_base = api_base or THIRD_PARTY_API_BASE
        api_key = api_key or THIRD_PARTY_API_KEY
        if not api_base:
            JOBS[job_id] = {'status': 'failed', 'video_url': None, 'error': 'THIRD_PARTY_API_BASE 未设置'}
            return
        if not api_key:
            JOBS[job_id] = {'status': 'failed', 'video_url': None, 'error': 'THIRD_PARTY_API_KEY 未设置'}
            return

        headers = {
            'Authorization': f'Bearer {api_key}',
            'x-api-key': api_key,
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
            'model': model_key,
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

        # Prefer the OpenAI-compatible /videos route; keep the legacy custom route as fallback.
        width, height = {'1:1': (768, 768), '9:16': (768, 1152), '16:9': (1152, 768)}.get(ratio, (768, 1152))
        openai_payload = {'model': model_key, 'prompt': script, 'width': width, 'height': height}
        r = requests.post(f'{api_base}/videos', headers=headers, json=openai_payload, timeout=30)
        status_url = None
        if r.status_code in (404, 405):
            r = requests.post(f'{api_base}/video/generate', headers=headers, json=payload, timeout=30)
            status_url = f'{api_base}/video/status/{{task_id}}'
        if r.status_code not in (200, 201, 202):
            JOBS[job_id] = {'status': 'failed', 'video_url': None, 'error': f'第三方提交失败: {r.status_code} {r.text[:200]}'}
            return

        data = r.json()
        data_body = data.get('data') if isinstance(data.get('data'), dict) else {}
        direct_url = _find_media_url(data)
        task_id = data.get('task_id') or data.get('id') or data.get('job_id') or data_body.get('task_id') or data_body.get('id')
        if direct_url:
            stored_url, _ = download_and_save_video(direct_url)
            save_video_history(stored_url, script, original_script=original_script or script,
                               refined_script=script if optimize else (original_script or script), model=model_key,
                               ratio=ratio, duration=duration, resolution=resolution, ref_count=len(images), user_id=user_id)
            JOBS[job_id] = {'status': 'succeeded', 'video_url': stored_url, 'source_video_url': direct_url, 'error': None}
            return
        if not task_id:
            JOBS[job_id] = {'status': 'failed', 'video_url': None, 'error': f'第三方返回无 task_id: {data}'}
            return
        status_url = status_url or f'{api_base}/videos/{{task_id}}'

        # Poll
        for _ in range(240):
            pr = requests.get(status_url.format(task_id=task_id), headers=headers, timeout=30)
            if pr.status_code not in (200, 202):
                JOBS[job_id] = {'status': 'failed', 'video_url': None, 'error': f'第三方查询失败: {pr.status_code}'}
                return

            pd = pr.json()
            pd_body = pd.get('data') if isinstance(pd.get('data'), dict) else pd
            status = str(pd_body.get('status') or pd_body.get('state') or '').lower()
            vurl = _find_media_url(pd)
            if status in ('completed', 'succeeded', 'done', 'success', 'finished') or vurl:
                if not vurl:
                    JOBS[job_id] = {'status': 'failed', 'video_url': None, 'error': '第三方完成但无 video_url'}
                    return
                stored_url, _ = download_and_save_video(vurl)
                save_video_history(
                    stored_url, script,
                    original_script=original_script or script,
                    refined_script=script if optimize else (original_script or script),
                    model=model_key,
                    ratio=ratio,
                    duration=duration,
                    resolution=resolution,
                    ref_count=len(images),
                    user_id=user_id
                )
                JOBS[job_id] = {'status': 'succeeded', 'video_url': stored_url, 'source_video_url': vurl, 'error': None}
                return
            elif status in ('failed', 'error', 'cancelled'):
                err = pd.get('error') or pd.get('message', '未知错误')
                JOBS[job_id] = {'status': 'failed', 'video_url': None, 'error': f'第三方生成失败: {err}'}
                return
            else:
                time.sleep(5)
        JOBS[job_id] = {'status': 'failed', 'video_url': None, 'error': '第三方视频轮询超时（20分钟）'}

    except Exception as e:
        JOBS[job_id] = {'status': 'failed', 'video_url': None, 'error': f'第三方异常: {str(e)}'}


def atlas_output_url(payload):
    if isinstance(payload, str) and payload.startswith('http'):
        return payload
    if isinstance(payload, list):
        for item in payload:
            found = atlas_output_url(item)
            if found:
                return found
    if isinstance(payload, dict):
        for key in ('outputs', 'output', 'url', 'image_url', 'video_url'):
            found = atlas_output_url(payload.get(key))
            if found:
                return found
    return None


def atlas_generate_media(kind, payload, api_key, api_base=None):
    """Submit an Atlas Cloud image/video task and return its output URL."""
    api_root = ATLAS_API_BASE if 'api.atlascloud.ai' in (api_base or '').lower() else (api_base or ATLAS_API_BASE).rstrip('/')
    headers = {'Authorization': f'Bearer {api_key}', 'Content-Type': 'application/json'}
    endpoint = 'generateImage' if kind == 'image' else 'generateVideo'
    response = requests.post(f'{api_root}/model/{endpoint}', headers=headers, json=payload, timeout=60)
    if kind == 'image' and response.status_code in (404, 405):
        response = requests.post(f'{api_root}/model/generateVideo', headers=headers, json=payload, timeout=60)
    if response.status_code not in (200, 201, 202):
        raise Exception(f'Atlas Cloud 提交失败: HTTP {response.status_code} {response.text[:300]}')

    created = response.json()
    created_data = created.get('data') if isinstance(created, dict) and isinstance(created.get('data'), dict) else created
    created_data = created_data if isinstance(created_data, dict) else {}
    direct_url = atlas_output_url(created_data.get('outputs'))
    if direct_url:
        return direct_url
    task_id = created_data.get('id') or created_data.get('task_id')
    if not task_id:
        raise Exception(f'Atlas Cloud 返回中没有任务 ID: {json.dumps(created, ensure_ascii=False)[:400]}')

    interval = 2 if kind == 'image' else 5
    attempts = 180 if kind == 'image' else 240
    status_paths = ('prediction', 'result')
    for _ in range(attempts):
        result = None
        for status_path in status_paths:
            poll = requests.get(f'{api_root}/model/{status_path}/{task_id}', headers=headers, timeout=30)
            if poll.status_code in (404, 405):
                continue
            if poll.status_code not in (200, 202):
                raise Exception(f'Atlas Cloud 查询失败: HTTP {poll.status_code} {poll.text[:240]}')
            result = poll.json()
            break
        if result is None:
            raise Exception('Atlas Cloud 查询接口不可用')
        result_data = result.get('data') if isinstance(result, dict) and isinstance(result.get('data'), dict) else result
        result_data = result_data if isinstance(result_data, dict) else {}
        status = str(result_data.get('status') or result_data.get('state') or '').lower()
        output_url = atlas_output_url(result_data.get('outputs') or result_data.get('output'))
        if output_url:
            return output_url
        if status in ('failed', 'error', 'cancelled', 'canceled', 'timeout'):
            error = result_data.get('error') or result_data.get('message') or '未知错误'
            raise Exception(f'Atlas Cloud 生成失败: {error}')
        if status in ('completed', 'succeeded', 'done', 'success', 'finished'):
            raise Exception('Atlas Cloud 任务完成但没有返回媒体地址')
        time.sleep(interval)
    raise Exception(f'Atlas Cloud {"图片" if kind == "image" else "视频"}生成超时')


ATLAS_IMAGE_SIZES = {
    '1:1': '2048*2048', '4:3': '2304*1728', '3:4': '1728*2304',
    '16:9': '2720*1530', '9:16': '1530*2720',
    '3:2': '2496*1664', '2:3': '1664*2496',
    '5:4': '2304*1728', '4:5': '1728*2304',
}


def atlas_image_generate(prompt, model_id, ratio, custom_size, api_key, api_base, input_images, host_url):
    references = []
    for image in input_images or []:
        url = image.get('url', '')
        if url.startswith('/static/'):
            url = host_url + url
        if url:
            references.append(url)

    model = model_id
    if references and model.endswith('/text-to-image'):
        model = model.rsplit('/', 1)[0] + '/edit'
    elif not references and model.endswith('/edit'):
        model = model.rsplit('/', 1)[0] + '/text-to-image'

    size = custom_size.replace('x', '*').replace('X', '*') if ratio == 'custom' and custom_size else ATLAS_IMAGE_SIZES.get(ratio)
    payload = {'model': model, 'prompt': prompt, 'output_format': 'png'}
    if size:
        payload['size'] = size
    if references:
        payload['images'] = references[:10]
    output_url = atlas_generate_media('image', payload, api_key, api_base)
    return download_and_save_image(output_url)


def atlas_video_generate(job_id, script, images, audio_url, video_url, ratio, duration, resolution,
                         host_url, model_id, api_key, api_base, original_script, optimize, user_id):
    try:
        reference_images = []
        for image in images or []:
            url = image.get('url', '')
            if url.startswith('/static/'):
                url = host_url + url
            if url:
                reference_images.append(url)
        reference_videos = []
        if video_url:
            reference_videos.append(host_url + video_url if video_url.startswith('/static/') else video_url)
        reference_audios = []
        if audio_url:
            reference_audios.append(host_url + audio_url if audio_url.startswith('/static/') else audio_url)

        has_references = bool(reference_images or reference_videos or reference_audios)
        model = model_id
        if has_references and model.endswith('/text-to-video'):
            model = model.rsplit('/', 1)[0] + '/reference-to-video'
        elif not has_references and model.endswith('/reference-to-video'):
            model = model.rsplit('/', 1)[0] + '/text-to-video'

        atlas_resolution = {
            '480p': '480p', '720p': '720p', '768p': '720p',
            '1080p': '1080p-SR', '1440p': '1440p-SR',
        }.get(resolution, '720p')
        atlas_ratio = ratio if ratio in ('16:9', '4:3', '1:1', '3:4', '9:16', '21:9', 'adaptive') else 'adaptive'
        atlas_duration = max(4, min(15, int(duration)))
        payload = {
            'model': model,
            'prompt': script,
            'duration': atlas_duration,
            'resolution': atlas_resolution,
            'ratio': atlas_ratio,
            'generate_audio': True,
            'watermark': False,
        }
        if reference_images:
            payload['reference_images'] = reference_images[:9]
        if reference_videos:
            payload['reference_videos'] = reference_videos[:3]
        if reference_audios and (reference_images or reference_videos):
            payload['reference_audios'] = reference_audios[:3]

        JOBS[job_id]['status'] = 'running'
        output_url = atlas_generate_media('video', payload, api_key, api_base)
        stored_url, _ = download_and_save_video(output_url)
        save_video_history(
            stored_url, script, original_script=original_script or script,
            refined_script=script if optimize else (original_script or script),
            model=model, ratio=atlas_ratio, duration=atlas_duration, resolution=atlas_resolution,
            ref_count=len(reference_images), user_id=user_id
        )
        JOBS[job_id] = {
            'status': 'succeeded', 'video_url': stored_url, 'source_video_url': output_url,
            'ratio': atlas_ratio, 'duration': atlas_duration, 'resolution': atlas_resolution, 'error': None
        }
    except Exception as e:
        print(f'[atlas-video] failed: {e}', flush=True)
        JOBS[job_id] = {'status': 'failed', 'video_url': None, 'error': str(e)}


# ── Image generation helpers ──────────────────────────────────
def download_and_save_image(image_url):
    """Download image from URL and keep it in durable storage when configured."""
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

    # Try durable object storage
    public_url, ok = upload_to_tos(img_bytes, name, ct)
    if ok:
        return public_url, name

    if persistent_storage_configured():
        raise Exception('图片生成成功，但永久存储上传失败；未保存到临时磁盘，请检查 R2/TOS 配置后重试')

    # Fallback to local
    path = os.path.join(UPLOAD, name)
    with open(path, 'wb') as f:
        f.write(img_bytes)
    return f'/static/uploads/{name}', name


def download_and_save_video(video_url):
    """Download a remote generated video, upload it to object storage, fallback to original URL."""
    if not video_url or not video_url.startswith('http'):
        return video_url, None
    if is_persistent_storage_url(video_url):
        return video_url, os.path.basename(video_url.split('?', 1)[0])

    headers = {'User-Agent': 'Mozilla/5.0'}
    try:
        r = requests.get(video_url, headers=headers, timeout=180, stream=True)
        if r.status_code != 200:
            print(f'[video-cache] download failed: {r.status_code} {r.text[:120]}', flush=True)
            return video_url, None

        ct = r.headers.get('Content-Type', 'video/mp4').split(';', 1)[0] or 'video/mp4'
        ext = '.mp4'
        if 'webm' in ct:
            ext = '.webm'
        elif 'quicktime' in ct or 'mov' in ct:
            ext = '.mov'
        name = f"{uuid.uuid4().hex}{ext}"
        content_length = r.headers.get('Content-Length')
        content_length = int(content_length) if content_length and content_length.isdigit() else None

        if content_length:
            public_url, ok = upload_to_tos(r.raw, name, ct, content_length=content_length)
        else:
            public_url, ok = upload_to_tos(r.content, name, ct)
        if ok:
            print(f'[video-cache] cached to TOS: {public_url}', flush=True)
            return public_url, name
    except Exception as e:
        print(f'[video-cache] failed: {e}', flush=True)

    return video_url, None


def build_image_content(prompt, input_images, host_url):
    """Build Ark image generation content list."""
    content = [{'type': 'text', 'text': prompt}]
    for img in (input_images or []):
        url = img['url']
        if url.startswith('/static/'):
            url = host_url + url
        content.append({'type': 'image_url', 'image_url': {'url': url}})
    return content


def parse_image_size(size):
    try:
        w, h = size.lower().split('x', 1)
        return int(w), int(h)
    except Exception:
        return None, None


def image_size_for_nano(model_id, ratio, custom_size=''):
    if ratio == 'custom' and custom_size:
        return custom_size
    if model_id == AGNES_IMAGE_MODEL_ID:
        return RATIO_TO_SIZE_AGNES.get(ratio, "1024x1024")
    if model_id == 'gpt-image-2':
        return RATIO_TO_SIZE_GPT_IMAGE.get(ratio, "1024x1024")
    return RATIO_TO_SIZE_NANO.get(ratio, "1024x1024")


def image_ratio_instruction(ratio, size):
    if ratio == 'custom' and size:
        return f"【画幅强制】最终图片必须严格输出为 {size} 像素，不要输出 1:1 正方形。"
    if ratio and ratio != "1:1":
        return f"【画幅强制】最终图片必须严格输出为 {ratio} 画幅，不要输出 1:1 正方形，不要自动裁成方图。"
    return "【画幅强制】最终图片使用 1:1 正方形画幅。"


# ── Nano image generation ─────────────────────────────────────
def nano_image_generate(prompt, model_id, ratio, custom_size='', api_key=None, base_url=None,
                        input_images=None, host_url=''):
    """Call Nano-GPT images/generations API."""
    size = image_size_for_nano(model_id, ratio, custom_size)
    width, height = parse_image_size(size)
    final_prompt = image_ratio_instruction(ratio, size) + "\n" + prompt
    headers = {
        'Content-Type': 'application/json',
        'x-api-key': api_key or NANO_GPT_API_KEY,
        'Authorization': f'Bearer {api_key or NANO_GPT_API_KEY}'
    }
    payload = {
        'model': model_id,
        'prompt': final_prompt,
        'size': size,
        'dimensions': size
    }
    if ratio != 'custom':
        payload['aspect_ratio'] = ratio
    if width and height:
        payload['width'] = width
        payload['height'] = height
    reference_urls = []
    for img in (input_images or []):
        url = img.get('url', '')
        if url.startswith('/static/'):
            url = host_url + url
        if url:
            reference_urls.append(url)
    if reference_urls:
        payload['image'] = reference_urls[0] if len(reference_urls) == 1 else reference_urls
    r = requests.post(f'{(base_url or NANO_GPT_BASE).rstrip("/")}/images/generations', headers=headers, json=payload, timeout=120)
    if r.status_code not in (200, 201):
        raise Exception(f'图片 API 生成失败: {r.status_code} {r.text[:200]}')
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
            if persistent_storage_configured():
                raise Exception('图片生成成功，但永久存储上传失败；请检查 R2/TOS 配置后重试')
            path = os.path.join(UPLOAD, name)
            with open(path, 'wb') as f:
                f.write(img_bytes)
            return f'/static/uploads/{name}', name
    raise Exception(f'图片 API 返回无图片: {str(data)[:200]}')


# ── Volc Seedream image generation ────────────────────────────
def volc_image_generate(prompt, input_images, host_url, ratio, custom_size='', api_key=None, model_id=None):
    """Call Volc Ark Seedream for image generation."""
    if ratio == 'custom' and custom_size:
        size = custom_size
    else:
        size = RATIO_TO_SIZE_VOLC.get(ratio, "1920x1920")
    client = Ark(api_key=api_key or ARK_API_KEY)
    ref_urls = []
    for img in (input_images or []):
        url = img['url']
        if url.startswith('/static/'):
            url = host_url + url
        ref_urls.append(url)
    kwargs = {'model': model_id or VOLC_IMAGE_MODEL_ID, 'prompt': prompt, 'size': size, 'watermark': False}
    if ref_urls:
        kwargs['image'] = ref_urls[0] if len(ref_urls) == 1 else ref_urls
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
@model_access_required('image')
def generate_image():
    body = request.json or {}
    prompt = body.get('prompt', '').strip()
    selected_model = body.get('image_model', 'gpt-image-2')
    force_personal = bool(body.get('use_personal_api')) or selected_model == 'personal-api'
    if selected_model == AGNES_IMAGE_MODEL_ID:
        builtin = {'provider': 'agnes', 'base_url': AGNES_API_BASE, 'api_key': AGNES_API_KEY, 'model': AGNES_IMAGE_MODEL_ID}
    elif selected_model in NANO_GPT_IMAGE_MODELS:
        builtin = {'provider': 'nano', 'base_url': NANO_GPT_BASE, 'api_key': NANO_GPT_API_KEY, 'model': selected_model}
    else:
        builtin = {'provider': 'ark', 'base_url': 'https://ark.cn-beijing.volces.com/api/v3', 'api_key': ARK_API_KEY, 'model': VOLC_IMAGE_MODEL_ID}
    ratio = body.get('ratio', DEFAULT_RATIO)
    custom_size = body.get('custom_size', '')
    mode = body.get('mode', 'storyboard')
    input_images = body.get('input_images') or []
    style_id = body.get('style_id')
    host_url = request.host_url.rstrip('/')
    user_id = current_user_id()

    if not prompt:
        return jsonify(error='prompt 不能为空'), 400
    try:
        image_cfg = resolve_api(
            'image', builtin, user_id, force_personal=force_personal,
            profile_id=body.get('api_profile_id'),
            strict_builtin='use_personal_api' in body and not force_personal
        )
    except QuotaError as e:
        return jsonify(error=str(e)), 402
    image_model = image_cfg['model']

    # Inject style
    if style_id:
        styles, changed = ensure_default_styles(load_json(styles_path(), []))
        if changed:
            save_json(styles_path(), styles)
        style = next((s for s in styles if s.get('id') == style_id), None)
        if style:
            prompt = style.get('prompt', '') + '\n' + prompt
            if style.get('negative_prompt'):
                prompt += '\n\n避免：' + style.get('negative_prompt', '')
            if style.get('thumbnail_url'):
                input_images.append({'url': style['thumbnail_url'], 'role_label': '风格参考'})

    job_id = uuid.uuid4().hex
    JOB_OWNERS[job_id] = user_id
    JOBS[job_id] = {'status': 'pending', 'url': None, 'name': None, 'error': None,
                     'model': image_model, 'ratio': ratio, 'mode': mode}

    def run():
        try:
            if image_cfg.get('provider') == 'atlas':
                local_url, filename = atlas_image_generate(
                    prompt, image_model, ratio, custom_size,
                    image_cfg['api_key'], image_cfg['base_url'], input_images, host_url
                )
            elif image_cfg.get('provider') != 'ark':
                local_url, filename = nano_image_generate(
                    prompt, image_model, ratio, custom_size,
                    image_cfg['api_key'], image_cfg['base_url'], input_images, host_url
                )
            elif image_cfg.get('provider') == 'ark':
                local_url, filename = volc_image_generate(prompt, input_images, host_url, ratio, custom_size, image_cfg['api_key'], image_model)
            else:
                JOBS[job_id] = {'status': 'failed', 'url': None, 'error': f'不支持的图片模型: {image_model}'}
                return

            insert_history({
                'time': datetime.now().strftime('%Y-%m-%d %H:%M'),
                'type': 'image',
                'image_url': local_url,
                'script': prompt[:80],
                'original_script': prompt,
                'model': image_model,
                'ratio': ratio
            }, user_id=user_id)
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
    if JOB_OWNERS.get(job_id) != current_user_id():
        return jsonify(status='not_found'), 404
    return jsonify(JOBS.get(job_id, {'status': 'not_found'}))


# ── generate ──────────────────────────────────────────────────
@app.route('/api/generate', methods=['POST'])
@login_required
@model_access_required('video')
def generate():
    body      = request.json or {}
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
    selected_model = body.get('video_model', 'seedance')
    force_personal = bool(body.get('use_personal_api')) or selected_model == 'personal-api'
    if selected_model == AGNES_VIDEO_MODEL_ID:
        builtin = {'provider': 'agnes', 'base_url': AGNES_API_BASE, 'api_key': AGNES_API_KEY, 'model': AGNES_VIDEO_MODEL_ID}
    elif selected_model in NANO_GPT_NAMES:
        builtin = {'provider': 'nano', 'base_url': NANO_GPT_BASE, 'api_key': NANO_GPT_API_KEY, 'model': selected_model}
    elif selected_model == THIRD_PARTY_MODEL_ID:
        builtin = {'provider': 'generic', 'base_url': THIRD_PARTY_API_BASE.rstrip('/'), 'api_key': THIRD_PARTY_API_KEY, 'model': selected_model}
    else:
        builtin = {'provider': 'ark', 'base_url': 'https://ark.cn-beijing.volces.com/api/v3', 'api_key': ARK_API_KEY, 'model': MODEL_ID}
    host_url    = request.host_url.rstrip('/')
    job_id      = uuid.uuid4().hex
    user_id     = current_user_id()
    try:
        video_cfg = resolve_api(
            'video', builtin, user_id, force_personal=force_personal,
            profile_id=body.get('api_profile_id'),
            strict_builtin='use_personal_api' in body and not force_personal
        )
    except QuotaError as e:
        return jsonify(error=str(e)), 402
    video_model = video_cfg['model']
    if video_cfg.get('provider') == 'agnes':
        agnes_caps = MODEL_CAPS[AGNES_VIDEO_MODEL_ID]
        if ratio not in agnes_caps['ratios']:
            return jsonify(error=f'Agnes Video v2.0 不支持比例 {ratio}'), 400
        if resolution not in agnes_caps['resolutions']:
            return jsonify(error=f'Agnes Video v2.0 不支持分辨率 {resolution}'), 400
        if duration < agnes_caps['min_duration'] or duration > agnes_caps['max_duration']:
            return jsonify(error=f"Agnes Video v2.0 时长仅支持 {agnes_caps['min_duration']}-{agnes_caps['max_duration']} 秒"), 400
    JOB_OWNERS[job_id] = user_id
    JOBS[job_id] = {'status': 'pending', 'video_url': None, 'error': None}

    # Inject style
    if style_id:
        styles, changed = ensure_default_styles(load_json(styles_path(), []))
        if changed:
            save_json(styles_path(), styles)
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
        script = refine_prompt(script, images, ratio, duration, user_id=user_id)

    # ── Atlas Cloud path ──
    if video_cfg.get('provider') == 'atlas':
        threading.Thread(target=atlas_video_generate, args=(
            job_id, script, images, audio_url, video_url, ratio, duration, resolution,
            host_url, video_model, video_cfg['api_key'], video_cfg['base_url'],
            original_script, optimize, user_id
        ), daemon=True).start()
        return jsonify(job_id=job_id)

    # ── Agnes path ──
    if video_cfg.get('provider') == 'agnes':
        threading.Thread(target=agnes_video_generate, args=(
            job_id, script, ratio, duration, resolution, original_script, optimize,
            video_cfg['api_key'], user_id, video_cfg['base_url'], video_model
        ), daemon=True).start()
        return jsonify(job_id=job_id)

    # ── Nano-GPT path ──
    if video_cfg.get('provider') == 'nano':
        if not video_cfg.get('api_key'):
            JOBS[job_id] = {'status': 'failed', 'video_url': None,
                            'error': 'NANO_GPT_API_KEY 未设置。请 export NANO_GPT_API_KEY=sk-nano-xxx 后重启服务'}
            return jsonify(job_id=job_id)
        threading.Thread(target=nano_gpt_generate, args=(
            job_id, video_model, script, images, audio_url, video_url, ratio, duration, host_url,
            resolution, original_script, optimize, video_cfg['api_key'], user_id, video_cfg['base_url']
        ), daemon=True).start()
        return jsonify(job_id=job_id)

    # ── MiniMax H3 path ──
    if video_cfg.get('provider') == 'minimax':
        threading.Thread(target=minimax_video_generate, args=(
            job_id, script, images, audio_url, video_url, first_frame_url, last_frame_url,
            ratio, duration, resolution, host_url, video_model, video_cfg['api_key'],
            video_cfg['base_url'], original_script, optimize, user_id
        ), daemon=True).start()
        return jsonify(job_id=job_id)

    # ── Third-party path ──
    if video_cfg.get('provider') not in ('nano', 'agnes', 'ark'):
        if not video_cfg.get('api_key') or not video_cfg.get('base_url'):
            JOBS[job_id] = {'status': 'failed', 'video_url': None,
                            'error': '第三方模型未配置。请设置 THIRD_PARTY_API_BASE 和 THIRD_PARTY_API_KEY 环境变量后重启服务'}
            return jsonify(job_id=job_id)
        threading.Thread(target=third_party_video_adapter, args=(
            job_id, script, images, audio_url, video_url, ratio, duration, host_url,
            video_model, resolution, original_script, optimize,
            video_cfg['base_url'], video_cfg['api_key'], user_id
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

            client = Ark(api_key=video_cfg['api_key'])
            JOBS[job_id]['status'] = 'running'
            res = client.content_generation.tasks.create(
                model=video_model, content=content,
                generate_audio=True, ratio=ratio, duration=duration, watermark=False)
            task_id = res.id

            while True:
                r = client.content_generation.tasks.get(task_id=task_id)
                if r.status == 'succeeded':
                    vurl = r.content.video_url
                    stored_vurl, _ = download_and_save_video(vurl)
                    save_video_history(
                        stored_vurl, script,
                        original_script=original_script,
                        refined_script=script if optimize else original_script,
                        model=video_model,
                        ratio=ratio,
                        duration=duration,
                        resolution=resolution,
                        ref_count=len(images),
                        user_id=user_id
                    )
                    JOBS[job_id] = {'status':'succeeded','video_url':stored_vurl,'source_video_url':vurl,'error':None}
                    break
                elif r.status == 'failed':
                    JOBS[job_id] = {'status':'failed','video_url':None,'error':str(r.error)}
                    break
                else:
                    time.sleep(5)
        except Exception as e:
            JOBS[job_id] = {'status':'failed','video_url':None,'error':str(e)}

    threading.Thread(target=run, daemon=True).start()
    return jsonify(job_id=job_id)

@app.route('/api/status/<job_id>')
@login_required
def status(job_id):
    if JOB_OWNERS.get(job_id) != current_user_id():
        return jsonify(status='not_found'), 404
    job = JOBS.get(job_id, {'status': 'not_found'})
    return jsonify(job)

@app.route('/api/model-caps')
@login_required
def model_caps():
    return jsonify(MODEL_CAPS)

# ── Styles CRUD ───────────────────────────────────────────────
@app.route('/api/styles', methods=['GET'])
@login_required
def get_styles():
    styles, changed = ensure_default_styles(load_json(styles_path(), []))
    if changed:
        save_json(styles_path(), styles)
    return jsonify(styles)

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

    import shutil, subprocess
    if not shutil.which('ffmpeg') or not shutil.which('ffprobe'):
        return jsonify(error='未检测到 ffmpeg/ffprobe，无法截帧。Railway 需要重新部署包含 ffmpeg 的版本。'), 500

    if video_url.startswith('/'):
        video_url = request.host_url.rstrip('/') + video_url

    name = uuid.uuid4().hex + '.png'
    out_path = os.path.join(UPLOAD, name)
    tmp_dir = os.path.join(BASE, 'tmp_frames')
    os.makedirs(tmp_dir, exist_ok=True)
    tmp_input = os.path.join(tmp_dir, uuid.uuid4().hex + '.mp4')

    try:
        r = requests.get(video_url, timeout=180, stream=True, headers={'User-Agent': 'Mozilla/5.0'})
        if r.status_code != 200:
            return jsonify(error=f'下载视频失败: {r.status_code}'), 500
        with open(tmp_input, 'wb') as f:
            for chunk in r.iter_content(8192):
                if chunk:
                    f.write(chunk)

        # Use ffmpeg to extract frame
        if position == 'last':
            # Get video duration first, extract from near end
            probe = subprocess.run(['ffprobe', '-v', 'quiet', '-print_format', 'json',
                                    '-show_format', tmp_input],
                                    capture_output=True, text=True, timeout=30)
            duration = 5
            if probe.returncode == 0:
                import json as _json
                info = _json.loads(probe.stdout)
                duration = float(info.get('format', {}).get('duration', 5))
            seek_time = max(0, duration - 2)
            result = subprocess.run(['ffmpeg', '-y', '-ss', str(seek_time), '-i', tmp_input,
                                     '-vframes', '1', '-q:v', '2', out_path],
                                    capture_output=True, text=True, timeout=60)
        else:
            result = subprocess.run(['ffmpeg', '-y', '-i', tmp_input, '-vframes', '1',
                                     '-q:v', '2', out_path],
                                    capture_output=True, text=True, timeout=60)

        if result.returncode != 0:
            err = result.stderr[-500:] if result.stderr else '无输出'
            return jsonify(error=f'截帧失败: {err}'), 500

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
    finally:
        try:
            if os.path.exists(tmp_input):
                os.remove(tmp_input)
        except Exception:
            pass


def run_upscale_job(job_id, video_url, ratio):
    import subprocess, shutil
    JOBS[job_id] = {'status': 'running', 'url': None, 'error': None, 'progress': '检查 ffmpeg'}

    # Check ffmpeg
    if not shutil.which('ffmpeg') or not shutil.which('ffprobe'):
        JOBS[job_id] = {
            'status': 'failed',
            'url': None,
            'error': '未检测到 ffmpeg/ffprobe。Railway 需要部署包含 ffmpeg 的 nixpacks.toml；本机需要先安装 ffmpeg。'
        }
        return

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
        JOBS[job_id]['progress'] = '下载原视频'
        r = requests.get(video_url, timeout=180, stream=True, headers={'User-Agent': 'Mozilla/5.0'})
        if r.status_code != 200:
            JOBS[job_id] = {'status': 'failed', 'url': None, 'error': f'下载视频失败: {r.status_code}'}
            return
        ct = r.headers.get('Content-Type', '')
        total = 0
        with open(tmp_input, 'wb') as f:
            for chunk in r.iter_content(8192):
                if not chunk:
                    continue
                f.write(chunk)
                total += len(chunk)
        if total < 1024:
            JOBS[job_id] = {'status': 'failed', 'url': None, 'error': f'下载的视频太小（{total}字节，Content-Type: {ct}），链接可能已过期'}
            return
        if 'html' in ct.lower() or (total < 1000 and not ct.startswith('video/')):
            JOBS[job_id] = {'status': 'failed', 'url': None, 'error': f'视频链接无效（{total}字节，Content-Type: {ct}），可能是HTML页面'}
            return

        # ffmpeg: lanczos scale + unsharp sharpen + re-encode h264
        JOBS[job_id]['progress'] = 'ffmpeg 转码到 1080p'
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
            err = result.stderr[-500:] if result.stderr else '无输出'
            JOBS[job_id] = {'status': 'failed', 'url': None, 'error': f'ffmpeg 处理失败: {err}'}
            return

        # Upload to TOS
        JOBS[job_id]['progress'] = '上传 1080p 视频'
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

        JOBS[job_id] = {
            'status': 'succeeded',
            'url': out_url,
            'width': tw,
            'height': th,
            'ratio': ratio,
            'target': '1080p',
            'error': None
        }

    except Exception as e:
        JOBS[job_id] = {'status': 'failed', 'url': None, 'error': str(e)}
    finally:
        import shutil as _shutil
        for f in [tmp_input, tmp_output]:
            try: os.remove(f)
            except: pass
        try: _shutil.rmtree(tmp_dir, ignore_errors=True)
        except: pass


# ── Local upscale to 1080p ───────────────────────────────────
@app.route('/api/upscale-local', methods=['POST'])
@login_required
def upscale_local():
    body = request.json
    video_url = body.get('video_url', '')
    ratio = body.get('ratio', '9:16')
    if not video_url:
        return jsonify(error='video_url required'), 400
    if video_url.startswith('/'):
        video_url = request.host_url.rstrip('/') + video_url

    job_id = uuid.uuid4().hex
    JOB_OWNERS[job_id] = current_user_id()
    JOBS[job_id] = {'status': 'pending', 'url': None, 'error': None}
    threading.Thread(target=run_upscale_job, args=(job_id, video_url, ratio), daemon=True).start()
    return jsonify(job_id=job_id)


@app.route('/api/upscale-status/<job_id>')
@login_required
def upscale_status(job_id):
    if JOB_OWNERS.get(job_id) != current_user_id():
        return jsonify(status='not_found'), 404
    return jsonify(JOBS.get(job_id, {'status': 'not_found'}))


# ── Script text model helper ─────────────────────────────────
def call_script_text_model(model_key, system_prompt, user_content, temperature=0.7, max_tokens=4000, api_cfg=None):
    """Use the built-in text model while points remain, otherwise the user's API."""
    cfg = api_cfg or resolve_api('text', builtin_text_api(model_key))
    return call_platform_text(system_prompt, user_content, temperature=temperature, max_tokens=max_tokens, cfg=cfg)


def _extract_json_array(text):
    raw = (text or '').strip()
    if raw.startswith('```'):
        raw = raw.split('\n', 1)[1] if '\n' in raw else raw
    if raw.endswith('```'):
        raw = raw.rsplit('\n', 1)[0]
    start = raw.find('[')
    end = raw.rfind(']')
    if start >= 0 and end > start:
        raw = raw[start:end + 1]
    return raw.strip()


def parse_script_shots_json(raw, script_model, api_cfg=None):
    candidate = _extract_json_array(raw)
    try:
        shots = json.loads(candidate)
    except json.JSONDecodeError:
        repair_prompt = (
            '你是 JSON 修复器。用户会给你一段本应为 JSON 数组的文本，'
            '请只修复语法错误，保留原字段和中文内容，不要改写剧情。'
            '只输出合法 JSON 数组，不要 Markdown，不要解释。'
        )
        fixed = call_script_text_model(script_model, repair_prompt, raw, temperature=0, max_tokens=4000, api_cfg=api_cfg)
        shots = json.loads(_extract_json_array(fixed))
    if not isinstance(shots, list):
        raise ValueError('模型输出不是 JSON 数组')
    return shots


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
@model_access_required('text')
def script_brainstorm():
    body = request.json or {}
    topic = body.get('topic', '').strip()
    script_model = body.get('script_model', SCRIPT_MODEL_DEFAULT)
    force_personal = bool(body.get('use_personal_api')) or script_model == 'personal-api'
    if not topic:
        return jsonify(error='请输入主题或关键词'), 400

    style_rule = script_style_rule(body.get('style_id'), target='script', user_id=current_user_id())
    system_prompt = (
        '你是一个专业的短剧编剧。根据用户提供的主题或关键词，'
        '创作一个1-2分钟的短剧片段。输出格式：\n'
        '【场景】xxx\n'
        '【人物】xxx\n'
        '【剧情】xxx\n\n'
        '直接输出剧本文本，不要markdown格式，不要角色列表。\n'
        + style_rule
    )
    try:
        api_cfg = resolve_api(
            'text', builtin_text_api(SCRIPT_MODEL_DEFAULT if force_personal else script_model),
            current_user_id(), force_personal=force_personal,
            profile_id=body.get('api_profile_id'),
            strict_builtin='use_personal_api' in body and not force_personal
        )
        text = call_script_text_model(script_model, system_prompt, topic, temperature=0.8, max_tokens=2000, api_cfg=api_cfg)
        return jsonify(text=text)
    except QuotaError as e:
        return jsonify(error=str(e)), 402
    except Exception as e:
        return jsonify(error=f'生成失败: {str(e)}'), 500


@app.route('/api/script/split', methods=['POST'])
@login_required
@model_access_required('text')
def script_split():
    body = request.json or {}
    script_text = body.get('script', '').strip()
    if not script_text:
        return jsonify(error='请输入剧本文本'), 400

    job_id = uuid.uuid4().hex
    user_id = current_user_id()
    script_model = body.get('script_model', SCRIPT_MODEL_DEFAULT)
    force_personal = bool(body.get('use_personal_api')) or script_model == 'personal-api'
    try:
        api_cfg = resolve_api(
            'text', builtin_text_api(SCRIPT_MODEL_DEFAULT if force_personal else script_model),
            user_id, force_personal=force_personal, profile_id=body.get('api_profile_id'),
            strict_builtin='use_personal_api' in body and not force_personal
        )
    except QuotaError as e:
        return jsonify(error=str(e)), 402
    JOB_OWNERS[job_id] = user_id
    SCRIPT_JOBS[job_id] = {
        'status': 'running',
        'created_at': time.time()
    }

    def worker():
        try:
            shots = build_script_shots(body, api_cfg=api_cfg, user_id=user_id)
            SCRIPT_JOBS[job_id].update({
                'status': 'done',
                'shots': shots,
                'count': len(shots),
                'finished_at': time.time()
            })
        except Exception as e:
            SCRIPT_JOBS[job_id].update({
                'status': 'error',
                'error': str(e),
                'finished_at': time.time()
            })

    threading.Thread(target=worker, daemon=True).start()
    return jsonify(job_id=job_id, status='running')


@app.route('/api/script/split/<job_id>', methods=['GET'])
@login_required
def script_split_status(job_id):
    if JOB_OWNERS.get(job_id) != current_user_id():
        return jsonify(error='分镜任务不存在或已过期'), 404
    now = time.time()
    for old_id, job in list(SCRIPT_JOBS.items()):
        if now - job.get('created_at', now) > 3600:
            SCRIPT_JOBS.pop(old_id, None)
    job = SCRIPT_JOBS.get(job_id)
    if not job:
        return jsonify(error='分镜任务不存在或已过期'), 404
    return jsonify(job)


def script_style_rule(style_id, target='video_prompt', user_id=None):
    if not style_id:
        if target == 'script':
            return '用户未选择风格：不要添加真人拍摄、真实摄影、动漫、漫画、3D或其他视觉风格描述。'
        return '【风格规则】用户未选择风格。所有 video_prompt 只写剧情、镜头、动作和技术质量，不得主动添加真人拍摄、真实摄影、动漫、漫画、3D或其他视觉风格词。'

    styles, changed = ensure_default_styles(load_json(styles_path(user_id), []))
    if changed:
        save_json(styles_path(user_id), styles)
    style = next((item for item in styles if item.get('id') == style_id), None)
    if not style:
        if target == 'script':
            return '所选风格不存在：不要添加任何视觉风格描述。'
        return '【风格规则】所选风格不存在。所有 video_prompt 不得添加任何视觉风格词。'

    name = style.get('name', '用户选择的风格')
    prompt = style.get('prompt', '').strip()
    if target == 'script':
        return f'【用户已选风格：{name}】场景氛围和视觉描述必须遵守以下要求，不得改成其他风格：{prompt}'
    return f'【用户已选风格：{name}】每个 video_prompt 必须遵守以下风格要求，不得添加其他风格：{prompt}'


def build_script_shots(body, api_cfg=None, user_id=None):
    script_text = body.get('script', '').strip()
    mode = body.get('mode', 'smart')  # smart | short | long
    script_model = body.get('script_model', SCRIPT_MODEL_DEFAULT)
    if not script_text:
        raise Exception('请输入剧本文本')
    compact_request = len(script_text) < 120 and mode != 'long'
    style_rule = script_style_rule(body.get('style_id'), user_id=user_id)

    mode_instructions = {
        'short': '\n当前模式：短镜头模式。每个输出项只包含 1 个 beat，时长 4-6 秒，适合快速反应、特写、动作切点。',
        'long': '\n当前模式：长段落模式。每个输出项优先包含 2-3 个 beat，时长 8-15 秒，适合连续剧情推进。',
        'smart': '\n当前模式：智能段落模式（默认）。能合并就合并，该拆才拆，同一场景、同一情绪、同一动作线尽量合成一个段落。'
    }

    if compact_request:
        system_prompt = (
            '你是AI短剧分镜导演。把用户短句扩成1个可直接生成的视频段落，不要过度拆分。\n'
            '只输出 JSON 数组，数组内只放1个对象。字段必须有：segment_no、duration、scene、characters、emotion、story_action、beats、dialogue、video_prompt。\n'
            'duration 用6-8秒。beats 只写1-2个，写清时间、景别、运镜、动作重点。\n'
            'video_prompt 必须是直接命令式，融合成一段连续视频指令，保留用户原意，适当补环境和情绪，不写废话。\n'
            + style_rule + '\n'
            'video_prompt 结尾只加技术质量约束：人物身份稳定，表情自然，动作连贯，手部和肢体正常，服装不穿模，场景保持一致，画面清晰，无字幕，无水印。除上述风格规则外不得自行补充风格词。\n'
            '不要 Markdown，不要解释，只输出 JSON 数组。'
        )
        max_tokens = 1200
    else:
        system_prompt = (
            '你是专业AI短剧分镜导演。用户会提供剧本、剧情梗概或灵感，你要把它拆成"可直接生成的视频段落"，而不是机械拆成单个镜头。\n\n'
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
            '5. 质量约束放在最后：人物身份稳定，表情自然，动作连贯，手部和肢体正常，服装不穿模，场景保持一致，画面清晰，无字幕，无水印。除风格规则外不得自行补充风格词。\n\n'
            + style_rule + '\n\n'
            '如果用户输入很短或没灵感：自动补成一个短剧冲突片段，优先使用强冲突场景：误会、重逢、隐瞒、摊牌、反转、救场、背叛、追问。\n\n'
            + mode_instructions.get(mode, mode_instructions['smart']) + '\n\n'
            '输出格式必须是 JSON 数组，不要 Markdown，不要解释，只输出 JSON 数组。'
        )
        max_tokens = 2600 if len(script_text) < 800 else 4000
    try:
        raw = call_script_text_model(script_model, system_prompt, script_text, temperature=0.6, max_tokens=max_tokens, api_cfg=api_cfg)
        if raw.startswith('```'):
            raw = raw.split('\n', 1)[1]
        if raw.endswith('```'):
            raw = raw.rsplit('\n', 1)[0]
        shots = parse_script_shots_json(raw, script_model, api_cfg=api_cfg)
        insert_history({
            'time': datetime.now().strftime('%Y-%m-%d %H:%M'),
            'type': 'script',
            'script_text': script_text[:200],
            'original_script': script_text,
            'segment_count': len(shots),
            'shots': shots
        }, user_id=user_id)
        return shots
    except json.JSONDecodeError as e:
        raise Exception(f'解析分镜结果失败: {str(e)}\n模型原文：{raw[:800]}')
    except Exception as e:
        raise Exception(f'拆分失败: {str(e)}')

if __name__ == '__main__':
    port = int(os.environ.get('PORT', '5001'))
    debug = os.environ.get('FLASK_DEBUG', '1') == '1'
    app.run(debug=debug, port=port, threaded=True)
import io
import requests
from PIL import Image, ImageFilter, ImageEnhance

def wash_seedance_image_by_url(url):
    """Pass-through for now, can add image processing later."""
    return url

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
