import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  X, Loader2, UserPlus, UserMinus, UserCog, Check, Flame, Clock, MessageSquare,
  History, StickyNote, Send, Package, Mail, TrendingUp, User, ShieldCheck, ChevronRight,
} from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { cn } from "@/lib/utils";
import { toast } from "sonner";
import { notifySupportEvent } from "@/lib/support.functions";

// ── Domain config ──────────────────────────────────────────────────────────────
export type TicketStatus = "open" | "pending" | "processing" | "resolved" | "closed";
export type TicketPriority = "low" | "normal" | "high" | "urgent";

const STATUSES: TicketStatus[] = ["open", "pending", "processing", "resolved", "closed"];
const PRIORITIES: TicketPriority[] = ["low", "normal", "high", "urgent"];

const STATUS_LABEL: Record<string, string> = {
  open: "Open", pending: "Pending", processing: "Processing", resolved: "Resolved", closed: "Closed",
  new: "New", pending_customer: "Pending Customer", pending_internal: "Pending Internal", escalated: "Escalated", spam: "Spam",
};
const STATUS_CLS: Record<string, string> = {
  open: "text-accent border-accent/30 bg-accent/10",
  pending: "text-indigo-400 border-indigo-400/30 bg-indigo-400/10",
  processing: "text-sky-400 border-sky-400/30 bg-sky-400/10",
  resolved: "text-emerald-400 border-emerald-400/30 bg-emerald-400/10",
  closed: "text-muted-foreground border-border bg-muted/30",
};
const PRIORITY_LABEL: Record<string, string> = { low: "Low", normal: "Normal", high: "High", urgent: "Urgent" };
const PRIORITY_CLS: Record<string, string> = {
  low: "text-muted-foreground border-border bg-muted/20",
  normal: "text-sky-400 border-sky-400/30 bg-sky-400/10",
  high: "text-amber-400 border-amber-400/30 bg-amber-400/10",
  urgent: "text-destructive border-destructive/30 bg-destructive/10",
};

const fmt = (s: string) => new Date(s).toLocaleString([], { month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" });
const money = (n: number, c: string | null) =>
  (c === "USD" ? "$" : "₹") + Math.round(n || 0).toLocaleString(c === "USD" ? "en-US" : "en-IN");
const dur = (ms: number | null) => {
  if (ms == null || ms < 0) return "—";
  const m = Math.round(ms / 60000);
  if (m < 1) return "<1 min";
  if (m < 60) return `${m} min`;
  const h = Math.round(m / 6) / 10;
  if (m < 60 * 48) return `${h} hr`;
  return `${Math.round(m / 1440)} d`;
};

type FullTicket = {
  id: string; ticket_number: string; subject: string; category: string;
  status: string; priority: string; order_id: string | null; user_id: string;
  assigned_to: string | null; created_at: string; first_response_at: string | null;
  resolved_at: string | null; closed_at: string | null; last_message_at: string;
};
type EventRow = { id: string; event_type: string; from_status: string | null; to_status: string | null; actor_id: string | null; meta: Record<string, unknown>; created_at: string };
type NoteRow = { id: string; body: string; author_id: string; created_at: string };
type Staff = { id: string; name: string };
type OrderLite = { id: string; total: number; currency: string | null; status: string; payment_status: string | null; created_at: string; contact_email: string | null };

type TimelineItem = { id: string; at: string; label: string; sub?: string; tone: "accent" | "amber" | "emerald" | "destructive" | "muted" };

const PAID = ["paid", "succeeded", "delivered", "shipped", "completed"];

export function TicketOpsSheet({
  ticketId, currentUserId, onClose, onOpenThread, onOpen360, onOpenTicket,
}: {
  ticketId: string; currentUserId: string; onClose: () => void;
  onOpenThread: () => void; onOpen360: (userId: string, name: string) => void;
  onOpenTicket?: (ticketId: string) => void;
}) {
  const [ticket, setTicket] = useState<FullTicket | null>(null);
  const [events, setEvents] = useState<EventRow[]>([]);
  const [notes, setNotes] = useState<NoteRow[]>([]);
  const [staff, setStaff] = useState<Staff[]>([]);
  const [names, setNames] = useState<Map<string, string>>(new Map());
  const [orders, setOrders] = useState<OrderLite[]>([]);
  const [customer, setCustomer] = useState<{ name: string; email: string | null; createdAt: string | null } | null>(null);
  const [userTickets, setUserTickets] = useState<{ id: string; ticket_number: string | null; category: string; status: string; created_at: string; resolved_at: string | null; closed_at: string | null }[]>([]);
  const [msgRows, setMsgRows] = useState<{ id: string; sender_role: string | null; created_at: string }[]>([]);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [noteDraft, setNoteDraft] = useState("");
  const [savingNote, setSavingNote] = useState(false);
  const [reassign, setReassign] = useState(false);
  const reloadTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const load = useCallback(async () => {
    const [t, ev, nt, ord] = await Promise.all([
      supabase.from("support_tickets")
        .select("id,ticket_number,subject,category,status,priority,order_id,user_id,assigned_to,created_at,first_response_at,resolved_at,closed_at,last_message_at")
        .eq("id", ticketId).maybeSingle(),
      supabase.from("support_ticket_events").select("id,event_type,from_status,to_status,actor_id,meta,created_at").eq("ticket_id", ticketId).order("created_at", { ascending: false }).limit(200),
      supabase.from("support_internal_notes").select("id,body,author_id,created_at").eq("ticket_id", ticketId).order("created_at", { ascending: false }),
      supabase.from("support_messages").select("id,sender_role,created_at").eq("ticket_id", ticketId).order("created_at", { ascending: true }).limit(500),
    ]);
    const tk = (t.data as FullTicket) ?? null;
    setTicket(tk);
    const eventRows = (ev.data as EventRow[]) ?? [];
    setEvents(eventRows);
    setNotes((nt.data as NoteRow[]) ?? []);

    // message replies for the timeline
    const msgs = (ord.data as { id: string; sender_role: string | null; created_at: string }[]) ?? [];
    setMsgRows(msgs);

    if (tk) {
      // customer + orders + full support history
      const [{ data: cust }, { data: o }, { data: ut }] = await Promise.all([
        supabase.from("profiles").select("full_name,created_at").eq("id", tk.user_id).maybeSingle(),
        supabase.from("orders").select("id,total,currency,status,payment_status,created_at,contact_email").eq("user_id", tk.user_id).order("created_at", { ascending: false }).limit(50),
        supabase.from("support_tickets").select("id,ticket_number,category,status,created_at,resolved_at,closed_at").eq("user_id", tk.user_id).order("created_at", { ascending: false }).limit(100),
      ]);
      const oRows = (o as OrderLite[]) ?? [];
      setOrders(oRows);
      const profile = cust as { full_name: string | null; created_at: string | null } | null;
      setCustomer({
        name: profile?.full_name ?? "Customer",
        email: oRows.find((x) => x.contact_email)?.contact_email ?? null,
        createdAt: profile?.created_at ?? null,
      });
      setUserTickets((ut as typeof userTickets) ?? []);
    }

    // resolve actor / note-author / staff names + staff list
    const ids = new Set<string>();
    for (const e of eventRows) { if (e.actor_id) ids.add(e.actor_id); const m = e.meta || {}; if (typeof m.to === "string") ids.add(m.to); if (typeof m.from === "string") ids.add(m.from); }
    for (const n of ((nt.data as NoteRow[]) ?? [])) ids.add(n.author_id);
    if (tk?.assigned_to) ids.add(tk.assigned_to);

    const { data: roleRows } = await supabase.from("user_roles").select("user_id,role").in("role", ["admin", "super_admin", "manager", "support"]);
    const staffIds = [...new Set(((roleRows as { user_id: string }[]) ?? []).map((r) => r.user_id))];
    for (const s of staffIds) ids.add(s);

    if (ids.size) {
      const { data: pf } = await supabase.from("profiles").select("id,full_name").in("id", [...ids]);
      const map = new Map<string, string>(((pf as { id: string; full_name: string | null }[]) ?? []).map((p) => [p.id, p.full_name ?? "Staff"]));
      setNames(map);
      setStaff(staffIds.map((id) => ({ id, name: map.get(id) ?? `Agent ${id.slice(0, 6)}` })).sort((a, b) => a.name.localeCompare(b.name)));
    }
    setLoading(false);
  }, [ticketId]);


  useEffect(() => {
    void load();
    const schedule = () => { if (reloadTimer.current) clearTimeout(reloadTimer.current); reloadTimer.current = setTimeout(() => void load(), 400); };
    const ch = supabase.channel(`ticket-ops:${ticketId}`)
      .on("postgres_changes", { event: "*", schema: "public", table: "support_tickets", filter: `id=eq.${ticketId}` }, schedule)
      .on("postgres_changes", { event: "*", schema: "public", table: "support_ticket_events", filter: `ticket_id=eq.${ticketId}` }, schedule)
      .on("postgres_changes", { event: "*", schema: "public", table: "support_internal_notes", filter: `ticket_id=eq.${ticketId}` }, schedule)
      .on("postgres_changes", { event: "*", schema: "public", table: "support_messages", filter: `ticket_id=eq.${ticketId}` }, schedule)
      .subscribe();
    return () => { supabase.removeChannel(ch); if (reloadTimer.current) clearTimeout(reloadTimer.current); };
  }, [ticketId, load]);

  const nameOf = (id: string | null | undefined) => (id ? names.get(id) ?? `Agent ${id.slice(0, 6)}` : null);

  async function patch(p: Record<string, unknown>, okMsg: string, notify?: "resolved" | "closed") {
    setBusy(true);
    try {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { error } = await (supabase.from("support_tickets") as any).update(p).eq("id", ticketId);
      if (error) throw error;
      toast.success(okMsg);
      if (notify) void notifySupportEvent({ data: { ticketId, event: notify } }).catch(() => {});
      void load();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Update failed");
    } finally {
      setBusy(false);
    }
  }

  async function addNote() {
    const body = noteDraft.trim();
    if (!body) return;
    setSavingNote(true);
    try {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { error } = await (supabase.from("support_internal_notes") as any).insert({ ticket_id: ticketId, author_id: currentUserId, body });
      if (error) throw error;
      setNoteDraft("");
      void load();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Could not save note");
    } finally {
      setSavingNote(false);
    }
  }

  // ── SLA ──
  const sla = useMemo(() => {
    if (!ticket) return { first: null as number | null, resolution: null as number | null };
    const created = +new Date(ticket.created_at);
    const first = ticket.first_response_at ? +new Date(ticket.first_response_at) - created : null;
    const end = ticket.closed_at ?? ticket.resolved_at;
    const resolution = end ? +new Date(end) - created : null;
    return { first, resolution };
  }, [ticket]);

  // ── Timeline (events + ticket created + message replies) ──
  const timeline = useMemo<TimelineItem[]>(() => {
    if (!ticket) return [];
    const items: TimelineItem[] = [];
    items.push({ id: "created", at: ticket.created_at, label: "Ticket created", sub: nameOf(ticket.user_id) ?? "Customer", tone: "muted" });
    for (const m of msgRows) {
      const staffReply = !!m.sender_role && m.sender_role !== "customer" && m.sender_role !== "user";
      items.push({
        id: "m" + m.id, at: m.created_at,
        label: staffReply ? "Admin replied" : "Customer replied",
        tone: staffReply ? "accent" : "muted",
      });
    }
    for (const e of events) {
      if (e.event_type === "status_change") {
        const to = e.to_status ?? "";
        items.push({ id: e.id, at: e.created_at, label: `Status → ${STATUS_LABEL[to] ?? to}`, sub: nameOf(e.actor_id) ?? "System", tone: to === "resolved" ? "emerald" : to === "closed" ? "muted" : "accent" });
      } else if (e.event_type === "assignment") {
        const to = e.meta?.to as string | undefined;
        items.push({ id: e.id, at: e.created_at, label: to ? `Assigned to ${nameOf(to)}` : "Unassigned", sub: nameOf(e.actor_id) ?? "System", tone: "accent" });
      } else if (e.event_type === "priority_change") {
        const to = e.meta?.to as string | undefined;
        items.push({ id: e.id, at: e.created_at, label: `Priority → ${PRIORITY_LABEL[to ?? ""] ?? to}`, sub: nameOf(e.actor_id) ?? "System", tone: to === "urgent" || to === "high" ? "amber" : "muted" });
      } else {
        items.push({ id: e.id, at: e.created_at, label: e.event_type.replace(/_/g, " "), sub: nameOf(e.actor_id) ?? undefined, tone: "muted" });
      }
    }
    return items.sort((a, b) => +new Date(b.at) - +new Date(a.at));
  }, [ticket, events, msgRows, names]);

  const ltv = useMemo(() => orders.filter((o) => PAID.includes((o.payment_status ?? o.status ?? "").toLowerCase())).reduce((a, b) => a + (b.total || 0), 0), [orders]);
  const currency = orders[0]?.currency ?? null;
  const aov = orders.length ? ltv / orders.length : 0;
  const support = useMemo(() => {
    const openT = userTickets.filter((t) => t.status !== "resolved" && t.status !== "closed").length;
    const resolvedT = userTickets.filter((t) => t.status === "resolved" || t.status === "closed");
    const lastDate = userTickets[0]?.created_at ?? null;
    const previous = resolvedT
      .map((t) => ({ ...t, at: t.resolved_at ?? t.closed_at ?? t.created_at }))
      .sort((a, b) => +new Date(b.at) - +new Date(a.at))
      .slice(0, 4);
    return { openT, resolvedCount: resolvedT.length, lastDate, total: userTickets.length, previous };
  }, [userTickets]);
  const assignedName = ticket?.assigned_to ? nameOf(ticket.assigned_to) : null;
  const status = (ticket?.status ?? "open") as string;
  const priority = (ticket?.priority ?? "normal") as string;

  return (
    <div className="fixed inset-0 z-50 flex justify-end">
      <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" onClick={onClose} />
      <div className="relative w-full max-w-lg h-full overflow-y-auto bg-background border-l border-border shadow-2xl">
        {/* Header */}
        <div className="sticky top-0 z-10 bg-background/95 backdrop-blur border-b border-border px-5 py-4">
          <div className="flex items-start justify-between gap-3">
            <div className="min-w-0">
              <p className="font-mono text-[11px] text-accent">{ticket?.ticket_number ?? "…"}</p>
              <h2 className="text-base font-semibold truncate">{ticket?.subject ?? "Loading…"}</h2>
              {ticket && <p className="text-[11px] text-muted-foreground mt-0.5">{ticket.category} · opened {fmt(ticket.created_at)}</p>}
            </div>
            <button onClick={onClose} className="rounded-lg p-1.5 hover:bg-muted shrink-0"><X className="size-4" /></button>
          </div>
          <div className="flex flex-wrap items-center gap-1.5 mt-2.5">
            <span className={cn("rounded-full px-2 py-0.5 text-[10px] font-mono uppercase border", STATUS_CLS[status] ?? "border-border")}>{STATUS_LABEL[status] ?? status}</span>
            <span className={cn("rounded-full px-2 py-0.5 text-[10px] font-mono uppercase border", PRIORITY_CLS[priority] ?? "border-border")}>{PRIORITY_LABEL[priority] ?? priority}</span>
            <button onClick={onOpenThread} className="ml-auto inline-flex items-center gap-1 rounded-lg border border-accent/30 text-accent px-2.5 py-1 text-[11px] font-medium hover:bg-accent/10">
              <MessageSquare className="size-3" /> Conversation
            </button>
          </div>
        </div>

        {loading || !ticket ? (
          <div className="grid place-items-center py-24"><Loader2 className="size-5 animate-spin text-accent" /></div>
        ) : (
          <div className="p-5 space-y-5">
            {/* Assignment */}
            <Block title="Assignment" icon={<UserCog className="size-3.5" />}>
              <div className="flex items-center gap-2.5 mb-3">
                <span className="size-9 grid place-items-center rounded-xl bg-accent/10 text-accent shrink-0">
                  {assignedName ? <span className="text-xs font-bold">{assignedName.slice(0, 2).toUpperCase()}</span> : <User className="size-4 text-muted-foreground" />}
                </span>
                <div className="min-w-0">
                  <p className="text-[10px] uppercase tracking-widest text-muted-foreground">Assigned to</p>
                  <p className="text-sm font-medium truncate">{assignedName ?? "Unassigned"}</p>
                </div>
              </div>
              <div className="flex flex-wrap gap-1.5">
                {ticket.assigned_to !== currentUserId && (
                  <OpBtn icon={<UserPlus className="size-3" />} disabled={busy} onClick={() => patch({ assigned_to: currentUserId }, "Assigned to you")}>Assign to me</OpBtn>
                )}
                <OpBtn icon={<UserCog className="size-3" />} disabled={busy} onClick={() => setReassign((v) => !v)}>Reassign</OpBtn>
                {ticket.assigned_to && (
                  <OpBtn icon={<UserMinus className="size-3" />} tone="destructive" disabled={busy} onClick={() => patch({ assigned_to: null }, "Ticket unassigned")}>Unassign</OpBtn>
                )}
              </div>
              {reassign && (
                <div className="mt-2 grid gap-1 rounded-xl border border-border/60 bg-background/40 p-1.5 max-h-44 overflow-y-auto">
                  {staff.length === 0 ? <p className="text-xs text-muted-foreground p-2">No staff found.</p> : staff.map((s) => (
                    <button key={s.id} disabled={busy} onClick={() => { setReassign(false); void patch({ assigned_to: s.id }, `Assigned to ${s.name}`); }}
                      className={cn("flex items-center justify-between rounded-lg px-2.5 py-1.5 text-xs hover:bg-accent/10", ticket.assigned_to === s.id && "text-accent")}>
                      <span className="truncate">{s.name}</span>
                      {ticket.assigned_to === s.id && <Check className="size-3.5 shrink-0" />}
                    </button>
                  ))}
                </div>
              )}
            </Block>

            {/* Status */}
            <Block title="Status" icon={<ShieldCheck className="size-3.5" />}>
              <div className="flex flex-wrap gap-1.5">
                {STATUSES.map((s) => (
                  <button key={s} disabled={busy || status === s}
                    onClick={() => patch({ status: s }, `Status set to ${STATUS_LABEL[s]}`, s === "resolved" || s === "closed" ? s : undefined)}
                    className={cn("rounded-full px-3 py-1.5 text-[11px] font-medium border transition-colors disabled:opacity-100",
                      status === s ? STATUS_CLS[s] : "border-border/60 text-muted-foreground hover:text-foreground hover:border-accent/40")}>
                    {STATUS_LABEL[s]}
                  </button>
                ))}
              </div>
            </Block>

            {/* Priority */}
            <Block title="Priority" icon={<Flame className="size-3.5" />}>
              <div className="flex flex-wrap gap-1.5">
                {PRIORITIES.map((p) => (
                  <button key={p} disabled={busy || priority === p} onClick={() => patch({ priority: p }, `Priority set to ${PRIORITY_LABEL[p]}`)}
                    className={cn("rounded-full px-3 py-1.5 text-[11px] font-medium border transition-colors disabled:opacity-100",
                      priority === p ? PRIORITY_CLS[p] : "border-border/60 text-muted-foreground hover:text-foreground hover:border-accent/40")}>
                    {PRIORITY_LABEL[p]}
                  </button>
                ))}
              </div>
            </Block>

            {/* SLA */}
            <Block title="SLA" icon={<Clock className="size-3.5" />}>
              <div className="grid grid-cols-2 gap-2.5">
                <div className="rounded-xl border border-border/60 bg-background/40 p-3">
                  <p className="text-[10px] uppercase tracking-widest text-muted-foreground">First response</p>
                  <p className="text-sm font-semibold tabular-nums mt-0.5">{dur(sla.first)}</p>
                </div>
                <div className="rounded-xl border border-border/60 bg-background/40 p-3">
                  <p className="text-[10px] uppercase tracking-widest text-muted-foreground">Resolution</p>
                  <p className="text-sm font-semibold tabular-nums mt-0.5">{dur(sla.resolution)}</p>
                </div>
              </div>
            </Block>

            {/* Customer overview */}
            <Block title="Customer overview" icon={<User className="size-3.5" />}>
              <div className="rounded-xl border border-border/60 bg-background/40 p-3 space-y-2.5">
                <div className="flex items-center justify-between gap-2">
                  <div className="min-w-0">
                    <p className="text-sm font-medium truncate">{customer?.name ?? "Customer"}</p>
                    {customer?.email && <p className="text-[11px] text-muted-foreground truncate flex items-center gap-1"><Mail className="size-3" />{customer.email}</p>}
                  </div>
                  <button onClick={() => onOpen360(ticket.user_id, customer?.name ?? "Customer")}
                    className="inline-flex items-center gap-0.5 text-[11px] text-accent hover:underline shrink-0">360 <ChevronRight className="size-3" /></button>
                </div>
                <div className="grid grid-cols-3 gap-2">
                  <div className="rounded-lg bg-white/[0.03] px-2.5 py-1.5"><p className="text-[10px] uppercase tracking-widest text-muted-foreground flex items-center gap-1"><Package className="size-3" />Orders</p><p className="text-sm font-semibold tabular-nums">{orders.length}</p></div>
                  <div className="rounded-lg bg-white/[0.03] px-2.5 py-1.5"><p className="text-[10px] uppercase tracking-widest text-muted-foreground flex items-center gap-1"><TrendingUp className="size-3" />Spend</p><p className="text-sm font-semibold tabular-nums">{money(ltv, currency)}</p></div>
                  <div className="rounded-lg bg-white/[0.03] px-2.5 py-1.5"><p className="text-[10px] uppercase tracking-widest text-muted-foreground flex items-center gap-1"><TrendingUp className="size-3" />Avg order</p><p className="text-sm font-semibold tabular-nums">{money(aov, currency)}</p></div>
                </div>
                <p className="text-[11px] text-muted-foreground flex items-center gap-1">
                  <Clock className="size-3" /> Member since{" "}
                  <span className="text-foreground">{customer?.createdAt ? new Date(customer.createdAt).toLocaleDateString(undefined, { month: "short", year: "numeric" }) : "—"}</span>
                </p>
                {ticket.order_id && (
                  <p className="text-[11px] text-muted-foreground">Linked order <span className="font-mono text-foreground">#{ticket.order_id.slice(0, 8)}</span></p>
                )}
                {orders.length > 0 && (
                  <div className="pt-1 space-y-1">
                    <p className="text-[10px] uppercase tracking-widest text-muted-foreground">Recent orders</p>
                    {orders.slice(0, 3).map((o) => (
                      <div key={o.id} className="flex items-center justify-between text-[11px]">
                        <span className="font-mono text-muted-foreground">#{o.id.slice(0, 8)}</span>
                        <span className="tabular-nums">{money(o.total, o.currency)}</span>
                        <span className="text-muted-foreground">{new Date(o.created_at).toLocaleDateString()}</span>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </Block>

            {/* Support history */}
            <Block title="Support history" icon={<History className="size-3.5" />}>
              <div className="grid grid-cols-2 gap-2">
                <div className="rounded-lg bg-white/[0.03] px-2.5 py-1.5"><p className="text-[10px] uppercase tracking-widest text-muted-foreground">Open tickets</p><p className="text-sm font-semibold tabular-nums">{support.openT}</p></div>
                <div className="rounded-lg bg-white/[0.03] px-2.5 py-1.5"><p className="text-[10px] uppercase tracking-widest text-muted-foreground">Resolved</p><p className="text-sm font-semibold tabular-nums">{support.resolvedCount}</p></div>
                <div className="rounded-lg bg-white/[0.03] px-2.5 py-1.5"><p className="text-[10px] uppercase tracking-widest text-muted-foreground">Total requests</p><p className="text-sm font-semibold tabular-nums">{support.total}</p></div>
                <div className="rounded-lg bg-white/[0.03] px-2.5 py-1.5"><p className="text-[10px] uppercase tracking-widest text-muted-foreground">Last ticket</p><p className="text-sm font-semibold">{support.lastDate ? new Date(support.lastDate).toLocaleDateString() : "—"}</p></div>
              </div>
            </Block>

            {/* Previous resolutions */}
            {support.previous.length > 0 && (
              <Block title="Previous resolutions" icon={<ShieldCheck className="size-3.5" />}>
                <div className="space-y-1.5">
                  {support.previous.map((t) => (
                    <button
                      key={t.id}
                      disabled={t.id === ticketId}
                      onClick={() => onOpenTicket?.(t.id)}
                      className={cn(
                        "w-full flex items-center justify-between gap-2 rounded-lg border border-border/60 bg-background/40 px-2.5 py-2 text-left transition-colors",
                        t.id === ticketId ? "opacity-60" : "hover:border-accent/40 hover:bg-accent/[0.04]",
                      )}
                    >
                      <div className="min-w-0">
                        <p className="font-mono text-[11px] text-accent truncate">{t.ticket_number ?? `#${t.id.slice(0, 8)}`}</p>
                        <p className="text-[11px] text-muted-foreground truncate">{t.category}</p>
                      </div>
                      <div className="flex items-center gap-1.5 shrink-0">
                        <span className="text-[10px] text-muted-foreground">{new Date(t.resolved_at ?? t.closed_at ?? t.created_at).toLocaleDateString()}</span>
                        {t.id !== ticketId && <ChevronRight className="size-3 text-muted-foreground" />}
                      </div>
                    </button>
                  ))}
                </div>
              </Block>
            )}

            {/* Internal notes */}
            <Block title="Internal notes" icon={<StickyNote className="size-3.5" />} hint="Admin only — never shown to customers">
              <div className="space-y-2">
                <div className="flex items-end gap-2">
                  <textarea value={noteDraft} onChange={(e) => setNoteDraft(e.target.value)} rows={2}
                    placeholder="Add a private note (e.g. verify shipping address, high fraud risk)…"
                    className="flex-1 resize-none rounded-xl border border-border bg-background/60 px-3 py-2 text-xs outline-none focus:border-accent/50" />
                  <button onClick={addNote} disabled={savingNote || !noteDraft.trim()}
                    className="rounded-xl bg-accent text-accent-foreground p-2.5 disabled:opacity-50 hover:brightness-110 shrink-0">
                    {savingNote ? <Loader2 className="size-4 animate-spin" /> : <Send className="size-4" />}
                  </button>
                </div>
                {notes.length === 0 ? (
                  <p className="text-xs text-muted-foreground py-1">No internal notes yet.</p>
                ) : notes.map((n) => (
                  <div key={n.id} className="rounded-xl border border-amber-400/20 bg-amber-400/[0.04] p-3">
                    <p className="text-xs whitespace-pre-wrap">{n.body}</p>
                    <p className="text-[10px] text-muted-foreground mt-1.5">{nameOf(n.author_id) ?? "Staff"} · {fmt(n.created_at)}</p>
                  </div>
                ))}
              </div>
            </Block>

            {/* Timeline */}
            <Block title="Activity timeline" icon={<History className="size-3.5" />}>
              <div className="relative pl-4">
                <div className="absolute left-[5px] top-1 bottom-1 w-px bg-border" />
                <div className="space-y-3">
                  {timeline.map((it) => (
                    <div key={it.id} className="relative">
                      <span className={cn("absolute -left-[14px] top-1 size-2.5 rounded-full ring-2 ring-background",
                        it.tone === "accent" ? "bg-accent" : it.tone === "amber" ? "bg-amber-400" : it.tone === "emerald" ? "bg-emerald-400" : it.tone === "destructive" ? "bg-destructive" : "bg-muted-foreground")} />
                      <p className="text-xs font-medium leading-tight">{it.label}</p>
                      <p className="text-[10px] text-muted-foreground">{it.sub ? `${it.sub} · ` : ""}{fmt(it.at)}</p>
                    </div>
                  ))}
                </div>
              </div>
            </Block>
          </div>
        )}
      </div>
    </div>
  );
}

function Block({ title, icon, hint, children }: { title: string; icon: React.ReactNode; hint?: string; children: React.ReactNode }) {
  return (
    <div className="space-y-2">
      <div className="flex items-center gap-1.5 text-muted-foreground">
        {icon}
        <p className="text-[11px] font-mono uppercase tracking-widest">{title}</p>
        {hint && <span className="text-[10px] normal-case tracking-normal text-amber-400/70">· {hint}</span>}
      </div>
      {children}
    </div>
  );
}

function OpBtn({ icon, children, tone, disabled, onClick }: { icon: React.ReactNode; children: React.ReactNode; tone?: "destructive"; disabled?: boolean; onClick: () => void }) {
  return (
    <button disabled={disabled} onClick={onClick}
      className={cn("inline-flex items-center gap-1 rounded-lg border px-2.5 py-1.5 text-[11px] font-medium transition-colors disabled:opacity-50",
        tone === "destructive" ? "border-destructive/30 text-destructive hover:bg-destructive/10" : "border-border text-foreground hover:border-accent/40 hover:text-accent")}>
      {icon}{children}
    </button>
  );
}
