import { createFileRoute } from "@tanstack/react-router";
import { useCallback, useEffect, useMemo, useState } from "react";
import {
  Loader2, Search, CheckSquare, Square, Star, TrendingUp, Sparkles, Flame,
  Check, X,
} from "lucide-react";
import { toast } from "sonner";
import { AdminShell, logActivity } from "@/components/admin/AdminShell";
import { supabase } from "@/integrations/supabase/client";
import { resolveImage } from "@/lib/products";
import { runBulkAction } from "@/lib/bulk-products";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/admin-bulk-badges")({
  head: () => ({
    meta: [
      { title: "Bulk Badge Editor — FoundOurMarket™" },
      { name: "description", content: "Enable or disable Trending, Best Seller, Flash Deal and Featured across many products at once." },
    ],
  }),
  component: () => (
    <AdminShell
      title="Bulk Badge Editor"
      subtitle="Toggle Trending, Best Seller, Flash Deal & Featured across selected products"
      allow={["admin", "super_admin", "manager"]}
    >
      <BulkBadges />
    </AdminShell>
  ),
});

type Row = {
  id: string;
  slug: string;
  name: string;
  image: string | null;
  category: string | null;
  featured: boolean;
  trending: boolean;
  bestseller: boolean;
  flash_deal: boolean;
};

type BadgeKey = "featured" | "trending" | "bestseller" | "flash_deal";

const BADGES: { key: BadgeKey; label: string; icon: React.ComponentType<{ className?: string }> }[] = [
  { key: "trending", label: "Trending", icon: TrendingUp },
  { key: "bestseller", label: "Best Seller", icon: Sparkles },
  { key: "flash_deal", label: "Flash Deal", icon: Flame },
  { key: "featured", label: "Featured", icon: Star },
];

function BulkBadges() {
  const [rows, setRows] = useState<Row[] | null>(null);
  const [query, setQuery] = useState("");
  const [cat, setCat] = useState("All");
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [busy, setBusy] = useState<string | null>(null);

  const load = useCallback(async () => {
    const { data, error } = await supabase
      .from("products")
      .select("id,slug,name,image,category,featured,trending,bestseller,flash_deal")
      .order("created_at", { ascending: false });
    if (error) { toast.error("Failed to load products"); return; }
    setRows((data ?? []) as Row[]);
  }, []);

  useEffect(() => { void load(); }, [load]);

  const categories = useMemo(() => {
    const s = new Set<string>();
    for (const r of rows ?? []) if (r.category) s.add(r.category);
    return ["All", ...[...s].sort()];
  }, [rows]);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    return (rows ?? []).filter(
      (r) =>
        (cat === "All" || r.category === cat) &&
        (!q || r.name.toLowerCase().includes(q) || r.slug.toLowerCase().includes(q)),
    );
  }, [rows, query, cat]);

  const toggle = useCallback((id: string) => {
    setSelected((prev) => {
      const n = new Set(prev);
      n.has(id) ? n.delete(id) : n.add(id);
      return n;
    });
  }, []);

  const selectAllFiltered = useCallback(() => {
    const allSel = filtered.length > 0 && filtered.every((r) => selected.has(r.id));
    setSelected(allSel ? new Set() : new Set(filtered.map((r) => r.id)));
  }, [filtered, selected]);

  async function apply(badge: BadgeKey, value: boolean) {
    const ids = [...selected];
    if (ids.length === 0) { toast.error("Select at least one product"); return; }
    setBusy(`${badge}:${value}`);
    const res = await runBulkAction(ids, "set_badge", { badge, value });
    setBusy(null);
    if (!res.ok) { toast.error(res.error ?? "Update failed"); return; }
    const label = BADGES.find((b) => b.key === badge)?.label ?? badge;
    toast.success(`${label} ${value ? "enabled" : "disabled"} · ${res.affected} product${res.affected === 1 ? "" : "s"}`);
    logActivity("bulk_set_badge", "product", undefined, { badge, value, count: res.affected });
    // Optimistic local update
    setRows((prev) =>
      prev?.map((r) => (selected.has(r.id) ? { ...r, [badge]: value } : r)) ?? prev,
    );
  }

  const selCount = selected.size;
  const allSelected = filtered.length > 0 && filtered.every((r) => selected.has(r.id));

  if (rows === null) {
    return <div className="grid place-items-center py-20"><Loader2 className="size-5 animate-spin text-accent" /></div>;
  }

  return (
    <div className="space-y-4 pb-40">
      {/* Filters */}
      <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 size-4 text-muted-foreground" />
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search products…"
            className="w-full h-10 rounded-xl border border-white/10 bg-white/[0.03] pl-9 pr-3 text-sm focus:outline-none focus:border-accent/40"
          />
        </div>
        <div className="flex items-center gap-2 overflow-x-auto">
          {categories.map((c) => (
            <button
              key={c}
              onClick={() => setCat(c)}
              className={cn(
                "shrink-0 rounded-full border px-3 h-9 text-xs font-medium transition-colors",
                cat === c
                  ? "border-accent/60 bg-accent/15 text-accent"
                  : "border-white/10 bg-card text-muted-foreground hover:text-foreground",
              )}
            >
              {c}
            </button>
          ))}
        </div>
      </div>

      {/* Select-all + count */}
      <div className="flex items-center justify-between">
        <button
          onClick={selectAllFiltered}
          className="inline-flex items-center gap-2 text-sm font-medium text-muted-foreground hover:text-foreground"
        >
          {allSelected ? <CheckSquare className="size-4 text-accent" /> : <Square className="size-4" />}
          {allSelected ? "Clear all" : "Select all"}
          <span className="text-xs text-muted-foreground">({filtered.length})</span>
        </button>
        {selCount > 0 && (
          <button onClick={() => setSelected(new Set())} className="inline-flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground">
            <X className="size-3.5" /> {selCount} selected
          </button>
        )}
      </div>

      {/* Product list */}
      <div className="space-y-1.5">
        {filtered.map((r) => {
          const sel = selected.has(r.id);
          return (
            <button
              key={r.id}
              onClick={() => toggle(r.id)}
              className={cn(
                "flex w-full items-center gap-3 rounded-xl border px-2.5 py-2 text-left transition-colors",
                sel ? "border-accent/50 bg-accent/[0.07]" : "border-white/10 bg-white/[0.02] hover:border-accent/30",
              )}
            >
              <span className={cn("grid size-5 shrink-0 place-items-center rounded-md border", sel ? "border-accent bg-accent text-accent-foreground" : "border-white/20")}>
                {sel && <Check className="size-3.5" />}
              </span>
              <span className="size-10 shrink-0 overflow-hidden rounded-lg border border-white/10 bg-card">
                {r.image && <img src={resolveImage(r.image)} alt="" className="size-full object-cover" loading="lazy" />}
              </span>
              <span className="min-w-0 flex-1">
                <span className="block truncate text-sm font-medium">{r.name}</span>
                <span className="block truncate text-[11px] text-muted-foreground">{r.category ?? "—"}</span>
              </span>
              <span className="flex shrink-0 items-center gap-1">
                {BADGES.filter((b) => r[b.key]).map((b) => (
                  <span key={b.key} title={b.label} className="grid size-6 place-items-center rounded-md bg-accent/15 text-accent">
                    <b.icon className="size-3.5" />
                  </span>
                ))}
              </span>
            </button>
          );
        })}
        {filtered.length === 0 && (
          <p className="py-12 text-center text-sm text-muted-foreground">No products match your filters.</p>
        )}
      </div>

      {/* Sticky action bar */}
      {selCount > 0 && (
        <div className="fixed inset-x-0 bottom-0 z-[60] px-3 pb-[max(0.75rem,env(safe-area-inset-bottom))]">
          <div className="mx-auto max-w-3xl rounded-2xl border border-border/60 bg-background/90 p-3 shadow-2xl backdrop-blur-xl">
            <p className="mb-2 text-xs font-medium text-muted-foreground">
              <span className="text-accent">{selCount}</span> product{selCount === 1 ? "" : "s"} selected
            </p>
            <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
              {BADGES.map((b) => (
                <div key={b.key} className="rounded-xl border border-border/50 p-2">
                  <div className="mb-1.5 flex items-center gap-1.5 text-xs font-semibold">
                    <b.icon className="size-3.5" /> {b.label}
                  </div>
                  <div className="flex gap-1.5">
                    <button
                      onClick={() => apply(b.key, true)}
                      disabled={busy !== null}
                      className="flex-1 rounded-lg bg-accent px-2 py-1.5 text-[11px] font-bold text-accent-foreground transition-all hover:brightness-110 disabled:opacity-50"
                    >
                      {busy === `${b.key}:true` ? <Loader2 className="mx-auto size-3.5 animate-spin" /> : "On"}
                    </button>
                    <button
                      onClick={() => apply(b.key, false)}
                      disabled={busy !== null}
                      className="flex-1 rounded-lg border border-border px-2 py-1.5 text-[11px] font-bold text-muted-foreground transition-colors hover:text-foreground disabled:opacity-50"
                    >
                      {busy === `${b.key}:false` ? <Loader2 className="mx-auto size-3.5 animate-spin" /> : "Off"}
                    </button>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
