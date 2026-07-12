import { supabase } from "@/integrations/supabase/client";
import { resolveImage } from "@/lib/products";

/**
 * Variant Media Gallery — per-COLOUR image galleries.
 *
 * A gallery is keyed by (product_slug, color). Every size variant of a colour
 * shares the same images, so picking "Blue" shows the Blue gallery regardless
 * of size. The FIRST image of each colour is the colour thumbnail and is synced
 * into `product_variants.image_url` for every variant of that colour, so the
 * existing cart / checkout / order-snapshot pipeline (which reads
 * `variant.image_url`) keeps working with zero changes.
 *
 * Products without colour galleries fall back to the product's default gallery
 * on the storefront — this module never returns a broken/empty gallery.
 */

export type VariantImage = {
  id: string;
  color: string;
  url: string;
  thumbUrl: string | null;
  mediumUrl: string | null;
  sortOrder: number;
};

/** New (unsaved) image draft — no persisted id yet. */
export type VariantImageDraft = {
  id: string; // client id, "new-*" until saved
  url: string;
  thumbUrl: string | null;
  mediumUrl: string | null;
};

const isNewImg = (id: string) => id.startsWith("new-");
export const newImgId = () => `new-${Math.random().toString(36).slice(2, 9)}`;

function rowToVariantImage(r: any): VariantImage {
  return {
    id: r.id,
    color: r.color,
    url: resolveImage(r.image_url),
    thumbUrl: r.thumb_url ? resolveImage(r.thumb_url) : null,
    mediumUrl: r.medium_url ? resolveImage(r.medium_url) : null,
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
    .select("id,color,image_url,thumb_url,medium_url,sort_order")
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
    });
  }
  return out;
}

/** Configurable per-product maximum image count (null = no limit). */
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
 * Persist a single colour's gallery: insert new rows, delete removed rows,
 * and re-sequence sort_order to match the provided order. Then sync the first
 * image into `product_variants.image_url` for every variant of that colour so
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

  // Update sort_order for kept rows.
  for (let i = 0; i < images.length; i++) {
    const img = images[i];
    if (isNewImg(img.id)) continue;
    const { error } = await supabase
      .from("product_variant_images")
      .update({ sort_order: i, updated_at: new Date().toISOString() })
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
      sort_order: i,
    }));
  if (inserts.length) {
    const { error } = await supabase.from("product_variant_images").insert(inserts);
    if (error) throw error;
  }

  await syncColorThumbnail(slug, color, images[0]?.url ?? null);
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
 * Variant Builder). Only that colour's images are removed; other colours are
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

/** Rename a colour's gallery (keeps images attached when admin renames a colour). */
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
    await syncColorThumbnail(slug, color, imgs[0]?.url ?? null);
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
    .select("id,color,image_url,thumb_url,medium_url,sort_order")
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
