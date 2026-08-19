import type {
  GenerateImagePayload,
  GenerateVideoPayload,
} from '../features/canvas/application/ports';

function optionalString(value: unknown): string | undefined {
  return typeof value === 'string' && value.trim() ? value.trim() : undefined;
}

function personalApiFields(extra: Record<string, unknown>) {
  const profileId = optionalString(extra.api_profile_id);
  const usePersonalApi = extra.use_personal_api === true && Boolean(profileId);
  return {
    use_personal_api: usePersonalApi,
    api_profile_id: usePersonalApi ? profileId : undefined,
  };
}

export function buildImageRequest(
  payload: GenerateImagePayload,
  extra: Record<string, unknown> = payload.extraParams ?? {},
) {
  return {
    prompt: payload.prompt,
    image_model: payload.model,
    ratio: payload.aspectRatio || '1:1',
    custom_size: optionalString(extra.custom_size),
    mode: optionalString(extra.mode) || 'storyboard',
    input_images: (payload.referenceImages ?? []).map((url, index) => ({
      url,
      role_label: index === 0 ? '参考图' : '参考图' + (index + 1),
    })),
    style_id: optionalString(extra.style_id),
    ...personalApiFields(extra),
  };
}

export function buildVideoRequest(
  payload: GenerateVideoPayload,
  extra: Record<string, unknown> = payload.extraParams ?? {},
) {
  const images = (payload.referenceImages ?? []).map((url) => ({ url, role_label: '参考图' }));
  return {
    script: payload.prompt,
    images,
    audio_url: optionalString(extra.audio_url) || payload.referenceAudios?.[0],
    video_url: optionalString(extra.video_url) || payload.referenceVideos?.[0],
    first_frame_url: optionalString(extra.first_frame_url) || payload.inputReference,
    last_frame_url: optionalString(extra.last_frame_url),
    storyboard_ref_url: optionalString(extra.storyboard_ref_url),
    ratio: payload.aspectRatio || '9:16',
    duration: Number(payload.seconds) || 5,
    resolution: payload.size || '720p',
    video_model: payload.model,
    optimize_prompt: extra.optimize_prompt !== false,
    style_id: optionalString(extra.style_id),
    ...personalApiFields(extra),
  };
}
