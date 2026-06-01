import { createFileRoute } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import {
  Loader2, Search, CheckSquare, Square, Tag, Layers, Plus, Minus,
  Repeat, CalendarClock, Archive, Power, X, ChevronRight,
} from "lucide-react";
import { toast } from "sonner";
import { AdminShell, logActivity } from "@/components/admin/AdminShell";
import { useProducts } from "@/lib/use-products";
import { resolveImage, type Product } from "@/lib/products";
import {
  useBadgeCatalog,
  setBadgeEnabled,
  bulkAssign,
  bulkUnassign,
  bulkReplace,
  bulkUpdateAssignments,
  type BadgeType,
} from "@/lib/use-product-badges";

export const Route = createFileRoute("/admin-badges-bulk")({
  head: () => ({
    meta: [
      { title: "Bulk Badge Manager — FoundOurMarket™" },
      { name: "description", content: "Apply, remove, replace and schedule badges across many products at once." },
    ],
  }),
  component: () => (
    <AdminShell title="Bulk Badge Manager" subtitle="Apply, remove & schedule badges across many products" allow={["admin", "super_admin", "manager"]}>
      <BulkInner />
    </AdminShell>
  ),
});

type Action = "assign" | "remove" | "replace" | "schedule" | "archive";

function BulkInner() {
  const { products, loading } = useProducts();
  const { types, map } = useBadgeCatalog();
  const [query, setQuery] = useState("");
  const [cat, setCat] = useState("All");
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [action, setAction] = useState<Action>("assign");
  const [badgeId, setBadgeId] = useState("");
  const [replaceWith, setReplaceWith] = useState("");
  const [startAt, setStartAt] = useState("");
  const [endAt, setEndAt] = useState("");
  const [running, setRunning] = useState(false);
  const [progress, setProgress] = useState<{ done: number; total: number } | null>(null);

  const categories = useMemo(() => {
    const s = new Set<string>();
    for (const p of products) if (p.category) s.add(p.category);
    return ["All", ...[...s].sort()];
  }, [products]);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    return products.filter(
      (p) =>
        (cat === "All" || p.category === cat) &&
        (!q || p.name.toLowerCase().includes(q) || p.slug.toLowerCase().includes(q)),
    );
  }, [products, query, cat]);

  const usableBadges = types.filter((t) => !t.archived);

  function toggle(slug: string) {
    setSelected((prev) => {
      const n = new Set(prev);
      n.has(slug) ? n.delete(slug) : n.add(slug);
      return n;
    });
  }
  function selectAllFiltered() {
    const allSel = filtered.length > 0 && filtered.every((p) => selected.has(p.slug));
    setSelected(allSel ? new Set() : new Set(filtered.map((p) => p.slug)));
  }

  async function run() {
    const slugs = [...selected];
    if (slugs.length === 0) return toast.error("Select at least one product");
    if (action !== "archive" && !badgeId) return toast.error("Pick a badge");
    if (action === "replace" && !replaceWith) return toast.error("Pick a replacement badge");
    setRunning(true);
    setProgress({ done: 0, total: slugs.length });
    const onProgress = (done: number, total: number) => setProgress({ done, total });
    try {
      if (action === "assign") {
        const n = await bulkAssign(slugs, badgeId, onProgress);
        toast.success(`Badge applied to ${n} product${n === 1 ? "" : "s"}`);
      } else if (action === "remove") {
        await bulkUnassign(slugs, badgeId, onProgress);
        toast.success(`Badge removed from ${slugs.length} products`);
      } else if (action === "replace") {
        await bulkReplace(slugs, badgeId, replaceWith, onProgress);
        toast.success(`Badge replaced across ${slugs.length} products`);
      } else if (action === "schedule") {
        await bulkUpdateAssignments(
          slugs,
          badgeId,
          { start_at: startAt ? new Date(startAt).toISOString() : null, end_at: endAt ? new Date(endAt).toISOString() : null },
          onProgress,
        );
        toast.success(`Schedule applied to ${slugs.length} products`);
      } else if (action === "archive") {
        if (!badgeId) return toast.error("Pick a badge");
        await bulkUpdateAssignments(slugs, badgeId, { archived: true }, onProgress);
        toast.success(`Assignments archived on ${slugs.length} products`);
      }
      logActivity(`bulk_badge_${action}`, "product_badges", `${slugs.length} products`);
    } catch (e) {
      toast.error("Bulk action failed", { description: e instanceof Error ? e.message : "Try again." });
    } finally {
      setRunning(false);
      setProgress(null);
    }
  }

  async function toggleEnable(b: BadgeType) {
    try {
      await setBadgeEnabled(b.id, !b.enabled);
      toast.success(b.enabled ? "Badge disabled" : "Badge enabled");
    } catch {
      toast.error("Update failed");
    }
  }

  if (loading) {
    return <div className="min-h-[40vh] grid place-items-center"><Loader2 className="size-5 animate-spin text-accent" /></div>;
  }

  const actions: { key: Action; label: string; icon: typeof Plus }[] = [
    { key: "assign", label: "Apply", icon: Plus },
    { key: "remove", label: "Remove", icon: Minus },
    { key: "replace", label: "Replace", icon: Repeat },
    { key: "schedule", label: "Schedule", icon: CalendarClock },
    { key: "archive", label: "Archive", icon: Archive },
  ];

  return (
    <div className="space-y-5 pb-32">
      {/* Action builder */}
      <div className="card-premium rounded-2xl p-4 border border-white/10 space-y-4">
        <div className="flex flex-wrap gap-2">
          {actions.map((a) => (
            <button
              key={a.key}
              onClick={() => setAction(a.key)}
              className={`inline-flex items-center gap-1.5 px-3 py-2 rounded-xl text-xs font-bold border transition-all ${action === a.key ? "bg-accent text-accent-foreground border-accent" : "border-white/10 text-muted-foreground hover:bg-white/5"}`}
            >
              <a.icon className="size-3.5" /> {a.label}
            </button>
          ))}
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <div>
            <label className="text-[10px] font-mono uppercase tracking-widest text-muted-foreground">{action === "replace" ? "Replace badge" : "Badge"}</label>
            <select value={badgeId} onChange={(e) => setBadgeId(e.target.value)} className="mt-1 w-full h-10 rounded-xl border border-border bg-background px-3 text-sm">
              <option value="">Select badge…</option>
              {usableBadges.map((b) => <option key={b.id} value={b.id}>{b.emoji} {b.label}</option>)}
            </select>
          </div>
          {action === "replace" && (
            <div>
              <label className="text-[10px] font-mono uppercase tracking-widest text-muted-foreground">With badge</label>
              <select value={replaceWith} onChange={(e) => setReplaceWith(e.target.value)} className="mt-1 w-full h-10 rounded-xl border border-border bg-background px-3 text-sm">
                <option value="">Select replacement…</option>
                {usableBadges.filter((b) => b.id !== badgeId).map((b) => <option key={b.id} value={b.id}>{b.emoji} {b.label}</option>)}
              </select>
            </div>
          )}
          {action === "schedule" && (
            <>
              <div>
                <label className="text-[10px] font-mono uppercase tracking-widest text-muted-foreground">Activate at</label>
                <input type="datetime-local" value={startAt} onChange={(e) => setStartAt(e.target.value)} className="mt-1 w-full h-10 rounded-xl border border-border bg-background px-3 text-sm" />
              </div>
              <div>
                <label className="text-[10px] font-mono uppercase tracking-widest text-muted-foreground">Expire at</label>
                <input type="datetime-local" value={endAt} onChange={(e) => setEndAt(e.target.value)} className="mt-1 w-full h-10 rounded-xl border border-border bg-background px-3 text-sm" />
              </div>
            </>
          )}
        </div>

        <div className="flex items-center justify-between gap-3 pt-1">
          <p className="text-xs text-muted-foreground">
            <span className="text-foreground font-bold">{selected.size}</span> selected · {filtered.length} shown
          </p>
          <button
            onClick={run}
            disabled={running || selected.size === 0}
            className="inline-flex items-center gap-2 bg-accent text-accent-foreground px-5 py-2.5 rounded-full text-xs uppercase tracking-widest font-bold disabled:opacity-50"
          >
            {running ? <Loader2 className="size-3.5 animate-spin" /> : <ChevronRight className="size-3.5" />}
            Run {actions.find((a) => a.key === action)?.label}
          </button>
        </div>

        {progress && (
          <div className="space-y-1">
            <div className="h-2 rounded-full bg-white/10 overflow-hidden">
              <div className="h-full bg-accent transition-all" style={{ width: `${progress.total ? (progress.done / progress.total) * 100 : 0}%` }} />
            </div>
            <p className="text-[10px] font-mono text-muted-foreground text-right">{progress.done}/{progress.total}</p>
          </div>
        )}
      </div>

      {/* Bulk enable/disable badge types */}
      <div className="card-premium rounded-2xl p-4 border border-white/10">
        <h3 className="text-xs font-mono uppercase tracking-widest text-muted-foreground mb-3 flex items-center gap-2"><Power className="size-3.5" /> Quick enable / disable badges</h3>
        <div className="flex flex-wrap gap-2">
          {types.filter((t) => !t.archived).map((b) => (
            <button
              key={b.id}
              onClick={() => toggleEnable(b)}
              className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full text-[11px] font-bold border transition-all ${b.enabled ? "border-emerald-400/40 bg-emerald-500/15 text-emerald-300" : "border-border bg-white/5 text-muted-foreground"}`}
            >
              <span className={`size-1.5 rounded-full ${b.enabled ? "bg-emerald-400 animate-pulse" : "bg-muted-foreground/60"}`} />
              {b.emoji} {b.label}
            </button>
          ))}
        </div>
      </div>

      {/* Product picker */}
      <div className="flex flex-col sm:flex-row gap-2">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 size-4 text-muted-foreground" />
          <input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Search products…" className="w-full h-10 rounded-xl border border-border bg-background pl-9 pr-3 text-sm" />
        </div>
        <select value={cat} onChange={(e) => setCat(e.target.value)} className="h-10 rounded-xl border border-border bg-background px-3 text-sm">
          {categories.map((c) => <option key={c} value={c}>{c}</option>)}
        </select>
        <button onClick={selectAllFiltered} className="inline-flex items-center justify-center gap-1.5 h-10 px-4 rounded-xl border border-border text-xs font-bold hover:bg-white/5">
          <CheckSquare className="size-4" /> Select all
        </button>
        {selected.size > 0 && (
          <button onClick={() => setSelected(new Set())} className="inline-flex items-center justify-center gap-1.5 h-10 px-4 rounded-xl border border-border text-xs font-bold hover:bg-white/5">
            <X className="size-4" /> Clear
          </button>
        )}
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-2">
        {filtered.slice(0, 300).map((p) => (
          <ProductRow key={p.slug} p={p} selected={selected.has(p.slug)} onToggle={() => toggle(p.slug)} badges={map.get(p.slug) ?? []} />
        ))}
        {filtered.length === 0 && (
          <div className="col-span-full text-center py-16">
            <Tag className="size-8 mx-auto text-muted-foreground/40 mb-3" />
            <p className="text-sm text-muted-foreground">No products match your filters.</p>
          </div>
        )}
      </div>
      {filtered.length > 300 && (
        <p className="text-center text-[11px] text-muted-foreground">
          Showing first 300 of {filtered.length}. Refine your search — bulk actions still apply to all <b>selected</b> products.
        </p>
      )}
    </div>
  );
}

function ProductRow({ p, selected, onToggle, badges }: { p: Product; selected: boolean; onToggle: () => void; badges: { id: string; emoji: string; label: string }[] }) {
  return (
    <button
      onClick={onToggle}
      className={`flex items-center gap-3 rounded-xl border p-2.5 text-left transition-all ${selected ? "border-accent bg-accent/10" : "border-white/10 hover:bg-white/5"}`}
    >
      {selected ? <CheckSquare className="size-4 text-accent shrink-0" /> : <Square className="size-4 text-muted-foreground shrink-0" />}
      <img src={resolveImage(p.image)} alt="" className="size-9 rounded-lg object-cover shrink-0" loading="lazy" />
      <div className="min-w-0 flex-1">
        <p className="text-xs font-medium truncate">{p.name}</p>
        <p className="text-[10px] text-muted-foreground truncate">{badges.length ? badges.map((b) => b.emoji || b.label).join(" ") : p.category}</p>
      </div>
    </button>
  );
}
