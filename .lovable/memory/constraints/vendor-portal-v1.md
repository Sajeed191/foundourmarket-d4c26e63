---
name: Vendor Portal v1 (FROZEN)
description: Vendor experience is complete and frozen — Dashboard, Product Editor, Work Queue, Analytics, Publish Assistant
type: constraint
---
Vendor Portal v1 is FROZEN. Surfaces: `/vendor`, `/vendor-product/$slug`,
`/vendor-work-queue`, `/vendor-analytics`, `/vendor-publish/$slug`.

Allowed changes: bug fixes, perf, UX polish, copy tweaks.
Forbidden: new intelligence, new scoring, forking Admin logic, new public
contracts. All vendor surfaces MUST remain a presentation layer over the
frozen Platform v1.0 contracts (Marketplace Readiness, Recommendation
Broker, Smart Work Queue, Vendor Intelligence, Marketplace Health).

New vendor-facing work goes through composition of these contracts, never
by re-opening the intelligence or operations layers.
