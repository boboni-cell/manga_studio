import type { Node, Edge } from '@xyflow/react';

export type CanvasNodeType = 'script' | 'shot' | 'asset' | 'image' | 'video' | 'result' | 'note';

export interface ShotSegment {
  segment_no?: number | string;
  duration?: number;
  scene?: string;
  characters?: string[];
  emotion?: string;
  story_action?: string;
  action?: string;
  dialogue?: string;
  beats?: unknown[];
  video_prompt?: string;
  visual_prompt?: string;
  timeline?: unknown;
  timeline_text?: string;
  [key: string]: unknown;
}

export interface ScriptSplitState {
  job_id: string | null;
  status: 'idle' | 'running' | 'succeeded' | 'failed';
  shots: ShotSegment[];
  error: string | null;
}

export type AssetSource = 'character' | 'outfit' | 'scene' | 'audio' | 'upload' | 'style' | 'video';

export interface AssetRef {
  source: AssetSource;
  ref_id: string | number | null;
  name: string;
  url: string;
  role_label: string;
}

export type CanvasNodeData = Record<string, unknown> & {
  label?: string;
};

export type CanvasNode = Node<CanvasNodeData>;
export type CanvasEdge = Edge;
export interface CanvasViewport {
  x: number;
  y: number;
  zoom: number;
}

export interface CanvasDocument {
  id: string;
  title: string;
  created_at: string;
  updated_at: string;
  viewport: CanvasViewport;
  nodes: CanvasNode[];
  edges: CanvasEdge[];
}

export interface CanvasSummary {
  id: string;
  title: string;
  created_at: string;
  updated_at: string;
}
