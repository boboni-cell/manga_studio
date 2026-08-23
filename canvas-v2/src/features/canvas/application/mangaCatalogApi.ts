import { useEffect, useState } from 'react';

import { api } from '@/api';

interface CachedResource {
  value?: unknown;
  pending?: Promise<unknown>;
}

const resources = new Map<string, CachedResource>();

export function readMangaCatalogResource<T>(url: string): T | undefined {
  return resources.get(url)?.value as T | undefined;
}

function loadMangaCatalogResource<T>(url: string): Promise<T> {
  const resource = resources.get(url) ?? {};
  if (resource.value !== undefined) return Promise.resolve(resource.value as T);
  if (resource.pending) return resource.pending as Promise<T>;

  resource.pending = api<T>(url).then((value) => {
    resource.value = value;
    resource.pending = undefined;
    return value;
  }).catch((error) => {
    resource.pending = undefined;
    throw error;
  });
  resources.set(url, resource);
  return resource.pending as Promise<T>;
}

export function useMangaCatalogResource<T>(url: string, enabled: boolean): T | undefined {
  const [value, setValue] = useState<T | undefined>(() => readMangaCatalogResource<T>(url));
  useEffect(() => {
    if (!enabled) return;
    let cancelled = false;
    loadMangaCatalogResource<T>(url).then((nextValue) => {
      if (!cancelled) setValue(nextValue);
    }).catch(() => undefined);
    return () => {
      cancelled = true;
    };
  }, [enabled, url]);
  return value;
}
