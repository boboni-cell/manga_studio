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
    case 'pending': return 'running';
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
