import * as THREE from 'three';

import type { BlueprintActionPose } from '@/features/canvas/domain/canvasNodes';

/**
 * GLTF-backed humanoid factory. Replaces the procedural "stick figure"
 * with a properly-rigged Mixamo-style character so blueprint subjects
 * read at a glance instead of looking like Lego people.
 *
 * Architecture
 * ------------
 * Three.js's `GLTFLoader` and `SkeletonUtils.clone` live under
 * `three/examples/jsm/...`. We import them **lazily** via dynamic
 * `import()` inside `ensurePersonTemplate()` so any sub-module
 * resolution / runtime hiccup in the Tauri webview cannot black-screen
 * the rest of the app — the worst that happens is the GLTF figure
 * silently fails to load and every blueprint subject keeps using the
 * procedural fallback. Once the imports + GLB load succeed we cache the
 * template `THREE.Group` at module scope and clone it for every figure
 * (deep-cloning the skeleton so each instance can be posed
 * independently).
 *
 * Pose schema mapping
 * -------------------
 * The shared `BlueprintActionPose` schema was authored against my
 * procedural skeleton where each bone hangs naturally. Mixamo's bind
 * pose puts the arms in a T, so we need to:
 *   - Stash the bind rotation on first load (`bone.userData.bindEuler`).
 *   - Apply a "neutral hang" delta on top (arms rotate ~75° down around
 *     the body axis so they fall by the side).
 *   - Set Euler rotation order to `ZYX` for arms so `pose.x` becomes
 *     "swing arm forward" after the Z (hang) rotation, matching my
 *     schema's intent.
 *   - Add per-bone axis remap for forearms / shoulders where the
 *     Mixamo local frame disagrees with naive XYZ semantics.
 */

const MODEL_URL = '/blueprint-figure.glb';

/**
 * Bone names we care about, with multiple naming aliases. Different
 * Mixamo export pipelines either prefix bones with `mixamorig` or keep
 * the bare names; we look up both.
 */
const BONE_ALIASES: Record<string, string[]> = {
  hips:           ['Hips', 'mixamorigHips'],
  spine:          ['Spine', 'mixamorigSpine', 'Spine1', 'mixamorigSpine1'],
  neck:           ['Neck', 'mixamorigNeck'],
  head:           ['Head', 'mixamorigHead'],
  leftShoulder:   ['LeftArm', 'mixamorigLeftArm', 'L_Arm'],
  rightShoulder:  ['RightArm', 'mixamorigRightArm', 'R_Arm'],
  leftElbow:      ['LeftForeArm', 'mixamorigLeftForeArm', 'L_ForeArm'],
  rightElbow:    ['RightForeArm', 'mixamorigRightForeArm', 'R_ForeArm'],
  leftHip:       ['LeftUpLeg', 'mixamorigLeftUpLeg', 'L_UpLeg'],
  rightHip:      ['RightUpLeg', 'mixamorigRightUpLeg', 'R_UpLeg'],
  leftKnee:      ['LeftLeg', 'mixamorigLeftLeg', 'L_Leg'],
  rightKnee:     ['RightLeg', 'mixamorigRightLeg', 'R_Leg'],
};

interface PersonTemplate {
  scene: any;
  /** Approximate bind-pose figure height in model units, used to scale to the
   *  desired heightM on each clone. */
  naturalHeight: number;
}

let cachedTemplate: PersonTemplate | null = null;
let loadPromise: Promise<PersonTemplate> | null = null;
/** Cached SkeletonUtils.clone reference, populated alongside the
 *  template after the first lazy import succeeds. */
let cachedCloneFn: ((source: any) => any) | null = null;
const versionListeners = new Set<() => void>();

function notifyVersionListeners() {
  versionListeners.forEach((cb) => {
    try { cb(); } catch (err) { console.warn('blueprintGltfFactory: version listener threw', err); }
  });
}

/** Subscribe to "GLTF figure ready" events so callers (BlueprintScene,
 *  BlueprintPosePreview) can kick a re-render and replace any procedural
 *  fallback meshes with the real GLTF clone. */
export function onGltfPersonTemplateReady(cb: () => void): () => void {
  if (cachedTemplate) {
    queueMicrotask(cb);
    return () => {};
  }
  versionListeners.add(cb);
  return () => versionListeners.delete(cb);
}

export function isGltfPersonTemplateReady(): boolean {
  return cachedTemplate !== null;
}

/** Ensure the GLTF template is loaded. Idempotent: parallel callers
 *  share the same in-flight Promise; subsequent calls return the cached
 *  template synchronously via the resolved Promise. Imports of the
 *  three/examples sub-modules are deferred to this function so a
 *  resolution failure (e.g. Tauri webview quirk) only logs a warning
 *  and keeps callers on the procedural fallback instead of crashing
 *  the rest of the app. */
export function ensurePersonTemplate(): Promise<PersonTemplate> {
  if (cachedTemplate) return Promise.resolve(cachedTemplate);
  if (loadPromise) return loadPromise;
  loadPromise = (async () => {
    let GLTFLoaderCtor: any;
    let cloneFn: ((source: any) => any) | null = null;
    try {
      const loaderMod: any = await import('three/examples/jsm/loaders/GLTFLoader.js');
      GLTFLoaderCtor = loaderMod.GLTFLoader;
      const utilsMod: any = await import('three/examples/jsm/utils/SkeletonUtils.js');
      cloneFn = utilsMod.clone;
      cachedCloneFn = cloneFn;
    } catch (err) {
      // Reset so callers can retry, but never throw — every call site
      // already knows how to fall back to the procedural figure.
      loadPromise = null;
      throw err;
    }
    if (!GLTFLoaderCtor || !cloneFn) {
      loadPromise = null;
      throw new Error('three example modules loaded but expected exports missing');
    }
    return await new Promise<PersonTemplate>((resolve, reject) => {
      const loader = new GLTFLoaderCtor();
      loader.load(
        MODEL_URL,
        (gltf: any) => {
          const scene: any = gltf.scene;
          const box = new THREE.Box3().setFromObject(scene);
          const naturalHeight = box.max.y - box.min.y || 1.75;
          // Capture bind Euler on every relevant bone the first time
          // through; we'll restore from these on each pose application.
          scene.traverse((obj: any) => {
            if (!obj.isBone) return;
            obj.userData.bindEuler = [obj.rotation.x, obj.rotation.y, obj.rotation.z];
            obj.userData.bindOrder = obj.rotation.order;
          });
          cachedTemplate = { scene, naturalHeight };
          notifyVersionListeners();
          versionListeners.clear();
          resolve(cachedTemplate);
        },
        undefined,
        (err: any) => {
          loadPromise = null;
          reject(err);
        },
      );
    });
  })();
  return loadPromise;
}

interface PersonBoneMap {
  hips: any;
  spine: any;
  neck: any;
  head: any;
  leftShoulder: any;
  rightShoulder: any;
  leftElbow: any;
  rightElbow: any;
  leftHip: any;
  rightHip: any;
  leftKnee: any;
  rightKnee: any;
}

function findBone(scene: any, aliases: string[]): any {
  for (const name of aliases) {
    const found = scene.getObjectByName(name);
    if (found) return found;
  }
  return null;
}

function buildBoneMap(scene: any): PersonBoneMap | null {
  const map: Partial<PersonBoneMap> = {};
  for (const key of Object.keys(BONE_ALIASES) as Array<keyof PersonBoneMap>) {
    const bone = findBone(scene, BONE_ALIASES[key as string]);
    if (!bone) {
      // Missing critical bone — bail. Caller falls back to procedural.
      console.warn(`blueprintGltfFactory: bone "${key}" not found; aliases tried`, BONE_ALIASES[key as string]);
      return null;
    }
    map[key] = bone;
  }
  return map as PersonBoneMap;
}

/**
 * Synchronous mesh creation. Returns `null` until `ensurePersonTemplate()`
 * has resolved — the caller is expected to fall back to the procedural
 * factory in that case and re-create the mesh once
 * `onGltfPersonTemplateReady` fires.
 */
export function createGltfPersonMesh(color: any, heightM: number): any | null {
  if (!cachedTemplate || !cachedCloneFn) return null;
  try {
    return buildGltfPersonMesh(color, heightM);
  } catch (err) {
    console.warn('blueprintGltfFactory: createGltfPersonMesh threw; falling back to procedural', err);
    return null;
  }
}

function buildGltfPersonMesh(color: any, heightM: number): any | null {
  if (!cachedTemplate || !cachedCloneFn) return null;

  let cloned: any;
  try {
    cloned = cachedCloneFn(cachedTemplate.scene);
  } catch (err) {
    console.warn('blueprintGltfFactory: SkeletonUtils.clone threw; falling back to procedural', err);
    return null;
  }
  const scale = heightM / cachedTemplate.naturalHeight;
  cloned.scale.setScalar(scale);

  // Tint: walk meshes, clone each material so other instances aren't
  // tinted to match, and bias the diffuse toward the user's color.
  const tint = new THREE.Color(color);
  cloned.traverse((obj: any) => {
    if (!obj.isMesh || !obj.material) return;
    const cloneMat = obj.material.clone();
    if (cloneMat.color) {
      // Blend 60% original × 40% tint so the model keeps texture detail.
      cloneMat.color = cloneMat.color.clone().lerp(tint, 0.55);
    }
    if ('emissive' in cloneMat) {
      cloneMat.emissive = tint.clone().multiplyScalar(0.08);
    }
    obj.material = cloneMat;
  });

  const bones = buildBoneMap(cloned);
  if (!bones) return null;

  // Set Euler order ZYX on shoulders / hips so schema X = "swing
  // forward" after the Z = "hang from T-pose" delta.
  bones.leftShoulder.rotation.order = 'ZYX';
  bones.rightShoulder.rotation.order = 'ZYX';
  bones.leftHip.rotation.order = 'ZYX';
  bones.rightHip.rotation.order = 'ZYX';

  cloned.userData.bones = bones;
  cloned.userData.gltfVariant = true;
  // Apply neutral standing pose immediately so the figure isn't stuck in T.
  resetGltfPose(cloned);

  return cloned;
}

/** Bring all bones back to bind pose + a "natural hang" overlay so the
 *  figure stands relaxed (arms by the sides, spine upright). Anything
 *  the user later applies via `applyGltfPersonAction` layers on top. */
function resetGltfPose(group: any): PersonBoneMap | null {
  const bones: PersonBoneMap | undefined = group.userData?.bones;
  if (!bones) return null;
  const restoreBindRotation = (bone: any) => {
    const bind = bone.userData.bindEuler;
    if (bind) bone.rotation.set(bind[0], bind[1], bind[2]);
  };
  restoreBindRotation(bones.hips);
  restoreBindRotation(bones.spine);
  restoreBindRotation(bones.neck);
  restoreBindRotation(bones.head);
  restoreBindRotation(bones.leftShoulder);
  restoreBindRotation(bones.rightShoulder);
  restoreBindRotation(bones.leftElbow);
  restoreBindRotation(bones.rightElbow);
  restoreBindRotation(bones.leftHip);
  restoreBindRotation(bones.rightHip);
  restoreBindRotation(bones.leftKnee);
  restoreBindRotation(bones.rightKnee);

  // Drop arms ~75° to the side. With Euler order ZYX on shoulders, this
  // Z-rotation happens first, so any X rotation we apply next behaves
  // as "swing forward/back" relative to the now-vertical arm.
  bones.leftShoulder.rotation.z += 1.3;
  bones.rightShoulder.rotation.z -= 1.3;

  group.scale.setScalar(group.userData.baseScale ?? group.scale.x);
  group.rotation.set(0, 0, 0);
  group.position.y = 0;
  return bones;
}

interface ApplyGltfPoseOptions {
  customPoses?: Record<string, BlueprintActionPose>;
}

/**
 * Translate a `BlueprintActionPose` (radians, schema-style) onto the
 * Mixamo-named skeleton. The schema is interpreted as "swing forward /
 * splay outward / twist along the bone" relative to the resting natural
 * pose set up in `resetGltfPose`. Channel mapping per body part:
 *   - shoulder: schema.x → bone.rotation.x (forward swing, post-hang),
 *               schema.y → bone.rotation.y (twist),
 *               schema.z → bone.rotation.z (abduction outward).
 *   - elbow:    schema.x → bone.rotation.y (Mixamo forearm bends around
 *               its Y axis when the upper arm is hanging).
 *   - hip:      schema.x → bone.rotation.x (forward swing).
 *   - knee:     schema.x → bone.rotation.x.
 *   - head:     schema.x/y/z → bone.rotation.x/y/z directly.
 *   - torso:    schema.x → spine.rotation.x.
 */
function applySchemaToBones(bones: PersonBoneMap, pose: BlueprintActionPose) {
  const apply = (bone: any, dx?: number, dy?: number, dz?: number) => {
    if (typeof dx === 'number') bone.rotation.x += dx;
    if (typeof dy === 'number') bone.rotation.y += dy;
    if (typeof dz === 'number') bone.rotation.z += dz;
  };

  if (pose.leftShoulder)  apply(bones.leftShoulder,  pose.leftShoulder.x,  pose.leftShoulder.y,  pose.leftShoulder.z);
  if (pose.rightShoulder) apply(bones.rightShoulder, pose.rightShoulder.x, pose.rightShoulder.y, pose.rightShoulder.z);
  // Forearms: bend around bone-local Y (post-arm-hang frame) in Mixamo rigs.
  if (pose.leftElbow?.x  != null) bones.leftElbow.rotation.y  += pose.leftElbow.x;
  if (pose.rightElbow?.x != null) bones.rightElbow.rotation.y -= pose.rightElbow.x; // mirrored
  if (pose.leftHip)  apply(bones.leftHip,  pose.leftHip.x,  pose.leftHip.y,  pose.leftHip.z);
  if (pose.rightHip) apply(bones.rightHip, pose.rightHip.x, pose.rightHip.y, pose.rightHip.z);
  if (pose.leftKnee?.x  != null) bones.leftKnee.rotation.x  += pose.leftKnee.x;
  if (pose.rightKnee?.x != null) bones.rightKnee.rotation.x += pose.rightKnee.x;
  if (pose.head) apply(bones.head, pose.head.x, pose.head.y, pose.head.z);
  if (pose.torso?.x != null) bones.spine.rotation.x += pose.torso.x;
}

/**
 * Keyword preset table tuned for Mixamo skeleton. Values were authored
 * against this rig specifically — they don't need to match the procedural
 * preset numbers. When a user creates a custom pose via the slider editor
 * we apply the BlueprintActionPose schema as-is via `applySchemaToBones`,
 * stacked on top of the keyword if both apply.
 */
function applyKeywordPreset(bones: PersonBoneMap, lower: string, group: any) {
  const apply = (pose: BlueprintActionPose) => applySchemaToBones(bones, pose);

  if (lower.includes('半蹲') || (lower.includes('蹲') && (lower.includes('检查') || lower.includes('inspect')))) {
    group.scale.y *= 0.78;
    apply({
      leftHip: { x: -1.0 }, rightHip: { x: -1.0 },
      leftKnee: { x: -1.6 }, rightKnee: { x: -1.6 },
      rightShoulder: { x: -1.2 }, rightElbow: { x: -0.6 },
      head: { x: -0.2 },
    });
  } else if (lower.includes('坐') || lower.includes('sit')) {
    apply({
      leftHip: { x: -Math.PI / 2 }, rightHip: { x: -Math.PI / 2 },
      leftKnee: { x: -1.55 }, rightKnee: { x: -1.55 },
    });
    group.position.y = -0.45;
  } else if (lower.includes('蹲') || lower.includes('squat') || lower.includes('crouch')) {
    group.scale.y *= 0.78;
    apply({
      leftHip: { x: -1.1 }, rightHip: { x: -1.1 },
      leftKnee: { x: -1.8 }, rightKnee: { x: -1.8 },
    });
  } else if (lower.includes('躺') || lower.includes('lying') || lower.includes('lie')) {
    group.rotation.x = -Math.PI / 2;
    group.position.y = 0;
  } else if (lower.includes('跳') || lower.includes('jump')) {
    group.position.y += 0.35;
    apply({
      leftHip: { x: -0.4 }, rightHip: { x: -0.4 },
      leftKnee: { x: -0.7 }, rightKnee: { x: -0.7 },
      leftShoulder: { x: -1.2 }, rightShoulder: { x: -1.2 },
      leftElbow: { x: -0.6 }, rightElbow: { x: -0.6 },
    });
  } else if (lower.includes('奔跑') || lower.includes('跑') || lower.includes('run')) {
    apply({
      leftHip: { x: -0.8 }, rightHip: { x: 0.6 },
      leftKnee: { x: -1.1 }, rightKnee: { x: -0.6 },
      leftShoulder: { x: 0.7 }, rightShoulder: { x: -0.7 },
      leftElbow: { x: -1.3 }, rightElbow: { x: -1.3 },
      torso: { x: -0.18 }, head: { x: -0.05 },
    });
  } else if (lower.includes('行走') || lower.includes('走') || lower.includes('walk')) {
    apply({
      leftHip: { x: -0.4 }, rightHip: { x: 0.3 },
      leftKnee: { x: -0.2 }, rightKnee: { x: -0.5 },
      leftShoulder: { x: 0.3 }, rightShoulder: { x: -0.3 },
      leftElbow: { x: -0.4 }, rightElbow: { x: -0.4 },
    });
  } else if (lower.includes('回头') || lower.includes('look back') || lower.includes('turn around')) {
    apply({ head: { y: Math.PI * 0.6, x: -0.05 }, torso: { x: -0.04 } });
  } else if (lower.includes('伸手') || lower.includes('reach') || lower.includes('hand out')) {
    apply({
      rightShoulder: { x: -1.45, z: -0.25 }, rightElbow: { x: -0.45 },
      head: { x: -0.08 },
    });
  } else if (lower.includes('对话') || lower.includes('talk') || lower.includes('chat') || lower.includes('speak')) {
    apply({
      head: { y: 0.32 },
      rightShoulder: { x: -0.5, z: -0.18 }, rightElbow: { x: -1.1 },
      leftShoulder: { x: 0.18 },
    });
  } else if (lower.includes('观察') || lower.includes('observe') || lower.includes('look')) {
    apply({
      head: { x: -0.18, y: 0.12 },
      rightShoulder: { x: -1.55, z: 0.45 }, rightElbow: { x: -1.6 },
    });
  }
  // 站立 / stand or unknown — leave the natural rest pose alone.
}

/** Compose keyword + custom pose onto a GLTF figure. Mirrors the API
 *  of the procedural `applyPersonActionTransform` so call sites can pick
 *  whichever is available. */
export function applyGltfPersonAction(
  group: any,
  action: string | undefined,
  options: ApplyGltfPoseOptions = {},
): void {
  try {
    const bones = resetGltfPose(group);
    if (!bones || !action) return;
    const lower = action.toLowerCase();
    applyKeywordPreset(bones, lower, group);
    const custom = options.customPoses?.[action];
    if (custom) applySchemaToBones(bones, custom);
  } catch (err) {
    console.warn('blueprintGltfFactory: applyGltfPersonAction threw; pose left at rest', err);
  }
}
