import { describe, expect, it } from 'vitest';

import {
  resolveBrowserDownloadName,
  resolveBrowserDownloadUrl,
  resolveHistoryMediaProxyUrl,
} from './browserMedia';

describe('browser media helpers', () => {
  it('routes a generated remote URL through the authenticated history proxy', () => {
    expect(resolveHistoryMediaProxyUrl('https://cdn.example/a b.png?x=1')).toBe(
      '/api/history/media?url=https%3A%2F%2Fcdn.example%2Fa%20b.png%3Fx%3D1',
    );
  });

  it('adds a useful extension without replacing an explicit file name', () => {
    expect(resolveBrowserDownloadName('scene-01', 'https://cdn.example/result', 'image/png')).toBe('scene-01.png');
    expect(resolveBrowserDownloadName('clip', 'https://cdn.example/result.mp4', '')).toBe('clip.mp4');
    expect(resolveBrowserDownloadName('final.webp', 'https://cdn.example/result', 'image/png')).toBe('final.webp');
  });

  it('starts remote browser downloads through the authenticated attachment route', () => {
    expect(resolveBrowserDownloadUrl('https://cdn.example/result.png', 'scene-01')).toBe(
      '/api/history/media?url=https%3A%2F%2Fcdn.example%2Fresult.png&download=1&name=scene-01.png',
    );
    expect(resolveBrowserDownloadUrl('/static/uploads/result.png', 'scene-01')).toBe('/static/uploads/result.png');
  });
});
