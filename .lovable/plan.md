# Phase 6C — Self-Learning Marketplace Intelligence

Builds directly on the existing centralized engine (`src/lib/recommendations/`) and the deterministic `performance.ts` tracker. No changes to checkout, orders, inventory, auth, SEO, or product URLs. No new required DB schema for the core loop (localStorage-first, with an optional analytics-events read for the admin dashboard).

## Delivery order (each item ships and typechecks independently)

### 6C-1 — Full-Funnel Quality Optimizer (foundation)
Upgrade `performance.ts` from CTR-only to a weighted funnel per source:
impression → click → quick_view → wishlist → add_to_cart → buy_now → checkout_started → purchase → return (negative).
- New `recordFunnelEvent(source, stage)` API; existing `recordImpression`/`recordClick` delegate to it.
- Derive a live 0–100 **quality score** per source from stage-weighted conversion (purchase weighted highest, return subtracts).
- `priorityMultiplier(source)` reads the quality score instead of raw CTR; bounded, neutral until enough data.
- Wire stage events at existing call sites: QuickViewDialog, wishlist toggle, add-to-cart, buy-now — passing the originating `source` already carried on rec items.

### 6C-2 — Seasonal Intelligence
New `src/lib/recommendations/seasonal.ts`: deterministic date→season resolver (Ramadan/Eid via lunar table, Christmas, Back to School, Summer/Winter, Diwali) mapped to category/keyword boosts. No hardcoded product IDs — matches on category/tags. Feeds a `seasonalBoost` factor into the scorer.

### 6C-3 — Inventory Intelligence
New scorer factor from existing product fields (stock level, restock date, shipping speed, margin if available). Boost healthy/fast/high-margin/newly-restocked; dampen near-sold-out (configurable urgency exception). Pure function over `Product`, no inventory writes.

### 6C-4 — Customer Journey Intelligence
New `strategies.ts` map: surface → ordered strategy stack (home=discovery, search=alternatives, PDP=complementary, cart=cross-sell, checkout=impulse/low-price, post-purchase=replenishment/accessories). Surfaces pass a `journeyStage` to `useRecommendationRail`; engine selects the right strategy preset.

### 6C-5 — Diversity AI (brand fatigue)
Strengthen `diversity.ts` with a stronger brand-run penalty and a "max N consecutive same-brand" guarantee while preserving relevance ordering.

### 6C-6 — Smart Business Rules (admin, no code changes)
Read merchandising config from existing `marketplace_settings`/`store_settings` (JSON column) — no new table: boost margin/new-arrivals/local/sustainable/verified, exclude brands/categories. Applied as scorer weights + hard filters via the existing `boosts` config path.

### 6C-7 — Explainable AI (debug expansion)
Extend `RecommendationItem` reason into a structured `scoreBreakdown` (behaviour, similarity, trend, popularity, personalization, inventory, freshness, seasonal, businessRule, confidence). Dev-only overlay via existing `data-*` attributes + a `DebugPanel` section.

### 6C-8 — Recommendation Health Dashboard (admin-only)
New route `admin-recommendation-health.tsx` reading funnel snapshots (localStorage in dev, and aggregated `analytics_events` section stats already tracked) → top/low sources, most-clicked, highest-converting, ignored recs, CTR, funnel. Reuses `fetchSectionAnalytics` + `getPerformanceSnapshot`.

### 6C-9 — Nightly Continuous Learning (precompute)
A `/api/public/hooks/recs-recompute` server route + pg_cron nightly job recalculating trending/popularity/affinity/brand+category relationships/FBT into existing cache tables (`recommendation_scores`, `trending_products`, `personalized_feed_cache`). Engine reads precomputed `seedScores`; real-time stays cheap.

### 6C-10 — Global Recommendation Graph (co-purchase relationships)
Build a category/brand co-occurrence graph from order history in the nightly job (item 9), stored in an existing cache table as adjacency JSON. Powers "complete the chain" complementary recommendations (phone→case→charger…).

## Technical notes
- Core scoring stays pure & deterministic; all new factors are additive weights in `scorer.ts` with a single `EngineConfig`/weights surface.
- Learning signals live in `performance.ts` (localStorage, per-device, zero schema). The nightly job (6C-9/10) uses existing cache tables only — no new required tables; if a table is missing I'll confirm before adding one.
- Every phase ends with a `tsgo` typecheck and a smoke check; guardrails (no checkout/inventory/auth/SEO/URL changes) enforced throughout.

## Suggested start
Ship **6C-1 (Full-Funnel Optimizer)** first — it's the backbone every other item feeds into — then 6C-4 (journey) and 6C-7 (explainability), which are pure frontend/engine wiring with no backend risk. Items 6C-9/6C-10 (nightly + graph) come last since they touch cron/cache.

Want me to start with 6C-1, or reorder?
