import type { BlueprintItem } from '@/features/canvas/domain/canvasNodes';
import { resolveBlueprintPresetLabel } from '@/features/canvas/domain/blueprintPresetCatalog';
import { describeBlueprintBodyControls } from '@/features/canvas/domain/directorStudioBodyControls';
import { applyTemplate } from '@/features/canvas/application/panelPromptBuilders';
import {
  resolvePromptTemplateText,
  type PromptTemplateSettingsSnapshot,
} from '@/features/canvas/application/promptTemplates';

export interface BlueprintReferenceImage {
  id: string;
  url: string;
  label: string;
  /** Optional color assigned by the legend (hex). Populated by UI assembly so
   *  the 3D editor can render matching swatches. */
  color?: string;
}

export interface BlueprintConfig {
  mode: 'flat' | 'panorama';
  backgroundImageUrl?: string | null;
  items: BlueprintItem[];
  referenceImages: BlueprintReferenceImage[];
  basePrompt: string;
  referenceTokenStartIndex?: number;
  referenceTokenPrefix?: string;
  settings?: PromptTemplateSettingsSnapshot;
}

const RAD_TO_DEG = 180 / Math.PI;

function hasMeaningfulScale(item: BlueprintItem): boolean {
  const scale = item.scale3d;
  if (!scale) return false;
  return Math.abs(scale.x - 1) > 0.01 || Math.abs(scale.y - 1) > 0.01 || Math.abs(scale.z - 1) > 0.01;
}

function hasMeaningfulRotation(item: BlueprintItem): boolean {
  const rotation = item.rotation3d;
  if (!rotation) return false;
  return Math.abs(rotation.x) > 0.01 || Math.abs(rotation.y) > 0.01 || Math.abs(rotation.z) > 0.01;
}

function describeTransform(item: BlueprintItem): string {
  const parts: string[] = [];
  if (hasMeaningfulRotation(item) && item.rotation3d) {
    parts.push(
      `rotation xyz (${Math.round(item.rotation3d.x * RAD_TO_DEG)}°, ${Math.round(item.rotation3d.y * RAD_TO_DEG)}°, ${Math.round(item.rotation3d.z * RAD_TO_DEG)}°)`,
    );
  }
  if (hasMeaningfulScale(item) && item.scale3d) {
    parts.push(
      `scale xyz (${item.scale3d.x.toFixed(2)}, ${item.scale3d.y.toFixed(2)}, ${item.scale3d.z.toFixed(2)})`,
    );
  }
  return parts.length > 0 ? `, transform: ${parts.join(', ')}` : '';
}

function describeRelationAndNote(item: BlueprintItem, noteLabel = 'note'): string {
  const parts: string[] = [];
  const relation = item.relation?.trim();
  const note = item.note?.trim();
  if (relation) parts.push(`relation / interaction: ${relation}`);
  if (note) parts.push(`${noteLabel}: ${note}`);
  return parts.length > 0 ? `, ${parts.join(', ')}` : '';
}

export function dedupeBlueprintReferenceUrls(urls: Array<string | null | undefined>): string[] {
  const seen = new Set<string>();
  const result: string[] = [];
  urls.forEach((url) => {
    if (!url || seen.has(url)) return;
    seen.add(url);
    result.push(url);
  });
  return result;
}

/**
 * Duty-structured Director Studio prompt. The 3D editor stores positions in
 * `pos3d` (world meters: x horizontal, y height, z depth; camera sits at +Z
 * looking -Z). We translate those into semantic position cues for generation.
 */
export function buildBlueprintPrompt(config: BlueprintConfig): string {
  const referenceTokenPrefix = config.referenceTokenPrefix ?? '图';
  const referenceTokenStartIndex = config.referenceTokenStartIndex ?? 1;
  const referenceTokenForIndex = (index: number) =>
    `@${referenceTokenPrefix}${referenceTokenStartIndex + index}`;
  const referenceTokenByUrl = new Map<string, string>();
  const referenceTokenByLabel = new Map<string, string>();
  config.referenceImages.forEach((reference, index) => {
    const token = referenceTokenForIndex(index);
    if (reference.url) referenceTokenByUrl.set(reference.url, token);
    if (reference.label) referenceTokenByLabel.set(reference.label, token);
  });

  const modeInstructions = config.mode === 'panorama'
    ? [
      'this is a Director Studio spatial-layout guided image generation on a 360-degree panorama environment',
      'use the panorama as the surrounding world and keep its overall style, lighting, and perspective',
      'place the subjects described below at the indicated spherical viewer positions',
    ].join(', ')
    : [
      'this is a Director Studio spatial-layout guided image generation driven by a 3D staging floor plan',
      'each colored marker represents the ground position (and optional height) of a subject relative to the viewer camera',
      'render a single final photo whose composition respects those relative positions (who is left / right / closer to camera / farther from camera / higher / lower)',
      'camera reference: x<0 is screen-left, x>0 is screen-right, positive depth-from-camera means farther away from the viewer, y is height above the floor',
    ].join(', ');

  const referenceImages = config.referenceImages.length > 0
    ? `available identity references: ${config.referenceImages
      .map((r, index) => `${referenceTokenForIndex(index)}: image reference named "${r.label}"${r.color ? `, director marker color ${r.color}` : ''}`)
      .join('; ')}`
    : '';

  let placements = '';
  let sceneReferences = '';
  if (config.items.length > 0) {
    const sceneItems = config.items.filter((it) => it.category === 'scene');
    const placedItems = config.items.filter((it) => it.category !== 'scene');

    if (placedItems.length > 0) {
      const placementList = placedItems.map((it, i) => {
        const refToken = it.refImageUrl
          ? referenceTokenByUrl.get(it.refImageUrl)
          : it.refImageName
            ? referenceTokenByLabel.get(it.refImageName)
            : null;
        const ref = refToken
          ? `, use reference image ${refToken} for identity / appearance / material consistency`
          : it.refImageName
            ? `, use reference image named "${it.refImageName}" for identity / appearance / material consistency`
            : '';
        const kind = it.category === 'person' ? 'person' : it.category === 'object' ? 'object' : 'subject';
        const p = it.pos3d ?? { x: 0, y: 0, z: 0 };
        const color = it.color ? `, director marker color ${it.color}` : '';
        const presetLabel = resolveBlueprintPresetLabel(it.presetId);
        const preset = presetLabel ? `, visual type / model preset: ${presetLabel}` : '';
        const action = it.category === 'person' && it.action?.trim()
          ? `, action / pose: ${it.action.trim()}`
          : '';
        const body = it.category === 'person'
          ? describeBlueprintBodyControls(it.bodyControls)
          : '';
        const bodyDescription = body ? `, body controls: ${body}` : '';
        const pos = config.mode === 'panorama'
          ? `at yaw ${Math.round(Math.atan2(p.x, -p.z) * 180 / Math.PI)} deg, pitch ${Math.round(Math.atan2(p.y, Math.hypot(p.x, p.z) || 1) * 180 / Math.PI)} deg`
          : `at floor position (x ${p.x.toFixed(1)}m, depth-from-camera ${(-p.z).toFixed(1)}m${p.y > 0.05 ? `, elevated ${p.y.toFixed(1)}m` : ''})`;
        const rel = describeRelationAndNote(it);
        const transform = describeTransform(it);
        return `${i + 1}. ${kind} "${it.label}"${ref}${color}${preset}${action}${bodyDescription} - ${pos}${transform}${rel}`;
      });
      placements = `subjects to place: ${placementList.join('; ')}`;
    }

    if (sceneItems.length > 0) {
      const sceneRefs = sceneItems
        .map((it) => {
          const refToken = it.refImageUrl
            ? referenceTokenByUrl.get(it.refImageUrl)
            : it.refImageName
              ? referenceTokenByLabel.get(it.refImageName)
              : null;
          const ref = refToken
            ? `, use reference image ${refToken} as scene / environment reference`
            : it.refImageName
              ? `, use reference image named "${it.refImageName}" as scene / environment reference`
              : '';
          const presetLabel = resolveBlueprintPresetLabel(it.presetId);
          const preset = presetLabel ? `, scene type: ${presetLabel}` : '';
          const rel = describeRelationAndNote(it, 'scene note');
          const transform = describeTransform(it);
          return `"${it.label}"${ref}${preset}${transform}${rel}`;
        })
        .join(', ');
      sceneReferences = `scene / environment references: ${sceneRefs}`;
    }
  }

  return applyTemplate(resolvePromptTemplateText('directorStudio.layout', config.settings ?? {}), {
    modeInstructions,
    referenceImages,
    placements,
    sceneReferences,
    basePrompt: config.basePrompt.trim(),
  });
}
