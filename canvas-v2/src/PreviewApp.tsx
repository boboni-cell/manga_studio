import { useEffect, useState } from 'react';
import { ReactFlowProvider } from '@xyflow/react';
import { Canvas } from '@/features/canvas/Canvas';
import { GlobalErrorDialog } from '@/components/GlobalErrorDialog';
import { useCanvasStore } from '@/stores/canvasStore';
import { useSettingsStore } from '@/stores/settingsStore';
import { CANVAS_NODE_TYPES } from '@/features/canvas/domain/canvasNodes';
import {
  subscribeOpenGlobalErrorDialog,
  type GlobalErrorDialogDetail,
} from '@/features/app/errorDialogEvents';

// Mark the upstream built-in image providers as "configured" with a mock
// key so the full generation UI renders as upstream. The key is never
// transmitted anywhere: every native call goes through the Tauri stub and
// surfaces the preview-mode notice. Seeding runs at module scope AND after
// mount so the settings store's persistence hydration cannot wipe it.
function seedMockProviderKeys(): void {
  const settings = useSettingsStore.getState();
  for (const id of ['fal', 'grsai', 'kie', 'ppio']) {
    settings.setProviderApiKey(id, 'sk-mock-preview');
  }
}
seedMockProviderKeys();
if (typeof useSettingsStore.persist?.onFinishHydration === 'function') {
  useSettingsStore.persist.onFinishHydration(() => seedMockProviderKeys());
}

function svgImage(color: string, label: string): string {
  const svg =
    '<svg xmlns="http://www.w3.org/2000/svg" width="320" height="180">' +
    '<rect width="100%" height="100%" fill="' + color + '"/>' +
    '<text x="50%" y="50%" fill="#ffffff" font-size="22" text-anchor="middle" font-family="sans-serif">' +
    label + '</text></svg>';
  return 'data:image/svg+xml;utf8,' + encodeURIComponent(svg);
}

// Fixed mock canvas: no persistence, no API calls, pure UI demo.
function seedMockCanvas(): void {
  const store = useCanvasStore.getState();

  const text = store.addNode(
    CANVAS_NODE_TYPES.aiText,
    { x: 40, y: 140 },
    {
      displayName: '剧本文本',
      prompt: '雨夜，侦探在小巷里与神秘女子相遇，霓虹灯在积水上映出倒影。',
    },
  );
  const story = store.addNode(
    CANVAS_NODE_TYPES.storyboardGen,
    { x: 620, y: 60 },
    {
      displayName: '分镜生成',
      prompt: '雨夜巷口相遇，霓虹倒影，电影感构图',
    },
  );
  const image = store.addNode(
    CANVAS_NODE_TYPES.imageEdit,
    { x: 1000, y: 80 },
    {
      displayName: '图片生成',
      prompt: '侦探雨夜特写，电影感',
      imageUrl: svgImage('#3b82f6', '分镜图'),
      previewImageUrl: svgImage('#3b82f6', '分镜图'),
      aspectRatio: '16:9',
    },
  );
  const upload = store.addNode(
    CANVAS_NODE_TYPES.upload,
    { x: 40, y: 520 },
    {
      displayName: '上传素材',
      sourceFileName: '角色参考.png',
      imageUrl: svgImage('#8b5cf6', '素材'),
      previewImageUrl: svgImage('#8b5cf6', '素材'),
      aspectRatio: '1:1',
    },
  );
  const video = store.addNode(
    CANVAS_NODE_TYPES.aiVideo,
    { x: 1000, y: 420 },
    {
      displayName: '视频生成',
      prompt: '镜头缓缓推进，雨滴落在侦探帽檐',
    },
  );
  const note = store.addNode(
    CANVAS_NODE_TYPES.textAnnotation,
    { x: 620, y: 520 },
    {
      displayName: '便签',
      content: '这是 Canvas V2 预览模式。\n可以拖动、连线、框选、复制粘贴。\n生成功能尚未接入。',
    },
  );

  store.addEdge(text, story);
  store.addEdge(upload, image);
  store.addEdge(image, video);
  store.addEdge(text, note);
}

seedMockCanvas();

export default function PreviewApp() {
  const [error, setError] = useState<GlobalErrorDialogDetail | null>(null);

  useEffect(() => {
    seedMockProviderKeys();
    return subscribeOpenGlobalErrorDialog((detail) => setError(detail));
  }, []);

  return (
    <ReactFlowProvider>
      <div className="relative h-screen w-screen overflow-hidden bg-[var(--canvas-bg)]">
        <Canvas />
        <GlobalErrorDialog
          isOpen={Boolean(error)}
          title={error?.title ?? ''}
          message={error?.message ?? ''}
          details={error?.details}
          copyText={error?.copyText}
          onClose={() => setError(null)}
        />
      </div>
    </ReactFlowProvider>
  );
}
