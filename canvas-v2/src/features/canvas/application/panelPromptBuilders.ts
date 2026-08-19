export interface MultiAnglePromptInput {
  template: string;
  consistencyPrompt: string;
  presetPrompt: string;
  horizontalPrompt: string;
  verticalPrompt: string;
  shotSizePrompt: string;
  cameraMeta: string;
}

export interface LightingPromptInput {
  template: string;
  consistencyPrompt: string;
  presetPrompt: string;
  smartDesc: string;
  lightDirectionPrompt: string;
  brightnessPrompt: string;
  rimLightPrompt: string;
  lightColorPrompt: string;
  lightingMeta: string;
}

export function applyTemplate(template: string, values: Record<string, string>): string {
  const rendered = template.replace(/\{\{(\w+)\}\}/g, (_match, key: string) => values[key] ?? '');

  return rendered
    .split(',')
    .map((part) => part.trim())
    .filter(Boolean)
    .join(', ');
}

export function buildMultiAnglePromptFromTemplate(input: MultiAnglePromptInput): string {
  return applyTemplate(input.template, {
    consistencyPrompt: input.consistencyPrompt,
    presetPrompt: input.presetPrompt,
    horizontalPrompt: input.horizontalPrompt,
    verticalPrompt: input.verticalPrompt,
    shotSizePrompt: input.shotSizePrompt,
    cameraMeta: input.cameraMeta,
  });
}

export function buildLightingPromptFromTemplate(input: LightingPromptInput): string {
  const template = input.template.includes('{{consistencyPrompt}}')
    ? input.template
    : `{{consistencyPrompt}}, ${input.template}`;

  return applyTemplate(template, {
    consistencyPrompt: input.consistencyPrompt,
    presetPrompt: input.presetPrompt,
    smartDesc: input.smartDesc,
    lightDirectionPrompt: input.lightDirectionPrompt,
    brightnessPrompt: input.brightnessPrompt,
    rimLightPrompt: input.rimLightPrompt,
    lightColorPrompt: input.lightColorPrompt,
    lightingMeta: input.lightingMeta,
  });
}
