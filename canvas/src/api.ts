export async function api<T = unknown>(url: string, init?: RequestInit): Promise<T> {
  const res = await fetch(url, {
    credentials: 'same-origin',
    ...init,
    headers: { 'Content-Type': 'application/json', ...(init?.headers || {}) },
  });
  let body: Record<string, unknown> | null = null;
  try {
    body = await res.json();
  } catch {
    body = null;
  }
  if (!res.ok) {
    const message = body && typeof body.error === 'string' ? body.error : '请求失败 ' + res.status;
    throw new Error(message);
  }
  return body as T;
}

export function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export async function pollScriptSplit(jobId: string): Promise<unknown[]> {
  for (let i = 0; i < 120; i += 1) {
    const r = await api<{ status?: string; shots?: unknown[]; error?: string }>('/api/script/split/' + encodeURIComponent(jobId));
    if (r.status === 'done') return r.shots || [];
    if (r.status === 'error') throw new Error(r.error || '拆分失败');
    await sleep(2000);
  }
  throw new Error('拆分超时');
}

export async function pollImage(jobId: string): Promise<string | null> {
  for (let i = 0; i < 180; i += 1) {
    const r = await api<{ status?: string; url?: string; error?: string }>('/api/image-status/' + encodeURIComponent(jobId));
    if (r.status === 'succeeded') return r.url || null;
    if (r.status === 'failed') throw new Error(r.error || '图片生成失败');
    await sleep(2000);
  }
  throw new Error('图片生成超时');
}

export async function pollVideo(jobId: string): Promise<string | null> {
  for (let i = 0; i < 300; i += 1) {
    const r = await api<{ status?: string; video_url?: string; error?: string }>('/api/status/' + encodeURIComponent(jobId));
    if (r.status === 'succeeded') return r.video_url || null;
    if (r.status === 'failed') throw new Error(r.error || '视频生成失败');
    await sleep(2000);
  }
  throw new Error('视频生成超时');
}

import type { CanvasNode, CanvasEdge } from './types';

export function upstreamNodes(nodeId: string, nodes: CanvasNode[], edges: CanvasEdge[]): CanvasNode[] {
  const byId = new Map<string, CanvasNode>();
  for (const node of nodes) byId.set(node.id, node);
  const seen = new Set<string>();
  const stack = [nodeId];
  while (stack.length > 0) {
    const current = stack.pop() as string;
    if (seen.has(current)) continue;
    seen.add(current);
    for (const edge of edges) {
      if (edge.target === current && !seen.has(edge.source)) stack.push(edge.source);
    }
  }
  const result: CanvasNode[] = [];
  for (const id of seen) {
    if (id !== nodeId && byId.has(id)) result.push(byId.get(id) as CanvasNode);
  }
  return result;
}

export function upstreamOfType(nodeId: string, type: string, nodes: CanvasNode[], edges: CanvasEdge[]): CanvasNode | null {
  const all = upstreamNodes(nodeId, nodes, edges);
  for (const node of all) {
    if (node.type === type) return node;
  }
  return null;
}

export function upstreamAllOfType(nodeId: string, type: string, nodes: CanvasNode[], edges: CanvasEdge[]): CanvasNode[] {
  return upstreamNodes(nodeId, nodes, edges).filter((node) => node.type === type);
}
