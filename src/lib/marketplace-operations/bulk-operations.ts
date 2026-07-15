/**
 * Bulk Operations — Marketplace Operations 1.0, Phase 2.
 *
 * PERMANENT ARCHITECTURAL RULE (project-wide):
 *   Intelligence produces decisions. Operations execute decisions.
 *
 * A bulk operation is a *runner* that invokes existing Intelligence Platform
 * analyzers over N products. It never implements its own detection, scoring,
 * or AI calls. It never mutates originals, auto-publishes, or changes prices.
 * Every run produces an audit trail (persisted in localStorage) so admins can
 * see exactly which items were analysed, when, and by whom.
 */
import type { MarketplaceHealthListing } from "@/lib/use-marketplace-health";
import {
  scoreProductCompleteness,
  analyzeAttributes,
  analyzeSeoIntelligence,
  analyzePricingIntelligence,
  analyzeVariantIntelligence,
  assessMarketplaceReadiness,
  type IntelligenceModule,
  type MarketplaceReadiness,
} from "@/lib/catalog-intelligence";

/** Every bulk operation the platform can run. Read-only by contract. */
export type BulkOperationType =
  | "marketplace-readiness"
  | "seo-refresh"
  | "pricing-refresh"
  | "catalog-refresh"
  | "image-analysis"
  | "image-normalization";

export type BulkStatus = "queued" | "running" | "completed" | "failed" | "cancelled";

export interface BulkOperation {
  id: string;
  type: BulkOperationType;
  label: string;
  status: BulkStatus;
  progress: number;              // 0..1
  totalItems: number;
  processedItems: number;
  failedItems: number;
  startedAt?: string;
  finishedAt?: string;
  cancelRequested?: boolean;
  /** Summary numbers per operation type — populated by the analyzer callback. */
  summary?: Record<string, number>;
  /** Small per-item audit sample (first 20 items) — never the full payload. */
  audit?: { productSlug: string; result: string }[];
  error?: string;
}

export interface BulkOperationSpec {
  type: BulkOperationType;
  label: string;
  emoji: string;
  description: string;
  doesNotDo: string;
  estimatedSecondsPerItem: number;
  /** Eligibility filter — decides which listings this operation acts on. */
  eligible: (l: MarketplaceHealthListing) => boolean;
  /**
   * Run the operation against a single listing. MUST invoke an existing
   * analyzer and return a short audit string. MUST NOT mutate anything.
   */
  run: (l: MarketplaceHealthListing, product: BulkOpProductLike) => Promise<BulkStepResult>;
}

export type BulkOpProductLike = {
  id?: string | null;
  slug: string;
  name: string;
  category?: string | null;
  description?: string | null;
  seoTitle?: string | null;
  seoDescription?: string | null;
  metaKeywords?: string[] | null;
  image?: string | null;
  priceInr?: number | null;
  priceUsd?: number | null;
  comparePriceInr?: number | null;
  comparePriceUsd?: number | null;
  costPriceInr?: number | null;
  costPriceUsd?: number | null;
  attributes?: Record<string, unknown> | null;
  specifications?: Record<string, unknown> | null;
};

export interface BulkStepResult {
  ok: boolean;
  audit: string;
  /** Optional counters merged into the operation summary. */
  counters?: Record<string, number>;
}

/* ------------------------------------------------------------------ *
 * Operation registry
 * ------------------------------------------------------------------ */

const attrsOf = (p: BulkOpProductLike) => p.attributes ?? null;
const specsOf = (p: BulkOpProductLike) => p.specifications ?? null;

/** Re-run Marketplace Readiness by re-composing existing modules. */
async function runMarketplaceReadiness(
  l: MarketplaceHealthListing,
): Promise<BulkStepResult> {
  const readiness: MarketplaceReadiness = assessMarketplaceReadiness(l.modules);
  return {
    ok: true,
    audit: `Readiness ${readiness.score} · ${readiness.status}`,
    counters: {
      ready: readiness.status === "ready" ? 1 : 0,
      almost_ready: readiness.status === "almost_ready" ? 1 : 0,
      needs_attention: readiness.status === "needs_attention" ? 1 : 0,
      not_ready: readiness.status === "not_ready" ? 1 : 0,
    },
  };
}

async function runSeoRefresh(
  _l: MarketplaceHealthListing,
  p: BulkOpProductLike,
): Promise<BulkStepResult> {
  const seo = analyzeSeoIntelligence({
    slug: p.slug,
    name: p.name,
    seoTitle: p.seoTitle ?? null,
    seoDescription: p.seoDescription ?? null,
    description: p.description ?? null,
    keywords: p.metaKeywords ?? null,
    imageAlt: p.name || null,
    category: p.category ?? null,
    hasFaq: false,
    hasRelated: false,
    hasImage: !!p.image,
  });
  const status = seo.status;
  return {
    ok: true,
    audit: `SEO ${seo.score} · ${status}`,
    counters: { [status]: 1 },
  };
}

async function runPricingRefresh(
  _l: MarketplaceHealthListing,
  p: BulkOpProductLike,
): Promise<BulkStepResult> {
  const pricing = analyzePricingIntelligence({
    slug: p.slug,
    productName: p.name,
    price: p.priceInr ?? p.priceUsd ?? null,
    comparePrice: p.comparePriceInr ?? p.comparePriceUsd ?? null,
    cost: p.costPriceInr ?? p.costPriceUsd ?? null,
    variants: [],
  });
  return {
    ok: true,
    audit: `Pricing ${pricing.score} · ${pricing.status}`,
    counters: { [pricing.status]: 1 },
  };
}

async function runCatalogRefresh(
  _l: MarketplaceHealthListing,
  p: BulkOpProductLike,
): Promise<BulkStepResult> {
  const modules: IntelligenceModule[] = [
    analyzeAttributes({
      category: p.category ?? null,
      attributes: attrsOf(p),
      specifications: specsOf(p),
    }),
    scoreProductCompleteness({
      slug: p.slug,
      name: p.name,
      category: p.category ?? null,
      description: p.description ?? null,
      seoTitle: p.seoTitle ?? null,
      seoDescription: p.seoDescription ?? null,
      metaKeywords: p.metaKeywords ?? null,
      imageCount: p.image ? 1 : 0,
      imageQuality: null,
      attributes: attrsOf(p),
      specifications: specsOf(p),
      specCount: Object.values(specsOf(p) ?? {}).filter((v) => v != null && v !== "").length,
      variantCount: 0,
    }),
    analyzeVariantIntelligence({
      slug: p.slug,
      productName: p.name,
      productPrice: p.priceInr ?? p.priceUsd ?? null,
      variants: [],
    }),
  ];
  const readiness = assessMarketplaceReadiness(modules);
  return {
    ok: true,
    audit: `Catalog ${readiness.score} · ${modules.length} modules`,
    counters: { modules: modules.length },
  };
}

async function runImageAnalysis(
  l: MarketplaceHealthListing,
  p: BulkOpProductLike,
): Promise<BulkStepResult> {
  // Uses the same Catalog Intelligence completeness signal that Image
  // Intelligence v3 feeds into. No new detection, no re-analysis of pixels.
  const hasImage = !!p.image;
  return {
    ok: true,
    audit: hasImage ? `Image present · readiness ${l.readiness.score}` : "No hero image",
    counters: { with_image: hasImage ? 1 : 0, missing_image: hasImage ? 0 : 1 },
  };
}

async function runImageNormalization(
  _l: MarketplaceHealthListing,
  p: BulkOpProductLike,
): Promise<BulkStepResult> {
  // Read-only dry run: reports what Image Normalization *would* do without
  // ever writing back. Actual normalization stays in Image Intelligence v3.
  const eligible = !!p.image;
  return {
    ok: true,
    audit: eligible ? "Eligible for normalization (dry run)" : "Skipped — no source image",
    counters: { eligible: eligible ? 1 : 0, skipped: eligible ? 0 : 1 },
  };
}

export const BULK_OPERATIONS: Record<BulkOperationType, BulkOperationSpec> = {
  "marketplace-readiness": {
    type: "marketplace-readiness",
    label: "Re-run Marketplace Readiness",
    emoji: "🟢",
    description: "Re-compose Marketplace Readiness scores over eligible listings.",
    doesNotDo: "Does not publish, unpublish, or edit any product.",
    estimatedSecondsPerItem: 0.02,
    eligible: () => true,
    run: (l) => runMarketplaceReadiness(l),
  },
  "seo-refresh": {
    type: "seo-refresh",
    label: "Rebuild SEO metadata",
    emoji: "🟡",
    description: "Refresh SEO Intelligence over listings that have a slug and name.",
    doesNotDo: "Does not overwrite SEO fields — reports advisories only.",
    estimatedSecondsPerItem: 0.03,
    eligible: (l) => !!l.productName,
    run: (l, p) => runSeoRefresh(l, p),
  },
  "pricing-refresh": {
    type: "pricing-refresh",
    label: "Refresh Pricing Intelligence",
    emoji: "🟣",
    description: "Re-evaluate margin, compare price, and cost gaps.",
    doesNotDo: "Never changes prices. Never adds or removes sales.",
    estimatedSecondsPerItem: 0.02,
    eligible: () => true,
    run: (l, p) => runPricingRefresh(l, p),
  },
  "catalog-refresh": {
    type: "catalog-refresh",
    label: "Refresh Catalog Intelligence",
    emoji: "🔵",
    description: "Re-run the Catalog Intelligence 2.0 module pipeline per listing.",
    doesNotDo: "Does not edit attributes, specifications, or variants.",
    estimatedSecondsPerItem: 0.05,
    eligible: () => true,
    run: (l, p) => runCatalogRefresh(l, p),
  },
  "image-analysis": {
    type: "image-analysis",
    label: "Analyze eligible images",
    emoji: "🖼️",
    description: "Report which listings have hero imagery and readiness impact.",
    doesNotDo: "Does not upload, replace, or reprocess any image.",
    estimatedSecondsPerItem: 0.02,
    eligible: () => true,
    run: (l, p) => runImageAnalysis(l, p),
  },
  "image-normalization": {
    type: "image-normalization",
    label: "Normalize eligible images (dry run)",
    emoji: "🧼",
    description: "Preview which images Image Intelligence v3 would normalize.",
    doesNotDo: "Dry run only — never overwrites originals.",
    estimatedSecondsPerItem: 0.02,
    eligible: (l) => l.readiness.status !== "not_ready",
    run: (l, p) => runImageNormalization(l, p),
  },
};

export const BULK_OPERATION_ORDER: BulkOperationType[] = [
  "marketplace-readiness",
  "seo-refresh",
  "pricing-refresh",
  "catalog-refresh",
  "image-analysis",
  "image-normalization",
];

export const STATUS_LABEL: Record<BulkStatus, string> = {
  queued: "Queued",
  running: "Running",
  completed: "Completed",
  failed: "Failed",
  cancelled: "Cancelled",
};
