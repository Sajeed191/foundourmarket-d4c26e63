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
const RENDER_SEGMENT = "/storage/v1/render/image/public/";

/** True when the URL is a Supabase Storage public-object URL we can resize. */
export function isStorageObjectUrl(url: string): boolean {
  return typeof url === "string" && url.includes(OBJECT_SEGMENT);
}

/** Returns a resized variant of a storage object URL at the given width. */
export function resizedStorageImage(url: string, width: number, quality = 62): string {
  if (!isStorageObjectUrl(url)) return url;
  try {
    const u = new URL(url);
    u.pathname = u.pathname.replace(OBJECT_SEGMENT, RENDER_SEGMENT);
    u.searchParams.set("width", String(Math.round(width)));
    u.searchParams.set("quality", String(quality));
    u.searchParams.set("resize", "contain");
    return u.toString();
  } catch {
    return url;
  }
}

// Card-appropriate widths. Caps at 960 because product cards never display
// larger than this even at 3x DPR on the widest layouts.
const DEFAULT_WIDTHS = [200, 320, 480, 640, 960];

export type StorageResponsive = { src: string; srcset: string };

/**
 * Builds a resized fallback `src` + `srcset` for a storage product image.
 * Returns null for non-storage URLs (bundled assets, external CDNs) so the
 * caller can fall back to its existing handling.
 */
export function getStorageResponsive(
  url: string,
  widths: number[] = DEFAULT_WIDTHS,
): StorageResponsive | null {
  if (!isStorageObjectUrl(url)) return null;
  const srcset = widths.map((w) => `${resizedStorageImage(url, w)} ${w}w`).join(", ");
  // Mid-size fallback for browsers that ignore srcset/sizes.
  return { src: resizedStorageImage(url, 480), srcset };
}
