import { useEffect, useRef, useState } from 'react';
import { ReactFlowProvider, useReactFlow } from '@xyflow/react';
import { Canvas } from '@/features/canvas/Canvas';
import { GlobalErrorDialog } from '@/components/GlobalErrorDialog';
import { useCanvasStore } from '@/stores/canvasStore';
import type { CanvasNode, CanvasEdge } from '@/features/canvas/domain/canvasNodes';
import {
  subscribeOpenGlobalErrorDialog,
  type GlobalErrorDialogDetail,
} from '@/features/app/errorDialogEvents';
import { api, type CanvasV2Document } from '@/api';
import { translateLegacyCanvas } from '@/lib/legacyCompat';

function serializeNode(node: CanvasNode): Record<string, unknown> {
  return { id: node.id, type: node.type, position: node.position, data: node.data };
}
function serializeEdge(edge: CanvasEdge): Record<string, unknown> {
  const out: Record<string, unknown> = { id: edge.id, source: edge.source, target: edge.target };
  for (const key of ['label', 'type', 'sourceHandle', 'targetHandle'] as const) {
    const value = (edge as unknown as Record<string, unknown>)[key];
    if (value != null) out[key] = value;
  }
  return out;
}

function WorkbenchInner() {
  const reactFlow = useReactFlow();
  const [error, setError] = useState<GlobalErrorDialogDetail | null>(null);
  const [ready, setReady] = useState(false);
  const canvasV2IdRef = useRef<string | null>(null);
  const projectTitleRef = useRef('未命名项目');
  const isRestoringRef = useRef(true);
  const saveTimerRef = useRef<number | null>(null);
  const titleSyncedRef = useRef(false);
  const coverSentRef = useRef(false);

  const nodes = useCanvasStore((s) => s.nodes);
  const edges = useCanvasStore((s) => s.edges);
  const viewport = useCanvasStore((s) => s.currentViewport);

  useEffect(() => subscribeOpenGlobalErrorDialog((d) => setError(d)), []);

  const projectId = new URLSearchParams(window.location.search).get('project_id') || '';
  const embedded = new URLSearchParams(window.location.search).get('embedded') === '1';

  useEffect(() => {
    if (!projectId) {
      window.location.replace('/');
      return;
    }
    let cancelled = false;
    (async () => {
      try {
        const r = await api<{
          canvas: CanvasV2Document;
          legacy_canvas: { nodes?: unknown[]; edges?: unknown[] } | null;
          canvas_v2_migrated_at?: string | null;
        }>('/api/projects/' + encodeURIComponent(projectId) + '/canvas-v2');
        if (cancelled) return;
        canvasV2IdRef.current = r.canvas.id;
        projectTitleRef.current = r.canvas.title || '未命名项目';
        document.title = (r.canvas.title || '未命名项目') + ' · Manga Studio';

        const store = useCanvasStore.getState();
        isRestoringRef.current = true;
        store.setCanvasData(r.canvas.nodes as CanvasNode[], r.canvas.edges as CanvasEdge[]);
        store.setViewportState(r.canvas.viewport || { x: 0, y: 0, zoom: 0.85 });
        reactFlow.setViewport(r.canvas.viewport || { x: 0, y: 0, zoom: 0.85 }, { duration: 0 });

        // One-time legacy migration (never touches the legacy document).
        if (r.legacy_canvas && !r.canvas_v2_migrated_at) {
          const hasLegacyNodes = Array.isArray(r.legacy_canvas.nodes) && r.legacy_canvas.nodes.length > 0;
          const isEmptyV2 = !Array.isArray(r.canvas.nodes) || r.canvas.nodes.length === 0;
          if (hasLegacyNodes && isEmptyV2) {
            const proceed = window.confirm('检测到旧版画布数据，是否一次性迁移到新版画布？旧版数据不会被删除。');
            if (proceed) {
              const translated = translateLegacyCanvas(r.legacy_canvas);
              useCanvasStore.getState().setCanvasData(
                translated.nodes as unknown as CanvasNode[],
                translated.edges as unknown as CanvasEdge[],
              );
            }
          }
          try {
            await api('/api/projects/' + encodeURIComponent(projectId), {
              method: 'PUT',
              body: JSON.stringify({ canvas_v2_migrated_at: new Date().toISOString() }),
            });
          } catch {
            // Non-fatal: migration flag is only used to avoid re-prompting.
          }
        }

        setReady(true);
        requestAnimationFrame(() => {
          isRestoringRef.current = false;
        });
      } catch (loadError) {
        setError({ title: '加载失败', message: loadError instanceof Error ? loadError.message : String(loadError) });
      }
    })();
    return () => {
      cancelled = true;
      if (saveTimerRef.current) window.clearTimeout(saveTimerRef.current);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [projectId]);

  // Debounced persistence to the Flask canvas-v2 store.
  useEffect(() => {
    if (!ready || !canvasV2IdRef.current || isRestoringRef.current) return;
    if (saveTimerRef.current) window.clearTimeout(saveTimerRef.current);
    const postMessageState = (state: 'saving' | 'saved' | 'error') => {
      if (embedded && window.parent) {
        window.parent.postMessage({ type: 'canvas:save-state', state }, window.location.origin);
      }
    };
    postMessageState('saving');
    saveTimerRef.current = window.setTimeout(async () => {
      const id = canvasV2IdRef.current;
      if (!id) return;
      try {
        await api('/api/canvas-v2/' + encodeURIComponent(id), {
          method: 'PUT',
          body: JSON.stringify({
            title: projectTitleRef.current,
            nodes: useCanvasStore.getState().nodes.map(serializeNode),
            edges: useCanvasStore.getState().edges.map(serializeEdge),
            viewport: useCanvasStore.getState().currentViewport,
          }),
        });
        postMessageState('saved');
        // keep project title in sync
        if (!titleSyncedRef.current) {
          titleSyncedRef.current = true;
          await api('/api/projects/' + encodeURIComponent(projectId), {
            method: 'PUT',
            body: JSON.stringify({ title: projectTitleRef.current }),
          }).catch(() => undefined);
        }
        // send cover from the first image-ish node
        if (!coverSentRef.current) {
          const n = useCanvasStore.getState().nodes.find(
            (node) =>
              (node.type === 'exportImageNode' || node.type === 'imageNode') &&
              typeof node.data.imageUrl === 'string' &&
              node.data.imageUrl,
          );
          if (n) {
            coverSentRef.current = true;
            await api('/api/projects/' + encodeURIComponent(projectId), {
              method: 'PUT',
              body: JSON.stringify({ cover_url: n.data.imageUrl }),
            }).catch(() => undefined);
          }
        }
      } catch (saveError) {
        postMessageState('error');
        console.error('Canvas V2 保存失败', saveError);
      }
    }, 800);
    return () => {
      if (saveTimerRef.current) window.clearTimeout(saveTimerRef.current);
    };
  }, [nodes, edges, viewport, ready, projectId, embedded]);

  if (!ready) {
    return (
      <div className="flex h-screen w-screen items-center justify-center bg-[var(--canvas-bg)] text-sm text-text-muted">
        {error ? '加载失败，请刷新重试' : '正在加载画布…'}
      </div>
    );
  }

  return (
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
  );
}

export default function WorkbenchApp() {
  return (
    <ReactFlowProvider>
      <WorkbenchInner />
    </ReactFlowProvider>
  );
}
