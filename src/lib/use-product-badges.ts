import { useEffect, useMemo, useState, useSyncExternalStore } from "react";
import { supabase } from "@/integrations/supabase/client";

export type AutoRule = {
  metric: "sales" | "age_days" | "stock" | "conversion" | "rating" | "views";
  op: ">" | "<" | ">=" | "<=";
  value: number;
  enabled: boolean;
} | null;

export type BadgeAnimation =
  | "none" | "pulse" | "bounce" | "shine" | "glow" | "float" | "slide" | "flash";

export const BADGE_ANIMATIONS: BadgeAnimation[] = [
  "none", "pulse", "bounce", "shine", "glow", "float", "slide", "flash",
];

export const BADGE_CATEGORIES = [
  "Sales", "Trending", "Inventory", "Premium", "Seasonal", "Trust", "Marketing", "Custom",
] as const;

/** Maps a badge animation to its CSS utility class (defined in styles.css). */
export function badgeAnimationClass(a: BadgeAnimation | string | undefined): string {
  switch (a) {
    case "pulse": return "badge-anim-pulse";
    case "bounce": return "badge-anim-bounce";
    case "shine": return "badge-anim-shine";
    case "glow": return "badge-anim-glow";
    case "float": return "badge-anim-float";
    case "slide": return "badge-anim-slide";
    case "flash": return "badge-anim-flash";
    default: return "";
  }
}

export type BadgeType = {
  id: string;
  badgeKey: string;
  label: string;
  color: string;
  textColor: string;
  emoji: string;
  enabled: boolean;
  priority: number;
  isDiscount: boolean;
  description: string;
  backgroundColor: string;
  borderColor: string;
  glowColor: string;
  iconColor: string;
  shadowStrength: number;
  radius: number;
  startAt: string | null;
  endAt: string | null;
  autoRule: AutoRule;
  category: string;
  subtitle: string;
  fontSize: number;
  fontWeight: number;
  animation: BadgeAnimation;
  archived: boolean;
  createdAt: string;
  updatedAt: string;
};

export type RenderBadge = BadgeType & {
  sortOrder: number;
  /** Per-assignment fields (override badge-type defaults on a single product). */
  assignmentId?: string;
  assignNotes?: string;
  assignStartAt?: string | null;
  assignEndAt?: string | null;
  assignArchived?: boolean;
};

type BadgeTypeRow = {
  id: string;
  badge_key: string;
  label: string;
  color: string;
  text_color: string;
  emoji: string;
  enabled: boolean;
  priority: number;
  is_discount: boolean;
  description?: string | null;
  background_color?: string | null;
  border_color?: string | null;
  glow_color?: string | null;
  icon_color?: string | null;
  shadow_strength?: number | null;
  radius?: number | null;
  start_at?: string | null;
  end_at?: string | null;
  auto_rule?: AutoRule;
  category?: string | null;
  subtitle?: string | null;
  font_size?: number | null;
  font_weight?: number | null;
  animation?: string | null;
  archived?: boolean | null;
  created_at?: string;
  updated_at?: string;
};

type AssignmentRow = {
  id?: string;
  product_slug: string;
  sort_order: number;
  badge_type_id: string;
  notes?: string | null;
  start_at?: string | null;
  end_at?: string | null;
  archived?: boolean | null;
};

function rowToType(r: BadgeTypeRow): BadgeType {
  return {
    id: r.id,
    badgeKey: r.badge_key,
    label: r.label,
    color: r.color,
    textColor: r.text_color,
    emoji: r.emoji ?? "",
    enabled: r.enabled,
    priority: r.priority,
    isDiscount: r.is_discount,
    description: r.description ?? "",
    backgroundColor: r.background_color || r.color,
    borderColor: r.border_color ?? "",
    glowColor: r.glow_color ?? "",
    iconColor: r.icon_color ?? "",
    shadowStrength: r.shadow_strength ?? 0,
    radius: r.radius ?? 6,
    startAt: r.start_at ?? null,
    endAt: r.end_at ?? null,
    autoRule: (r.auto_rule as AutoRule) ?? null,
    category: r.category ?? "Custom",
    subtitle: r.subtitle ?? "",
    fontSize: r.font_size ?? 11,
    fontWeight: r.font_weight ?? 700,
    animation: (r.animation as BadgeAnimation) ?? "none",
    archived: r.archived ?? false,
    createdAt: r.created_at ?? "",
    updatedAt: r.updated_at ?? "",
  };
}

/** A scheduled badge is live only inside its [startAt, endAt] window. */
export function isBadgeLive(b: BadgeType, now = Date.now()): boolean {
  if (!b.enabled) return false;
  if (b.startAt && new Date(b.startAt).getTime() > now) return false;
  if (b.endAt && new Date(b.endAt).getTime() < now) return false;
  return true;
}

export function badgeScheduleState(b: BadgeType, now = Date.now()): "scheduled" | "expired" | "live" | "disabled" {
  if (!b.enabled) return "disabled";
  if (b.startAt && new Date(b.startAt).getTime() > now) return "scheduled";
  if (b.endAt && new Date(b.endAt).getTime() < now) return "expired";
  return "live";
}

// ---- module-level cache + pub/sub so the whole grid shares one fetch ----
type Snapshot = {
  types: BadgeType[];
  map: Map<string, RenderBadge[]>;
  /**
   * Featured Editorial Override — per-slug set of promotional collections a
   * product is allowed to appear in. Enforces the "one promotional badge per
   * product" rule at read time even when legacy data has multiple. Featured
   * is NOT a promotional collection and is checked separately via badges.
   */
  resolvedPromoBySlug: Map<string, Set<PromoCollection>>;
};
const EMPTY_BADGES: RenderBadge[] = [];
const EMPTY_SNAPSHOT: Snapshot = { types: [], map: new Map(), resolvedPromoBySlug: new Map() };
let cache: Snapshot | null = null;
let inflight: Promise<Snapshot> | null = null;
const subscribers = new Set<() => void>();
let realtimeBound = false;

/** Featured Editorial Override — resolver configuration (set from Site Rules). */
export type PromoResolverConfig = { allowMultiForFeatured: boolean };
let resolverConfig: PromoResolverConfig = { allowMultiForFeatured: false };
export function setPromoResolverConfig(next: PromoResolverConfig): void {
  if (resolverConfig.allowMultiForFeatured === next.allowMultiForFeatured) return;
  resolverConfig = next;
  if (cache) {
    cache = { ...cache, resolvedPromoBySlug: resolvePromoCollections(cache.map) };
    subscribers.forEach((fn) => fn());
  }
}

function subscribeBadges(listener: () => void) {
  subscribers.add(listener);
  return () => subscribers.delete(listener);
}

function bindRealtime() {
  if (realtimeBound || typeof window === "undefined") return;
  realtimeBound = true;
  supabase
    .channel("rt-product-badges")
    .on("postgres_changes", { event: "*", schema: "public", table: "badge_types" }, () => load(true))
    .on("postgres_changes", { event: "*", schema: "public", table: "product_badges" }, () => load(true))
    .subscribe();
}

async function load(force = false): Promise<Snapshot> {
  if (cache && !force) return cache;
  if (!inflight || force) {
    inflight = (async () => {
      const [{ data: typeRows }, { data: assignRows }] = await Promise.all([
        supabase.from("badge_types").select("*").order("priority", { ascending: false }),
        supabase.from("product_badges").select("*"),
      ]);
      const types = (typeRows ?? []).map((r) => rowToType(r as BadgeTypeRow));
      const typeById = new Map(types.map((t) => [t.id, t]));
      const map = new Map<string, RenderBadge[]>();
      for (const a of (assignRows ?? []) as AssignmentRow[]) {
        const t = typeById.get(a.badge_type_id);
        if (!t) continue;
        const list = map.get(a.product_slug) ?? [];
        list.push({
          ...t,
          sortOrder: a.sort_order,
          assignmentId: a.id,
          assignNotes: a.notes ?? "",
          assignStartAt: a.start_at ?? null,
          assignEndAt: a.end_at ?? null,
          assignArchived: a.archived ?? false,
        });
        map.set(a.product_slug, list);
      }
      // Sort each product's badges by sortOrder then priority desc.
      for (const [, list] of map) {
        list.sort((x, y) => x.sortOrder - y.sortOrder || y.priority - x.priority);
      }
      const snap: Snapshot = { types, map, resolvedPromoBySlug: resolvePromoCollections(map) };
      cache = snap;
      inflight = null;
      subscribers.forEach((fn) => fn());
      return snap;
    })();
  }
  return inflight;
}

/** Returns live, scheduled-aware badges for a single product slug (storefront cards). */
export function useProductBadges(slug: string): RenderBadge[] {
  useEffect(() => {
    bindRealtime();
    void load();
  }, []);
  const list = useSyncExternalStore(
    subscribeBadges,
    () => cache?.map.get(slug) ?? EMPTY_BADGES,
    () => EMPTY_BADGES,
  );
  return useMemo(() => {
    const now = Date.now();
    return list.filter((b) => {
      if (b.assignArchived) return false;
      if (b.assignStartAt && new Date(b.assignStartAt).getTime() > now) return false;
      if (b.assignEndAt && new Date(b.assignEndAt).getTime() < now) return false;
      return isBadgeLive(b, now);
    });
  }, [list]);
}

/** Full badge catalog + per-product assignment map (admin tooling). */
export function useBadgeCatalog() {
  const snap = useSyncExternalStore(
    subscribeBadges,
    () => cache ?? EMPTY_SNAPSHOT,
    () => EMPTY_SNAPSHOT,
  );
  const [loading, setLoading] = useState(!cache);
  useEffect(() => {
    bindRealtime();
    load().then(() => {
      setLoading(false);
    });
  }, []);
  return { ...snap, loading };
}

const normalizeBadgeToken = (value: string): string =>
  value.trim().toLowerCase().replace(/&/g, "and").replace(/[^a-z0-9]+/g, "_").replace(/^_+|_+$/g, "");

const BADGE_ALIASES: Record<string, string[]> = {
  flash_deal: ["flash_deal", "flash_sale", "flash", "limited_offer", "limited_offers"],
  hot_deal: ["hot_deal", "hot", "deal"],
  trending: ["trending", "trend", "popular_this_week"],
  new: ["new", "new_arrival", "new_arrivals", "just_released"],
  bestseller: ["bestseller", "best_seller", "best_sellers", "customer_favorite", "customer_favorites"],
  featured: ["featured", "featured_collection", "featured_collections", "featured_product", "featured_products"],
};

/**
 * True when a storefront badge assignment is live for presentation/collection
 * filtering. This mirrors useProductBadges() without needing one hook per card.
 */
export function isRenderBadgeLive(b: RenderBadge, now = Date.now()): boolean {
  if (b.assignArchived) return false;
  if (b.assignStartAt && new Date(b.assignStartAt).getTime() > now) return false;
  if (b.assignEndAt && new Date(b.assignEndAt).getTime() < now) return false;
  return isBadgeLive(b, now);
}

/**
 * Homepage collection membership is driven ONLY by assigned product badges.
 * Legacy product flags (trending/new_arrival/bestseller/featured/etc.) are not
 * considered here, so empty badge assignments produce empty curated sections.
 */
export function hasAssignedCollectionBadge(
  badges: readonly RenderBadge[] | undefined,
  keys: readonly string[],
  now = Date.now(),
): boolean {
  if (!badges?.length) return false;
  const allowed = new Set(
    keys.flatMap((key) => BADGE_ALIASES[normalizeBadgeToken(key)] ?? [key]).map(normalizeBadgeToken),
  );
  return badges.some((b) => {
    if (!isRenderBadgeLive(b, now)) return false;
    const key = normalizeBadgeToken(b.badgeKey || "");
    const label = normalizeBadgeToken(b.label || "");
    return allowed.has(key) || allowed.has(label);
  });
}

// ============================================================================
// Featured Editorial Override — promotional collection resolver
// ============================================================================

/**
 * A promotional homepage collection. `featured` is intentionally NOT a promo
 * collection — it is an editorial overlay that can coexist with exactly one
 * promo. Every promotional badge maps to exactly one collection.
 */
export type PromoCollection = "flash_deals" | "trending" | "bestseller" | "new_arrivals";

/** Tie-break order when a product qualifies for multiple promo collections. */
const PROMO_COLLECTION_PRIORITY: readonly PromoCollection[] = [
  "flash_deals",
  "trending",
  "bestseller",
  "new_arrivals",
];

/** Canonical promo badge key → promotional collection. */
const PROMO_BADGE_TO_COLLECTION: Record<string, PromoCollection> = {
  flash_deal: "flash_deals",
  hot_deal: "flash_deals",
  trending: "trending",
  bestseller: "bestseller",
  new: "new_arrivals",
};

function promoCollectionForBadge(b: RenderBadge): PromoCollection | null {
  const canonical = normalizePromoKey(b.badgeKey, b.label);
  return canonical ? PROMO_BADGE_TO_COLLECTION[canonical] ?? null : null;
}

function isFeaturedBadge(b: RenderBadge): boolean {
  const set = new Set(BADGE_ALIASES.featured.map(normalizeBadgeToken));
  return (
    set.has(normalizeBadgeToken(b.badgeKey || "")) ||
    set.has(normalizeBadgeToken(b.label || ""))
  );
}

/**
 * Resolves each product's allowed promotional collections. When a product
 * qualifies for multiple promo collections we pick exactly one using a
 * load-balancing algorithm (fewest-eligible first, ties broken by
 * PROMO_COLLECTION_PRIORITY). When `allowMultiForFeatured` is on, Featured
 * products keep all their promo collections.
 */
function resolvePromoCollections(
  map: Map<string, RenderBadge[]>,
  now = Date.now(),
): Map<string, Set<PromoCollection>> {
  const productCollections = new Map<string, Set<PromoCollection>>();
  const featuredSlugs = new Set<string>();
  for (const [slug, list] of map) {
    const cols = new Set<PromoCollection>();
    for (const b of list) {
      if (!isRenderBadgeLive(b, now)) continue;
      if (isFeaturedBadge(b)) featuredSlugs.add(slug);
      const col = promoCollectionForBadge(b);
      if (col) cols.add(col);
    }
    if (cols.size > 0) productCollections.set(slug, cols);
  }

  const resolved = new Map<string, Set<PromoCollection>>();
  const counts: Record<PromoCollection, number> = {
    flash_deals: 0, trending: 0, bestseller: 0, new_arrivals: 0,
  };
  const ambiguous: string[] = [];

  // Pass 1: singletons and (optionally) featured-with-multi-promos passthrough.
  for (const [slug, cols] of productCollections) {
    const multiFeaturedPass = resolverConfig.allowMultiForFeatured && featuredSlugs.has(slug);
    if (cols.size === 1 || multiFeaturedPass) {
      resolved.set(slug, cols);
      for (const c of cols) counts[c]++;
      continue;
    }
    ambiguous.push(slug);
  }

  // Pass 2: balance ambiguous products, deterministic slug order.
  ambiguous.sort();
  for (const slug of ambiguous) {
    const cols = productCollections.get(slug)!;
    let best: PromoCollection | null = null;
    for (const c of PROMO_COLLECTION_PRIORITY) {
      if (!cols.has(c)) continue;
      if (best === null || counts[c] < counts[best]) best = c;
    }
    if (best) {
      resolved.set(slug, new Set([best]));
      counts[best]++;
    }
  }
  return resolved;
}

/**
 * Test-only export of the resolver for regression coverage.
 * @internal
 */
export const __resolvePromoCollectionsForTests = resolvePromoCollections;

/**
 * Homepage collection membership check — the canonical helper for every
 * homepage rail. Enforces "Featured Editorial Override": promotional
 * collections respect the single-promo resolver, Featured is checked as a
 * live editorial badge that can coexist with the product's resolved promo.
 */
export function productInHomepageCollection(
  slug: string,
  badges: readonly RenderBadge[] | undefined,
  keys: readonly string[],
  now = Date.now(),
): boolean {
  const wantedCollections = new Set<PromoCollection>();
  let wantsFeatured = false;
  for (const k of keys) {
    const norm = normalizeBadgeToken(k);
    if (norm === "featured" || (BADGE_ALIASES.featured ?? []).some((a) => normalizeBadgeToken(a) === norm)) {
      wantsFeatured = true;
      continue;
    }
    const canonical = normalizePromoKey(k, k);
    if (canonical && PROMO_BADGE_TO_COLLECTION[canonical]) {
      wantedCollections.add(PROMO_BADGE_TO_COLLECTION[canonical]);
    }
  }
  if (wantsFeatured && hasAssignedCollectionBadge(badges, ["featured"], now)) return true;
  if (wantedCollections.size === 0) return false;
  const resolved = cache?.resolvedPromoBySlug.get(slug);
  if (!resolved) return false;
  for (const c of wantedCollections) if (resolved.has(c)) return true;
  return false;
}


export async function refreshBadges() {
  await load(true);
}

// ---- Badge type CRUD (RLS enforces staff-only) ----
export type BadgeTypeInput = {
  badgeKey: string;
  label: string;
  emoji: string;
  color: string;
  textColor: string;
  backgroundColor: string;
  borderColor: string;
  glowColor: string;
  iconColor: string;
  shadowStrength: number;
  radius: number;
  priority: number;
  description: string;
  enabled: boolean;
  isDiscount: boolean;
  startAt: string | null;
  endAt: string | null;
  autoRule: AutoRule;
  category: string;
  subtitle: string;
  fontSize: number;
  fontWeight: number;
  animation: BadgeAnimation;
};

function inputToRow(input: BadgeTypeInput) {
  return {
    badge_key: input.badgeKey,
    label: input.label,
    emoji: input.emoji,
    color: input.color,
    text_color: input.textColor,
    background_color: input.backgroundColor,
    border_color: input.borderColor,
    glow_color: input.glowColor,
    icon_color: input.iconColor,
    shadow_strength: input.shadowStrength,
    radius: input.radius,
    priority: input.priority,
    description: input.description,
    enabled: input.enabled,
    is_discount: input.isDiscount,
    start_at: input.startAt,
    end_at: input.endAt,
    auto_rule: input.autoRule,
    category: input.category,
    subtitle: input.subtitle,
    font_size: input.fontSize,
    font_weight: input.fontWeight,
    animation: input.animation,
  };
}

export async function createBadgeType(input: BadgeTypeInput) {
  const { error } = await supabase.from("badge_types").insert(inputToRow(input) as never);
  if (error) throw new Error(error.message);
  await load(true);
}

export async function updateBadgeTypeFull(id: string, input: BadgeTypeInput) {
  const { error } = await supabase.from("badge_types").update(inputToRow(input) as never).eq("id", id);
  if (error) throw new Error(error.message);
  await load(true);
}

export async function deleteBadgeType(id: string) {
  const { error } = await supabase.from("badge_types").delete().eq("id", id);
  if (error) throw new Error(error.message);
  await load(true);
}

export async function setBadgeEnabled(id: string, enabled: boolean) {
  const { error } = await supabase.from("badge_types").update({ enabled } as never).eq("id", id);
  if (error) throw new Error(error.message);
  await load(true);
}

export async function reorderBadgeTypes(orderedIds: string[]) {
  // Highest priority first → assign descending priority numbers.
  const n = orderedIds.length;
  await Promise.all(
    orderedIds.map((id, i) =>
      supabase.from("badge_types").update({ priority: (n - i) * 5 } as never).eq("id", id),
    ),
  );
  await load(true);
}

export async function duplicateBadgeType(b: BadgeType) {
  const base = b.badgeKey.replace(/-copy(-\d+)?$/, "");
  const input: BadgeTypeInput = {
    badgeKey: `${base}-copy-${Math.random().toString(36).slice(2, 6)}`,
    label: `${b.label} (Copy)`,
    emoji: b.emoji,
    color: b.color,
    textColor: b.textColor,
    backgroundColor: b.backgroundColor,
    borderColor: b.borderColor,
    glowColor: b.glowColor,
    iconColor: b.iconColor,
    shadowStrength: b.shadowStrength,
    radius: b.radius,
    priority: b.priority,
    description: b.description,
    enabled: false,
    isDiscount: b.isDiscount,
    startAt: b.startAt,
    endAt: b.endAt,
    autoRule: b.autoRule,
    category: b.category,
    subtitle: b.subtitle,
    fontSize: b.fontSize,
    fontWeight: b.fontWeight,
    animation: b.animation,
  };
  await createBadgeType(input);
}

export async function setBadgeArchived(id: string, archived: boolean) {
  const { error } = await supabase.from("badge_types").update({ archived } as never).eq("id", id);
  if (error) throw new Error(error.message);
  await load(true);
}

// ---- Admin assignment mutations ----

/**
 * Promotional badge keys — a product may hold at most ONE of these at a time
 * (single-badge policy). Enforced centrally in `assignBadge` so every admin
 * surface (bulk tools, product editor, merchandising, badge manager) inherits
 * the guarantee without duplicating logic.
 */
const PROMO_BADGE_KEYS = new Set([
  "flash_deal",
  "hot_deal",
  "trending",
  "bestseller",
  "new",
  "featured",
]);

function normalizePromoKey(badgeKey: string, label: string): string | null {
  const k = normalizeBadgeToken(badgeKey);
  if (PROMO_BADGE_KEYS.has(k)) return k;
  for (const [canonical, aliases] of Object.entries(BADGE_ALIASES)) {
    if (!PROMO_BADGE_KEYS.has(canonical)) continue;
    const set = new Set(aliases.map(normalizeBadgeToken));
    if (set.has(k) || set.has(normalizeBadgeToken(label))) return canonical;
  }
  return null;
}

export async function assignBadge(slug: string, badgeTypeId: string) {
  // Resolve the incoming badge type so we can enforce the single-promo rule.
  const snap = await load();
  const incoming = snap.types.find((t) => t.id === badgeTypeId);
  const existing = snap.map.get(slug) ?? [];

  // Single-badge policy: if the new badge is a promo, drop any OTHER promo
  // assignments on this product BEFORE inserting the new one.
  if (incoming) {
    const incomingPromo = normalizePromoKey(incoming.badgeKey, incoming.label);
    if (incomingPromo) {
      const displacedIds = existing
        .filter((b) => b.id !== incoming.id)
        .filter((b) => normalizePromoKey(b.badgeKey, b.label) !== null)
        .map((b) => b.id);
      if (displacedIds.length > 0) {
        await supabase
          .from("product_badges")
          .delete()
          .eq("product_slug", slug)
          .in("badge_type_id", displacedIds);
      }
    }
  }

  const sortOrder = existing.length;
  const { error } = await supabase
    .from("product_badges")
    .insert({ product_slug: slug, badge_type_id: badgeTypeId, sort_order: sortOrder });
  if (error) throw new Error(error.message);
  await load(true);
}

/**
 * Auto-assign the built-in "New" badge to a freshly created product.
 * No-op if the badge type is missing/disabled/archived or already assigned.
 */
export async function assignNewBadge(slug: string) {
  const snap = await load();
  const newType = snap.types.find((t) => t.badgeKey === "new" && t.enabled && !t.archived);
  if (!newType) return;
  const already = (snap.map.get(slug) ?? []).some((b) => b.id === newType.id);
  if (already) return;
  await assignBadge(slug, newType.id);
}

export async function unassignBadge(slug: string, badgeTypeId: string) {
  const { error } = await supabase
    .from("product_badges")
    .delete()
    .eq("product_slug", slug)
    .eq("badge_type_id", badgeTypeId);
  if (error) throw new Error(error.message);
  await load(true);
}

export async function reorderProductBadges(slug: string, orderedBadgeTypeIds: string[]) {
  await Promise.all(
    orderedBadgeTypeIds.map((id, i) =>
      supabase
        .from("product_badges")
        .update({ sort_order: i })
        .eq("product_slug", slug)
        .eq("badge_type_id", id),
    ),
  );
  await load(true);
}

/** Update per-assignment fields (notes / schedule / archived) for one product badge. */
export async function updateAssignment(
  slug: string,
  badgeTypeId: string,
  patch: { notes?: string; start_at?: string | null; end_at?: string | null; archived?: boolean },
) {
  const { error } = await supabase
    .from("product_badges")
    .update(patch as never)
    .eq("product_slug", slug)
    .eq("badge_type_id", badgeTypeId);
  if (error) throw new Error(error.message);
  await load(true);
}

type BulkProgress = (done: number, total: number) => void;
const CHUNK = 200;

/** Assign a badge to many products (skips products that already have it). Chunked + progress. */
export async function bulkAssign(
  slugs: string[],
  badgeTypeId: string,
  onProgress?: BulkProgress,
) {
  const snap = cache ?? (await load());
  const targets = slugs.filter(
    (s) => !(snap.map.get(s) ?? []).some((b) => b.id === badgeTypeId),
  );
  const rows = targets.map((s) => ({
    product_slug: s,
    badge_type_id: badgeTypeId,
    sort_order: (snap.map.get(s) ?? []).length,
  }));
  for (let i = 0; i < rows.length; i += CHUNK) {
    const chunk = rows.slice(i, i + CHUNK);
    const { error } = await supabase.from("product_badges").insert(chunk as never);
    if (error) throw new Error(error.message);
    onProgress?.(Math.min(i + CHUNK, rows.length), rows.length);
  }
  await load(true);
  return targets.length;
}

/** Remove a badge from many products. Chunked + progress. */
export async function bulkUnassign(
  slugs: string[],
  badgeTypeId: string,
  onProgress?: BulkProgress,
) {
  for (let i = 0; i < slugs.length; i += CHUNK) {
    const chunk = slugs.slice(i, i + CHUNK);
    const { error } = await supabase
      .from("product_badges")
      .delete()
      .eq("badge_type_id", badgeTypeId)
      .in("product_slug", chunk);
    if (error) throw new Error(error.message);
    onProgress?.(Math.min(i + CHUNK, slugs.length), slugs.length);
  }
  await load(true);
}

/** Replace one badge with another across many products. */
export async function bulkReplace(
  slugs: string[],
  fromBadgeTypeId: string,
  toBadgeTypeId: string,
  onProgress?: BulkProgress,
) {
  for (let i = 0; i < slugs.length; i += CHUNK) {
    const chunk = slugs.slice(i, i + CHUNK);
    const { error } = await supabase
      .from("product_badges")
      .update({ badge_type_id: toBadgeTypeId } as never)
      .eq("badge_type_id", fromBadgeTypeId)
      .in("product_slug", chunk);
    if (error) throw new Error(error.message);
    onProgress?.(Math.min(i + CHUNK, slugs.length), slugs.length);
  }
  await load(true);
}

/** Bulk schedule / archive an existing badge assignment across many products. */
export async function bulkUpdateAssignments(
  slugs: string[],
  badgeTypeId: string,
  patch: { start_at?: string | null; end_at?: string | null; archived?: boolean },
  onProgress?: BulkProgress,
) {
  for (let i = 0; i < slugs.length; i += CHUNK) {
    const chunk = slugs.slice(i, i + CHUNK);
    const { error } = await supabase
      .from("product_badges")
      .update(patch as never)
      .eq("badge_type_id", badgeTypeId)
      .in("product_slug", chunk);
    if (error) throw new Error(error.message);
    onProgress?.(Math.min(i + CHUNK, slugs.length), slugs.length);
  }
  await load(true);
}



export async function updateBadgeType(id: string, patch: Partial<BadgeTypeRow>) {
  const { error } = await supabase.from("badge_types").update(patch as never).eq("id", id);
  if (error) throw new Error(error.message);
  await load(true);
}

// ---- Click analytics ----
export function trackBadgeClick(badgeTypeId: string, slug: string) {
  if (typeof window === "undefined") return;
  void supabase
    .from("badge_events")
    .insert({ badge_type_id: badgeTypeId, product_slug: slug, event_type: "click" } as never);
}

export function trackBadgeImpression(badgeTypeId: string, slug: string) {
  if (typeof window === "undefined") return;
  void supabase
    .from("badge_events")
    .insert({ badge_type_id: badgeTypeId, product_slug: slug, event_type: "impression" } as never);
}

// ---- Analytics dashboard data ----
export type BadgeStat = {
  badge: BadgeType;
  impressions: number;
  clicks: number;
  ctr: number; // 0..1
  products: number;
};

export type BadgeAnalytics = {
  totalImpressions: number;
  totalClicks: number;
  avgCtr: number;
  activeBadges: number;
  totalAssignments: number;
  perBadge: BadgeStat[];
  series: { date: string; impressions: number; clicks: number }[];
  topProducts: { slug: string; clicks: number }[];
};

/** Loads aggregated badge analytics for the last `days` days. */
export async function loadBadgeAnalytics(days = 30): Promise<BadgeAnalytics> {
  const since = new Date(Date.now() - days * 86400000);
  const sinceIso = since.toISOString();

  const [snap, evRes, asgRes] = await Promise.all([
    load(),
    supabase
      .from("badge_events")
      .select("badge_type_id, product_slug, event_type, created_at")
      .gte("created_at", sinceIso)
      .limit(50000),
    supabase.from("product_badges").select("badge_type_id, product_slug"),
  ]);

  const events = (evRes.data ?? []) as {
    badge_type_id: string; product_slug: string; event_type: string; created_at: string;
  }[];
  const assignments = (asgRes.data ?? []) as { badge_type_id: string; product_slug: string }[];

  const clicksByBadge = new Map<string, number>();
  const imprByBadge = new Map<string, number>();
  const clicksByProduct = new Map<string, number>();
  const dayBuckets = new Map<string, { impressions: number; clicks: number }>();

  // seed day buckets so the chart has continuous days
  for (let i = days - 1; i >= 0; i--) {
    const d = new Date(Date.now() - i * 86400000).toISOString().slice(0, 10);
    dayBuckets.set(d, { impressions: 0, clicks: 0 });
  }

  let totalClicks = 0;
  let totalImpressions = 0;
  for (const e of events) {
    const day = e.created_at.slice(0, 10);
    const bucket = dayBuckets.get(day) ?? { impressions: 0, clicks: 0 };
    if (e.event_type === "click") {
      totalClicks++;
      clicksByBadge.set(e.badge_type_id, (clicksByBadge.get(e.badge_type_id) ?? 0) + 1);
      clicksByProduct.set(e.product_slug, (clicksByProduct.get(e.product_slug) ?? 0) + 1);
      bucket.clicks++;
    } else {
      totalImpressions++;
      imprByBadge.set(e.badge_type_id, (imprByBadge.get(e.badge_type_id) ?? 0) + 1);
      bucket.impressions++;
    }
    dayBuckets.set(day, bucket);
  }

  const productsByBadge = new Map<string, number>();
  for (const a of assignments) {
    productsByBadge.set(a.badge_type_id, (productsByBadge.get(a.badge_type_id) ?? 0) + 1);
  }

  const perBadge: BadgeStat[] = snap.types.map((badge) => {
    const impressions = imprByBadge.get(badge.id) ?? 0;
    const clicks = clicksByBadge.get(badge.id) ?? 0;
    return {
      badge,
      impressions,
      clicks,
      ctr: impressions > 0 ? clicks / impressions : 0,
      products: productsByBadge.get(badge.id) ?? 0,
    };
  }).sort((a, b) => b.clicks - a.clicks || b.products - a.products);

  const series = Array.from(dayBuckets.entries())
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([date, v]) => ({ date, ...v }));

  const topProducts = Array.from(clicksByProduct.entries())
    .map(([slug, clicks]) => ({ slug, clicks }))
    .sort((a, b) => b.clicks - a.clicks)
    .slice(0, 8);

  return {
    totalImpressions,
    totalClicks,
    avgCtr: totalImpressions > 0 ? totalClicks / totalImpressions : 0,
    activeBadges: snap.types.filter((t) => t.enabled && !t.archived).length,
    totalAssignments: assignments.length,
    perBadge,
    series,
    topProducts,
  };
}
