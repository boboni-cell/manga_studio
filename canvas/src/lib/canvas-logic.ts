import { upstreamAllOfType, upstreamOfType } from '../api';
import type { AssetRef, CanvasEdge, CanvasNode, ShotSegment } from '../types';

export interface SerializedNode {
  id: string;
  type?: string;
  position: { x: number; y: number };
  data: Record<string, unknown>;
}

export interface SerializedEdge {
  id: string;
  source: string;
  target: string;
  label?: string;
}

export function serializeNode(node: CanvasNode): SerializedNode {
  return {
    id: node.id,
    type: node.type,
    position: { x: node.position.x, y: node.position.y },
    data: node.data,
  };
}

export function serializeNodes(nodes: CanvasNode[]): SerializedNode[] {
  return nodes.map(serializeNode);
}

export function serializeEdge(edge: CanvasEdge): SerializedEdge {
  return { id: edge.id, source: edge.source, target: edge.target };
}

export function serializeEdges(edges: CanvasEdge[]): SerializedEdge[] {
  return edges.map(serializeEdge);
}

export function gridPositionFor(index: number): { x: number; y: number } {
  const cols = 4;
  const row = Math.floor(Math.max(0, index) / cols);
  const col = Math.max(0, index) % cols;
  return { x: 80 + col * 320, y: 80 + row * 320 };
}

export interface NextStepOption {
  type: string;
  label: string;
}

export function nextStepOptions(node: CanvasNode): NextStepOption[] {
  const type = node.type;
  if (type === 'script') return [{ type: 'shot', label: '镜头段落' }];
  if (type === 'shot') {
    return [
      { type: 'asset', label: '素材引用' },
      { type: 'image', label: '图片生成' },
      { type: 'video', label: '视频生成' },
    ];
  }
  if (type === 'asset') {
    return [
      { type: 'image', label: '图片生成' },
      { type: 'video', label: '视频生成' },
    ];
  }
  if (type === 'image') return [{ type: 'video', label: '视频生成' }];
  if (type === 'result') {
    const kind = node.data && node.data.kind;
    if (kind === 'image') return [{ type: 'video', label: '视频生成' }];
    if (kind === 'video') return [{ type: 'video', label: '续接下一段' }];
  }
  return [];
}

export interface BranchGroup {
  title: string;
  options: { type: string; label: string }[];
}

export function branchGroups(node: CanvasNode): BranchGroup[] {
  const type = node.type;
  if (type === 'script') return [{ title: '创建', options: [{ type: 'shot', label: '镜头段落' }] }];
  if (type === 'shot') {
    return [
      { title: '添加', options: [{ type: 'asset', label: '素材引用' }] },
      { title: '生成', options: [{ type: 'image', label: '图片' }, { type: 'video', label: '视频' }] },
    ];
  }
  if (type === 'asset') return [{ title: '生成', options: [{ type: 'image', label: '图片' }, { type: 'video', label: '视频' }] }];
  if (type === 'image') return [{ title: '生成', options: [{ type: 'video', label: '视频' }] }];
  if (type === 'result') {
    if (node.data && node.data.kind === 'image') return [{ title: '生成', options: [{ type: 'video', label: '视频' }] }];
    if (node.data && node.data.kind === 'video') return [{ title: '续接', options: [{ type: 'video', label: '视频' }] }];
  }
  return [];
}

export function nextNodePosition(source: CanvasNode, nodes: CanvasNode[], stepX = 340, stepY = 320): { x: number; y: number } {
  const x = source.position.x + stepX;
  let y = source.position.y;
  for (let i = 0; i < 200; i += 1) {
    const overlaps = nodes.some((node) => Math.abs(node.position.x - x) < 40 && Math.abs(node.position.y - y) < 40);
    if (!overlaps) break;
    y += stepY;
  }
  return { x, y };
}

export function characterDisplayName(key: string, ch: Record<string, unknown> | undefined): string {
  const name = ch && typeof ch.name === 'string' && ch.name.trim().length > 0 ? ch.name.trim() : key;
  return name;
}

export function personalApiProfiles(settings: Record<string, unknown>, kind: 'text' | 'image' | 'video'): any[] {
  const apiProfiles = settings && typeof settings.api_profiles === 'object' ? settings.api_profiles as Record<string, unknown> : {};
  const list = apiProfiles[kind];
  return Array.isArray(list) ? list : [];
}

export function pickApiProfile(profiles: any[] | undefined, profileId: string | null | undefined): any | null {
  if (!Array.isArray(profiles) || profiles.length === 0) return null;
  if (profileId) {
    const found = profiles.find((profile) => profile && profile.id === profileId);
    if (found) return found;
  }
  return profiles[0] || null;
}

export function defaultApiProfileId(profiles: any[] | undefined, selectedId: string | null | undefined): string | null {
  const list = Array.isArray(profiles) ? profiles : [];
  if (list.length === 0) return null;
  if (selectedId && list.some((profile) => profile && profile.id === selectedId)) return String(selectedId);
  return list[0] && list[0].id ? String(list[0].id) : null;
}

export function isValidApiProfileId(profiles: any[] | undefined, profileId: string | null | undefined): boolean {
  const list = Array.isArray(profiles) ? profiles : [];
  if (!profileId) return false;
  return list.some((profile) => profile && profile.id === profileId);
}

export function segmentPrompt(segment: ShotSegment | undefined): string {
  if (!segment) return '';
  const vp = String(segment.video_prompt || segment.visual_prompt || segment.story_action || segment.action || '');
  const timelineText = String(segment.timeline_text || '');
  const timelineArr = Array.isArray(segment.timeline)
    ? segment.timeline.map((item) => (typeof item === 'string' ? item : '')).filter(Boolean).join(String.fromCharCode(10))
    : '';
  const timeline = timelineText || timelineArr;
  return timeline ? vp + String.fromCharCode(10) + '【' + String(segment.duration || 5) + '秒精准分镜时序脚本】' + String.fromCharCode(10) + timeline : vp;
}

export interface VideoInputs {
  script: string;
  images: { url: string; role_label: string }[];
  audioUrl: string;
  videoUrl: string;
  firstUrl: string;
  lastUrl: string;
  storyboardUrl: string;
}

export function resolveVideoInputs(nodeId: string, nodes: CanvasNode[], edges: CanvasEdge[]): VideoInputs {
  const shot = upstreamOfType(nodeId, 'shot', nodes, edges);
  const scriptNode = upstreamOfType(nodeId, 'script', nodes, edges);
  const script = shot ? segmentPrompt(shot.data.segment as ShotSegment) : (scriptNode ? String(scriptNode.data.script || '') : '');

  const assets = upstreamAllOfType(nodeId, 'asset', nodes, edges);
  const refs: AssetRef[] = [];
  for (const asset of assets) {
    const list = (asset.data.refs as AssetRef[]) || [];
    for (const ref of list) refs.push(ref);
  }

  const images: { url: string; role_label: string }[] = [];
  let audioUrl = '';
  let videoUrl = '';
  for (const ref of refs) {
    if (ref.role_label === '参考音频') audioUrl = ref.url;
    else if (ref.role_label === '参考视频') videoUrl = ref.url;
    else if (ref.url) images.push({ url: ref.url, role_label: ref.role_label });
  }

  if (!videoUrl) {
    const resultNodes = upstreamAllOfType(nodeId, 'result', nodes, edges);
    const previousVideo = resultNodes.find((node) => node.data.kind === 'video' && node.data.media_url);
    if (previousVideo) videoUrl = String(previousVideo.data.media_url);
  }

  const imageNodes = upstreamAllOfType(nodeId, 'image', nodes, edges);
  const storyboard = imageNodes.find((node) => node.data.role === 'storyboard');
  const first = imageNodes.find((node) => node.data.role === 'first_frame');
  const last = imageNodes.find((node) => node.data.role === 'last_frame');

  return {
    script,
    images,
    audioUrl,
    videoUrl,
    firstUrl: first ? String(first.data.image_url || '') : '',
    lastUrl: last ? String(last.data.image_url || '') : '',
    storyboardUrl: storyboard ? String(storyboard.data.image_url || '') : '',
  };
}

export function resolveVideoCaps(args: {
  model: string;
  usePersonalApi: boolean;
  apiProfileId: string | null | undefined;
  profiles: any[];
  modelCaps: Record<string, any>;
}): Record<string, any> {
  if (args.model === 'personal-api' || args.usePersonalApi) {
    const profile = pickApiProfile(args.profiles, args.apiProfileId);
    if (profile && profile.capabilities) return profile.capabilities;
    if (profile && profile.model) return args.modelCaps[profile.model] || {};
    return {};
  }
  return args.modelCaps[args.model] || {};
}

export interface CapabilityGateResult {
  ok: boolean;
  error?: string;
}

export function validateVideoCapabilities(args: {
  model: string;
  caps: Record<string, any>;
  inputs: VideoInputs;
  ratio: string;
  duration: number;
  resolution: string;
}): CapabilityGateResult {
  const cap = args.caps || {};
  if (args.inputs.firstUrl && cap.supports_first_frame === false) {
    return { ok: false, error: '当前模型不支持首帧，请移除首帧连接后重试' };
  }
  if (args.inputs.lastUrl && cap.supports_last_frame === false) {
    return { ok: false, error: '当前模型不支持尾帧，请移除尾帧连接后重试' };
  }
  if ((args.inputs.storyboardUrl || args.inputs.images.length > 0) && cap.supports_reference_images === false) {
    return { ok: false, error: '当前模型不支持参考图/分镜图，请移除相关素材连接后重试' };
  }
  if (args.inputs.audioUrl && cap.supports_reference_audio === false) {
    return { ok: false, error: '当前模型不支持参考音频，请移除音频连接后重试' };
  }
  if (args.inputs.videoUrl && cap.supports_reference_video === false) {
    return { ok: false, error: '当前模型不支持参考视频，请移除参考视频连接后重试' };
  }
  if (args.model === 'seedance' && args.inputs.lastUrl && !args.inputs.firstUrl) {
    return { ok: false, error: 'Seedance 严格尾帧模式必须同时提供首帧图' };
  }
  const ratios = Array.isArray(cap.ratios) ? cap.ratios : null;
  if (ratios && ratios.indexOf(args.ratio) < 0) {
    return { ok: false, error: '当前模型不支持比例 ' + args.ratio };
  }
  const resolutions = Array.isArray(cap.resolutions) ? cap.resolutions : null;
  if (resolutions && resolutions.indexOf(args.resolution) < 0) {
    return { ok: false, error: '当前模型不支持分辨率 ' + args.resolution };
  }
  const minDuration = typeof cap.min_duration === 'number' ? cap.min_duration : null;
  const maxDuration = typeof cap.max_duration === 'number' ? cap.max_duration : null;
  if ((minDuration !== null && args.duration < minDuration) || (maxDuration !== null && args.duration > maxDuration)) {
    const minText = minDuration === null ? '' : String(minDuration);
    const maxText = maxDuration === null ? '' : String(maxDuration);
    return { ok: false, error: '当前模型时长仅支持 ' + minText + '-' + maxText + ' 秒' };
  }
  return { ok: true };
}

export function buildScriptSplitPayload(args: {
  script: string;
  mode: string;
  model: string;
  usePersonalApi: boolean;
  apiProfileId: string | null | undefined;
  styleId: string | null | undefined;
}): Record<string, unknown> {
  return {
    script: args.script,
    mode: args.mode,
    script_model: args.model,
    use_personal_api: args.usePersonalApi,
    api_profile_id: args.usePersonalApi ? args.apiProfileId || null : null,
    style_id: args.styleId || null,
  };
}

export function buildImagePayload(args: {
  prompt: string;
  imageModel: string;
  ratio: string;
  inputImages: { url: string; role_label: string }[];
  usePersonalApi: boolean;
  apiProfileId: string | null | undefined;
  styleId: string | null | undefined;
}): Record<string, unknown> {
  return {
    prompt: args.prompt,
    image_model: args.imageModel,
    ratio: args.ratio,
    mode: 'storyboard',
    input_images: args.inputImages,
    style_id: args.styleId || null,
    use_personal_api: args.usePersonalApi,
    api_profile_id: args.usePersonalApi ? args.apiProfileId || null : null,
  };
}

export function buildVideoPayload(args: {
  inputs: VideoInputs;
  ratio: string;
  duration: number;
  resolution: string;
  optimize: boolean;
  model: string;
  usePersonalApi: boolean;
  apiProfileId: string | null | undefined;
  styleId: string | null | undefined;
}): Record<string, unknown> {
  return {
    script: args.inputs.script,
    images: args.inputs.images,
    audio_url: args.inputs.audioUrl || undefined,
    video_url: args.inputs.videoUrl || undefined,
    first_frame_url: args.inputs.firstUrl || undefined,
    last_frame_url: args.inputs.lastUrl || undefined,
    storyboard_ref_url: args.inputs.storyboardUrl || undefined,
    ratio: args.ratio,
    duration: args.duration,
    optimize_prompt: args.optimize,
    video_model: args.model,
    use_personal_api: args.usePersonalApi,
    api_profile_id: args.usePersonalApi ? args.apiProfileId || null : null,
    style_id: args.styleId || null,
    resolution: args.resolution,
  };
}
