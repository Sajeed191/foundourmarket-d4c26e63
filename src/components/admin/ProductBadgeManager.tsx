import { useMemo, useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { toast } from "sonner";
import {
  Loader2, X, Plus, Search, GripVertical, CalendarClock, StickyNote,
  Eye, Tag, Check,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { BadgeEditorModal } from "@/components/admin/BadgeEditorModal";
import {
  type BadgeType,
  type RenderBadge,
  useBadgeCatalog,
  assignBadge,
  unassignBadge,
  reorderProductBadges,
  updateAssignment,
} from "@/lib/use-product-badges";
import { ProductBadge } from "@/components/ui/ProductBadge";

/* --------------------------------------------------------------------------
 * ProductBadgeManager
 * Reusable, premium badge assignment surface used by the product editor,
 * quick-edit sheet and product list. Two modes:
 *   - live    : `slug` given → every action writes to Supabase immediately.
 *   - pending : new (unsaved) product → controlled `selectedIds` + `onChange`;
 *               assignments are flushed by the parent after the product saves.
 *
 * Badge design v1.1 rule: the storefront preview + assigned chips reuse the
 * single canonical `<ProductBadge>` component. There is no separate admin
 * badge design — pixel-identical to the customer-facing card badge.
 * ------------------------------------------------------------------------ */

/**
 * Storefront-identical badge chip. Uses the shared ProductBadge so admins
 * see EXACTLY what customers see. When `onRemove` is provided the chip is
 * wrapped with a small remove affordance beside it.
 */
function BadgeChip({ b, onRemove, busy }: { b: BadgeType; onRemove?: () => void; busy?: boolean }) {
  const pill = <ProductBadge label={b.label} />;
  if (!onRemove) return pill;
  return (
    <span className="inline-flex items-center gap-1">
      {pill}
      <button
        type="button"
        onClick={onRemove}
        disabled={busy}
        aria-label={`Remove ${b.label}`}
        className="grid place-items-center size-5 rounded-full border border-white/10 text-muted-foreground hover:text-destructive hover:border-destructive/30 hover:bg-destructive/10 disabled:opacity-40"
      >
        {busy ? <Loader2 className="size-3 animate-spin" /> : <X className="size-3" />}
      </button>
    </span>
  );
}


/** Datetime helpers for the schedule editor (HTML datetime-local ⇄ ISO). */
function isoToLocal(iso: string | null | undefined) {
  if (!iso) return "";
  return new Date(new Date(iso).getTime() - new Date().getTimezoneOffset() * 60000).toISOString().slice(0, 16);
}
function localToIso(local: string) {
  return local ? new Date(local).toISOString() : null;
}

export function ProductBadgeManager({
  slug,
  selectedIds,
  onChange,
}: {
  /** Live mode: persist immediately for this product slug. */
  slug?: string;
  /** Pending mode: ordered badge type ids for a not-yet-saved product. */
  selectedIds?: string[];
  onChange?: (ids: string[]) => void;
}) {
  const { types, map, loading } = useBadgeCatalog();
  const live = Boolean(slug);

  const [query, setQuery] = useState("");
  const [busy, setBusy] = useState<string | null>(null);
  const [creating, setCreating] = useState(false);
  const [dragId, setDragId] = useState<string | null>(null);
  const [scheduleFor, setScheduleFor] = useState<string | null>(null);

  // Assigned list (RenderBadge in live mode; reconstruct from selectedIds otherwise).
  const assigned: RenderBadge[] = useMemo(() => {
    if (live) return map.get(slug!) ?? [];
    const byId = new Map(types.map((t) => [t.id, t]));
    return (selectedIds ?? [])
      .map((id, i) => {
        const t = byId.get(id);
        return t ? ({ ...t, sortOrder: i } as RenderBadge) : null;
      })
      .filter(Boolean) as RenderBadge[];
  }, [live, slug, map, types, selectedIds]);

  const assignedIds = useMemo(() => new Set(assigned.map((b) => b.id)), [assigned]);

  const available = useMemo(() => {
    const q = query.trim().toLowerCase();
    return types
      .filter((t) => t.enabled && !t.isDiscount && !t.archived)
      .filter((t) => !q || t.label.toLowerCase().includes(q) || t.category.toLowerCase().includes(q));
  }, [types, query]);

  async function add(id: string) {
    if (assignedIds.has(id)) return;
    if (!live) { onChange?.([...(selectedIds ?? []), id]); return; }
    setBusy(id);
    try { await assignBadge(slug!, id); } catch (e) { toast.error(e instanceof Error ? e.message : "Assign failed"); }
    finally { setBusy(null); }
  }

  async function remove(id: string) {
    if (!live) { onChange?.((selectedIds ?? []).filter((x) => x !== id)); return; }
    setBusy(id);
    try { await unassignBadge(slug!, id); } catch (e) { toast.error(e instanceof Error ? e.message : "Remove failed"); }
    finally { setBusy(null); }
  }

  async function commitOrder(orderedIds: string[]) {
    if (!live) { onChange?.(orderedIds); return; }
    try { await reorderProductBadges(slug!, orderedIds); } catch (e) { toast.error(e instanceof Error ? e.message : "Reorder failed"); }
  }

  function onDrop(targetId: string) {
    if (!dragId || dragId === targetId) { setDragId(null); return; }
    const ids = assigned.map((b) => b.id);
    const from = ids.indexOf(dragId);
    const to = ids.indexOf(targetId);
    if (from === -1 || to === -1) { setDragId(null); return; }
    ids.splice(to, 0, ids.splice(from, 1)[0]);
    setDragId(null);
    void commitOrder(ids);
  }

  if (loading) {
    return <div className="grid place-items-center py-6"><Loader2 className="size-4 animate-spin text-accent" /></div>;
  }

  return (
    <div className="space-y-3">
      {/* Live storefront preview */}
      <div className="rounded-xl border border-white/10 bg-background/60 p-3">
        <p className="flex items-center gap-1.5 text-[9px] font-mono uppercase tracking-widest text-muted-foreground mb-2">
          <Eye className="size-3" /> Storefront preview · max 3 shown
        </p>
        {assigned.length === 0 ? (
          <p className="text-[11px] text-muted-foreground">No badges assigned yet.</p>
        ) : (
          <div className="flex flex-wrap items-center gap-1.5">
            {assigned.slice(0, 3).map((b) => <BadgeChip key={b.id} b={b} />)}
            {assigned.length > 3 && (
              <span className="inline-flex items-center rounded-md bg-white/10 px-1.5 min-h-[24px] text-[10px] font-mono font-bold text-muted-foreground">
                +{assigned.length - 3}
              </span>
            )}
          </div>
        )}
      </div>

      {/* Assigned badges — draggable to reorder priority */}
      {assigned.length > 0 && (
        <div className="space-y-1.5">
          <p className="text-[9px] font-mono uppercase tracking-widest text-muted-foreground">Assigned · drag to reorder priority</p>
          <AnimatePresence initial={false}>
            {assigned.map((b) => (
              <motion.div
                key={b.id}
                layout
                initial={{ opacity: 0, y: 6 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, x: -8 }}
                draggable
                onDragStart={() => setDragId(b.id)}
                onDragOver={(e) => e.preventDefault()}
                onDrop={() => onDrop(b.id)}
                className={cn(
                  "flex items-center gap-2 rounded-xl border bg-white/[0.03] px-2 py-1.5 transition-colors",
                  dragId === b.id ? "border-accent/50 opacity-60" : "border-white/10",
                )}
              >
                <GripVertical className="size-4 text-muted-foreground/50 cursor-grab shrink-0" />
                <BadgeChip b={b} />
                {(b.assignStartAt || b.assignEndAt) && (
                  <span className="text-[9px] font-mono text-sky-300/80 truncate">
                    {b.assignStartAt ? new Date(b.assignStartAt).toLocaleDateString() : "now"} → {b.assignEndAt ? new Date(b.assignEndAt).toLocaleDateString() : "∞"}
                  </span>
                )}
                <div className="ml-auto flex items-center gap-1 shrink-0">
                  {live && (
                    <button
                      type="button"
                      title="Schedule / notes"
                      onClick={() => setScheduleFor(scheduleFor === b.id ? null : b.id)}
                      className={cn("size-7 grid place-items-center rounded-lg border", scheduleFor === b.id ? "border-accent/50 text-accent bg-accent/10" : "border-white/10 text-muted-foreground hover:bg-white/5")}
                    >
                      <CalendarClock className="size-3.5" />
                    </button>
                  )}
                  <button
                    type="button"
                    title="Remove"
                    onClick={() => remove(b.id)}
                    disabled={busy === b.id}
                    className="size-7 grid place-items-center rounded-lg border border-white/10 text-muted-foreground hover:text-destructive hover:border-destructive/30 hover:bg-destructive/10 disabled:opacity-40"
                  >
                    {busy === b.id ? <Loader2 className="size-3.5 animate-spin" /> : <X className="size-3.5" />}
                  </button>
                </div>
              </motion.div>
            ))}
          </AnimatePresence>

          {/* Inline schedule + notes editor (live mode only) */}
          {live && scheduleFor && (
            <ScheduleEditor
              key={scheduleFor}
              slug={slug!}
              badge={assigned.find((b) => b.id === scheduleFor)!}
              onClose={() => setScheduleFor(null)}
            />
          )}
        </div>
      )}

      {/* Search + create */}
      <div className="flex items-center gap-2">
        <div className="relative flex-1">
          <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 size-3.5 text-muted-foreground" />
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search badges…"
            className="w-full h-9 rounded-lg border border-white/10 bg-white/[0.03] pl-8 pr-2.5 text-[12px] focus:outline-none focus:border-accent/40"
          />
        </div>
        <button
          type="button"
          onClick={() => setCreating(true)}
          className="shrink-0 inline-flex items-center gap-1 rounded-lg bg-accent text-accent-foreground px-3 h-9 text-[11px] font-bold uppercase tracking-widest hover:brightness-110"
        >
          <Plus className="size-3.5" /> New
        </button>
      </div>

      {/* Available badge palette */}
      <div className="flex flex-wrap gap-1.5">
        {available.map((t) => {
          const active = assignedIds.has(t.id);
          return (
            <button
              key={t.id}
              type="button"
              disabled={busy === t.id || active}
              onClick={() => add(t.id)}
              title={active ? "Already assigned" : `Assign ${t.label}`}
              className={cn(
                "inline-flex items-center gap-1 rounded-lg border px-2 py-1.5 text-[11px] font-medium transition-all disabled:cursor-default",
                active ? "border-emerald-500/40 bg-emerald-500/10 text-emerald-300" : "border-white/10 bg-card text-muted-foreground hover:text-foreground hover:border-accent/40",
              )}
            >
              {busy === t.id ? <Loader2 className="size-3 animate-spin" /> : active ? <Check className="size-3" /> : t.emoji ? <span aria-hidden>{t.emoji}</span> : <Tag className="size-3" />}
              {t.label}
            </button>
          );
        })}
        {available.length === 0 && (
          <p className="text-[11px] text-muted-foreground">{query ? `No badges match “${query}”.` : "No badge types yet — create one."}</p>
        )}
      </div>

      {creating && (
        <BadgeEditorModal
          badge="new"
          onClose={() => setCreating(false)}
        />
      )}
    </div>
  );
}

/** Per-assignment schedule + admin notes editor (live mode). */
function ScheduleEditor({ slug, badge, onClose }: { slug: string; badge: RenderBadge; onClose: () => void }) {
  const [start, setStart] = useState(isoToLocal(badge.assignStartAt));
  const [end, setEnd] = useState(isoToLocal(badge.assignEndAt));
  const [notes, setNotes] = useState(badge.assignNotes ?? "");
  const [saving, setSaving] = useState(false);

  async function save() {
    setSaving(true);
    try {
      await updateAssignment(slug, badge.id, {
        start_at: localToIso(start),
        end_at: localToIso(end),
        notes,
      });
      toast.success("Schedule updated");
      onClose();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Update failed");
    } finally {
      setSaving(false);
    }
  }

  return (
    <motion.div
      initial={{ opacity: 0, height: 0 }}
      animate={{ opacity: 1, height: "auto" }}
      exit={{ opacity: 0, height: 0 }}
      className="rounded-xl border border-accent/30 bg-accent/[0.04] p-3 space-y-2.5"
    >
      <p className="flex items-center gap-1.5 text-[9px] font-mono uppercase tracking-widest text-accent">
        <CalendarClock className="size-3" /> Schedule · {badge.label}
      </p>
      <div className="grid grid-cols-2 gap-2">
        <label className="space-y-1">
          <span className="block text-[9px] font-mono uppercase tracking-widest text-muted-foreground">Activate</span>
          <input type="datetime-local" value={start} onChange={(e) => setStart(e.target.value)}
            className="w-full h-8 rounded-lg border border-white/10 bg-white/[0.03] px-2 text-[11px] focus:outline-none focus:border-accent/40" />
        </label>
        <label className="space-y-1">
          <span className="block text-[9px] font-mono uppercase tracking-widest text-muted-foreground">Expire</span>
          <input type="datetime-local" value={end} onChange={(e) => setEnd(e.target.value)}
            className="w-full h-8 rounded-lg border border-white/10 bg-white/[0.03] px-2 text-[11px] focus:outline-none focus:border-accent/40" />
        </label>
      </div>
      <label className="space-y-1 block">
        <span className="flex items-center gap-1 text-[9px] font-mono uppercase tracking-widest text-muted-foreground"><StickyNote className="size-3" /> Admin notes</span>
        <textarea value={notes} onChange={(e) => setNotes(e.target.value)} rows={2}
          placeholder="Internal note (not shown to customers)…"
          className="w-full rounded-lg border border-white/10 bg-white/[0.03] px-2 py-1.5 text-[11px] focus:outline-none focus:border-accent/40" />
      </label>
      <div className="flex items-center gap-2">
        <button type="button" onClick={onClose} className="flex-1 h-8 rounded-lg border border-white/10 text-[11px] font-medium hover:bg-white/5">Cancel</button>
        <button type="button" onClick={save} disabled={saving}
          className="flex-1 h-8 rounded-lg bg-accent text-accent-foreground text-[11px] font-bold hover:brightness-110 disabled:opacity-60 inline-flex items-center justify-center gap-1">
          {saving && <Loader2 className="size-3 animate-spin" />} Save
        </button>
      </div>
    </motion.div>
  );
}
