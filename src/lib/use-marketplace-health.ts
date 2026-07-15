/**
 * useMarketplaceHealth — Admin Home data hook.
 *
 * Runs the Catalog Intelligence 2.0 pipeline over the products cache,
 * groups listings by brand (used as the vendor identity in absence of a
 * dedicated vendors table), and composes the Marketplace Intelligence 3.0
 * outputs into a single MarketplaceHealth v1.0 snapshot.
 *
 * Consumes ONLY public contracts. Deterministic. Never mutates data.
 *
 * The last snapshot is memoised in localStorage so the next hook run can
 * compute trends (↑/→/↓) and Recommendation lifecycle states.
 */
import { useEffect, useMemo, useRef, useState } from "react";
import { useProducts } from "@/lib/use-products";
import type { Product } from "@/lib/products";
import {
  scoreProductCompleteness,
  analyzeAttributes,
  analyzeVariantIntelligence,
  analyzeSeoIntelligence,
  analyzePricingIntelligence,
  assessMarketplaceReadiness,
  type IntelligenceModule,
  type MarketplaceReadiness,
} from "@/lib/catalog-intelligence";
import {
  analyzeVendorIntelligence,
  buildMarketplaceOptimization,
  analyzeTrustIntelligence,
  buildMarketplaceHealth,
  type OptimizationListing,
  type MarketplaceHealth,
  type MarketplaceHealthPrevious,
  type VendorIntelligence,
  type TrustIntelligence,
} from "@/lib/marketplace-intelligence";

const SNAPSHOT_KEY = "fom.marketplace-health.prev.v1";
/** Cap the analysis window to keep the client responsive. */
const MAX_ANALYSED = 120;

function loadPrevious(): MarketplaceHealthPrevious | undefined {
  if (typeof window === "undefined") return undefined;
  try {
    const raw = window.localStorage.getItem(SNAPSHOT_KEY);
    if (!raw) return undefined;
    return JSON.parse(raw) as MarketplaceHealthPrevious;
  } catch {
    return undefined;
  }
}

function saveSnapshot(next: MarketplaceHealth) {
  if (typeof window === "undefined") return;
  const snap: MarketplaceHealthPrevious = {
    score: next.score,
    vendorAverageScore: next.rollups.vendors.averageScore,
    averageReadiness: next.rollups.catalog.averageReadiness,
    trustScore: next.rollups.trust.score,
    recommendationKeys: next.lifecycle.map((r) => `${r.module}::${r.action}`),
    resolvedKeys: [],
  };
  try {
    window.localStorage.setItem(SNAPSHOT_KEY, JSON.stringify(snap));
  } catch {
    /* ignore quota errors */
  }
}

function analyseListing(p: Product): {
  listing: OptimizationListing;
  modules: IntelligenceModule[];
  readiness: MarketplaceReadiness;
} {
  const attrs = (p as unknown as { attributes?: Record<string, unknown> | null }).attributes ?? null;
  const specs = (p as unknown as { specifications?: Record<string, unknown> | null }).specifications ?? null;

  const modules: IntelligenceModule[] = [];

  modules.push(
    analyzeAttributes({
      category: p.category ?? null,
      attributes: attrs,
      specifications: specs,
    }),
  );
  modules.push(
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
      attributes: attrs,
      specifications: specs,
      specCount: Object.values(specs ?? {}).filter((v) => v != null && v !== "").length,
      variantCount: 0,
    }),
  );
  modules.push(
    analyzeVariantIntelligence({
      slug: p.slug,
      productName: p.name,
      productPrice: p.priceInr ?? p.priceUsd ?? null,
      variants: [],
    }),
  );
  modules.push(
    analyzeSeoIntelligence({
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
    }),
  );
  modules.push(
    analyzePricingIntelligence({
      slug: p.slug,
      productName: p.name,
      price: p.priceInr ?? p.priceUsd ?? null,
      comparePrice: p.comparePriceInr ?? p.comparePriceUsd ?? null,
      cost: p.costPriceInr ?? p.costPriceUsd ?? null,
      variants: [],
    }),
  );

  const readiness = assessMarketplaceReadiness(modules);
  const vendorId = (p.brand?.trim() || "unassigned").toLowerCase();
  const vendorName = p.brand?.trim() || "Unassigned";

  const listing: OptimizationListing = {
    productId: p.id ?? p.slug,
    productSlug: p.slug,
    vendorId,
    vendorName,
    categoryId: p.category || undefined,
    categoryName: p.category || undefined,
    readiness,
    modules,
  };

  return { listing, modules, readiness };
}

export type MarketplaceHealthBundle = {
  health: MarketplaceHealth | null;
  optimization: ReturnType<typeof buildMarketplaceOptimization> | null;
  vendors: VendorIntelligence[];
  trust: TrustIntelligence | null;
  totalProducts: number;
  analysedProducts: number;
  loading: boolean;
};

export function useMarketplaceHealth(): MarketplaceHealthBundle {
  const { products, loading } = useProducts();
  const prevRef = useRef<MarketplaceHealthPrevious | undefined>(undefined);
  if (prevRef.current === undefined) prevRef.current = loadPrevious();
  const [tick, setTick] = useState(0);
  void tick;

  const bundle = useMemo<MarketplaceHealthBundle>(() => {
    if (loading || products.length === 0) {
      return {
        health: null,
        optimization: null,
        vendors: [],
        trust: null,
        totalProducts: products.length,
        analysedProducts: 0,
        loading,
      };
    }

    // Cap the analysis window — deterministic ordering (highest-priority first).
    const sample = [...products]
      .sort((a, b) => (b.viewsCount ?? 0) - (a.viewsCount ?? 0))
      .slice(0, MAX_ANALYSED);

    const analyses = sample.map(analyseListing);
    const listings = analyses.map((a) => a.listing);

    // Vendor rollups by brand.
    const byVendor = new Map<string, typeof analyses>();
    for (const a of analyses) {
      const id = a.listing.vendorId ?? "unassigned";
      const list = byVendor.get(id) ?? [];
      list.push(a);
      byVendor.set(id, list);
    }
    const vendors: VendorIntelligence[] = [];
    for (const [id, group] of byVendor) {
      vendors.push(
        analyzeVendorIntelligence({
          vendorId: id,
          vendorName: group[0].listing.vendorName ?? "Unassigned",
          listings: group.map((g) => ({
            productId: g.listing.productId,
            productSlug: g.listing.productSlug,
            readiness: g.readiness,
            modules: g.modules,
          })),
        }),
      );
    }

    const optimization = buildMarketplaceOptimization({ listings, vendors });

    const trust = analyzeTrustIntelligence({
      listings: analyses.map((a) => ({
        productId: a.listing.productId,
        readiness: a.readiness,
        modules: a.modules,
      })),
      vendors,
    });

    const health = buildMarketplaceHealth({
      optimization,
      vendors,
      trust,
      relationships: [],
      previous: prevRef.current,
    });

    return {
      health,
      optimization,
      vendors,
      trust,
      totalProducts: products.length,
      analysedProducts: analyses.length,
      loading: false,
    };
  }, [products, loading]);

  // Persist snapshot after each successful computation so the next mount
  // sees trend deltas + lifecycle transitions.
  useEffect(() => {
    if (bundle.health) saveSnapshot(bundle.health);
  }, [bundle.health]);

  // Force a refresh on external product changes (keeps the hook self-healing).
  useEffect(() => {
    const id = window.setInterval(() => setTick((t) => t + 1), 5 * 60_000);
    return () => window.clearInterval(id);
  }, []);

  return bundle;
}
