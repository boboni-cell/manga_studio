import {
  NODE_TOOL_TYPES,
  isExportImageNode,
  isImageEditNode,
  isUploadNode,
  type CanvasNode,
} from '../domain/canvasNodes';
import { stringifyAnnotationItems } from './annotation';
import type { CanvasToolPlugin } from './types';

function supportsImageSourceNode(node: CanvasNode): boolean {
  return isUploadNode(node) || isImageEditNode(node) || isExportImageNode(node);
}

export const cropToolPlugin: CanvasToolPlugin = {
  type: NODE_TOOL_TYPES.crop,
  label: '裁剪',
  icon: 'crop',
  editor: 'crop',
  supportsNode: (node) => supportsImageSourceNode(node) && Boolean(node.data.imageUrl),
  createInitialOptions: () => ({
    aspectRatio: 'free',
    customAspectRatio: '',
  }),
  fields: [
    {
      key: 'aspectRatio',
      label: '目标比例',
      type: 'select',
      options: [
        { label: '自由', value: 'free' },
        { label: '1:1', value: '1:1' },
        { label: '16:9', value: '16:9' },
        { label: '9:16', value: '9:16' },
        { label: '4:3', value: '4:3' },
        { label: '3:4', value: '3:4' },
      ],
    },
  ],
  execute: async (sourceImageUrl, options, context) =>
    await context.processTool(NODE_TOOL_TYPES.crop, sourceImageUrl, options),
};

export const annotateToolPlugin: CanvasToolPlugin = {
  type: NODE_TOOL_TYPES.annotate,
  label: '标注',
  icon: 'annotate',
  editor: 'annotate',
  supportsNode: (node) => supportsImageSourceNode(node) && Boolean(node.data.imageUrl),
  createInitialOptions: () => ({
    color: '#ff4d4f',
    lineWidthPercent: 0.4,
    fontSizePercent: 10,
    annotations: stringifyAnnotationItems([]),
  }),
  fields: [],
  execute: async (sourceImageUrl, options, context) =>
    await context.processTool(NODE_TOOL_TYPES.annotate, sourceImageUrl, options),
};

export const splitStoryboardToolPlugin: CanvasToolPlugin = {
  type: NODE_TOOL_TYPES.splitStoryboard,
  label: '切割',
  icon: 'split',
  editor: 'split',
  supportsNode: (node) => supportsImageSourceNode(node) && Boolean(node.data.imageUrl),
  createInitialOptions: () => ({
    rows: 3,
    cols: 3,
    lineThicknessPercent: 0.5,
  }),
  fields: [],
  execute: async (sourceImageUrl, options, context) =>
    await context.processTool(NODE_TOOL_TYPES.splitStoryboard, sourceImageUrl, options),
};

export const builtInToolPlugins: CanvasToolPlugin[] = [
  cropToolPlugin,
  annotateToolPlugin,
  splitStoryboardToolPlugin,
];

// ---------------------------------------------------------------------------
// Edit-family plugins. All five open the shared NodeToolDialog with the
// 'confirm' or 'mask' editor kind. Submission routes through the existing
// toolProcessor — which, for these AI-backed tools, delegates to the canvas
// AI gateway using the node's current model. Mask brush UI for inpaint/erase
// is a placeholder (editor kind 'mask' falls back to the confirm editor for
// now) and will be replaced with a real canvas brush later.
// ---------------------------------------------------------------------------

export const hdToolPlugin: CanvasToolPlugin = {
  type: NODE_TOOL_TYPES.hd,
  label: '高清',
  icon: 'hd',
  editor: 'form',
  supportsNode: (node) => supportsImageSourceNode(node) && Boolean(node.data.imageUrl),
  createInitialOptions: () => ({ prompt: '' }),
  fields: [
    { key: 'prompt', label: '高清提示词（可选）', type: 'text', placeholder: '例如：皮肤质感更细腻 / 布料纹理更锐利' },
  ],
  execute: async (sourceImageUrl, options, context) =>
    await context.processTool(NODE_TOOL_TYPES.hd, sourceImageUrl, options),
};

export const outpaintingToolPlugin: CanvasToolPlugin = {
  type: NODE_TOOL_TYPES.outpainting,
  label: '扩图',
  icon: 'outpaint',
  editor: 'form',
  supportsNode: (node) => supportsImageSourceNode(node) && Boolean(node.data.imageUrl),
  createInitialOptions: () => ({
    direction: 'balanced',
    prompt: '',
  }),
  fields: [
    {
      key: 'direction',
      label: '扩展方向',
      type: 'select',
      options: [
        { label: '等比扩展', value: 'balanced' },
        { label: '横向扩展', value: 'horizontal' },
        { label: '竖向扩展', value: 'vertical' },
      ],
    },
    { key: 'prompt', label: '扩图内容补充', type: 'text', placeholder: '例如：补充远处的山和天空' },
  ],
  execute: async (sourceImageUrl, options, context) =>
    await context.processTool(NODE_TOOL_TYPES.outpainting, sourceImageUrl, options),
};

export const inpaintingToolPlugin: CanvasToolPlugin = {
  type: NODE_TOOL_TYPES.inpainting,
  label: '重绘',
  icon: 'inpaint',
  editor: 'mask',
  supportsNode: (node) => supportsImageSourceNode(node) && Boolean(node.data.imageUrl),
  createInitialOptions: () => ({
    prompt: '',
    brushSize: 24,
  }),
  fields: [
    { key: 'prompt', label: '重绘内容', type: 'text', placeholder: '描述涂抹区域要变成什么' },
    { key: 'brushSize', label: '笔刷大小', type: 'number', min: 4, max: 120, step: 2 },
  ],
  execute: async (sourceImageUrl, options, context) =>
    await context.processTool(NODE_TOOL_TYPES.inpainting, sourceImageUrl, options),
};

export const eraseToolPlugin: CanvasToolPlugin = {
  type: NODE_TOOL_TYPES.erase,
  label: '擦除',
  icon: 'erase',
  editor: 'mask',
  supportsNode: (node) => supportsImageSourceNode(node) && Boolean(node.data.imageUrl),
  createInitialOptions: () => ({ brushSize: 24 }),
  fields: [
    { key: 'brushSize', label: '笔刷大小', type: 'number', min: 4, max: 120, step: 2 },
  ],
  execute: async (sourceImageUrl, options, context) =>
    await context.processTool(NODE_TOOL_TYPES.erase, sourceImageUrl, options),
};

export const mattingToolPlugin: CanvasToolPlugin = {
  type: NODE_TOOL_TYPES.matting,
  label: '抠图',
  icon: 'matting',
  editor: 'mask',
  supportsNode: (node) => supportsImageSourceNode(node) && Boolean(node.data.imageUrl),
  createInitialOptions: () => ({ prompt: '', brushSize: 40 }),
  fields: [
    { key: 'prompt', label: '抠图对象（可选）', type: 'text', placeholder: '例如：前景的主角人物 / 桌上的苹果' },
    { key: 'brushSize', label: '笔刷大小', type: 'number', min: 4, max: 120, step: 2 },
  ],
  execute: async (sourceImageUrl, options, context) =>
    await context.processTool(NODE_TOOL_TYPES.matting, sourceImageUrl, options),
};

builtInToolPlugins.push(
  hdToolPlugin,
  outpaintingToolPlugin,
  inpaintingToolPlugin,
  eraseToolPlugin,
  mattingToolPlugin,
);
