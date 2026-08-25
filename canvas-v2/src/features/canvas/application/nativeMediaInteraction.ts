export const NATIVE_MEDIA_SELECTOR = 'img, video, audio, [data-browser-media-actions="true"]';

// React Flow's built-in no-drag class. Adding it to canvas media elements keeps
// the canvas node-drag layer from capturing pointer events over native media,
// so the browser's image drag and extension media events reach the element itself.
export const NATIVE_MEDIA_NODRAG_CLASSNAME = 'nodrag';

export function isNativeMediaInteractionTarget(target: EventTarget | null): boolean {
  const closest = (target as { closest?: (selector: string) => unknown } | null)?.closest;
  return typeof closest === 'function' && Boolean(closest.call(target, NATIVE_MEDIA_SELECTOR));
}

interface NativeMediaInteractionEvent {
  target: EventTarget | null;
  clientX: number;
  clientY: number;
  nativeEvent?: {
    composedPath?: () => EventTarget[];
  };
}

interface ElementsAtPointDocument {
  elementsFromPoint: (x: number, y: number) => Element[];
}

export function isNativeMediaInteractionEvent(
  event: NativeMediaInteractionEvent,
  ownerDocument: ElementsAtPointDocument | null = typeof document === 'undefined' ? null : document
): boolean {
  if (isNativeMediaInteractionTarget(event.target)) {
    return true;
  }

  const eventPath = event.nativeEvent?.composedPath?.() ?? [];
  if (eventPath.some(isNativeMediaInteractionTarget)) {
    return true;
  }

  return Boolean(ownerDocument?.elementsFromPoint(event.clientX, event.clientY).some(isNativeMediaInteractionTarget));
}
