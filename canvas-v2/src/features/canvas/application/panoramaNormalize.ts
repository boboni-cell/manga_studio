/**
 * Frontend panorama normalization helpers.
 *
 * Dreamina CLI can only produce a fixed set of aspect ratios (closest to a true
 * equirectangular panorama is 21:9 ≈ 2.33:1). These helpers post-process that
 * output into the geometry photo-sphere-viewer expects:
 *
 *   - spherical (720°)  → 2:1 equirectangular, full sphere
 *   - cylindrical (360°) → 4:1 wrap-around band, partial sphere
 *
 * Both variants center-crop the source and feather the left/right seams so the
 * wrap-around looks continuous even though Dreamina was never explicitly told
 * how to close the loop.
 */

export type PanoramaProjection = 'spherical' | 'cylindrical';

interface NormalizeOptions {
  projection: PanoramaProjection;
  /** Pixels of soft alpha cross-fade at the left + right edges (each). */
  featherPx?: number;
}

/** Target ratio in each mode, width / height. */
function targetRatio(projection: PanoramaProjection): number {
  return projection === 'spherical' ? 2 : 4;
}

export function normalizePanoramaToDataUrl(
  sourceUrl: string,
  options: NormalizeOptions
): Promise<string> {
  const { projection, featherPx = 48 } = options;
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.crossOrigin = 'anonymous';
    img.onerror = (err) => reject(err);
    img.onload = () => {
      try {
        const srcW = img.naturalWidth;
        const srcH = img.naturalHeight;
        if (!srcW || !srcH) {
          resolve(sourceUrl);
          return;
        }

        const wanted = targetRatio(projection);
        const sourceRatio = srcW / srcH;

        // Decide the crop rectangle in source coordinates.
        let cropX: number;
        let cropY: number;
        let cropW: number;
        let cropH: number;
        if (sourceRatio >= wanted) {
          // source is wider than target → shave sides
          cropH = srcH;
          cropW = Math.round(srcH * wanted);
          cropX = Math.round((srcW - cropW) / 2);
          cropY = 0;
        } else {
          // source is narrower than target → shave top+bottom
          cropW = srcW;
          cropH = Math.round(srcW / wanted);
          cropX = 0;
          cropY = Math.round((srcH - cropH) / 2);
        }

        const canvas = document.createElement('canvas');
        canvas.width = cropW;
        canvas.height = cropH;
        const ctx = canvas.getContext('2d');
        if (!ctx) {
          resolve(sourceUrl);
          return;
        }

        ctx.imageSmoothingEnabled = true;
        ctx.imageSmoothingQuality = 'high';
        ctx.drawImage(img, cropX, cropY, cropW, cropH, 0, 0, cropW, cropH);

        // Seam feathering: sample the left edge strip, mirror it as overlay on the
        // right edge with a linear alpha fade. This hides the left-right discontinuity
        // when photo-sphere-viewer wraps 359° → 0°.
        const feather = Math.min(featherPx, Math.floor(cropW / 6));
        if (feather > 4) {
          const leftStrip = ctx.getImageData(0, 0, feather, cropH);
          const rightStrip = ctx.getImageData(cropW - feather, 0, feather, cropH);

          // Blend: right pixel = lerp(rightPixel, leftPixel, 1 - x/feather)
          // near the right edge, we bias toward the left-strip so the seam matches.
          const out = ctx.createImageData(feather, cropH);
          for (let y = 0; y < cropH; y++) {
            for (let x = 0; x < feather; x++) {
              const t = x / feather; // 0 at outer right edge, 1 at inner edge
              const idx = (y * feather + x) * 4;
              const r1 = rightStrip.data[idx];
              const g1 = rightStrip.data[idx + 1];
              const b1 = rightStrip.data[idx + 2];
              const r2 = leftStrip.data[idx];
              const g2 = leftStrip.data[idx + 1];
              const b2 = leftStrip.data[idx + 2];
              // Near the outer edge (t≈0) lean heavily on the left-sample so the
              // horizontal wrap pixel matches. Near the inner edge (t≈1) keep the
              // source pixel.
              const w = Math.pow(1 - t, 1.2);
              out.data[idx] = Math.round(r1 * (1 - w) + r2 * w);
              out.data[idx + 1] = Math.round(g1 * (1 - w) + g2 * w);
              out.data[idx + 2] = Math.round(b1 * (1 - w) + b2 * w);
              out.data[idx + 3] = 255;
            }
          }
          ctx.putImageData(out, cropW - feather, 0);
        }

        resolve(canvas.toDataURL('image/png'));
      } catch (err) {
        reject(err);
      }
    };
    img.src = sourceUrl;
  });
}

/**
 * Generate a pure-white 2:1 PNG data URL of the requested size, used as a
 * reference image in "smart 2:1 mode" so Dreamina i2i is nudged to paint into
 * a panorama-shaped canvas.
 */
export function createWhite2x1DataUrl(width = 2048): string {
  const height = Math.round(width / 2);
  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext('2d');
  if (ctx) {
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(0, 0, width, height);
  }
  return canvas.toDataURL('image/png');
}

function parseRatioValue(value: string): number | null {
  const [w, h] = value.split(':').map((part) => Number(part.trim()));
  return Number.isFinite(w) && Number.isFinite(h) && w > 0 && h > 0 ? w / h : null;
}

export function selectPanoramaRequestRatio(
  supportedRatios: string[],
  projection: PanoramaProjection
): string {
  const normalized = Array.from(
    new Set(supportedRatios.map((ratio) => ratio.trim()).filter(Boolean))
  );
  const concrete = normalized.filter((ratio) => ratio !== 'auto');
  const target = projection === 'spherical' ? 2 : 4;
  const exact = projection === 'spherical' ? '2:1' : '4:1';
  if (concrete.includes(exact)) return exact;
  if (projection === 'spherical' && concrete.includes('21:9')) return '21:9';

  let best = '';
  let bestDistance = Number.POSITIVE_INFINITY;
  concrete.forEach((ratio) => {
    const numeric = parseRatioValue(ratio);
    if (!numeric || numeric <= 1) return;
    const distance = Math.abs(Math.log(numeric / target));
    if (distance < bestDistance) {
      best = ratio;
      bestDistance = distance;
    }
  });

  if (best) return best;
  if (normalized.includes('auto')) return 'auto';
  return projection === 'spherical' ? '21:9' : '16:9';
}

export function getImageNaturalRatio(sourceUrl: string): Promise<number | null> {
  return new Promise((resolve) => {
    const img = new Image();
    img.crossOrigin = 'anonymous';
    img.onload = () => {
      const width = img.naturalWidth;
      const height = img.naturalHeight;
      if (!width || !height) {
        resolve(null);
        return;
      }
      resolve(width / height);
    };
    img.onerror = () => resolve(null);
    img.src = sourceUrl;
  });
}

export function isNearPanoramaRatio(
  ratio: number | null,
  projection: PanoramaProjection,
  tolerance = 0.08
): boolean {
  if (!ratio || !Number.isFinite(ratio)) return false;
  const target = projection === 'spherical' ? 2 : 4;
  return Math.abs(ratio - target) / target <= tolerance;
}

export async function prepareLocalPanoramaSource(
  sourceUrl: string,
  projection: PanoramaProjection,
  loadableUrl = sourceUrl
): Promise<{ imageUrl: string; aspectRatio: string; normalized: boolean }> {
  const aspectRatio = projection === 'spherical' ? '2:1' : '4:1';
  const naturalRatio = await getImageNaturalRatio(loadableUrl);
  if (isNearPanoramaRatio(naturalRatio, projection)) {
    return { imageUrl: sourceUrl, aspectRatio, normalized: false };
  }

  const normalizedUrl = await normalizePanoramaToDataUrl(loadableUrl, {
    projection,
    featherPx: 48,
  });
  return { imageUrl: normalizedUrl, aspectRatio, normalized: true };
}
