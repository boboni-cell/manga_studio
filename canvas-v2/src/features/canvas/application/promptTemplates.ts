export type PromptLanguage = 'zh' | 'en';
export type PromptTemplateLanguagePreference = 'inherit' | PromptLanguage;
export type PromptTemplateScope =
  | 'canvasPanel'
  | 'multiFunction'
  | 'camera'
  | 'panorama'
  | 'directorStudio'
  | 'storyboard'
  | 'tool';

export interface PromptTemplateDefinition {
  id: string;
  scope: PromptTemplateScope;
  titleKey: string;
  descriptionKey: string;
  dynamicDescriptionKey?: string;
  defaultLanguage: PromptLanguage;
  defaults: Record<PromptLanguage, string>;
  placeholders: readonly string[];
}

export interface PromptTemplateOverride {
  language?: PromptTemplateLanguagePreference;
  template?: string;
  updatedAt: number;
}

export type PromptTemplateOverrideMap = Partial<Record<PromptTemplateId, PromptTemplateOverride>>;

export interface PromptTemplateSettingsSnapshot {
  promptDefaultLanguage?: PromptLanguage;
  promptTemplateOverrides?: PromptTemplateOverrideMap;
  multiAnglePromptTemplate?: string;
  lightingPromptTemplate?: string;
}

export const DEFAULT_MULTI_ANGLE_PROMPT_TEMPLATE = [
  '{{consistencyPrompt}}',
  '{{presetPrompt}}',
  '{{horizontalPrompt}}',
  '{{verticalPrompt}}',
  '{{shotSizePrompt}}',
  '{{cameraMeta}}',
].join(', ');

export const DEFAULT_LIGHTING_PROMPT_TEMPLATE = [
  '{{consistencyPrompt}}',
  '{{presetPrompt}}',
  '{{smartDesc}}',
  '{{lightDirectionPrompt}}',
  '{{brightnessPrompt}}',
  '{{rimLightPrompt}}',
  '{{lightColorPrompt}}',
  '{{lightingMeta}}',
].join(', ');

const MULTI_FUNCTION_PROMPTS = {
  multiCameraGrid: {
    en: 'create one clean 3x3 camera-angle contact sheet from the reference image. Use nine panels showing the same subject(s) and same scene from different camera angles: front view, three-quarter left, three-quarter right, full side profile left, full side profile right, back view, high angle, low angle, and dutch tilted angle. Keep identity, outfit, hairstyle, action, background world, lighting, and color mood consistent across all panels. Only camera angle and framing may change. Use thin neutral gutters, no captions, no numbers, no UI labels, no extra people, no duplicated subjects, no camera equipment visible inside the panels',
    zh: '基于参考图创建一张干净的 3x3 多机位角度联系表。九个画格展示同一主体和同一场景的不同机位：正面、左前三分之三、右前三分之三、左侧全侧面、右侧全侧面、背面、俯拍、仰拍、荷兰倾斜角。所有画格保持身份、服装、发型、动作、背景世界、光线和色彩氛围一致，只改变机位和取景。使用细窄中性分隔线，不要字幕、编号、UI 标签、额外人物、重复主体或画面内摄影设备',
  },
  plotDeduction: {
    en: 'create one 2x2 storyboard grid that deduces a plausible four-beat narrative from the reference image. Panel order is left-to-right, top-to-bottom: setup, rising action, key dramatic beat, aftermath. Keep the same characters, identities, outfits, location, lighting logic, and world continuity across all four panels. Vary only expression, camera angle, framing, and action progression. Use cinematic film still style with thin neutral gutters. No captions, no speech bubbles, no text labels, no new main characters, no environment style change',
    zh: '基于参考图推演一张 2x2 分镜网格，形成合理的四拍叙事。画格顺序从左到右、从上到下：铺垫、行动升级、关键戏剧点、后果。四格保持相同角色、身份、服装、地点、光线逻辑和世界连续性，只改变表情、机位、取景和动作推进。使用电影剧照质感和细窄中性分隔线，不要字幕、对白气泡、文字标签、新主角或环境风格变化',
  },
  continuousStoryboard: {
    en: 'create one 5x5 storyboard grid with 25 sequential panels showing a continuous scene progression that starts from the reference image. Read order is left-to-right and top-to-bottom. Keep the same characters, identities, outfits, location, lighting logic, and world continuity across every panel. Vary camera angle, framing, expression, and action naturally between panels. Use consistent cinematic color grading and thin neutral gutters. No captions, no panel numbers, no speech bubbles, no new main characters, no identity swaps',
    zh: '创建一张 5x5、共 25 格的连续分镜网格，从参考图开始展示一个连续场景推进。阅读顺序从左到右、从上到下。每格保持相同角色、身份、服装、地点、光线逻辑和世界连续性，机位、取景、表情和动作在格与格之间自然变化。使用一致的电影调色和细窄中性分隔线，不要字幕、格号、对白气泡、新主角或身份互换',
  },
  lightingCorrection: {
    en: 'this is a color-grading and lighting-correction pass on the reference image: keep the same people, same scene, same composition, same pose exactly, only apply professional cinematic color grading, balanced exposure, controlled highlights and shadows, natural skin tones, three-way color correction, subtle film grain, IMAX / HDR quality, do not re-draw the subject, do not change identity, no stylization shift beyond color/contrast',
    zh: '这是对参考图进行调色和光线校正：严格保持相同人物、相同场景、相同构图和相同姿态，只应用专业电影调色、平衡曝光、受控高光与阴影、自然肤色、三向色彩校正、轻微胶片颗粒、IMAX / HDR 质感。不要重画主体，不要改变身份，不要在颜色和对比之外改变风格',
  },
  characterThreeView: {
    en: 'create a character turnaround reference sheet from the reference image: exactly three full-body views of the same character side by side, front view, full side profile, and back view. Preserve identity, face structure, hairstyle, outfit, proportions, colors, and accessories consistently across all three views. Use neutral standing pose, clean plain background, orthographic reference-sheet style, consistent scale and height. No new characters, no text, no logos, no decorative UI',
    zh: '基于参考图创建角色三视图设定表：同一个角色并排展示且只有三个全身视图，正面、完整侧面和背面。三视图保持身份、面部结构、发型、服装、比例、颜色和配饰一致。使用中性站姿、干净纯背景、正交设定表风格、统一比例和高度。不要新增角色、文字、标志或装饰 UI',
  },
  predictNext: {
    en: 'predict and render the next logical moment right after the reference image: keep the same characters, identity, outfit, location, and lighting, advance the action plausibly by a few seconds, preserve world continuity, camera angle and framing may shift naturally, cinematic film still, do not invent new characters, do not change environment, do not collapse the scene into a generic portrait',
    zh: '预测并渲染参考图之后的下一个合理瞬间：保持相同角色、身份、服装、地点和光线，让动作自然推进几秒，保持世界连续性，机位和取景可以自然变化，电影剧照质感。不要发明新角色，不要改变环境，不要把场景压缩成普通肖像',
  },
  predictPrevious: {
    en: 'predict and render a plausible previous moment that led into the reference image: keep the same characters, identity, outfit, location, and lighting, rewind the action by a few seconds, preserve world continuity and scene logic, camera angle and framing may shift naturally, cinematic film still, do not invent new characters, do not change environment',
    zh: '预测并渲染导致参考图发生的上一个合理瞬间：保持相同角色、身份、服装、地点和光线，将动作自然回退几秒，保持世界连续性和场景逻辑，机位和取景可以自然变化，电影剧照质感。不要发明新角色，不要改变环境',
  },
} as const;

const TOOL_PROMPTS = {
  hdSketch: {
    en: 'convert the reference image into a clean black-and-white structural line drawing on a pure white background. Preserve the exact composition, subject silhouette, facial feature placement, clothing seams, object outlines, and background geometry. Use thin even strokes only. Do not add shading, colour, texture, watermark, text, or any new content. Output a technical lineart reference, not a stylized illustration.',
    zh: '将参考图转换为纯白背景上的干净黑白结构线稿。保持准确构图、主体剪影、五官位置、服装缝线、物体轮廓和背景几何。只使用细而均匀的线条。不要添加明暗、颜色、纹理、水印、文字或任何新内容。输出技术线稿参考，而不是风格化插画。',
  },
  hdComposite: {
    en: 'this is a high-definition restoration and detail refinement task. The first reference image is the original scene; the second reference image is a clean structural sketch of the same scene. Produce a single final image that preserves the original composition, identity, pose, viewpoint, lighting direction, color palette, subject placement, and mood. Improve sharpness, micro-detail, fabric weave, hair strands, skin texture, object edges, and compression artifacts in a natural way. Do not beautify into a different person, do not change age, clothing, expression, background, camera angle, or style. No new subjects, no text, no watermark.',
    zh: '这是高清修复和细节增强任务。第一张参考图是原始场景，第二张参考图是同一场景的干净结构线稿。生成一张最终图，保持原始构图、身份、姿态、视角、光线方向、色彩 palette、主体位置和情绪。自然提升清晰度、微细节、织物纹理、发丝、皮肤纹理、物体边缘并修复压缩瑕疵。不要美化成另一个人，不要改变年龄、服装、表情、背景、机位或风格。不要新增主体、文字或水印。',
  },
  outpaintBalanced: {
    en: 'this is an outpainting task: extend the reference image outward in all directions while preserving the original image content exactly. Continue the environment, lighting, perspective, lens characteristics, shadows, texture, and color grading seamlessly into the new borders. Do not move, redraw, crop, or alter the original subject.',
    zh: '这是扩图任务：在所有方向向外延展参考图，同时严格保持原图内容不变。将环境、光线、透视、镜头特性、阴影、纹理和调色无缝延续到新边界。不要移动、重画、裁切或改变原始主体。',
  },
  outpaintHorizontal: {
    en: 'this is a horizontal outpainting task: extend the reference image to the left and right while preserving the original image content exactly. Continue the environment, lighting, perspective, lens characteristics, shadows, texture, and color grading seamlessly. Do not move, redraw, crop, or alter the original subject.',
    zh: '这是横向扩图任务：向左和向右延展参考图，同时严格保持原图内容不变。无缝延续环境、光线、透视、镜头特性、阴影、纹理和调色。不要移动、重画、裁切或改变原始主体。',
  },
  outpaintVertical: {
    en: 'this is a vertical outpainting task: extend the reference image upward and downward while preserving the original image content exactly. Continue sky/ceiling, ground/floor, lighting, perspective, lens characteristics, shadows, texture, and color grading seamlessly. Do not move, redraw, crop, or alter the original subject.',
    zh: '这是纵向扩图任务：向上和向下延展参考图，同时严格保持原图内容不变。无缝延续天空/天花板、地面/地板、光线、透视、镜头特性、阴影、纹理和调色。不要移动、重画、裁切或改变原始主体。',
  },
  inpaint: {
    en: 'this is a local inpainting task. Redraw only the masked region of the reference image and preserve all unmasked areas unchanged. The new content must match surrounding lighting direction, perspective, focus, texture, color grading, grain, and shadow contact. No seams, no duplicated subjects, no changes outside the mask. {{targetContent}}',
    zh: '这是局部重绘任务。只重画参考图的蒙版区域，所有未遮罩区域保持不变。新内容必须匹配周围光线方向、透视、焦点、纹理、调色、颗粒和接触阴影。不要接缝、重复主体或改变蒙版外区域。{{targetContent}}',
  },
  erase: {
    en: 'this is a clean object-removal task. Remove only the masked object or region and reconstruct the background behind it using plausible continuation of the surrounding wall, floor, scenery, pattern, shadows, and texture. Preserve every unmasked subject exactly, including pose, identity, expression, and clothing. No ghost silhouette, no blur patch, no duplicated object, no new subject.',
    zh: '这是干净的物体移除任务。只移除被蒙版标记的物体或区域，并用周围墙面、地面、景物、图案、阴影和纹理的合理延续重建背后背景。严格保持每个未遮罩主体，包括姿态、身份、表情和服装。不要幽灵轮廓、模糊补丁、重复物体或新主体。',
  },
  matting: {
    en: 'this is a foreground cutout / matting task. Produce an image that contains only the subject marked by the mask, or the main foreground subject if no mask is provided. Preserve exact pose, identity, clothing, colors, hair, fur, fabric fringes, fingers, and semi-transparent edges. Remove the old background cleanly and keep the cutout edge natural with no halo, no color spill, no missing limbs, no added props, no text, and no style change. {{targetSubject}}',
    zh: '这是前景抠图任务。生成一张只包含蒙版标记主体的图片；如果没有蒙版，则提取主要前景主体。保持准确姿态、身份、服装、颜色、头发、毛发、织物边缘、手指和半透明边缘。干净移除旧背景，边缘自然，不要光晕、串色、缺失肢体、新增道具、文字或风格变化。{{targetSubject}}',
  },
} as const;

export const PROMPT_TEMPLATE_DEFINITIONS = [
  {
    id: 'multiAngle.default',
    scope: 'canvasPanel',
    titleKey: 'settings.promptTemplates.multiAngle.title',
    descriptionKey: 'settings.promptTemplates.multiAngle.desc',
    dynamicDescriptionKey: 'settings.promptManagement.dynamicNotes.multiAngle',
    defaultLanguage: 'en',
    defaults: {
      zh: DEFAULT_MULTI_ANGLE_PROMPT_TEMPLATE,
      en: DEFAULT_MULTI_ANGLE_PROMPT_TEMPLATE,
    },
    placeholders: [
      '{{consistencyPrompt}}',
      '{{presetPrompt}}',
      '{{horizontalPrompt}}',
      '{{verticalPrompt}}',
      '{{shotSizePrompt}}',
      '{{cameraMeta}}',
    ],
  },
  {
    id: 'lighting.default',
    scope: 'canvasPanel',
    titleKey: 'settings.promptTemplates.lighting.title',
    descriptionKey: 'settings.promptTemplates.lighting.desc',
    dynamicDescriptionKey: 'settings.promptManagement.dynamicNotes.lighting',
    defaultLanguage: 'en',
    defaults: {
      zh: DEFAULT_LIGHTING_PROMPT_TEMPLATE,
      en: DEFAULT_LIGHTING_PROMPT_TEMPLATE,
    },
    placeholders: [
      '{{consistencyPrompt}}',
      '{{presetPrompt}}',
      '{{smartDesc}}',
      '{{lightDirectionPrompt}}',
      '{{brightnessPrompt}}',
      '{{rimLightPrompt}}',
      '{{lightColorPrompt}}',
      '{{lightingMeta}}',
    ],
  },
  ...(
    [
      'multiCameraGrid',
      'plotDeduction',
      'continuousStoryboard',
      'lightingCorrection',
      'characterThreeView',
      'predictNext',
      'predictPrevious',
    ] as const
  ).map((id): PromptTemplateDefinition => ({
    id: `multiFunction.${id}`,
    scope: 'multiFunction',
    titleKey: `multiFunction.items.${id}.title`,
    descriptionKey: `multiFunction.items.${id}.desc`,
    dynamicDescriptionKey: 'settings.promptManagement.dynamicNotes.referenceImage',
    defaultLanguage: 'en',
    defaults: MULTI_FUNCTION_PROMPTS[id],
    placeholders: [] as const,
  })),
  {
    id: 'cameraControl.virtualCamera',
    scope: 'camera',
    titleKey: 'settings.promptTemplates.cameraControlVirtualCamera.title',
    descriptionKey: 'settings.promptTemplates.cameraControlVirtualCamera.desc',
    dynamicDescriptionKey: 'settings.promptManagement.dynamicNotes.cameraControl',
    defaultLanguage: 'en',
    defaults: {
      zh: '以下参数描述用于渲染画面的虚拟摄影机、镜头和曝光，它们是摄影指导而不是画面内物体。不要在图像中加入实体相机、镜头、三脚架、取景器或摄影设备。{{cameraProfilePrompt}}, {{lensProfilePrompt}}, {{focalLengthPrompt}}, {{aperturePrompt}}, 保持主体、场景和动作不变，只将这些作为光学和传感器特征应用。[camera body: {{cameraBody}} · lens: {{lens}} · focal: {{focalLengthMm}}mm · aperture: f/{{apertureF}}]',
      en: 'the following parameters describe the virtual camera, lens, and exposure used to render this image — they are camera direction, NOT objects to add inside the frame, do not add any physical camera, lens, tripod, viewfinder, or photography equipment into the image, {{cameraProfilePrompt}}, {{lensProfilePrompt}}, {{focalLengthPrompt}}, {{aperturePrompt}}, keep the subjects, scene, and action unchanged — apply these as optical and sensor characteristics only, [camera body: {{cameraBody}} · lens: {{lens}} · focal: {{focalLengthMm}}mm · aperture: f/{{apertureF}}]',
    },
    placeholders: [
      '{{cameraProfilePrompt}}',
      '{{lensProfilePrompt}}',
      '{{focalLengthPrompt}}',
      '{{aperturePrompt}}',
      '{{cameraBody}}',
      '{{lens}}',
      '{{focalLengthMm}}',
      '{{apertureF}}',
    ],
  },
  {
    id: 'panorama.spherical',
    scope: 'panorama',
    titleKey: 'settings.promptTemplates.panoramaSpherical.title',
    descriptionKey: 'settings.promptTemplates.panoramaSpherical.desc',
    dynamicDescriptionKey: 'settings.promptManagement.dynamicNotes.panorama',
    defaultLanguage: 'zh',
    defaults: {
      zh: '最终图片必须是等距柱状投影的完整球形全景图，比例2比1，宽度是高度的2倍，只输出一张连续画面，适合作为 3D 导演台环境球内壁贴图。水平视角覆盖完整360度，垂直视角覆盖从天空或天花板到地面或地板的完整180度，观看者位于场景中心，可以向上、向下、向左、向右完整环视整个环境，地平线必须位于画面垂直中心附近，左右边缘必须自然无缝衔接，不要普通横幅照片、不要21比9电影宽银幕截图、不要鱼眼圆形边框、不要多图拼接、不要文字、水印、边框或明显接缝',
      en: 'the final image must be a complete equirectangular spherical panorama in a 2:1 ratio, width exactly twice the height, output one continuous image only, suitable as the inner texture of a 3D Director Studio environment sphere. Horizontal view covers a full 360 degrees and vertical view covers the full 180 degrees from sky or ceiling to ground or floor. The viewer is at the center of the scene and can look up, down, left, and right through the full environment. The horizon must sit near the vertical center and the left/right edges must connect seamlessly. Do not create a normal banner photo, 21:9 cinematic crop, fisheye circle, multi-image collage, text, watermark, border, or visible seam',
    },
    placeholders: [] as const,
  },
  {
    id: 'panorama.cylindrical',
    scope: 'panorama',
    titleKey: 'settings.promptTemplates.panoramaCylindrical.title',
    descriptionKey: 'settings.promptTemplates.panoramaCylindrical.desc',
    dynamicDescriptionKey: 'settings.promptManagement.dynamicNotes.panorama',
    defaultLanguage: 'zh',
    defaults: {
      zh: '最终图片必须是水平360度环绕全景图，画面是一条连续的横向环境带，只输出一张连续画面，适合作为 3D 导演台环绕背景。优先使用比例4比1；如果模型不支持4比1，则使用比例2比1或当前可用的最宽全景比例。观看者位于场景中心，可以在水平面完整转身环视，地平线位于画面垂直中心附近，左右边缘必须自然无缝衔接，不要普通横幅照片、不要分屏拼贴、不要几张照片并排拼接、不要文字、水印、边框或明显接缝',
      en: 'the final image must be a horizontal 360-degree cylindrical panorama, a single continuous horizontal environment strip, suitable as a 3D Director Studio wraparound background. Prefer a 4:1 ratio; if unsupported, use 2:1 or the widest available panorama ratio. The viewer is at the center of the scene and can rotate fully on the horizontal plane. The horizon sits near the vertical center and the left/right edges connect seamlessly. Do not create a normal banner photo, split-screen collage, several photos placed side by side, text, watermark, border, or visible seam',
    },
    placeholders: [] as const,
  },
  {
    id: 'panorama.imageFallback',
    scope: 'panorama',
    titleKey: 'settings.promptTemplates.panoramaImageFallback.title',
    descriptionKey: 'settings.promptTemplates.panoramaImageFallback.desc',
    dynamicDescriptionKey: 'settings.promptManagement.dynamicNotes.panorama',
    defaultLanguage: 'zh',
    defaults: {
      zh: '这是图生{{projectionLabel}}全景任务。如果参考图已经是全景环境图，请保留它的场景主体并只修正为全景查看器可用的几何结构；如果参考图不是全景比例，请把它作为场景参考，生成四周缺失的环境内容，不要简单拉伸原图。{{projectionPrompt}}, {{commonPrompt}}, {{userPrompt}}',
      en: 'this is an image-to-{{projectionLabel}} panorama task. If the reference image is already a panorama environment, preserve its scene subject and only correct the geometry for a panorama viewer; if the reference image is not panoramic, use it as a scene reference and generate the missing environment around the viewer instead of stretching the original image. {{projectionPrompt}}, {{commonPrompt}}, {{userPrompt}}',
    },
    placeholders: ['{{projectionLabel}}', '{{projectionPrompt}}', '{{commonPrompt}}', '{{userPrompt}}'],
  },
  {
    id: 'panorama.textFallback',
    scope: 'panorama',
    titleKey: 'settings.promptTemplates.panoramaTextFallback.title',
    descriptionKey: 'settings.promptTemplates.panoramaTextFallback.desc',
    dynamicDescriptionKey: 'settings.promptManagement.dynamicNotes.panorama',
    defaultLanguage: 'zh',
    defaults: {
      zh: '这是文字生成{{projectionLabel}}全景任务。结合用户文字和所有参考图，参考图只用于主体、材质、色彩、构图线索和风格，最终必须生成完整全景环境。先生成符合目标全景几何的底图，之后会进入全景查看器归一化处理。{{projectionPrompt}}, {{commonPrompt}}, {{userPrompt}}',
      en: 'this is a text-to-{{projectionLabel}} panorama task. Combine the user text and all reference images; references only guide subject, material, color, composition cues, and style, while the final output must be a complete panorama environment. First generate a base image matching the target panorama geometry, then it will be normalized for the panorama viewer. {{projectionPrompt}}, {{commonPrompt}}, {{userPrompt}}',
    },
    placeholders: ['{{projectionLabel}}', '{{projectionPrompt}}', '{{commonPrompt}}', '{{userPrompt}}'],
  },
  {
    id: 'directorStudio.layout',
    scope: 'directorStudio',
    titleKey: 'settings.promptTemplates.directorStudioLayout.title',
    descriptionKey: 'settings.promptTemplates.directorStudioLayout.desc',
    dynamicDescriptionKey: 'settings.promptManagement.dynamicNotes.directorStudioLayout',
    defaultLanguage: 'en',
    defaults: {
      zh: '{{modeInstructions}}, 将导演台布局视为不可见的制作指导，而不是要画进画面的内容。保持每个主体身份稳定且彼此独立。当元素引用上传图时，使用提示词中给出的编号参考图作为主体身份和外观参考。尊重对象名称、颜色、动作、关系和坐标等场面调度约束。保持场景光线和风格一致。不要复制、合并或新增未命名主体。不要绘制导演台控件、标记、标签、网格线或任何 UI 覆盖层。不要文字、水印或注释。{{referenceImages}}, {{placements}}, {{sceneReferences}}, {{basePrompt}}',
      en: '{{modeInstructions}}, treat the Director Studio layout as invisible production guidance, not as content to draw, preserve the described subjects as separate individuals, each with stable identity, when an element references an uploaded image, use the numbered reference token provided in the prompt as that subject identity and look reference, respect the object names, colors, actions, relations, and coordinates as scene-planning constraints, keep scene lighting and style consistent across all subjects, do not duplicate or clone any subject, do not merge subjects, do not introduce unnamed extra people, do not draw the Director Studio controls, markers, labels, gridlines, or any UI overlays into the final image, do not include any text, watermark, or annotation, {{referenceImages}}, {{placements}}, {{sceneReferences}}, {{basePrompt}}',
    },
    placeholders: [
      '{{modeInstructions}}',
      '{{referenceImages}}',
      '{{placements}}',
      '{{sceneReferences}}',
      '{{basePrompt}}',
    ],
  },
  {
    id: 'directorStudio.screenshotHandoff',
    scope: 'directorStudio',
    titleKey: 'settings.promptTemplates.directorStudioScreenshotHandoff.title',
    descriptionKey: 'settings.promptTemplates.directorStudioScreenshotHandoff.desc',
    dynamicDescriptionKey: 'settings.promptManagement.dynamicNotes.directorStudioScreenshotHandoff',
    defaultLanguage: 'en',
    defaults: {
      zh: '导演台截图参考：@图1 是导演台截图，请将它作为构图、空间布局、镜头取景、透视和场面调度参考。@图2、@图3 及后续连接图片是身份、主体、外观、材质和道具参考；在遵循 @图1 构图的同时保持这些参考的身份与材质特征。',
      en: 'Director Studio screenshot reference: @图1 is the Director Studio screenshot and must be used as the composition, spatial layout, camera framing, perspective, and staging reference. @图2, @图3, and later connected images are identity, subject, appearance, material, and prop references; preserve those identities while following the @图1 composition.',
    },
    placeholders: [] as const,
  },
  {
    id: 'directorStudio.panoramaImport',
    scope: 'directorStudio',
    titleKey: 'settings.promptTemplates.directorStudioPanoramaImport.title',
    descriptionKey: 'settings.promptTemplates.directorStudioPanoramaImport.desc',
    dynamicDescriptionKey: 'settings.promptManagement.dynamicNotes.directorStudioPanoramaImport',
    defaultLanguage: 'en',
    defaults: {
      zh: '将选中的图片{{sourceLabel}}转换为完整沉浸式导演台全景环境背景，最终图像需要能作为 3D 导演台中包裹场景的环境球内壁贴图或水平环绕背景。优先输出 2:1 等距柱状投影球形全景；若使用环绕投影则输出 4:1 或最宽可用比例。保留源图的位置、材质语言、光线方向、色彩 palette 和视觉风格，合成观看者四周缺失的所有方向，不要只是拉伸或裁切源图。不要文字、水印、界面元素、边框、鱼眼圆形边界或明显拼接接缝。',
      en: 'convert the selected image{{sourceLabel}} into a complete immersive Director Studio panorama environment background that can be wrapped around the 3D Director Studio scene as an environment-sphere inner texture or horizontal wraparound backdrop. Prefer a 2:1 equirectangular spherical panorama; for cylindrical projection use 4:1 or the widest available panorama ratio. Preserve the source image location, material language, lighting direction, color palette, and visual style, synthesize all missing directions around the viewer; do not merely stretch or crop the source image. No text, watermark, UI elements, border, fisheye circular boundary, or visible stitching seams.',
    },
    placeholders: ['{{sourceLabel}}'],
  },
  {
    id: 'storyboard.gridGeneration',
    scope: 'storyboard',
    titleKey: 'settings.promptTemplates.storyboardGridGeneration.title',
    descriptionKey: 'settings.promptTemplates.storyboardGridGeneration.desc',
    dynamicDescriptionKey: 'settings.promptManagement.dynamicNotes.storyboardGrid',
    defaultLanguage: 'zh',
    defaults: {
      zh: '生成一张{{gridRows}}×{{gridCols}}的{{frameCount}}宫格分镜图。{{styleDirective}}{{textDirective}}\n{{frames}}',
      en: 'Generate one {{gridRows}}×{{gridCols}} storyboard grid with {{frameCount}} panels. {{styleDirective}}{{textDirective}}\n{{frames}}',
    },
    placeholders: [
      '{{gridRows}}',
      '{{gridCols}}',
      '{{frameCount}}',
      '{{styleDirective}}',
      '{{textDirective}}',
      '{{frames}}',
    ],
  },
  ...(
    [
      ['tool.hdSketch', 'hdSketch'],
      ['tool.hdComposite', 'hdComposite'],
      ['tool.outpaint.balanced', 'outpaintBalanced'],
      ['tool.outpaint.horizontal', 'outpaintHorizontal'],
      ['tool.outpaint.vertical', 'outpaintVertical'],
      ['tool.inpaint', 'inpaint'],
      ['tool.erase', 'erase'],
      ['tool.matting', 'matting'],
    ] as const
  ).map(([id, promptKey]): PromptTemplateDefinition => ({
    id,
    scope: 'tool',
    titleKey: `settings.promptTemplates.${id.replace(/\./g, '_')}.title`,
    descriptionKey: `settings.promptTemplates.${id.replace(/\./g, '_')}.desc`,
    dynamicDescriptionKey: id === 'tool.inpaint'
      ? 'settings.promptManagement.dynamicNotes.inpaint'
      : id === 'tool.matting'
        ? 'settings.promptManagement.dynamicNotes.matting'
        : 'settings.promptManagement.dynamicNotes.referenceImage',
    defaultLanguage: 'en',
    defaults: TOOL_PROMPTS[promptKey],
    placeholders: id === 'tool.inpaint'
      ? ['{{targetContent}}']
      : id === 'tool.matting'
        ? ['{{targetSubject}}']
        : [] as const,
  })),
] as const satisfies readonly PromptTemplateDefinition[];

export type PromptTemplateId = (typeof PROMPT_TEMPLATE_DEFINITIONS)[number]['id'];

export const PROMPT_TEMPLATE_DEFINITION_BY_ID = PROMPT_TEMPLATE_DEFINITIONS.reduce(
  (acc, definition) => {
    acc[definition.id] = definition;
    return acc;
  },
  {} as Record<PromptTemplateId, PromptTemplateDefinition>
);

export function isPromptLanguage(value: unknown): value is PromptLanguage {
  return value === 'zh' || value === 'en';
}

export function isPromptTemplateLanguagePreference(
  value: unknown
): value is PromptTemplateLanguagePreference {
  return value === 'inherit' || isPromptLanguage(value);
}

export function normalizePromptLanguage(
  value: unknown,
  fallback: PromptLanguage = 'zh'
): PromptLanguage {
  return isPromptLanguage(value) ? value : fallback;
}

export function isPromptTemplateId(value: string): value is PromptTemplateId {
  return value in PROMPT_TEMPLATE_DEFINITION_BY_ID;
}

export function getPromptTemplateDefinition(
  id: PromptTemplateId
): PromptTemplateDefinition {
  return PROMPT_TEMPLATE_DEFINITION_BY_ID[id];
}

export function getPromptTemplateEffectiveLanguage(
  id: PromptTemplateId,
  settings: PromptTemplateSettingsSnapshot
): PromptLanguage {
  const definition = getPromptTemplateDefinition(id);
  const overrideLanguage = settings.promptTemplateOverrides?.[id]?.language;
  if (isPromptLanguage(overrideLanguage)) {
    return overrideLanguage;
  }
  return normalizePromptLanguage(settings.promptDefaultLanguage, definition.defaultLanguage);
}

function resolveLegacyTemplate(
  id: PromptTemplateId,
  settings: PromptTemplateSettingsSnapshot
): string | null {
  if (id === 'multiAngle.default') {
    const value = settings.multiAnglePromptTemplate?.trim() ?? '';
    return value && value !== DEFAULT_MULTI_ANGLE_PROMPT_TEMPLATE ? value : null;
  }
  if (id === 'lighting.default') {
    const value = settings.lightingPromptTemplate?.trim() ?? '';
    return value && value !== DEFAULT_LIGHTING_PROMPT_TEMPLATE ? value : null;
  }
  return null;
}

export function resolvePromptTemplateText(
  id: PromptTemplateId,
  settings: PromptTemplateSettingsSnapshot
): string {
  const definition = getPromptTemplateDefinition(id);
  const language = getPromptTemplateEffectiveLanguage(id, settings);
  const overrideTemplate = settings.promptTemplateOverrides?.[id]?.template?.trim();
  if (overrideTemplate) {
    return overrideTemplate;
  }
  const legacyTemplate = resolveLegacyTemplate(id, settings);
  if (legacyTemplate) {
    return legacyTemplate;
  }
  return definition.defaults[language] || definition.defaults[definition.defaultLanguage];
}

export function getPromptTemplateDefaultText(
  id: PromptTemplateId,
  language: PromptLanguage
): string {
  const definition = getPromptTemplateDefinition(id);
  return definition.defaults[language] || definition.defaults[definition.defaultLanguage];
}
