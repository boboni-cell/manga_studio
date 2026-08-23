import { describe, expect, it } from 'vitest';

import type { CanvasNodeData } from '@/features/canvas/domain/canvasNodes';
import { cloneCanvasNodeContent } from './canvasClipboard';

describe('canvas node clipboard content', () => {
  it.each([
    { prompt: '完整文字内容', model: 'doubao', size: '1K', imageUrl: null, aspectRatio: '1:1' },
    { imageUrl: 'https://cdn.example/image.png', previewImageUrl: '/static/preview.png', aspectRatio: '3:4' },
    { videoUrl: 'https://cdn.example/video.mp4', thumbnailUrl: '/static/thumb.png', prompt: '镜头推进' },
  ])('keeps text and media fields when a node is copied', (data) => {
    const original = data as unknown as CanvasNodeData;
    const copied = cloneCanvasNodeContent(original) as unknown as Record<string, unknown>;
    expect(copied).toEqual(data);
    expect(copied).not.toBe(original);
  });

  it('clears only in-flight generation state from the copied node', () => {
    const copied = cloneCanvasNodeContent({
      prompt: '保留提示词',
      imageUrl: 'https://cdn.example/result.png',
      aspectRatio: '1:1',
      isGenerating: true,
      generationJobId: 'job-1',
      generationError: 'old error',
    } as unknown as CanvasNodeData) as unknown as Record<string, unknown>;

    expect(copied.prompt).toBe('保留提示词');
    expect(copied.imageUrl).toBe('https://cdn.example/result.png');
    expect(copied.isGenerating).toBe(false);
    expect(copied.generationJobId).toBeNull();
    expect(copied.generationError).toBeNull();
  });
});
