import { DIRECTOR_STUDIO_MODEL_LABELS } from '@/features/canvas/domain/directorStudioModelCatalog';

export const BLUEPRINT_PERSON_PRESET_LABELS = {
  man: '男人',
  woman: '女人',
  child: '小孩',
  elder: '老人',
  tallMan: '高个男人',
  shortMan: '矮个男人',
  heavyMan: '偏胖男人',
  slimWoman: '偏瘦女人',
  tallWoman: '高个女人',
} as const;

export const BLUEPRINT_OBJECT_PRESET_LABELS = {
  box: '箱子',
  table: '桌子',
  chair: '椅子',
  plant: '植物',
  car: '车',
  sofa: '沙发',
  lamp: '灯',
  door: '门',
  window: '窗户',
  bed: '床',
  phone: '手机',
  cup: '杯子',
} as const;

export const BLUEPRINT_GENERIC_OBJECT_PRESET = {
  id: 'generic-object',
  label: '万能物体',
  color: '#94a3b8',
} as const;

export const BLUEPRINT_SCENE_PRESETS = [
  { id: 'ground-scene', label: '地面场景', description: '地面空间场景，人物和物体有明确站位、前后关系与可见地面' },
  { id: 'aerial-scene', label: '空中场景', description: '空中或高处环境，强调高度、远景、云层或俯视空间关系' },
] as const;

export const BLUEPRINT_PRESET_LABELS: Record<string, string> = {
  ...DIRECTOR_STUDIO_MODEL_LABELS,
  ...BLUEPRINT_PERSON_PRESET_LABELS,
  ...BLUEPRINT_OBJECT_PRESET_LABELS,
  [BLUEPRINT_GENERIC_OBJECT_PRESET.id]: BLUEPRINT_GENERIC_OBJECT_PRESET.label,
  ...Object.fromEntries(BLUEPRINT_SCENE_PRESETS.map((preset) => [preset.id, preset.label])),
};

export function resolveBlueprintPresetLabel(presetId?: string): string {
  if (!presetId) return '';
  return BLUEPRINT_PRESET_LABELS[presetId] ?? presetId;
}
