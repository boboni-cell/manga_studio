import type { BlueprintActionPose } from '@/features/canvas/domain/canvasNodes';

/**
 * Helper utilities for the AI-assisted custom-action flow.
 *
 * `buildBlueprintPosePrompt` produces the markdown prompt the user copies
 * into ChatGPT / Claude / etc. so a generic LLM can return a structured
 * `BlueprintActionPose`. `parseBlueprintPoseJson` turns the AI's JSON
 * response back into a sanitized pose object — it tolerates ```json``` code
 * fences, leading prose, and missing fields, since LLMs rarely return
 * perfectly clean JSON.
 */

const POSE_FIELD_KEYS = [
  'leftShoulder', 'rightShoulder',
  'leftElbow', 'rightElbow',
  'leftHip', 'rightHip',
  'leftKnee', 'rightKnee',
  'head', 'torso',
] as const;

const SCALAR_AXIS_BONES = new Set(['leftElbow', 'rightElbow', 'leftKnee', 'rightKnee', 'torso']);

export function buildBlueprintPosePrompt(name: string, description: string): string {
  const trimmedName = name.trim() || '未命名动作';
  const trimmedDesc = description.trim() || '（无详细描述，请按动作名设计一个最具代表性的瞬间姿态）';

  return [
    '你是一个 3D 角色姿态设计师，需要根据动作描述设计一组关节旋转参数。',
    '',
    `动作名称：${trimmedName}`,
    `动作描述：${trimmedDesc}`,
    '',
    '请输出一个 JSON 对象，使用如下 schema（角度单位：弧度，正常范围 -π 到 π；',
    '可省略保持中立的字段；不要输出 JSON 之外的任何文字、说明或 markdown）：',
    '',
    '```json',
    '{',
    '  "leftShoulder":  { "x": -0.4, "y": 0.0,  "z": 0.0 },  // 左肩 X前后摆 / Y外旋 / Z外展',
    '  "rightShoulder": { "x":  0.4, "y": 0.0,  "z": 0.0 },',
    '  "leftElbow":     { "x": -0.5 },                        // 肘弯曲，建议 -2.4 到 0',
    '  "rightElbow":    { "x": -0.5 },',
    '  "leftHip":       { "x": -0.3, "y": 0.0,  "z": 0.0 },  // 髋 X前后摆 / Y外展 / Z外旋',
    '  "rightHip":      { "x":  0.3, "y": 0.0,  "z": 0.0 },',
    '  "leftKnee":      { "x": -0.6 },                        // 膝弯曲，建议 -2.8 到 0',
    '  "rightKnee":     { "x": -0.6 },',
    '  "head":          { "x":  0.0, "y": 0.0,  "z": 0.0 },  // 头 X仰俯 / Y左右转',
    '  "torso":         { "x":  0.0 },                        // 上身前后倾',
    '  "scaleY":        1.0,                                  // 整体高度缩放 0.5-1.2',
    '  "groupY":        0.0,                                  // 整体高度偏移 -1 到 1（坐姿/跳起）',
    '  "groupRotX":     0.0                                   // 整体绕 X 轴旋转（躺姿）',
    '}',
    '```',
    '',
    '提示：',
    '- 中立姿势是站立、双臂下垂、双腿伸直、目视前方。',
    '- 建议从中立开始增量修改，避免极端值。',
    '- 一定要返回纯 JSON，不要包裹在 markdown 代码块外的任何文本里。',
  ].join('\n');
}

function isFiniteNumber(value: unknown): value is number {
  return typeof value === 'number' && Number.isFinite(value);
}

function pickAxes(raw: unknown, axes: Array<'x' | 'y' | 'z'>): { x?: number; y?: number; z?: number } | null {
  if (!raw || typeof raw !== 'object') return null;
  const out: { x?: number; y?: number; z?: number } = {};
  let touched = false;
  for (const axis of axes) {
    const value = (raw as Record<string, unknown>)[axis];
    if (isFiniteNumber(value)) {
      out[axis] = value;
      touched = true;
    }
  }
  return touched ? out : null;
}

/**
 * Best-effort parse of an LLM JSON response. Returns either a sanitized
 * pose or an error message describing what went wrong. We strip any
 * markdown code-fence wrappers and accept extra prose around the JSON
 * blob.
 */
export function parseBlueprintPoseJson(rawText: string): { pose?: BlueprintActionPose; error?: string } {
  const trimmed = rawText.trim();
  if (!trimmed) return { error: '请先粘贴 AI 返回的 JSON 内容。' };

  // Pull out the first {...} block so leading/trailing prose doesn't break parsing.
  const fenceMatch = trimmed.match(/```(?:json)?\s*([\s\S]*?)```/i);
  const candidate = fenceMatch ? fenceMatch[1].trim() : trimmed;
  const firstBrace = candidate.indexOf('{');
  const lastBrace = candidate.lastIndexOf('}');
  if (firstBrace < 0 || lastBrace < firstBrace) {
    return { error: '没找到 JSON 对象，请检查粘贴内容是否包含 { ... }。' };
  }
  const jsonText = candidate.slice(firstBrace, lastBrace + 1);

  let parsed: unknown;
  try {
    parsed = JSON.parse(jsonText);
  } catch (err) {
    return { error: `JSON 解析失败：${(err as Error).message}` };
  }
  if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
    return { error: 'AI 返回的不是一个 JSON 对象。' };
  }
  const obj = parsed as Record<string, unknown>;

  const pose: BlueprintActionPose = {};
  for (const key of POSE_FIELD_KEYS) {
    const axes: Array<'x' | 'y' | 'z'> = SCALAR_AXIS_BONES.has(key) ? ['x'] : ['x', 'y', 'z'];
    const picked = pickAxes(obj[key], axes);
    if (picked) (pose as any)[key] = picked;
  }
  if (isFiniteNumber(obj.scaleY)) pose.scaleY = obj.scaleY;
  if (isFiniteNumber(obj.groupY)) pose.groupY = obj.groupY;
  if (isFiniteNumber(obj.groupRotX)) pose.groupRotX = obj.groupRotX;

  if (Object.keys(pose).length === 0) {
    return { error: 'AI 返回的对象里没有可识别的姿态字段。请检查字段名是否拼对。' };
  }
  return { pose };
}
