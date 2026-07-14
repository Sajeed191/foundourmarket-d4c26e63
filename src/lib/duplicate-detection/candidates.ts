/**
 * Candidate index + prefilter for duplicate detection.
 *
 * Reads a lean detection projection from the base `products` table (admins
 * have RLS access) once, caches it in-memory, and exposes a fast prefilter so
 * the O(n^2) scorer only ever runs against a small candidate set — this keeps
 * detection viable for 100k+ catalogs without scanning everything per keystroke.
 */
import { supabase } from "@/integrations/supabase/client";
import type { DetectionProduct, DraftProduct } from "./types";
import { normalizeCode, tokenize, normalizeText, normalizeSku } from "./normalize";

const DETECTION_COLS =
  "id,slug,name,brand,category,categories,sku,barcode,image,image_phash,description,specifications,attributes,price_inr,price_usd,rating,reviews,sold_count,orders_count,status,stock_quantity,created_at";

type Row = Record<string, unknown>;

function rowToDetection(r: Row, variantCount: number): DetectionProduct {
  return {
    id: (r.id as string) ?? null,
    slug: (r.slug as string) ?? "",
    name: (r.name as string) ?? "",
    brand: (r.brand as string) ?? null,
    category: (r.category as string) ?? null,
    categories: (r.categories as string[]) ?? [],
    sku: (r.sku as string) ?? null,
    barcode: (r.barcode as string) ?? null,
    ean: null,
    image: (r.image as string) ?? null,
    imagePhash: (r.image_phash as string) ?? null,
    description: (r.description as string) ?? null,
    specifications: (r.specifications as Record<string, string>) ?? {},
    attributes: (r.attributes as Record<string, string>) ?? {},
    priceInr: r.price_inr != null ? Number(r.price_inr) : null,
    priceUsd: r.price_usd != null ? Number(r.price_usd) : null,
    rating: r.rating != null ? Number(r.rating) : 0,
    reviews: (r.reviews as number) ?? 0,
    soldCount: (r.sold_count as number) ?? 0,
    ordersCount: (r.orders_count as number) ?? 0,
    status: (r.status as string) ?? "draft",
    stockQuantity: (r.stock_quantity as number) ?? 0,
    variantCount,
    createdAt: (r.created_at as string) ?? "",
  };
}

let cache: DetectionProduct[] | null = null;
let loadedAt = 0;
let inflight: Promise<DetectionProduct[]> | null = null;
const TTL = 60_000;

async function fetchVariantCounts(): Promise<Map<string, number>> {
  const counts = new Map<string, number>();
  const { data } = await supabase.from("product_variants").select("product_slug");
  for (const r of (data as Row[]) ?? []) {
    const slug = r.product_slug as string;
    if (slug) counts.set(slug, (counts.get(slug) ?? 0) + 1);
  }
  return counts;
}

/** Load (and cache) the full detection index. Admin-only via RLS. */
export async function loadDetectionIndex(force = false): Promise<DetectionProduct[]> {
  const now = Date.now();
  if (!force && cache && now - loadedAt < TTL) return cache;
  if (inflight) return inflight;
  inflight = (async () => {
    const [{ data }, variantCounts] = await Promise.all([
      supabase.from("products").select(DETECTION_COLS).limit(100000),
      fetchVariantCounts(),
    ]);
    const rows = (data as Row[]) ?? [];
    cache = rows.map((r) => rowToDetection(r, variantCounts.get(r.slug as string) ?? 0));
    loadedAt = Date.now();
    inflight = null;
    return cache;
  })();
  return inflight;
}

/** Invalidate the cached index (call after create/merge). */
export function invalidateDetectionIndex() {
  cache = null;
  loadedAt = 0;
}

/**
 * Prefilter: return only candidates that share a strong signal with the draft
 * (barcode, brand, category, a meaningful title token, or SKU). Excludes the
 * product being edited. Keeps the scorer's work bounded.
 */
export function selectCandidates(
  draft: DraftProduct,
  index: DetectionProduct[],
): DetectionProduct[] {
  const draftCode = normalizeCode(draft.barcode) || normalizeCode(draft.ean);
  const draftBrand = normalizeText(draft.brand);
  const draftCats = new Set(
    [draft.category, ...(draft.categories ?? [])].filter(Boolean).map((c) => normalizeText(c as string)),
  );
  const draftTokens = new Set(tokenize(draft.name));
  const draftSku = normalizeSku(draft.sku);
  const editingSlug = draft.slug ?? "";

  const out: DetectionProduct[] = [];
  for (const p of index) {
    if (editingSlug && p.slug === editingSlug) continue;
    // Exact barcode is always a candidate.
    const code = normalizeCode(p.barcode) || normalizeCode(p.ean);
    if (draftCode && code && draftCode === code) {
      out.push(p);
      continue;
    }
    let hit = false;
    if (draftBrand && normalizeText(p.brand) === draftBrand) hit = true;
    if (!hit && draftSku && normalizeSku(p.sku) === draftSku) hit = true;
    if (!hit && draftCats.size) {
      const cats = [p.category, ...(p.categories ?? [])].filter(Boolean).map((c) => normalizeText(c as string));
      if (cats.some((c) => draftCats.has(c))) hit = true;
    }
    if (!hit && draftTokens.size) {
      const pt = tokenize(p.name);
      let shared = 0;
      for (const t of pt) if (draftTokens.has(t)) shared++;
      if (shared >= Math.min(2, draftTokens.size)) hit = true;
    }
    if (hit) out.push(p);
  }
  return out;
}
