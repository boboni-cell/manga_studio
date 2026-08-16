import bundledCommunityPrompts from './bundledCommunityPrompts.json';

export type PromptOrigin = 'local' | 'community';
export type PromptCommunitySourceId = 'davidwu-gpt-image2-prompts' | 'youmind-nano-banana-pro';

export interface PromptLibraryEntry {
  id: string;
  title: string;
  prompt: string;
  excerpt: string;
  category: string;
  source: string;
  tags: string[];
  coverUrl: string;
  createdAt: string;
  updatedAt: string;
  preview?: string;
  githubUrl?: string;
  origin: PromptOrigin;
}

export interface PromptLibraryFetchResult {
  entries: PromptLibraryEntry[];
  fetchedAt: string;
  errors: string[];
}

interface LocalPromptSeed {
  id: string;
  title: string;
  prompt: string;
  category: string;
  source: string;
  tags: string[];
  accent: string;
  secondary: string;
  label: string;
}

interface DavidWuPrompt {
  id: number;
  titleEn: string;
  titleCn: string;
  category: string;
  categoryCn: string;
  prompt: string;
  note: string;
  author: string;
  source: string;
  needsRef: boolean;
  image: string;
}

type BundledCommunityPrompt = Omit<PromptLibraryEntry, 'origin'> & {
  origin: PromptOrigin;
};

const DAVID_WU_RAW_BASE =
  'https://raw.githubusercontent.com/davidwuw0811-boop/awesome-gpt-image2-prompts/main';
const DAVID_WU_GITHUB_URL = 'https://github.com/davidwuw0811-boop/awesome-gpt-image2-prompts';
const YOUMIND_NANO_BANANA_PRO_RAW_BASE =
  'https://raw.githubusercontent.com/YouMind-OpenLab/awesome-nano-banana-pro-prompts/main';
const YOUMIND_NANO_BANANA_PRO_GITHUB_URL =
  'https://github.com/YouMind-OpenLab/awesome-nano-banana-pro-prompts';
const FALLBACK_UPDATED_AT = '2026-05-25T00:00:00.000Z';

function createPromptCover({
  accent,
  secondary,
  label,
}: {
  accent: string;
  secondary: string;
  label: string;
}): string {
  const svg = `
    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 960 720">
      <defs>
        <linearGradient id="bg" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" stop-color="#111827"/>
          <stop offset="0.48" stop-color="${secondary}"/>
          <stop offset="1" stop-color="#05070a"/>
        </linearGradient>
        <radialGradient id="spot" cx="0.7" cy="0.28" r="0.56">
          <stop offset="0" stop-color="${accent}" stop-opacity="0.78"/>
          <stop offset="0.52" stop-color="${accent}" stop-opacity="0.2"/>
          <stop offset="1" stop-color="${accent}" stop-opacity="0"/>
        </radialGradient>
      </defs>
      <rect width="960" height="720" fill="url(#bg)"/>
      <rect width="960" height="720" fill="url(#spot)"/>
      <path d="M88 514 C212 402 326 402 458 476 C602 557 714 432 872 276" fill="none" stroke="${accent}" stroke-opacity="0.5" stroke-width="24" stroke-linecap="round"/>
      <path d="M116 570 H844" stroke="#fff" stroke-opacity="0.14" stroke-width="2"/>
      <path d="M152 156 H808 V536 H152 Z" fill="none" stroke="#fff" stroke-opacity="0.2" stroke-width="3"/>
      <path d="M152 282 H808 M152 410 H808 M371 156 V536 M589 156 V536" stroke="#fff" stroke-opacity="0.08" stroke-width="2"/>
      <circle cx="314" cy="352" r="64" fill="${accent}" fill-opacity="0.22" stroke="${accent}" stroke-opacity="0.86" stroke-width="5"/>
      <rect x="540" y="290" width="192" height="132" rx="12" fill="#fff" fill-opacity="0.09" stroke="#fff" stroke-opacity="0.24"/>
      <text x="76" y="112" fill="#fff" fill-opacity="0.84" font-family="ui-sans-serif, system-ui, sans-serif" font-size="58" font-weight="700" letter-spacing="0">${label}</text>
      <text x="76" y="642" fill="#fff" fill-opacity="0.52" font-family="ui-sans-serif, system-ui, sans-serif" font-size="24" letter-spacing="0">PROMPT CENTER</text>
    </svg>
  `;

  return `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`;
}

export const BUNDLED_COMMUNITY_PROMPTS: PromptLibraryEntry[] = (
  bundledCommunityPrompts as BundledCommunityPrompt[]
).map((entry, index) => ({
  ...entry,
  id: entry.id || `bundled-community-${index}`,
  title: entry.title || 'Untitled Prompt',
  prompt: entry.prompt || '',
  excerpt: entry.excerpt || createExcerpt(entry.prompt || ''),
  category: entry.category || 'community',
  source: entry.source || 'bundled-community',
  tags: Array.isArray(entry.tags) ? entry.tags : [],
  coverUrl:
    entry.coverUrl ||
    createPromptCover({
      accent: '#3b82f6',
      secondary: '#111827',
      label: 'PROMPT',
    }),
  createdAt: entry.createdAt || FALLBACK_UPDATED_AT,
  updatedAt: entry.updatedAt || FALLBACK_UPDATED_AT,
  origin: 'community',
}));

function createExcerpt(prompt: string): string {
  const compact = prompt.replace(/\s+/g, ' ').trim();
  return compact.length > 150 ? `${compact.slice(0, 150)}...` : compact;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

function readString(record: Record<string, unknown>, key: string): string {
  const value = record[key];
  return typeof value === 'string' ? value.trim() : '';
}

function readBoolean(record: Record<string, unknown>, key: string): boolean {
  return record[key] === true;
}

function readNumber(record: Record<string, unknown>, key: string): number {
  const value = record[key];
  return typeof value === 'number' && Number.isFinite(value) ? value : 0;
}

function normalizeTags(values: Array<string | undefined | null>): string[] {
  const seen = new Set<string>();
  const tags: string[] = [];

  values
    .flatMap((value) => String(value ?? '').split(/[、,;/|]+/))
    .map((value) => value.trim())
    .filter(Boolean)
    .forEach((value) => {
      const normalized = value.toLowerCase();
      if (seen.has(normalized)) {
        return;
      }
      seen.add(normalized);
      tags.push(value);
    });

  return tags.slice(0, 8);
}

function absoluteImage(baseUrl: string, image: string): string {
  const trimmed = image.trim();
  if (!trimmed) {
    return '';
  }

  if (/^https?:\/\//i.test(trimmed)) {
    return trimmed;
  }

  return `${baseUrl}/${trimmed.replace(/^\.\//, '').replace(/^\/+/, '')}`;
}

async function fetchText(url: string, signal?: AbortSignal): Promise<string> {
  const response = await fetch(url, {
    signal,
    cache: 'no-store',
  });
  if (!response.ok) {
    throw new Error(`${response.status} ${response.statusText}`);
  }
  return response.text();
}

async function fetchJson(url: string, signal?: AbortSignal): Promise<unknown> {
  const response = await fetch(url, {
    signal,
    cache: 'no-store',
  });
  if (!response.ok) {
    throw new Error(`${response.status} ${response.statusText}`);
  }
  return response.json();
}

function parseDavidWuPrompt(value: unknown): DavidWuPrompt | null {
  if (!isRecord(value)) {
    return null;
  }

  const id = readNumber(value, 'id');
  const titleCn = readString(value, 'title_cn');
  const titleEn = readString(value, 'title_en');
  const prompt = readString(value, 'prompt');
  if (!id || (!titleCn && !titleEn) || !prompt) {
    return null;
  }

  return {
    id,
    titleCn,
    titleEn,
    category: readString(value, 'category'),
    categoryCn: readString(value, 'category_cn'),
    prompt,
    note: readString(value, 'note'),
    author: readString(value, 'author'),
    source: readString(value, 'source'),
    needsRef: readBoolean(value, 'needs_ref'),
    image: readString(value, 'image'),
  };
}

async function fetchDavidWuPrompts(signal?: AbortSignal): Promise<PromptLibraryEntry[]> {
  const raw = await fetchJson(`${DAVID_WU_RAW_BASE}/prompts.json`, signal);
  if (!Array.isArray(raw)) {
    return [];
  }

  return raw
    .map(parseDavidWuPrompt)
    .filter((item): item is DavidWuPrompt => Boolean(item))
    .map((item) => {
      const title = item.titleCn || item.titleEn;
      const category = item.categoryCn || item.category || 'community';
      const source = 'awesome-gpt-image2-prompts';
      const coverUrl =
        absoluteImage(DAVID_WU_RAW_BASE, item.image) ||
        createPromptCover({
          accent: '#f59e0b',
          secondary: '#1f2937',
          label: 'GPT',
        });
      const tags = normalizeTags([
        category,
        item.category,
        item.author,
        item.source,
        item.needsRef ? '需要参考图' : '',
      ]);
      const preview = [item.titleEn, item.note, coverUrl ? `![](${coverUrl})` : '']
        .filter(Boolean)
        .join('\n\n');

      return {
        id: `davidwu-gpt-image2-${String(item.id).padStart(3, '0')}`,
        title,
        prompt: item.prompt,
        excerpt: item.note || createExcerpt(item.prompt),
        category,
        source,
        tags,
        coverUrl,
        createdAt: FALLBACK_UPDATED_AT,
        updatedAt: FALLBACK_UPDATED_AT,
        preview,
        githubUrl: DAVID_WU_GITHUB_URL,
        origin: 'community' as const,
      };
    });
}

function splitBeforeHeading(markdown: string, prefix: string): string[] {
  const blocks: string[] = [];
  let current: string[] = [];

  markdown.split('\n').forEach((line) => {
    if (line.startsWith(prefix) && current.length > 0) {
      blocks.push(current.join('\n'));
      current = [];
    }
    current.push(line);
  });

  if (current.length > 0) {
    blocks.push(current.join('\n'));
  }

  return blocks;
}

function firstMatch(value: string, pattern: RegExp): string {
  return pattern.exec(value)?.[1]?.trim() ?? '';
}

function extractMarkdownImages(baseUrl: string, block: string): string[] {
  const seen = new Set<string>();
  const images: string[] = [];
  const patterns = [/<img[^>]+src="([^"]+)"/gi, /!\[[^\]]*]\(([^)]+)\)/g];

  patterns.forEach((pattern) => {
    Array.from(block.matchAll(pattern)).forEach((match) => {
      const image = absoluteImage(baseUrl, match[1] ?? '');
      if (!image || seen.has(image)) {
        return;
      }
      seen.add(image);
      images.push(image);
    });
  });

  return images;
}

function parseYouMindCategory(title: string): string {
  const [category] = title.split(' - ');
  return category?.trim() || 'Nano Banana Pro';
}

async function fetchYouMindNanoBananaProPrompts(
  signal?: AbortSignal
): Promise<PromptLibraryEntry[]> {
  const markdown = await fetchText(`${YOUMIND_NANO_BANANA_PRO_RAW_BASE}/README_zh.md`, signal);

  return splitBeforeHeading(markdown, '### ')
    .map<PromptLibraryEntry | null>((block, index) => {
      const title = firstMatch(block, /^###\s+No\.\s*\d+:\s*(.+)$/m);
      const prompt = firstMatch(
        block,
        /####[^\n]*提示词[\s\S]*?```[\w-]*\s*([\s\S]*?)```/
      );
      if (!title || !prompt) {
        return null;
      }

      const images = extractMarkdownImages(YOUMIND_NANO_BANANA_PRO_RAW_BASE, block);
      const category = parseYouMindCategory(title);
      const coverUrl =
        images[0] ||
        createPromptCover({
          accent: '#34d399',
          secondary: '#064e3b',
          label: 'NANO',
        });
      const tags = normalizeTags([category, 'nano-banana-pro', 'youmind']);

      return {
        id: `youmind-nano-banana-pro-${String(index + 1).padStart(3, '0')}`,
        title,
        prompt,
        excerpt: createExcerpt(prompt),
        category,
        source: 'youmind-nano-banana-pro',
        tags,
        coverUrl,
        createdAt: FALLBACK_UPDATED_AT,
        updatedAt: FALLBACK_UPDATED_AT,
        preview: images.map((image) => `![](${image})`).join('\n\n'),
        githubUrl: YOUMIND_NANO_BANANA_PRO_GITHUB_URL,
        origin: 'community' as const,
      };
    })
    .filter((item): item is PromptLibraryEntry => Boolean(item));
}

export function mergePromptEntries(entries: PromptLibraryEntry[]): PromptLibraryEntry[] {
  const seen = new Set<string>();
  const merged: PromptLibraryEntry[] = [];

  entries.forEach((entry) => {
    if (seen.has(entry.id)) {
      return;
    }
    seen.add(entry.id);
    merged.push(entry);
  });

  return merged;
}

export async function fetchCommunityPromptSource(
  sourceId: PromptCommunitySourceId,
  signal?: AbortSignal
): Promise<PromptLibraryEntry[]> {
  if (sourceId === 'davidwu-gpt-image2-prompts') {
    return fetchDavidWuPrompts(signal);
  }
  return fetchYouMindNanoBananaProPrompts(signal);
}

export async function fetchCommunityPromptEntries(
  signal?: AbortSignal
): Promise<PromptLibraryFetchResult> {
  const results = await Promise.allSettled([
    fetchCommunityPromptSource('davidwu-gpt-image2-prompts', signal),
    fetchCommunityPromptSource('youmind-nano-banana-pro', signal),
  ]);

  const entries: PromptLibraryEntry[] = [];
  const errors: string[] = [];

  results.forEach((result) => {
    if (result.status === 'fulfilled') {
      entries.push(...result.value);
      return;
    }
    errors.push(result.reason instanceof Error ? result.reason.message : String(result.reason));
  });

  return {
    entries: mergePromptEntries(entries),
    fetchedAt: new Date().toISOString(),
    errors,
  };
}

const LOCAL_PROMPT_SEEDS: LocalPromptSeed[] = [
  {
    id: 'local-neon-alley-confrontation',
    title: '霓虹巷道对峙',
    prompt:
      '雨夜的狭窄城市巷道，两名角色在远近两个景深层次上对峙，湿润地面反射青蓝色和玫红色霓虹。低机位广角镜头，前景有虚化的管线和墙面纹理，中景角色轮廓被背光勾边，远处有微弱烟雾和城市招牌。画面强调紧张的电影感构图、清晰的空间纵深、真实材质、细节丰富但不杂乱。',
    category: '场景',
    source: '本地精选',
    tags: ['电影感', '夜景', '光影', '构图'],
    accent: '#22d3ee',
    secondary: '#172554',
    label: 'NIGHT',
  },
  {
    id: 'local-character-continuity-portrait',
    title: '角色连续性肖像',
    prompt:
      '一名可复用的影视角色半身肖像，面部五官清晰，眼神稳定，服饰层次和材质明确，发型、配饰、轮廓具有高辨识度。柔和主光从左前方照射，轻微轮廓光分离背景，背景简洁但保留真实摄影质感。保持角色身份特征一致，避免夸张变形，适合作为后续分镜和多角度生成的角色参考。',
    category: '角色',
    source: '本地精选',
    tags: ['角色', '肖像', '细节', '参考图'],
    accent: '#f59e0b',
    secondary: '#1f2937',
    label: 'FACE',
  },
  {
    id: 'local-wide-establishing-shot',
    title: '广角环境建立镜头',
    prompt:
      '一张用于分镜开场的广角环境建立镜头，展示完整场景尺度、主要建筑或地形边界、人物在空间中的小比例位置，以及清晰的行动路径。镜头略高于视线，构图有前景、中景、远景三层，光线自然，画面可直接作为后续镜头调度和导演台摆位参考。',
    category: '镜头',
    source: '本地精选',
    tags: ['广角', '环境', '分镜', '构图'],
    accent: '#34d399',
    secondary: '#064e3b',
    label: 'WIDE',
  },
  {
    id: 'local-product-hero-still',
    title: '产品英雄静物',
    prompt:
      '商业广告风格的产品英雄静物，一件核心产品置于画面中心偏下位置，边缘高光清晰，材质细节真实，背景使用低调的几何台面和柔和渐变光。主光塑造产品形体，辅光保留阴影层次，画面干净、专业、可用于海报或电商主视觉，不添加多余文字和标志。',
    category: '商业视觉',
    source: '本地精选',
    tags: ['产品', '广告', '材质', '光影'],
    accent: '#fb7185',
    secondary: '#3b0764',
    label: 'HERO',
  },
  {
    id: 'local-action-beat-storyboard',
    title: '动作分镜关键拍',
    prompt:
      '一张动作分镜关键拍，角色从画面左下向右上快速移动，身体姿态有明确发力方向，衣物和环境细节产生轻微运动拖影。前景障碍物增强速度感，中景角色动作清楚，背景保留可识别空间线索。画面需要有强烈构图方向、可继续拆成连续分镜的动作逻辑，以及真实电影镜头质感。',
    category: '连续动作',
    source: '本地精选',
    tags: ['动作', '分镜', '速度', '构图'],
    accent: '#a3e635',
    secondary: '#27272a',
    label: 'BEAT',
  },
  {
    id: 'local-interior-morning-ambience',
    title: '室内清晨氛围',
    prompt:
      '清晨室内场景，窗外柔和日光斜射进房间，空气中有微弱尘埃颗粒，家具陈设简洁真实，墙面、织物、木质表面都有细腻材质。画面安静、克制、带有生活痕迹，适合人物独处或对话前的情绪铺垫。构图留出角色活动空间，不要过度装饰。',
    category: '场景',
    source: '本地精选',
    tags: ['室内', '情绪', '光影', '生活感'],
    accent: '#f97316',
    secondary: '#164e63',
    label: 'ROOM',
  },
  {
    id: 'local-social-media-mockup',
    title: '社媒活动视觉板',
    prompt:
      '为一个新产品发布活动创建社媒视觉板，包含主视觉海报、竖版故事图、方形信息卡和小尺寸广告位。整体保持统一品牌调性，留有可替换文案区域，画面有清楚的视觉层级、真实印刷和屏幕材质，不出现不可读的乱码文字。',
    category: '商业视觉',
    source: '本地精选',
    tags: ['社媒', '排版', '品牌', '广告'],
    accent: '#ef4444',
    secondary: '#3f1d1d',
    label: 'SOCIAL',
  },
  {
    id: 'local-food-editorial-story',
    title: '食物编辑部故事板',
    prompt:
      '一组温暖自然光下的食物编辑部故事板，包含食材准备、手部动作、成品特写和桌面环境。画面保留真实厨房杂物但不混乱，材质细节清楚，色彩自然，适合用于短视频分镜或杂志风图文排版。',
    category: '生活方式',
    source: '本地精选',
    tags: ['食物', '编辑部', '生活方式', '故事板'],
    accent: '#facc15',
    secondary: '#422006',
    label: 'FOOD',
  },
  {
    id: 'local-travel-poster-isometric',
    title: '等距旅行海报',
    prompt:
      '复古中世纪旅行海报风格的等距城市景观，包含地标建筑、街道动线、小型人物和交通工具。使用清晰块面、克制颗粒感和暖冷对比色，画面适合竖版海报，顶部和底部保留可放置标题的安全区域。',
    category: '海报',
    source: '本地精选',
    tags: ['海报', '旅行', '等距', '城市'],
    accent: '#38bdf8',
    secondary: '#0f172a',
    label: 'CITY',
  },
  {
    id: 'local-noir-character-board',
    title: '黑色电影角色设计板',
    prompt:
      '高预算黑色电影风格角色设计板，展示同一角色的正面、侧面、半身特写、服装细节和道具细节。画面使用冷色霓虹边缘光、低饱和皮肤色和暗部层次，所有小图保持同一人物身份特征一致。',
    category: '角色',
    source: '本地精选',
    tags: ['角色', '服装', '黑色电影', '参考图'],
    accent: '#8b5cf6',
    secondary: '#18181b',
    label: 'NOIR',
  },
  {
    id: 'local-liquid-art-poster',
    title: '3D 液体彩色海报',
    prompt:
      '一张爆发式 3D 液体彩色海报，明亮油漆、半透明气泡和几何小物体从中心向外喷溅。画面有强烈动势但主体区域清楚，材质具有真实折射和高光，背景干净，适合潮流活动主视觉。',
    category: '海报',
    source: '本地精选',
    tags: ['3D', '液体', '海报', '色彩'],
    accent: '#ec4899',
    secondary: '#1e1b4b',
    label: 'LIQUID',
  },
  {
    id: 'local-architecture-presentation-board',
    title: '景观建筑提案板',
    prompt:
      '一张景观建筑提案板，包含鸟瞰总图、材质样本、小型节点剖面、植物配置和人群活动示意。整体像专业竞赛图纸，信息清晰但不拥挤，水体、湿地、步道和建筑边界具有可读层次。',
    category: '建筑',
    source: '本地精选',
    tags: ['建筑', '景观', '提案', '图纸'],
    accent: '#84cc16',
    secondary: '#14532d',
    label: 'LAND',
  },
  {
    id: 'local-toy-city-editorial',
    title: '玩具城市编辑大片',
    prompt:
      '一个由黏土和玩具积木搭成的迷你城市编辑大片，儿童视角的浅景深摄影，明亮自然光，街道、桥梁、塔楼和小车细节丰富。画面可爱但不幼稚，像真实杂志大片，不要出现品牌标志。',
    category: '生活方式',
    source: '本地精选',
    tags: ['玩具', '编辑部', '摄影', '城市'],
    accent: '#06b6d4',
    secondary: '#083344',
    label: 'PLAY',
  },
  {
    id: 'local-tech-ui-concept',
    title: '科技产品 UI 概念板',
    prompt:
      '一张科技产品 UI 概念板，展示桌面端仪表盘、移动端摘要卡、图表组件和系统状态面板。视觉安静、信息密度适中、层级明确，避免夸张发光效果，所有界面元素像真实可用的软件产品。',
    category: 'UI',
    source: '本地精选',
    tags: ['UI', '仪表盘', '产品', '系统'],
    accent: '#60a5fa',
    secondary: '#1e293b',
    label: 'UI',
  },
  {
    id: 'local-documentary-street-photo',
    title: '纪实街头摄影',
    prompt:
      '一张纪实街头摄影风格画面，普通人在傍晚街角等待公交，店铺灯光刚亮，路面有轻微反光。构图自然像偶然捕捉，表情真实克制，色彩不过度电影化，强调生活中的细节和空间真实感。',
    category: '摄影',
    source: '本地精选',
    tags: ['摄影', '纪实', '街头', '生活感'],
    accent: '#fbbf24',
    secondary: '#292524',
    label: 'STREET',
  },
  {
    id: 'local-educational-infographic',
    title: '教育信息图主视觉',
    prompt:
      '为一个科普教育主题设计信息图主视觉，包含中心概念图、三到五个模块化解释区域、图标、箭头和简洁数据点。整体清楚、有亲和力、适合课堂或公众号封面，不出现小到不可读的文字。',
    category: '教育',
    source: '本地精选',
    tags: ['教育', '信息图', '图标', '排版'],
    accent: '#14b8a6',
    secondary: '#134e4a',
    label: 'INFO',
  },
];

export const LOCAL_PROMPTS: PromptLibraryEntry[] = LOCAL_PROMPT_SEEDS.map((seed) => ({
  id: seed.id,
  title: seed.title,
  prompt: seed.prompt,
  excerpt: createExcerpt(seed.prompt),
  category: seed.category,
  source: seed.source,
  tags: seed.tags,
  coverUrl: createPromptCover({
    accent: seed.accent,
    secondary: seed.secondary,
    label: seed.label,
  }),
  createdAt: FALLBACK_UPDATED_AT,
  updatedAt: FALLBACK_UPDATED_AT,
  origin: 'local',
}));
