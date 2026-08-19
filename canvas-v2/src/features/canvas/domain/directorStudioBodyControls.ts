import type { BlueprintBodyControls, BlueprintBodyStyle } from '@/features/canvas/domain/canvasNodes';

export const DIRECTOR_STUDIO_BODY_STYLES: Array<{ value: BlueprintBodyStyle; labelKey: string }> = [
  { value: 'preset', labelKey: 'directorStudio.bodyStyles.preset' },
  { value: 'slim', labelKey: 'directorStudio.bodyStyles.slim' },
  { value: 'strong', labelKey: 'directorStudio.bodyStyles.strong' },
  { value: 'heavy', labelKey: 'directorStudio.bodyStyles.heavy' },
  { value: 'childlike', labelKey: 'directorStudio.bodyStyles.childlike' },
];

export interface NormalizedBlueprintBodyControls {
  style: BlueprintBodyStyle;
  showControls: boolean;
  core: {
    height: number;
    torsoWidth: number;
    headScale: number;
    torsoLeanDeg: number;
  };
  arms: {
    length: number;
    thickness: number;
    spreadDeg: number;
  };
  legs: {
    length: number;
    thickness: number;
    spreadDeg: number;
  };
}

const DEFAULT_BODY_CONTROLS: NormalizedBlueprintBodyControls = {
  style: 'preset',
  showControls: false,
  core: {
    height: 1,
    torsoWidth: 1,
    headScale: 1,
    torsoLeanDeg: 0,
  },
  arms: {
    length: 1,
    thickness: 1,
    spreadDeg: 0,
  },
  legs: {
    length: 1,
    thickness: 1,
    spreadDeg: 0,
  },
};

const STYLE_DEFAULTS: Record<BlueprintBodyStyle, Partial<BlueprintBodyControls>> = {
  preset: {},
  slim: {
    core: { height: 1.04, torsoWidth: 0.82, headScale: 0.96 },
    arms: { thickness: 0.82 },
    legs: { thickness: 0.86 },
  },
  strong: {
    core: { height: 1.04, torsoWidth: 1.18 },
    arms: { thickness: 1.28, spreadDeg: 4 },
    legs: { thickness: 1.18, spreadDeg: 2 },
  },
  heavy: {
    core: { height: 0.98, torsoWidth: 1.42, headScale: 1.03 },
    arms: { thickness: 1.2 },
    legs: { thickness: 1.2 },
  },
  childlike: {
    core: { height: 0.72, torsoWidth: 0.92, headScale: 1.35 },
    arms: { length: 0.86, thickness: 0.9 },
    legs: { length: 0.82, thickness: 0.9 },
  },
};

function clampNumber(value: number | undefined, fallback: number, min: number, max: number): number {
  return Number.isFinite(value) ? Math.min(max, Math.max(min, value as number)) : fallback;
}

export function normalizeBlueprintBodyControls(controls?: BlueprintBodyControls): NormalizedBlueprintBodyControls {
  const style = controls?.style && controls.style in STYLE_DEFAULTS
    ? controls.style
    : DEFAULT_BODY_CONTROLS.style;
  const styleDefaults = STYLE_DEFAULTS[style] ?? STYLE_DEFAULTS.preset;
  const core = { ...DEFAULT_BODY_CONTROLS.core, ...styleDefaults.core, ...controls?.core };
  const arms = { ...DEFAULT_BODY_CONTROLS.arms, ...styleDefaults.arms, ...controls?.arms };
  const legs = { ...DEFAULT_BODY_CONTROLS.legs, ...styleDefaults.legs, ...controls?.legs };
  return {
    style,
    showControls: Boolean(controls?.showControls),
    core: {
      height: clampNumber(core.height, DEFAULT_BODY_CONTROLS.core.height, 0.45, 1.8),
      torsoWidth: clampNumber(core.torsoWidth, DEFAULT_BODY_CONTROLS.core.torsoWidth, 0.45, 2.2),
      headScale: clampNumber(core.headScale, DEFAULT_BODY_CONTROLS.core.headScale, 0.55, 1.8),
      torsoLeanDeg: clampNumber(core.torsoLeanDeg, DEFAULT_BODY_CONTROLS.core.torsoLeanDeg, -45, 45),
    },
    arms: {
      length: clampNumber(arms.length, DEFAULT_BODY_CONTROLS.arms.length, 0.45, 1.8),
      thickness: clampNumber(arms.thickness, DEFAULT_BODY_CONTROLS.arms.thickness, 0.45, 2),
      spreadDeg: clampNumber(arms.spreadDeg, DEFAULT_BODY_CONTROLS.arms.spreadDeg, -35, 35),
    },
    legs: {
      length: clampNumber(legs.length, DEFAULT_BODY_CONTROLS.legs.length, 0.45, 1.8),
      thickness: clampNumber(legs.thickness, DEFAULT_BODY_CONTROLS.legs.thickness, 0.45, 2),
      spreadDeg: clampNumber(legs.spreadDeg, DEFAULT_BODY_CONTROLS.legs.spreadDeg, -25, 35),
    },
  };
}

export function hasMeaningfulBlueprintBodyControls(controls?: BlueprintBodyControls): boolean {
  if (!controls) return false;
  const normalized = normalizeBlueprintBodyControls(controls);
  return normalized.style !== 'preset'
    || normalized.showControls
    || Math.abs(normalized.core.height - 1) > 0.01
    || Math.abs(normalized.core.torsoWidth - 1) > 0.01
    || Math.abs(normalized.core.headScale - 1) > 0.01
    || Math.abs(normalized.core.torsoLeanDeg) > 0.5
    || Math.abs(normalized.arms.length - 1) > 0.01
    || Math.abs(normalized.arms.thickness - 1) > 0.01
    || Math.abs(normalized.arms.spreadDeg) > 0.5
    || Math.abs(normalized.legs.length - 1) > 0.01
    || Math.abs(normalized.legs.thickness - 1) > 0.01
    || Math.abs(normalized.legs.spreadDeg) > 0.5;
}

export function describeBlueprintBodyControls(controls?: BlueprintBodyControls): string {
  if (!hasMeaningfulBlueprintBodyControls(controls)) return '';
  const normalized = normalizeBlueprintBodyControls(controls);
  return [
    `body style ${normalized.style}`,
    `core height ${normalized.core.height.toFixed(2)}x`,
    `torso width ${normalized.core.torsoWidth.toFixed(2)}x`,
    `head scale ${normalized.core.headScale.toFixed(2)}x`,
    `torso lean ${Math.round(normalized.core.torsoLeanDeg)} deg`,
    `arms length ${normalized.arms.length.toFixed(2)}x / thickness ${normalized.arms.thickness.toFixed(2)}x / spread ${Math.round(normalized.arms.spreadDeg)} deg`,
    `legs length ${normalized.legs.length.toFixed(2)}x / thickness ${normalized.legs.thickness.toFixed(2)}x / spread ${Math.round(normalized.legs.spreadDeg)} deg`,
  ].join(', ');
}
