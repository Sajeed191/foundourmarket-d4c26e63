---
name: PDP Experience v2 — FINAL (FROZEN)
description: Canonical composition-first PDP recommendations. All six relationship surfaces live, driven entirely by the Relationship Presentation Adapter.
type: feature
---

# PDP Experience v2 — FINAL (FROZEN)

Snapshot #10 clean · Build Health 100/100 · Entry eager 356.7 KB gz unchanged · Worst route-only 21.8 KB / 50 KB gz · PDP not in top 5.

## Frozen architecture (canonical for all relationship-based recommendations)

```
RelationshipIntelligence (frozen)
        │
        ▼
Relationship Presentation Adapter  (src/lib/pdp/relationship-presentation-adapter.ts)
        │
        ▼
ProductRelationshipPresentation[]
        │
        ▼
PDPRelationshipSections  (src/components/site/PDPRelationshipSections.tsx)
        │
        ▼
BrowseCard  (single presentation component)
```

## Frozen relationship surfaces (all six live)

1. Frequently Bought Together
2. Compatible Products
3. Accessories
4. Bundles
5. Alternatives
6. Replacement Products

Order is centralized in the adapter and must never be re-sorted by the UI.

## Permanent rules

1. Presentation consumes only the frozen adapter (`@/lib/pdp`). Routes/components never import `@/lib/marketplace-intelligence/*` directly.
2. Empty sections are omitted by the adapter — the PDP just `.map()`s.
3. Section ordering is centralized in the adapter.
4. BrowseCard is the single presentation component for recommendation products. No per-section card forks.
5. Recommendations are additive and never interrupt the purchase flow.
6. New relationship types are added in the intelligence layer first; presentation renders them automatically only if the adapter exposes them.
7. Relationship detection stays in RelationshipIntelligence. The PDP never computes compatibility, variants, accessory, or bundle relationships itself.

## Adding a new relationship type (canonical flow)

1. Emit the new relationship from RelationshipIntelligence (e.g. `eco_alternative`, `premium_upgrade`, `refill`).
2. Map the bucket to a `ProductRelationshipSection` in the adapter and add its `SECTION_META`.
3. Add the section name to `allowedSections` on `<PDPRelationshipSections />` if gated.

No PDP redesign. No new fetching, scoring, or card components.
