/**
 * Smart Work Queue — Marketplace Operations 1.0, Phase 1.
 *
 * PERMANENT ARCHITECTURAL RULE (project-wide):
 *   Intelligence produces decisions. Operations execute decisions.
 *
 * This file is pure aggregation. It never runs detection, never scores,
 * and never calls any AI service. It reads Marketplace Intelligence 3.0
 * public bundles and produces one work-queue-per-focus so admins can act
 * on prioritised recommendations instead of hunting for issues.
 */
import type {
  IntelligenceModule,
  MarketplaceReadiness,
  Recommendation,
} from "@/lib/catalog-intelligence";
import type { MarketplaceHealthListing } from "@/lib/use-marketplace-health";

export type QueueId =
  | "high_impact"
  | "seo"
  | "variants"
  | "images"
  | "pricing"
  | "ready_to_publish";

export type EstimatedEffort = "small" | "medium" | "large";

export type QueueItem = {
  productId: string;
  productSlug: string;
  productName: string;
  productImage: string | null;
  categoryName: string | null;
  vendorName: string | null;
  readinessScore: number;
  readinessStatus: MarketplaceReadiness["status"];
  recommendation: Recommendation | null;   // null only for ready_to_publish
  action: string;
  actionHref?: string;
  impact: Recommendation["impact"] | "Low";
  confidence: number;
  effort: EstimatedEffort;
  priority: number;                          // 0..1000, higher first
};

export type WorkQueue = {
  id: QueueId;
  label: string;
  emoji: string;
  tone: string;                              // tailwind class hint
  description: string;
  moduleFilter: string[] | null;             // null = no module filter
  items: QueueItem[];
};

export type SmartQueues = {
  version: 1;
  queues: WorkQueue[];
  totalOpen: number;
  topPriorityItem: (QueueItem & { queueId: QueueId }) | null;
  generatedAt: string;
  explainable: true;
};

const QUEUE_META: Record<QueueId, Pick<WorkQueue, "label" | "emoji" | "tone" | "description" | "moduleFilter">> = {
  high_impact: {
    label: "High Impact",
    emoji: "🔴",
    tone: "text-destructive border-destructive/40 bg-destructive/10",
    description: "The biggest wins available right now",
    moduleFilter: null,
  },
  seo: {
    label: "SEO",
    emoji: "🟡",
    tone: "text-amber-300 border-amber-400/40 bg-amber-400/10",
    description: "Search & discoverability improvements",
    moduleFilter: ["seo_intelligence"],
  },
  variants: {
    label: "Variants",
    emoji: "🟠",
    tone: "text-orange-300 border-orange-400/40 bg-orange-400/10",
    description: "Variant matrix and inventory issues",
    moduleFilter: ["variant_intelligence"],
  },
  images: {
    label: "Images",
    emoji: "🔵",
    tone: "text-sky-300 border-sky-400/40 bg-sky-400/10",
    description: "Missing or low-quality hero imagery",
    moduleFilter: ["images", "image_intelligence"],
  },
  pricing: {
    label: "Pricing",
    emoji: "🟣",
    tone: "text-violet-300 border-violet-400/40 bg-violet-400/10",
    description: "Margin, comparison price, and cost gaps",
    moduleFilter: ["pricing_intelligence"],
  },
  ready_to_publish: {
    label: "Ready to Publish",
    emoji: "🟢",
    tone: "text-emerald-300 border-emerald-400/40 bg-emerald-400/10",
    description: "Products that passed Marketplace Readiness",
    moduleFilter: null,
  },
};

const IMPACT_WEIGHT: Record<Recommendation["impact"] | "Low", number> = {
  High: 100,
  Medium: 60,
  Low: 25,
};

/** Deterministic effort estimator from public signals only. */
function estimateEffort(rec: Recommendation | null, readiness: MarketplaceReadiness): EstimatedEffort {
  if (!rec) return "small";
  const score = readiness.score;
  const critical = readiness.blockers.length;
  if (score < 55 || critical >= 3) return "large";
  if (score < 80 || rec.impact === "High") return "medium";
  return "small";
}

function findTopRecommendation(
  modules: IntelligenceModule[],
  moduleFilter: string[] | null,
): Recommendation | null {
  const eligible = moduleFilter
    ? modules.filter((m) => moduleFilter.includes(m.moduleId))
    : modules;
  // Prefer explicit blockers → then any module with a recommendation.
  const withRec = eligible
    .filter((m) => m.recommendation && !(m.score >= 95 && m.status === "green"))
    .sort((a, b) => {
      const impactDelta =
        IMPACT_WEIGHT[(b.potentialImpact ?? "Low") as keyof typeof IMPACT_WEIGHT] -
        IMPACT_WEIGHT[(a.potentialImpact ?? "Low") as keyof typeof IMPACT_WEIGHT];
      if (impactDelta !== 0) return impactDelta;
      return a.score - b.score;
    });
  const top = withRec[0];
  if (!top) return null;
  return {
    module: top.moduleId,
    priority: 0,
    impact: (top.potentialImpact ?? "Low") as Recommendation["impact"],
    recommendation: top.recommendation,
    action: top.action ?? "Review",
    actionHref: top.actionHref,
    confidence: top.confidence,
    status: top.status,
    score: top.score,
  };
}

function priorityScore(rec: Recommendation | null, readiness: MarketplaceReadiness): number {
  const impact = rec ? IMPACT_WEIGHT[rec.impact] : 10;
  const conf = rec ? rec.confidence / 100 : 0.5;
  const gap = 100 - readiness.score;
  return Math.round((impact * 0.6 + gap * 0.4) * conf * 10);
}

function buildQueue(
  id: QueueId,
  listings: MarketplaceHealthListing[],
): WorkQueue {
  const meta = QUEUE_META[id];
  const items: QueueItem[] = [];

  if (id === "ready_to_publish") {
    for (const l of listings) {
      if (l.readiness.status !== "ready") continue;
      items.push({
        productId: l.productId,
        productSlug: l.productSlug,
        productName: l.productName,
        productImage: l.productImage,
        categoryName: l.categoryName,
        vendorName: l.vendorName,
        readinessScore: l.readiness.score,
        readinessStatus: l.readiness.status,
        recommendation: null,
        action: "Publish",
        actionHref: undefined,
        impact: "Low",
        confidence: l.readiness.confidence,
        effort: "small",
        priority: l.readiness.score,
      });
    }
    items.sort((a, b) => b.priority - a.priority);
    return { id, ...meta, items };
  }

  if (id === "high_impact") {
    // Every listing that has a High-impact blocker.
    for (const l of listings) {
      const rec = findTopRecommendation(l.modules, null);
      if (!rec || rec.impact !== "High") continue;
      items.push({
        productId: l.productId,
        productSlug: l.productSlug,
        productName: l.productName,
        productImage: l.productImage,
        categoryName: l.categoryName,
        vendorName: l.vendorName,
        readinessScore: l.readiness.score,
        readinessStatus: l.readiness.status,
        recommendation: rec,
        action: rec.action,
        actionHref: rec.actionHref,
        impact: rec.impact,
        confidence: rec.confidence,
        effort: estimateEffort(rec, l.readiness),
        priority: priorityScore(rec, l.readiness),
      });
    }
    items.sort((a, b) => b.priority - a.priority);
    return { id, ...meta, items };
  }

  // Module-scoped queues.
  for (const l of listings) {
    const rec = findTopRecommendation(l.modules, meta.moduleFilter);
    if (!rec) continue;
    items.push({
      productId: l.productId,
      productSlug: l.productSlug,
      productName: l.productName,
      productImage: l.productImage,
      categoryName: l.categoryName,
      vendorName: l.vendorName,
      readinessScore: l.readiness.score,
      readinessStatus: l.readiness.status,
      recommendation: rec,
      action: rec.action,
      actionHref: rec.actionHref,
      impact: rec.impact,
      confidence: rec.confidence,
      effort: estimateEffort(rec, l.readiness),
      priority: priorityScore(rec, l.readiness),
    });
  }
  items.sort((a, b) => b.priority - a.priority);
  return { id, ...meta, items };
}

export function buildSmartQueues(
  listings: MarketplaceHealthListing[],
): SmartQueues {
  const ids: QueueId[] = ["high_impact", "seo", "variants", "images", "pricing", "ready_to_publish"];
  const queues = ids.map((id) => buildQueue(id, listings));

  // Total open work (exclude ready_to_publish which is a positive queue).
  const totalOpen = queues
    .filter((q) => q.id !== "ready_to_publish")
    .reduce((a, q) => a + q.items.length, 0);

  // Top priority across all *action-required* queues.
  const actionQueues = queues.filter((q) => q.id !== "ready_to_publish");
  let topPriorityItem: SmartQueues["topPriorityItem"] = null;
  for (const q of actionQueues) {
    const head = q.items[0];
    if (!head) continue;
    if (!topPriorityItem || head.priority > topPriorityItem.priority) {
      topPriorityItem = { ...head, queueId: q.id };
    }
  }

  return {
    version: 1,
    queues,
    totalOpen,
    topPriorityItem,
    generatedAt: new Date().toISOString(),
    explainable: true,
  };
}

export const EFFORT_LABEL: Record<EstimatedEffort, string> = {
  small: "Small",
  medium: "Medium",
  large: "Large",
};

/** Rough estimator so the Daily Digest can show a "≈18 minutes" number. */
export function estimateMinutesForQueue(queue: WorkQueue): number {
  const perItem: Record<EstimatedEffort, number> = { small: 2, medium: 6, large: 15 };
  return queue.items.reduce((a, item) => a + perItem[item.effort], 0);
}

export function estimateMinutesForItems(items: QueueItem[]): number {
  const perItem: Record<EstimatedEffort, number> = { small: 2, medium: 6, large: 15 };
  return items.reduce((a, item) => a + perItem[item.effort], 0);
}
