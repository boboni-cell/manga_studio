import { describe, it, expect } from 'vitest';
import {
  branchGroups,
  buildImagePayload,
  buildScriptSplitPayload,
  buildVideoPayload,
  characterDisplayName,
  defaultApiProfileId,
  gridPositionFor,
  isValidApiProfileId,
  nextNodePosition,
  nextStepOptions,
  personalApiProfiles,
  pickApiProfile,
  resolveVideoCaps,
  resolveVideoInputs,
  serializeEdge,
  serializeEdges,
  serializeNode,
  serializeNodes,
  validateVideoCapabilities,
} from './canvas-logic';
import type { CanvasNode, CanvasEdge } from '../types';

describe('serializeNodes', () => {
  it('strips React Flow runtime fields', () => {
    const node = {
      id: 'n1',
      type: 'result',
      position: { x: 10, y: 20 },
      data: { label: '结果', kind: 'image' },
      measured: { width: 100, height: 50 },
      selected: true,
      dragging: false,
      width: 120,
      height: 60,
    } as unknown as CanvasNode;
    const result = serializeNode(node);
    expect(result).toEqual({ id: 'n1', type: 'result', position: { x: 10, y: 20 }, data: { label: '结果', kind: 'image' } });
    expect(result).not.toHaveProperty('measured');
    expect(result).not.toHaveProperty('selected');
    expect(result).not.toHaveProperty('dragging');
    expect(result).not.toHaveProperty('width');
    expect(result).not.toHaveProperty('height');
  });

  it('serializes edges to id/source/target/label only', () => {
    const edge = { id: 'e1', source: 'n1', target: 'n2', label: '结果', selected: false, animated: true } as unknown as CanvasEdge;
    expect(serializeEdge(edge)).toEqual({ id: 'e1', source: 'n1', target: 'n2' });
    expect(serializeEdges([edge, { id: 'e2', source: 'n2', target: 'n3', label: '' } as CanvasEdge])[1]).toEqual({ id: 'e2', source: 'n2', target: 'n3' });
  });
});

describe('gridPositionFor', () => {
  it('places six consecutive nodes without overlap', () => {
    const positions = [0, 1, 2, 3, 4, 5].map(gridPositionFor);
    const keys = positions.map((p) => p.x + ':' + p.y);
    expect(new Set(keys).size).toBe(6);
    expect(positions[0]).toEqual({ x: 80, y: 80 });
    expect(positions[1].x - positions[0].x).toBe(320);
    expect(positions[4].y - positions[0].y).toBe(320);
    expect(positions[4].x).toBe(80);
  });
});

describe('characterDisplayName', () => {
  it('prefers ch.name over the object key', () => {
    expect(characterDisplayName('char_1', { name: '顾诀' })).toBe('顾诀');
    expect(characterDisplayName('char_2', {})).toBe('char_2');
    expect(characterDisplayName('char_3', { name: '   ' })).toBe('char_3');
  });
});

describe('personal api profiles', () => {
  const settings = {
    api_profiles: {
      text: [{ id: 't1', name: '文本接口' }],
      image: [],
      video: [{ id: 'v1', name: '视频接口' }, { id: 'v2', name: '视频接口2' }],
    },
  };

  it('maps text/image/video profiles from settings', () => {
    expect(personalApiProfiles(settings, 'text')).toHaveLength(1);
    expect(personalApiProfiles(settings, 'image')).toHaveLength(0);
    expect(personalApiProfiles(settings, 'video')).toHaveLength(2);
  });

  it('picks profile by id and falls back to first', () => {
    expect(pickApiProfile(settings.api_profiles.video, 'v2')?.id).toBe('v2');
    expect(pickApiProfile(settings.api_profiles.video, null)?.id).toBe('v1');
    expect(pickApiProfile(undefined, 'x')).toBeNull();
  });
});

describe('validateVideoCapabilities', () => {
  const baseInputs = {
    script: '镜头一',
    images: [],
    audioUrl: '',
    videoUrl: '',
    firstUrl: '',
    lastUrl: '',
    storyboardUrl: '',
  };

  it('blocks unsupported first frame', () => {
    const r = validateVideoCapabilities({ model: 'm', caps: { supports_first_frame: false }, inputs: { ...baseInputs, firstUrl: 'http://first' }, ratio: '9:16', duration: 5, resolution: '720p' });
    expect(r.ok).toBe(false);
    expect(r.error).toContain('首帧');
  });

  it('blocks unsupported last frame', () => {
    const r = validateVideoCapabilities({ model: 'm', caps: { supports_last_frame: false }, inputs: { ...baseInputs, lastUrl: 'http://last' }, ratio: '9:16', duration: 5, resolution: '720p' });
    expect(r.ok).toBe(false);
    expect(r.error).toContain('尾帧');
  });

  it('blocks unsupported reference images', () => {
    const r = validateVideoCapabilities({ model: 'm', caps: { supports_reference_images: false }, inputs: { ...baseInputs, images: [{ url: 'http://img', role_label: '角色参考' }] }, ratio: '9:16', duration: 5, resolution: '720p' });
    expect(r.ok).toBe(false);
    expect(r.error).toContain('参考图');
  });

  it('blocks unsupported audio', () => {
    const r = validateVideoCapabilities({ model: 'm', caps: { supports_reference_audio: false }, inputs: { ...baseInputs, audioUrl: 'http://audio' }, ratio: '9:16', duration: 5, resolution: '720p' });
    expect(r.ok).toBe(false);
    expect(r.error).toContain('音频');
  });

  it('blocks unsupported reference video', () => {
    const r = validateVideoCapabilities({ model: 'm', caps: { supports_reference_video: false }, inputs: { ...baseInputs, videoUrl: 'http://video' }, ratio: '9:16', duration: 5, resolution: '720p' });
    expect(r.ok).toBe(false);
    expect(r.error).toContain('参考视频');
  });

  it('blocks seedance last frame without first frame', () => {
    const r = validateVideoCapabilities({ model: 'seedance', caps: { supports_first_frame: true, supports_last_frame: true }, inputs: { ...baseInputs, lastUrl: 'http://last' }, ratio: '9:16', duration: 5, resolution: '720p' });
    expect(r.ok).toBe(false);
    expect(r.error).toContain('Seedance');
  });

  it('blocks unsupported ratio/resolution/duration', () => {
    expect(validateVideoCapabilities({ model: 'm', caps: { ratios: ['16:9'] }, inputs: baseInputs, ratio: '9:16', duration: 5, resolution: '720p' }).ok).toBe(false);
    expect(validateVideoCapabilities({ model: 'm', caps: { resolutions: ['720p'] }, inputs: baseInputs, ratio: '9:16', duration: 5, resolution: '480p' }).ok).toBe(false);
    expect(validateVideoCapabilities({ model: 'm', caps: { min_duration: 4, max_duration: 15 }, inputs: baseInputs, ratio: '9:16', duration: 20, resolution: '720p' }).ok).toBe(false);
  });

  it('allows when caps are unknown or supported', () => {
    expect(validateVideoCapabilities({ model: 'm', caps: {}, inputs: baseInputs, ratio: '9:16', duration: 5, resolution: '720p' }).ok).toBe(true);
  });
});

describe('request payload builders', () => {
  it('builds video payload with original workbench fields', () => {
    const inputs = {
      script: '镜头一',
      images: [{ url: 'http://img', role_label: '角色参考' }],
      audioUrl: 'http://audio',
      videoUrl: 'http://video',
      firstUrl: 'http://first',
      lastUrl: 'http://last',
      storyboardUrl: 'http://storyboard',
    };
    const payload = buildVideoPayload({ inputs, ratio: '9:16', duration: 8, resolution: '720p', optimize: true, model: 'seedance', usePersonalApi: false, apiProfileId: null, styleId: 'style_1' });
    expect(payload.script).toBe('镜头一');
    expect(payload.images).toEqual(inputs.images);
    expect(payload.audio_url).toBe('http://audio');
    expect(payload.video_url).toBe('http://video');
    expect(payload.first_frame_url).toBe('http://first');
    expect(payload.last_frame_url).toBe('http://last');
    expect(payload.storyboard_ref_url).toBe('http://storyboard');
    expect(payload.ratio).toBe('9:16');
    expect(payload.duration).toBe(8);
    expect(payload.optimize_prompt).toBe(true);
    expect(payload.video_model).toBe('seedance');
    expect(payload.style_id).toBe('style_1');
    expect(payload.resolution).toBe('720p');
  });

  it('builds image payload with storyboard mode', () => {
    const payload = buildImagePayload({ prompt: 'p', imageModel: 'personal-api', ratio: '9:16', inputImages: [{ url: 'http://img', role_label: '角色参考' }], usePersonalApi: true, apiProfileId: 'img1', styleId: 'style_2' });
    expect(payload.mode).toBe('storyboard');
    expect(payload.image_model).toBe('personal-api');
    expect(payload.use_personal_api).toBe(true);
    expect(payload.api_profile_id).toBe('img1');
    expect(payload.style_id).toBe('style_2');
  });

  it('builds script split payload', () => {
    const payload = buildScriptSplitPayload({ script: 's', mode: 'smart', model: 'personal-api', usePersonalApi: true, apiProfileId: 'txt1', styleId: null });
    expect(payload.script).toBe('s');
    expect(payload.script_model).toBe('personal-api');
    expect(payload.use_personal_api).toBe(true);
    expect(payload.api_profile_id).toBe('txt1');
  });
});

describe('resolveVideoInputs', () => {
  it('maps asset reference video and shot script from upstream nodes', () => {
    const nodes = [
      { id: 'shot1', type: 'shot', position: { x: 0, y: 0 }, data: { segment: { video_prompt: '镜头一内容', duration: 8 } } },
      { id: 'asset1', type: 'asset', position: { x: 0, y: 0 }, data: { asset_type: 'video', refs: [{ source: 'video', ref_id: null, name: '历史视频', url: 'http://video', role_label: '参考视频' }] } },
      { id: 'video1', type: 'video', position: { x: 0, y: 0 }, data: {} },
    ] as unknown as CanvasNode[];
    const edges = [
      { id: 'e1', source: 'shot1', target: 'video1' },
      { id: 'e2', source: 'asset1', target: 'video1' },
    ] as CanvasEdge[];
    const inputs = resolveVideoInputs('video1', nodes, edges);
    expect(inputs.script).toContain('镜头一内容');
    expect(inputs.videoUrl).toBe('http://video');
  });
});

describe('resolveVideoCaps', () => {
  it('uses the selected personal profile capabilities, not a global default', () => {
    const caps = resolveVideoCaps({
      model: 'personal-api',
      usePersonalApi: true,
      apiProfileId: 'v2',
      profiles: [
        { id: 'v1', model: 'a', capabilities: { supports_first_frame: true } },
        { id: 'v2', model: 'b', capabilities: { supports_first_frame: false } },
      ],
      modelCaps: { a: { supports_first_frame: true }, b: { supports_first_frame: false } },
    });
    expect(caps.supports_first_frame).toBe(false);
  });
});
describe('resolveVideoInputs (video result node)', () => {
  it('reads videoUrl from an upstream video result node', () => {
    const nodes = [
      { id: 'res1', type: 'result', position: { x: 0, y: 0 }, data: { label: '视频结果', kind: 'video', media_url: 'http://prev.mp4' } },
      { id: 'video1', type: 'video', position: { x: 0, y: 0 }, data: {} },
    ] as unknown as CanvasNode[];
    const edges = [{ id: 'e1', source: 'res1', target: 'video1' }] as CanvasEdge[];
    const inputs = resolveVideoInputs('video1', nodes, edges);
    expect(inputs.videoUrl).toBe('http://prev.mp4');
  });
});

describe('defaultApiProfileId', () => {
  it('prefers selected text profile even when not first', () => {
    const profiles = [{ id: 't1' }, { id: 't2' }];
    expect(defaultApiProfileId(profiles, 't2')).toBe('t2');
  });
  it('prefers selected image profile even when not first', () => {
    const profiles = [{ id: 'i1' }, { id: 'i2' }, { id: 'i3' }];
    expect(defaultApiProfileId(profiles, 'i3')).toBe('i3');
  });
  it('prefers selected video profile even when not first', () => {
    const profiles = [{ id: 'v1' }, { id: 'v2' }];
    expect(defaultApiProfileId(profiles, 'v2')).toBe('v2');
  });
  it('falls back to profiles[0] when selected id is missing or invalid', () => {
    expect(defaultApiProfileId([{ id: 'v1' }, { id: 'v2' }], 'v9')).toBe('v1');
    expect(defaultApiProfileId([{ id: 'v1' }], null)).toBe('v1');
    expect(defaultApiProfileId([], 'v1')).toBeNull();
  });
});

describe('isValidApiProfileId', () => {
  it('validates against the current kind profile list', () => {
    expect(isValidApiProfileId([{ id: 'v2' }], 'v2')).toBe(true);
    expect(isValidApiProfileId([{ id: 'v2' }], 'v9')).toBe(false);
    expect(isValidApiProfileId([{ id: 'v2' }], null)).toBe(false);
  });
});

describe('personal api consistency', () => {
  it('buildVideoPayload and resolveVideoCaps use the same api_profile_id', () => {
    const apiProfileId = 'v2';
    const profiles = [{ id: 'v1', model: 'a', capabilities: { supports_first_frame: true } }, { id: 'v2', model: 'b', capabilities: { supports_first_frame: false } }];
    const caps = resolveVideoCaps({ model: 'personal-api', usePersonalApi: true, apiProfileId, profiles, modelCaps: { a: {}, b: {} } });
    const payload = buildVideoPayload({ inputs: { script: 's', images: [], audioUrl: '', videoUrl: '', firstUrl: '', lastUrl: '', storyboardUrl: '' }, ratio: '9:16', duration: 5, resolution: '720p', optimize: true, model: 'personal-api', usePersonalApi: true, apiProfileId, styleId: null });
    expect(caps.supports_first_frame).toBe(false);
    expect(payload.api_profile_id).toBe('v2');
    expect(payload.use_personal_api).toBe(true);
  });
});
describe('branchGroups', () => {
  it('groups successors by action', () => {
    expect(branchGroups({ id: 's', type: 'script', position: { x: 0, y: 0 }, data: {} } as CanvasNode)).toEqual([{ title: '创建', options: [{ type: 'shot', label: '镜头段落' }] }]);
    expect(branchGroups({ id: 'sh', type: 'shot', position: { x: 0, y: 0 }, data: {} } as CanvasNode).map((g) => g.title)).toEqual(['添加', '生成']);
    expect(branchGroups({ id: 'r', type: 'result', position: { x: 0, y: 0 }, data: { kind: 'video' } } as CanvasNode)[0].title).toBe('续接');
    expect(branchGroups({ id: 'v', type: 'video', position: { x: 0, y: 0 }, data: {} } as CanvasNode)).toEqual([]);
  });
});

describe('nextStepOptions', () => {
  it('maps successors per node type and result kind', () => {
    expect(nextStepOptions({ id: 's', type: 'script', position: { x: 0, y: 0 }, data: {} } as CanvasNode).map((o) => o.type)).toEqual(['shot']);
    expect(nextStepOptions({ id: 'sh', type: 'shot', position: { x: 0, y: 0 }, data: {} } as CanvasNode).map((o) => o.type)).toEqual(['asset', 'image', 'video']);
    expect(nextStepOptions({ id: 'a', type: 'asset', position: { x: 0, y: 0 }, data: {} } as CanvasNode).map((o) => o.type)).toEqual(['image', 'video']);
    expect(nextStepOptions({ id: 'i', type: 'image', position: { x: 0, y: 0 }, data: {} } as CanvasNode).map((o) => o.type)).toEqual(['video']);
    expect(nextStepOptions({ id: 'r1', type: 'result', position: { x: 0, y: 0 }, data: { kind: 'image' } } as CanvasNode).map((o) => o.type)).toEqual(['video']);
    expect(nextStepOptions({ id: 'r2', type: 'result', position: { x: 0, y: 0 }, data: { kind: 'video' } } as CanvasNode)[0].label).toBe('续接下一段');
    expect(nextStepOptions({ id: 'v', type: 'video', position: { x: 0, y: 0 }, data: {} } as CanvasNode)).toEqual([]);
  });
});

describe('nextNodePosition', () => {
  it('places to the right and shifts down to avoid overlap', () => {
    const source = { id: 's', type: 'script', position: { x: 100, y: 200 }, data: {} } as CanvasNode;
    const existing = [{ id: 'a', type: 'asset', position: { x: 440, y: 200 }, data: {} } as CanvasNode];
    expect(nextNodePosition(source, existing)).toEqual({ x: 440, y: 520 });
    expect(nextNodePosition(source, [] as CanvasNode[])).toEqual({ x: 440, y: 200 });
  });

  it('creates five consecutive positions without overlap', () => {
    const source = { id: 's', type: 'script', position: { x: 100, y: 100 }, data: {} } as CanvasNode;
    const nodes = [] as CanvasNode[];
    const positions = [] as { x: number; y: number }[];
    for (let i = 0; i < 5; i += 1) {
      const pos = nextNodePosition(source, nodes);
      positions.push(pos);
      nodes.push({ id: 'n' + i, type: 'shot', position: pos, data: {} } as CanvasNode);
    }
    const keys = positions.map((p) => p.x + ':' + p.y);
    expect(new Set(keys).size).toBe(5);
    for (let i = 1; i < 5; i += 1) {
      expect(positions[i].y - positions[i - 1].y).toBe(320);
    }
  });
});


