import { prepareNodeImage, resolveImageDisplayUrl } from '@/features/canvas/application/imageData';
import {
  prepareLocalPanoramaSource,
  type PanoramaProjection,
} from '@/features/canvas/application/panoramaNormalize';

export type DirectorStudioPanoramaImportStage =
  | 'checking'
  | 'generating'
  | 'polling'
  | 'normalizing';

export interface DirectorStudioPanoramaImportMessages {
  missingBuiltinApiKey: (providerLabel: string) => string;
  missingCustomApiKey: (providerLabel: string) => string;
  timeout: string;
  submitFailed: string;
  generationFailed: string;
  fetchResultFailed: string;
}

interface DirectorStudioPanoramaImportOptions {
  sourceUrl: string;
  sourceLabel?: string;
  projection?: PanoramaProjection;
  messages: DirectorStudioPanoramaImportMessages;
  onProgress?: (stage: DirectorStudioPanoramaImportStage) => void;
}

interface DirectorStudioPanoramaImportResult {
  panoramaUrl: string;
  generated: boolean;
}

const DATA_IMAGE_URL_PATTERN = /^data:image\//i;

async function persistPanoramaStoreImage(sourceUrl: string): Promise<string> {
  if (!DATA_IMAGE_URL_PATTERN.test(sourceUrl)) {
    return sourceUrl;
  }
  const prepared = await prepareNodeImage(sourceUrl);
  return prepared.imageUrl;
}

export async function importDirectorStudioPanorama(
  options: DirectorStudioPanoramaImportOptions,
): Promise<DirectorStudioPanoramaImportResult> {
  const projection = options.projection ?? 'spherical';
  const displayUrl = resolveImageDisplayUrl(options.sourceUrl) ?? options.sourceUrl;
  options.onProgress?.('checking');
  const prepared = await prepareLocalPanoramaSource(options.sourceUrl, projection, displayUrl);
  if (prepared.normalized) {
    options.onProgress?.('normalizing');
  }
  return {
    panoramaUrl: await persistPanoramaStoreImage(prepared.imageUrl),
    generated: prepared.normalized,
  };
}
