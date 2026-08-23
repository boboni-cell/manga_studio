// Same-origin Flask API client for the Canvas V2 workbench.
// Sessions are carried by cookies; no secret is ever stored client-side.

export async function api<T = unknown>(url: string, init?: RequestInit): Promise<T> {
  const projectId = typeof window !== 'undefined'
    ? new URLSearchParams(window.location.search).get('project_id')
    : null;
  const res = await fetch(url, {
    credentials: 'same-origin',
    ...init,
    headers: {
      'Content-Type': 'application/json',
      ...(projectId ? { 'X-Project-ID': projectId } : {}),
      ...(init?.headers || {}),
    },
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

export interface ProjectSummary {
  id: string;
  title: string;
  canvas_id: string | null;
  canvas_v2_id: string | null;
  cover_url: string | null;
  last_mode: 'classic' | 'canvas' | null;
  deleted_at?: string | null;
}

export async function pollImageJob(jobId: string, timeoutMs = 10 * 60 * 1000): Promise<string | null> {
  const deadline = Date.now() + timeoutMs;
  for (;;) {
    const r = await api<{ status?: string; url?: string; error?: string }>('/api/image-status/' + encodeURIComponent(jobId));
    if (r.status === 'succeeded') return r.url || null;
    if (r.status === 'failed') throw new Error(r.error || '图片生成失败');
    if (Date.now() > deadline) throw new Error('图片生成超时');
    await sleep(2000);
  }
}

export async function pollVideoJob(jobId: string, timeoutMs = 16 * 60 * 1000): Promise<string | null> {
  const deadline = Date.now() + timeoutMs;
  for (;;) {
    const r = await api<{ status?: string; video_url?: string; error?: string }>('/api/status/' + encodeURIComponent(jobId));
    if (r.status === 'succeeded') return r.video_url || null;
    if (r.status === 'failed') throw new Error(r.error || '视频生成失败');
    if (Date.now() > deadline) throw new Error('视频生成超时');
    await sleep(2000);
  }
}

export interface CanvasV2Document {
  id: string;
  title: string;
  created_at: string;
  updated_at: string;
  viewport: { x: number; y: number; zoom: number };
  nodes: unknown[];
  edges: unknown[];
}
