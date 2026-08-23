function isHttpSource(source: string): boolean {
  return /^https?:\/\//i.test(source.trim());
}

export function resolveHistoryMediaProxyUrl(source: string): string {
  return `/api/history/media?url=${encodeURIComponent(source)}`;
}

async function fetchMediaBlob(source: string): Promise<Blob> {
  const normalized = source.trim();
  const candidates = isHttpSource(normalized)
    ? [normalized, resolveHistoryMediaProxyUrl(normalized)]
    : [normalized];
  let lastError: unknown;

  for (const candidate of candidates) {
    try {
      const response = await fetch(candidate, { credentials: 'same-origin' });
      if (response.ok) return await response.blob();
      lastError = new Error(`HTTP ${response.status}`);
    } catch (error) {
      lastError = error;
    }
  }

  throw lastError instanceof Error ? lastError : new Error('媒体读取失败');
}

function extensionFromMime(mime: string): string | null {
  const normalized = mime.toLowerCase().split(';', 1)[0];
  const extensions: Record<string, string> = {
    'image/png': 'png',
    'image/jpeg': 'jpg',
    'image/webp': 'webp',
    'image/gif': 'gif',
    'video/mp4': 'mp4',
    'video/webm': 'webm',
    'audio/mpeg': 'mp3',
    'audio/wav': 'wav',
    'audio/x-wav': 'wav',
    'audio/mp4': 'm4a',
  };
  return extensions[normalized] ?? null;
}

export function resolveBrowserDownloadName(
  requestedName: string,
  source: string,
  mime = '',
): string {
  const cleanName = requestedName.trim() || 'generation';
  if (/\.[a-z0-9]{2,5}$/i.test(cleanName)) return cleanName;
  const mimeExtension = extensionFromMime(mime);
  if (mimeExtension) return `${cleanName}.${mimeExtension}`;
  try {
    const sourceExtension = /\.([a-z0-9]{2,5})$/i.exec(new URL(source).pathname)?.[1];
    if (sourceExtension) return `${cleanName}.${sourceExtension.toLowerCase()}`;
  } catch {
    const sourceExtension = /\.([a-z0-9]{2,5})(?:[?#].*)?$/i.exec(source)?.[1];
    if (sourceExtension) return `${cleanName}.${sourceExtension.toLowerCase()}`;
  }
  return cleanName;
}

export async function downloadMediaInBrowser(source: string, requestedName: string): Promise<void> {
  const blob = await fetchMediaBlob(source);
  const objectUrl = URL.createObjectURL(blob);
  const anchor = document.createElement('a');
  anchor.href = objectUrl;
  anchor.download = resolveBrowserDownloadName(requestedName, source, blob.type);
  anchor.style.display = 'none';
  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();
  window.setTimeout(() => URL.revokeObjectURL(objectUrl), 0);
}

async function imageBlobToPng(blob: Blob): Promise<Blob> {
  if (blob.type.toLowerCase() === 'image/png') return blob;
  const bitmap = await createImageBitmap(blob);
  const canvas = document.createElement('canvas');
  canvas.width = bitmap.width;
  canvas.height = bitmap.height;
  const context = canvas.getContext('2d');
  if (!context) throw new Error('浏览器无法创建图片剪贴板');
  context.drawImage(bitmap, 0, 0);
  bitmap.close();
  return await new Promise<Blob>((resolve, reject) => {
    canvas.toBlob((png) => {
      if (png) resolve(png);
      else reject(new Error('图片转换失败'));
    }, 'image/png');
  });
}

export async function copyTextInBrowser(text: string): Promise<void> {
  try {
    if (navigator.clipboard?.writeText) {
      await navigator.clipboard.writeText(text);
      return;
    }
  } catch {
    // Fall through to the selection-based clipboard path.
  }
  const textarea = document.createElement('textarea');
  textarea.value = text;
  textarea.style.position = 'fixed';
  textarea.style.opacity = '0';
  document.body.appendChild(textarea);
  textarea.select();
  const copied = document.execCommand('copy');
  textarea.remove();
  if (!copied) throw new Error('浏览器拒绝了剪贴板操作');
}

export async function copyImageInBrowser(source: string): Promise<void> {
  if (navigator.clipboard?.write && typeof ClipboardItem !== 'undefined') {
    try {
      const blob = await imageBlobToPng(await fetchMediaBlob(source));
      await navigator.clipboard.write([new ClipboardItem({ 'image/png': blob })]);
      return;
    } catch (error) {
      console.warn('Image clipboard unavailable; copied the media address instead.', error);
    }
  }
  await copyTextInBrowser(source);
}
