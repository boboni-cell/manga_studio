import { describe, expect, it } from 'vitest';

import { AGNES_PROVIDER_DEFAULTS } from '@/stores/customProvidersStore';
import { buildChatModelCatalog, buildMangaChatModelCatalog, resolveAgentProtocol } from './chatModelCatalog';

describe('Agnes chat catalog', () => {
  it('places Agnes 2.5 first and retains saved-project compatibility ids', () => {
    const entries = buildChatModelCatalog([], 'agnes-key');
    expect(entries.map((entry) => entry.modelId)).toEqual([
      AGNES_PROVIDER_DEFAULTS.models.chat25Flash,
      AGNES_PROVIDER_DEFAULTS.models.chat20Flash,
      AGNES_PROVIDER_DEFAULTS.models.chat15Flash,
    ]);
  });

  it('does not expose Agnes models without a saved key', () => {
    expect(buildChatModelCatalog([], '   ')).toEqual([]);
  });

  it('uses an explicit standard endpoint shape before a stale provider kind', () => {
    const provider = {
      id: 'gateway',
      label: 'Gateway',
      mediaType: 'chat' as const,
      baseUrl: 'https://gateway.example',
      endpointPath: '/v1/chat/completions',
      apiKey: 'secret',
      apiStyle: 'openai-compatible',
      models: ['gemini-compatible'],
      supportsWebSearch: false,
      extraParams: { providerKind: 'google-gemini' },
    };
    expect(resolveAgentProtocol(provider, {})).toBe('openai-chat-completions');
    expect(resolveAgentProtocol({
      ...provider,
      endpointPath: '/v1beta/models/{model}:generateContent',
      extraParams: { providerKind: 'openai-chat-completions' },
    }, {})).toBe('google-gemini');
  });
});

describe('Manga Studio text catalog', () => {
  it('groups every saved personal API under one selectable provider', () => {
    const entries = buildMangaChatModelCatalog(['doubao', 'glm46'], [{
      id: 'profile-1',
      name: '我的 MiniMax',
      provider: 'MiniMax',
      model: 'MiniMax-H3',
    }]);

    expect(entries.map((entry) => entry.providerLabel)).toEqual([
      '平台模型',
      '平台模型',
      '个人 API',
    ]);
    expect(entries[2]?.modelLabel).toBe('我的 MiniMax · MiniMax-H3 · MiniMax');
    expect(entries[2]?.mangaRoute).toEqual({
      scriptModel: 'personal-api',
      usePersonalApi: true,
      apiProfileId: 'profile-1',
    });
  });
});
