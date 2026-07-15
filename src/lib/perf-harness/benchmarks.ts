/**
 * Perf & Scale benchmarks — Stabilization Sprint tool.
 *
 * Runs each frozen Intelligence + Operations pipeline against synthetic
 * product sets and returns wall-clock timings. Uses only the existing
 * public analyzer exports — this file adds NO new intelligence.
 *
 * Kept out of the app bundle: only imported by the admin perf-harness route.
 */
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
import {
  analyzeVendorIntelligence,
  buildMarketplaceOptimization,
  analyzeTrustIntelligence,
  buildMarketplaceHealth,
  buildRecommendationAnalytics,
  emptyRecommendationHistory,
  updateRecommendationHistory,
  type OptimizationListing,
} from "@/lib/marketplace-intelligence";
import { buildSmartQueues } from "@/lib/marketplace-operations";
import { BULK_OPERATIONS, BULK_OPERATION_ORDER } from "@/lib/marketplace-operations/bulk-operations";
import type { MarketplaceHealthListing } from "@/lib/use-marketplace-health";
import type { SynthProduct } from "./synth";

export interface StageTiming {
  label: string;
  ms: number;
  itemsPerSecond?: number;
  extra?: Record<string, number | string>;
}

export interface BenchmarkResult {
  productCount: number;
  stages: StageTiming[];
  totalMs: number;
  budgets: BudgetVerdict[];
}

export interface PerfBudget {
  stage: string;
  /** Max ms allowed for this stage at the tested product count. */
  max: (n: number) => number;
}

export interface BudgetVerdict {
  stage: string;
  ms: number;
  budgetMs: number;
  ok: boolean;
}

/** Baseline budgets — tuneable, not authoritative. Reflects the "feels fine" bar. */
export const DEFAULT_BUDGETS: PerfBudget[] = [
  { stage: "Product Editor (single product cold)", max: () => 25 },
  { stage: "Product Editor (single product warm)", max: () => 15 },
  { stage: "Listing analysis", max: (n) => Math.max(500, n * 1.5) },
  { stage: "Vendor + Optimization + Trust", max: (n) => Math.max(200, n * 0.5) },
  { stage: "Marketplace Health build", max: (n) => Math.max(150, n * 0.3) },
  { stage: "Smart Queues build", max: (n) => Math.max(120, n * 0.25) },
  { stage: "Recommendation Analytics build", max: (n) => Math.max(150, n * 0.3) },
];

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const now = () => (typeof performance !== "undefined" ? performance.now() : Date.now());

function analyseListing(p: SynthProduct): {
  listing: OptimizationListing;
  modules: IntelligenceModule[];
  readiness: MarketplaceReadiness;
} {
  const modules: IntelligenceModule[] = [
    analyzeAttributes({
      category: p.category,
      attributes: p.attributes,
      specifications: p.specifications,
    }),
    scoreProductCompleteness({
      slug: p.slug,
      name: p.name,
      category: p.category,
      description: p.description,
      seoTitle: p.seoTitle,
      seoDescription: p.seoDescription,
      metaKeywords: p.metaKeywords,
      imageCount: p.image ? 1 : 0,
      imageQuality: null,
      attributes: p.attributes,
      specifications: p.specifications,
      specCount: Object.values(p.specifications ?? {}).filter((v) => v != null && v !== "").length,
      variantCount: 0,
    }),
    analyzeVariantIntelligence({
      slug: p.slug,
      productName: p.name,
      productPrice: p.priceInr ?? p.priceUsd ?? null,
      variants: [],
    }),
    analyzeSeoIntelligence({
      slug: p.slug,
      name: p.name,
      seoTitle: p.seoTitle,
      seoDescription: p.seoDescription,
      description: p.description,
      keywords: p.metaKeywords,
      imageAlt: p.name,
      category: p.category,
      hasFaq: false,
      hasRelated: false,
      hasImage: !!p.image,
    }),
    analyzePricingIntelligence({
      slug: p.slug,
      productName: p.name,
      price: p.priceInr ?? p.priceUsd ?? null,
      comparePrice: p.comparePriceInr ?? p.comparePriceUsd ?? null,
      cost: p.costPriceInr ?? p.costPriceUsd ?? null,
      variants: [],
    }),
  ];
  const readiness = assessMarketplaceReadiness(modules);
  const vendorId = (p.brand.trim() || "unassigned").toLowerCase();
  const listing: OptimizationListing = {
    productId: p.id,
    productSlug: p.slug,
    vendorId,
    vendorName: p.brand,
    categoryId: p.category,
    categoryName: p.category,
    readiness,
    modules,
  };
  return { listing, modules, readiness };
}

// ---------------------------------------------------------------------------
// Full-pipeline benchmark for one product count
// ---------------------------------------------------------------------------

export async function runBenchmark(
  products: SynthProduct[],
  onStage?: (label: string) => void,
): Promise<BenchmarkResult> {
  const stages: StageTiming[] = [];
  const productCount = products.length;

  // -- Stage 1 : Product Editor single-product cold + warm (uses first product)
  onStage?.("Product Editor timing");
  {
    const p = products[0]!;
    const cold = now();
    analyseListing(p);
    const coldMs = now() - cold;
    // Warm run after JIT / module warm-up
    for (let i = 0; i < 3; i++) analyseListing(p);
    const warm = now();
    analyseListing(p);
    const warmMs = now() - warm;
    stages.push({ label: "Product Editor (single product cold)", ms: coldMs });
    stages.push({ label: "Product Editor (single product warm)", ms: warmMs });
  }

  // Yield so the UI can paint between heavy stages.
  await new Promise((r) => setTimeout(r, 0));

  // -- Stage 2 : Full listing analysis for the sample
  onStage?.("Listing analysis");
  const listings: OptimizationListing[] = new Array(productCount);
  const modulesByListing: IntelligenceModule[][] = new Array(productCount);
  const readinessByListing: MarketplaceReadiness[] = new Array(productCount);
  const listingStart = now();
  for (let i = 0; i < productCount; i++) {
    const a = analyseListing(products[i]!);
    listings[i] = a.listing;
    modulesByListing[i] = a.modules;
    readinessByListing[i] = a.readiness;
    if (i % 500 === 499) await new Promise((r) => setTimeout(r, 0));
  }
  const listingMs = now() - listingStart;
  stages.push({
    label: "Listing analysis",
    ms: listingMs,
    itemsPerSecond: productCount / (listingMs / 1000),
  });

  await new Promise((r) => setTimeout(r, 0));

  // -- Stage 3 : Vendor + Optimization + Trust
  onStage?.("Vendor + Optimization + Trust");
  const rollupStart = now();
  const byVendor = new Map<string, number[]>();
  for (let i = 0; i < listings.length; i++) {
    const id = listings[i]!.vendorId ?? "unassigned";
    const list = byVendor.get(id) ?? [];
    list.push(i);
    byVendor.set(id, list);
  }
  const vendors = [];
  for (const [id, idxs] of byVendor) {
    vendors.push(
      analyzeVendorIntelligence({
        vendorId: id,
        vendorName: listings[idxs[0]!]!.vendorName ?? "Unassigned",
        listings: idxs.map((i) => ({
          productId: listings[i]!.productId,
          productSlug: listings[i]!.productSlug,
          readiness: readinessByListing[i]!,
          modules: modulesByListing[i]!,
        })),
      }),
    );
  }
  const optimization = buildMarketplaceOptimization({ listings, vendors });
  const trust = analyzeTrustIntelligence({
    listings: listings.map((l, i) => ({
      productId: l.productId,
      readiness: readinessByListing[i]!,
      modules: modulesByListing[i]!,
    })),
    vendors,
  });
  stages.push({
    label: "Vendor + Optimization + Trust",
    ms: now() - rollupStart,
    extra: { vendors: vendors.length, listings: optimization.listingCount },
  });

  await new Promise((r) => setTimeout(r, 0));

  // -- Stage 4 : Marketplace Health
  onStage?.("Marketplace Health build");
  const healthStart = now();
  const health = buildMarketplaceHealth({ optimization, vendors, trust, relationships: [] });
  stages.push({ label: "Marketplace Health build", ms: now() - healthStart });

  await new Promise((r) => setTimeout(r, 0));

  // -- Stage 5 : Smart Queues
  onStage?.("Smart Queues build");
  const publicListings: MarketplaceHealthListing[] = listings.map((l, i) => ({
    productId: l.productId,
    productSlug: l.productSlug ?? products[i]!.slug,
    productName: products[i]!.name,
    productImage: products[i]!.image,
    categoryName: l.categoryName ?? products[i]!.category,
    vendorName: l.vendorName ?? null,
    readiness: readinessByListing[i]!,
    modules: modulesByListing[i]!,
  }));
  const queuesStart = now();
  const queues = buildSmartQueues(publicListings);
  stages.push({
    label: "Smart Queues build",
    ms: now() - queuesStart,
    extra: { totalOpen: queues.totalOpen },
  });

  await new Promise((r) => setTimeout(r, 0));

  // -- Stage 6 : Recommendation Analytics
  onStage?.("Recommendation Analytics build");
  const history = updateRecommendationHistory(emptyRecommendationHistory(), health.lifecycle);
  const analyticsStart = now();
  buildRecommendationAnalytics({
    lifecycle: health.lifecycle,
    optimization,
    vendors,
    history,
  });
  stages.push({ label: "Recommendation Analytics build", ms: now() - analyticsStart });

  // Verdicts against the default budget table
  const budgets: BudgetVerdict[] = stages.map((s) => {
    const b = DEFAULT_BUDGETS.find((x) => x.stage === s.label);
    const budgetMs = b ? b.max(productCount) : Infinity;
    return { stage: s.label, ms: s.ms, budgetMs, ok: s.ms <= budgetMs };
  });

  const totalMs = stages.reduce((a, s) => a + s.ms, 0);
  return { productCount, stages, totalMs, budgets };
}

// ---------------------------------------------------------------------------
// Bulk-op throughput micro-benchmark
// ---------------------------------------------------------------------------

export interface BulkThroughput {
  type: string;
  label: string;
  items: number;
  ms: number;
  itemsPerSecond: number;
}

export async function measureBulkThroughput(
  products: SynthProduct[],
  slice = 500,
): Promise<BulkThroughput[]> {
  const analysed = products.slice(0, slice).map((p) => ({ p, ...analyseListing(p) }));
  const listings: MarketplaceHealthListing[] = analysed.map((a) => ({
    productId: a.listing.productId,
    productSlug: a.p.slug,
    productName: a.p.name,
    productImage: a.p.image,
    categoryName: a.p.category,
    vendorName: a.p.brand,
    readiness: a.readiness,
    modules: a.modules,
  }));
  const results: BulkThroughput[] = [];
  for (const type of BULK_OPERATION_ORDER) {
    const spec = BULK_OPERATIONS[type];
    const targets = listings.filter(spec.eligible);
    const start = now();
    for (const l of targets) {
      // eslint-disable-next-line no-await-in-loop
      await spec.run(l, {
        slug: l.productSlug,
        name: l.productName,
        category: l.categoryName,
        image: l.productImage,
      });
    }
    const ms = now() - start;
    results.push({
      type,
      label: spec.label,
      items: targets.length,
      ms,
      itemsPerSecond: targets.length / Math.max(0.001, ms / 1000),
    });
    await new Promise((r) => setTimeout(r, 0));
  }
  return results;
}
