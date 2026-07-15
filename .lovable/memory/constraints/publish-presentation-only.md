---
name: Publish is presentation over Marketplace Readiness
description: Permanent rule — the Vendor Publish Assistant (and any future publish surface) must only present Marketplace Readiness in a publishing context. It must never introduce new validation logic, a second scoring engine, or duplicate checks.
type: constraint
---
**Rule: Publishing must never introduce new validation logic. It only presents Marketplace Readiness in a publishing context.**

The publish decision is owned by the frozen platform:
- `MarketplaceReadiness.status` decides Ready / Almost Ready / Needs Attention / Not Ready.
- `MarketplaceReadiness.topRecommendation` is the single blocker to resolve next.
- `IntelligenceModule` results power the publish checklist (per-module ticks).

Publish surfaces MAY:
- Re-label status in publishing language ("Ready to Publish", "Complete Product").
- Show module ticks (✓ / ⚠ / ✗) already computed upstream.
- Deep-link the CTA to the appropriate editor section for the top blocker.
- Trigger the existing catalog write path once `status === "ready"`.

Publish surfaces MUST NOT:
- Re-check field completeness with their own heuristics.
- Compute a second "publish score" or override the Broker's ranking.
- Fork any analyzer or add new evidence keys.
- Introduce new required-field lists that live only in the publish flow.
- Show marketplace-wide comparisons or other vendors' data.

**Why:** prevents the publish flow from drifting away from the intelligence
platform over time. If a new signal is genuinely needed, it is added to the
correct intelligence layer as an additive contract field — never forked in
the publish surface.
