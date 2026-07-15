---
name: Composition-first contracts
description: Every new feature must first attempt to compose existing frozen platform contracts before introducing a new public contract. Prevents contract sprawl.
type: constraint
---

# Composition-first rule

Before adding any new public contract (new IntelligenceModule, new Operations
surface, new versioned type in the platform layer), the work MUST first answer:

> "Can this be built by composing existing frozen contracts?"

Only introduce a new public contract when composition is **genuinely
insufficient** — e.g. a new class of decision the platform cannot express, or
a new operational primitive with no existing analog.

## What counts as composition

- Reading `IntelligenceModule` results, `Recommendation`s, `VendorIntelligence`,
  `MarketplaceHealth`, or `MarketplaceReadiness` and presenting them differently.
- Filtering existing Work Queue / Bulk Operations by scope (vendor_id, tier, tag).
- New UI surfaces (Vendor Portal, Customer Experience, Mobile) that reuse the
  same hooks and contracts as Admin.
- New analytics rollups derived from existing recommendation history.

## What is NOT composition (requires review)

- A new scoring formula that duplicates or forks an existing analyzer.
- Vendor- or customer-specific "intelligence" that re-implements platform logic.
- A parallel recommendation stream that bypasses the Recommendation Broker.

## Why

Keeps FoundOurMarket™ Platform v1.0 lean, stable, and versionable. Each new
contract is a permanent maintenance surface — the bar is high on purpose.

**Order of preference:** compose → configure → extend adapter → (last resort) new contract.
