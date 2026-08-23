import { useMemo } from 'react';

import {
  AGNES_PROVIDER_DEFAULTS,
  isVideoCustomProvider,
  useCustomProvidersStore,
  type CustomProviderConfig,
} from '@/stores/customProvidersStore';
import { hasCustomProviderCredential } from '@/features/canvas/application/providerAvailability';
import { useSettingsStore } from '@/stores/settingsStore';
import {
  DEFAULT_VIDEO_INPUT_SCHEMA,
  defaultVideoInputSchemaForProviderKind,
  resolveVideoInputSchemaFromExtraParams,
  type VideoInputSchema,
} from './videoInputSchema';
import {
  DREAMINA_MULTIFRAME_CAPABILITY,
  listDreaminaVideoModels,
  type DreaminaVideoModelCapability,
} from './dreaminaCapabilities';
import { useMangaCatalogResource } from './mangaCatalogApi';

export interface VideoCatalogEntry {
  id: string;
  providerId: string;
  providerLabel: string;
  modelId: string;
  modelLabel: string;
  defaultExtraParams?: Record<string, unknown>;
  supportedDurations: string[];
  supportedResolutions: string[];
  supportedAspectRatios: string[];
  inputSchema: VideoInputSchema;
  usable: boolean;
  notReadyReason?: string;
}

interface MangaVideoCapabilities {
  resolutions?: string[];
  ratios?: string[];
  min_duration?: number;
  max_duration?: number;
}

interface MangaApiProfile {
  id: string;
  name?: string;
  provider?: string;
  model?: string;
  configured?: boolean;
  capabilities?: MangaVideoCapabilities;
}

interface MangaVideoModelsResponse {
  models?: string[];
  caps?: Record<string, MangaVideoCapabilities>;
}

interface MangaSettingsResponse {
  api_profiles?: Record<string, MangaApiProfile[]>;
}

export interface VideoModelConfigValue {
  entryId: string;
  duration: string;
  resolution: string;
  aspectRatio?: string;
  extraParams?: Record<string, unknown>;
}

const DEFAULT_DURATIONS = ['4', '8', '12'];
const AGNES_DURATIONS = Array.from({ length: 18 }, (_, index) => String(index + 1));
const DEFAULT_RESOLUTIONS = ['1280x720', '720x1280', '1024x1024'];
const DEFAULT_ASPECT_RATIOS = ['16:9', '9:16', '1:1'];
const AGNES_VIDEO_RESOLUTIONS = [...AGNES_PROVIDER_DEFAULTS.videoResolutions];
const AGNES_DEFAULT_DURATION = '5';
interface DreaminaProviderStatus {
  loggedIn: boolean;
}

function uniqueStrings(values: unknown, fallback: string[]): string[] {
  if (!Array.isArray(values)) {
    return fallback;
  }
  const seen = new Set<string>();
  const normalized: string[] = [];
  values.forEach((value) => {
    const text = String(value ?? '').trim();
    if (!text || seen.has(text)) return;
    seen.add(text);
    normalized.push(text);
  });
  return normalized.length > 0 ? normalized : fallback;
}

function resolveModelDescription(
  provider: CustomProviderConfig,
  modelId: string
): string | undefined {
  const descriptions = provider.extraParams?.modelDescriptions;
  if (!descriptions || typeof descriptions !== 'object' || Array.isArray(descriptions)) {
    return undefined;
  }
  const value = (descriptions as Record<string, unknown>)[modelId];
  return typeof value === 'string' && value.trim() ? value.trim() : undefined;
}

export function buildVideoModelCatalog(
  customProviders: readonly CustomProviderConfig[],
  agnesApiKey = '',
  dreaminaStatus?: DreaminaProviderStatus | null
): VideoCatalogEntry[] {
  const entries: VideoCatalogEntry[] = [];
  for (const provider of customProviders) {
    if (!isVideoCustomProvider(provider)) {
      continue;
    }

    const models = provider.models.length > 0 ? provider.models : ['sora-2'];
    const supportedDurations = uniqueStrings(
      provider.extraParams?.supportedDurations,
      DEFAULT_DURATIONS
    );
    const supportedResolutions = uniqueStrings(
      provider.supportedResolutions ?? provider.extraParams?.supportedResolutions,
      DEFAULT_RESOLUTIONS
    );
    const supportedAspectRatios = uniqueStrings(
      provider.extraParams?.supportedRatios,
      DEFAULT_ASPECT_RATIOS
    );
    const hasBaseUrl = Boolean(provider.baseUrl?.trim());
    const hasCredential = hasCustomProviderCredential(provider);
    const usable = hasBaseUrl && hasCredential;

    for (const modelId of models) {
      entries.push({
        id: `custom:${provider.id}:${modelId}`,
        providerId: provider.id,
        providerLabel: provider.label,
        modelId,
        modelLabel: resolveModelDescription(provider, modelId) ?? modelId,
        supportedDurations,
        supportedResolutions,
        supportedAspectRatios,
        inputSchema: resolveVideoInputSchemaFromExtraParams(provider.extraParams, modelId),
        usable,
        notReadyReason: usable
          ? undefined
          : (hasBaseUrl ? '请在「我的配置」里填入 API Key' : '请在「我的配置」里填入 API 根地址'),
      });
    }
  }
  if (agnesApiKey.trim()) {
    for (const [modelId, modelLabel] of [
      [AGNES_PROVIDER_DEFAULTS.models.video20, 'Agnes Video v2.0'],
    ] as const) {
      entries.push({
        id: `agnes:video:${modelId}`,
        providerId: 'agnes',
        providerLabel: 'Agnes',
        modelId,
        modelLabel,
        supportedDurations: AGNES_DURATIONS,
        supportedResolutions: AGNES_VIDEO_RESOLUTIONS,
        supportedAspectRatios: DEFAULT_ASPECT_RATIOS,
        inputSchema: defaultVideoInputSchemaForProviderKind('agnes-video'),
        usable: true,
      });
    }
  }
  if (dreaminaStatus?.loggedIn) {
    const dreaminaProvider = '即梦 CLI';
    const appendDreaminaModels = (
      command: DreaminaVideoModelCapability['command'],
      entryKind: string,
      label: string,
    ) => {
      for (const capability of listDreaminaVideoModels(command)) {
        entries.push({
          id: `dreamina:${entryKind}:${capability.model}`,
          providerId: 'dreamina',
          providerLabel: dreaminaProvider,
          modelId: capability.model,
          modelLabel: `${label} · ${capability.model}`,
          defaultExtraParams: { modelVersion: capability.model },
          supportedDurations: [...capability.durations],
          supportedResolutions: [...capability.resolutions],
          supportedAspectRatios: [...capability.aspectRatios],
          inputSchema: capability.inputSchema,
          usable: true,
        });
      }
    };

    appendDreaminaModels('multimodal2video', 'all-reference-video', '全能参考成片');
    appendDreaminaModels('text2video', 'text-video', '文生视频');
    appendDreaminaModels('image2video', 'image-video', '图生视频');
    appendDreaminaModels('frames2video', 'frames-video', '首尾帧成片');
    entries.push({
      id: 'dreamina:multi-frame-video',
      providerId: 'dreamina',
      providerLabel: dreaminaProvider,
      modelId: 'multi-frame-video',
      modelLabel: '多帧成片 · 智能多图',
      supportedDurations: [...DREAMINA_MULTIFRAME_CAPABILITY.durations],
      supportedResolutions: [...DREAMINA_MULTIFRAME_CAPABILITY.resolutions],
      supportedAspectRatios: [...DREAMINA_MULTIFRAME_CAPABILITY.aspectRatios],
      inputSchema: DREAMINA_MULTIFRAME_CAPABILITY.inputSchema,
      usable: true,
    });
  }
  return entries;
}

function durationRange(capabilities?: MangaVideoCapabilities): string[] {
  const min = Math.max(1, Math.round(capabilities?.min_duration ?? 4));
  const max = Math.max(min, Math.round(capabilities?.max_duration ?? 12));
  return Array.from({ length: max - min + 1 }, (_, index) => String(min + index));
}

export function buildMangaVideoModelCatalog(
  models: readonly string[],
  profiles: readonly MangaApiProfile[],
  caps: Readonly<Record<string, MangaVideoCapabilities>> = {},
): VideoCatalogEntry[] {
  const createEntry = (
    id: string,
    providerId: string,
    providerLabel: string,
    modelId: string,
    modelLabel: string,
    capabilities: MangaVideoCapabilities | undefined,
    usable: boolean,
    route: { use_personal_api: boolean; api_profile_id?: string },
  ): VideoCatalogEntry => ({
    id,
    providerId,
    providerLabel,
    modelId,
    modelLabel,
    defaultExtraParams: route,
    supportedDurations: durationRange(capabilities),
    supportedResolutions: uniqueStrings(capabilities?.resolutions, ['720p']),
    supportedAspectRatios: uniqueStrings(capabilities?.ratios, DEFAULT_ASPECT_RATIOS),
    inputSchema: DEFAULT_VIDEO_INPUT_SCHEMA,
    usable,
    notReadyReason: usable ? undefined : '请先在“API 设置”中填写 API Key',
  });

  const entries = models.map((model) => createEntry(
    `manga:video:platform:${model}`,
    'manga-platform',
    '平台模型',
    model,
    model,
    caps[model],
    true,
    { use_personal_api: false },
  ));
  for (const profile of profiles) {
    if (!profile?.id) continue;
    const label = profile.name || profile.model || profile.id;
    entries.push(createEntry(
      `manga:video:personal:${profile.id}`,
      `manga-personal:${profile.id}`,
      profile.provider ? `${label} · ${profile.provider}` : label,
      'personal-api',
      profile.model || label,
      profile.capabilities,
      profile.configured !== false,
      { use_personal_api: true, api_profile_id: profile.id },
    ));
  }
  return entries;
}

export function useVideoModelCatalog(): VideoCatalogEntry[] {
  const customProviders = useCustomProvidersStore((state) => state.providers);
  const agnesApiKey = useSettingsStore((state) => state.agnesApiKey);
  const dreaminaStatus = useSettingsStore((state) => state.dreaminaStatus);
  const upstreamEntries = useMemo(
    () => buildVideoModelCatalog(customProviders, agnesApiKey, dreaminaStatus),
    [agnesApiKey, customProviders, dreaminaStatus]
  );
  const useMangaBackend = typeof window !== 'undefined' && window.location.pathname.startsWith('/canvas-v2');
  const mangaModels = useMangaCatalogResource<MangaVideoModelsResponse>('/api/models', useMangaBackend);
  const mangaSettings = useMangaCatalogResource<MangaSettingsResponse>('/api/settings', useMangaBackend);
  const mangaEntries = useMemo(
    () => buildMangaVideoModelCatalog(
      Array.isArray(mangaModels?.models) ? mangaModels.models : [],
      Array.isArray(mangaSettings?.api_profiles?.video) ? mangaSettings.api_profiles.video : [],
      mangaModels?.caps ?? {},
    ),
    [mangaModels, mangaSettings]
  );
  return useMangaBackend ? mangaEntries : upstreamEntries;
}

export function resolveVideoModelConfig(
  catalog: readonly VideoCatalogEntry[],
  current?: VideoModelConfigValue | null
): VideoModelConfigValue | undefined {
  const currentEntry = current
    ? catalog.find((entry) => entry.id === current.entryId && entry.usable)
    : undefined;
  if (current?.entryId.startsWith('dreamina:') && !currentEntry) {
    return undefined;
  }
  const entry = currentEntry ?? catalog.find((candidate) => candidate.usable);
  if (!entry) {
    return undefined;
  }
  const defaultDuration = entry.providerId === 'agnes' && entry.supportedDurations.includes(AGNES_DEFAULT_DURATION)
    ? AGNES_DEFAULT_DURATION
    : entry.supportedDurations[0] ?? DEFAULT_DURATIONS[0];
  const duration = current?.duration && entry.supportedDurations.includes(current.duration)
    ? current.duration
    : defaultDuration;
  const resolution = current?.resolution && entry.supportedResolutions.includes(current.resolution)
    ? current.resolution
    : entry.supportedResolutions[0] ?? DEFAULT_RESOLUTIONS[0];
  const aspectRatio = current?.aspectRatio && entry.supportedAspectRatios.includes(current.aspectRatio)
    ? current.aspectRatio
    : entry.supportedAspectRatios[0] ?? DEFAULT_ASPECT_RATIOS[0];
  return {
    entryId: entry.id,
    duration,
    resolution,
    aspectRatio,
    extraParams: {
      ...(entry.defaultExtraParams ?? {}),
      ...(current?.extraParams ?? {}),
    },
  };
}
