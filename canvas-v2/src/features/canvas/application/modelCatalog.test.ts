import { describe, expect, it } from 'vitest';

import { AGNES_PROVIDER_DEFAULTS } from '@/stores/customProvidersStore';
import { buildImageModelCatalog, buildMangaImageModelCatalog } from './modelCatalog';

describe('Agnes image catalog', () => {
  it('exposes 3K only for Image 2.1 while retaining Image 2.0 explicit pixels', () => {
    const entries = buildImageModelCatalog({ customProviders: [], agnesApiKey: 'agnes-key' });
    const image21 = entries.find(({ modelId }) => (
      modelId === AGNES_PROVIDER_DEFAULTS.models.image21Flash
    ));
    const image20 = entries.find(({ modelId }) => (
      modelId === AGNES_PROVIDER_DEFAULTS.models.image20Flash
    ));

    expect(image21?.supportedResolutions).toContain('3K');
    expect(image20?.supportedResolutions).not.toContain('3K');
    expect(image20?.supportedResolutions).toEqual([
      '1024x1024',
      '1024x768',
      '768x1024',
      'auto',
    ]);
  });
});

describe('Manga Studio image catalog', () => {
  it('shares platform models and configured personal APIs with the web canvas', () => {
    const entries = buildMangaImageModelCatalog(['gpt-image-2'], [{
      id: 'image-profile',
      name: '我的图片接口',
      provider: 'OpenAI',
      model: 'image-model',
      configured: true,
    }], ['1:1', '16:9']);

    expect(entries[0]).toMatchObject({
      id: 'manga:image:platform:gpt-image-2',
      modelId: 'gpt-image-2',
      usable: true,
      mangaRoute: { usePersonalApi: false, apiProfileId: null },
    });
    expect(entries[1]).toMatchObject({
      id: 'manga:image:personal:image-profile',
      modelId: 'personal-api',
      usable: true,
      mangaRoute: { usePersonalApi: true, apiProfileId: 'image-profile' },
    });
  });
});
