import { api } from '@/api';

export type MangaAssetCategory =
  | 'project'
  | 'character'
  | 'outfit'
  | 'scene'
  | 'upload'
  | 'audio'
  | 'style'
  | 'history';

export type MangaAssetMediaKind = 'image' | 'video' | 'audio' | 'style';
export type MangaWritableAssetCategory = 'character' | 'outfit' | 'scene' | 'upload' | 'audio';

export interface MangaLibraryAsset {
  id: string;
  category: Exclude<MangaAssetCategory, 'project'>;
  kind: MangaAssetMediaKind;
  name: string;
  url: string;
  previewUrl?: string | null;
  sourceLabel: string;
  order: number;
  styleId?: string | null;
}

export const MANGA_ASSET_CATEGORIES: ReadonlyArray<{
  id: MangaAssetCategory;
  label: string;
}> = [
  { id: 'project', label: '项目' },
  { id: 'character', label: '人物' },
  { id: 'outfit', label: '服装' },
  { id: 'scene', label: '场景' },
  { id: 'upload', label: '多图参考' },
  { id: 'audio', label: '音频' },
  { id: 'style', label: '风格' },
  { id: 'history', label: '历史' },
];

interface GenericAssetRecord {
  id?: unknown;
  name?: unknown;
  url?: unknown;
  thumbnail_url?: unknown;
  deleted_at?: unknown;
}

interface CharacterRecord {
  name?: unknown;
  images?: unknown;
  deleted_at?: unknown;
}

interface HistoryRecord {
  id?: unknown;
  type?: unknown;
  script?: unknown;
  image_url?: unknown;
  video_url?: unknown;
  thumbnail_url?: unknown;
  created_at?: unknown;
}

function stringValue(value: unknown): string {
  return typeof value === 'string' ? value.trim() : '';
}

function listValue(value: unknown): GenericAssetRecord[] {
  return Array.isArray(value) ? value.filter((item): item is GenericAssetRecord => Boolean(item && typeof item === 'object')) : [];
}

function firstCharacterImage(value: unknown): string {
  if (!Array.isArray(value)) return '';
  for (const item of value) {
    if (typeof item === 'string' && item.trim()) return item.trim();
    if (item && typeof item === 'object') {
      const url = stringValue((item as { url?: unknown }).url);
      if (url) return url;
    }
  }
  return '';
}

export async function addMangaAsset(
  category: MangaWritableAssetCategory,
  name: string,
  url: string,
): Promise<{ id: string }> {
  const normalizedName = name.trim() || '未命名素材';
  const endpoint = category === 'character'
    ? '/api/assets/characters/item'
    : `/api/assets/${category === 'outfit' ? 'outfits' : category === 'scene' ? 'scenes' : category === 'upload' ? 'uploads' : 'audios'}/item`;
  return api<{ id: string }>(endpoint, {
    method: 'POST',
    body: JSON.stringify(category === 'character'
      ? { name: normalizedName, images: [url] }
      : { name: normalizedName, url }),
  });
}

export async function renameMangaAsset(
  asset: Pick<MangaLibraryAsset, 'id' | 'category'>,
  name: string,
): Promise<void> {
  const normalizedName = name.trim();
  if (!normalizedName) throw new Error('资产名称不能为空');
  if (asset.category === 'history') throw new Error('历史记录暂不支持改名');

  const itemId = asset.id.slice(asset.id.indexOf(':') + 1);
  const category = asset.category === 'character'
    ? 'characters'
    : asset.category === 'outfit'
      ? 'outfits'
      : asset.category === 'scene'
        ? 'scenes'
        : asset.category === 'upload'
          ? 'uploads'
          : asset.category === 'audio'
            ? 'audios'
            : 'styles';
  await api(`/api/assets/${category}/item/${encodeURIComponent(itemId)}`, {
    method: 'PUT',
    body: JSON.stringify({ name: normalizedName }),
  });
}

export async function uploadMangaAssetFile(
  category: MangaWritableAssetCategory,
  file: File,
): Promise<{ id: string; url: string }> {
  const formData = new FormData();
  formData.append('file', file);
  const response = await fetch('/api/upload', {
    method: 'POST',
    body: formData,
    credentials: 'same-origin',
  });
  const payload = await response.json().catch(() => null) as { url?: string; error?: string } | null;
  if (!response.ok || !payload?.url) {
    throw new Error(payload?.error || `上传失败 ${response.status}`);
  }
  const name = file.name.replace(/\.[^.]+$/, '').trim() || '未命名素材';
  const saved = await addMangaAsset(category, name, payload.url);
  return { id: saved.id, url: payload.url };
}

function mapListAssets(
  category: 'outfit' | 'scene' | 'upload' | 'audio' | 'style',
  label: string,
  records: GenericAssetRecord[],
): MangaLibraryAsset[] {
  return records.flatMap((record, index) => {
    if (record.deleted_at) return [];
    const id = stringValue(record.id);
    const url = category === 'style'
      ? stringValue(record.thumbnail_url) || stringValue(record.url)
      : stringValue(record.url) || stringValue(record.thumbnail_url);
    if (!id || !url) return [];
    return [{
      id: `${category}:${id}`,
      category,
      kind: category === 'audio' ? 'audio' : category === 'style' ? 'style' : 'image',
      name: stringValue(record.name) || '未命名',
      url,
      previewUrl: url,
      sourceLabel: label,
      order: records.length - index,
      styleId: category === 'style' ? id : null,
    }];
  });
}

export async function loadMangaAssetLibrary(): Promise<MangaLibraryAsset[]> {
  const [characters, outfits, scenes, uploads, audios, styles, history] = await Promise.all([
    api<Record<string, CharacterRecord>>('/api/characters').catch(() => ({})),
    api<unknown>('/api/assets/outfits').catch(() => []),
    api<unknown>('/api/assets/scenes').catch(() => []),
    api<unknown>('/api/assets/uploads').catch(() => []),
    api<unknown>('/api/assets/audios').catch(() => []),
    api<unknown>('/api/styles').catch(() => []),
    api<unknown>('/api/history').catch(() => []),
  ]);

  const result: MangaLibraryAsset[] = [];
  const characterRecords = characters as Record<string, CharacterRecord>;
  for (const [id, character] of Object.entries(characterRecords || {})) {
    if (!character || character.deleted_at) continue;
    const url = firstCharacterImage(character.images);
    if (!url) continue;
    result.push({
      id: `character:${id}`,
      category: 'character',
      kind: 'image',
      name: stringValue(character.name) || id,
      url,
      previewUrl: url,
      sourceLabel: '人物',
      order: result.length + 1,
    });
  }

  result.push(...mapListAssets('outfit', '服装', listValue(outfits)));
  result.push(...mapListAssets('scene', '场景', listValue(scenes)));
  result.push(...mapListAssets('upload', '多图参考', listValue(uploads)));
  result.push(...mapListAssets('audio', '音频', listValue(audios)));
  result.push(...mapListAssets('style', '风格', listValue(styles)));

  const historyItems = Array.isArray(history) ? history as HistoryRecord[] : [];
  historyItems.forEach((item, index) => {
    const imageUrl = stringValue(item.image_url);
    const videoUrl = stringValue(item.video_url);
    const url = imageUrl || videoUrl;
    if (!url) return;
    const kind = videoUrl ? 'video' : 'image';
    result.push({
      id: `history:${stringValue(item.id) || index}:${kind}`,
      category: 'history',
      kind,
      name: stringValue(item.script) || (kind === 'video' ? '历史视频' : '历史图片'),
      url,
      previewUrl: stringValue(item.thumbnail_url) || imageUrl || null,
      sourceLabel: kind === 'video' ? '历史 · 视频' : '历史 · 图片',
      order: historyItems.length - index,
    });
  });

  return result;
}
