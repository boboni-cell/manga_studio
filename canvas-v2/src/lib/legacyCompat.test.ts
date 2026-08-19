import { describe, expect, it } from 'vitest';
import { translateLegacyCanvas, translateLegacyNode } from './legacyCompat';

describe('legacyCompat', () => {
  it('translates every legacy node type into v2 types', () => {
    expect(translateLegacyNode({ id: 'n1', type: 'script', position: { x: 0, y: 0 }, data: { label: '剧本', script: '雨夜' } }).type).toBe('aiTextNode');
    expect(translateLegacyNode({ id: 'n2', type: 'shot', position: { x: 0, y: 0 }, data: { label: '镜头', story_action: '相遇' } }).type).toBe('storyboardGenNode');
    expect(translateLegacyNode({ id: 'n3', type: 'asset', position: { x: 0, y: 0 }, data: { refs: [{ url: '/static/x.png' }] } }).type).toBe('uploadNode');
    expect(translateLegacyNode({ id: 'n4', type: 'image', position: { x: 0, y: 0 }, data: { prompt: 'p' } }).type).toBe('imageNode');
    expect(translateLegacyNode({ id: 'n5', type: 'video', position: { x: 0, y: 0 }, data: {} }).type).toBe('aiVideoNode');
    expect(translateLegacyNode({ id: 'n6', type: 'note', position: { x: 0, y: 0 }, data: { text: 'hi' } }).type).toBe('textAnnotationNode');
    const imageResult = translateLegacyNode({ id: 'n7', type: 'result', position: { x: 0, y: 0 }, data: { kind: 'image', media_url: '/static/r.png' } });
    expect(imageResult.type).toBe('exportImageNode');
    const videoResult = translateLegacyNode({ id: 'n8', type: 'result', position: { x: 0, y: 0 }, data: { kind: 'video', media_url: '/static/r.mp4' } });
    expect(videoResult.type).toBe('videoNode');
  });

  it('drops edges that reference missing nodes', () => {
    const { nodes, edges } = translateLegacyCanvas({
      nodes: [
        { id: 'a', type: 'note', position: { x: 0, y: 0 }, data: { text: 'x' } },
      ],
      edges: [
        { id: 'e1', source: 'a', target: 'b' },
        { id: 'e2', source: 'a', target: 'c' },
      ],
    });
    expect(nodes).toHaveLength(1);
    expect(edges).toHaveLength(0);
    // self-loops to existing nodes are preserved
    const withSelfLoop = translateLegacyCanvas({
      nodes: [{ id: 'a', type: 'note', position: { x: 0, y: 0 }, data: { text: 'x' } }],
      edges: [{ id: 'e3', source: 'a', target: 'a' }],
    });
    expect(withSelfLoop.edges).toHaveLength(1);
  });
});
