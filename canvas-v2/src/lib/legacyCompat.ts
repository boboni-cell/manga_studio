// One-time client-side translation of legacy Manga Studio canvas nodes
// (script/shot/asset/image/video/result/note) into Canvas V2 node types.
// The legacy document is never modified server-side; rollback = classic tab.

import type { Node, Edge } from '@xyflow/react';

export const LEGACY_TO_V2_NODE = 'legacy-to-v2';

export interface LegacyNode {
  id: string;
  type: 'script' | 'shot' | 'asset' | 'image' | 'video' | 'result' | 'note';
  position: { x: number; y: number };
  data: Record<string, unknown>;
}

function segmentPrompt(segment: unknown): string {
  if (!segment || typeof segment !== 'object') return '';
  const s = segment as Record<string, unknown>;
  return String(
    [s.story_action, s.action, s.dialogue, s.video_prompt].filter((v) => v && String(v).trim()).join('\n')
  );
}

export function translateLegacyNode(node: LegacyNode): Node {
  const data = node.data || {};
  const label = String(data.label || node.type);
  let type = 'textAnnotationNode';
  const v2Data: Record<string, unknown> = { displayName: label };

  switch (node.type) {
    case 'script':
      type = 'aiTextNode';
      v2Data.prompt = String(data.script || '');
      break;
    case 'shot':
      type = 'storyboardGenNode';
      v2Data.prompt = segmentPrompt(data.segment) || String(data.video_prompt || data.story_action || '');
      v2Data.gridRows = 2;
      v2Data.gridCols = 2;
      v2Data.frames = [];
      break;
    case 'asset': {
      type = 'uploadNode';
      const refs = Array.isArray(data.refs) ? (data.refs as Array<{ url?: string }>) : [];
      const first = refs.find((r) => r && typeof r.url === 'string')?.url || null;
      v2Data.imageUrl = first ?? null;
      v2Data.previewImageUrl = first ?? null;
      v2Data.aspectRatio = '1:1';
      v2Data.sourceFileName = String(data.label || '素材');
      break;
    }
    case 'image':
      type = 'imageNode';
      v2Data.prompt = String(data.prompt || '');
      v2Data.imageUrl = data.image_url ? String(data.image_url) : null;
      v2Data.previewImageUrl = data.image_url ? String(data.image_url) : null;
      v2Data.aspectRatio = String(data.ratio || '1:1');
      break;
    case 'video':
      type = 'aiVideoNode';
      v2Data.prompt = String(data.script || data.video_prompt || '');
      v2Data.ratio = String(data.ratio || '9:16');
      break;
    case 'result': {
      const mediaUrl = data.media_url ? String(data.media_url) : null;
      const kind = data.kind === 'video' ? 'video' : 'image';
      if (kind === 'video') {
        type = 'videoNode';
        v2Data.videoUrl = mediaUrl;
      } else {
        type = 'exportImageNode';
        v2Data.imageUrl = mediaUrl;
        v2Data.previewImageUrl = mediaUrl;
        v2Data.aspectRatio = '1:1';
        v2Data.resultKind = 'generic';
      }
      break;
    }
    case 'note':
    default:
      type = 'textAnnotationNode';
      v2Data.content = String(data.text || '');
      break;
  }

  return {
    id: node.id,
    type,
    position: { x: Number(node.position?.x) || 0, y: Number(node.position?.y) || 0 },
    data: v2Data,
  } as Node;
}

export function translateLegacyCanvas(legacy: { nodes?: unknown[]; edges?: unknown[] } | null | undefined): {
  nodes: Node[];
  edges: Edge[];
} {
  const rawNodes = Array.isArray(legacy?.nodes) ? legacy.nodes : [];
  const rawEdges = Array.isArray(legacy?.edges) ? legacy.edges : [];
  const nodes = rawNodes
    .filter((n): n is LegacyNode => Boolean(n && typeof n === 'object' && (n as LegacyNode).id))
    .map(translateLegacyNode);
  const ids = new Set(nodes.map((n) => n.id));
  const edges = rawEdges
    .filter((e): e is Edge => Boolean(e && typeof e === 'object' && (e as Edge).id))
    .filter((e) => ids.has(e.source) && ids.has(e.target))
    .map((e) => ({ id: e.id, source: e.source, target: e.target }) as Edge);
  return { nodes, edges };
}
