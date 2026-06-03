import { useEffect, useState, useCallback } from "react";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import { Star, RotateCcw, Loader2, History, ShieldCheck } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";
import {
  getProductRating,
  setProductRating,
  recalculateProductRating,
  RATING_SOURCES,
  type ProductRatingState,
  type RatingAuditEntry,
  type RatingSource,
} from "@/lib/product-rating.functions";
import { invalidateProducts } from "@/lib/use-products";

const SOURCE_LABELS: Record<RatingSource, string> = {
  customer_reviews: "Customer Reviews",
  imported_supplier: "Imported Supplier Data",
  marketplace_imported: "Marketplace Imported",
};

function Stars({ value }: { value: number }) {
  return (
    <div className="flex items-center gap-0.5">
      {[1, 2, 3, 4, 5].map((i) => (
        <Star
          key={i}
          className={cn(
            "size-4",
            i <= Math.round(value) ? "fill-accent text-accent" : "text-muted-foreground/40",
          )}
        />
      ))}
    </div>
  );
}

export function ProductRatingManager({ slug }: { slug: string }) {
  const fetchRating = useServerFn(getProductRating);
  const saveRating = useServerFn(setProductRating);
  const recalc = useServerFn(recalculateProductRating);

  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [state, setState] = useState<ProductRatingState | null>(null);
  const [audit, setAudit] = useState<RatingAuditEntry[]>([]);
  const [initialRating, setInitialRating] = useState("");
  const [initialCount, setInitialCount] = useState("");
  const [source, setSource] = useState<RatingSource>("customer_reviews");

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetchRating({ data: { slug } });
      setState(res.state);
      setAudit(res.audit);
      setInitialRating(String(res.state.initialRating || ""));
      setInitialCount(String(res.state.initialReviewCount || ""));
      setSource(res.state.ratingSource);
    } catch (e) {
      toast.error("Couldn't load ratings", {
        description: e instanceof Error ? e.message : "Try again.",
      });
    } finally {
      setLoading(false);
    }
  }, [fetchRating, slug]);

  useEffect(() => {
    void load();
  }, [load]);

  async function handleSave() {
    const r = Number(initialRating);
    const c = Math.round(Number(initialCount) || 0);
    if (!Number.isFinite(r) || r < 1 || r > 5) {
      toast.error("Initial rating must be between 1.0 and 5.0");
      return;
    }
    setBusy(true);
    try {
      const res = await saveRating({
        data: { slug, initialRating: r, initialReviewCount: c, ratingSource: source },
      });
      setState(res.state);
      await invalidateProducts();
      await load();
      toast.success("Rating updated", { description: "Blended rating recalculated and logged." });
    } catch (e) {
      toast.error("Save failed", { description: e instanceof Error ? e.message : "Try again." });
    } finally {
      setBusy(false);
    }
  }

  async function handleRecalc() {
    setBusy(true);
    try {
      const res = await recalc({ data: { slug } });
      setState(res.state);
      await invalidateProducts();
      await load();
      toast.success("Recalculated", { description: "Final display rating refreshed." });
    } catch (e) {
      toast.error("Recalc failed", { description: e instanceof Error ? e.message : "Try again." });
    } finally {
      setBusy(false);
    }
  }

  if (loading) {
    return (
      <div className="flex items-center gap-2 py-6 text-sm text-muted-foreground">
        <Loader2 className="size-4 animate-spin" /> Loading rating data…
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {/* Editable initial / imported baseline */}
      <div className="rounded-xl border border-border/60 bg-card/40 p-3 space-y-3">
        <p className="text-xs font-medium text-muted-foreground">Imported / initial baseline</p>
        <div className="grid grid-cols-2 gap-3">
          <label className="space-y-1">
            <span className="text-xs text-muted-foreground">Initial Rating (1.0–5.0)</span>
            <Input
              type="number"
              step="0.1"
              min="1"
              max="5"
              value={initialRating}
              onChange={(e) => setInitialRating(e.target.value)}
            />
          </label>
          <label className="space-y-1">
            <span className="text-xs text-muted-foreground">Initial Review Count</span>
            <Input
              type="number"
              min="0"
              value={initialCount}
              onChange={(e) => setInitialCount(e.target.value)}
            />
          </label>
        </div>
        <label className="space-y-1 block">
          <span className="text-xs text-muted-foreground">Rating Source</span>
          <select
            value={source}
            onChange={(e) => setSource(e.target.value as RatingSource)}
            className="flex h-9 w-full rounded-md border border-input bg-background px-3 py-1 text-sm shadow-sm focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
          >
            {RATING_SOURCES.map((s) => (
              <option key={s} value={s}>
                {SOURCE_LABELS[s]}
              </option>
            ))}
          </select>
        </label>
        <div className="flex flex-wrap gap-2">
          <Button size="sm" className="h-8 text-xs" disabled={busy} onClick={handleSave}>
            {busy ? <Loader2 className="size-3.5 animate-spin" /> : <ShieldCheck className="size-3.5" />}
            Save & recalculate
          </Button>
          <Button
            size="sm"
            variant="outline"
            className="h-8 text-xs"
            disabled={busy}
            onClick={handleRecalc}
          >
            <RotateCcw className="size-3.5" /> Recalculate
          </Button>
        </div>
      </div>

      {/* Read-only computed breakdown */}
      {state && (
        <div className="grid grid-cols-2 gap-2 text-sm">
          <Stat label="Customer Rating" value={state.customerRating.toFixed(2)} />
          <Stat label="Customer Reviews" value={String(state.customerReviewCount)} />
          <Stat label="Total Reviews" value={String(state.totalReviews)} />
          <div className="rounded-lg border border-accent/40 bg-accent/5 p-2.5">
            <p className="text-[11px] uppercase tracking-wide text-muted-foreground">Final Display Rating</p>
            <div className="mt-1 flex items-center gap-2">
              <Stars value={state.finalRating} />
              <span className="font-semibold">{state.finalRating.toFixed(1)}</span>
            </div>
          </div>
        </div>
      )}
      <p className="text-[11px] text-muted-foreground">
        Customer-generated ratings can&apos;t be edited directly. Use review moderation to hide fake or
        spam reviews — the blended rating recalculates automatically.
      </p>

      {/* Audit history */}
      {audit.length > 0 && (
        <div className="space-y-1.5">
          <p className="flex items-center gap-1.5 text-xs font-medium text-muted-foreground">
            <History className="size-3.5" /> Change history
          </p>
          <ul className="max-h-40 space-y-1 overflow-y-auto text-[11px]">
            {audit.map((a) => (
              <li
                key={a.id}
                className="flex items-center justify-between rounded-md border border-border/40 bg-card/30 px-2 py-1"
              >
                <span className="font-medium">{a.action.replace(/_/g, " ")}</span>
                <span className="text-muted-foreground">
                  {a.final_rating != null ? `★${Number(a.final_rating).toFixed(1)} · ` : ""}
                  {new Date(a.created_at).toLocaleString()}
                </span>
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-lg border border-border/50 bg-card/30 p-2.5">
      <p className="text-[11px] uppercase tracking-wide text-muted-foreground">{label}</p>
      <p className="mt-1 font-semibold">{value}</p>
    </div>
  );
}
