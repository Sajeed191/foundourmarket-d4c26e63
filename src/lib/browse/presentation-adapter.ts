/**
 * Browse Presentation Adapter — Track A · Phase 2.1
 *
 * Pure composition layer for Intelligent Browse. It NEVER creates marketplace
 * intelligence — it only reads existing public contracts (Marketplace
 * Readiness, Recommendation Broker, Relationship Intelligence, catalog
 * metadata, existing deal/merchandising flags) and answers exactly four
 * questions the browse UI needs:
 *
 *   1. order       — where does this product sit in the grid?
 *   2. badges      — which minimal, plain-language tags apply?
 *   3. reason      — one human sentence (progressive disclosure only)
 *   4. section     — which rail/group does this belong to, if any?
 *
 * Deliberately not another scoring engine:
 *   - No new heuristics beyond ordering weights over existing signals.
 *   - No AI decisions. No score exposure. No module names in output.
 *   - Deterministic and unit-testable.
 *
 * Freeze rule: this adapter's OUTPUT SHAPE is a public contract for browse
 * surfaces (`/category/*`, `/deals`, search). Add fields — never break them.
 */
import type { Product } from "@/lib/products";
import type { MarketplaceReadiness } from "@/lib/catalog-intelligence";

/** Minimal, plain-language badges. Never expose internal AI scores. */
export type BrowseBadge =
  | "Recommended"
  | "Best Value"
  | "Popular Choice"
  | "Ready to Ship"
  | "Limited Stock"
  | "New";

/** Rail/group affordance for optional secondary sections (e.g. "Top picks"). */
export type BrowseSection =
  | "top_picks"      // Highest-priority products, curated rail
  | "popular"        // Community-favoured
  | "new_arrivals"   // Recently listed
  | "best_deals"     // Discounted, ready-to-ship
  | "grid";          // Main product grid (default)

export type BrowsePresentation = {
  productId: string;
  priority: number;          // higher = earlier in "Recommended" order
  badges: BrowseBadge[];     // 0–2 badges max, in display order
  reason: string;            // one sentence, plain language
  section: BrowseSection;
};

export type BrowseSortOption =
  | "recommended"
  | "newest"
  | "price-asc"
  | "price-desc"
  | "popular";

export type BrowseAdapterInput = {
  products: Product[];
  /** Optional per-product Marketplace Readiness. Missing entries are neutral. */
  readiness?: Map<string, MarketplaceReadiness>;
  /**
   * Optional per-product relationship signal — only "isolated" is consulted,
   * to lightly deprioritise orphan listings on discovery surfaces.
   */
  isolated?: Set<string>;
  /** Surface hint — lets the adapter emphasise the right axes per surface. */
  surface?: "category" | "deals" | "search";
};

const DEAL_DISCOUNT_THRESHOLD = 15;         // % off to qualify as "Best Value"
const POPULAR_SOLD_THRESHOLD = 25;          // sales floor for "Popular Choice"
const NEW_ARRIVAL_DAYS = 14;                // window for "New" badge
const LIMITED_STOCK_FACTOR = 1;             // stockQty ≤ threshold × factor
const READY_STOCK_MIN = 5;                  // "Ready to Ship" floor

/** Composite priority — higher ranks earlier under "Recommended". */
function computePriority(
  p: Product,
  readiness: MarketplaceReadiness | undefined,
  isolated: boolean,
  surface: BrowseAdapterInput["surface"],
): number {
  let score = 0;

  // 1. Readiness signal (0–100 → 0–40 weight). Missing readiness is neutral.
  if (readiness) {
    score += (readiness.score / 100) * 40;
    // Critical blockers push a product off the top slots.
    if (readiness.status === "not_ready") score -= 15;
  } else {
    score += 20; // neutral midpoint so unmeasured products aren't buried
  }

  // 2. Availability (0–20).
  if (p.inStock) {
    score += 12;
    if (p.stockQuantity >= READY_STOCK_MIN) score += 8;
  }

  // 3. Existing merchandising flags (each additive, capped by de-dup below).
  if (p.staffPick || p.recommended) score += 10;
  if (p.bestseller) score += 8;
  if (p.trending) score += 6;
  if (p.newArrival) score += 4;

  // 4. Community signal (0–10).
  if (p.rating >= 4.5 && p.reviews >= 10) score += 10;
  else if (p.rating >= 4.2 && p.reviews >= 5) score += 5;

  // 5. Surface-specific emphasis.
  if (surface === "deals") {
    const disc = p.discount ?? 0;
    if (disc >= DEAL_DISCOUNT_THRESHOLD) score += 12;
    if (p.flashDeal || p.hotDeal) score += 8;
  }

  // 6. Light penalty for isolated listings on discovery surfaces.
  if (isolated && surface !== "search") score -= 4;

  return Math.round(score * 100); // integer for stable sort
}

function isNewArrival(p: Product): boolean {
  if (p.newArrival) return true;
  if (!p.createdAt) return false;
  const created = Date.parse(p.createdAt);
  if (Number.isNaN(created)) return false;
  const ageDays = (Date.now() - created) / 86_400_000;
  return ageDays <= NEW_ARRIVAL_DAYS;
}

function computeBadges(
  p: Product,
  readiness: MarketplaceReadiness | undefined,
): BrowseBadge[] {
  const badges: BrowseBadge[] = [];

  // Recommended — grounded in Marketplace Readiness OR editorial flags.
  const readyStrong = readiness?.status === "ready" && readiness.score >= 90;
  if (readyStrong || p.staffPick || p.recommended) badges.push("Recommended");

  // Best Value — real, existing discount.
  if ((p.discount ?? 0) >= DEAL_DISCOUNT_THRESHOLD) badges.push("Best Value");

  // Popular Choice — bestseller flag OR strong sales.
  if (p.bestseller || p.soldCount >= POPULAR_SOLD_THRESHOLD)
    badges.push("Popular Choice");

  // Stock badges are mutually exclusive.
  if (p.inStock) {
    const lowThresh = Math.max(1, p.lowStockThreshold) * LIMITED_STOCK_FACTOR;
    if (p.stockQuantity > 0 && p.stockQuantity <= lowThresh) {
      badges.push("Limited Stock");
    } else if (p.stockQuantity >= READY_STOCK_MIN) {
      badges.push("Ready to Ship");
    }
  }

  if (isNewArrival(p)) badges.push("New");

  // Cap at 2 badges in display priority order.
  return badges.slice(0, 2);
}

function computeReason(
  p: Product,
  readiness: MarketplaceReadiness | undefined,
  surface: BrowseAdapterInput["surface"],
): string {
  const bits: string[] = [];

  if (readiness?.status === "ready") {
    bits.push("has complete product information");
  } else if (p.staffPick || p.recommended) {
    bits.push("is a staff pick");
  }

  if (p.inStock && p.stockQuantity >= READY_STOCK_MIN) {
    bits.push("strong availability");
  } else if (p.inStock) {
    bits.push("limited stock remaining");
  }

  if (p.rating >= 4.5 && p.reviews >= 10) {
    bits.push("consistently highly rated");
  }

  if (surface === "deals" && (p.discount ?? 0) >= DEAL_DISCOUNT_THRESHOLD) {
    bits.push(`${Math.round(p.discount ?? 0)}% off today`);
  }

  if (bits.length === 0) return "Matches your current browsing category.";
  const prefix =
    surface === "deals"
      ? "Featured because this deal"
      : "Recommended because this product";
  return `${prefix} ${bits.join(", ")}.`;
}

function assignSection(
  p: Product,
  readiness: MarketplaceReadiness | undefined,
  priority: number,
  topPriorityCut: number,
  surface: BrowseAdapterInput["surface"],
): BrowseSection {
  if (surface === "deals") {
    if ((p.discount ?? 0) >= DEAL_DISCOUNT_THRESHOLD && p.inStock)
      return "best_deals";
    return "grid";
  }
  if (readiness?.status === "ready" && priority >= topPriorityCut)
    return "top_picks";
  if (p.bestseller || p.soldCount >= POPULAR_SOLD_THRESHOLD) return "popular";
  if (isNewArrival(p)) return "new_arrivals";
  return "grid";
}

/**
 * Build a stable BrowsePresentation for every input product. Callers use the
 * returned map to (a) order the grid under "Recommended", (b) render badges,
 * and (c) show a single "Why you're seeing this" disclosure.
 */
export function buildBrowsePresentation(
  input: BrowseAdapterInput,
): Map<string, BrowsePresentation> {
  const { products, readiness, isolated, surface } = input;
  const results: BrowsePresentation[] = [];

  for (const p of products) {
    const id = p.id ?? p.slug;
    const r = readiness?.get(id);
    const iso = isolated?.has(id) ?? false;
    const priority = computePriority(p, r, iso, surface);
    results.push({
      productId: id,
      priority,
      badges: computeBadges(p, r),
      reason: computeReason(p, r, surface),
      section: "grid", // provisional; refined below once we know the cut
    });
  }

  // Determine "top picks" cut = top 15% priority (min 3 products).
  const sortedPri = results.map((r) => r.priority).sort((a, b) => b - a);
  const cutIdx = Math.max(2, Math.floor(sortedPri.length * 0.15) - 1);
  const topPriorityCut = sortedPri[cutIdx] ?? Number.POSITIVE_INFINITY;

  const byId = new Map<string, BrowsePresentation>();
  for (let i = 0; i < products.length; i++) {
    const p = products[i]!;
    const pres = results[i]!;
    const r = readiness?.get(pres.productId);
    pres.section = assignSection(p, r, pres.priority, topPriorityCut, surface);
    byId.set(pres.productId, pres);
  }
  return byId;
}

/**
 * Sort products by a browse sort option. "Recommended" consumes the adapter's
 * priority; every other option is a plain field sort — no intelligence used.
 */
export function sortProductsForBrowse(
  products: Product[],
  presentation: Map<string, BrowsePresentation>,
  sort: BrowseSortOption,
): Product[] {
  const keyOf = (p: Product) => p.id ?? p.slug;
  const arr = products.slice();
  switch (sort) {
    case "recommended":
      arr.sort(
        (a, b) =>
          (presentation.get(keyOf(b))?.priority ?? 0) -
          (presentation.get(keyOf(a))?.priority ?? 0),
      );
      break;
    case "newest":
      arr.sort(
        (a, b) =>
          Date.parse(b.createdAt || "") - Date.parse(a.createdAt || ""),
      );
      break;
    case "price-asc":
      arr.sort((a, b) => a.price - b.price);
      break;
    case "price-desc":
      arr.sort((a, b) => b.price - a.price);
      break;
    case "popular":
      arr.sort(
        (a, b) =>
          b.soldCount - a.soldCount ||
          b.viewsCount - a.viewsCount ||
          b.reviews - a.reviews,
      );
      break;
  }
  return arr;
}

/**
 * Smart filter defaults per category-ish surface. Intelligence may suggest
 * defaults; the UI must let users override. No AI terminology in the output.
 */
export type BrowseFilterDefaults = {
  inStockOnly: boolean;
  highlyRated: boolean;
  newestFirst: boolean;
};

export function defaultFiltersFor(surface: BrowseAdapterInput["surface"]): BrowseFilterDefaults {
  if (surface === "deals") {
    return { inStockOnly: true, highlyRated: false, newestFirst: false };
  }
  // Category & search share the same sensible defaults.
  return { inStockOnly: true, highlyRated: true, newestFirst: false };
}
