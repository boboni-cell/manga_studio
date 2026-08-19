import { InMemoryCanvasEventBus } from './eventBus';
import { nodeCatalog } from './nodeCatalog';
import { CanvasNodeFactory } from './nodeFactory';
import { CanvasToolProcessor } from './toolProcessor';
import { uuidGenerator } from '../infrastructure/idGenerator';
import {
  buildGenerateImageDebugPreview,
  buildGenerateVideoDebugPreview,
} from '../infrastructure/tauriAiGateway';
import { webApiGateway } from '../infrastructure/webApiGateway';
import { tauriImageSplitGateway } from '../infrastructure/tauriImageSplitGateway';
import { materializeCustomProviderImageResult } from '../infrastructure/customProviderGateway';

export const canvasEventBus = new InMemoryCanvasEventBus();
export const canvasNodeFactory = new CanvasNodeFactory(uuidGenerator, nodeCatalog);
export const canvasToolProcessor = new CanvasToolProcessor(tauriImageSplitGateway, uuidGenerator, webApiGateway);
export const canvasAiGateway = webApiGateway;
export const canvasVideoGateway = webApiGateway;
export const buildImageGenerationDebugPreview = buildGenerateImageDebugPreview;
export const buildVideoGenerationDebugPreview = buildGenerateVideoDebugPreview;
export const materializeProviderAwareImageResult = materializeCustomProviderImageResult;

export { graphImageResolver } from './graphImageResolver';
