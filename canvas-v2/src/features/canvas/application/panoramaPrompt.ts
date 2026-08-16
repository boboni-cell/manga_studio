import type { PanoramaProjection } from '@/features/canvas/application/panoramaNormalize';
import { applyTemplate } from '@/features/canvas/application/panelPromptBuilders';
import {
  getPromptTemplateEffectiveLanguage,
  resolvePromptTemplateText,
  type PromptTemplateSettingsSnapshot,
} from '@/features/canvas/application/promptTemplates';

export type PanoramaPromptSourceMode = 'ai' | 'image' | 'text';

/**
 * Duty-structured panorama prompt. Keep the built-in prompt in Chinese because
 * the target models are more reliable when the ratio instruction is explicit
 * and not split across languages.
 */
export function buildPanoramaPrompt(
  sourceMode: PanoramaPromptSourceMode,
  projection: PanoramaProjection,
  userPrompt: string,
  settings: PromptTemplateSettingsSnapshot = {}
): string {
  const base = userPrompt.trim();

  const common = [
    '最终图像必须适合导入 3D 导演台或全景查看器，作为包裹场景的环境球内壁或水平环绕背景使用',
    '画面中不要出现摄影师、相机、镜头、三脚架、头显或任何拍摄设备',
    '不要分屏拼贴，不要多宫格，不要画中画，不要插入小图，只保留一个连续环境',
    '不要水印，不要文字，不要界面元素，不要边框，不要明显拼接线或接缝',
    '除非用户另有说明，保持真实摄影质感、电影级光影和自然空间纵深',
  ].join(', ');

  const projectionTemplateId = projection === 'spherical'
    ? 'panorama.spherical'
    : 'panorama.cylindrical';
  const projectionText = resolvePromptTemplateText(projectionTemplateId, settings);
  const sourceTemplateId = sourceMode === 'image'
    ? 'panorama.imageFallback'
    : 'panorama.textFallback';
  const language = getPromptTemplateEffectiveLanguage(sourceTemplateId, settings);
  const projectionLabel = language === 'en'
    ? (projection === 'spherical' ? 'spherical' : 'cylindrical')
    : (projection === 'spherical' ? '720度球形' : '360度环绕');

  return applyTemplate(resolvePromptTemplateText(sourceTemplateId, settings), {
    projectionLabel,
    projectionPrompt: projectionText,
    commonPrompt: common,
    userPrompt: base,
  });
}
