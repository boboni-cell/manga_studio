import { describe, expect, it, vi } from 'vitest';

import {
  isNativeMediaInteractionEvent,
  isNativeMediaInteractionTarget,
  NATIVE_MEDIA_NODRAG_CLASSNAME,
  NATIVE_MEDIA_SELECTOR,
} from './nativeMediaInteraction';

describe('NATIVE_MEDIA_SELECTOR', () => {
  it('targets native media elements and extension-friendly wrappers', () => {
    expect(NATIVE_MEDIA_SELECTOR).toBe('img, video, audio, [data-browser-media-actions="true"]');
  });
});

describe('NATIVE_MEDIA_NODRAG_CLASSNAME', () => {
  it('uses React Flow no-drag class so the canvas drag layer does not swallow media events', () => {
    expect(NATIVE_MEDIA_NODRAG_CLASSNAME).toBe('nodrag');
  });
});

describe('isNativeMediaInteractionTarget', () => {
  it('recognizes media elements and extension-friendly media wrappers', () => {
    const closest = vi.fn().mockReturnValue({});

    expect(isNativeMediaInteractionTarget({ closest } as unknown as EventTarget)).toBe(true);
    expect(closest).toHaveBeenCalledWith('img, video, audio, [data-browser-media-actions="true"]');
  });

  it('keeps custom canvas menus for non-media targets', () => {
    expect(isNativeMediaInteractionTarget({ closest: () => null } as unknown as EventTarget)).toBe(false);
    expect(isNativeMediaInteractionTarget(null)).toBe(false);
  });
});

describe('isNativeMediaInteractionEvent', () => {
  it('recognizes media wrappers from an extension-composed event path', () => {
    const mediaWrapper = { closest: () => ({}) } as unknown as EventTarget;

    expect(isNativeMediaInteractionEvent({
      target: { closest: () => null } as unknown as EventTarget,
      clientX: 10,
      clientY: 20,
      nativeEvent: { composedPath: () => [mediaWrapper] },
    }, null)).toBe(true);
  });

  it('recognizes native media underneath an extension overlay', () => {
    const overlay = { closest: () => null } as unknown as EventTarget;
    const image = { closest: () => ({}) } as unknown as Element;
    const elementsFromPoint = vi.fn().mockReturnValue([overlay, image]);

    expect(isNativeMediaInteractionEvent({
      target: overlay,
      clientX: 30,
      clientY: 40,
    }, { elementsFromPoint })).toBe(true);
    expect(elementsFromPoint).toHaveBeenCalledWith(30, 40);
  });

  it('keeps custom canvas handling when no media is involved', () => {
    const target = { closest: () => null } as unknown as EventTarget;

    expect(isNativeMediaInteractionEvent({
      target,
      clientX: 0,
      clientY: 0,
    }, { elementsFromPoint: () => [] })).toBe(false);
  });
});
