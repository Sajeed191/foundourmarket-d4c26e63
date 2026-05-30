import { createFileRoute, Link } from "@tanstack/react-router";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  Loader2, Search, CheckCheck, Check, Trash2, Archive, ArchiveRestore,
  Inbox, Sliders, X, RotateCw, Mail, ArrowRight, Dot,
} from "lucide-react";
import { AnimatePresence, motion } from "framer-motion";
import { AdminShell } from "@/components/admin/AdminShell";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/lib/auth";
import { timeAgo } from "@/lib/notification-meta";
import {
  type AdminNotification, type Priority, type OpsCategory, type PrefMode,
  PRIORITY_META, PRIORITY_ORDER, priorityOf, sortByPriority,
  OPS_META, OPS_ORDER, opsCategoryOf, actionFor,
  PREF_MODES, passesPref,
} from "@/lib/admin-notifications";

export const Route = createFileRoute("/admin-notifications")({
  head: () => ({ meta: [{ title: "Operations Center — Admin" }] }),
  component: NotificationsCenter,
});

const PAGE = 80;
type View = "inbox" | "unread" | "archived";

function NotificationsCenter() {
  const { user } = useAuth();
  const [items, setItems] = useState<AdminNotification[] | null>(null);
  const [hasMore, setHasMore] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [view, setView] = useState<View>("inbox");
  const [cat, setCat] = useState<OpsCategory | "all">("all");
  const [prio, setPrio] = useState<Priority | "all">("all");
  const [q, setQ] = useState("");
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [showPrefs, setShowPrefs] = useState(false);

  // preferences
  const [mode, setMode] = useState<PrefMode>("all");
  const [emailCritical, setEmailCritical] = useState(true);
  const [savingPref, setSavingPref] = useState(false);

  const oldest = useRef<string | null>(null);

  const load = useCallback(async (reset: boolean) => {
    if (!user) return;
    let query = supabase
      .from("notifications")
      .select("*")
      .eq("user_id", user.id)
      .order("created_at", { ascending: false })
      .limit(PAGE);
    if (!reset && oldest.current) query = query.lt("created_at", oldest.current);
    const { data } = await query;
    const rows = (data ?? []) as unknown as AdminNotification[];
    if (rows.length) oldest.current = rows[rows.length - 1].created_at;
    setHasMore(rows.length === PAGE);
    setItems((prev) => (reset || !prev ? rows : [...prev, ...rows]));
  }, [user]);

  useEffect(() => { oldest.current = null; load(true); }, [load]);

  // load prefs
  useEffect(() => {
    if (!user) return;
    supabase.from("admin_notification_prefs").select("mode,email_critical").eq("user_id", user.id).maybeSingle()
      .then(({ data }) => {
        if (data) { setMode((data.mode as PrefMode) ?? "all"); setEmailCritical(data.email_critical ?? true); }
      });
  }, [user]);

  // realtime
  useEffect(() => {
    if (!user) return;
    const ch = supabase.channel(`admin-notif:${user.id}`)
      .on("postgres_changes",
        { event: "INSERT", schema: "public", table: "notifications", filter: `user_id=eq.${user.id}` },
        (p) => setItems((prev) => {
          const n = p.new as unknown as AdminNotification;
          if (prev?.some((x) => x.id === n.id)) return prev;
          return [n, ...(prev ?? [])];
        }))
      .on("postgres_changes",
        { event: "UPDATE", schema: "public", table: "notifications", filter: `user_id=eq.${user.id}` },
        (p) => setItems((prev) => prev?.map((x) => x.id === (p.new as { id: string }).id ? (p.new as unknown as AdminNotification) : x) ?? prev))
      .on("postgres_changes",
        { event: "DELETE", schema: "public", table: "notifications", filter: `user_id=eq.${user.id}` },
        (p) => setItems((prev) => prev?.filter((x) => x.id !== (p.old as { id: string }).id) ?? prev))
      .subscribe();
    return () => { supabase.removeChannel(ch); };
  }, [user]);

  /* ── derived ── */
  const filtered = useMemo(() => {
    if (!items) return [];
    const term = q.trim().toLowerCase();
    return items
      .filter((n) => view === "archived" ? !!n.archived_at : !n.archived_at)
      .filter((n) => view !== "unread" || !n.read_at)
      .filter((n) => cat === "all" || opsCategoryOf(n) === cat)
      .filter((n) => prio === "all" || priorityOf(n) === prio)
      .filter((n) => passesPref(n, mode))
      .filter((n) => !term || `${n.title} ${n.body ?? ""} ${n.type}`.toLowerCase().includes(term))
      .sort(sortByPriority);
  }, [items, view, cat, prio, q, mode]);

  const counts = useMemo(() => {
    const live = (items ?? []).filter((n) => !n.archived_at);
    return {
      unread: live.filter((n) => !n.read_at).length,
      critical: live.filter((n) => priorityOf(n) === "critical" && !n.read_at).length,
      total: live.length,
    };
  }, [items]);

  /* ── mutations (optimistic) ── */
  const patch = (ids: string[], fields: Partial<AdminNotification>) =>
    setItems((prev) => prev?.map((n) => ids.includes(n.id) ? { ...n, ...fields } : n) ?? prev);

  const markRead = async (ids: string[], read: boolean) => {
    const at = read ? new Date().toISOString() : null;
    patch(ids, { read_at: at });
    await supabase.from("notifications").update({ read_at: at }).in("id", ids);
  };
  const archive = async (ids: string[], archived: boolean) => {
    const at = archived ? new Date().toISOString() : null;
    patch(ids, { archived_at: at });
    await supabase.from("notifications").update({ archived_at: at }).in("id", ids);
  };
  const remove = async (ids: string[]) => {
    setItems((prev) => prev?.filter((n) => !ids.includes(n.id)) ?? prev);
    await supabase.from("notifications").delete().in("id", ids);
  };
  const markAllRead = async () => {
    if (!user) return;
    const at = new Date().toISOString();
    patch((items ?? []).filter((n) => !n.read_at).map((n) => n.id), { read_at: at });
    await supabase.from("notifications").update({ read_at: at }).eq("user_id", user.id).is("read_at", null);
  };
  const clearRead = async () => {
    const ids = filtered.filter((n) => n.read_at).map((n) => n.id);
    if (ids.length) await remove(ids);
  };

  const savePrefs = async (next: { mode?: PrefMode; email_critical?: boolean }) => {
    if (!user) return;
    setSavingPref(true);
    if (next.mode !== undefined) setMode(next.mode);
    if (next.email_critical !== undefined) setEmailCritical(next.email_critical);
    await supabase.from("admin_notification_prefs").upsert({
      user_id: user.id,
      mode: next.mode ?? mode,
      email_critical: next.email_critical ?? emailCritical,
    }, { onConflict: "user_id" });
    setSavingPref(false);
  };

  /* ── selection ── */
  const toggleSel = (id: string) => setSelected((s) => {
    const n = new Set(s); n.has(id) ? n.delete(id) : n.add(id); return n;
  });
  const selectAll = () => setSelected(new Set(filtered.map((n) => n.id)));
  const clearSel = () => setSelected(new Set());
  const selIds = [...selected].filter((id) => filtered.some((n) => n.id === id));

  const loadMore = async () => { setLoadingMore(true); await load(false); setLoadingMore(false); };

  return (
    <AdminShell
      title="Operations Center"
      subtitle="Realtime command center — every event that needs your attention"
      actions={
        <div className="flex items-center gap-2">
          <span className="inline-flex items-center gap-1.5 text-[10px] font-mono uppercase tracking-widest text-accent">
            <span className="size-1.5 rounded-full bg-accent animate-pulse" /> Live
          </span>
          <button onClick={() => setShowPrefs(true)}
            className="inline-flex items-center gap-1.5 rounded-full border border-border bg-white/5 px-3 py-1.5 text-xs hover:border-accent/50 transition-colors">
            <Sliders className="size-3.5" /> Preferences
          </button>
        </div>
      }
    >
      {/* Stat strip */}
      <div className="grid grid-cols-3 gap-2.5 mb-4">
        <Stat label="Unread" value={counts.unread} tone="text-accent" />
        <Stat label="Critical" value={counts.critical} tone="text-rose-400" pulse={counts.critical > 0} />
        <Stat label="Active" value={counts.total} tone="text-foreground" />
      </div>

      {/* Controls */}
      <div className="card-premium rounded-2xl p-3 mb-3 space-y-3">
        <div className="flex items-center gap-2">
          <div className="relative flex-1">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 size-3.5 text-muted-foreground" />
            <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search notifications…"
              className="w-full rounded-xl border border-border bg-background/60 pl-9 pr-3 py-2 text-sm outline-none focus:border-accent/50" />
          </div>
          <button onClick={() => { oldest.current = null; load(true); }} title="Refresh"
            className="size-9 shrink-0 grid place-items-center rounded-xl border border-border bg-white/5 hover:border-accent/50 transition-colors">
            <RotateCw className="size-4" />
          </button>
        </div>

        {/* View tabs */}
        <div className="flex items-center gap-1.5">
          {(["inbox", "unread", "archived"] as View[]).map((v) => (
            <button key={v} onClick={() => { setView(v); clearSel(); }}
              className={`inline-flex items-center gap-1.5 rounded-full border px-3 py-1.5 text-xs font-medium capitalize transition-all ${
                view === v ? "border-accent/50 bg-accent/15 text-accent" : "border-border/60 text-muted-foreground hover:text-foreground"
              }`}>
              {v === "inbox" ? <Inbox className="size-3.5" /> : v === "unread" ? <Dot className="size-4" /> : <Archive className="size-3.5" />}
              {v}
            </button>
          ))}
          <div className="ml-auto flex items-center gap-1.5">
            {counts.unread > 0 && (
              <button onClick={markAllRead} className="text-[11px] font-mono uppercase tracking-wider text-muted-foreground hover:text-accent inline-flex items-center gap-1">
                <CheckCheck className="size-3.5" /> All read
              </button>
            )}
            <button onClick={clearRead} className="text-[11px] font-mono uppercase tracking-wider text-muted-foreground hover:text-rose-400 inline-flex items-center gap-1">
              <Trash2 className="size-3" /> Clear read
            </button>
          </div>
        </div>

        {/* Category + priority chips */}
        <div className="flex flex-wrap items-center gap-1.5">
          <Chip active={cat === "all"} onClick={() => setCat("all")}>All</Chip>
          {OPS_ORDER.map((c) => {
            const M = OPS_META[c];
            return <Chip key={c} active={cat === c} onClick={() => setCat(c)}><M.Icon className={`size-3 ${M.tone}`} />{M.label}</Chip>;
          })}
          <span className="mx-1 h-4 w-px bg-border" />
          <Chip active={prio === "all"} onClick={() => setPrio("all")}>Any priority</Chip>
          {PRIORITY_ORDER.map((p) => (
            <Chip key={p} active={prio === p} onClick={() => setPrio(p)}>
              <span className={`size-1.5 rounded-full ${PRIORITY_META[p].dot}`} />{PRIORITY_META[p].label}
            </Chip>
          ))}
        </div>
      </div>

      {/* Bulk bar */}
      <AnimatePresence>
        {selIds.length > 0 && (
          <motion.div initial={{ opacity: 0, y: -8 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -8 }}
            className="sticky top-2 z-20 mb-3 flex items-center gap-2 rounded-2xl border border-accent/40 bg-popover/90 backdrop-blur-xl px-3 py-2 shadow-lg">
            <span className="text-xs font-mono text-accent">{selIds.length} selected</span>
            <div className="ml-auto flex items-center gap-1.5">
              <BulkBtn onClick={() => { markRead(selIds, true); clearSel(); }}><Check className="size-3.5" /> Read</BulkBtn>
              <BulkBtn onClick={() => { markRead(selIds, false); clearSel(); }}>Unread</BulkBtn>
              <BulkBtn onClick={() => { archive(selIds, view !== "archived"); clearSel(); }}>
                {view === "archived" ? <ArchiveRestore className="size-3.5" /> : <Archive className="size-3.5" />}
                {view === "archived" ? "Restore" : "Archive"}
              </BulkBtn>
              <BulkBtn danger onClick={() => { remove(selIds); clearSel(); }}><Trash2 className="size-3.5" /> Delete</BulkBtn>
              <button onClick={clearSel} className="size-7 grid place-items-center rounded-full hover:bg-white/5"><X className="size-3.5" /></button>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {filtered.length > 0 && (
        <div className="flex items-center justify-between px-1 mb-2">
          <button onClick={selIds.length === filtered.length ? clearSel : selectAll}
            className="text-[11px] font-mono uppercase tracking-wider text-muted-foreground hover:text-accent">
            {selIds.length === filtered.length ? "Deselect all" : "Select all"}
          </button>
          <span className="text-[11px] font-mono text-muted-foreground">{filtered.length} shown</span>
        </div>
      )}

      {/* List */}
      {items === null ? (
        <div className="grid place-items-center py-20"><Loader2 className="size-5 animate-spin text-accent" /></div>
      ) : filtered.length === 0 ? (
        <div className="card-premium rounded-2xl py-16 text-center">
          <Inbox className="size-8 mx-auto mb-3 text-muted-foreground" />
          <p className="text-sm font-display font-semibold">Nothing here</p>
          <p className="text-xs text-muted-foreground mt-1">No notifications match your filters.</p>
        </div>
      ) : (
        <ul className="space-y-2">
          {filtered.map((n) => (
            <Row key={n.id} n={n} selected={selected.has(n.id)} onToggle={() => toggleSel(n.id)}
              onRead={(r) => markRead([n.id], r)} onArchive={(a) => archive([n.id], a)} onRemove={() => remove([n.id])}
              archivedView={view === "archived"} />
          ))}
        </ul>
      )}

      {view !== "archived" && hasMore && items && items.length > 0 && (
        <div className="grid place-items-center py-5">
          <button onClick={loadMore} disabled={loadingMore}
            className="inline-flex items-center gap-2 rounded-full border border-border bg-white/5 px-4 py-2 text-xs hover:border-accent/50 transition-colors disabled:opacity-50">
            {loadingMore ? <Loader2 className="size-3.5 animate-spin" /> : <ArrowRight className="size-3.5" />} Load more
          </button>
        </div>
      )}

      {/* Preferences drawer */}
      <AnimatePresence>
        {showPrefs && (
          <PrefsDrawer
            mode={mode} emailCritical={emailCritical} saving={savingPref}
            onMode={(m) => savePrefs({ mode: m })}
            onEmail={(v) => savePrefs({ email_critical: v })}
            onClose={() => setShowPrefs(false)}
          />
        )}
      </AnimatePresence>
    </AdminShell>
  );
}

/* ───────────────────────── Row ───────────────────────── */

function Row({ n, selected, onToggle, onRead, onArchive, onRemove, archivedView }: {
  n: AdminNotification; selected: boolean; onToggle: () => void;
  onRead: (r: boolean) => void; onArchive: (a: boolean) => void; onRemove: () => void; archivedView: boolean;
}) {
  const p = priorityOf(n);
  const PM = PRIORITY_META[p];
  const cat = opsCategoryOf(n);
  const CM = OPS_META[cat];
  const action = actionFor(n);
  const unread = !n.read_at;

  return (
    <motion.li layout initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
      className={`relative overflow-hidden rounded-2xl border bg-card/60 backdrop-blur-sm transition-colors ${
        selected ? "border-accent/60" : unread ? PM.ring : "border-border/50"
      }`}>
      <span className={`absolute left-0 top-0 bottom-0 w-1 ${PM.bar}`} />
      <div className="flex items-start gap-3 p-3.5 pl-4">
        <button onClick={onToggle} aria-label="Select"
          className={`mt-0.5 size-4 shrink-0 rounded-[5px] border grid place-items-center transition-colors ${
            selected ? "bg-accent border-accent text-accent-foreground" : "border-border hover:border-accent/50"
          }`}>
          {selected && <Check className="size-3" />}
        </button>

        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <span className={`inline-flex items-center gap-1 rounded-full border px-1.5 py-0.5 text-[9px] font-mono uppercase tracking-wider ${PM.tone}`}>
              <PM.Icon className="size-2.5" /> {PM.label}
            </span>
            <span className="inline-flex items-center gap-1 text-[10px] text-muted-foreground">
              <CM.Icon className={`size-3 ${CM.tone}`} /> {CM.label}
            </span>
            {unread && <span className="size-1.5 rounded-full bg-accent" />}
            <span className="ml-auto text-[10px] font-mono text-muted-foreground">{timeAgo(n.created_at)}</span>
          </div>
          <p className={`mt-1.5 text-sm leading-snug ${unread ? "font-semibold" : "text-foreground/90"}`}>{n.title}</p>
          {n.body && <p className="mt-0.5 text-xs text-muted-foreground leading-relaxed line-clamp-2">{n.body}</p>}

          <div className="mt-2.5 flex items-center gap-1.5 flex-wrap">
            {action && (
              <Link to={action.to} className="inline-flex items-center gap-1 rounded-full bg-accent/15 border border-accent/30 px-2.5 py-1 text-[11px] font-medium text-accent hover:bg-accent/25 transition-colors">
                {action.label} <ArrowRight className="size-3" />
              </Link>
            )}
            <RowBtn onClick={() => onRead(unread)} title={unread ? "Mark read" : "Mark unread"}>
              {unread ? <Check className="size-3.5" /> : <Dot className="size-4" />}
            </RowBtn>
            <RowBtn onClick={() => onArchive(!archivedView)} title={archivedView ? "Restore" : "Archive"}>
              {archivedView ? <ArchiveRestore className="size-3.5" /> : <Archive className="size-3.5" />}
            </RowBtn>
            <RowBtn danger onClick={onRemove} title="Delete"><Trash2 className="size-3.5" /></RowBtn>
          </div>
        </div>
      </div>
    </motion.li>
  );
}

/* ───────────────────────── Prefs drawer ───────────────────────── */

function PrefsDrawer({ mode, emailCritical, saving, onMode, onEmail, onClose }: {
  mode: PrefMode; emailCritical: boolean; saving: boolean;
  onMode: (m: PrefMode) => void; onEmail: (v: boolean) => void; onClose: () => void;
}) {
  return (
    <>
      <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
        onClick={onClose} className="fixed inset-0 z-50 bg-black/60 backdrop-blur-sm" />
      <motion.div initial={{ x: "100%" }} animate={{ x: 0 }} exit={{ x: "100%" }}
        transition={{ type: "spring", damping: 28, stiffness: 280 }}
        className="fixed right-0 top-0 bottom-0 z-50 w-[92vw] max-w-[420px] flex flex-col border-l border-accent/20 bg-popover/95 backdrop-blur-2xl">
        <div className="flex items-center justify-between px-5 py-4 border-b border-border/60">
          <div className="flex items-center gap-2"><Sliders className="size-4 text-accent" /><span className="font-display font-semibold">Notification preferences</span></div>
          <button onClick={onClose} className="size-8 grid place-items-center rounded-full hover:bg-white/5"><X className="size-4" /></button>
        </div>
        <div className="flex-1 overflow-y-auto p-5 space-y-5">
          <div>
            <p className="text-[11px] font-mono uppercase tracking-wider text-muted-foreground mb-2">What you receive</p>
            <div className="space-y-1.5">
              {PREF_MODES.map((m) => (
                <button key={m.value} onClick={() => onMode(m.value)}
                  className={`w-full flex items-center gap-3 rounded-xl border px-3.5 py-2.5 text-left transition-colors ${
                    mode === m.value ? "border-accent/50 bg-accent/10" : "border-border/60 hover:border-border"
                  }`}>
                  <span className={`size-3.5 rounded-full border grid place-items-center ${mode === m.value ? "border-accent" : "border-border"}`}>
                    {mode === m.value && <span className="size-1.5 rounded-full bg-accent" />}
                  </span>
                  <span className="flex-1">
                    <span className="block text-sm font-medium">{m.label}</span>
                    <span className="block text-[11px] text-muted-foreground">{m.hint}</span>
                  </span>
                </button>
              ))}
            </div>
          </div>

          <div className="rounded-xl border border-border/60 p-3.5">
            <label className="flex items-center gap-3 cursor-pointer">
              <span className="size-8 grid place-items-center rounded-lg bg-rose-500/10 border border-rose-500/30"><Mail className="size-4 text-rose-400" /></span>
              <span className="flex-1">
                <span className="block text-sm font-medium">Email me critical alerts</span>
                <span className="block text-[11px] text-muted-foreground">Out of stock, payment & system failures</span>
              </span>
              <button onClick={() => onEmail(!emailCritical)}
                className={`relative h-6 w-11 shrink-0 rounded-full transition-colors ${emailCritical ? "bg-accent" : "bg-white/10"}`}>
                <span className={`absolute top-0.5 size-5 rounded-full bg-background transition-transform ${emailCritical ? "translate-x-5" : "translate-x-0.5"}`} />
              </button>
            </label>
          </div>

          <p className="text-[11px] text-muted-foreground inline-flex items-center gap-1.5">
            {saving ? <><Loader2 className="size-3 animate-spin" /> Saving…</> : <><Check className="size-3 text-accent" /> Saved automatically</>}
          </p>
        </div>
      </motion.div>
    </>
  );
}

/* ───────────────────────── Small UI ───────────────────────── */

function Stat({ label, value, tone, pulse }: { label: string; value: number; tone: string; pulse?: boolean }) {
  return (
    <div className="card-premium rounded-2xl px-4 py-3">
      <p className="text-[10px] font-mono uppercase tracking-wider text-muted-foreground">{label}</p>
      <p className={`mt-0.5 text-2xl font-display font-semibold tabular-nums ${tone} ${pulse ? "animate-pulse" : ""}`}>{value}</p>
    </div>
  );
}
function Chip({ active, onClick, children }: { active: boolean; onClick: () => void; children: React.ReactNode }) {
  return (
    <button onClick={onClick}
      className={`inline-flex items-center gap-1 rounded-full border px-2.5 py-1 text-[11px] font-medium transition-all ${
        active ? "border-accent/50 bg-accent/15 text-accent" : "border-border/60 text-muted-foreground hover:text-foreground hover:border-border"
      }`}>{children}</button>
  );
}
function BulkBtn({ onClick, children, danger }: { onClick: () => void; children: React.ReactNode; danger?: boolean }) {
  return (
    <button onClick={onClick}
      className={`inline-flex items-center gap-1 rounded-full border px-2.5 py-1 text-[11px] font-medium transition-colors ${
        danger ? "border-rose-500/40 text-rose-300 hover:bg-rose-500/15" : "border-border text-foreground hover:border-accent/50"
      }`}>{children}</button>
  );
}
function RowBtn({ onClick, children, title, danger }: { onClick: () => void; children: React.ReactNode; title: string; danger?: boolean }) {
  return (
    <button onClick={onClick} title={title}
      className={`size-7 grid place-items-center rounded-full border border-border/60 text-muted-foreground transition-colors ${
        danger ? "hover:text-rose-400 hover:border-rose-500/40" : "hover:text-accent hover:border-accent/40"
      }`}>{children}</button>
  );
}
