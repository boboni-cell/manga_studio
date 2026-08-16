// Manga Studio node editor: a floating context layer pinned BELOW the
// selected node (no fixed right drawer / bottom editor). Tabs:
// 参数 / 技能 / 资产.
import {
  memo,
  useCallback,
  useEffect,
  useState,
  type ChangeEvent,
} from 'react';
import { createPortal } from 'react-dom';
import { FileUp, Image as ImageIcon, PenLine, Sparkles, Tags, X } from 'lucide-react';

import { api } from '@/api';
import { webApiGateway } from '../infrastructure/webApiGateway';
import { useCanvasStore } from '@/stores/canvasStore';
import { CANVAS_NODE_TYPES, type CanvasNode } from '../domain/canvasNodes';

const IMAGE_RATIOS = ['1:1', '16:9', '9:16', '4:3', '3:4', '21:9'];
const VIDEO_RATIOS = ['9:16', '16:9', '1:1'];
const VIDEO_RESOLUTIONS = ['720p', '1080p'];
const PANEL_WIDTH = 380;

interface StyleItem {
  id: string;
  name: string;
  thumbnail_url?: string;
  prompt?: string;
  deleted_at?: string | null;
}
interface ApiProfile {
  id: string;
  name?: string;
  provider?: string;
  model?: string;
}
interface ModelsResponse {
  models?: string[];
  default?: string;
  default_model?: string;
  nano_available?: boolean;
  agnes_available?: boolean;
  third_party_available?: boolean;
}
interface SkillItem {
  id: string;
  title: string;
  description?: string;
  target_node_type?: string;
  input_schema?: Record<string, unknown>;
  output_type?: string;
}
interface AssetItem {
  kind: 'character' | 'outfit' | 'scene' | 'upload' | 'style' | 'audio';
  id: string;
  name: string;
  url?: string;
  thumbnail_url?: string;
  deleted_at?: string | null;
}

type TabKey = 'params' | 'skills' | 'assets';

function useSelectedNodeRect(nodeId: string | null): DOMRect | null {
  const [rect, setRect] = useState<DOMRect | null>(null);
  useEffect(() => {
    if (!nodeId) return;
    let raf = 0;
    const tick = () => {
      const el = document.querySelector('.react-flow__node.selected') as HTMLElement | null;
      if (el) setRect(el.getBoundingClientRect());
      raf = window.requestAnimationFrame(tick);
    };
    raf = window.requestAnimationFrame(tick);
    return () => window.cancelAnimationFrame(raf);
  }, [nodeId]);
  return rect;
}

function isGenerationNode(node: CanvasNode): boolean {
  return node.type === CANVAS_NODE_TYPES.imageEdit
    || node.type === CANVAS_NODE_TYPES.storyboardGen
    || node.type === CANVAS_NODE_TYPES.aiVideo;
}

function MangaNodeEditPanelInner({ node, onClose }: { node: CanvasNode; onClose: () => void }) {
  const updateNodeData = useCanvasStore((s) => s.updateNodeData);
  const [tab, setTab] = useState<TabKey>('params');
  const [busy, setBusy] = useState(false);
  const [styles, setStyles] = useState<StyleItem[]>([]);
  const [textModels, setTextModels] = useState<string[]>([]);
  const [imageModels, setImageModels] = useState<string[]>([]);
  const [videoModels, setVideoModels] = useState<string[]>([]);
  const [profiles, setProfiles] = useState<Record<string, ApiProfile[]>>({ text: [], image: [], video: [] });
  const [selectedProfiles, setSelectedProfiles] = useState<Record<string, string>>({});
  const [isAdmin, setIsAdmin] = useState(false);
  const [skills, setSkills] = useState<SkillItem[]>([]);
  const [assets, setAssets] = useState<AssetItem[]>([]);
  const [requirement, setRequirement] = useState('');

  const nodeRect = useSelectedNodeRect(node.id);
  const data = node.data as Record<string, unknown>;
  const prompt = String(data.prompt || '');
  const content = String(data.content || '');
  const ratio = String(data.ratio || data.requestAspectRatio || '1:1');
  const styleId = String(data.styleId || data.style_id || '');

  useEffect(() => {
    api<StyleItem[] | { styles?: StyleItem[] }>('/api/styles').then((r) => {
      const list = Array.isArray(r) ? r : (Array.isArray(r.styles) ? r.styles : []);
      setStyles(list);
    }).catch(() => setStyles([]));
    api<ModelsResponse>('/api/image-models').then((r) => setImageModels(Array.isArray(r.models) ? r.models : [])).catch(() => setImageModels([]));
    api<ModelsResponse>('/api/models').then((r) => setVideoModels(Array.isArray(r.models) ? r.models : [])).catch(() => setVideoModels([]));
    api<ModelsResponse>('/api/text-models').then((r) => setTextModels(Array.isArray(r.models) ? r.models : [])).catch(() => setTextModels([]));
    api<{ api_profiles?: Record<string, ApiProfile[]>; selected_api_profiles?: Record<string, string> }>('/api/settings')
      .then((r) => {
        setProfiles(r.api_profiles || { text: [], image: [], video: [] });
        setSelectedProfiles(r.selected_api_profiles || {});
      })
      .catch(() => undefined);
    api<{ is_admin?: boolean }>('/api/auth/me').then((r) => setIsAdmin(r.is_admin === true)).catch(() => setIsAdmin(false));
    api<{ skills?: SkillItem[] }>('/api/skills')
      .then((r) => setSkills(Array.isArray(r.skills) ? r.skills : []))
      .catch(() => setSkills([]));
    Promise.all([
      api<unknown[]>('/api/assets/outfits').catch(() => []),
      api<unknown[]>('/api/assets/scenes').catch(() => []),
      api<unknown[]>('/api/assets/uploads').catch(() => []),
      api<unknown[]>('/api/assets/audios').catch(() => []),
      api<Record<string, { name?: string; images?: { url?: string }[]; deleted_at?: string | null }>>('/api/characters').catch(() => ({})),
      api<StyleItem[] | { styles?: StyleItem[] }>('/api/styles').catch(() => []),
    ]).then(([outfits, scenes, uploads, audios, characters, styleResp]) => {
      const list: AssetItem[] = [];
      const push = (kind: AssetItem['kind'], items: unknown[]) => {
        for (const it of items as Array<{ id?: string; name?: string; url?: string; thumbnail_url?: string; deleted_at?: string | null }>) {
          if (it && it.id) list.push({ kind, id: String(it.id), name: String(it.name || '未命名'), url: it.url, thumbnail_url: it.thumbnail_url, deleted_at: it.deleted_at });
        }
      };
      push('outfit', outfits as unknown[]);
      push('scene', scenes as unknown[]);
      push('upload', uploads as unknown[]);
      push('audio', audios as unknown[]);
      for (const [id, ch] of Object.entries(characters)) {
        if (!ch) continue;
        const url = Array.isArray(ch.images) && ch.images[0]?.url ? ch.images[0].url : undefined;
        list.push({ kind: 'character', id, name: String(ch.name || id), url, deleted_at: ch.deleted_at });
      }
      const styleList = Array.isArray(styleResp) ? styleResp : (Array.isArray((styleResp as { styles?: StyleItem[] }).styles) ? (styleResp as { styles?: StyleItem[] }).styles! : []);
      for (const s of styleList) {
        list.push({ kind: 'style', id: s.id, name: s.name, thumbnail_url: s.thumbnail_url, deleted_at: s.deleted_at });
      }
      setAssets(list.filter((a) => !a.deleted_at));
    }).catch(() => setAssets([]));
  }, []);

  const update = useCallback((patch: Record<string, unknown>) => updateNodeData(node.id, patch), [node.id, updateNodeData]);

  const apiProfileKind = node.type === CANVAS_NODE_TYPES.aiVideo ? 'video' : node.type === CANVAS_NODE_TYPES.aiText ? 'text' : 'image';
  const profileOptions = profiles[apiProfileKind] || [];
  const modelField = node.type === CANVAS_NODE_TYPES.aiVideo ? 'video_model' : 'image_model';
  const platformModels = node.type === CANVAS_NODE_TYPES.aiVideo ? videoModels : imageModels;
  const defaultPlatformModel = node.type === CANVAS_NODE_TYPES.aiVideo ? 'seedance' : 'gpt-image-2';
  const storedModel = String(data[modelField] || data.model || defaultPlatformModel);
  const storedProfile = String(data.api_profile_id || selectedProfiles[apiProfileKind] || '');
  const usePersonalApi = data.use_personal_api === true || storedModel === 'personal-api';
  const selectedProfile = usePersonalApi ? storedProfile : '';
  const routeValue = usePersonalApi && selectedProfile
    ? 'personal:' + selectedProfile
    : 'platform:' + (storedModel === 'personal-api' ? defaultPlatformModel : storedModel);

  const changeGenerationRoute = (value: string) => {
    if (value.startsWith('personal:')) {
      const profileId = value.slice('personal:'.length);
      update({
        [modelField]: 'personal-api',
        ...(node.type === CANVAS_NODE_TYPES.aiVideo ? {} : { model: 'personal-api' }),
        use_personal_api: true,
        api_profile_id: profileId,
      });
      return;
    }
    const model = value.slice('platform:'.length) || defaultPlatformModel;
    update({
      [modelField]: model,
      ...(node.type === CANVAS_NODE_TYPES.aiVideo ? {} : { model }),
      use_personal_api: false,
      api_profile_id: null,
    });
  };

  const textProfileOptions = profiles.text || [];
  const skillModel = String(data.skill_script_model || 'doubao');
  const skillProfile = String(data.skill_api_profile_id || selectedProfiles.text || '');
  const skillUsePersonalApi = data.skill_use_personal_api === true || skillModel === 'personal-api';
  const skillRouteValue = skillUsePersonalApi && skillProfile
    ? 'personal:' + skillProfile
    : 'platform:' + (skillModel === 'personal-api' ? 'doubao' : skillModel);

  const changeSkillRoute = (value: string) => {
    if (value.startsWith('personal:')) {
      update({
        skill_script_model: 'personal-api',
        skill_use_personal_api: true,
        skill_api_profile_id: value.slice('personal:'.length),
      });
      return;
    }
    update({
      skill_script_model: value.slice('platform:'.length) || 'doubao',
      skill_use_personal_api: false,
      skill_api_profile_id: null,
    });
  };

  const uploadScriptFile = async (file: File) => {
    const fd = new FormData();
    fd.append('file', file);
    const res = await fetch('/api/script/import', { method: 'POST', body: fd, credentials: 'same-origin' });
    const d = await res.json();
    if (!res.ok) throw new Error(d.error || '上传失败');
    update({ prompt: d.text });
  };

  const uploadAssetFile = async (file: File) => {
    const fd = new FormData();
    fd.append('file', file);
    const res = await fetch('/api/upload', { method: 'POST', body: fd, credentials: 'same-origin' });
    const d = await res.json();
    if (!res.ok) throw new Error(d.error || '上传失败');
    update({ imageUrl: d.url, previewImageUrl: d.url, sourceFileName: file.name, aspectRatio: '1:1' });
  };

  const handleGenerate = async () => {
    if (busy) return;
    setBusy(true);
    try {
      const store = useCanvasStore.getState();
      const pos = { x: (node.position.x ?? 0) + 400, y: node.position.y ?? 0 };
      const common = {
        use_personal_api: usePersonalApi && Boolean(selectedProfile),
        api_profile_id: usePersonalApi ? selectedProfile || null : null,
        style_id: styleId || null,
      };
      if (node.type === CANVAS_NODE_TYPES.aiVideo) {
        const jobId = await webApiGateway.submitGenerateVideoJob({
          prompt,
          model: usePersonalApi ? 'personal-api' : storedModel,
          size: String(data.resolution || '720p'),
          aspectRatio: ratio,
          seconds: Number(data.duration) || 5,
          extraParams: { ...common, optimize_prompt: data.optimize_prompt !== false },
        });
        const newNodeId = store.addNode(CANVAS_NODE_TYPES.video, pos, {
          displayName: '视频结果',
          videoUrl: null,
          isGenerating: true,
          generationStartedAt: Date.now(),
          generationDurationMs: 15 * 60 * 1000,
          generationJobId: jobId,
          ...common,
        });
        store.addEdge(node.id, newNodeId);
      } else {
        const jobId = await webApiGateway.submitGenerateImageJob({
          prompt,
          model: usePersonalApi ? 'personal-api' : storedModel,
          size: '2K',
          aspectRatio: ratio,
          referenceImages: [],
          extraParams: { ...common },
        });
        const newNodeId = store.addNode(CANVAS_NODE_TYPES.exportImage, pos, {
          displayName: '图片结果',
          aspectRatio: ratio,
          resultKind: 'generic',
          isGenerating: true,
          generationStartedAt: Date.now(),
          generationDurationMs: 60000,
          generationJobId: jobId,
          ...common,
        });
        store.addEdge(node.id, newNodeId);
      }
      onClose();
    } catch (e) {
      window.alert(e instanceof Error ? e.message : '生成失败');
    } finally {
      setBusy(false);
    }
  };

  const runSkill = async (skill: SkillItem) => {
    const input: Record<string, unknown> = {};
    const schema = (skill.input_schema || {}) as Record<string, string>;
    for (const key of Object.keys(schema)) {
      input[key] = key === 'requirement' ? requirement : (data.prompt || data.content || data.video_prompt || '');
    }
    if (!window.confirm('运行技能将调用文本模型并消耗积分，结果会写入当前节点的可编辑草稿。是否继续？')) return;
    setBusy(true);
    try {
      const r = await api<{ text?: string }>('/api/skills/' + encodeURIComponent(skill.id) + '/run', {
        method: 'POST',
        body: JSON.stringify({
          input,
          script_model: skillUsePersonalApi ? 'personal-api' : skillModel,
          use_personal_api: skillUsePersonalApi && Boolean(skillProfile),
          api_profile_id: skillUsePersonalApi ? skillProfile || null : null,
        }),
      });
      if (typeof r.text === 'string') {
        if (node.type === CANVAS_NODE_TYPES.textAnnotation) {
          update({ content: r.text, lastSkillId: skill.id });
        } else {
          update({ prompt: r.text, lastSkillId: skill.id });
        }
      }
    } catch (e) {
      window.alert(e instanceof Error ? e.message : '技能运行失败');
    } finally {
      setBusy(false);
    }
  };

  const insertAsset = (asset: AssetItem) => {
    const url = asset.url || asset.thumbnail_url || '';
    if (!url) return;
    const store = useCanvasStore.getState();
    const feedable = new Set<string>([CANVAS_NODE_TYPES.imageEdit, CANVAS_NODE_TYPES.aiVideo, CANVAS_NODE_TYPES.aiText, CANVAS_NODE_TYPES.storyboardGen]).has(node.type);
    const pos = feedable
      ? { x: (node.position.x ?? 0) - 340, y: node.position.y ?? 0 }
      : { x: (node.position.x ?? 0) + 400, y: node.position.y ?? 0 };
    const newNodeId = store.addNode(feedable ? CANVAS_NODE_TYPES.upload : CANVAS_NODE_TYPES.exportImage, pos, {
      displayName: asset.name,
      imageUrl: url,
      previewImageUrl: url,
      aspectRatio: '1:1',
      sourceFileName: asset.name,
    });
    if (feedable) store.addEdge(newNodeId, node.id);
    else store.addEdge(node.id, newNodeId);
    onClose();
  };

  const rect = nodeRect;
  const panelStyle: React.CSSProperties | undefined = rect
    ? {
        left: Math.max(8, Math.min(rect.left, window.innerWidth - PANEL_WIDTH - 8)),
        top: Math.min(rect.bottom + 8, window.innerHeight - 320),
        width: PANEL_WIDTH,
      }
    : { left: 24, top: 120, width: PANEL_WIDTH };

  const skillFilter: Record<string, string[]> = {
    aiTextNode: ['short-drama-novel-analyze', 'short-drama-write', 'short-drama-assets', 'short-drama-storyboard'],
    storyboardNode: ['seedance-prompt', 'seedance-sequence', 'seedance-camera', 'seedance-motion', 'seedance-characters', 'seedance-audio', 'short-drama-image-prompts', 'short-drama-video-prompts', 'short-drama-review'],
    storyboardGenNode: ['seedance-prompt', 'seedance-sequence', 'seedance-camera', 'seedance-motion', 'seedance-characters', 'seedance-audio', 'short-drama-image-prompts', 'short-drama-video-prompts'],
    imageNode: ['short-drama-image-prompts', 'short-drama-review'],
    aiVideoNode: ['seedance-prompt', 'seedance-continuation', 'seedance-camera', 'seedance-motion', 'seedance-audio', 'seedance-troubleshoot', 'short-drama-video-prompts'],
    uploadNode: ['short-drama-assets', 'seedance-characters'],
    textAnnotationNode: ['short-drama-review'],
    exportImageNode: ['short-drama-review', 'seedance-troubleshoot'],
    videoNode: ['short-drama-review', 'seedance-troubleshoot'],
  };
  const visibleSkills = skills.filter((s) => (skillFilter[node.type] || []).includes(s.id));

  const tabButton = (key: TabKey, label: string, Icon: typeof PenLine) => (
    <button
      type="button"
      className={'flex flex-1 items-center justify-center gap-1 rounded-md px-2 py-1.5 text-xs transition-colors ' + (tab === key ? 'bg-accent/15 text-accent' : 'text-text-muted hover:bg-bg-dark')}
      onClick={() => setTab(key)}
    >
      <Icon className="h-3.5 w-3.5" />
      {label}
    </button>
  );

  return (
    <div
      className="fixed z-[130] rounded-xl border border-[rgba(255,255,255,0.16)] bg-surface-dark/97 shadow-2xl backdrop-blur"
      style={panelStyle}
      onPointerDown={(e) => e.stopPropagation()}
      onMouseDown={(e) => e.stopPropagation()}
      onWheelCapture={(e) => e.stopPropagation()}
    >
      <div className="flex items-center justify-between border-b border-[rgba(255,255,255,0.1)] px-3 py-2">
        <div className="flex items-center gap-2 text-sm font-medium text-text-dark">
          <PenLine className="h-4 w-4 text-accent" />
          {String(data.displayName || node.type)}
        </div>
        <button type="button" className="rounded p-1 text-text-muted hover:bg-bg-dark hover:text-text-dark" onClick={onClose} aria-label="关闭">
          <X className="h-3.5 w-3.5" />
        </button>
      </div>
      <div className="flex gap-1 border-b border-[rgba(255,255,255,0.1)] px-2 py-1.5">
        {tabButton('params', '参数', PenLine)}
        {tabButton('skills', '技能', Sparkles)}
        {tabButton('assets', '资产', Tags)}
      </div>

      <div className="ui-scrollbar max-h-[46vh] overflow-y-auto p-3 text-sm text-text-dark">
        {tab === 'params' && (
          <div className="space-y-3">
            {node.type === CANVAS_NODE_TYPES.aiText && (
              <>
                <div className="flex items-center gap-2">
                  <label className="inline-flex cursor-pointer items-center gap-1 rounded-md border border-[var(--canvas-node-field-border)] bg-bg-dark/70 px-2.5 py-1.5 text-xs text-text-muted hover:bg-bg-dark">
                    <FileUp className="h-3.5 w-3.5" />
                    上传剧本文件
                    <input type="file" accept=".txt,.md,.docx" className="hidden"
                      onChange={(e: ChangeEvent<HTMLInputElement>) => {
                        const f = e.target.files?.[0];
                        if (f) { void uploadScriptFile(f).catch((err) => window.alert(err.message)); }
                        e.target.value = '';
                      }} />
                  </label>
                  <span className="text-xs text-text-muted">{prompt.length} 字</span>
                </div>
                <textarea
                  className="ui-scrollbar min-h-[140px] w-full resize-y rounded-lg border border-[var(--canvas-node-field-border)] bg-bg-dark/60 p-2 text-xs leading-5 text-text-dark outline-none focus:border-accent/60"
                  value={prompt}
                  placeholder="剧本文本（可编辑）"
                  onChange={(e) => update({ prompt: e.target.value })}
                />
              </>
            )}
            {node.type === CANVAS_NODE_TYPES.textAnnotation && (
              <textarea
                className="ui-scrollbar min-h-[120px] w-full resize-y rounded-lg border border-[var(--canvas-node-field-border)] bg-bg-dark/60 p-2 text-xs leading-5 text-text-dark outline-none focus:border-accent/60"
                value={content}
                placeholder="便签内容"
                onChange={(e) => update({ content: e.target.value })}
              />
            )}
            {node.type === CANVAS_NODE_TYPES.upload && (
              <div className="space-y-2">
                {typeof data.imageUrl === 'string' && data.imageUrl ? (
                  <img src={String(data.imageUrl)} alt="素材预览" className="max-h-[160px] w-full rounded-lg border border-[var(--canvas-node-field-border)] object-contain bg-black/40" />
                ) : <div className="rounded-lg border border-dashed border-[var(--canvas-node-field-border)] p-6 text-center text-xs text-text-muted">暂无图片</div>}
                <label className="inline-flex cursor-pointer items-center gap-1 rounded-md border border-[var(--canvas-node-field-border)] bg-bg-dark/70 px-2.5 py-1.5 text-xs text-text-muted hover:bg-bg-dark">
                  <ImageIcon className="h-3.5 w-3.5" />
                  重新上传
                  <input type="file" accept="image/*" className="hidden"
                    onChange={(e: ChangeEvent<HTMLInputElement>) => {
                      const f = e.target.files?.[0];
                      if (f) { void uploadAssetFile(f).catch((err) => window.alert(err.message)); }
                      e.target.value = '';
                    }} />
                </label>
              </div>
            )}
            {isGenerationNode(node) && (
              <>
                <textarea
                  className="ui-scrollbar min-h-[110px] w-full resize-y rounded-lg border border-[var(--canvas-node-field-border)] bg-bg-dark/60 p-2 text-xs leading-5 text-text-dark outline-none focus:border-accent/60"
                  value={prompt}
                  placeholder="提示词"
                  onChange={(e) => update({ prompt: e.target.value })}
                />
                <div className="flex flex-wrap gap-2">
                  <label className="text-xs text-text-muted">比例</label>
                  <select className="rounded-md border border-[var(--canvas-node-field-border)] bg-bg-dark/70 px-1.5 py-1 text-xs text-text-dark" value={ratio}
                    onChange={(e) => update({ ratio: e.target.value, requestAspectRatio: e.target.value })}>
                    {(node.type === CANVAS_NODE_TYPES.aiVideo ? VIDEO_RATIOS : IMAGE_RATIOS).map((r) => <option key={r} value={r}>{r}</option>)}
                  </select>
                  {node.type === CANVAS_NODE_TYPES.aiVideo && (
                    <select className="rounded-md border border-[var(--canvas-node-field-border)] bg-bg-dark/70 px-1.5 py-1 text-xs text-text-dark" value={String(data.resolution || '720p')}
                      onChange={(e) => update({ resolution: e.target.value })}>
                      {VIDEO_RESOLUTIONS.map((r) => <option key={r} value={r}>{r}</option>)}
                    </select>
                  )}
                  <select
                    aria-label="供应商与模型"
                    className="min-w-[150px] rounded-md border border-[var(--canvas-node-field-border)] bg-bg-dark/70 px-1.5 py-1 text-xs text-text-dark"
                    value={routeValue}
                    onChange={(e) => changeGenerationRoute(e.target.value)}
                  >
                    <optgroup label="平台供应商（与经典工作台一致）">
                      {platformModels.map((m) => <option key={m} value={'platform:' + m}>{m}</option>)}
                    </optgroup>
                    {profileOptions.length > 0 && (
                      <optgroup label="自己的 API（来自 API 设置）">
                        {profileOptions.map((p) => (
                          <option key={p.id} value={'personal:' + p.id}>
                            {String(p.name || p.model || p.id)}{p.provider ? ' · ' + p.provider : ''}
                          </option>
                        ))}
                      </optgroup>
                    )}
                  </select>
                </div>
                <div className="flex items-center justify-between rounded-md border border-[var(--canvas-node-field-border)] bg-bg-dark/40 px-2 py-1.5 text-[11px] text-text-muted">
                  <span>供应商、密钥、权限和计费均由经典工作台后端管理</span>
                  <span className="flex shrink-0 gap-2 pl-2">
                    <a className="text-accent hover:underline" href="/api-settings" target="_top">API 设置</a>
                    {isAdmin && <a className="text-accent hover:underline" href="/admin" target="_top">管理后台</a>}
                  </span>
                </div>
                <div>
                  <div className="mb-1 text-xs text-text-muted">风格（缩略图）</div>
                  <div className="flex max-h-[104px] flex-wrap gap-1.5 overflow-y-auto">
                    {styles.length === 0 && <span className="text-xs text-text-muted">暂无风格</span>}
                    {styles.map((s) => (
                      <button
                        key={s.id}
                        type="button"
                        title={s.name}
                        className={'relative h-12 w-12 overflow-hidden rounded-md border-2 ' + (styleId === s.id ? 'border-accent' : 'border-[var(--canvas-node-field-border)] hover:border-accent/50')}
                        onClick={() => update({ styleId: s.id === styleId ? '' : s.id, style_id: s.id === styleId ? '' : s.id })}
                      >
                        {s.thumbnail_url ? (
                          <img src={s.thumbnail_url} alt={s.name} className="h-full w-full object-cover" />
                        ) : (
                          <span className="flex h-full w-full items-center justify-center bg-bg-dark text-[10px] text-text-muted">{s.name.slice(0, 4)}</span>
                        )}
                      </button>
                    ))}
                  </div>
                </div>
                <button
                  type="button"
                  disabled={busy || !prompt.trim()}
                  className="w-full rounded-md bg-accent px-3 py-2 text-xs font-medium text-white transition-opacity hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-40"
                  onClick={() => void handleGenerate()}
                >
                  {busy ? '提交中…' : '生成（走 Manga Studio 接口）'}
                </button>
              </>
            )}
            {!isGenerationNode(node) && node.type !== CANVAS_NODE_TYPES.aiText && node.type !== CANVAS_NODE_TYPES.textAnnotation && node.type !== CANVAS_NODE_TYPES.upload && (
              <div className="text-xs text-text-muted">该节点参数较少，请使用节点本身编辑或查看预览。</div>
            )}
            {new Set<string>([CANVAS_NODE_TYPES.exportImage, CANVAS_NODE_TYPES.video]).has(node.type) && typeof data.mediaUrl === 'string' && data.mediaUrl && (
              <a className="inline-flex items-center gap-1 rounded-md border border-[var(--canvas-node-field-border)] bg-bg-dark/70 px-2.5 py-1.5 text-xs text-text-muted hover:bg-bg-dark"
                href={'/api/history/media?download=1&url=' + encodeURIComponent(String(data.mediaUrl))}>下载结果</a>
            )}
          </div>
        )}

        {tab === 'skills' && (
          <div className="space-y-2">
            <div className="rounded-lg border border-[var(--canvas-node-field-border)] bg-bg-dark/40 p-2.5">
              <div className="mb-1.5 text-[11px] text-text-muted">文本供应商（与经典工作台一致）</div>
              <select
                aria-label="技能文本供应商与模型"
                className="w-full rounded-md border border-[var(--canvas-node-field-border)] bg-bg-dark/70 px-2 py-1.5 text-xs text-text-dark"
                value={skillRouteValue}
                onChange={(e) => changeSkillRoute(e.target.value)}
              >
                <optgroup label="平台文本模型">
                  {textModels.map((m) => <option key={m} value={'platform:' + m}>{m}</option>)}
                </optgroup>
                {textProfileOptions.length > 0 && (
                  <optgroup label="自己的文本 API">
                    {textProfileOptions.map((p) => (
                      <option key={p.id} value={'personal:' + p.id}>
                        {String(p.name || p.model || p.id)}{p.provider ? ' · ' + p.provider : ''}
                      </option>
                    ))}
                  </optgroup>
                )}
              </select>
              <div className="mt-1.5 flex justify-end gap-2 text-[11px]">
                <a className="text-accent hover:underline" href="/api-settings" target="_top">API 设置</a>
                {isAdmin && <a className="text-accent hover:underline" href="/admin" target="_top">管理后台</a>}
              </div>
            </div>
            {visibleSkills.length === 0 && <div className="text-xs text-text-muted">该节点暂无可用技能。</div>}
            {visibleSkills.map((s) => (
              <div key={s.id} className="rounded-lg border border-[var(--canvas-node-field-border)] bg-bg-dark/40 p-2.5">
                <div className="text-xs font-medium text-text-dark">{s.title}</div>
                <div className="mt-0.5 text-[11px] leading-4 text-text-muted">{s.description}</div>
                <input
                  className="mt-2 w-full rounded-md border border-[var(--canvas-node-field-border)] bg-bg-dark/60 px-2 py-1 text-xs text-text-dark outline-none focus:border-accent/60"
                  placeholder="补充要求（可选）"
                  value={requirement}
                  onChange={(e) => setRequirement(e.target.value)}
                />
                <button
                  type="button"
                  disabled={busy}
                  className="mt-2 w-full rounded-md border border-accent/40 bg-accent/15 px-2 py-1.5 text-xs text-accent hover:bg-accent/25 disabled:opacity-40"
                  onClick={() => void runSkill(s)}
                >
                  {busy ? '运行中…' : '运行（生成可编辑草稿）'}
                </button>
              </div>
            ))}
          </div>
        )}

        {tab === 'assets' && (
          <div className="space-y-1">
            {assets.length === 0 && <div className="text-xs text-text-muted">资产库为空，请先在首页资产库添加素材。</div>}
            <div className="grid grid-cols-3 gap-1.5">
              {assets.map((a) => (
                <button
                  key={a.kind + ':' + a.id}
                  type="button"
                  title={a.name}
                  className="overflow-hidden rounded-md border border-[var(--canvas-node-field-border)] bg-bg-dark/40 hover:border-accent/50"
                  onClick={() => insertAsset(a)}
                >
                  {a.url || a.thumbnail_url ? (
                    <img src={a.url || a.thumbnail_url} alt={a.name} className="h-14 w-full object-cover" />
                  ) : (
                    <div className="flex h-14 w-full items-center justify-center bg-bg-dark text-[10px] text-text-muted">{a.name.slice(0, 6)}</div>
                  )}
                  <div className="truncate px-1 py-0.5 text-[10px] text-text-muted">{a.name}</div>
                </button>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

export const MangaNodeEditPanel = memo(function MangaNodeEditPanel(props: {
  node: CanvasNode;
  isOpen: boolean;
  onClose: () => void;
}) {
  if (!props.isOpen) return null;
  return createPortal(<MangaNodeEditPanelInner node={props.node} onClose={props.onClose} />, document.body);
});
