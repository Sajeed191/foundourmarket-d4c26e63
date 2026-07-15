---
name: Track B — Customer Experience
description: Buyer-facing experience layer. Phase 1 AI Marketplace Search shipped; roadmap: Intelligent Browse, PDP relationships, Personalization
type: feature
---
Track B builds the buyer experience on top of the frozen Platform v1.0.
Presentation-only — never adds intelligence, scoring, or new public contracts.

**Phase 1 — AI Marketplace Search (shipped)**
- `src/lib/ai-search.ts`: `parseAiQuery(text, ctx) → { filters, query, understood, hasIntent }`.
- Natural-language parsing → existing `Filters` shape used by `/search`.
- Extracts: price bands ("under ₹3000", "100-500", "between X and Y"),
  colours, brands (typo-tolerant), categories (typo-tolerant), materials,
  sale / free-shipping / in-stock / rating intents.
- Explainable: `understood[]` chips shown in `SearchOverlay` so the user
  sees what the AI extracted before running the search.
- Composition-first: outputs only params the frozen `/search` route
  already accepts. No new backend, no new contract.

**Next phases (not yet started):**
- Phase 2 — Intelligent Browse (consume Relationship + catalog metadata).
- Phase 3 — PDP relationships (Frequently bought / compatible / bundles)
  via existing Relationship Intelligence outputs.
- Phase 4 — Personalization (recently viewed, saved interests) as a
  presentation layer over existing signals.

Rule: every Track B feature must first try to compose an existing frozen
contract; introduce a new contract only if composition is impossible, and
even then never inside a customer-facing route.
