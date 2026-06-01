import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useMemo, useRef, useState } from "react";
import { motion, useInView, animate } from "framer-motion";
import {
  Plus, Loader2, Tag, Layers, Crown, Clock, CalendarClock, Ban,
  Pencil, Copy, Trash2, GripVertical, Power, MousePointerClick, Package, Sparkles,
  Archive, ArchiveRestore, BarChart3, Percent,
} from "lucide-react";
import { toast } from "sonner";
import { AdminShell, logActivity } from "@/components/admin/AdminShell";
import { BadgeEditorModal } from "@/components/admin/BadgeEditorModal";
import { BadgeSettingsEditor } from "@/components/admin/BadgeSettingsEditor";
import { supabase } from "@/integrations/supabase/client";
import {
  type BadgeType,
  useBadgeCatalog,
  badgeScheduleState,
  badgeAnimationClass,
  setBadgeEnabled,
  setBadgeArchived,
  deleteBadgeType,
  duplicateBadgeType,
  reorderBadgeTypes,
} from "@/lib/use-product-badges";

/** Animated number that counts up when scrolled into view. */
function Counter({ value, suffix = "" }: { value: number; suffix?: string }) {
  const ref = useRef<HTMLSpanElement>(null);
  const inView = useInView(ref, { once: true });
  const [display, setDisplay] = useState(0);
  useEffect(() => {
    if (!inView) return;
    const controls = animate(0, value, {
      duration: 0.9,
      ease: [0.16, 1, 0.3, 1],
      onUpdate: (v) => setDisplay(v),
    });
    return () => controls.stop();
  }, [inView, value]);
  return <span ref={ref}>{Math.round(display).toLocaleString()}{suffix}</span>;
}

export const Route = createFileRoute("/admin-badges")({
  head: () => ({
    meta: [
      { title: "Badge Manager — FoundOurMarket™" },
      { name: "description", content: "Create, style, schedule, automate and analyze product badges." },
    ],
  }),
  component: BadgeManagerPage,
});

function BadgeManagerPage() {
  return (
    <AdminShell title="Badge Manager" subtitle="Create, style, schedule & analyze product badges" allow={["admin", "super_admin", "manager"]}>
      <BadgeManagerInner />
    </AdminShell>
  );
}

function badgePreviewStyle(b: BadgeType) {
  const bg = b.backgroundColor || b.color;
  const shadow = b.shadowStrength
    ? `0 ${Math.round(b.shadowStrength / 12)}px ${Math.round(b.shadowStrength / 4)}px -2px ${b.glowColor || bg}`
    : undefined;
  return {
    backgroundColor: bg,
    color: b.textColor,
    border: b.borderColor ? `1px solid ${b.borderColor}` : undefined,
    borderRadius: `${b.radius}px`,
    boxShadow: shadow,
  } as const;
}

function BadgePreview({ b }: { b: BadgeType }) {
  return (
    <span className={`inline-flex items-center gap-1 px-2 min-h-[24px] leading-none tracking-wider font-mono ${badgeAnimationClass(b.animation)}`} style={{ ...badgePreviewStyle(b), fontSize: `${b.fontSize}px`, fontWeight: b.fontWeight }}>
      {b.emoji && <span style={b.iconColor ? { color: b.iconColor } : undefined}>{b.emoji}</span>}
      {b.label}
      {b.subtitle && <span className="opacity-75 font-medium">· {b.subtitle}</span>}
    </span>
  );
}

function BadgeManagerInner() {
  const { types, map, loading } = useBadgeCatalog();
  const [editing, setEditing] = useState<BadgeType | "new" | null>(null);
  const [clicks, setClicks] = useState<Record<string, number>>({});
  const [order, setOrder] = useState<string[]>([]);
  const [dragId, setDragId] = useState<string | null>(null);
  const [categoryFilter, setCategoryFilter] = useState<string>("All");
  const [showArchived, setShowArchived] = useState(false);

  // Usage count per badge type from the assignment map.
  const usage = useMemo(() => {
    const counts: Record<string, number> = {};
    for (const [, list] of map) for (const b of list) counts[b.id] = (counts[b.id] ?? 0) + 1;
    return counts;
  }, [map]);

  const sorted = useMemo(() => [...types].sort((a, b) => b.priority - a.priority), [types]);
  useEffect(() => { setOrder(sorted.map((b) => b.id)); }, [sorted]);

  // Load click analytics.
  useEffect(() => {
    let active = true;
    const load = async () => {
      const { data } = await supabase.from("badge_events").select("badge_type_id").limit(10000);
      if (!active) return;
      const c: Record<string, number> = {};
      for (const r of (data as { badge_type_id: string }[]) ?? []) c[r.badge_type_id] = (c[r.badge_type_id] ?? 0) + 1;
      setClicks(c);
    };
    load();
    const ch = supabase.channel("admin-badge-events").on("postgres_changes", { event: "*", schema: "public", table: "badge_events" }, load).subscribe();
    return () => { active = false; supabase.removeChannel(ch); };
  }, []);

  const stats = useMemo(() => {
    const now = Date.now();
    const live = types.filter((b) => !b.archived);
    const active = live.filter((b) => badgeScheduleState(b, now) === "live").length;
    const productsUsing = map.size;
    let most: { label: string; n: number } | null = null;
    for (const b of types) {
      const n = usage[b.id] ?? 0;
      if (!most || n > most.n) most = { label: b.label, n };
    }
    let topClicked: { label: string; n: number } | null = null;
    for (const b of types) {
      const n = clicks[b.id] ?? 0;
      if (!topClicked || n > topClicked.n) topClicked = { label: b.label, n };
    }
    const totalClicks = Object.values(clicks).reduce((a, b) => a + b, 0);
    const totalAssignments = Object.values(usage).reduce((a, b) => a + b, 0);
    const ctr = totalAssignments > 0 ? Math.round((totalClicks / totalAssignments) * 100) : 0;
    const expired = live.filter((b) => badgeScheduleState(b, now) === "expired").length;
    const scheduled = live.filter((b) => badgeScheduleState(b, now) === "scheduled").length;
    const archived = types.filter((b) => b.archived).length;
    return {
      active, productsUsing,
      most: most && most.n > 0 ? most.label : "—",
      topClicked: topClicked && topClicked.n > 0 ? topClicked.label : "—",
      totalClicks, ctr,
      expired, scheduled, archived,
    };
  }, [types, map, usage, clicks]);

  const categories = useMemo(() => {
    const set = new Set<string>();
    for (const b of types) set.add(b.category || "Custom");
    return ["All", ...[...set].sort()];
  }, [types]);

  async function onDrop(targetId: string) {
    if (!dragId || dragId === targetId) { setDragId(null); return; }
    const next = [...order];
    const from = next.indexOf(dragId);
    const to = next.indexOf(targetId);
    next.splice(to, 0, next.splice(from, 1)[0]);
    setOrder(next);
    setDragId(null);
    try {
      await reorderBadgeTypes(next);
      logActivity("badge_reordered", "badge_types", "global");
      toast.success("Priority order saved");
    } catch { toast.error("Could not save order"); }
  }

  async function onToggle(b: BadgeType) {
    try { await setBadgeEnabled(b.id, !b.enabled); toast.success(b.enabled ? "Badge disabled" : "Badge enabled"); }
    catch { toast.error("Update failed"); }
  }
  async function onDuplicate(b: BadgeType) {
    try { await duplicateBadgeType(b); toast.success("Badge duplicated (disabled)"); }
    catch { toast.error("Duplicate failed"); }
  }
  async function onDelete(b: BadgeType) {
    if (!confirm(`Delete "${b.label}"? This removes it from all products.`)) return;
    try { await deleteBadgeType(b.id); logActivity("badge_deleted", "badge_types", b.id); toast.success("Badge deleted"); }
    catch { toast.error("Delete failed"); }
  }
  async function onArchive(b: BadgeType) {
    try {
      await setBadgeArchived(b.id, !b.archived);
      logActivity(b.archived ? "badge_unarchived" : "badge_archived", "badge_types", b.id);
      toast.success(b.archived ? "Badge restored" : "Badge archived");
    } catch { toast.error("Archive failed"); }
  }

  if (loading) {
    return <div className="min-h-[40vh] grid place-items-center"><Loader2 className="size-5 animate-spin text-accent" /></div>;
  }

  const ordered = order
    .map((id) => types.find((t) => t.id === id))
    .filter(Boolean)
    .filter((b) => (showArchived ? (b as BadgeType).archived : !(b as BadgeType).archived))
    .filter((b) => categoryFilter === "All" || (b as BadgeType).category === categoryFilter) as BadgeType[];

  const statCards: { icon: typeof Sparkles; label: string; value?: string; num?: number; suffix?: string; wide?: boolean }[] = [
    { icon: Sparkles, label: "Active badges", num: stats.active },
    { icon: Package, label: "Products using", num: stats.productsUsing },
    { icon: CalendarClock, label: "Scheduled", num: stats.scheduled },
    { icon: Ban, label: "Expired", num: stats.expired },
    { icon: MousePointerClick, label: "Total clicks", num: stats.totalClicks },
    { icon: Percent, label: "Avg CTR", num: stats.ctr, suffix: "%" },
    { icon: Crown, label: "Most used", value: stats.most, wide: true },
    { icon: BarChart3, label: "Most clicked", value: stats.topClicked, wide: true },
    { icon: Archive, label: "Archived", num: stats.archived },
  ];

  return (
    <div className="space-y-6 pb-28">
      {/* Stats */}
      <div className="-mx-1 overflow-x-auto no-scrollbar">
        <div className="flex gap-3 px-1 min-w-max">
          {statCards.map((k, i) => (
            <motion.div
              key={k.label}
              initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }}
              transition={{ delay: i * 0.03, ease: [0.16, 1, 0.3, 1] }}
              className={`relative overflow-hidden glass border border-white/10 rounded-2xl p-3.5 ${k.wide ? "min-w-[180px]" : "min-w-[130px]"}`}
            >
              <div className="pointer-events-none absolute -top-6 -right-5 size-16 rounded-full opacity-30" style={{ background: "var(--gradient-ember-soft)", filter: "blur(16px)" }} />
              <k.icon className="size-4 text-accent mb-2" />
              <p className="text-lg font-display tabular-nums leading-none truncate">
                {k.num != null ? <Counter value={k.num} suffix={k.suffix} /> : k.value}
              </p>
              <p className="text-[9px] font-mono uppercase tracking-[0.18em] text-muted-foreground/80 mt-2">{k.label}</p>
            </motion.div>
          ))}
        </div>
      </div>

      {/* Header + create */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="text-sm font-medium flex items-center gap-2"><Layers className="size-4 text-muted-foreground" /> Badge catalog</h2>
          <p className="text-xs text-muted-foreground mt-1">Drag to reorder priority. Higher priority shows first on product cards.</p>
        </div>
        <button onClick={() => setEditing("new")} className="inline-flex items-center gap-2 bg-accent text-accent-foreground px-4 py-2.5 rounded-full text-xs uppercase tracking-widest font-bold">
          <Plus className="size-3.5" /> New badge
        </button>
      </div>

      {/* Category filters + archived toggle */}
      <div className="flex flex-wrap items-center gap-2">
        {categories.map((c) => (
          <button
            key={c}
            onClick={() => setCategoryFilter(c)}
            className={`px-3 py-1.5 rounded-full text-[11px] font-mono uppercase tracking-wider border transition-colors ${categoryFilter === c ? "bg-accent text-accent-foreground border-accent" : "border-white/10 text-muted-foreground hover:bg-white/5"}`}
          >
            {c}
          </button>
        ))}
        <button
          onClick={() => setShowArchived((v) => !v)}
          className={`ml-auto inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full text-[11px] font-mono uppercase tracking-wider border transition-colors ${showArchived ? "bg-white/10 text-foreground border-white/20" : "border-white/10 text-muted-foreground hover:bg-white/5"}`}
        >
          <Archive className="size-3" /> {showArchived ? "Archived" : "Active"}
        </button>
      </div>


      {/* Catalog grid */}
      <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-4">
        {ordered.map((b) => {
          const state = badgeScheduleState(b);
          const used = usage[b.id] ?? 0;
          const clk = clicks[b.id] ?? 0;
          const cardCtr = used > 0 ? Math.round((clk / used) * 100) : 0;
          return (
            <div
              key={b.id}
              draggable
              onDragStart={() => setDragId(b.id)}
              onDragOver={(e) => e.preventDefault()}
              onDrop={() => onDrop(b.id)}
              className={`card-premium rounded-2xl p-4 border flex flex-col transition-all ${dragId === b.id ? "opacity-50" : "border-white/10"}`}
            >
              <div className="flex items-start justify-between gap-2 mb-3">
                <div className="flex items-center gap-1.5 min-w-0">
                  <GripVertical className="size-4 text-muted-foreground/50 cursor-grab shrink-0" />
                  <BadgePreview b={b} />
                </div>
                <div className="flex flex-col items-end gap-1.5 shrink-0">
                  <StatusPill state={state} onClick={() => onToggle(b)} />
                  <span className="text-[9px] font-mono uppercase tracking-wider px-2 py-0.5 rounded-full border border-white/10 text-muted-foreground bg-white/5">
                    {b.category}
                  </span>
                </div>
              </div>

              {b.description && <p className="text-xs text-muted-foreground mb-3 line-clamp-2">{b.description}</p>}

              <div className="grid grid-cols-4 gap-2 mb-3 text-center">
                <div className="rounded-xl bg-white/5 py-2">
                  <p className="text-sm font-display tabular-nums flex items-center justify-center gap-1"><Package className="size-3" />{used}</p>
                  <p className="text-[8px] font-mono uppercase tracking-wider text-muted-foreground">Products</p>
                </div>
                <div className="rounded-xl bg-white/5 py-2">
                  <p className="text-sm font-display tabular-nums flex items-center justify-center gap-1"><MousePointerClick className="size-3" />{clk}</p>
                  <p className="text-[8px] font-mono uppercase tracking-wider text-muted-foreground">Clicks</p>
                </div>
                <div className="rounded-xl bg-white/5 py-2">
                  <p className="text-sm font-display tabular-nums flex items-center justify-center gap-1"><Percent className="size-3" />{cardCtr}</p>
                  <p className="text-[8px] font-mono uppercase tracking-wider text-muted-foreground">CTR</p>
                </div>
                <div className="rounded-xl bg-white/5 py-2">
                  <p className="text-sm font-display tabular-nums">{b.priority}</p>
                  <p className="text-[8px] font-mono uppercase tracking-wider text-muted-foreground">Priority</p>
                </div>
              </div>

              {(b.startAt || b.endAt) && (
                <p className="text-[10px] text-muted-foreground mb-3 flex items-center gap-1.5">
                  <Clock className="size-3" />
                  {b.startAt ? new Date(b.startAt).toLocaleDateString() : "always"} → {b.endAt ? new Date(b.endAt).toLocaleDateString() : "∞"}
                </p>
              )}
              {b.autoRule?.enabled && (
                <p className="text-[10px] text-accent/90 mb-3 font-mono">auto: {b.autoRule.metric} {b.autoRule.op} {b.autoRule.value}</p>
              )}

              <div className="flex items-center gap-1.5 mt-auto pt-1">
                <button onClick={() => setEditing(b)} className="flex-1 inline-flex items-center justify-center gap-1 px-2 py-2 rounded-lg text-[11px] font-bold border border-border hover:bg-white/5"><Pencil className="size-3" /> Edit</button>
                <button onClick={() => setEditing(b)} title="Schedule" className="size-9 grid place-items-center rounded-lg border border-border hover:bg-white/5"><CalendarClock className="size-3.5" /></button>
                <button onClick={() => onDuplicate(b)} title="Duplicate" className="size-9 grid place-items-center rounded-lg border border-border hover:bg-white/5"><Copy className="size-3.5" /></button>
                <button onClick={() => onArchive(b)} title={b.archived ? "Restore" : "Archive"} className="size-9 grid place-items-center rounded-lg border border-border hover:bg-white/5">{b.archived ? <ArchiveRestore className="size-3.5 text-emerald-400" /> : <Archive className="size-3.5" />}</button>
                <button onClick={() => onDelete(b)} title="Delete" className="size-9 grid place-items-center rounded-lg border border-border hover:bg-white/5 text-destructive"><Trash2 className="size-3.5" /></button>
              </div>
            </div>
          );
        })}
        {ordered.length === 0 && (
          <div className="col-span-full text-center py-16">
            <Tag className="size-8 mx-auto text-muted-foreground/40 mb-3" />
            <p className="text-sm text-muted-foreground">{showArchived ? "No archived badges." : "No badges in this view. Create your first badge."}</p>
          </div>
        )}
      </div>

      {/* Automatic badge rules (existing rule engine) */}
      <div className="pt-4 border-t border-white/10">
        <BadgeSettingsEditor />
      </div>

      {editing && <BadgeEditorModal badge={editing} onClose={() => setEditing(null)} />}
    </div>
  );
}
