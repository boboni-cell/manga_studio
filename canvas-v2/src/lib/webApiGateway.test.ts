import { beforeEach, describe, expect, it, vi } from 'vitest';

const { apiMock } = vi.hoisted(() => ({
  apiMock: vi.fn(),
}));

vi.mock('@/api', () => ({
  api: apiMock,
  pollImageJob: vi.fn(),
}));

import {
  buildImageRequest,
  buildVideoRequest,
} from './mangaGatewayPayload';
import {
  findCompletedVideoInHistory,
  webApiGateway,
} from '@/features/canvas/infrastructure/webApiGateway';

beforeEach(() => {
  apiMock.mockReset();
});

describe('Manga Studio Flask gateway payloads', () => {
  it('routes an image personal API through the classic workbench fields', () => {
    const request = buildImageRequest({
      prompt: 'portrait',
      model: 'personal-api',
      size: '2K',
      aspectRatio: '3:4',
      referenceImages: ['https://example.com/ref.png'],
      extraParams: {
        use_personal_api: true,
        api_profile_id: 'image-profile-1',
        style_id: 'style-1',
      },
    });

    expect(request).toMatchObject({
      prompt: 'portrait',
      image_model: 'personal-api',
      ratio: '3:4',
      use_personal_api: true,
      api_profile_id: 'image-profile-1',
      style_id: 'style-1',
    });
    expect(request.input_images).toEqual([
      { url: 'https://example.com/ref.png', role_label: '参考图' },
    ]);
  });

  it('routes a video personal API and every supported reference field', () => {
    const request = buildVideoRequest({
      prompt: 'camera move',
      model: 'personal-api',
      size: '1080p',
      aspectRatio: '16:9',
      seconds: 10,
      inputReference: 'https://example.com/first.png',
      referenceImages: ['https://example.com/ref.png'],
      referenceVideos: ['https://example.com/previous.mp4'],
      referenceAudios: ['https://example.com/music.mp3'],
      extraParams: {
        use_personal_api: true,
        api_profile_id: 'video-profile-1',
        last_frame_url: 'https://example.com/last.png',
        storyboard_ref_url: 'https://example.com/board.png',
        style_id: 'style-2',
        optimize_prompt: false,
      },
    });

    expect(request).toMatchObject({
      video_model: 'personal-api',
      use_personal_api: true,
      api_profile_id: 'video-profile-1',
      audio_url: 'https://example.com/music.mp3',
      video_url: 'https://example.com/previous.mp4',
      first_frame_url: 'https://example.com/first.png',
      last_frame_url: 'https://example.com/last.png',
      storyboard_ref_url: 'https://example.com/board.png',
      ratio: '16:9',
      duration: 10,
      resolution: '1080p',
      optimize_prompt: false,
      style_id: 'style-2',
    });
  });

  it('does not enable personal API without a valid profile id', () => {
    const request = buildImageRequest({
      prompt: 'test',
      model: 'gpt-image-2',
      size: '2K',
      aspectRatio: '1:1',
      extraParams: { use_personal_api: true, api_profile_id: '' },
    });

    expect(request.use_personal_api).toBe(false);
    expect(request.api_profile_id).toBeUndefined();
  });
});

describe('Manga Studio Flask gateway polling', () => {
  it('keeps polling while a video job is running upstream', async () => {
    apiMock.mockResolvedValueOnce({ status: 'running', video_url: null, error: null });

    await expect(webApiGateway.getGenerateVideoJob('video-job-1')).resolves.toMatchObject({
      job_id: 'video-job-1',
      status: 'running',
      result: null,
      error: null,
    });
    expect(apiMock).toHaveBeenCalledWith('/api/status/video-job-1');
  });

  it('recovers a legacy completed video only when the full prompt matches', async () => {
    apiMock.mockResolvedValueOnce([
      {
        type: 'video',
        video_url: 'https://example.com/older.mp4',
        original_script: 'different prompt',
      },
      {
        type: 'video',
        video_url: 'https://example.com/recovered.mp4',
        original_script: 'exact prompt',
      },
    ]);

    await expect(findCompletedVideoInHistory({
      jobId: 'lost-after-restart',
      prompt: 'exact prompt',
    })).resolves.toBe('https://example.com/recovered.mp4');
  });

  it('prefers source job id and does not reuse a video already on the canvas', async () => {
    apiMock.mockResolvedValueOnce([
      {
        type: 'video',
        video_url: 'https://example.com/used.mp4',
        source_job_id: 'job-2',
      },
      {
        type: 'video',
        video_url: 'https://example.com/right.mp4',
        source_job_id: 'job-2',
      },
    ]);

    await expect(findCompletedVideoInHistory({
      jobId: 'job-2',
      prompt: '',
      excludedUrls: ['https://example.com/used.mp4'],
    })).resolves.toBe('https://example.com/right.mp4');
  });
});
