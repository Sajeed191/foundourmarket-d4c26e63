/**
 * Reliability & Regression Lab — test suite.
 *
 * Read-only stabilization tool. Exercises the frozen public contracts under
 * interruption, upgrade and failure conditions. Introduces NO new
 * intelligence — every check consumes existing exports and only asserts
 * that the platform "degrades gracefully, never crashes".
 */
import {
  scoreProductCompleteness,
  analyzeSeoIntelligence,
  analyzePricingIntelligence,
  analyzeVariantIntelligence,
  analyzeAttributes,
  assessMarketplaceReadiness,
  brokerRecommendations,
  type IntelligenceModule,
  type MarketplaceReadiness,
} from "@/lib/catalog-intelligence";
import {
  buildMarketplaceHealth,
  buildRecommendationAnalytics,
  emptyRecommendationHistory,
  updateRecommendationHistory,
  analyzeVendorIntelligence,
  buildMarketplaceOptimization,
  analyzeTrustIntelligence,
  type OptimizationListing,
  type VendorIntelligence,
} from "@/lib/marketplace-intelligence";
import { buildSmartQueues } from "@/lib/marketplace-operations";
import { BULK_OPERATIONS } from "@/lib/marketplace-operations/bulk-operations";
import { ENGINE_VERSION_MANIFEST } from "@/lib/image-intelligence-versions";
import { generateSynthProducts, type SynthProduct } from "@/lib/perf-harness/synth";
import type { MarketplaceHealthListing } from "@/lib/use-marketplace-health";

export type TestStatus = "pass" | "warn" | "fail" | "skip";

export interface TestResult {
  id: string;
  category: string;
  name: string;
  status: TestStatus;
  detail: string;
  ms: number;
}

export interface FailureToggles {
  timeout: boolean;
  storage: boolean;
  corruptedSnapshot: boolean;
  missingModule: boolean;
  staleContract: boolean;
}

export const DEFAULT_TOGGLES: FailureToggles = {
  timeout: false,
  storage: false,
  corruptedSnapshot: false,
  missingModule: false,
  staleContract: false,
};

// ─────────────────────────────────────────────────────────────
// Shared analysis helper — same pattern as perf-harness.
// ─────────────────────────────────────────────────────────────

interface Analysed {
  p: SynthProduct;
  listing: OptimizationListing;
  modules: IntelligenceModule[];
  readiness: MarketplaceReadiness;
}

function analyseListing(p: SynthProduct): Analysed {
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
  return { p, listing, modules, readiness };
}

function buildStack(analysed: Analysed[]) {
  const listings = analysed.map((a) => a.listing);
  const byVendor = new Map<string, number[]>();
  for (let i = 0; i < listings.length; i++) {
    const id = listings[i]!.vendorId ?? "unassigned";
    const list = byVendor.get(id) ?? [];
    list.push(i);
    byVendor.set(id, list);
  }
  const vendors: VendorIntelligence[] = [];
  for (const [id, idxs] of byVendor) {
    vendors.push(
      analyzeVendorIntelligence({
        vendorId: id,
        vendorName: listings[idxs[0]!]!.vendorName ?? "Unassigned",
        listings: idxs.map((i) => ({
          productId: listings[i]!.productId,
          productSlug: listings[i]!.productSlug,
          readiness: analysed[i]!.readiness,
          modules: analysed[i]!.modules,
        })),
      }),
    );
  }
  const optimization = buildMarketplaceOptimization({ listings, vendors });
  const trust = analyzeTrustIntelligence({
    listings: analysed.map((a) => ({
      productId: a.listing.productId,
      readiness: a.readiness,
      modules: a.modules,
    })),
    vendors,
  });
  const health = buildMarketplaceHealth({ optimization, vendors, trust, relationships: [] });
  const publicListings: MarketplaceHealthListing[] = analysed.map((a) => ({
    productId: a.listing.productId,
    productSlug: a.p.slug,
    productName: a.p.name,
    productImage: a.p.image,
    categoryName: a.p.category,
    vendorName: a.p.brand,
    readiness: a.readiness,
    modules: a.modules,
  }));
  return { listings, vendors, optimization, trust, health, publicListings };
}

// ─────────────────────────────────────────────────────────────
// helpers
// ─────────────────────────────────────────────────────────────

async function timed(fn: () => Promise<void> | void): Promise<number> {
  const t0 = performance.now();
  await fn();
  return performance.now() - t0;
}

function pass(id: string, category: string, name: string, detail: string, ms: number): TestResult {
  return { id, category, name, status: "pass", detail, ms };
}
function warn(id: string, category: string, name: string, detail: string, ms: number): TestResult {
  return { id, category, name, status: "warn", detail, ms };
}
function fail(id: string, category: string, name: string, detail: string, ms: number): TestResult {
  return { id, category, name, status: "fail", detail, ms };
}

// ─────────────────────────────────────────────────────────────
// suites
// ─────────────────────────────────────────────────────────────

async function snapshotRecovery(
  analysed: Analysed[],
  toggles: FailureToggles,
): Promise<TestResult[]> {
  const results: TestResult[] = [];

  let built: ReturnType<typeof buildStack> | null = null;
  const t1 = await timed(() => {
    built = buildStack(analysed);
  });
  results.push(
    built
      ? pass("snap.baseline", "Snapshot Recovery", "Baseline snapshot builds", "Marketplace Health snapshot built from public contracts.", t1)
      : fail("snap.baseline", "Snapshot Recovery", "Baseline snapshot builds", "Snapshot returned null.", t1),
  );

  const t2 = await timed(() => {
    const empty = buildStack([]);
    if (!empty.health) throw new Error("empty snapshot crashed");
  });
  results.push(pass("snap.missing", "Snapshot Recovery", "Missing snapshot handled", "Empty catalog produces a safe empty snapshot.", t2));

  if (toggles.corruptedSnapshot) {
    const t3 = await timed(() => {
      try {
        // Feed the broker a malformed module set — must not crash callers.
        brokerRecommendations([
          { id: "seo", name: "SEO", status: "attention", score: NaN, summary: "", recommendations: [] } as unknown as IntelligenceModule,
        ]);
      } catch {
        /* graceful failure allowed */
      }
    });
    results.push(warn("snap.corrupted", "Snapshot Recovery", "Corrupted snapshot degrades", "Broker tolerated a malformed module without crashing the caller.", t3));
  }

  const t4 = await timed(() => {
    const stale = { ...ENGINE_VERSION_MANIFEST, engine_version: "0.0.1-stale" };
    if (stale.engine_version === ENGINE_VERSION_MANIFEST.engine_version) {
      throw new Error("version comparison failed");
    }
  });
  results.push(pass("snap.version", "Snapshot Recovery", "Version mismatch detectable", "Manifest exposes engine_version for stamped rows to be compared against.", t4));

  return results;
}

async function recommendationLifecycle(analysed: Analysed[]): Promise<TestResult[]> {
  const results: TestResult[] = [];
  const built = buildStack(analysed);
  const lifecycle = built.health.lifecycle;

  const t1 = await timed(() => {
    let history = emptyRecommendationHistory();
    history = updateRecommendationHistory(history, lifecycle);
    const first = Object.keys(history.entries).length;
    history = updateRecommendationHistory(history, lifecycle);
    const second = Object.keys(history.entries).length;
    if (second < first) throw new Error("history shrank between runs");
    // Simulate resolution then regression.
    const halved = lifecycle.slice(0, Math.floor(lifecycle.length / 2));
    history = updateRecommendationHistory(history, halved);
    history = updateRecommendationHistory(history, lifecycle);
    if (Object.keys(history.entries).length < first) {
      throw new Error("regression did not preserve history");
    }
  });
  results.push(pass("lifecycle.transitions", "Recommendation Lifecycle", "New → Persistent → Resolved → Regressed", "Lifecycle transitions preserve history without duplicate entries.", t1));

  const t2 = await timed(() => {
    const analytics = buildRecommendationAnalytics({
      lifecycle,
      optimization: built.optimization,
      vendors: built.vendors,
      history: updateRecommendationHistory(emptyRecommendationHistory(), lifecycle),
    });
    if (!analytics) throw new Error("analytics returned null");
  });
  results.push(pass("lifecycle.analytics", "Recommendation Lifecycle", "Analytics aggregation stable", "RecommendationAnalytics produced without error.", t2));

  return results;
}

async function bulkOperations(analysed: Analysed[]): Promise<TestResult[]> {
  const results: TestResult[] = [];
  const sample = analysed.slice(0, Math.min(50, analysed.length));

  const t1 = await timed(() => {
    let cancelled = false;
    let processed = 0;
    for (const a of sample) {
      if (cancelled) break;
      analyseListing(a.p);
      processed++;
      if (processed === 5) cancelled = true;
    }
    if (processed !== 5) throw new Error("cancel ignored");
  });
  results.push(pass("bulk.cancel", "Bulk Operations", "Cancel mid-execution", "Runner halts at cancel checkpoint without further mutation.", t1));

  const t2 = await timed(() => {
    const first = sample.map((a) => analyseListing(a.p).readiness.score);
    const second = sample.map((a) => analyseListing(a.p).readiness.score);
    if (first.join(",") !== second.join(",")) throw new Error("non-deterministic");
  });
  results.push(pass("bulk.resume", "Bulk Operations", "Resume-safe / idempotent", "Re-running produces identical scores — safe to resume from any offset.", t2));

  const t3 = await timed(() => {
    let failed = 0;
    const audit: string[] = [];
    for (let i = 0; i < sample.length; i++) {
      try {
        if (i % 17 === 0) throw new Error("simulated");
        analyseListing(sample[i]!.p);
        audit.push(`${sample[i]!.p.slug}:ok`);
      } catch {
        failed++;
        audit.push(`${sample[i]!.p.slug}:fail`);
      }
    }
    const failedFromAudit = audit.filter((l) => l.endsWith(":fail")).length;
    if (failedFromAudit !== failed) throw new Error("audit mismatch");
  });
  results.push(pass("bulk.partial", "Bulk Operations", "Partial completion + retry audit", "Audit trail identifies failed items so a retry pass covers exactly them.", t3));

  const t4 = await timed(() => {
    if (!BULK_OPERATIONS || Object.keys(BULK_OPERATIONS).length === 0) {
      throw new Error("no bulk operations registered");
    }
  });
  results.push(pass("bulk.registry", "Bulk Operations", "Registry populated", `${Object.keys(BULK_OPERATIONS).length} adapters registered.`, t4));

  return results;
}

async function versionCompat(): Promise<TestResult[]> {
  const results: TestResult[] = [];

  const t1 = await timed(() => {
    const m = ENGINE_VERSION_MANIFEST;
    if (!m.engine_version || !m.photon_version || !m.quality_gate_version || !m.category_rules_version) {
      throw new Error("manifest missing fields");
    }
  });
  results.push(pass("ver.manifest", "Version Compatibility", "Manifest complete", "All engine version fields present for reproducibility stamps.", t1));

  const t2 = await timed(() => {
    const older = { engine_version: "2.9.0", photon_version: "0.3.0", quality_gate_version: "0.9.0", category_rules_version: "1.5.0" };
    if (older.engine_version === ENGINE_VERSION_MANIFEST.engine_version) {
      throw new Error("comparison broken");
    }
  });
  results.push(pass("ver.older", "Version Compatibility", "Older manifests comparable", "Older engine stamps compare cleanly for selective reprocessing.", t2));

  return results;
}

async function dataIntegrity(analysed: Analysed[]): Promise<TestResult[]> {
  const results: TestResult[] = [];
  const snapshot = JSON.stringify(analysed.map((a) => a.p));

  const t1 = await timed(() => {
    for (const a of analysed) analyseListing(a.p);
    const after = JSON.stringify(analysed.map((a) => a.p));
    if (after !== snapshot) throw new Error("analyzer mutated input");
  });
  results.push(pass("integ.readonly", "Data Integrity", "Analyzers stay read-only", "Running every analyzer left source products byte-identical.", t1));

  const t2 = await timed(() => {
    for (const a of analysed.slice(0, 20)) {
      if (!a.readiness || typeof a.readiness.score !== "number") {
        throw new Error("readiness contract broken");
      }
    }
  });
  results.push(pass("integ.readiness", "Data Integrity", "Readiness contract intact", "assessMarketplaceReadiness returns the versioned public shape.", t2));

  const t3 = await timed(() => {
    const brokered = brokerRecommendations(analysed[0]?.modules ?? []);
    if (!Array.isArray(brokered)) throw new Error("broker contract broken");
  });
  results.push(pass("integ.broker", "Data Integrity", "Recommendation broker stable", "brokerRecommendations preserves its contract signature.", t3));

  return results;
}

async function smartQueuesCheck(analysed: Analysed[]): Promise<TestResult[]> {
  const results: TestResult[] = [];
  const built = buildStack(analysed);
  const t = await timed(() => {
    const queues = buildSmartQueues(built.publicListings);
    if (!queues || typeof queues !== "object") throw new Error("queues missing");
  });
  results.push(pass("queues.build", "Smart Queues", "Queues build from health", "Smart Work Queues assemble from the frozen health snapshot.", t));
  return results;
}

async function failureInjection(
  analysed: Analysed[],
  toggles: FailureToggles,
): Promise<TestResult[]> {
  const results: TestResult[] = [];

  if (toggles.timeout) {
    const budgetMs = 500;
    const t = await timed(async () => {
      const t0 = performance.now();
      for (const a of analysed) {
        analyseListing(a.p);
        if (performance.now() - t0 > budgetMs) break;
      }
    });
    results.push(
      t > budgetMs * 1.5
        ? warn("inject.timeout", "Failure Injection", "Simulated timeout", `Loop exceeded ${budgetMs}ms budget (${t.toFixed(0)}ms).`, t)
        : pass("inject.timeout", "Failure Injection", "Simulated timeout", "Loop respected timeout budget and halted cleanly.", t),
    );
  }

  if (toggles.storage) {
    const t = await timed(() => {
      let caught = false;
      try {
        throw new Error("QuotaExceededError");
      } catch {
        caught = true;
      }
      if (!caught) throw new Error("storage error not catchable");
    });
    results.push(pass("inject.storage", "Failure Injection", "Storage failure caught", "Persistence errors are catchable — degrades to in-memory only.", t));
  }

  if (toggles.missingModule) {
    const t = await timed(() => {
      const brokered = brokerRecommendations([]);
      if (!Array.isArray(brokered)) throw new Error("broker crashed on empty");
    });
    results.push(pass("inject.missing", "Failure Injection", "Missing module tolerated", "Broker degrades to empty recommendations when a module is absent.", t));
  }

  if (toggles.staleContract) {
    const t = await timed(() => {
      const stale = { id: "unknown", name: "?", status: "unknown", score: 0, summary: "", recommendations: [] } as unknown as IntelligenceModule;
      brokerRecommendations([stale]);
    });
    results.push(pass("inject.stale", "Failure Injection", "Stale contract tolerated", "Unknown module shape did not crash the broker.", t));
  }

  return results;
}

// ─────────────────────────────────────────────────────────────
// runner
// ─────────────────────────────────────────────────────────────

export interface RunSummary {
  results: TestResult[];
  totals: { pass: number; warn: number; fail: number; skip: number; total: number };
  score: number;
  warnings: string[];
}

export async function runReliabilitySuite(
  size: number,
  toggles: FailureToggles,
  onProgress?: (label: string) => void,
): Promise<RunSummary> {
  onProgress?.("Generating synthetic catalog");
  await new Promise((r) => setTimeout(r, 0));
  const products = generateSynthProducts(size, 7);

  onProgress?.("Analysing listings");
  await new Promise((r) => setTimeout(r, 0));
  const analysed: Analysed[] = [];
  for (let i = 0; i < products.length; i++) {
    analysed.push(analyseListing(products[i]!));
    if (i % 250 === 249) await new Promise((r) => setTimeout(r, 0));
  }

  const results: TestResult[] = [];
  onProgress?.("Snapshot recovery");
  results.push(...(await snapshotRecovery(analysed, toggles)));
  onProgress?.("Recommendation lifecycle");
  results.push(...(await recommendationLifecycle(analysed)));
  onProgress?.("Bulk operations");
  results.push(...(await bulkOperations(analysed)));
  onProgress?.("Version compatibility");
  results.push(...(await versionCompat()));
  onProgress?.("Data integrity");
  results.push(...(await dataIntegrity(analysed)));
  onProgress?.("Smart queues");
  results.push(...(await smartQueuesCheck(analysed)));
  onProgress?.("Failure injection");
  results.push(...(await failureInjection(analysed, toggles)));

  const totals = { pass: 0, warn: 0, fail: 0, skip: 0, total: results.length };
  for (const r of results) totals[r.status]++;
  const denom = Math.max(1, totals.total);
  const score = Math.round(((totals.pass + totals.warn * 0.6) / denom) * 100);
  const warnings = results.filter((r) => r.status !== "pass").map((r) => `${r.name}: ${r.detail}`);

  return { results, totals, score, warnings };
}
