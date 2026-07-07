// Rewrites Supabase Storage public-object URLs to the on-the-fly image
// transformation endpoint so product cards download a device-appropriate,
// compressed WebP instead of the full-resolution original. This is the single
// biggest payload win for low-end / slow-network Android devices: a typical
// 130KB JPEG original becomes a ~15KB WebP at card display size.
//
// The render endpoint negotiates WebP/AVIF automatically from the browser's
// `Accept` header, so no `format` param is needed. Unknown/extra query params
// (e.g. cache-busting `?v=`) are preserved.

const OBJECT_SEGMENT = "/storage/v1/object/public/";
import { isGpuUnsafe } from "@/lib/gpu-compat";
const RENDER_SEGMENT = "/storage/v1/render/image/public/";

/** True when the URL is a Supabase Storage public-object URL we can resize. */
export function isStorageObjectUrl(url: string): boolean {
  return typeof url === "string" && url.includes(OBJECT_SEGMENT);
}

/** Returns a resized variant of a storage object URL at the given width. */
export function resizedStorageImage(url: string, width: number, quality = 62): string {
  if (!isStorageObjectUrl(url)) return url;
  // Debug harness: when image transformations are disabled, serve the original
  // object URL untouched so the resize/transform pipeline can be isolated.
  if (
    typeof document !== "undefined" &&
    document.documentElement.dataset.ffImageTransformations === "off"
  ) {
    return url;
  }
  try {
    const u = new URL(url);
    u.pathname = u.pathname.replace(OBJECT_SEGMENT, RENDER_SEGMENT);
    u.searchParams.set("width", String(Math.round(width)));
    u.searchParams.set("quality", String(quality));
    u.searchParams.set("resize", "contain");
    // Mali GPU compatibility: on devices flagged data-gpu-unsafe, pin the
    // transform endpoint to WebP so Chrome never negotiates AVIF (a riskier
    // Skia/Mali decode+raster path). No effect on any other device.
    if (isGpuUnsafe()) {
      u.searchParams.set("format", "webp");
    }
    return u.toString();
  } catch {
    return url;
  }
}

/**
 * Single, small, WebP-only storage source for Mali GPU-unsafe devices. Caps the
 * requested width at 480px and returns ONE candidate (no srcset) so Chrome
 * cannot use high-DPR selection to pull the 960w texture. Layout dimensions and
 * aspect ratio are unchanged — only the downloaded bitmap is smaller. Returns
 * null for non-storage URLs so callers keep their existing handling.
 */
export function getStorageSafeSrc(url: string, quality = 62): string | null {
  if (!isStorageObjectUrl(url)) return null;
  return resizedStorageImage(url, 480, quality);
}

// Card-appropriate widths. Caps at 960 because product cards never display
// larger than this even at 3x DPR on the widest layouts.
const DEFAULT_WIDTHS = [200, 320, 480, 640, 960];

export type StorageResponsive = { src: string; srcset: string };

export type StorageResponsiveOptions = {
  widths?: number[];
  fallbackWidth?: number;
  quality?: number;
};

/**
 * Builds a resized fallback `src` + `srcset` for a storage product image.
 * Returns null for non-storage URLs (bundled assets, external CDNs) so the
 * caller can fall back to its existing handling.
 */
export function getStorageResponsive(
  url: string,
  options: StorageResponsiveOptions | number[] = DEFAULT_WIDTHS,
): StorageResponsive | null {
  if (!isStorageObjectUrl(url)) return null;
  const widths = Array.isArray(options) ? options : options.widths ?? DEFAULT_WIDTHS;
  const fallbackWidth = Array.isArray(options) ? 480 : options.fallbackWidth ?? 480;
  const quality = Array.isArray(options) ? 62 : options.quality ?? 62;
  const safeMode =
    typeof document !== "undefined" &&
    document.documentElement.dataset.androidGpuSafeMode === "true";
  const safeWidths = safeMode ? widths.filter((w) => w <= 288) : widths;
  const finalWidths = safeWidths.length ? safeWidths : [Math.min(fallbackWidth, 288)];
  const finalFallback = safeMode ? Math.min(fallbackWidth, 288) : fallbackWidth;
  const srcset = finalWidths.map((w) => `${resizedStorageImage(url, w, quality)} ${w}w`).join(", ");
  // Mid-size fallback for browsers that ignore srcset/sizes.
  return { src: resizedStorageImage(url, finalFallback, quality), srcset };
}
