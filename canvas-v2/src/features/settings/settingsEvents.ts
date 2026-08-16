export type SettingsCategory =
  | 'providers'
  | 'providersAdd'
  | 'providersNew'
  | 'providersOld'
  | 'providersChat'
  | 'customProviders'
  | 'dreamina'
  | 'agnes'
  | 'imageHosting'
  | 'audioModels'
  | 'promptManagement'
  | 'promptPresets'
  | 'textAgents'
  | 'appearance'
  | 'general'
  | 'keybindings'
  | 'portability'
  | 'externalAgents'
  | 'about';

interface OpenSettingsEventDetail {
  category?: SettingsCategory;
}

const OPEN_SETTINGS_EVENT = 'storyboard:open-settings-dialog';

export function openSettingsDialog(detail: OpenSettingsEventDetail = {}): void {
  if (typeof window === 'undefined') {
    return;
  }

  // The Manga Studio workbench deliberately does not mount the upstream
  // provider dialog. Its single source of truth is Flask /api/settings.
  if (window.location.pathname.startsWith('/canvas-v2')) {
    try {
      if (window.top) {
        window.top.location.assign('/api-settings');
        return;
      }
    } catch {
      // Same-origin is expected; fall back to the current frame if embedded
      // navigation is unavailable.
    }
    window.location.assign('/api-settings');
    return;
  }

  window.dispatchEvent(new CustomEvent<OpenSettingsEventDetail>(OPEN_SETTINGS_EVENT, { detail }));
}

export function subscribeOpenSettingsDialog(
  callback: (detail: OpenSettingsEventDetail) => void
): () => void {
  if (typeof window === 'undefined') {
    return () => {};
  }

  const handler = (event: Event) => {
    const customEvent = event as CustomEvent<OpenSettingsEventDetail>;
    callback(customEvent.detail ?? {});
  };

  window.addEventListener(OPEN_SETTINGS_EVENT, handler as EventListener);
  return () => {
    window.removeEventListener(OPEN_SETTINGS_EVENT, handler as EventListener);
  };
}
