/**
 * Minimal ambient declarations for three.js's example modules. We only
 * use `GLTFLoader` to load the bundled blueprint figure and
 * `SkeletonUtils.clone` to deep-clone the skeleton per instance, both
 * via dynamic / loose typing — `any` is fine for these call sites and
 * keeps `tsc --noEmit` happy without pulling in @types/three.
 */
declare module 'three/examples/jsm/loaders/GLTFLoader.js' {
  export class GLTFLoader {
    constructor(...args: any[]);
    load(url: string, onLoad: (gltf: any) => void, onProgress?: (event: any) => void, onError?: (err: any) => void): void;
    setDRACOLoader(loader: any): void;
  }
}

declare module 'three/examples/jsm/utils/SkeletonUtils.js' {
  export function retarget(target: any, source: any, options?: any): void;
  export function retargetClip(target: any, source: any, clip: any, options?: any): any;
  export function clone(source: any): any;
}

declare module 'three/examples/jsm/controls/TransformControls.js' {
  import type { Camera, Object3D, Raycaster } from 'three';

  export class TransformControls {
    constructor(camera: Camera, domElement?: HTMLElement | null);
    axis: string | null;
    dragging: boolean;
    enabled: boolean;
    mode: 'translate' | 'rotate' | 'scale';
    object?: Object3D;
    attach(object: Object3D): this;
    detach(): this;
    dispose(): void;
    getHelper(): Object3D;
    getRaycaster(): Raycaster;
    pointerHover(pointer: { x: number; y: number; button?: number } | null): void;
    setMode(mode: 'translate' | 'rotate' | 'scale'): void;
    setSize(size: number): void;
    setSpace(space: 'world' | 'local'): void;
    addEventListener(type: string, listener: (event: any) => void): void;
    removeEventListener(type: string, listener: (event: any) => void): void;
  }
}
