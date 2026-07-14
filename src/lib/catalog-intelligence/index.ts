/**
 * Catalog Intelligence — public surface.
 *
 * The unified, explainable intelligence layer on top of the existing
 * Marketplace Intelligence engines. Deterministic scoring, grounded in real
 * catalog data, with human-readable reasons for every decision. Never blocks,
 * never mutates content.
 */
export * from "./types";
export { buildFingerprint, sharesStrongCode } from "./fingerprint";
export {
  classifyRelationship,
  classifyMatches,
  isDuplicateRisk,
  RELATIONSHIP_LABEL,
} from "./relationships";
export { scoreCatalogHealth } from "./catalog-health";
export type { HealthInput, CatalogHealth, HealthDimension, HealthSuggestion } from "./catalog-health";
export { analyzeImage, analyzeGallery } from "./image-quality";
export type { ImageQuality, ImageIssue, ImageIssueKey } from "./image-quality";
export { suggestSpecs } from "./spec-suggest";
export type { SpecSuggestion, SpecPeer } from "./spec-suggest";
export { analyzeVariants } from "./variant-health";
export type { VariantRow, VariantIssue, VariantIssueKey, VariantHealth } from "./variant-health";
export { analyzeSeo } from "./seo-advisor";
export type { SeoAdvisory, SeoAdvisoryKey, SeoDraft, SeoIntelligence } from "./seo-advisor";
export { scoreVendor } from "./vendor-quality";
export type { VendorSignals, VendorQuality } from "./vendor-quality";
export { buildOptimizerReport } from "./catalog-optimizer";
export type { OptimizerProduct, OptimizerRow, OptimizerReport } from "./catalog-optimizer";
export { recommendAction } from "./recommendation";
export type { AiRecommendation, RecommendedActionKind } from "./recommendation";
export { statusFromScore } from "./intelligence-module";
export type { IntelligenceModule, IntelligenceStatus, Evidence, EvidenceSeverity, PotentialImpact } from "./intelligence-module";
export { scoreProductCompleteness } from "./product-completeness";
export type { CompletenessInput, ProductCompleteness } from "./product-completeness";
export { analyzeAttributes } from "./attribute-intelligence";
export type { AttributeInput, AttributeIntelligence } from "./attribute-intelligence";
export { analyzeVariantIntelligence } from "./variant-intelligence";
export type { VariantInput, VariantRecord, VariantIntelligence } from "./variant-intelligence";
export { analyzeSeoIntelligence } from "./seo-intelligence";
export type { SeoIntelligenceInput, SeoIntelligenceModule } from "./seo-intelligence";
export { analyzePricingIntelligence } from "./pricing-intelligence";
export type { PricingInput, PricingIntelligence } from "./pricing-intelligence";
export { brokerRecommendations, topRecommendation } from "./recommendation-broker";
export type { Recommendation } from "./recommendation-broker";
export { CATEGORY_PROFILES, GENERIC_PROFILE, profileFor } from "./category-profiles";
export type { AttributeProfile } from "./category-profiles";
export {
  assessMarketplaceReadiness,
  READINESS_LABEL,
  READINESS_DOT,
  READINESS_EMOJI,
} from "./marketplace-readiness";
export type { MarketplaceReadiness, ReadinessStatus } from "./marketplace-readiness";





