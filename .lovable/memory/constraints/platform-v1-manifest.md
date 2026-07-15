---
name: FoundOurMarket™ Platform v1.0 — Version Manifest
description: Frozen platform milestone. Intelligence + Operations layers stable. Allowed changes and future track boundaries.
type: constraint
---
**FoundOurMarket™ Platform v1.0 — FROZEN milestone.**

### Frozen layers
- Image Intelligence v3
- Catalog Intelligence v2
- Marketplace Intelligence v3
- Marketplace Health v1 (stable)
- Marketplace Operations v1 (Smart Work Queue · Daily Digest · Bulk Operations · Recommendation Analytics)

### Architecture invariants (must hold)
- Upward-only intelligence (higher layers consume lower-layer public contracts, never the reverse)
- Pure aggregation in Operations — no new detection, scoring, or AI calls
- Explainable AI — every recommendation carries reason + confidence + module id
- One recommendation, one action per surface
- Public contracts are versioned APIs

### Allowed changes only
- Bug fixes
- Performance improvements
- UX polish
- New bulk operation adapters that reuse existing analyzers
- Additional queue filters/views
- No changes to core Operations contracts (`SmartQueues`, `WorkQueue`, `QueueItem`, `BulkOperation`, etc.)

### Future work — independent tracks (do NOT modify frozen layers)
- Track A — Seller Experience: Vendor Portal (dashboard, work queue, analytics, publish assistant) — reuses Operations + Readiness contracts
- Track B — Customer Experience: AI Search, AI Recommendations, Smart Browse, Personalization
- Track C — Marketplace Growth: Promotions, Campaign Intelligence, Merchandising, Featured Collections
- Track D — Platform: Performance, Observability, Security, Scalability, Testing

### Recommended stabilization cycle before Track A
Validate workflows with real catalog data · benchmark at thousands of products (not just top-viewed sample, current `MAX_ANALYSED=120`) · verify queue prioritization + routing feel intuitive · gather admin feedback to tune thresholds and wording.
