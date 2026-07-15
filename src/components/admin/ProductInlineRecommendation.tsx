/**
 * ProductInlineRecommendation — Product Editor inline surface for
 * Marketplace Intelligence 3.0 (Platform v1.0 embedding phase).
 *
 * Renders EXACTLY ONE prioritised recommendation at the top of the editor,
 * with a one-click action that routes the admin to the right tab or sub-route.
 * "View Details" progressively discloses per-module scores, Marketplace
 * Readiness, and evidence.
 *
 * Pure consumer of Catalog Intelligence 2.0 public contracts:
 *   - scoreProductCompleteness / analyzeAttributes / analyzeVariantIntelligence
 *   - analyzeSeoIntelligence / analyzePricingIntelligence
 *   - assessMarketplaceReadiness (broker + readiness)
 *
 * Never mutates data, never blocks publishing, one recommendation, one action.
 */
import { useMemo, useState } from "react";
import { Link } from "@tanstack/react-router";
import {
  Sparkles, ChevronDown, ChevronUp, ArrowRight, Info,
  CheckCircle2, AlertTriangle, XCircle, Loader2,
} from "lucide-react";
import { cn } from "@/lib/utils";
import {
  scoreProductCompleteness,
  analyzeAttributes,
  analyzeVariantIntelligence,
  analyzeSeoIntelligence,
  analyzePricingIntelligence,
  assessMarketplaceReadiness,
  READINESS_EMOJI,
  READINESS_LABEL,
  type IntelligenceModule,
  type Recommendation,
  type MarketplaceReadiness,
  type VariantRecord,
} from "@/lib/catalog-intelligence";

export type EditorTab =
  | "basic" | "merch" | "seo" | "related" | "variants" | "analytics" | "preview";

/** Snake_case-ish product form data lifted from ProductEditorModal. */
export type InlineRecInput = {
  slug: string;
  name: string;
  category?: string | null;
  description?: string | null;
  seoTitle?: string | null;
  seoDescription?: string | null;
  metaKeywords?: string[] | string | null;
  imageCount: number;
  imageQuality: number | null;
  hasVideo: boolean;
  attributes: Record<string, unknown> | null;
  specifications: Record<string, unknown> | null;
  variants: VariantRecord[];
  priceInr: number | null;
  priceUsd: number | null;
  comparePriceInr: number | null;
  comparePriceUsd: number | null;
  costInr: number | null;
  costUsd: number | null;
  stockQuantity: number;
};

/** Route each module's recommendation to the right editor surface. */
const MODULE_TAB: Record<string, EditorTab> = {
  product_completeness: "basic",
  attribute_intelligence: "basic",
  variant_intelligence: "variants",
  seo_intelligence: "seo",
  pricing_intelligence: "basic",
  image_intelligence: "basic",
};

const MODULE_SUBROUTE: Record<string, string | null> = {
  product_completeness: null,
  attribute_intelligence: null,
  variant_intelligence: "variants",
  seo_intelligence: "seo",
  pricing_intelligence: "pricing",
  image_intelligence: null,
};

const IMPACT_STYLE: Record<string, string> = {
  High: "border-destructive/40 bg-destructive/10 text-destructive",
  Medium: "border-amber-400/40 bg-amber-400/10 text-amber-300",
  Low: "border-sky-400/40 bg-sky-400/10 text-sky-300",
};

const STATUS_STYLE: Record<string, string> = {
  ready: "border-emerald-400/40 bg-emerald-400/5",
  almost_ready: "border-amber-400/40 bg-amber-400/5",
  needs_attention: "border-orange-400/40 bg-orange-400/5",
  not_ready: "border-destructive/40 bg-destructive/5",
};

const MODULE_LABEL: Record<string, string> = {
  product_completeness: "Completeness",
  attribute_intelligence: "Attributes",
  variant_intelligence: "Variants",
  seo_intelligence: "SEO",
  pricing_intelligence: "Pricing",
  image_intelligence: "Images",
};

function statusIcon(score: number) {
  if (score >= 85) return <CheckCircle2 className="size-3.5 text-emerald-400" />;
  if (score >= 55) return <AlertTriangle className="size-3.5 text-amber-400" />;
  return <XCircle className="size-3.5 text-destructive" />;
}

export function ProductInlineRecommendation({
  input,
  onGoToTab,
}: {
  input: InlineRecInput;
  onGoToTab: (tab: EditorTab) => void;
}) {
  const [open, setOpen] = useState(false);

  const modules = useMemo<IntelligenceModule[]>(() => {
    const list: IntelligenceModule[] = [];

    // Attributes (also feeds completeness).
    const attr = analyzeAttributes({
      category: input.category ?? null,
      attributes: input.attributes,
      specifications: input.specifications,
    });
    list.push(attr);

    // Completeness — orchestrator across 7 dimensions.
    const completeness = scoreProductCompleteness({
      slug: input.slug,
      name: input.name,
      category: input.category ?? null,
      description: input.description ?? null,
      seoTitle: input.seoTitle ?? null,
      seoDescription: input.seoDescription ?? null,
      metaKeywords: input.metaKeywords ?? null,
      imageCount: input.imageCount,
      imageQuality: input.imageQuality,
      attributes: input.attributes,
      specifications: input.specifications,
      specCount: Object.values(input.specifications ?? {}).filter((v) => v != null && v !== "").length,
      variantCount: input.variants.length,
    });
    list.push(completeness);

    // Variants.
    list.push(
      analyzeVariantIntelligence({
        slug: input.slug,
        productName: input.name,
        productPrice: input.priceInr ?? input.priceUsd ?? null,
        variants: input.variants,
      }),
    );

    // SEO.
    list.push(
      analyzeSeoIntelligence({
        slug: input.slug,
        name: input.name,
        seoTitle: input.seoTitle ?? null,
        seoDescription: input.seoDescription ?? null,
        description: input.description ?? null,
        keywords: input.metaKeywords ?? null,
        imageAlt: input.name || null,
        category: input.category ?? null,
        hasFaq: false,
        hasRelated: false,
        hasImage: input.imageCount > 0,
      }),
    );

    // Pricing.
    list.push(
      analyzePricingIntelligence({
        slug: input.slug,
        productName: input.name,
        price: input.priceInr ?? input.priceUsd ?? null,
        comparePrice: input.comparePriceInr ?? input.comparePriceUsd ?? null,
        cost: input.costInr ?? input.costUsd ?? null,
        variants: input.variants,
      }),
    );

    return list;
  }, [input]);

  const readiness: MarketplaceReadiness = useMemo(
    () => assessMarketplaceReadiness(modules),
    [modules],
  );

  const top: Recommendation | null = readiness.topRecommendation;
  const impactClass = top ? IMPACT_STYLE[top.impact] ?? IMPACT_STYLE.Low : IMPACT_STYLE.Low;
  const statusClass = STATUS_STYLE[readiness.status];
  const targetTab = top ? MODULE_TAB[top.module] ?? "basic" : "basic";
  const targetSubroute = top ? MODULE_SUBROUTE[top.module] ?? null : null;

  return (
    <section
      className={cn(
        "rounded-2xl border p-4 backdrop-blur-xl",
        "bg-gradient-to-br from-white/[0.04] to-transparent",
        statusClass,
      )}
    >
      {/* Header — traffic light + Marketplace Readiness */}
      <header className="mb-3 flex items-center justify-between gap-3">
        <span className="flex items-center gap-2 text-[11px] font-mono uppercase tracking-widest text-accent">
          <Sparkles className="size-3.5" /> Marketplace AI · Inline Recommendation
        </span>
        <span className="flex items-center gap-1.5 text-[11px] text-muted-foreground">
          <span>{READINESS_EMOJI[readiness.status]}</span>
          <span className="text-foreground">{READINESS_LABEL[readiness.status]}</span>
          <span className="opacity-60">·</span>
          <span className="tabular-nums">{readiness.score}/100</span>
        </span>
      </header>

      {/* The ONE recommendation */}
      {top ? (
        <div className="flex flex-col gap-3 sm:flex-row sm:items-start">
          <div className="min-w-0 flex-1">
            <div className="mb-1.5 flex flex-wrap items-center gap-1.5">
              <span
                className={cn(
                  "inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-[10px] font-medium",
                  impactClass,
                )}
              >
                {top.impact} Impact
              </span>
              <span className="inline-flex items-center gap-1 rounded-full border border-white/10 bg-white/[0.02] px-2 py-0.5 text-[10px] uppercase tracking-wide text-muted-foreground">
                {MODULE_LABEL[top.module] ?? top.module.replace(/_/g, " ")}
              </span>
              <span className="text-[10px] text-muted-foreground tabular-nums">
                Confidence {top.confidence}%
              </span>
            </div>
            <p className="text-sm font-medium text-foreground leading-snug">
              {top.recommendation}
            </p>
          </div>

          {/* One-click action */}
          {targetSubroute ? (
            <Link
              to="/admin-product/$slug/$"
              params={{ slug: input.slug, _splat: targetSubroute }}
              className="inline-flex shrink-0 items-center gap-1.5 rounded-xl border border-accent/40 bg-accent/10 px-3 py-2 text-xs font-medium text-accent hover:bg-accent/20"
            >
              {top.action} <ArrowRight className="size-3.5" />
            </Link>
          ) : (
            <button
              type="button"
              onClick={() => onGoToTab(targetTab)}
              className="inline-flex shrink-0 items-center gap-1.5 rounded-xl border border-accent/40 bg-accent/10 px-3 py-2 text-xs font-medium text-accent hover:bg-accent/20"
            >
              {top.action} <ArrowRight className="size-3.5" />
            </button>
          )}
        </div>
      ) : (
        <p className="flex items-center gap-2 text-sm text-emerald-300">
          <CheckCircle2 className="size-4" />
          This listing looks healthy — no priority recommendation.
        </p>
      )}

      {/* Progressive disclosure */}
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="mt-3 inline-flex items-center gap-1 text-[11px] text-muted-foreground hover:text-accent"
      >
        {open ? <ChevronUp className="size-3" /> : <ChevronDown className="size-3" />}
        {open ? "Hide details" : "View details"}
      </button>

      {open && (
        <div className="mt-3 space-y-3">
          {/* Per-module scores */}
          <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
            {modules.map((m) => (
              <button
                key={m.moduleId}
                type="button"
                onClick={() => onGoToTab(MODULE_TAB[m.moduleId] ?? "basic")}
                className="flex items-center justify-between gap-2 rounded-xl border border-white/5 bg-white/[0.02] p-2.5 text-left hover:border-accent/30"
              >
                <div className="min-w-0">
                  <div className="flex items-center gap-1.5">
                    {statusIcon(m.score)}
                    <span className="text-[11px] font-medium text-foreground truncate">
                      {MODULE_LABEL[m.moduleId] ?? m.moduleId}
                    </span>
                  </div>
                  <p className="mt-0.5 text-[10px] text-muted-foreground truncate">
                    {m.recommendation ?? "Healthy"}
                  </p>
                </div>
                <span className="text-sm font-mono tabular-nums text-foreground">{m.score}</span>
              </button>
            ))}
          </div>

          {/* Strengths */}
          {readiness.strengths.length > 0 && (
            <div className="rounded-xl border border-emerald-400/20 bg-emerald-400/5 p-2.5">
              <p className="mb-1 text-[10px] font-mono uppercase tracking-widest text-emerald-400">
                Strengths
              </p>
              <p className="text-[11px] text-muted-foreground">
                {readiness.strengths.join(" · ")}
              </p>
            </div>
          )}

          {/* Top evidence — flatten across modules, cap at 5 */}
          {(() => {
            const ev = modules
              .flatMap((m) =>
                m.evidence
                  .filter((e) => e.severity !== "info")
                  .map((e) => ({ ...e, moduleId: m.moduleId })),
              )
              .sort((a, b) => (b.impact ?? 0) - (a.impact ?? 0))
              .slice(0, 5);
            if (!ev.length) return null;
            return (
              <div className="rounded-xl border border-white/5 bg-white/[0.02] p-2.5">
                <p className="mb-1.5 flex items-center gap-1 text-[10px] font-mono uppercase tracking-widest text-muted-foreground">
                  <Info className="size-3" /> Evidence
                </p>
                <ul className="space-y-1">
                  {ev.map((e, i) => (
                    <li
                      key={`${e.moduleId}-${e.key}-${i}`}
                      className="flex items-start gap-1.5 text-[11px] text-muted-foreground"
                    >
                      {e.severity === "critical" ? (
                        <XCircle className="mt-0.5 size-3 shrink-0 text-destructive" />
                      ) : (
                        <AlertTriangle className="mt-0.5 size-3 shrink-0 text-amber-400" />
                      )}
                      <span>
                        <span className="text-foreground">
                          {MODULE_LABEL[e.moduleId] ?? e.moduleId}:
                        </span>{" "}
                        {e.message}
                      </span>
                    </li>
                  ))}
                </ul>
              </div>
            );
          })()}
        </div>
      )}
    </section>
  );
}

/** Silence unused-symbol warnings for icons kept for future variants. */
void Loader2;
