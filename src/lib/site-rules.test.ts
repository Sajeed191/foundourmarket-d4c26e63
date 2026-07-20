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

if (failed > 0) {
  console.error(`\n${failed} assertion(s) failed`);
  process.exit(1);
}
console.log("\nAll Site Rules regression tests passed.");
