// Flask-backed AiGateway. All provider keys stay server-side (Flask env /
// personal API settings); the browser only carries the session cookie.
import { api, pollImageJob } from '@/api';
import type {
  AiGateway,
  GenerateImagePayload,
  GenerateVideoPayload,
  GenerationJobPollStatus,
} from '../application/ports';
import { buildImageRequest, buildVideoRequest } from '@/lib/mangaGatewayPayload';

interface VideoHistoryRecord {
  type?: unknown;
  video_url?: unknown;
  original_script?: unknown;
  refined_script?: unknown;
  source_job_id?: unknown;
}

function nonEmptyString(value: unknown): string {
  return typeof value === 'string' ? value.trim() : '';
}

export async function findCompletedVideoInHistory(input: {
  jobId: string;
  prompt: string;
  excludedUrls?: readonly string[];
}): Promise<string | null> {
  const history = await api<unknown>('/api/history');
  if (!Array.isArray(history)) return null;
  const jobId = input.jobId.trim();
  const prompt = input.prompt.trim();
  const excluded = new Set((input.excludedUrls ?? []).map((url) => url.trim()).filter(Boolean));
  const records = history.filter((item): item is VideoHistoryRecord => Boolean(item && typeof item === 'object'));

  const exactJob = records.find((item) => (
    item.type === 'video'
    && nonEmptyString(item.source_job_id) === jobId
    && !excluded.has(nonEmptyString(item.video_url))
  ));
  if (exactJob) return nonEmptyString(exactJob.video_url) || null;
  if (!prompt) return null;

  const legacyMatch = records.find((item) => {
    const videoUrl = nonEmptyString(item.video_url);
    if (item.type !== 'video' || !videoUrl || excluded.has(videoUrl) || nonEmptyString(item.source_job_id)) {
      return false;
    }
    return nonEmptyString(item.original_script) === prompt
      || nonEmptyString(item.refined_script) === prompt;
  });
  return legacyMatch ? nonEmptyString(legacyMatch.video_url) || null : null;
}

function mapImageStatus(status: string | undefined): GenerationJobPollStatus['status'] {
  switch (status) {
    case 'succeeded': return 'succeeded';
    case 'failed': return 'failed';
    case 'not_found': return 'not_found';
    case 'pending': return 'running';
    default: return 'unknown';
  }
}

function mapVideoStatus(status: string | undefined): GenerationJobPollStatus['status'] {
  switch (status) {
    case 'succeeded': return 'succeeded';
    case 'failed': return 'failed';
    case 'not_found': return 'not_found';
    case 'pending':
    case 'running':
      return 'running';
    default: return 'unknown';
  }
}

export const webApiGateway: AiGateway = {
  setApiKey: async () => {
    // Keys are server-side only; nothing to do in the browser.
  },

  generateImage: async (payload: GenerateImagePayload) => {
    const jobId = await webApiGateway.submitGenerateImageJob(payload);
    const url = await pollImageJob(jobId);
    if (!url) throw new Error('图片生成未返回结果');
    return url;
  },

  submitGenerateImageJob: async (payload: GenerateImagePayload) => {
    const extra = payload.extraParams ?? {};
    const res = await api<{ job_id: string }>('/api/generate-image', {
      method: 'POST',
      body: JSON.stringify(buildImageRequest(payload, extra)),
    });
    return res.job_id;
  },

  getGenerateImageJob: async (jobId: string): Promise<GenerationJobPollStatus> => {
    const r = await api<{ status?: string; url?: string; error?: string }>('/api/image-status/' + encodeURIComponent(jobId));
    return {
      job_id: jobId,
      status: mapImageStatus(r.status),
      result: r.url ?? null,
      result_url: r.url ?? null,
      error: r.error ?? null,
    };
  },

  submitGenerateVideoJob: async (payload: GenerateVideoPayload) => {
    const extra = payload.extraParams ?? {};
    const res = await api<{ job_id: string }>('/api/generate', {
      method: 'POST',
      body: JSON.stringify(buildVideoRequest(payload, extra)),
    });
    return res.job_id;
  },

  getGenerateVideoJob: async (jobId: string): Promise<GenerationJobPollStatus> => {
    const r = await api<{ status?: string; video_url?: string; error?: string }>('/api/status/' + encodeURIComponent(jobId));
    return {
      job_id: jobId,
      status: mapVideoStatus(r.status),
      result: r.video_url ?? null,
      result_url: r.video_url ?? null,
      error: r.error ?? null,
    };
  },

  retryGenerationJob: async (jobId: string) => {
    await webApiGateway.getGenerateImageJob(jobId);
    return true;
  },
};
