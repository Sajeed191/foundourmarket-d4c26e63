/**
 * MarketplaceAssistantPanel — the always-visible "Marketplace AI Assistant".
 *
 * A premium, unified intelligence surface for the Product Editor. It does NOT
 * introduce any new scoring — it composes the existing engines (Duplicate
 * Detection, Relationship, Catalog Health, SEO, Image, Variant Intelligence)
 * into one explainable assistant: live health metrics, a single recommended
 * action, an animated confidence timeline, a per-signal AI explanation, and the
 * top matches with relationship-aware smart actions. Never blocks publishing.
 */
import { useEffect, useMemo, useRef, useState } from "react";
import { useNavigate } from "@tanstack/react-router";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import {
  Sparkles,
  Loader2,
  ShieldCheck,
  Gauge,
  Image as ImageIcon,
  Search,
  Layers,
  TrendingUp,
  GitMerge,
  Lightbulb,
} from "lucide-react";
import {
  logDuplicateEvent,
  invalidateDetectionIndex,
  type DraftProduct,
  type DupMatch,
  type DupResult,
  type DupSignal,
} from "@/lib/duplicate-detection";
import {
  scoreCatalogHealth,
  analyzeSeo,
  analyzeVariants,
  classifyRelationship,
  recommendAction,
  RELATIONSHIP_LABEL,
  type HealthInput,
  type ImageQuality,
  type SeoDraft,
  type VariantRow,
} from "@/lib/catalog-intelligence";
import { DuplicateMatchCard } from "./DuplicateMatchCard";
import { DuplicateCompareDialog } from "./DuplicateCompareDialog";
import { ImageCompareDialog } from "./ImageCompareDialog";

function ringColor(score: number) {
  if (score >= 85) return "text-emerald-400";
  if (score >= 70) return "text-sky-400";
  if (score >= 45) return "text-amber-400";
  return "text-red-400";
}

function riskColor(score: number) {
  if (score >= 90) return "text-red-400";
  if (score >= 70) return "text-orange-400";
  if (score >= 45) return "text-amber-400";
  if (score >= 25) return "text-sky-400";
  return "text-emerald-400";
}

const REC_TONE: Record<string, string> = {
  safe: "border-emerald-500/40 bg-emerald-500/10 text-emerald-300",
  info: "border-sky-500/40 bg-sky-500/10 text-sky-300",
  warn: "border-amber-500/40 bg-amber-500/10 text-amber-300",
  danger: "border-red-500/40 bg-red-500/10 text-red-300",
};

function Metric({ label, score, icon, suffix = "%" }: { label: string; score: number; icon: React.ReactNode; suffix?: string }) {
  return (
    <div className="flex items-center gap-2 rounded-xl border border-border/60 bg-background/40 p-2">
      <span className={cn("grid size-8 shrink-0 place-items-center rounded-lg bg-accent/10", ringColor(score))}>{icon}</span>
      <div className="min-w-0">
        <p className="truncate text-[9px] uppercase tracking-wide text-muted-foreground">{label}</p>
        <p className={cn("font-mono text-base font-bold leading-none tabular-nums", ringColor(score))}>{score}{suffix}</p>
      </div>
    </div>
  );
}

/** A human-friendly label for each duplicate signal in the AI explanation. */
const SIGNAL_LABEL: Record<string, string> = {
  barcode: "Barcode",
  title: "Title",
  brand: "Brand",
  category: "Category",
  sku: "SKU",
  variant: "Variant Structure",
  image: "Image",
  description: "Description",
  specifications: "Specifications",
  price: "Price",
  attributes: "Attributes",
  keywords: "Keywords",
  history: "Admin History",
};

export function MarketplaceAssistantPanel({
  draft,
  result,
  draftPhash,
  healthInput,
  imageQuality,
  seoDraft,
  variantRows,
  onCreateVariant,
  onIgnored,
  onLinkRelated,
}: {
  draft: DraftProduct;
  result: DupResult;
  draftPhash: string | null;
  healthInput: HealthInput;
  imageQuality: { images: ImageQuality[]; score: number; loading: boolean };
  seoDraft: SeoDraft;
  variantRows: VariantRow[];
  onCreateVariant?: (match: DupMatch) => void;
  onIgnored?: () => void;
  onLinkRelated?: (match: DupMatch, relation: "related" | "accessory" | "successor" | "bundle") => void;
}) {
  const navigate = useNavigate();
  const [compare, setCompare] = useState<DupMatch | null>(null);
  const [imageCompare, setImageCompare] = useState<DupMatch | null>(null);
  const [busy, setBusy] = useState(false);

  const visible = useMemo(() => result.matches.filter((m) => !m.ignored), [result.matches]);
  const top = visible[0] ?? null;
  const duplicateRisk = useMemo(() => {
    if (!top) return 0;
    const rel = classifyRelationship(draft, top);
    return rel.kind === "exact_duplicate" ? top.score : top.score;
  }, [draft, top]);

  const imageScore = imageQuality.images.length ? imageQuality.score : 0;
  const catalogHealth = useMemo(
    () => scoreCatalogHealth({ ...healthInput, duplicateRisk, imageQuality: imageQuality.images.length ? imageQuality.score : null }),
    [healthInput, duplicateRisk, imageQuality.images.length, imageQuality.score],
  );
  const seo = useMemo(() => analyzeSeo(seoDraft), [seoDraft]);
  const variant = useMemo(() => analyzeVariants(variantRows), [variantRows]);
  const readiness = Math.round(
    catalogHealth.score * 0.4 + seo.score * 0.2 + (imageQuality.images.length ? imageScore : 70) * 0.2 + variant.score * 0.2,
  );

  const rec = useMemo(() => recommendAction(draft, top), [draft, top]);

  // ---- Live confidence timeline (animated) ----
  const [timeline, setTimeline] = useState<number[]>([]);
  const lastScore = useRef<number>(-1);
  useEffect(() => {
    const s = result.topScore;
    if (s !== lastScore.current) {
      lastScore.current = s;
      setTimeline((prev) => [...prev.slice(-23), s]);
    }
  }, [result.topScore]);

  async function logAnd(action: "ignored" | "merged", m: DupMatch, after?: () => void) {
    setBusy(true);
    const { error } = await logDuplicateEvent({ draft, match: m, action });
    setBusy(false);
    if (error) { toast.error("Couldn't record action", { description: error.message }); return; }
    if (action === "merged") invalidateDetectionIndex();
    after?.();
  }
  function openProduct(m: DupMatch) {
    navigate({ to: "/admin-product/$slug", params: { slug: m.product.slug } });
  }
  function ignore(m: DupMatch) {
    logAnd("ignored", m, () => { m.ignored = true; toast.success("Ignored", { description: "We won't warn about this pair again." }); onIgnored?.(); });
  }
  function merge(m: DupMatch) {
    logAnd("merged", m, () => { toast.success("Merge recorded", { description: "Opening the existing product to finish the merge." }); openProduct(m); });
  }

  const topRel = top ? classifyRelationship(draft, top) : null;
  const priceDiff = top ? priceDelta(draft, top) : null;

  return (
    <aside className="flex w-full flex-col gap-3 rounded-3xl border border-border/70 bg-card/40 p-4 backdrop-blur-xl">
      <div className="flex items-center gap-2">
        <span className="grid size-8 place-items-center rounded-xl bg-accent/15 text-accent"><Sparkles className="size-4" /></span>
        <div>
          <p className="text-[9px] font-mono uppercase tracking-[0.25em] text-accent">Marketplace AI Assistant</p>
          <p className="text-sm font-semibold">Marketplace Readiness · {readiness}%</p>
        </div>
        {result.loading && <Loader2 className="ml-auto size-4 animate-spin text-muted-foreground" />}
      </div>

      {/* Live health metrics */}
      <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
        <Metric label="Duplicate Risk" score={duplicateRisk} icon={<ShieldCheck className="size-4" />} />
        <Metric label="Catalog Health" score={catalogHealth.score} icon={<Gauge className="size-4" />} />
        <Metric label="SEO Health" score={seo.score} icon={<Search className="size-4" />} />
        <Metric label="Image Health" score={imageScore} icon={<ImageIcon className="size-4" />} />
        <Metric label="Variant Health" score={variant.score} icon={<Layers className="size-4" />} />
        <Metric label="Readiness" score={readiness} icon={<TrendingUp className="size-4" />} />
      </div>

      {/* Single AI recommendation */}
      <div className={cn("rounded-2xl border p-3", REC_TONE[rec.tone])}>
        <div className="flex items-center gap-2">
          <Lightbulb className="size-4 shrink-0" />
          <p className="text-xs font-semibold uppercase tracking-wide">Recommended Action</p>
          {topRel && (
            <span className="ml-auto rounded-full border border-current/30 px-2 py-0.5 text-[9px] font-mono uppercase tracking-wider">
              {RELATIONSHIP_LABEL[topRel.kind]}
            </span>
          )}
        </div>
        <p className="mt-1 text-sm font-semibold text-foreground">{rec.label}</p>
        <p className="mt-0.5 text-[11px] text-muted-foreground">{rec.why}</p>
        {top && (rec.kind === "create_variant" || rec.kind === "merge") && (
          <div className="mt-2 flex flex-wrap gap-1.5">
            {rec.kind === "create_variant" && (
              <RecBtn label="Create Variant" onClick={() => onCreateVariant?.(top)} accent />
            )}
            {rec.kind === "merge" && (
              <RecBtn label="Merge" onClick={() => merge(top)} accent disabled={busy} />
            )}
            <RecBtn label="Open Existing" onClick={() => openProduct(top)} />
            <RecBtn label="Ignore" onClick={() => ignore(top)} disabled={busy} />
          </div>
        )}
      </div>

      {/* Live confidence timeline */}
      {timeline.length > 1 && (
        <div className="rounded-2xl border border-border/60 bg-background/40 p-3">
          <div className="mb-1.5 flex items-center justify-between">
            <p className="text-[10px] font-mono uppercase tracking-wide text-muted-foreground">Confidence Timeline</p>
            <span className={cn("font-mono text-xs font-bold tabular-nums", riskColor(result.topScore))}>{result.topScore}%</span>
          </div>
          <div className="flex h-12 items-end gap-0.5">
            {timeline.map((v, i) => (
              <div
                key={i}
                className={cn("flex-1 rounded-t bg-current transition-all duration-500", riskColor(v))}
                style={{ height: `${Math.max(4, v)}%`, opacity: 0.35 + (i / timeline.length) * 0.65 }}
                title={`${v}%`}
              />
            ))}
          </div>
        </div>
      )}

      {/* Per-signal AI explanation */}
      {top && (
        <div className="rounded-2xl border border-border/60 bg-background/40 p-3">
          <p className="mb-2 text-[10px] font-mono uppercase tracking-wide text-muted-foreground">
            AI Explanation · {top.product.name}
          </p>
          <div className="space-y-1.5">
            {[...top.signals].sort((a, b) => b.similarity - a.similarity).slice(0, 8).map((s: DupSignal) => (
              <div key={s.key} className="flex items-center gap-2">
                <span className="w-28 shrink-0 truncate text-[11px] text-muted-foreground">{SIGNAL_LABEL[s.key] ?? s.label}</span>
                <div className="h-1.5 flex-1 overflow-hidden rounded-full bg-border/40">
                  <div
                    className={cn("h-full rounded-full bg-current transition-all duration-500", s.matched ? "text-emerald-400" : "text-muted-foreground/50")}
                    style={{ width: `${Math.round(s.similarity * 100)}%` }}
                  />
                </div>
                <span className={cn("w-8 shrink-0 text-right font-mono text-[10px] tabular-nums", s.matched ? "text-emerald-400" : "text-muted-foreground")}>
                  {Math.round(s.similarity * 100)}%
                </span>
              </div>
            ))}
            {priceDiff != null && priceDiff !== 0 && (
              <div className="flex items-center gap-2">
                <span className="w-28 shrink-0 text-[11px] text-muted-foreground">Price</span>
                <span className="flex-1 text-[11px] text-amber-400">Different</span>
                <span className="shrink-0 font-mono text-[10px] text-amber-400">{priceDiff > 0 ? "+" : ""}{priceDiff}</span>
              </div>
            )}
          </div>
        </div>
      )}

      {/* Top matches (up to 10) */}
      {visible.length === 0 ? (
        <div className="flex flex-col items-center gap-2 rounded-2xl border border-emerald-500/25 bg-emerald-500/5 p-6 text-center">
          <ShieldCheck className="size-8 text-emerald-400" />
          <p className="text-sm font-medium text-emerald-300">
            {result.loading ? "Analyzing marketplace…" : "No duplicates detected — safe to publish"}
          </p>
          <p className="text-[11px] text-muted-foreground">
            Keep editing — we scan title, brand, barcode, SKU, image, specs and variants in real time.
          </p>
        </div>
      ) : (
        <div className="flex flex-col gap-2.5">
          <p className="text-[10px] font-mono uppercase tracking-wide text-muted-foreground">
            Top {Math.min(10, visible.length)} Matches
          </p>
          {visible.slice(0, 10).map((m) => (
            <DuplicateMatchCard
              key={m.product.slug}
              match={m}
              onCompare={setCompare}
              onImageCompare={setImageCompare}
              onOpen={openProduct}
              onMerge={merge}
              onIgnore={ignore}
            />
          ))}
        </div>
      )}

      <p className="mt-1 text-center text-[10px] text-muted-foreground">
        <GitMerge className="mr-1 inline size-3" />
        Publishing is never blocked — the assistant guides, you decide.
      </p>

      <DuplicateCompareDialog open={!!compare} onOpenChange={(v) => !v && setCompare(null)} draft={draft} match={compare} />
      <ImageCompareDialog
        open={!!imageCompare}
        onOpenChange={(v) => !v && setImageCompare(null)}
        draftImage={draft.image ?? null}
        draftPhash={draftPhash}
        match={imageCompare}
      />
    </aside>
  );
}

function priceDelta(draft: DraftProduct, m: DupMatch): number | null {
  const d = draft.priceInr ?? draft.priceUsd ?? null;
  const c = m.product.priceInr ?? m.product.priceUsd ?? null;
  if (d == null || c == null) return null;
  return Math.round(d - c);
}

function RecBtn({ label, onClick, accent, disabled }: { label: string; onClick: () => void; accent?: boolean; disabled?: boolean }) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      className={cn(
        "rounded-lg border px-2.5 py-1 text-[10px] font-medium transition-colors disabled:opacity-50",
        accent ? "border-current/50 bg-current/10 text-foreground" : "border-white/15 bg-background/40 text-muted-foreground hover:text-foreground",
      )}
    >
      {label}
    </button>
  );
}
