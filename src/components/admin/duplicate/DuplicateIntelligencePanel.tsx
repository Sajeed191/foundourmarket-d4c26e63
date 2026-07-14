import { useState } from "react";
import { useNavigate } from "@tanstack/react-router";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import {
  ShieldCheck,
  Loader2,
  Sparkles,
  GitMerge,
  ArrowRight,
} from "lucide-react";
import {
  VERDICT_LABEL,
  logDuplicateEvent,
  invalidateDetectionIndex,
  type DraftProduct,
  type DupMatch,
  type DupResult,
  type DupVerdict,
} from "@/lib/duplicate-detection";
import { DuplicateMatchCard } from "./DuplicateMatchCard";
import { DuplicateCompareDialog } from "./DuplicateCompareDialog";
import { ImageCompareDialog } from "./ImageCompareDialog";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";

const RING_COLOR: Record<DupVerdict, string> = {
  safe: "text-emerald-400",
  similar: "text-sky-400",
  possible: "text-amber-400",
  high: "text-orange-400",
  exact: "text-red-400",
};

function Gauge({ score, verdict }: { score: number; verdict: DupVerdict }) {
  const r = 34;
  const c = 2 * Math.PI * r;
  const off = c - (score / 100) * c;
  return (
    <div className="relative grid size-24 place-items-center">
      <svg className="size-24 -rotate-90" viewBox="0 0 80 80">
        <circle cx="40" cy="40" r={r} className="stroke-border/40" strokeWidth="6" fill="none" />
        <circle
          cx="40"
          cy="40"
          r={r}
          className={cn("transition-all duration-500", RING_COLOR[verdict])}
          stroke="currentColor"
          strokeWidth="6"
          strokeLinecap="round"
          fill="none"
          strokeDasharray={c}
          strokeDashoffset={off}
        />
      </svg>
      <div className="absolute text-center">
        <span className={cn("font-mono text-2xl font-bold tabular-nums", RING_COLOR[verdict])}>{score}</span>
        <span className="block text-[9px] text-muted-foreground">%</span>
      </div>
    </div>
  );
}

/**
 * The right-side Marketplace Intelligence panel. Live duplicate risk, verdict,
 * reasons, and per-match cards with Compare / Images / Open / Merge / Ignore.
 * Never blocks — the editor's own Publish/Save always remains available.
 */
export function DuplicateIntelligencePanel({
  draft,
  result,
  draftPhash,
  className,
  onIgnored,
}: {
  draft: DraftProduct;
  result: DupResult;
  draftPhash: string | null;
  className?: string;
  onIgnored?: () => void;
}) {
  const navigate = useNavigate();
  const [compare, setCompare] = useState<DupMatch | null>(null);
  const [imageCompare, setImageCompare] = useState<DupMatch | null>(null);
  const [merge, setMerge] = useState<DupMatch | null>(null);
  const [busy, setBusy] = useState(false);

  const visible = result.matches.filter((m) => !m.ignored);
  const topVerdict = result.topVerdict;

  async function ignore(m: DupMatch) {
    setBusy(true);
    const { error } = await logDuplicateEvent({ draft, match: m, action: "ignored" });
    setBusy(false);
    if (error) {
      toast.error("Couldn't save ignore", { description: error.message });
      return;
    }
    m.ignored = true;
    toast.success("Ignored", { description: "We won't warn about this pair again." });
    onIgnored?.();
  }

  function openProduct(m: DupMatch) {
    navigate({ to: "/admin-product/$slug", params: { slug: m.product.slug } });
  }

  async function confirmMerge(m: DupMatch) {
    setBusy(true);
    const { error } = await logDuplicateEvent({ draft, match: m, action: "merged" });
    setBusy(false);
    if (error) {
      toast.error("Merge log failed", { description: error.message });
      return;
    }
    invalidateDetectionIndex();
    toast.success("Merge recorded", { description: "Opening the existing product to finish the merge." });
    setMerge(null);
    openProduct(m);
  }

  const hasRisk = result.topScore >= 25 && visible.length > 0;

  return (
    <aside
      className={cn(
        "flex w-full flex-col gap-3 rounded-3xl border border-border/70 bg-card/40 p-4 backdrop-blur-xl",
        className,
      )}
    >
      <div className="flex items-center gap-2">
        <span className="grid size-8 place-items-center rounded-xl bg-accent/15 text-accent">
          <Sparkles className="size-4" />
        </span>
        <div>
          <p className="text-[9px] font-mono uppercase tracking-[0.25em] text-accent">Marketplace Intelligence</p>
          <p className="text-sm font-semibold">Duplicate Risk</p>
        </div>
        {result.loading && <Loader2 className="ml-auto size-4 animate-spin text-muted-foreground" />}
      </div>

      {hasRisk ? (
        <div className="flex items-center gap-4 rounded-2xl border border-border/60 bg-background/40 p-3">
          <Gauge score={result.topScore} verdict={topVerdict} />
          <div className="min-w-0">
            <p className={cn("text-sm font-semibold", RING_COLOR[topVerdict])}>{VERDICT_LABEL[topVerdict]}</p>
            <p className="text-xs text-muted-foreground">
              Found {visible.length} similar product{visible.length === 1 ? "" : "s"}
            </p>
            <ul className="mt-1.5 space-y-0.5">
              {(visible[0]?.signals ?? [])
                .filter((s) => s.matched)
                .slice(0, 4)
                .map((s) => (
                  <li key={s.key} className="flex items-center gap-1 text-[11px] text-muted-foreground">
                    <span className="text-emerald-400">✓</span> {s.reason}
                  </li>
                ))}
            </ul>
          </div>
        </div>
      ) : (
        <div className="flex flex-col items-center gap-2 rounded-2xl border border-emerald-500/25 bg-emerald-500/5 p-6 text-center">
          <ShieldCheck className="size-8 text-emerald-400" />
          <p className="text-sm font-medium text-emerald-300">
            {result.loading ? "Analyzing marketplace…" : "Safe — no duplicates detected"}
          </p>
          <p className="text-[11px] text-muted-foreground">
            Keep typing — we scan title, brand, barcode, SKU, image and specs in real time.
          </p>
        </div>
      )}

      <div className="flex flex-col gap-2.5 overflow-y-auto">
        {visible.map((m) => (
          <DuplicateMatchCard
            key={m.product.slug}
            match={m}
            onCompare={setCompare}
            onImageCompare={setImageCompare}
            onOpen={openProduct}
            onMerge={setMerge}
            onIgnore={ignore}
          />
        ))}
      </div>

      {hasRisk && (
        <p className="mt-1 text-center text-[10px] text-muted-foreground">
          Publishing is never blocked — review, merge, add a variant, or create anyway.
        </p>
      )}

      <DuplicateCompareDialog
        open={!!compare}
        onOpenChange={(v) => !v && setCompare(null)}
        draft={draft}
        match={compare}
      />
      <ImageCompareDialog
        open={!!imageCompare}
        onOpenChange={(v) => !v && setImageCompare(null)}
        draftImage={draft.image ?? null}
        draftPhash={draftPhash}
        match={imageCompare}
      />

      {/* Merge preview */}
      <Dialog open={!!merge} onOpenChange={(v) => !v && setMerge(null)}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <GitMerge className="size-4 text-accent" /> Merge preview
            </DialogTitle>
          </DialogHeader>
          {merge && (
            <div className="space-y-3 text-sm">
              <p className="text-muted-foreground">
                Merge this draft into <strong className="text-foreground">{merge.product.name}</strong>. The
                existing product is kept as the source of truth; your new details are combined without losing
                data.
              </p>
              <ul className="space-y-1.5 rounded-xl border border-border/60 bg-background/40 p-3 text-xs">
                <MergeLine label="Media / gallery" note="Draft images appended" />
                <MergeLine label="Variants" note="New variant axes added" />
                <MergeLine label="Inventory" note="Stock combined" />
                <MergeLine label="Tags & collections" note="Union of both" />
                <MergeLine label="SEO & specifications" note="Missing fields filled" />
              </ul>
              <div className="flex justify-end gap-2">
                <button
                  onClick={() => setMerge(null)}
                  className="rounded-xl border border-border px-4 py-2 text-xs font-medium hover:text-foreground"
                >
                  Cancel
                </button>
                <button
                  onClick={() => confirmMerge(merge)}
                  disabled={busy}
                  className="inline-flex items-center gap-1.5 rounded-xl bg-accent px-4 py-2 text-xs font-semibold text-accent-foreground hover:brightness-110 disabled:opacity-60"
                >
                  {busy ? <Loader2 className="size-3.5 animate-spin" /> : <ArrowRight className="size-3.5" />}
                  Confirm & open product
                </button>
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </aside>
  );
}

function MergeLine({ label, note }: { label: string; note: string }) {
  return (
    <li className="flex items-center justify-between gap-2">
      <span className="font-medium">{label}</span>
      <span className="text-[10px] text-muted-foreground">{note}</span>
    </li>
  );
}
