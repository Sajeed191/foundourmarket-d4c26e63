---
name: Experience layers — presentation only
description: Permanent rule. Admin / Vendor / Customer / Mobile experiences differ only in presentation, permissions, scope of data, and navigation. They MUST NOT fork intelligence, scoring, or contracts.
type: constraint
---
**Rule: Experience layers may customize presentation, but they must not fork business logic or intelligence contracts.**

All experiences (Admin Portal, Vendor Portal, future Customer Experience, future Mobile App) consume the same frozen FoundOurMarket™ Platform v1.0. They may differ only in:

- Permissions
- Scope of data (e.g. vendor sees only their own listings)
- UI complexity
- Navigation

They MUST NOT differ in:

- Scoring
- Recommendations
- Intelligence behaviour
- Public contracts

**How to apply:**

- Every experience imports the same public contracts (`IntelligenceModule`, `Recommendation`, `MarketplaceReadiness`, `SmartQueues`, `RecommendationAnalytics`, etc.).
- Data scoping happens via filtering the read model (e.g. `vendorId === current`), never by re-implementing an analyzer.
- If an experience "needs" a different score, the missing dimension is added to the correct intelligence layer as an additive contract field — never forked in the experience.
- No experience introduces a second publish engine, scoring engine, or recommendation broker.

**Architecture:**

```
Experience Layer
  ├── Admin Portal
  ├── Vendor Portal
  ├── Customer Experience (future)
  └── Mobile (future)
        │
        ▼
FoundOurMarket™ Platform v1.0 (frozen)
  Marketplace Operations · Marketplace Health
  Marketplace Intelligence · Catalog Intelligence · Image Intelligence
```
