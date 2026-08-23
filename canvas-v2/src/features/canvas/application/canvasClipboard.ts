import type { CanvasNodeData } from '@/features/canvas/domain/canvasNodes';

export function cloneCanvasNodeContent(data: CanvasNodeData): CanvasNodeData {
  const copy = typeof structuredClone === 'function'
    ? structuredClone(data)
    : JSON.parse(JSON.stringify(data)) as CanvasNodeData;
  const transient = copy as Record<string, unknown>;

  if ('isGenerating' in transient) transient.isGenerating = false;
  if ('isStreaming' in transient) transient.isStreaming = false;
  if ('generationStartedAt' in transient) transient.generationStartedAt = null;
  if ('generationJobId' in transient) transient.generationJobId = null;
  if ('generationProviderId' in transient) transient.generationProviderId = null;
  if ('generationClientSessionId' in transient) transient.generationClientSessionId = null;
  if ('generationStoryboardMetadata' in transient) transient.generationStoryboardMetadata = undefined;
  if ('generationError' in transient) transient.generationError = null;
  if ('generationErrorDetails' in transient) transient.generationErrorDetails = null;
  if ('generationDebugContext' in transient) transient.generationDebugContext = undefined;
  if ('generationRetryResultUrl' in transient) transient.generationRetryResultUrl = null;

  return copy;
}
