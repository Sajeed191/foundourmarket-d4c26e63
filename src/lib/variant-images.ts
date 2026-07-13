import { supabase } from "@/integrations/supabase/client";
import { resolveImage } from "@/lib/products";
import { DEFAULT_BUCKET } from "@/lib/media-engine";

/**
 * Variant Media Gallery — per-COLOUR media galleries (images + videos).
 *
 * A gallery is keyed by (product_slug, color). Every size variant of a colour
 * shares the same media, so picking "Blue" shows the Blue gallery regardless of
 * size. The FIRST IMAGE of each colour is the colour thumbnail and is synced
 * into `product_variants.image_url` for every variant of that colour, so the
 * existing cart / checkout / order-snapshot pipeline (which reads
 * `variant.image_url`) keeps working with zero changes. Videos never become the
 * variant thumbnail — cart/checkout always show a still image.
 *
 * Products without colour galleries fall back to the product's default gallery
 * on the storefront — this module never returns a broken/empty gallery.
 */

export type MediaType = "image" | "video";

export type VariantImage = {
  id: string;
  color: string;
  url: string;
  thumbUrl: string | null;
  mediumUrl: string | null;
  mediaType: MediaType;
  posterUrl: string | null;
  sortOrder: number;
};

/** New (unsaved) media draft — no persisted id yet. */
export type VariantImageDraft = {
  id: string; // client id, "new-*" until saved
  url: string;
  thumbUrl: string | null;
  mediumUrl: string | null;
  mediaType: MediaType;
  posterUrl: string | null;
};

const isNewImg = (id: string) => id.startsWith("new-");
export const newImgId = () => `new-${Math.random().toString(36).slice(2, 9)}`;

export const IMAGE_EXT = ["jpg", "jpeg", "png", "webp", "avif"];
export const VIDEO_EXT = ["mp4", "webm", "mov"];

/** Best-effort media-type detection from a URL/extension. */
export function detectMediaType(url: string): MediaType {
  const clean = url.split("?")[0].split("#")[0].toLowerCase();
  const ext = clean.slice(clean.lastIndexOf(".") + 1);
  if (VIDEO_EXT.includes(ext)) return "video";
  // Common video hosts / patterns without extensions.
  if (/\.(m3u8|mpd)$/.test(clean) || /video/.test(clean)) return "video";
  return "image";
}

/** First IMAGE url in an ordered gallery (skips videos, uses poster as fallback). */
export function firstImageUrl(images: VariantImageDraft[] | VariantImage[]): string | null {
  for (const m of images) {
    if (m.mediaType === "image") return m.url;
    if (m.posterUrl) return m.posterUrl;
  }
  return null;
}

function rowToVariantImage(r: any): VariantImage {
  const mediaType: MediaType = r.media_type === "video" ? "video" : "image";
  return {
    id: r.id,
    color: r.color,
    url: mediaType === "video" ? r.image_url : resolveImage(r.image_url),
    thumbUrl: r.thumb_url ? resolveImage(r.thumb_url) : null,
    mediumUrl: r.medium_url ? resolveImage(r.medium_url) : null,
    mediaType,
    posterUrl: r.poster_url ? resolveImage(r.poster_url) : null,
    sortOrder: r.sort_order ?? 0,
  };
}

// ---------------------------------------------------------------------------
// Admin reads/writes (base table, staff RLS)
// ---------------------------------------------------------------------------

/** Load every colour's gallery for a product, grouped by colour name. */
export async function fetchAdminColorGalleries(
  slug: string,
): Promise<Record<string, VariantImageDraft[]>> {
  const { data, error } = await supabase
    .from("product_variant_images")
    .select("id,color,image_url,thumb_url,medium_url,media_type,poster_url,sort_order")
    .eq("product_slug", slug)
    .order("sort_order", { ascending: true });
  if (error) throw error;
  const out: Record<string, VariantImageDraft[]> = {};
  for (const r of (data ?? []) as any[]) {
    const img = rowToVariantImage(r);
    (out[img.color] ??= []).push({
      id: img.id,
      url: img.url,
      thumbUrl: img.thumbUrl,
      mediumUrl: img.mediumUrl,
      mediaType: img.mediaType,
      posterUrl: img.posterUrl,
    });
  }
  return out;
}

/** Configurable per-product maximum media count (null = no limit). */
export async function fetchVariantImageMax(slug: string): Promise<number | null> {
  const { data } = await supabase
    .from("products")
    .select("variant_image_max")
    .eq("slug", slug)
    .maybeSingle();
  const v = (data as any)?.variant_image_max;
  return v == null ? null : Number(v);
}

export async function setVariantImageMax(slug: string, max: number | null): Promise<void> {
  const { error } = await supabase
    .from("products")
    .update({ variant_image_max: max, updated_at: new Date().toISOString() })
    .eq("slug", slug);
  if (error) throw error;
}

/**
 * Upload a raw video file to storage and return its public URL. Videos are not
 * transcoded client-side (kept as-is); the browser plays mp4/webm natively and
 * .mov (H.264) plays in most modern browsers.
 */
export async function uploadVariantVideo(
  slug: string,
  file: File,
  onProgress?: (fraction: number) => void,
): Promise<string> {
  const ext = (file.name.split(".").pop() || "mp4").toLowerCase();
  const id = crypto.randomUUID();
  const path = `product-videos/${slug}/${id}.${ext}`;
  // supabase-js upload doesn't expose progress; emit coarse start/end.
  onProgress?.(0.05);
  const { error } = await supabase.storage
    .from(DEFAULT_BUCKET)
    .upload(path, file, { cacheControl: "3600", upsert: true, contentType: file.type || `video/${ext}` });
  if (error) throw error;
  onProgress?.(1);
  const { data } = supabase.storage.from(DEFAULT_BUCKET).getPublicUrl(path);
  return data.publicUrl;
}

/**
 * Persist a single colour's gallery: insert new rows, delete removed rows,
 * and re-sequence sort_order to match the provided order. Then sync the first
 * IMAGE into `product_variants.image_url` for every variant of that colour so
 * cart/checkout/orders show the chosen colour image.
 */
export async function saveColorGallery(
  slug: string,
  color: string,
  images: VariantImageDraft[],
): Promise<void> {
  const { data: existing, error: exErr } = await supabase
    .from("product_variant_images")
    .select("id")
    .eq("product_slug", slug)
    .eq("color", color);
  if (exErr) throw exErr;
  const existingIds = new Set(((existing as any[]) ?? []).map((r) => r.id));
  const keptIds = new Set(images.filter((i) => !isNewImg(i.id)).map((i) => i.id));

  const toDelete = [...existingIds].filter((id) => !keptIds.has(id));
  if (toDelete.length) {
    const { error } = await supabase.from("product_variant_images").delete().in("id", toDelete);
    if (error) throw error;
  }

  // Update kept rows (sort order + editable media fields).
  for (let i = 0; i < images.length; i++) {
    const img = images[i];
    if (isNewImg(img.id)) continue;
    const { error } = await supabase
      .from("product_variant_images")
      .update({
        sort_order: i,
        image_url: img.url,
        thumb_url: img.thumbUrl,
        medium_url: img.mediumUrl,
        media_type: img.mediaType,
        poster_url: img.posterUrl,
        updated_at: new Date().toISOString(),
      })
      .eq("id", img.id);
    if (error) throw error;
  }

  // Insert new rows.
  const inserts = images
    .map((img, i) => ({ img, i }))
    .filter(({ img }) => isNewImg(img.id))
    .map(({ img, i }) => ({
      product_slug: slug,
      color,
      image_url: img.url,
      thumb_url: img.thumbUrl,
      medium_url: img.mediumUrl,
      media_type: img.mediaType,
      poster_url: img.posterUrl,
      sort_order: i,
    }));
  if (inserts.length) {
    const { error } = await supabase.from("product_variant_images").insert(inserts);
    if (error) throw error;
  }

  await syncColorThumbnail(slug, color, firstImageUrl(images));
}

/**
 * Set the colour thumbnail on every variant of that colour. Passing null
 * clears the thumbnail (colour has no images → falls back to default gallery).
 */
export async function syncColorThumbnail(
  slug: string,
  color: string,
  thumbnail: string | null,
): Promise<void> {
  const { error } = await supabase
    .from("product_variants")
    .update({ image_url: thumbnail, updated_at: new Date().toISOString() })
    .eq("product_slug", slug)
    .eq("color", color);
  if (error) throw error;
}

/**
 * Delete an entire colour's gallery (used when a colour is removed in the
 * Variant Builder). Only that colour's media are removed; other colours are
 * untouched. The colour's variant rows are deleted separately by the builder's
 * own save.
 */
export async function deleteColorGallery(slug: string, color: string): Promise<void> {
  const { error } = await supabase
    .from("product_variant_images")
    .delete()
    .eq("product_slug", slug)
    .eq("color", color);
  if (error) throw error;
}

/** Rename a colour's gallery (keeps media attached when admin renames a colour). */
export async function renameColorGallery(
  slug: string,
  oldColor: string,
  newColor: string,
): Promise<void> {
  if (oldColor === newColor) return;
  const { error } = await supabase
    .from("product_variant_images")
    .update({ color: newColor, updated_at: new Date().toISOString() })
    .eq("product_slug", slug)
    .eq("color", oldColor);
  if (error) throw error;
}

/**
 * Re-sync every colour's thumbnail into its variant rows. Call after variants
 * are saved so newly-created variant rows pick up the colour's first image.
 */
export async function resyncColorThumbnails(slug: string): Promise<void> {
  const galleries = await fetchAdminColorGalleries(slug);
  for (const [color, imgs] of Object.entries(galleries)) {
    await syncColorThumbnail(slug, color, firstImageUrl(imgs));
  }
}

// ---------------------------------------------------------------------------
// Public read (storefront)
// ---------------------------------------------------------------------------

/**
 * Storefront: fetch every colour's gallery for a published product, grouped by
 * colour (lowercased key for case-insensitive matching against the selected
 * variant's colour). Returns {} when the product has no colour galleries — the
 * caller then falls back to the product's default gallery.
 */
export async function fetchPublicColorGalleries(
  slug: string,
): Promise<Record<string, VariantImage[]>> {
  const { data } = await supabase
    .from("product_variant_images_public")
    .select("id,color,image_url,thumb_url,medium_url,media_type,poster_url,sort_order")
    .eq("product_slug", slug)
    .order("sort_order", { ascending: true });
  const out: Record<string, VariantImage[]> = {};
  for (const r of (data ?? []) as any[]) {
    const img = rowToVariantImage(r);
    const key = img.color.trim().toLowerCase();
    (out[key] ??= []).push(img);
  }
  return out;
}

// ---------------------------------------------------------------------------
// Variant lifecycle cleanup (delete synchronization)
// ---------------------------------------------------------------------------

/**
 * Parse a Supabase Storage public-object URL into { bucket, path }. Returns
 * null for non-storage URLs (external CDNs, bundled assets) — those are never
 * touched by storage cleanup.
 */
function publicUrlToStoragePath(url: string): { bucket: string; path: string } | null {
  if (typeof url !== "string") return null;
  const marker = "/storage/v1/object/public/";
  const i = url.indexOf(marker);
  if (i === -1) return null;
  const rest = url.slice(i + marker.length).split("?")[0].split("#")[0];
  const slash = rest.indexOf("/");
  if (slash === -1) return null;
  try {
    return { bucket: rest.slice(0, slash), path: decodeURIComponent(rest.slice(slash + 1)) };
  } catch {
    return { bucket: rest.slice(0, slash), path: rest.slice(slash + 1) };
  }
}

/** Parent folder of a storage path (image variants all live in one folder). */
function storageFolderOf(path: string): string {
  const i = path.lastIndexOf("/");
  return i === -1 ? "" : path.slice(0, i);
}

/** A reference key that groups all responsive variants of one asset together. */
function refKey(url: string | null): string | null {
  const p = publicUrlToStoragePath(url ?? "");
  if (!p) return null;
  const folder = storageFolderOf(p.path);
  // Uploaded images live in a per-asset folder (thumb/medium/large/original);
  // key on the folder so all responsive variants share one reference count.
  // Standalone files (videos/posters) have no dedicated folder — key on path.
  return folder ? `${p.bucket}::folder::${folder}` : `${p.bucket}::file::${p.path}`;
}

/** Remove a storage object with a couple of automatic retries. */
async function removeStorageWithRetry(bucket: string, paths: string[]): Promise<void> {
  if (paths.length === 0) return;
  let lastErr: unknown = null;
  for (let attempt = 0; attempt < 3; attempt++) {
    const { error } = await supabase.storage.from(bucket).remove(paths);
    if (!error) return;
    lastErr = error;
    await new Promise((r) => setTimeout(r, 250 * (attempt + 1)));
  }
  // Never throw — a failed storage delete must not roll back the DB cleanup or
  // block the admin. It is logged and can be swept later.
  console.error("[variant-cleanup] storage remove failed", bucket, paths, lastErr);
}

export type GalleryCleanupResult = {
  color: string;
  removedImages: number;
  removedVideos: number;
  freedBytes: number;
};

/**
 * Delete synchronization: remove every colour gallery whose colour no longer
 * exists among the product's variants. Deletes the media rows AND their storage
 * objects (original + responsive variants + video posters), but only when the
 * asset's reference count across ALL galleries and product images drops to
 * zero — media shared/copied to another colour is never deleted. Writes an
 * audit-log entry per removed colour.
 *
 * `keepColors` is the set of colours still present after the variant save.
 */
export async function cleanupOrphanColorGalleries(
  slug: string,
  keepColors: string[],
): Promise<GalleryCleanupResult[]> {
  const keep = new Set(keepColors.map((c) => c.trim().toLowerCase()).filter(Boolean));

  // 1. Orphan gallery rows for this product (colour no longer present).
  const { data: rows, error } = await supabase
    .from("product_variant_images")
    .select("id,color,image_url,poster_url,media_type")
    .eq("product_slug", slug);
  if (error) throw error;
  const orphans = ((rows ?? []) as any[]).filter(
    (r) => !keep.has(String(r.color ?? "").trim().toLowerCase()),
  );
  if (orphans.length === 0) return [];

  const orphanIds = new Set(orphans.map((r) => r.id));

  // 2. Build reference keys still used by everything we KEEP (other galleries
  //    across every product + every product image). Safe-delete guard.
  const keptRefs = new Set<string>();
  const [{ data: remainImgs }, { data: prodImgs }] = await Promise.all([
    supabase.from("product_variant_images").select("id,image_url,poster_url"),
    supabase.from("product_images").select("url"),
  ]);
  for (const r of (remainImgs ?? []) as any[]) {
    if (orphanIds.has(r.id)) continue;
    for (const k of [refKey(r.image_url), refKey(r.poster_url)]) if (k) keptRefs.add(k);
  }
  for (const r of (prodImgs ?? []) as any[]) {
    const k = refKey(r.url);
    if (k) keptRefs.add(k);
  }

  // 3. Compute per-colour audit tallies + collect storage objects to remove.
  const perColor = new Map<string, GalleryCleanupResult>();
  // bucket -> set of object paths to remove
  const toRemove = new Map<string, Set<string>>();
  const queueRemoval = (bucket: string, path: string) => {
    (toRemove.get(bucket) ?? toRemove.set(bucket, new Set()).get(bucket)!).add(path);
  };
  // Cache folder listings so we only list each folder once.
  const folderCache = new Map<string, { path: string; size: number }[]>();

  for (const r of orphans) {
    const color = String(r.color ?? "");
    const tally =
      perColor.get(color) ??
      perColor.set(color, { color, removedImages: 0, removedVideos: 0, freedBytes: 0 }).get(color)!;
    if (r.media_type === "video") tally.removedVideos++;
    else tally.removedImages++;

    for (const url of [r.image_url, r.poster_url]) {
      const key = refKey(url);
      if (!key || keptRefs.has(key)) continue; // still referenced → keep file
      const parsed = publicUrlToStoragePath(url ?? "");
      if (!parsed) continue;
      const folder = storageFolderOf(parsed.path);
      if (folder) {
        // Image asset folder: list & remove every responsive variant once.
        if (!folderCache.has(`${parsed.bucket}::${folder}`)) {
          const { data: listing } = await supabase.storage.from(parsed.bucket).list(folder);
          const files = (listing ?? []).map((f: any) => ({
            path: `${folder}/${f.name}`,
            size: Number(f.metadata?.size ?? 0),
          }));
          folderCache.set(`${parsed.bucket}::${folder}`, files);
          for (const f of files) {
            queueRemoval(parsed.bucket, f.path);
            tally.freedBytes += f.size;
          }
        }
      } else {
        // Standalone object (e.g. video / poster).
        queueRemoval(parsed.bucket, parsed.path);
      }
      keptRefs.add(key); // don't double-count if two orphan rows share the asset
    }
  }

  // 4. Delete DB rows FIRST (commit), then storage (so we never leave a live
  //    row pointing at a deleted file). Storage failures are retried + logged.
  const { error: delErr } = await supabase
    .from("product_variant_images")
    .delete()
    .in("id", [...orphanIds]);
  if (delErr) throw delErr;

  for (const [bucket, paths] of toRemove) {
    await removeStorageWithRetry(bucket, [...paths]);
  }

  // 5. Audit log — one entry per removed colour.
  const { data: authData } = await supabase.auth.getUser();
  const actorId = authData?.user?.id ?? null;
  const results = [...perColor.values()];
  const auditRows = results.map((res) => ({
    action: "variant_color_delete",
    entity_type: "product",
    entity_ref: slug,
    actor_id: actorId,
    meta: {
      color: res.color,
      images_removed: res.removedImages,
      videos_removed: res.removedVideos,
      storage_freed_bytes: res.freedBytes,
      storage_freed_mb: Math.round((res.freedBytes / (1024 * 1024)) * 100) / 100,
    },
  }));
  if (auditRows.length) {
    await supabase.from("media_audit_logs").insert(auditRows);
  }

  return results;
}

// ---------------------------------------------------------------------------
// Variant-driven product card image (default variant cover)
// ---------------------------------------------------------------------------

/**
 * Resolve the ordered list of ACTIVE colours for a product (variant sort order,
 * de-duplicated, case preserved from the first occurrence).
 */
async function activeColorOrder(slug: string): Promise<string[]> {
  const { fetchAdminVariants } = await import("@/lib/product-variants");
  const variants = await fetchAdminVariants(slug);
  const seen = new Set<string>();
  const out: string[] = [];
  for (const v of variants) {
    if (v.active === false) continue;
    const c = (v.color ?? "").trim();
    if (!c) continue;
    const key = c.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(c);
  }
  return out;
}

/**
 * Sync the product's storefront card image to the DEFAULT variant's cover.
 *
 * Rules:
 *  - When variants are ON and at least one colour has media, `products.image`
 *    becomes the cover (first IMAGE) of the default colour. Default priority:
 *      1. admin-selected `default_variant_color`
 *      2. first active colour (by variant sort order)
 *      3. any colour that has media
 *    The colour must actually have media; if the top-priority colour has no
 *    media we fall through to the next colour that does. If NO colour has media
 *    the original image is kept/restored.
 *  - The ORIGINAL image is preserved in `products.base_image` (backed up once)
 *    so it is never lost.
 *  - When variants are OFF, or no colour has media, `products.image` is
 *    restored from `base_image` and the backup is cleared.
 *
 * Only the image-source selection changes — cart/checkout/orders are untouched.
 */
export async function syncProductCardImage(slug: string): Promise<void> {
  const { data: prod } = await supabase
    .from("products")
    .select("image,base_image,has_variants,default_variant_color")
    .eq("slug", slug)
    .maybeSingle();
  if (!prod) return;
  const p = prod as {
    image: string | null;
    base_image: string | null;
    has_variants: boolean | null;
    default_variant_color: string | null;
  };

  const revert = async () => {
    // Restore the original card image (if we backed one up) and clear backup.
    if (p.base_image) {
      await supabase
        .from("products")
        .update({ image: p.base_image, base_image: null, updated_at: new Date().toISOString() })
        .eq("slug", slug);
    }
  };

  if (!p.has_variants) {
    await revert();
    return;
  }

  const galleries = await fetchAdminColorGalleries(slug);
  const galleryKeys = Object.keys(galleries);
  if (galleryKeys.length === 0) {
    await revert();
    return;
  }

  // Build the colour priority order.
  const colours = await activeColorOrder(slug);
  const order: string[] = [];
  const push = (c: string | null | undefined) => {
    const t = (c ?? "").trim();
    if (t && !order.some((x) => x.toLowerCase() === t.toLowerCase())) order.push(t);
  };
  push(p.default_variant_color);
  colours.forEach(push);
  galleryKeys.forEach(push); // any remaining colours that have galleries

  // Find the first colour in priority order that has a usable cover IMAGE.
  let cover: string | null = null;
  for (const c of order) {
    const key = Object.keys(galleries).find((g) => g.trim().toLowerCase() === c.trim().toLowerCase());
    if (!key) continue;
    const url = firstImageUrl(galleries[key]);
    if (url) {
      cover = url;
      break;
    }
  }

  if (!cover) {
    // Variants on but no colour has any image → fall back to original.
    await revert();
    return;
  }

  // Back up the original card image once, then point the card at the cover.
  const baseImage = p.base_image ?? p.image ?? null;
  if (cover !== p.image || p.base_image !== baseImage) {
    await supabase
      .from("products")
      .update({ image: cover, base_image: baseImage, updated_at: new Date().toISOString() })
      .eq("slug", slug);
  }
}

/** Persist the admin-selected default variant colour for a product. */
export async function setDefaultVariantColor(slug: string, color: string | null): Promise<void> {
  const { error } = await supabase
    .from("products")
    .update({ default_variant_color: color?.trim() || null, updated_at: new Date().toISOString() })
    .eq("slug", slug);
  if (error) throw error;
}

/** Read the admin-selected default variant colour for a product. */
export async function fetchDefaultVariantColor(slug: string): Promise<string | null> {
  const { data } = await supabase
    .from("products")
    .select("default_variant_color")
    .eq("slug", slug)
    .maybeSingle();
  return ((data as any)?.default_variant_color as string | null) ?? null;
}
