import { afterEach, describe, expect, it, vi } from 'vitest';

import { renameMangaAsset, type MangaLibraryAsset } from './mangaAssetLibrary';

function asset(overrides: Partial<MangaLibraryAsset>): MangaLibraryAsset {
  return {
    id: 'scene:scene-1',
    category: 'scene',
    kind: 'image',
    name: '旧名称',
    url: 'https://example.com/scene.png',
    sourceLabel: '场景',
    order: 1,
    ...overrides,
  };
}

describe('renameMangaAsset', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('persists a trimmed scene name through the shared asset API', async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ ok: true }),
    });
    vi.stubGlobal('fetch', fetchMock);

    await renameMangaAsset(asset({}), '  新场景  ');

    expect(fetchMock).toHaveBeenCalledWith('/api/assets/scenes/item/scene-1', expect.objectContaining({
      method: 'PUT',
      body: JSON.stringify({ name: '新场景' }),
    }));
  });

  it('uses the character alias endpoint for person assets', async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ ok: true }),
    });
    vi.stubGlobal('fetch', fetchMock);

    await renameMangaAsset(asset({ id: 'character:person-1', category: 'character' }), '新人物');

    expect(fetchMock).toHaveBeenCalledWith('/api/assets/characters/item/person-1', expect.objectContaining({
      method: 'PUT',
    }));
  });

  it('does not pretend history entries can be renamed', async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal('fetch', fetchMock);

    await expect(renameMangaAsset(asset({ id: 'history:entry-1:image', category: 'history' }), '新名称'))
      .rejects.toThrow('历史记录暂不支持改名');
    expect(fetchMock).not.toHaveBeenCalled();
  });
});
