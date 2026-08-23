import { describe, expect, it } from 'vitest';

import {
  resolvePromptImageReferences,
  type GraphReferenceItem,
} from './graphReferenceResolver';

function imageReference(index: number): GraphReferenceItem {
  return {
    kind: 'image',
    sourceNodeId: `image-${index}`,
    label: `图${index}`,
    token: `@图${index}`,
    imageUrl: `https://example.com/image-${index}.png`,
    title: `Image ${index}`,
  };
}

describe('prompt image reference selection', () => {
  const references = [imageReference(1), imageReference(2), imageReference(3)];

  it('sends only the image explicitly named in the prompt', () => {
    const selected = resolvePromptImageReferences('@图2 换上蓝色吊带衣服', references);

    expect(selected.explicit).toBe(true);
    expect(selected.references.map((reference) => reference.imageUrl)).toEqual([
      'https://example.com/image-2.png',
    ]);
    expect(selected.prompt).toBe('参考图1 换上蓝色吊带衣服');
  });

  it('orders multiple request images by their first mention and remaps labels', () => {
    const selected = resolvePromptImageReferences('@图3 的服装穿到 @图1 的人物身上', references);

    expect(selected.references.map((reference) => reference.sourceNodeId)).toEqual([
      'image-3',
      'image-1',
    ]);
    expect(selected.prompt).toBe('参考图1 的服装穿到 参考图2 的人物身上');
  });

  it('keeps all connected images when the prompt has no explicit image token', () => {
    const selected = resolvePromptImageReferences('保持人物和服装一致', references);

    expect(selected.explicit).toBe(false);
    expect(selected.references).toEqual(references);
    expect(selected.prompt).toBe('保持人物和服装一致');
  });
});
