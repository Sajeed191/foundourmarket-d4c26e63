# Phase 6D — Commerce Graph, Nightly Intelligence, Business Rules & Experiments

Builds on the existing centralized engine (`src/lib/recommendations/`). No changes to checkout, orders, inventory, auth, SEO, or product URLs. All heavy computation moves to a nightly job; daytime reads stay cheap by reading precomputed rows.

## Priority 1 — Global Commerce Graph (foundation)

A single typed relationship graph instead of one-off A→B tables.

### Schema (one migration)
```text
product_graph_edges
  from_slug   text
  edge_type   text   -- bought_with | viewed_with | similar_to | upgrade_to |
                     -- budget_alt | accessory_of | same_brand | same_category
  to_slug     text
  weight      numeric
  updated_at  timestamptz
  PK (from_slug, edge_type, to_slug)
```
- GRANT: `SELECT` to `anon, authenticated` (public read, non-PII product relationships); `ALL` to `service_role`. RLS on, public SELECT policy, admin/service write only.
- Index on `(from_slug, edge_type, weight desc)` for fast top-N reads.
- Client helper `src/lib/recommendations/graph.functions.ts` — `getGraphEdges(fromSlug, edgeType, limit)` server fn reading edges (publishable client, `TO anon` policy). Feeds `seedScores` + `restrictTo` in the existing engine — no engine rewrite.
- Edge types map to existing strategies: `bought_with`→FBT/customers_also_bought, `accessory_of`→compatible_accessories, `upgrade_to`→upgrade, `budget_alt`→budget_alternative, `similar_to`→similar.

## Priority 2 — Nightly Intelligence Jobs (precompute)

One server route `src/routes/api/public/hooks/recs-recompute.ts` (POST, `apikey` header auth), scheduled via pg_cron nightly. Recomputes from `orders`/`order_items`/`analytics_events`/`page_views` and writes lightweight outputs:
- Co-purchase graph → `product_graph_edges` (bought_with, viewed_with).
- Similarity/upgrade/budget/accessory edges from category + price bands + brand.
- Popularity / trending / conversion scores → refresh `trending_products` inputs + a new `product_scores` table (slug, trending, popularity, conversion, fbt_strength, updated_at) for O(1) daytime reads.
- Brand/category/variant/colour/size/seller popularity aggregates → `product_scores` JSON column `aggregates`.
- Guardrail: pure reads + writes only to graph/score cache tables; wrapped in per-section try/catch so one failure doesn't abort the run; returns a JSON summary.
- Migration adds `product_scores` with GRANTs (anon SELECT, service_role ALL).

## Priority 3 — Admin Business Rules dashboard

New table `recommendation_rules`:
```text
id uuid, rule_kind text (boost|reduce|exclude), target_type text
(new_arrivals|high_margin|fast_shipping|local_seller|featured|sustainable|
 low_inventory|poor_reviews|high_returns|slow_delivery|brand|category|product|seller),
target_value text null, weight numeric, priority int,
enabled bool, starts_at timestamptz null, ends_at timestamptz null,
created_at, updated_at
```
- GRANT: authenticated SELECT (engine needs rules), admin/service ALL; RLS: public/auth SELECT of enabled rules, admin write via `has_role`.
- Admin UI route `admin-recommendation-rules.tsx` — grouped Boost / Reduce / Exclude cards, each rule with weight slider, priority, schedule (start/end), enable toggle. Added to `AdminShell` nav.
- Engine wiring: a `resolveBusinessRules(rules, now)` helper converts active rules into the existing `boosts` (pinned/excluded) + additive scorer weights (`businessRule` breakdown factor already exists). Rules loaded once via a lightweight server fn and passed through `RecommendationProvider`.

## Priority 4 — Recommendation Experiments (A/B testing)

New table `recommendation_experiments` (id, key, description, variants jsonb, traffic_split jsonb, status, winner, metrics jsonb, created_at, updated_at) + `experiment_assignments` (visitor_id/user_id, experiment_key, variant, assigned_at).
- Deterministic client bucketing in `src/lib/recommendations/experiments.ts` — hash(visitorId+experimentKey) → variant by traffic split (no flicker, no server round-trip on read).
- Rails read active experiment variant to pick strategy ordering; impressions/clicks/ATC/purchase already flow through `performance.ts` — extend `recordFunnelEvent` to tag the active variant so per-variant CTR/ATC/conversion accrue.
- Admin surface: an Experiments panel inside `admin-recommendation-health.tsx` showing per-variant funnel metrics + a "promote winner" action (sets `winner`, flips status). Auto-promote is a nightly-job step comparing variant conversion once minimum sample reached.
- GRANTs + RLS: authenticated SELECT active experiments, admin write.

## Delivery order (each ships + typechecks independently)
1. Commerce graph migration + `graph.functions.ts` + wire `accessory_of`/`bought_with` into PDP rails.
2. `product_scores` migration + nightly `recs-recompute` route + pg_cron.
3. `recommendation_rules` migration + admin dashboard + engine wiring.
4. Experiments tables + bucketing lib + health-dashboard metrics + auto-promote step.

## Technical notes
- Core scoring stays pure/deterministic; graph, scores, and rules only feed the existing `seedScores` / `restrictTo` / `boosts` / `businessRule` surfaces — no rewrite of `scorer.ts`/`engine.ts` internals.
- Nightly job is idempotent (upserts), per-section fault isolated, and reads only; never writes to orders/inventory.
- Every new public table gets GRANTs in the same migration; every migration ends with a `tsgo` typecheck.
</content>
<parameter name="summary">Plan for the commerce graph, nightly precompute jobs, admin business rules, and A/B experiments — scaled for production on the existing engine.