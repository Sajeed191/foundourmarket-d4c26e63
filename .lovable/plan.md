# Performance v2 — FROZEN

Status: **FROZEN** (canonical production baseline)
Measured: production (`foundourmarket.lovable.app`), warm worker, Pixel-class profile.

## Canonical Production Baseline (warm)

| Route         | TTFB   | LCP      |
|---------------|--------|----------|
| `/`           | 52 ms  | 316 ms   |
| `/categories` | 60 ms  | 784 ms   |
| `/search`     | 69 ms  | 1,804 ms |

## Frozen Guarantees

- Zero unnecessary realtime subscriptions (anon visitors: 0 channels)
- Analytics batching enabled (max 20 rows / 1.5s interval)
- Request deduplication enabled (inflight coalescing on settings, badges, categories)
- SWR caches active (60s stale-while-revalidate on shared config hooks)
- No duplicate API requests
- Build Health: 100/100

## Non-Goals (do not revisit)

- No further homepage optimization
- No new `lazy()` boundaries introduced solely for cold-start mitigation
- Cold starts are treated as infrastructure characteristics, not application regressions
- Future perf work must target **measured** bottlenecks only

---

# Backlog

## Performance v3 — Grid Image Optimization (NOT STARTED)

Independent of v2. Benchmark separately.

**Scope**
- Categories route
- Search route
- Product recommendation grids
- Related products
- Recently viewed

**Goals**
- Reduce image decode time
- Improve mobile LCP on image-heavy routes (target: `/search` LCP < 1,200 ms warm)
- Preserve current UI and behavior (no visual or interaction changes)

**Not in scope**
- Homepage
- PDP hero (already frozen at Home LCP 316 ms warm)
- Layout, spacing, card design, badges
