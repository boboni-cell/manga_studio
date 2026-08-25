import { describe, expect, it, vi } from 'vitest';

import {
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
