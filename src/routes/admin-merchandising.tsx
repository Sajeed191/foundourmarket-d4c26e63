import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useMemo, useRef, useState } from "react";
import { Reorder, motion } from "framer-motion";
import {
  Loader2, GripVertical, Smartphone, Monitor, Eye, ShoppingCart, IndianRupee, TrendingUp,
  Package, Sparkles, Crown, Check, X, ArrowRightLeft, Megaphone, Flame, Trophy, AlertTriangle, Rocket, Shuffle,
} from "lucide-react";
import { triggerGlobalReshuffle } from "@/lib/use-rotation-nonce";
import { toast } from "sonner";
import { AdminShell, logActivity } from "@/components/admin/AdminShell";
import { KpiCard } from "@/components/admin/KpiCard";
import { ProductCard } from "@/components/site/ProductCard";
import { rowToProduct, resolveImage } from "@/lib/products";
import { invalidateProducts } from "@/lib/use-products";
import {
  MERCH_SECTIONS, type MerchRow, type MerchSection, fetchMerchProducts, conversionOf,
  hasAnyMerchFlag, sectionSort, persistOrder, setFlag, setFlagBulk, setHero,
} from "@/lib/merchandising";

export const Route = createFileRoute("/admin-merchandising")({
  head: () => ({ meta: [{ title: "Merchandising Center — Admin" }, { name: "robots", content: "noindex, nofollow" }] }),
  component: MerchandisingPage,
});

const inr = (v: number) =>
  new Intl.NumberFormat("en-IN", { style: "currency", currency: "INR", notation: "compact", maximumFractionDigits: 1 }).format(Number(v) || 0);
const num = (v: number) => new Intl.NumberFormat("en-IN", { notation: "compact" }).format(Number(v) || 0);

/* ---------------------------------------------------------------- page ---- */

function MerchandisingPage() {
  const [rows, setRows] = useState<MerchRow[] | null>(null);
  const [activeKey, setActiveKey] = useState<string>(MERCH_SECTIONS[0].key);
  const [items, setItems] = useState<MerchRow[]>([]);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [device, setDevice] = useState<"mobile" | "desktop">("mobile");
  const [moveFor, setMoveFor] = useState<string | null>(null);
  const [reshuffling, setReshuffling] = useState(false);
  const persisting = useRef(false);

  const section = MERCH_SECTIONS.find((s) => s.key === activeKey)!;

  useEffect(() => { fetchMerchProducts().then(setRows).catch((e) => toast.error("Load failed", { description: e.message })); }, []);

  // Rebuild the ordered list whenever the section or underlying rows change.
  useEffect(() => {
    if (!rows) return;
    setItems(rows.filter((r) => !!r[section.flag]).sort(sectionSort));
    setSelected(new Set());
    setMoveFor(null);
  }, [rows, section.flag]);

  function patchRows(ids: string[], patch: (r: MerchRow) => MerchRow) {
    setRows((prev) => prev?.map((r) => (ids.includes(r.id) ? patch(r) : r)) ?? prev);
  }

  async function commitOrder(next: MerchRow[]) {
    if (persisting.current) return;
    persisting.current = true;
    const ids = next.map((r) => r.id);
    try {
      await persistOrder(ids);
      patchRows(ids, (r) => {
        const i = ids.indexOf(r.id);
        return { ...r, homepage_position: i, priority_score: Math.max(0, 100 - Math.round((i / Math.max(1, ids.length - 1)) * 100)) };
      });
      logActivity("merchandising_reordered", "section", section.key, { count: ids.length });
      invalidateProducts();
      toast.success("Order saved");
    } catch (e: any) {
      toast.error("Reorder failed", { description: e.message });
    } finally {
      persisting.current = false;
    }
  }

  async function toggleMembership(row: MerchRow, target: MerchSection, value: boolean) {
    try {
      await setFlag(row.id, target.flag, value);
      patchRows([row.id], (r) => ({ ...r, [target.flag]: value }));
      invalidateProducts();
      toast.success(value ? `Added to ${target.label}` : `Removed from ${target.label}`);
    } catch (e: any) {
      toast.error("Update failed", { description: e.message });
    }
  }

  async function moveToSection(row: MerchRow, target: MerchSection) {
    try {
      await setFlag(row.id, section.flag, false);
      await setFlag(row.id, target.flag, true);
      patchRows([row.id], (r) => ({ ...r, [section.flag]: false, [target.flag]: true }));
      setMoveFor(null);
      invalidateProducts();
      toast.success(`Moved to ${target.label}`);
    } catch (e: any) {
      toast.error("Move failed", { description: e.message });
    }
  }

  async function bulkApply(target: MerchSection | "remove") {
    const ids = [...selected];
    if (!ids.length) return;
    try {
      if (target === "remove") {
        await setFlagBulk(ids, section.flag, false);
        patchRows(ids, (r) => ({ ...r, [section.flag]: false }));
        toast.success(`Removed ${ids.length} from ${section.label}`);
      } else {
        await setFlagBulk(ids, target.flag, true);
        patchRows(ids, (r) => ({ ...r, [target.flag]: true }));
        toast.success(`Added ${ids.length} to ${target.label}`);
      }
      setSelected(new Set());
      invalidateProducts();
    } catch (e: any) {
      toast.error("Bulk action failed", { description: e.message });
    }
  }

  const toggleSel = (id: string) =>
    setSelected((prev) => { const n = new Set(prev); n.has(id) ? n.delete(id) : n.add(id); return n; });

  const totals = useMemo(() => {
    const all = rows ?? [];
    const counts: Record<string, number> = {};
    for (const s of MERCH_SECTIONS) counts[s.key] = all.filter((r) => !!r[s.flag]).length;
    return {
      products: all.length,
      merchandised: all.filter(hasAnyMerchFlag).length,
      hero: all.filter((r) => r.homepage_hero).length,
      sectionCount: items.length,
      counts,
    };
  }, [rows, items]);

  return (
    <AdminShell
      title="Merchandising Center"
      subtitle="Place, rank & preview products across the storefront"
      allow={["admin", "super_admin", "manager", "editor"]}
    >
      <div className="flex items-center justify-between gap-3 mb-3">
        <p className="text-[11px] text-muted-foreground font-mono">
          Reshuffle Best Sellers, Trending &amp; Flash Deals order for every shopper instantly.
        </p>
        <button
          onClick={async () => {
            setReshuffling(true);
            const ok = await triggerGlobalReshuffle();
            setReshuffling(false);
            if (ok) {
              toast.success("Collections reshuffled", { description: "New order is live for all shoppers." });
              logActivity("merchandising.reshuffle", "Triggered global product reshuffle");
            } else {
              toast.error("Reshuffle failed", { description: "Only admins can reshuffle." });
            }
          }}
          disabled={reshuffling}
          className="shrink-0 inline-flex items-center gap-1.5 rounded-full bg-accent/15 text-accent border border-accent/40 px-4 py-2 text-xs font-medium hover:bg-accent/25 transition-colors disabled:opacity-50"
        >
          <Shuffle className={`size-3.5 ${reshuffling ? "animate-spin" : ""}`} /> Reshuffle all
        </button>
      </div>

      <div className="grid grid-cols-3 lg:grid-cols-6 gap-3 mb-5">
        <KpiCard label="Products" value={totals.products} icon={<Package className="size-4" />} />
        <KpiCard label="Featured" value={totals.counts.featured} icon={<Sparkles className="size-4" />} />
        <KpiCard label="Trending" value={totals.counts.trending} icon={<TrendingUp className="size-4" />} />
        <KpiCard label="Flash Deals" value={totals.counts.flash_deal} icon={<Sparkles className="size-4" />} />
        <KpiCard label="Recommended" value={totals.counts.recommended} icon={<TrendingUp className="size-4" />} />
        <KpiCard label="Hero" value={totals.hero} icon={<Crown className="size-4" />} />
      </div>


      {/* Section tabs */}
      <div className="flex gap-1.5 overflow-x-auto -mx-1 px-1 pb-1 mb-4">
        {MERCH_SECTIONS.map((s) => {
          const count = (rows ?? []).filter((r) => !!r[s.flag]).length;
          return (
            <button key={s.key} onClick={() => setActiveKey(s.key)}
              className={`shrink-0 whitespace-nowrap rounded-full px-3.5 py-1.5 text-xs font-medium transition-colors border ${
                activeKey === s.key ? "bg-accent/15 text-accent border-accent/40" : "text-muted-foreground border-white/10 hover:bg-white/5"
              }`}>
              {s.label} <span className="ml-1 opacity-60">{count}</span>
            </button>
          );
        })}
      </div>

      {rows === null ? (
        <div className="grid place-items-center py-24"><Loader2 className="size-5 animate-spin text-accent" /></div>
      ) : activeKey === "homepage_hero" ? (
        <HeroManager rows={rows} onPublish={async (id) => {
          await setHero(id);
          setRows((prev) => prev?.map((r) => ({ ...r, homepage_hero: r.id === id })) ?? prev);
          logActivity("homepage_hero_set", "product", id);
          invalidateProducts();
          toast.success("Homepage hero published");
        }} />
      ) : (
        <div className="grid grid-cols-1 xl:grid-cols-[1fr_minmax(320px,420px)] gap-5">
          {/* Left: ranked, draggable list */}
          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <p className="text-xs text-muted-foreground">
                Drag <GripVertical className="inline size-3" /> to rank — saves priority &amp; position automatically.
              </p>
            </div>

            {items.length === 0 ? (
              <div className="card-premium rounded-2xl p-10 text-center text-sm text-muted-foreground">
                No products in {section.label} yet. Add some from another section or via bulk actions.
              </div>
            ) : (
              <Reorder.Group axis="y" values={items} onReorder={setItems} className="space-y-2">
                {items.map((row, i) => (
                  <Reorder.Item key={row.id} value={row} onDragEnd={() => commitOrder(items)}
                    className="card-premium rounded-2xl p-3 cursor-grab active:cursor-grabbing select-none">
                    <MerchListCard
                      row={row} rank={i} selected={selected.has(row.id)} moveOpen={moveFor === row.id}
                      currentSection={section}
                      onSelect={() => toggleSel(row.id)}
                      onMoveToggle={() => setMoveFor((p) => (p === row.id ? null : row.id))}
                      onMove={(t) => moveToSection(row, t)}
                      onRemove={() => toggleMembership(row, section, false)}
                    />
                  </Reorder.Item>
                ))}
              </Reorder.Group>
            )}
          </div>

          {/* Right: live preview */}
          <LivePreview items={items} device={device} setDevice={setDevice} sectionLabel={section.label} />
        </div>
      )}

      {/* Smart insights */}
      {rows && <SmartInsights rows={rows} onAdd={(row, target) => toggleMembership(row, target, true)} />}

      {/* Bulk action dock */}
      {selected.size > 0 && (
        <motion.div initial={{ y: 60, opacity: 0 }} animate={{ y: 0, opacity: 1 }}
          className="fixed bottom-0 inset-x-0 lg:left-[17.5rem] z-30 border-t border-border bg-background/90 backdrop-blur-xl px-4 py-3">
          <div className="max-w-4xl mx-auto flex flex-wrap items-center gap-2">
            <span className="text-xs font-medium mr-1">{selected.size} selected</span>
            <BulkBtn icon={<Sparkles className="size-3" />} label="Featured" onClick={() => bulkApply(MERCH_SECTIONS[0])} />
            <BulkBtn icon={<Flame className="size-3" />} label="Trending" onClick={() => bulkApply(MERCH_SECTIONS[1])} />
            <BulkBtn icon={<Trophy className="size-3" />} label="Best Seller" onClick={() => bulkApply(MERCH_SECTIONS[2])} />
            <BulkBtn icon={<X className="size-3" />} label={`Remove from ${section.label}`} onClick={() => bulkApply("remove")} danger />
            <button onClick={() => setSelected(new Set())} className="ml-auto text-xs text-muted-foreground hover:text-foreground">Clear</button>
          </div>
        </motion.div>
      )}
    </AdminShell>
  );
}

/* --------------------------------------------------------- list card ----- */

function MerchListCard({
  row, rank, selected, moveOpen, currentSection, onSelect, onMoveToggle, onMove, onRemove,
}: {
  row: MerchRow; rank: number; selected: boolean; moveOpen: boolean; currentSection: MerchSection;
  onSelect: () => void; onMoveToggle: () => void; onMove: (t: MerchSection) => void; onRemove: () => void;
}) {
  const conv = conversionOf(row);
  return (
    <div className="flex items-center gap-3">
      <GripVertical className="size-4 text-muted-foreground shrink-0" />
      <span className="w-5 text-center text-[11px] font-mono text-muted-foreground shrink-0">{rank + 1}</span>
      <input type="checkbox" checked={selected} onChange={onSelect} onPointerDownCapture={(e) => e.stopPropagation()}
        className="accent-[var(--accent)] shrink-0" />
      <div className="size-12 rounded-xl overflow-hidden bg-white/5 border border-white/10 shrink-0 grid place-items-center">
        {row.image ? <img loading="lazy" decoding="async" src={resolveImage(row.image)} alt="" className="size-full object-cover" /> : <Package className="size-4 text-muted-foreground" />}
      </div>
      <div className="min-w-0 flex-1">
        <p className="text-sm font-medium truncate">{row.name}</p>
        <div className="flex flex-wrap gap-x-3 gap-y-0.5 mt-0.5 text-[10px] text-muted-foreground font-mono">
          <span className="inline-flex items-center gap-1"><Eye className="size-3" />{num(row.views_count)}</span>
          <span className="inline-flex items-center gap-1"><ShoppingCart className="size-3" />{num(row.orders_count)}</span>
          <span className="inline-flex items-center gap-1"><IndianRupee className="size-3" />{inr(row.revenue)}</span>
          <span className="inline-flex items-center gap-1"><TrendingUp className="size-3" />{conv.toFixed(1)}%</span>
        </div>
      </div>
      <div className="relative shrink-0 flex items-center gap-1" onPointerDownCapture={(e) => e.stopPropagation()}>
        <button onClick={onMoveToggle} title="Move to section"
          className="size-8 grid place-items-center rounded-lg border border-white/10 text-muted-foreground hover:text-accent hover:border-accent/40">
          <ArrowRightLeft className="size-3.5" />
        </button>
        <button onClick={onRemove} title="Remove from section"
          className="size-8 grid place-items-center rounded-lg border border-white/10 text-muted-foreground hover:text-destructive hover:border-destructive/40">
          <X className="size-3.5" />
        </button>
        {moveOpen && (
          <div className="absolute right-0 top-9 z-20 w-44 rounded-xl border border-white/10 bg-background/95 backdrop-blur-xl p-1 shadow-xl">
            {MERCH_SECTIONS.filter((s) => s.key !== currentSection.key).map((s) => (
              <button key={s.key} onClick={() => onMove(s)}
                className="w-full text-left px-3 py-1.5 text-xs rounded-lg hover:bg-white/5">{s.label}</button>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

/* --------------------------------------------------------- live preview -- */

function LivePreview({ items, device, setDevice, sectionLabel }: {
  items: MerchRow[]; device: "mobile" | "desktop"; setDevice: (d: "mobile" | "desktop") => void; sectionLabel: string;
}) {
  const products = useMemo(
    () => items.slice(0, 8).map((r) => rowToProduct(r as unknown as Parameters<typeof rowToProduct>[0])),
    [items],
  );
  return (
    <div className="card-premium rounded-2xl p-4 space-y-3 self-start xl:sticky xl:top-4">
      <div className="flex items-center justify-between">
        <h3 className="text-sm font-medium">{sectionLabel} preview</h3>
        <div className="flex items-center gap-1">
          <PreviewToggle active={device === "mobile"} onClick={() => setDevice("mobile")} icon={<Smartphone className="size-3" />} label="Mobile" />
          <PreviewToggle active={device === "desktop"} onClick={() => setDevice("desktop")} icon={<Monitor className="size-3" />} label="Desktop" />
        </div>
      </div>
      <div className="rounded-2xl border border-white/10 bg-gradient-to-b from-white/[0.04] to-transparent p-3 overflow-x-auto">
        <div className={device === "mobile" ? "mx-auto w-[300px]" : "w-full min-w-[520px]"}>
          {products.length === 0 ? (
            <p className="text-center text-xs text-muted-foreground py-10">Nothing to preview yet.</p>
          ) : (
            <div className={`grid gap-3 ${device === "mobile" ? "grid-cols-2" : "grid-cols-3"}`}>
              {products.map((p) => <ProductCard key={p.id ?? p.slug} product={p} />)}
            </div>
          )}
        </div>
      </div>
      <p className="text-center text-[10px] text-muted-foreground">Real storefront cards — updates instantly as you rank.</p>
    </div>
  );
}

function PreviewToggle({ active, onClick, icon, label }: { active: boolean; onClick: () => void; icon: React.ReactNode; label: string }) {
  return (
    <button onClick={onClick}
      className={`inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg border text-[10px] font-mono uppercase tracking-widest ${
        active ? "border-accent/40 bg-accent/10 text-accent" : "border-white/10 text-muted-foreground"
      }`}>
      {icon} {label}
    </button>
  );
}

/* --------------------------------------------------------- hero manager -- */

function HeroManager({ rows, onPublish }: { rows: MerchRow[]; onPublish: (id: string) => Promise<void> }) {
  const current = rows.find((r) => r.homepage_hero) ?? null;
  const [pending, setPending] = useState<string | null>(current?.id ?? null);
  const [publishing, setPublishing] = useState(false);
  const hero = rows.find((r) => r.id === pending) ?? current;
  const dirty = pending != null && pending !== current?.id;

  async function publish() {
    if (!pending) return;
    setPublishing(true);
    await onPublish(pending);
    setPublishing(false);
  }

  return (
    <div className="grid grid-cols-1 lg:grid-cols-[1fr_minmax(300px,400px)] gap-5">
      <div className="space-y-3">
        <h3 className="text-sm font-medium">Select hero product</h3>
        <div className="grid grid-cols-2 sm:grid-cols-3 gap-2 max-h-[460px] overflow-y-auto pr-1">
          {rows.map((r) => (
            <button key={r.id} onClick={() => setPending(r.id)}
              className={`text-left rounded-xl border p-2 transition-colors ${
                pending === r.id ? "border-accent/60 bg-accent/10" : "border-white/10 hover:border-white/20"
              }`}>
              <div className="aspect-square rounded-lg overflow-hidden bg-white/5 grid place-items-center mb-1.5">
                {r.image ? <img loading="lazy" decoding="async" src={resolveImage(r.image)} alt="" className="size-full object-cover" /> : <Package className="size-5 text-muted-foreground" />}
              </div>
              <p className="text-xs truncate">{r.name}</p>
              {pending === r.id && <span className="mt-1 inline-flex items-center gap-1 text-[10px] text-accent"><Check className="size-3" /> Selected</span>}
            </button>
          ))}
        </div>
      </div>

      <div className="space-y-3 self-start lg:sticky lg:top-4">
        <h3 className="text-sm font-medium">Hero banner preview</h3>
        <div className="relative overflow-hidden rounded-2xl border border-white/10 min-h-[240px] grid place-items-center bg-card">
          {hero ? (
            <>
              {hero.image && <img loading="lazy" decoding="async" src={resolveImage(hero.image)} alt="" className="absolute inset-0 size-full object-cover opacity-40" />}
              <div className="relative z-10 p-6 text-center space-y-2">
                <span className="inline-flex items-center gap-1 text-[10px] font-mono uppercase tracking-widest text-accent"><Crown className="size-3" /> Homepage Hero</span>
                <p className="text-xl font-display font-semibold">{hero.name}</p>
                {hero.tagline && <p className="text-xs text-muted-foreground max-w-sm mx-auto">{hero.tagline}</p>}
                <span className="inline-block mt-2 rounded-full bg-accent px-5 py-2 text-xs font-semibold text-accent-foreground">Shop now</span>
              </div>
            </>
          ) : (
            <p className="text-xs text-muted-foreground p-6">Select a product to preview the hero banner.</p>
          )}
        </div>
        <button onClick={publish} disabled={!dirty || publishing}
          className="w-full inline-flex items-center justify-center gap-2 rounded-full bg-accent px-5 py-2.5 text-xs font-semibold text-accent-foreground transition-all hover:brightness-110 disabled:opacity-40 disabled:cursor-not-allowed">
          {publishing ? <Loader2 className="size-3.5 animate-spin" /> : <Crown className="size-3.5" />}
          {dirty ? "Publish changes" : "Hero is live"}
        </button>
      </div>
    </div>
  );
}

/* ------------------------------------------------------- smart insights -- */

function SmartInsights({ rows, onAdd }: { rows: MerchRow[]; onAdd: (row: MerchRow, target: MerchSection) => void }) {
  const insights = useMemo(() => {
    const withViews = rows.filter((r) => (Number(r.views_count) || 0) > 0);
    const sortedViews = [...withViews].map((r) => Number(r.views_count) || 0).sort((a, b) => a - b);
    const medianViews = sortedViews.length ? sortedViews[Math.floor(sortedViews.length / 2)] : 0;
    const now = Date.now();

    const highViewLowConv = withViews
      .filter((r) => (Number(r.views_count) || 0) >= medianViews && conversionOf(r) < 1.5)
      .sort((a, b) => (Number(b.views_count) || 0) - (Number(a.views_count) || 0))
      .slice(0, 5);

    const fastGrowing = rows
      .filter((r) => r.created_at && now - new Date(r.created_at).getTime() < 45 * 864e5)
      .sort((a, b) => (Number(b.sold_count) || 0) - (Number(a.sold_count) || 0))
      .slice(0, 5);

    const topRevenue = [...rows].sort((a, b) => (Number(b.revenue) || 0) - (Number(a.revenue) || 0)).slice(0, 5);

    const needingPromotion = rows
      .filter((r) => !hasAnyMerchFlag(r) && (Number(r.views_count) || 0) <= medianViews)
      .sort((a, b) => (Number(b.revenue) || 0) - (Number(a.revenue) || 0))
      .slice(0, 5);

    return { highViewLowConv, fastGrowing, topRevenue, needingPromotion };
  }, [rows]);

  return (
    <div className="mt-6">
      <h2 className="text-sm font-display mb-3 flex items-center gap-2"><Sparkles className="size-4 text-accent" /> Smart insights</h2>
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <InsightCard title="High views · low conversion" icon={<AlertTriangle className="size-4" />} tone="warn"
          rows={insights.highViewLowConv} action={MERCH_SECTIONS[4]} actionLabel="Flash Deal" onAdd={onAdd}
          metric={(r) => `${conversionOf(r).toFixed(1)}% · ${num(r.views_count)} views`} />
        <InsightCard title="Fast growing" icon={<Rocket className="size-4" />} tone="accent"
          rows={insights.fastGrowing} action={MERCH_SECTIONS[1]} actionLabel="Trending" onAdd={onAdd}
          metric={(r) => `${num(r.sold_count)} sold`} />
        <InsightCard title="Top revenue" icon={<Trophy className="size-4" />} tone="accent"
          rows={insights.topRevenue} action={MERCH_SECTIONS[2]} actionLabel="Best Seller" onAdd={onAdd}
          metric={(r) => inr(r.revenue)} />
        <InsightCard title="Needing promotion" icon={<Megaphone className="size-4" />} tone="muted"
          rows={insights.needingPromotion} action={MERCH_SECTIONS[0]} actionLabel="Featured" onAdd={onAdd}
          metric={(r) => `${num(r.views_count)} views`} />
      </div>
    </div>
  );
}

function InsightCard({ title, icon, tone, rows, action, actionLabel, onAdd, metric }: {
  title: string; icon: React.ReactNode; tone: "warn" | "accent" | "muted";
  rows: MerchRow[]; action: MerchSection; actionLabel: string;
  onAdd: (row: MerchRow, target: MerchSection) => void; metric: (r: MerchRow) => string;
}) {
  const toneCls = tone === "warn" ? "text-amber-400" : tone === "accent" ? "text-accent" : "text-muted-foreground";
  return (
    <div className="card-premium rounded-2xl p-4">
      <div className={`flex items-center gap-2 mb-3 text-sm font-medium ${toneCls}`}>{icon} {title}</div>
      {rows.length === 0 ? (
        <p className="text-xs text-muted-foreground py-4 text-center">No products match right now.</p>
      ) : (
        <ul className="space-y-2">
          {rows.map((r) => (
            <li key={r.id} className="flex items-center gap-3">
              <div className="size-9 rounded-lg overflow-hidden bg-white/5 border border-white/10 shrink-0 grid place-items-center">
                {r.image ? <img loading="lazy" decoding="async" src={resolveImage(r.image)} alt="" className="size-full object-cover" /> : <Package className="size-4 text-muted-foreground" />}
              </div>
              <div className="min-w-0 flex-1">
                <p className="text-xs truncate">{r.name}</p>
                <p className="text-[10px] text-muted-foreground font-mono">{metric(r)}</p>
              </div>
              <button onClick={() => onAdd(r, action)}
                className="shrink-0 rounded-full border border-accent/40 text-accent px-2.5 py-1 text-[10px] font-medium hover:bg-accent/10">
                + {actionLabel}
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

/* --------------------------------------------------------------- bits ---- */

function BulkBtn({ icon, label, onClick, danger }: { icon: React.ReactNode; label: string; onClick: () => void; danger?: boolean }) {
  return (
    <button onClick={onClick}
      className={`inline-flex items-center gap-1.5 rounded-full px-3 py-1.5 text-xs font-medium border transition-colors ${
        danger ? "border-destructive/40 text-destructive hover:bg-destructive/10" : "border-white/15 hover:bg-white/5"
      }`}>
      {icon} {label}
    </button>
  );
}
