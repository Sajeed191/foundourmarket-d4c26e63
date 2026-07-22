import { createFileRoute } from "@tanstack/react-router";
import { useCallback, useEffect, useMemo, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { Loader2, Star, AlertTriangle, CheckCircle2, Save, RotateCcw, Package } from "lucide-react";
import { toast } from "sonner";
import { AdminShell } from "@/components/admin/AdminShell";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";
import { invalidateProducts } from "@/lib/use-products";
import {
  listMissingInitialRatings,
  bulkSetInitialRatings,
  type MissingRatingRow,
} from "@/lib/product-rating.functions";

export const Route = createFileRoute("/admin-rating-recovery")({
  head: () => ({ meta: [{ title: "Rating Recovery — Admin" }] }),
  component: RatingRecoveryPage,
});

/** One decimal, 0.0–5.0. Empty string is treated as invalid (must set a value). */
function parseRating(input: string): number | null {
  const t = input.trim();
  if (!t) return null;
  if (!/^\d(\.\d)?$|^[0-4]\.\d$|^5(\.0)?$/.test(t)) return null;
  const n = Number(t);
  if (!Number.isFinite(n) || n < 0 || n > 5) return null;
  return Math.round(n * 10) / 10;
}

function RatingRecoveryPage() {
  const fetchRows = useServerFn(listMissingInitialRatings);
  const bulkSave = useServerFn(bulkSetInitialRatings);

  const [loading, setLoading] = useState(true);
  const [rows, setRows] = useState<MissingRatingRow[]>([]);
  const [drafts, setDrafts] = useState<Record<string, string>>({});
  const [savingSlug, setSavingSlug] = useState<string | null>(null);
  const [bulkBusy, setBulkBusy] = useState(false);
  const [bulkValue, setBulkValue] = useState("");

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetchRows();
      setRows(res.rows);
      setDrafts({});
    } catch (e) {
      toast.error("Failed to load products", { description: e instanceof Error ? e.message : undefined });
    } finally {
      setLoading(false);
    }
  }, [fetchRows]);

  useEffect(() => { void load(); }, [load]);

  const dirtyDrafts = useMemo(() => {
    const out: { slug: string; initialRating: number }[] = [];
    for (const [slug, val] of Object.entries(drafts)) {
      const n = parseRating(val);
      if (n !== null) out.push({ slug, initialRating: n });
    }
    return out;
  }, [drafts]);

  const invalidDrafts = useMemo(
    () => Object.entries(drafts).filter(([, v]) => v.trim() !== "" && parseRating(v) === null).length,
    [drafts],
  );

  const withReviews = rows.filter((r) => r.hasCustomerReviews).length;

  async function commit(updates: { slug: string; initialRating: number }[], label: string) {
    if (!updates.length) {
      toast("Nothing to save", { description: "Enter a rating (0.0–5.0) for at least one product." });
      return;
    }
    try {
      const res = await bulkSave({ data: { updates } });
      invalidateProducts();
      toast.success(label, {
        description: `Updated ${res.updated} · Display refreshed ${res.displayRefreshed} · Skipped ${res.skipped}`,
      });
      if (res.detail.skipped.length) {
        console.warn("[rating-recovery] skipped:", res.detail.skipped);
      }
      await load();
    } catch (e) {
      toast.error("Save failed", { description: e instanceof Error ? e.message : undefined });
    }
  }

  async function saveOne(slug: string) {
    const n = parseRating(drafts[slug] ?? "");
    if (n === null) {
      toast.error("Invalid rating", { description: "Use 0.0 – 5.0 with one decimal (e.g. 4.2)." });
      return;
    }
    setSavingSlug(slug);
    try { await commit([{ slug, initialRating: n }], "Rating saved"); }
    finally { setSavingSlug(null); }
  }

  async function saveAll() {
    setBulkBusy(true);
    try { await commit(dirtyDrafts, "All ratings saved"); }
    finally { setBulkBusy(false); }
  }

  function applyBulk() {
    const n = parseRating(bulkValue);
    if (n === null) {
      toast.error("Invalid rating", { description: "Use 0.0 – 5.0 with one decimal (e.g. 4.2)." });
      return;
    }
    const next: Record<string, string> = { ...drafts };
    for (const r of rows) next[r.slug] = n.toFixed(1);
    setDrafts(next);
    toast(`Filled ${rows.length} products with ${n.toFixed(1)}`, {
      description: "Click 'Save all changes' to commit.",
    });
  }

  async function bulkSaveValue() {
    const n = parseRating(bulkValue);
    if (n === null) {
      toast.error("Invalid rating", { description: "Use 0.0 – 5.0 with one decimal (e.g. 4.2)." });
      return;
    }
    if (!rows.length) return;
    setBulkBusy(true);
    try {
      await commit(rows.map((r) => ({ slug: r.slug, initialRating: n })), `Bulk set to ${n.toFixed(1)}`);
    } finally {
      setBulkBusy(false);
    }
  }

  return (
    <AdminShell title="Rating Recovery" subtitle="Restore missing admin initial ratings" allow={["admin", "super_admin"]}>
      <div className="space-y-6 p-4 sm:p-6">
        <header className="space-y-2">
          <h1 className="text-xl font-semibold tracking-tight">Rating Recovery</h1>
          <p className="text-sm text-muted-foreground">
            Restore the admin-configured initial rating for products where it is missing. Products with published
            customer reviews keep their customer average — the initial rating is stored as the fallback that
            activates automatically the moment all reviews are removed.
          </p>
        </header>

        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
          <StatCard label="Missing initial rating" value={rows.length} icon={<AlertTriangle className="size-4" />} tone="warn" />
          <StatCard label="Safe to update (no reviews)" value={rows.length - withReviews} icon={<CheckCircle2 className="size-4" />} tone="ok" />
          <StatCard label="Have customer reviews" value={withReviews} icon={<Star className="size-4" />} tone="muted" />
        </div>

        <section className="rounded-2xl border border-white/10 bg-card/60 p-4 space-y-3">
          <div className="flex flex-wrap items-center gap-2">
            <Input
              inputMode="decimal"
              placeholder="Bulk value (e.g. 4.2)"
              value={bulkValue}
              onChange={(e) => setBulkValue(e.target.value)}
              className="max-w-[160px]"
            />
            <Button variant="outline" size="sm" onClick={applyBulk} disabled={!rows.length || bulkBusy}>
              Fill all
            </Button>
            <Button size="sm" onClick={bulkSaveValue} disabled={!rows.length || bulkBusy}>
              {bulkBusy ? <Loader2 className="size-4 animate-spin" /> : "Apply & save all"}
            </Button>
            <div className="flex-1" />
            <Button variant="ghost" size="sm" onClick={load} disabled={loading}>
              <RotateCcw className={cn("size-4", loading && "animate-spin")} />
              <span className="ml-1">Refresh</span>
            </Button>
            <Button size="sm" onClick={saveAll} disabled={!dirtyDrafts.length || bulkBusy || invalidDrafts > 0}>
              <Save className="size-4" />
              <span className="ml-1">Save all changes ({dirtyDrafts.length})</span>
            </Button>
          </div>
          {invalidDrafts > 0 && (
            <p className="text-[11px] text-destructive">
              {invalidDrafts} invalid entry(ies) — allowed range is 0.0 – 5.0 with one decimal.
            </p>
          )}
        </section>

        {loading ? (
          <div className="grid place-items-center py-16">
            <Loader2 className="size-6 animate-spin text-muted-foreground" />
          </div>
        ) : rows.length === 0 ? (
          <div className="rounded-2xl border border-white/10 bg-card/60 p-10 text-center space-y-2">
            <CheckCircle2 className="size-8 text-emerald-400 mx-auto" />
            <p className="text-sm font-medium">Every product has an admin initial rating.</p>
            <p className="text-xs text-muted-foreground">Nothing to recover.</p>
          </div>
        ) : (
          <ul className="space-y-2">
            {rows.map((r) => {
              const draft = drafts[r.slug] ?? "";
              const parsed = parseRating(draft);
              const invalid = draft.trim() !== "" && parsed === null;
              return (
                <li
                  key={r.slug}
                  className="rounded-xl border border-white/10 bg-card/60 p-3 flex flex-wrap items-center gap-3"
                >
                  <div className="size-14 shrink-0 rounded-lg overflow-hidden bg-white/5 grid place-items-center">
                    {r.image ? (
                      <img src={r.image} alt={r.name} className="w-full h-full object-cover" loading="lazy" />
                    ) : (
                      <Package className="size-5 text-muted-foreground" />
                    )}
                  </div>
                  <div className="min-w-0 flex-1">
                    <p className="text-sm font-medium truncate">{r.name}</p>
                    <p className="text-[11px] text-muted-foreground truncate">
                      {r.brand || "—"} · {r.category || "—"} · current:{" "}
                      <span className="tabular-nums">{r.initialRating.toFixed(1)}</span>
                    </p>
                    {r.hasCustomerReviews && (
                      <p className="text-[10px] text-amber-400 mt-0.5">
                        Has {r.publishedReviewCount} published review(s) — display stays on customer average.
                      </p>
                    )}
                  </div>
                  <Input
                    inputMode="decimal"
                    placeholder="0.0 – 5.0"
                    value={draft}
                    onChange={(e) => setDrafts((d) => ({ ...d, [r.slug]: e.target.value }))}
                    className={cn("w-24", invalid && "border-destructive focus-visible:ring-destructive")}
                  />
                  <Button size="sm" onClick={() => saveOne(r.slug)} disabled={savingSlug === r.slug || parsed === null}>
                    {savingSlug === r.slug ? <Loader2 className="size-4 animate-spin" /> : "Save"}
                  </Button>
                </li>
              );
            })}
          </ul>
        )}
      </div>
    </AdminShell>
  );
}

function StatCard({
  label, value, icon, tone,
}: { label: string; value: number; icon: React.ReactNode; tone: "ok" | "warn" | "muted" }) {
  const toneCls =
    tone === "ok" ? "text-emerald-400" : tone === "warn" ? "text-amber-400" : "text-muted-foreground";
  return (
    <div className="rounded-2xl border border-white/10 bg-card/60 p-4">
      <div className={cn("flex items-center gap-2 text-[11px] uppercase tracking-widest", toneCls)}>
        {icon}
        <span>{label}</span>
      </div>
      <p className="mt-2 text-2xl font-semibold tabular-nums">{value}</p>
    </div>
  );
}
