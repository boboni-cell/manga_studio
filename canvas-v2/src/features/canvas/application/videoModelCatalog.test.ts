import { describe, expect, it } from 'vitest';

import { buildMangaVideoModelCatalog, resolveVideoModelConfig } from './videoModelCatalog';

describe('Manga Studio video catalog', () => {
  it('shares platform models and preserves personal API routing in extra params', () => {
    const entries = buildMangaVideoModelCatalog(['seedance'], [{
      id: 'video-profile',
      name: '我的视频接口',
      provider: 'Ark',
      model: 'seedance-v15-pro',
      configured: true,
    }], {
      seedance: { resolutions: ['480p', '720p'], min_duration: 4, max_duration: 6 },
    });

    expect(entries[0]).toMatchObject({
      id: 'manga:video:platform:seedance',
      modelId: 'seedance',
      supportedDurations: ['4', '5', '6'],
      supportedResolutions: ['480p', '720p'],
      defaultExtraParams: { use_personal_api: false },
    });
    const personal = resolveVideoModelConfig(entries, {
      entryId: 'manga:video:personal:video-profile',
      duration: '4',
      resolution: '720p',
    });
    expect(personal?.extraParams).toMatchObject({
      use_personal_api: true,
      api_profile_id: 'video-profile',
    });
  });
});
