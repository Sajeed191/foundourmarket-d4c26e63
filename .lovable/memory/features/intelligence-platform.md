---
name: FoundOurMarket Intelligence Platform v1.0
description: Four-layer intelligence stack (Image v3, Catalog 2.0, Marketplace 3.0, Marketplace Health v1.0). Freeze policy + upward-only public contracts.
type: feature
---

# Intelligence Platform v1.0 — Architecturally Complete

## Layers
- **L1 Image Intelligence v3** (Frozen): analysis, normalization, Quality Gate, Gallery Health, Hero Recommendation, AI Detection, Duplicate integration, versioned processing, Upgrade Manager.
- **L2 Catalog Intelligence 2.0** (Frozen): Completeness, Attribute, Variant, SEO, Pricing, Recommendation Broker, Marketplace Readiness.
- **L3 Marketplace Intelligence 3.0** (Frozen): Vendor, Marketplace Optimization, Relationship, Trust.
- **L4 Marketplace Health v1.0** (Stable): executive orchestrator — weighted aggregation, trends, recommendation lifecycle, executive summary, rollups.

## Permanent architectural rules
1. **Upward-only intelligence flow.** A layer may consume ONLY the public contracts of the layer(s) beneath it. Never import another module's internals.
2. **Layer stability policy.**
   - Experimental → APIs may change.
   - Stable → backward-compatible public contracts.
   - Frozen → bug fixes, performance, threshold tuning, additive fields only. No breaking changes without a new major version.
3. **One recommendation, one action** at every surface. Explainable evidence required.
4. **No new intelligence engines** unless a real gap is proven. New capabilities plug in by publishing standard contracts.

## Contract versions
- Recommendation Schema: 1.x
- Evidence Schema: 1.x
- IntelligenceModule contract: 1.x

## Next roadmap (embedding, not more engines)
- Product Editor inline recommendations.
- Admin Home = Marketplace Health first view.
- Publishing flow gated by Marketplace Readiness status.
- Browse Management using MarketplaceOptimization rollups.
- Recommendation Analytics (time-to-resolution, recurrence, resolution rate) derived from lifecycle states.
