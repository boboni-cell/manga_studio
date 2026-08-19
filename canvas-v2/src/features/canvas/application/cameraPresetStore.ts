import { type CameraControlOptions } from '@/features/canvas/domain/canvasNodes';

const STORAGE_KEY = 'storyboard-camera-presets';

export interface CameraPreset {
  id: string;
  name: string;
  camera: string;
  lens: string;
  focalLength: number;
  aperture: number;
  createdAt: number;
}

const DEFAULT_PRESETS: CameraPreset[] = [
  {
    id: 'default-1',
    name: '电影标准',
    camera: 'arri_alexa_mini_lf',
    lens: 'arri_signature_prime',
    focalLength: 35,
    aperture: 2.8,
    createdAt: 0,
  },
  {
    id: 'default-2',
    name: '人像特写',
    camera: 'sony_venice',
    lens: 'zeiss_supreme_prime',
    focalLength: 85,
    aperture: 1.4,
    createdAt: 0,
  },
  {
    id: 'default-3',
    name: '广角风光',
    camera: 'red_weapon_8k',
    lens: 'cooke_s7i',
    focalLength: 24,
    aperture: 8,
    createdAt: 0,
  },
  {
    id: 'default-4',
    name: '复古质感',
    camera: 'panavision_dxl2',
    lens: 'anamorphic',
    focalLength: 50,
    aperture: 4,
    createdAt: 0,
  },
];

function generateId(): string {
  return `preset-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
}

function getStoredPresets(): CameraPreset[] {
  try {
    const stored = localStorage.getItem(STORAGE_KEY);
    if (stored) {
      return JSON.parse(stored);
    }
  } catch {
    // ignore parse errors
  }
  return [];
}

function savePresets(presets: CameraPreset[]): void {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(presets));
}

export function getAllPresets(): CameraPreset[] {
  const userPresets = getStoredPresets();
  if (userPresets.length > 0) {
    return userPresets;
  }
  // First launch: initialize with defaults
  savePresets(DEFAULT_PRESETS);
  return DEFAULT_PRESETS;
}

export function getPresetById(id: string): CameraPreset | undefined {
  const presets = getAllPresets();
  return presets.find((p) => p.id === id);
}

export function savePreset(
  name: string,
  cameraControl: CameraControlOptions
): CameraPreset {
  const presets = getStoredPresets();
  const newPreset: CameraPreset = {
    id: generateId(),
    name,
    camera: cameraControl.camera,
    lens: cameraControl.lens,
    focalLength: cameraControl.focalLength,
    aperture: cameraControl.aperture,
    createdAt: Date.now(),
  };
  presets.unshift(newPreset);
  savePresets(presets);
  return newPreset;
}

export function updatePreset(
  id: string,
  updates: Partial<Pick<CameraPreset, 'name' | 'camera' | 'lens' | 'focalLength' | 'aperture'>>
): CameraPreset | null {
  const presets = getStoredPresets();
  const index = presets.findIndex((p) => p.id === id);
  if (index === -1) {
    return null;
  }
  presets[index] = { ...presets[index], ...updates };
  savePresets(presets);
  return presets[index];
}

export function deletePreset(id: string): boolean {
  const presets = getStoredPresets();
  const filtered = presets.filter((p) => p.id !== id);
  if (filtered.length === presets.length) {
    return false;
  }
  savePresets(filtered);
  return true;
}

export function presetToCameraControl(preset: CameraPreset): CameraControlOptions {
  return {
    enabled: true,
    camera: preset.camera,
    lens: preset.lens,
    focalLength: preset.focalLength,
    aperture: preset.aperture,
  };
}
