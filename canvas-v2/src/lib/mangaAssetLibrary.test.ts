import { afterEach, describe, expect, it, vi } from 'vitest';

import {
  addMangaAsset,
  addMangaStyle,
  addMediaToMangaAsset,
  loadMangaAssetDestinations,
  renameMangaAsset,
  type MangaLibraryAsset,
} from './mangaAssetLibrary';

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

describe('asset save destinations', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('appends media to the selected existing character', async () => {
    const fetchMock = vi.fn().mockResolvedValue({ ok: true, json: async () => ({ id: 'person-1' }) });
    vi.stubGlobal('fetch', fetchMock);

    await addMediaToMangaAsset(
      { id: 'person-1', category: 'character', name: '小暖' },
      '/static/uploads/ref.png',
      'image',
    );

    expect(fetchMock).toHaveBeenCalledWith(
      '/api/assets/characters/item/person-1/media',
      expect.objectContaining({
        method: 'POST',
        body: JSON.stringify({ url: '/static/uploads/ref.png', kind: 'image' }),
      }),
    );
  });

  it('creates a new character destination for a video', async () => {
    const fetchMock = vi.fn().mockResolvedValue({ ok: true, json: async () => ({ id: 'person-video-1' }) });
    vi.stubGlobal('fetch', fetchMock);

    await addMangaAsset('character', '动作人物', '/static/uploads/action.mp4', 'video');

    expect(fetchMock).toHaveBeenCalledWith('/api/assets/characters/item', expect.objectContaining({
      method: 'POST',
      body: JSON.stringify({
        name: '动作人物',
        images: [],
        media: [{ url: '/static/uploads/action.mp4', kind: 'video' }],
      }),
    }));
  });

  it('deduplicates grouped reference destinations', async () => {
    const responses = [
      {},
      [],
      [],
      [
        { id: 'ref-1', name: '动作参考', url: '/static/uploads/a.png' },
        { id: 'ref-2', parent_id: 'ref-1', name: '动作参考', url: '/static/uploads/b.png' },
      ],
    ];
    const fetchMock = vi.fn().mockImplementation(async () => ({ ok: true, json: async () => responses.shift() }));
    vi.stubGlobal('fetch', fetchMock);

    await expect(loadMangaAssetDestinations()).resolves.toEqual([
      { id: 'ref-1', category: 'upload', name: '动作参考' },
    ]);
  });

  it('creates a custom style inside the shared style library', async () => {
    const fetchMock = vi.fn().mockResolvedValue({ ok: true, json: async () => ({ id: 'style-1' }) });
    vi.stubGlobal('fetch', fetchMock);

    await addMangaStyle('  手绘水彩  ', '/static/uploads/style.png', '柔和水彩纸纹理');

    expect(fetchMock).toHaveBeenCalledWith('/api/assets/styles/item', expect.objectContaining({
      method: 'POST',
      body: JSON.stringify({
        name: '手绘水彩',
        url: '/static/uploads/style.png',
        prompt: '柔和水彩纸纹理',
        kind: 'image',
      }),
    }));
  });
});
