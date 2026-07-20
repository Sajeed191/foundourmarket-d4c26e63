/**
 * Regression tests for Site Rules Controller v1.0 core business rules.
 * Run with:  bun run src/lib/site-rules.test.ts
 * (No test framework installed; plain assertions, exits non-zero on failure.)
 *
 * Covers:
 *   1. Collection limits are respected.
 *   2. Rotation eventually exposes every eligible product.
 *   3. Reshuffle (nonce bump) changes ordering without affecting eligibility.
 *   4. Empty eligibility set → empty slice (drives "Coming Soon" state).
 *   5. Determinism — same inputs produce the same output (SSR-safe).
 */
import { fairPagedSlice } from "./fair-rotation";

let failed = 0;
function assert(cond: unknown, msg: string) {
  if (!cond) {
    failed++;
    console.error("✗", msg);
  } else {
    console.log("✓", msg);
  }
}

const items = Array.from({ length: 23 }, (_, i) => `p${i}`);
const NOW = Date.UTC(2026, 6, 20, 12, 0, 0);
const HOURS = 2;
const KEY = "trending";

// 1. Limits respected
{
  const slice = fairPagedSlice(items, 8, NOW, HOURS, 0, KEY);
  assert(slice.length === 8, "collection limit is enforced (23 items, limit=8 → 8)");
  const small = fairPagedSlice(items.slice(0, 5), 8, NOW, HOURS, 0, KEY);
  assert(small.length === 5, "under-limit collection returns all items");
}

// 2. Rotation exposes every eligible product before repeating
{
  const seen = new Set<string>();
  // Step through 24h at HOURS intervals — should cover ceil(23/8)=3 pages.
  for (let i = 0; i < 24 / HOURS; i++) {
    const t = NOW + i * HOURS * 60 * 60 * 1000;
    for (const p of fairPagedSlice(items, 8, t, HOURS, 0, KEY)) seen.add(p);
  }
  assert(seen.size === items.length, `rotation exposes every product (saw ${seen.size}/${items.length})`);
}

// 3. Determinism + reshuffle
{
  const a = fairPagedSlice(items, 8, NOW, HOURS, 0, KEY);
  const b = fairPagedSlice(items, 8, NOW, HOURS, 0, KEY);
  assert(JSON.stringify(a) === JSON.stringify(b), "same inputs produce identical slice (SSR-safe)");

  const c = fairPagedSlice(items, 8, NOW, HOURS, 1, KEY);
  assert(JSON.stringify(a) !== JSON.stringify(c), "reshuffle nonce changes ordering");
  assert(c.length === a.length, "reshuffle preserves slice size");
  // Every reshuffled item must still be from the eligible set.
  assert(c.every((x) => items.includes(x)), "reshuffle does not change eligibility");
}

// 4. Empty eligibility → empty slice (Coming Soon trigger)
{
  const slice = fairPagedSlice<string>([], 8, NOW, HOURS, 0, KEY);
  assert(slice.length === 0, "empty eligibility produces empty slice → Coming Soon state");
}

// 5. Different section keys don't share the same offset
{
  const trending = fairPagedSlice(items, 8, NOW, HOURS, 0, "trending");
  const bestsellers = fairPagedSlice(items, 8, NOW, HOURS, 0, "bestsellers");
  assert(
    JSON.stringify(trending) !== JSON.stringify(bestsellers),
    "different section keys shuffle independently",
  );
}

// 6. Featured Editorial Override — promo resolver
{
  // Minimal RenderBadge shape (only fields the resolver reads).
  type B = {
    badgeKey: string; label: string; enabled: boolean;
    startAt: null; endAt: null;
    assignArchived: false; assignStartAt: null; assignEndAt: null;
  };
  const mk = (key: string): B => ({
    badgeKey: key, label: key, enabled: true,
    startAt: null, endAt: null,
    assignArchived: false, assignStartAt: null, assignEndAt: null,
  });
  // Avoid loading the full module (Supabase client). Re-implement the tiny
  // resolver contract by importing the internal export via dynamic import.
  const mod = await import("./use-product-badges");
  const resolve = mod.__resolvePromoCollectionsForTests as unknown as (
    m: Map<string, unknown[]>,
    now?: number,
  ) => Map<string, Set<string>>;

  // A: multiple promos, no featured → collapses to ONE promo collection.
  // B: single promo → keeps it.
  // C: featured + one promo → keeps that one promo (featured is orthogonal).
  const map = new Map<string, B[]>([
    ["a", [mk("trending"), mk("bestseller"), mk("new")]],
    ["b", [mk("trending")]],
    ["c", [mk("featured"), mk("flash_deal")]],
    ["d", [mk("featured")]],
  ]);
  mod.setPromoResolverConfig({ allowMultiForFeatured: false });
  const r1 = resolve(map);
  assert(r1.get("a")?.size === 1, "editorial_overlay: multi-promo product resolves to exactly one collection");
  assert(r1.get("b")?.has("trending") === true, "editorial_overlay: singleton promo preserved");
  assert(r1.get("c")?.size === 1 && r1.get("c")?.has("flash_deals") === true, "editorial_overlay: featured+flash keeps flash");
  assert(!r1.has("d"), "editorial_overlay: featured-only product has no promo membership");

  // multi_section: featured product with multiple promos keeps ALL of them.
  const map2 = new Map<string, B[]>([
    ["e", [mk("featured"), mk("trending"), mk("bestseller")]],
    ["f", [mk("trending"), mk("bestseller")]],
  ]);
  mod.setPromoResolverConfig({ allowMultiForFeatured: true });
  const r2 = resolve(map2);
  assert(
    r2.get("e")?.has("trending") === true && r2.get("e")?.has("bestseller") === true,
    "multi_section: featured product appears in every promo section it is badged for",
  );
  assert(r2.get("f")?.size === 1, "multi_section: non-featured multi-promo still resolves to one collection");

  // reset for any downstream state
  mod.setPromoResolverConfig({ allowMultiForFeatured: false });
}

if (failed > 0) {
  console.error(`\n${failed} assertion(s) failed`);
  process.exit(1);
}
console.log("\nAll Site Rules regression tests passed.");
