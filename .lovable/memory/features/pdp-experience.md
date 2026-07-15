---
name: PDP Experience v2 — Stage 1 (FROZEN)
description: Frozen Relationship Presentation Adapter + Frequently Bought Together on the PDP. Canonical composition path for all future PDP relationship sections.
type: feature
---

# PDP Experience v2 — Stage 1 (FROZEN)

Snapshot #7 clean · Build Health 100/100 · Entry eager 356.7 KB gz unchanged · PDP route-only well under the 50 KB gz budget.

## Frozen architecture (canonical for all PDP relationship UIs)

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
PDP Sections  (src/components/site/PDPRelationshipSections.tsx)
        │
        ▼
BrowseCard  (single presentation component)
```

## Frozen files

- `src/lib/pdp/relationship-presentation-adapter.ts` — pure translator. No I/O, no scoring, no fetching. Public output shape is a contract; add fields, never break them.
- `src/lib/pdp/index.ts` — barrel; PDP imports only from `@/lib/pdp`.
- `src/components/site/PDPRelationshipSections.tsx` — generic renderer for every section the adapter emits, in the adapter's canonical order, using BrowseCard. Lazy-loaded from the PDP route.

## Frozen rules (permanent)

1. **Relationship detection stays in RelationshipIntelligence.** The PDP never computes compatibility, variants, accessory or bundle relationships itself.
2. **PDP imports only the adapter (`@/lib/pdp`).** Never `@/lib/marketplace-intelligence/*` directly from routes/components.
3. **BrowseCard is the single card** for all recommendation sections. No new card components.
4. **Empty sections are omitted** by the adapter; the PDP just `.map()`s.
5. **Section order is centralized in the adapter** — never re-sorted by the UI:
   1. Frequently Bought Together
   2. Compatible Products
   3. Accessories
   4. Bundles
   5. Alternatives
   6. Replacement Products
6. **Additive, never interruptive** (see Core rule).

## Stage 1 status

- ✅ Frequently Bought Together — wired via `frequentlyBoughtTogetherIds` (from `fetchFBT` / co-purchase graph) → adapter → BrowseCard. Read-only; no multi-add-to-cart.
- ⏳ Compatible Products — allowed section is enabled in the renderer, but no upstream signal is currently emitted. `classifyRelationship` in Catalog Intelligence has no branch that returns `kind: "compatible"`; the graph has no `compatible` edge type. Section will appear automatically once the frozen intelligence layer starts emitting it — no PDP change required.
- ⏳ Accessories / Bundles / Alternatives / Replacements — same pattern: enable in `allowedSections`, and they render as soon as a `RelationshipIntelligence` output reaches the PDP.

## How to add remaining sections

1. Add the section name to `allowedSections` on `<PDPRelationshipSections />`.
2. Provide a `RelationshipIntelligence` object (or continue to omit it — nothing breaks).
3. Do NOT add new fetching, scoring, or per-section components.
