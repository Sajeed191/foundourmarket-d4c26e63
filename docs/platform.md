# FoundOurMarket™ Platform v1.0 — Internal Architecture Reference

**Status:** Production Ready · **Frozen:** Intelligence + Operations layers · **Next tracks:** Vendor / Customer / Growth experiences.

This is the single source of truth for anyone extending the platform. If a rule below and code disagree, the rule wins — code must be brought back in line.

---

## 1. Architecture Overview

```
Experience Layer   ──►  Admin ✓   Vendor (next)   Customer (future)
                        │
Operations Layer   ──►  Smart Work Queue · Daily Digest · Bulk Ops · Recommendation Analytics
                        │  (pure aggregation, no new intelligence)
Intelligence Layer ──►  Marketplace Intelligence v3
                        │
                        ▼  Catalog Intelligence v2
                        │
                        ▼  Image Intelligence v3
```

**Upward-only rule.** Higher layers consume lower-layer public contracts.
Lower layers never import from higher layers. Operations never re-implements
scoring, detection, or AI calls.

**One recommendation, one action.** Every surface exposes at most one prioritized
recommendation with a single execute affordance. Confidence + reason + module id
must always accompany the recommendation (Explainable AI).

---

## 2. Public Contracts (versioned)

Consumers must import ONLY these public shapes — never internal helpers.

| Contract | Location | Owner |
|---|---|---|
| `IntelligenceModule` | `src/lib/catalog-intelligence` | Catalog Intelligence v2 |
| `Recommendation` | `src/lib/catalog-intelligence` | Catalog Intelligence v2 |
| `MarketplaceReadiness` | `src/lib/catalog-intelligence` | Catalog Intelligence v2 |
| `VendorIntelligence` | `src/lib/marketplace-intelligence` | Marketplace Intelligence v3 |
| `MarketplaceOptimization` | `src/lib/marketplace-intelligence` | Marketplace Intelligence v3 |
| `TrustIntelligence` | `src/lib/marketplace-intelligence` | Marketplace Intelligence v3 |
| `MarketplaceHealth` (+ `LifecycleRecommendation`) | `src/lib/marketplace-intelligence` | Marketplace Intelligence v3 |
| `RecommendationAnalytics` (+ `RecommendationHistory`) | `src/lib/marketplace-intelligence` | Marketplace Intelligence v3 |
| `MarketplaceHealthListing` | `src/lib/use-marketplace-health` | Read model |
| `SmartQueues`, `WorkQueue`, `QueueItem` | `src/lib/marketplace-operations` | Operations v1 |
| `BulkOperation`, `BulkOperationSpec` | `src/lib/marketplace-operations/bulk-operations` | Operations v1 |
| `ENGINE_VERSION_MANIFEST` | `src/lib/image-intelligence-versions` | Image Intelligence v3 |

Breaking a contract requires a version bump on the owning layer and a
migration path documented here. During Platform v1.0 no breaking changes
are permitted — only additive fields.

---

## 3. Version Manifest & Freeze Policy

**Frozen layers (v1.0):**

- Image Intelligence v3 — engine 3.0.0, photon 0.3.6, quality-gate 1.0.0, category rules 2.0.0
- Catalog Intelligence v2
- Marketplace Intelligence v3
- Marketplace Health v1
- Marketplace Operations v1 (Smart Queues · Daily Digest · Bulk Ops · Recommendation Analytics)

**Allowed changes only:**

- Bug fixes
- Performance improvements
- UX polish
- New bulk-operation adapters that reuse existing analyzers
- Additional queue filters / views
- Additive optional fields on public contracts

**Forbidden without a formal unfreeze:**

- New scoring, detection, or AI calls inside Operations
- Renames / removals on public contract fields
- Cross-layer imports that violate the upward-only rule

Every generated asset must remain reproducible from
`(original input, engine manifest, category rules snapshot)`. Bump the
manifest whenever behavior changes.

---

## 4. Adding a New Intelligence Module

1. Pick the correct layer (image / catalog / marketplace). Never add to Operations.
2. Implement `analyze<X>(...)` returning `IntelligenceModule` (id, name, status, score, summary, recommendations).
3. Every recommendation MUST include: `module`, `action`, `impact`, `confidence`, `reason`.
4. Register the module in the layer's public barrel so upstream aggregators pick it up automatically.
5. Add reviewer fixtures and record a baseline run in `/admin-recommendation-validation`.
6. Add a perf budget line in `DEFAULT_BUDGETS` (`src/lib/perf-harness/benchmarks.ts`).
7. Add a reliability assertion in `src/lib/reliability-lab/tests.ts`.

Rule: a new module must not require any change to Operations code. If it
does, the module boundary is wrong.

---

## 5. Adding a New Operation Adapter

Operations only executes decisions produced by Intelligence.

1. Add a `BulkOperationSpec` to `src/lib/marketplace-operations/bulk-operations.ts`.
2. `spec.run(listing, ctx)` calls existing analyzers only. Never introduces new detection / AI.
3. `spec.eligible(listing)` derives eligibility from public contract fields.
4. Never mutate the source listing. Emit results into the audit sample only.
5. Register in `BULK_OPERATION_ORDER` so it appears in the admin surfaces.
6. Add a reliability check confirming resume-safety (idempotent re-run yields identical results).

---

## 6. Performance Budgets

Sourced from `DEFAULT_BUDGETS` in `src/lib/perf-harness/benchmarks.ts` and
validated via `/admin-perf-harness`.

| Stage | Budget (n = catalog size) |
|---|---|
| Product Editor (cold) | 25ms |
| Product Editor (warm) | 15ms |
| Listing analysis | `max(500ms, 1.5ms · n)` |
| Vendor + Optimization + Trust | `max(200ms, 0.5ms · n)` |
| Marketplace Health build | `max(150ms, 0.3ms · n)` |
| Smart Queues build | `max(120ms, 0.25ms · n)` |
| Recommendation Analytics build | `max(150ms, 0.3ms · n)` |

A stage exceeding budget at 10k is a release blocker. At 100k it is a warning.

---

## 7. Release Checklist

Run before publishing any change touching platform code.

- [ ] `/admin-perf-harness` — all stages ≤ budget at 1k and 10k.
- [ ] `/admin-recommendation-validation` — sample reviewed, no regressions in Acceptance Rate or Precision vs previous release.
- [ ] `/admin-reliability-lab` — Platform Stability ≥ 95 with all failure toggles ON.
- [ ] No new import from a higher layer into a lower layer (`rg` check).
- [ ] No new module inside `src/lib/marketplace-operations/` that calls an analyzer not exposed as a public contract.
- [ ] Engine manifest bumped if any image / analyzer behavior changed.
- [ ] Changelog entry with the release-note format below.

**Release-note format:**

```
FoundOurMarket™ Platform vX.Y.Z — <date>
Layer:      <affected layer>
Kind:       bugfix | perf | ux | new-adapter | additive-field
Contracts:  unchanged | additive (list)
Perf:       <stage> — <before>ms → <after>ms at 10k
Validation: recs <accept/precision>  reliability <score>
```

---

## 8. Track Roadmap (post-v1.0)

New tracks build ON TOP of frozen contracts. They must not require any change to Intelligence or Operations code.

- **Track A — Vendor Experience.** Vendor Portal (dashboard, editor, work queue, analytics, publish assistant). Reuses `MarketplaceReadiness`, `SmartQueues`, `RecommendationAnalytics` with a vendor filter.
- **Track B — Customer Experience.** AI search, recommendations, smart browse, personalization. Reuses Catalog + Marketplace Intelligence outputs.
- **Track C — Marketplace Growth.** Promotions, campaigns, merchandising. Layered on top of Marketplace Health signals.
- **Track D — Platform.** Observability, security, scalability, testing. Cross-cutting; does not touch domain layers.
