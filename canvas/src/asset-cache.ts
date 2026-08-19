import { api } from './api';
import { characterDisplayName } from './lib/canvas-logic';
import type { AssetRef } from './types';

export type AssetCategory = 'character' | 'outfit' | 'scene' | 'audio' | 'upload' | 'style' | 'history';

export interface AssetItem {
  key: string;
  name: string;
  url: string;
  source: AssetRef['source'];
  role_label: string;
  nodeAssetType: string;
  refId: string | number | null;
  kind?: 'image' | 'video';
}

export const ASSET_CATEGORIES: Array<{ id: AssetCategory; label: string }> = [
  { id: 'character', label: '角色' },
  { id: 'outfit', label: '服装' },
  { id: 'scene', label: '场景' },
  { id: 'audio', label: '音频' },
  { id: 'upload', label: '多图参考' },
  { id: 'style', label: '风格' },
  { id: 'history', label: '历史' },
];

const cache: Record<string, AssetItem[]> = {};

export async function loadAssets(category: AssetCategory): Promise<AssetItem[]> {
  let items: AssetItem[] = [];
  if (category === 'character') {
    const chars = await api<Record<string, any>>('/api/characters');
    for (const key of Object.keys(chars || {})) {
      const ch = chars[key] || {};
      const images = Array.isArray(ch.images) ? ch.images : [];
      const url = images.length > 0 ? String((images[0] as any).url || '') : '';
      if (!url) continue;
      const name = characterDisplayName(key, ch);
      items.push({ key, name, url, source: 'character', role_label: name, nodeAssetType: 'character', refId: key });
    }
  } else if (category === 'style') {
    const styles = await api<any[]>('/api/styles');
    for (const style of Array.isArray(styles) ? styles : []) {
      const url = String(style.thumbnail_url || '');
      if (url) items.push({ key: String(style.id || ''), name: String(style.name || ''), url, source: 'style', role_label: '风格参考', nodeAssetType: 'style', refId: String(style.id || '') });
    }
  } else if (category === 'history') {
    const history = await api<any[]>('/api/history');
    for (const item of Array.isArray(history) ? history : []) {
      if (item.type === 'image' && item.image_url) {
        items.push({ key: 'img_' + item.image_url, name: String(item.script || '历史图片').slice(0, 40), url: String(item.image_url), source: 'upload', role_label: '多图参考', nodeAssetType: 'upload', refId: null, kind: 'image' });
      } else if (item.type === 'video' && item.video_url) {
        items.push({ key: 'vid_' + item.video_url, name: String(item.script || '历史视频').slice(0, 40), url: String(item.video_url), source: 'video', role_label: '参考视频', nodeAssetType: 'video', refId: null, kind: 'video' });
      }
    }
  } else {
    const cat = category === 'audio' ? 'audios' : category + 's';
    const list = await api<any[]>('/api/assets/' + cat);
    const role = category === 'outfit' ? '服装参考' : category === 'scene' ? '场景参考' : category === 'audio' ? '参考音频' : '多图参考';
    const source = category as AssetRef['source'];
    for (const item of Array.isArray(list) ? list : []) {
      const url = String(item.url || '');
      if (url) items.push({ key: url, name: String(item.name || ''), url, source, role_label: role, nodeAssetType: category, refId: null });
    }
  }
  cache[category] = items;
  return items;
}

export function getCachedAssets(category: AssetCategory): AssetItem[] {
  return cache[category] || [];
}

export function refreshAssetCache(): Promise<void> {
  return Promise.all(ASSET_CATEGORIES.map((category) => loadAssets(category.id).catch(() => []))).then(() => undefined);
}
