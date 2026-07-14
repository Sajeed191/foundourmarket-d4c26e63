/**
 * Marketplace Intelligence 3.0 — public surface.
 *
 * Layer 3 of the FoundOurMarket™ intelligence stack. Whereas Catalog
 * Intelligence 2.0 evaluates a single listing, Marketplace Intelligence
 * evaluates the marketplace as a whole: vendors, cross-catalog optimisation,
 * relationships, and trust.
 *
 * PERMANENT ARCHITECTURAL RULE
 * ────────────────────────────
 * No intelligence module may directly depend on another module's
 * implementation. It may consume only that module's public contract.
 *
 *   - Marketplace Readiness consumes MarketplaceReadiness, not internal SEO logic.
 *   - Recommendation Broker consumes IntelligenceModule, not Variant internals.
 *   - Vendor Intelligence consumes published scores, not private analysis code.
 *
 * This keeps modules independently testable, replaceable, and versionable.
 */
export { analyzeVendorIntelligence, VENDOR_HEALTH_LABEL } from "./vendor-intelligence";
export type {
  VendorIntelligence,
  VendorHealthTier,
  VendorListingSnapshot,
  VendorSignals,
} from "./vendor-intelligence";
export { buildMarketplaceOptimization } from "./marketplace-optimization";
export type {
  MarketplaceOptimization,
  OptimizationListing,
  CategoryRollup,
  EvidenceRollup,
} from "./marketplace-optimization";
