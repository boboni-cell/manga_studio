import { createContext, useContext } from 'react';
import type { CanvasNode, CanvasEdge } from './types';

export interface CanvasContextValue {
  nodes: CanvasNode[];
  edges: CanvasEdge[];
  apiProfiles: Record<string, any[]>;
  selectedApiProfiles: Record<string, string>;
  modelCaps: Record<string, any>;
  updateNodeData: (id: string, patch: Record<string, unknown>) => void;
  addResultNode: (sourceId: string, kind: 'image' | 'video', url: string) => void;
  openBranchMenu: (nodeId: string) => void;
  openInspector: (nodeId: string) => void;
  duplicateNode: (id: string) => void;
  deleteNode: (id: string) => void;
  previewNode: (id: string) => void;
}

export const CanvasContext = createContext<CanvasContextValue | null>(null);

export function useCanvas(): CanvasContextValue {
  const value = useContext(CanvasContext);
  if (!value) throw new Error('CanvasContext missing');
  return value;
}
