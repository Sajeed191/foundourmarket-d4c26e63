import { createFileRoute } from "@tanstack/react-router";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  Loader2, LifeBuoy, MessageSquare, Search, X, Gauge, Inbox, RotateCcw,
  Banknote, AlertTriangle, Clock, Flame, Sparkles, User, Package, Truck,
  Bell, ShieldAlert, Copy, ChevronRight, TrendingUp,
} from "lucide-react";
import { AdminShell, logActivity } from "@/components/admin/AdminShell";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/lib/auth";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import { ThreadSheet } from "@/routes/account_.support";
import { notifySupportEvent } from "@/lib/support.functions";
import { suggestSupportReply } from "@/lib/support-ai.functions";
import {
  deriveStage, computeSla, computeSupportKpis, detectEscalation,
  groupByStatus, refundRisk, normPriority, isStaffSender,
  STAGE_LABEL, STAGE_ORDER, PRIORITY_LABEL, ESCALATION_LABEL,
  type TicketRow, type MessageRow, type OrderLite, type RefundRow, type ReturnRow,
  type TicketStage, type SlaInfo, type EscalationReason, type EscalationContext, type Priority,
} from "@/lib/support-analytics";

export const Route = createFileRoute("/admin-support")({
  head: () => ({ meta: [{ title: "Support Command Center — Admin" }] }),
  component: AdminSupportPage,
});

const VIP_THRESHOLD = 25000;
const HIGH_VALUE_ORDER = 10000;

const PRIORITIES: Priority[] = ["low", "medium", "high", "urgent"];
// DB stores "normal" for medium.
const priorityToDb = (p: Priority) => (p === "medium" ? "normal" : p);

const fmtTime = (s: string) => new Date(s).toLocaleString([], { month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" });
const money = (n: number, c: string | null) =>
  (c === "USD" ? "$" : "₹") + Math.round(n || 0).toLocaleString(c === "USD" ? "en-US" : "en-IN");
const hrs = (n: number | null) => (n == null ? "—" : n < 1 ? `${Math.round(n * 60)}m` : n < 48 ? `${n}h` : `${Math.round(n / 24)}d`);

const STAGE_CLS: Record<TicketStage, string> = {
  new: "text-sky-400 border-sky-400/30 bg-sky-400/10",
  open: "text-accent border-accent/30 bg-accent/10",
  pending_customer: "text-indigo-400 border-indigo-400/30 bg-indigo-400/10",
  pending_internal: "text-amber-400 border-amber-400/30 bg-amber-400/10",
  escalated: "text-destructive border-destructive/30 bg-destructive/10",
  resolved: "text-emerald-400 border-emerald-400/30 bg-emerald-400/10",
  closed: "text-muted-foreground border-border bg-muted/30",
  spam: "text-muted-foreground border-border bg-muted/20",
};
const PRIORITY_CLS: Record<Priority, string> = {
  low: "text-muted-foreground border-border bg-muted/20",
  medium: "text-sky-400 border-sky-400/30 bg-sky-400/10",
  high: "text-amber-400 border-amber-400/30 bg-amber-400/10",
  urgent: "text-destructive border-destructive/30 bg-destructive/10",
};

type Section = "dashboard" | "tickets" | "refunds" | "returns";

type Enriched = {
  ticket: TicketRow;
  stage: TicketStage;
  sla: SlaInfo;
  lastSenderRole: string | null;
  escalations: EscalationReason[];
  customerName: string;
};

function AdminSupportPage() {
  const { user } = useAuth();
  const [tickets, setTickets] = useState<TicketRow[] | null>(null);
  const [messages, setMessages] = useState<MessageRow[]>([]);
  const [orders, setOrders] = useState<OrderLite[]>([]);
  const [refunds, setRefunds] = useState<RefundRow[]>([]);
  const [returns, setReturns] = useState<ReturnRow[]>([]);
  const [profiles, setProfiles] = useState<Map<string, string>>(new Map());
  const [failedOrders, setFailedOrders] = useState<Set<string>>(new Set());
  const [fraudUsers, setFraudUsers] = useState<Set<string>>(new Set());

  const [section, setSection] = useState<Section>("dashboard");
  const [stageFilter, setStageFilter] = useState<TicketStage | "all" | "overdue">("all");
  const [q, setQ] = useState("");
  const [activeId, setActiveId] = useState<string | null>(null);
  const [c360, setC360] = useState<{ userId: string; name: string } | null>(null);
  const [aiTicket, setAiTicket] = useState<string | null>(null);
  const reloadTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const load = useCallback(async () => {
    const [t, m, o, rf, rt, pf, sh, fr] = await Promise.all([
      supabase.from("support_tickets").select("id,user_id,subject,category,status,priority,order_id,market_region,last_message_at,resolved_at,assigned_to,tags,created_at").order("last_message_at", { ascending: false }).limit(500),
      supabase.from("support_messages").select("id,ticket_id,sender_id,sender_role,created_at").order("created_at", { ascending: true }).limit(4000),
      supabase.from("orders").select("id,user_id,total,currency,status,payment_status").limit(2000),
      supabase.from("refunds").select("id,order_id,amount,currency,status,reason,created_at").order("created_at", { ascending: false }).limit(500),
      supabase.from("returns").select("id,order_id,user_id,status,reason,refund_amount,refund_status,resolved_at,created_at").order("created_at", { ascending: false }).limit(500),
      supabase.from("profiles").select("id,full_name").limit(2000),
      supabase.from("shipments").select("order_id,status").eq("status", "failed_delivery").limit(1000),
      supabase.from("fraud_alerts").select("user_id").limit(1000),
    ]);
    if (t.error) { toast.error(t.error.message); setTickets([]); return; }
    setTickets((t.data as TicketRow[]) ?? []);
    setMessages((m.data as MessageRow[]) ?? []);
    setOrders((o.data as OrderLite[]) ?? []);
    setRefunds((rf.data as RefundRow[]) ?? []);
    setReturns((rt.data as ReturnRow[]) ?? []);
    setProfiles(new Map(((pf.data as { id: string; full_name: string | null }[]) ?? []).map((p) => [p.id, p.full_name ?? "Customer"])));
    setFailedOrders(new Set(((sh.data as { order_id: string }[]) ?? []).map((s) => s.order_id)));
    setFraudUsers(new Set(((fr.data as { user_id: string | null }[]) ?? []).map((f) => f.user_id).filter(Boolean) as string[]));
  }, []);

  useEffect(() => {
    void load();
    const schedule = () => { if (reloadTimer.current) clearTimeout(reloadTimer.current); reloadTimer.current = setTimeout(() => void load(), 600); };
    const ch = supabase.channel("admin-support-cc")
      .on("postgres_changes", { event: "*", schema: "public", table: "support_tickets" }, schedule)
      .on("postgres_changes", { event: "*", schema: "public", table: "support_messages" }, schedule)
      .on("postgres_changes", { event: "*", schema: "public", table: "refunds" }, schedule)
      .on("postgres_changes", { event: "*", schema: "public", table: "returns" }, schedule)
      .subscribe();
    return () => { supabase.removeChannel(ch); if (reloadTimer.current) clearTimeout(reloadTimer.current); };
  }, [load]);

  async function update(id: string, patch: Record<string, unknown>) {
    if (patch.status === "resolved") patch.resolved_at = new Date().toISOString();
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { error } = await (supabase.from("support_tickets") as any).update(patch).eq("id", id);
    if (error) { toast.error(error.message); return; }
    logActivity("support_update", "support_ticket", id, patch);
    if (patch.status === "resolved" || patch.status === "closed") {
      void notifySupportEvent({ data: { ticketId: id, event: patch.status as "resolved" | "closed" } }).catch(() => {});
    }
    void load();
  }

  // ── Per-ticket aggregates from real messages ───────────────────────────────
  const msgAgg = useMemo(() => {
    const firstStaff = new Map<string, number>();
    const lastSender = new Map<string, string | null>();
    const has = new Set<string>();
    for (const m of messages) {
      has.add(m.ticket_id);
      lastSender.set(m.ticket_id, m.sender_role ?? null); // messages sorted asc → last wins
      if (isStaffSender(m.sender_role) && !firstStaff.has(m.ticket_id)) firstStaff.set(m.ticket_id, +new Date(m.created_at));
    }
    return { firstStaff, lastSender, has };
  }, [messages]);

  const escCtx: EscalationContext = useMemo(() => {
    const ticketsByUser = new Map<string, number>();
    for (const t of tickets ?? []) ticketsByUser.set(t.user_id, (ticketsByUser.get(t.user_id) ?? 0) + 1);
    const ltvByUser = new Map<string, number>();
    const orderById = new Map<string, OrderLite>();
    for (const o of orders) {
      orderById.set(o.id, o);
      if (["paid", "succeeded", "delivered", "shipped", "completed"].includes((o.payment_status ?? o.status ?? "").toLowerCase()) || o.payment_status === "succeeded")
        ltvByUser.set(o.user_id, (ltvByUser.get(o.user_id) ?? 0) + (o.total || 0));
    }
    return { ticketsByUser, ltvByUser, orderById, failedDeliveryOrderIds: failedOrders, fraudUserIds: fraudUsers, vipThreshold: VIP_THRESHOLD, highValueThreshold: HIGH_VALUE_ORDER };
  }, [tickets, orders, failedOrders, fraudUsers]);

  const enriched = useMemo<Enriched[]>(() => {
    if (!tickets) return [];
    return tickets.map((ticket) => {
      const lastSenderRole = msgAgg.lastSender.get(ticket.id) ?? null;
      const stage = deriveStage(ticket, lastSenderRole, msgAgg.has.has(ticket.id));
      const sla = computeSla(ticket, stage, msgAgg.firstStaff.get(ticket.id) ?? null, lastSenderRole);
      const escalations = detectEscalation(ticket, escCtx);
      return { ticket, stage, sla, lastSenderRole, escalations, customerName: profiles.get(ticket.user_id) ?? "Customer" };
    });
  }, [tickets, msgAgg, escCtx, profiles]);

  const kpis = useMemo(() => computeSupportKpis(enriched), [enriched]);

  const visibleTickets = useMemo(() => {
    const term = q.trim().toLowerCase();
    return enriched.filter((e) => {
      if (stageFilter === "overdue") { if (!e.sla.overdue) return false; }
      else if (stageFilter !== "all" && e.stage !== stageFilter) return false;
      if (!term) return true;
      return [e.ticket.subject, e.ticket.id, e.ticket.category, e.customerName, e.ticket.order_id]
        .some((v) => (v ?? "").toString().toLowerCase().includes(term));
    });
  }, [enriched, stageFilter, q]);

  const stageCount = (s: TicketStage | "all" | "overdue") =>
    s === "all" ? enriched.length : s === "overdue" ? enriched.filter((e) => e.sla.overdue).length : enriched.filter((e) => e.stage === s).length;

  const SECTIONS: { key: Section; label: string; icon: React.ReactNode }[] = [
    { key: "dashboard", label: "Dashboard", icon: <Gauge className="size-3.5" /> },
    { key: "tickets", label: "Tickets", icon: <Inbox className="size-3.5" /> },
    { key: "refunds", label: "Refunds", icon: <Banknote className="size-3.5" /> },
    { key: "returns", label: "Returns", icon: <RotateCcw className="size-3.5" /> },
  ];

  return (
    <AdminShell
      title="Support Command Center"
      subtitle="Live customer support operations — SLA tracking, auto-escalation, AI assist, refunds & returns. All metrics from real records."
      allow={["admin", "super_admin", "manager", "support"]}
      actions={<LifeBuoy className="size-4 text-accent" />}
    >
      <div className="space-y-4">
        <div className="flex flex-wrap gap-1.5">
          {SECTIONS.map((s) => (
            <button key={s.key} onClick={() => setSection(s.key)}
              className={cn("inline-flex items-center gap-1.5 rounded-full border px-3.5 py-1.5 text-xs font-semibold transition-colors",
                section === s.key ? "border-accent/50 bg-accent/15 text-accent" : "border-border/60 text-muted-foreground hover:text-foreground")}>
              {s.icon}{s.label}
            </button>
          ))}
        </div>

        {tickets === null ? (
          <div className="grid place-items-center py-20"><Loader2 className="size-5 animate-spin text-accent" /></div>
        ) : section === "dashboard" ? (
          <DashboardView kpis={kpis} enriched={enriched} />
        ) : section === "tickets" ? (
          <TicketsView
            tickets={visibleTickets} stageFilter={stageFilter} setStageFilter={setStageFilter} stageCount={stageCount}
            q={q} setQ={setQ} onOpen={setActiveId} on360={(uid, name) => setC360({ userId: uid, name })} onAi={setAiTicket}
            onStatus={(id, st) => update(id, { status: st })} onPriority={(id, p) => update(id, { priority: priorityToDb(p) })}
          />
        ) : section === "refunds" ? (
          <RefundsView refunds={refunds} />
        ) : (
          <ReturnsView returns={returns} />
        )}
      </div>

      {activeId && user && <ThreadSheet ticketId={activeId} userId={user.id} isStaff onClose={() => setActiveId(null)} />}
      {c360 && <Customer360Sheet userId={c360.userId} name={c360.name} onClose={() => setC360(null)} />}
      {aiTicket && <AiAssistSheet ticketId={aiTicket} onClose={() => setAiTicket(null)} />}
    </AdminShell>
  );
}

// ── Dashboard ────────────────────────────────────────────────────────────────
function DashboardView({ kpis, enriched }: { kpis: ReturnType<typeof computeSupportKpis>; enriched: Enriched[] }) {
  const critical = enriched.filter((e) => e.sla.critical).slice(0, 6);
  const escalations = enriched.filter((e) => e.escalations.length && e.stage !== "resolved" && e.stage !== "closed").slice(0, 6);
  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-2.5">
        <Kpi label="Open" value={kpis.open} icon={<Inbox className="size-4" />} />
        <Kpi label="Pending Customer" value={kpis.pendingCustomer} />
        <Kpi label="Awaiting Staff" value={kpis.awaitingStaff} tone={kpis.awaitingStaff ? "amber" : undefined} />
        <Kpi label="Escalated" value={kpis.escalated} icon={<Flame className="size-4" />} tone={kpis.escalated ? "destructive" : undefined} />
        <Kpi label="Resolved Today" value={kpis.resolvedToday} tone="emerald" />
        <KpiText label="Avg Response" value={hrs(kpis.avgResponseH)} icon={<Clock className="size-4" />} />
        <KpiText label="Avg Resolution" value={hrs(kpis.avgResolutionH)} />
        <KpiText label="SLA Compliance" value={`${kpis.slaCompliance}%`} tone={kpis.slaCompliance >= 90 ? "emerald" : kpis.slaCompliance >= 70 ? "amber" : "destructive"} />
        <KpiText label="CSAT (within SLA)" value={kpis.csat == null ? "—" : `${kpis.csat}%`} />
        <Kpi label="Overdue" value={kpis.overdue} icon={<AlertTriangle className="size-4" />} tone={kpis.overdue ? "destructive" : undefined} />
      </div>

      <div className="grid lg:grid-cols-2 gap-4">
        <Panel title="Critical SLA tickets" icon={<AlertTriangle className="size-4 text-destructive" />}>
          {critical.length === 0 ? <Empty text="No critical tickets." /> : critical.map((e) => (
            <MiniRow key={e.ticket.id} title={e.ticket.subject} sub={`${e.customerName} · ${PRIORITY_LABEL[e.sla.priority]} · waiting ${hrs(e.sla.awaitingStaffH)}`} tone="destructive" />
          ))}
        </Panel>
        <Panel title="Auto-escalation signals" icon={<Flame className="size-4 text-amber-400" />}>
          {escalations.length === 0 ? <Empty text="No escalation signals." /> : escalations.map((e) => (
            <MiniRow key={e.ticket.id} title={e.ticket.subject} sub={`${e.customerName} · ${e.escalations.map((r) => ESCALATION_LABEL[r]).join(", ")}`} tone="amber" />
          ))}
        </Panel>
      </div>
    </div>
  );
}

// ── Tickets pipeline ─────────────────────────────────────────────────────────
function TicketsView(props: {
  tickets: Enriched[];
  stageFilter: TicketStage | "all" | "overdue"; setStageFilter: (s: TicketStage | "all" | "overdue") => void;
  stageCount: (s: TicketStage | "all" | "overdue") => number;
  q: string; setQ: (v: string) => void;
  onOpen: (id: string) => void; on360: (uid: string, name: string) => void; onAi: (id: string) => void;
  onStatus: (id: string, s: TicketStage) => void; onPriority: (id: string, p: Priority) => void;
}) {
  const { tickets, stageFilter, setStageFilter, stageCount, q, setQ } = props;
  const FILTERS: (TicketStage | "all" | "overdue")[] = ["all", "overdue", ...STAGE_ORDER];
  return (
    <div className="space-y-4">
      <div className="card-premium rounded-2xl p-3 space-y-3">
        <div className="relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 size-3.5 text-muted-foreground" />
          <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search subject, customer, ticket / order ID…"
            className="w-full rounded-xl border border-border bg-background/60 pl-9 pr-9 py-2 text-sm outline-none focus:border-accent/50" />
          {q && <button onClick={() => setQ("")} className="absolute right-3 top-1/2 -translate-y-1/2"><X className="size-4 text-muted-foreground" /></button>}
        </div>
        <div className="flex flex-wrap gap-1.5">
          {FILTERS.map((f) => (
            <button key={f} onClick={() => setStageFilter(f)}
              className={cn("rounded-full border px-3 py-1.5 text-xs font-medium transition-colors",
                stageFilter === f ? "border-accent/50 bg-accent/15 text-accent" : "border-border/60 text-muted-foreground hover:text-foreground")}>
              {f === "all" ? "All" : f === "overdue" ? "Overdue" : STAGE_LABEL[f as TicketStage]} <span className="opacity-60 tabular-nums">{stageCount(f)}</span>
            </button>
          ))}
        </div>
      </div>

      {tickets.length === 0 ? (
        <div className="card-premium rounded-2xl py-16 text-center">
          <MessageSquare className="size-8 mx-auto mb-3 text-muted-foreground" />
          <p className="text-sm font-semibold">No tickets in this view</p>
        </div>
      ) : (
        <div className="space-y-3">
          {tickets.map((e) => (
            <TicketCard key={e.ticket.id} e={e}
              onOpen={() => props.onOpen(e.ticket.id)} on360={() => props.on360(e.ticket.user_id, e.customerName)} onAi={() => props.onAi(e.ticket.id)}
              onStatus={(st) => props.onStatus(e.ticket.id, st)} onPriority={(p) => props.onPriority(e.ticket.id, p)} />
          ))}
        </div>
      )}
    </div>
  );

  // local alias to avoid prop drilling user_id name
  function userName(_e: Enriched) { return _e.customerName; }
}

function TicketCard({ e, onOpen, on360, onAi, onStatus, onPriority }: {
  e: Enriched; onOpen: () => void; on360: () => void; onAi: () => void;
  onStatus: (s: TicketStage) => void; onPriority: (p: Priority) => void;
}) {
  const { ticket, stage, sla, escalations, customerName } = e;
  return (
    <div className={cn("card-premium rounded-2xl p-4 md:p-5", sla.critical && "border-destructive/40")}>
      <div className="flex items-start justify-between flex-wrap gap-2 mb-2">
        <button onClick={onOpen} className="text-left group min-w-0 flex items-start gap-3 flex-1">
          <span className="size-9 mt-0.5 grid place-items-center rounded-xl bg-white/[0.04] text-muted-foreground group-hover:text-accent transition-colors shrink-0"><MessageSquare className="size-4" /></span>
          <div className="min-w-0">
            <p className="text-sm font-medium group-hover:text-accent transition-colors truncate">{ticket.subject}</p>
            <p className="font-mono text-[11px] text-muted-foreground mt-0.5 truncate">
              #{ticket.id.slice(0, 8)} · {customerName} · {ticket.category}{ticket.market_region ? ` · ${ticket.market_region}` : ""} · {fmtTime(ticket.last_message_at)}
            </p>
          </div>
        </button>
        <div className="flex flex-col items-end gap-1 shrink-0">
          <span className={cn("rounded-full px-2 py-0.5 text-[10px] font-mono uppercase tracking-wider border", STAGE_CLS[stage])}>{STAGE_LABEL[stage]}</span>
          <span className={cn("rounded-full px-2 py-0.5 text-[10px] font-mono uppercase tracking-wider border", PRIORITY_CLS[sla.priority])}>{PRIORITY_LABEL[sla.priority]}</span>
        </div>
      </div>

      <div className="flex flex-wrap items-center gap-1.5 mb-3">
        {sla.overdue && <Tag tone="destructive" icon={<AlertTriangle className="size-3" />}>Overdue · waited {hrs(sla.awaitingStaffH)}</Tag>}
        {sla.breached && !sla.overdue && <Tag tone="amber" icon={<Clock className="size-3" />}>SLA breached</Tag>}
        {sla.firstResponseH != null && <Tag tone="muted">1st reply {hrs(sla.firstResponseH)}</Tag>}
        {escalations.map((r) => <Tag key={r} tone="amber" icon={<Flame className="size-3" />}>{ESCALATION_LABEL[r]}</Tag>)}
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <select value={stage} onChange={(ev) => onStatus(ev.target.value as TicketStage)}
          className="bg-background border border-border rounded-lg px-2.5 py-1.5 text-[11px] focus:outline-none focus:border-accent">
          {STAGE_ORDER.map((s) => <option key={s} value={s}>{STAGE_LABEL[s]}</option>)}
        </select>
        <select value={sla.priority} onChange={(ev) => onPriority(ev.target.value as Priority)}
          className="bg-background border border-border rounded-lg px-2.5 py-1.5 text-[11px] focus:outline-none focus:border-accent">
          {PRIORITIES.map((p) => <option key={p} value={p}>{PRIORITY_LABEL[p]}</option>)}
        </select>
        <button onClick={onAi} className="inline-flex items-center gap-1 rounded-lg border border-accent/30 text-accent px-2.5 py-1.5 text-[11px] font-medium hover:bg-accent/10">
          <Sparkles className="size-3" /> AI Assist
        </button>
        <button onClick={on360} className="inline-flex items-center gap-1 rounded-lg border border-border px-2.5 py-1.5 text-[11px] font-medium hover:border-accent/40">
          <User className="size-3" /> Customer 360
        </button>
      </div>
    </div>
  );
}

// ── Refunds command center ───────────────────────────────────────────────────
function RefundsView({ refunds }: { refunds: RefundRow[] }) {
  const groups = groupByStatus(refunds);
  const refundsByOrder = new Map<string, number>();
  for (const r of refunds) refundsByOrder.set(r.order_id, (refundsByOrder.get(r.order_id) ?? 0) + 1);
  const buckets = ["pending", "approved", "processing", "completed", "rejected", "failed"];
  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-2.5">
        {buckets.map((b) => <Kpi key={b} label={b[0].toUpperCase() + b.slice(1)} value={(groups[b] ?? []).length} />)}
      </div>
      {refunds.length === 0 ? <Empty text="No refunds recorded." card /> : (
        <div className="space-y-2">
          {refunds.slice(0, 50).map((r) => {
            const risk = refundRisk(r, refundsByOrder, HIGH_VALUE_ORDER);
            return (
              <div key={r.id} className="card-premium rounded-xl p-3 flex items-center gap-3 flex-wrap">
                <Banknote className="size-4 text-muted-foreground shrink-0" />
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-medium tabular-nums">{money(r.amount, r.currency)}</p>
                  <p className="font-mono text-[11px] text-muted-foreground truncate">order #{r.order_id.slice(0, 8)} · {r.reason ?? "no reason"} · {fmtTime(r.created_at)}</p>
                </div>
                <span className="rounded-full px-2 py-0.5 text-[10px] font-mono uppercase border border-border bg-muted/30">{r.status}</span>
                <span className={cn("rounded-full px-2 py-0.5 text-[10px] font-mono uppercase border",
                  risk.tier === "high" ? "text-destructive border-destructive/30 bg-destructive/10" : risk.tier === "medium" ? "text-amber-400 border-amber-400/30 bg-amber-400/10" : "text-muted-foreground border-border")}>
                  risk {risk.score}
                </span>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

// ── Returns command center ───────────────────────────────────────────────────
function ReturnsView({ returns }: { returns: ReturnRow[] }) {
  const groups = groupByStatus(returns);
  const buckets = ["requested", "approved", "in_transit", "received", "completed", "rejected"];
  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-2.5">
        {buckets.map((b) => <Kpi key={b} label={b.replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase())} value={(groups[b] ?? []).length} />)}
      </div>
      {returns.length === 0 ? <Empty text="No returns recorded." card /> : (
        <div className="space-y-2">
          {returns.slice(0, 50).map((r) => (
            <div key={r.id} className="card-premium rounded-xl p-3 flex items-center gap-3 flex-wrap">
              <RotateCcw className="size-4 text-muted-foreground shrink-0" />
              <div className="min-w-0 flex-1">
                <p className="text-sm font-medium truncate">{r.reason ?? "Return request"}</p>
                <p className="font-mono text-[11px] text-muted-foreground truncate">order #{r.order_id.slice(0, 8)} · {fmtTime(r.created_at)}{r.refund_amount ? ` · refund ${money(r.refund_amount, null)}` : ""}</p>
              </div>
              {r.refund_status && <span className="rounded-full px-2 py-0.5 text-[10px] font-mono uppercase border border-border bg-muted/30">refund {r.refund_status}</span>}
              <span className="rounded-full px-2 py-0.5 text-[10px] font-mono uppercase border border-border bg-muted/30">{r.status}</span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

// ── Customer 360 sheet ───────────────────────────────────────────────────────
function Customer360Sheet({ userId, name, onClose }: { userId: string; name: string; onClose: () => void }) {
  const [data, setData] = useState<null | {
    profile: { full_name: string | null; country: string | null; market_region: string | null; created_at: string } | null;
    orders: number; ltv: number; refunds: number; refundTotal: number; returns: number; activeShipments: number;
    notifications: { id: string; title: string; created_at: string }[];
    tickets: { id: string; subject: string; status: string; created_at: string }[];
    fraud: number;
  }>(null);

  useEffect(() => {
    let alive = true;
    (async () => {
      const [pf, ord, ref, ret, ship, notif, tk, fr] = await Promise.all([
        supabase.from("profiles").select("full_name,country,market_region,created_at").eq("id", userId).maybeSingle(),
        supabase.from("orders").select("total,currency,status").eq("user_id", userId),
        supabase.from("refunds").select("amount,order_id,orders!inner(user_id)").eq("orders.user_id", userId),
        supabase.from("returns").select("id").eq("user_id", userId),
        supabase.from("shipments").select("id,status").eq("user_id", userId),
        supabase.from("notifications").select("id,title,created_at").eq("user_id", userId).order("created_at", { ascending: false }).limit(6),
        supabase.from("support_tickets").select("id,subject,status,created_at").eq("user_id", userId).order("created_at", { ascending: false }).limit(6),
        supabase.from("fraud_alerts").select("id").eq("user_id", userId),
      ]);
      if (!alive) return;
      const orders = (ord.data as { total: number; status: string }[]) ?? [];
      const refundsArr = (ref.data as { amount: number }[]) ?? [];
      const shipArr = (ship.data as { status: string }[]) ?? [];
      setData({
        profile: (pf.data as never) ?? null,
        orders: orders.length,
        ltv: orders.reduce((a, b) => a + (b.total || 0), 0),
        refunds: refundsArr.length,
        refundTotal: refundsArr.reduce((a, b) => a + (b.amount || 0), 0),
        returns: ((ret.data as unknown[]) ?? []).length,
        activeShipments: shipArr.filter((s) => !["delivered", "cancelled", "returned"].includes(s.status)).length,
        notifications: (notif.data as { id: string; title: string; created_at: string }[]) ?? [],
        tickets: (tk.data as { id: string; subject: string; status: string; created_at: string }[]) ?? [],
        fraud: ((fr.data as unknown[]) ?? []).length,
      });
    })();
    return () => { alive = false; };
  }, [userId]);

  return (
    <Sheet title="Customer 360" subtitle={name} onClose={onClose}>
      {!data ? <Loader2 className="size-5 animate-spin text-accent mx-auto my-12" /> : (
        <div className="space-y-4">
          <div className="grid grid-cols-3 gap-2">
            <Stat label="Orders" value={String(data.orders)} icon={<Package className="size-3.5" />} />
            <Stat label="Lifetime Value" value={money(data.ltv, null)} icon={<TrendingUp className="size-3.5" />} />
            <Stat label="Refunds" value={`${data.refunds}`} icon={<Banknote className="size-3.5" />} />
            <Stat label="Returns" value={String(data.returns)} icon={<RotateCcw className="size-3.5" />} />
            <Stat label="Active Shipments" value={String(data.activeShipments)} icon={<Truck className="size-3.5" />} />
            <Stat label="Fraud Signals" value={String(data.fraud)} icon={<ShieldAlert className="size-3.5" />} tone={data.fraud ? "destructive" : undefined} />
          </div>
          {data.profile && (
            <p className="text-xs text-muted-foreground">
              {data.profile.market_region ?? data.profile.country ?? "—"} · member since {data.profile.created_at ? new Date(data.profile.created_at).toLocaleDateString() : "—"}
            </p>
          )}
          <Section360 title="Recent notifications" icon={<Bell className="size-3.5" />}>
            {data.notifications.length === 0 ? <Empty text="None" /> : data.notifications.map((n) => (
              <p key={n.id} className="text-xs truncate"><span className="text-muted-foreground">{fmtTime(n.created_at)}</span> · {n.title}</p>
            ))}
          </Section360>
          <Section360 title="Support history" icon={<MessageSquare className="size-3.5" />}>
            {data.tickets.length === 0 ? <Empty text="None" /> : data.tickets.map((t) => (
              <p key={t.id} className="text-xs truncate"><span className="text-muted-foreground">{t.status}</span> · {t.subject}</p>
            ))}
          </Section360>
        </div>
      )}
    </Sheet>
  );
}

// ── AI assist sheet ──────────────────────────────────────────────────────────
function AiAssistSheet({ ticketId, onClose }: { ticketId: string; onClose: () => void }) {
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [res, setRes] = useState<null | { sentiment: string; sentiment_summary: string; suggested_reply: string; recommendation: string; agent_guidance: string }>(null);

  useEffect(() => {
    let alive = true;
    setLoading(true); setError(null);
    suggestSupportReply({ data: { ticketId } })
      .then((r) => { if (alive) setRes(r.suggestion); })
      .catch((e) => { if (alive) setError(e instanceof Error ? e.message : "AI request failed"); })
      .finally(() => { if (alive) setLoading(false); });
    return () => { alive = false; };
  }, [ticketId]);

  return (
    <Sheet title="AI Assist" subtitle="Grounded in this ticket's real data" onClose={onClose}>
      {loading ? <Loader2 className="size-5 animate-spin text-accent mx-auto my-12" /> :
        error ? <p className="text-sm text-destructive">{error}</p> :
        res && (
          <div className="space-y-4">
            <div className="card-premium rounded-xl p-3">
              <p className="text-[10px] uppercase tracking-widest text-muted-foreground mb-1">Customer sentiment</p>
              <p className="text-sm font-semibold capitalize">{res.sentiment}</p>
              <p className="text-xs text-muted-foreground mt-1">{res.sentiment_summary}</p>
            </div>
            <div>
              <div className="flex items-center justify-between mb-1">
                <p className="text-[10px] uppercase tracking-widest text-muted-foreground">Suggested reply</p>
                <button onClick={() => { navigator.clipboard.writeText(res.suggested_reply); toast.success("Copied"); }}
                  className="inline-flex items-center gap-1 text-[11px] text-accent hover:underline"><Copy className="size-3" /> Copy</button>
              </div>
              <div className="card-premium rounded-xl p-3 text-sm whitespace-pre-wrap">{res.suggested_reply}</div>
            </div>
            <div className="card-premium rounded-xl p-3">
              <p className="text-[10px] uppercase tracking-widest text-muted-foreground mb-1">Recommended action</p>
              <p className="text-sm">{res.recommendation}</p>
            </div>
            <div className="rounded-xl border border-amber-400/30 bg-amber-400/5 p-3">
              <p className="text-[10px] uppercase tracking-widest text-amber-400/80 mb-1">Agent guidance</p>
              <p className="text-xs text-muted-foreground">{res.agent_guidance}</p>
            </div>
            <p className="text-[10px] text-muted-foreground">Review before sending — AI uses only real ticket data but verify facts.</p>
          </div>
        )}
    </Sheet>
  );
}

// ── Shared primitives ────────────────────────────────────────────────────────
function Sheet({ title, subtitle, onClose, children }: { title: string; subtitle?: string; onClose: () => void; children: React.ReactNode }) {
  return (
    <div className="fixed inset-0 z-50 flex justify-end">
      <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" onClick={onClose} />
      <div className="relative w-full max-w-md h-full overflow-y-auto bg-background border-l border-border p-5 shadow-2xl">
        <div className="flex items-start justify-between mb-4">
          <div>
            <h2 className="text-lg font-semibold">{title}</h2>
            {subtitle && <p className="text-xs text-muted-foreground">{subtitle}</p>}
          </div>
          <button onClick={onClose} className="rounded-lg p-1.5 hover:bg-muted"><X className="size-4" /></button>
        </div>
        {children}
      </div>
    </div>
  );
}

function Kpi({ label, value, icon, tone }: { label: string; value: number; icon?: React.ReactNode; tone?: "emerald" | "amber" | "destructive" }) {
  const t = tone === "emerald" ? "text-emerald-400" : tone === "amber" ? "text-amber-400" : tone === "destructive" ? "text-destructive" : "";
  return (
    <div className="card-premium rounded-2xl p-4">
      <div className="flex items-center justify-between text-muted-foreground mb-1"><span className="text-[10px] uppercase tracking-widest leading-tight">{label}</span>{icon}</div>
      <div className={cn("text-2xl font-semibold tabular-nums", t)}>{value.toLocaleString("en-IN")}</div>
    </div>
  );
}
function KpiText({ label, value, icon, tone }: { label: string; value: string; icon?: React.ReactNode; tone?: "emerald" | "amber" | "destructive" }) {
  const t = tone === "emerald" ? "text-emerald-400" : tone === "amber" ? "text-amber-400" : tone === "destructive" ? "text-destructive" : "";
  return (
    <div className="card-premium rounded-2xl p-4">
      <div className="flex items-center justify-between text-muted-foreground mb-1"><span className="text-[10px] uppercase tracking-widest leading-tight">{label}</span>{icon}</div>
      <div className={cn("text-2xl font-semibold tabular-nums", t)}>{value}</div>
    </div>
  );
}
function Stat({ label, value, icon, tone }: { label: string; value: string; icon?: React.ReactNode; tone?: "destructive" }) {
  return (
    <div className="rounded-xl border border-border/50 bg-background/40 p-2.5">
      <div className="flex items-center justify-between text-muted-foreground mb-0.5"><span className="text-[9px] uppercase tracking-widest">{label}</span>{icon}</div>
      <div className={cn("text-sm font-semibold tabular-nums", tone === "destructive" && "text-destructive")}>{value}</div>
    </div>
  );
}
function Panel({ title, icon, children }: { title: string; icon: React.ReactNode; children: React.ReactNode }) {
  return (
    <div className="card-premium rounded-2xl p-4">
      <div className="flex items-center gap-2 mb-3">{icon}<span className="text-sm font-semibold">{title}</span></div>
      <div className="space-y-2">{children}</div>
    </div>
  );
}
function Section360({ title, icon, children }: { title: string; icon: React.ReactNode; children: React.ReactNode }) {
  return (
    <div>
      <div className="flex items-center gap-1.5 mb-1.5 text-muted-foreground">{icon}<span className="text-[10px] uppercase tracking-widest">{title}</span></div>
      <div className="space-y-1">{children}</div>
    </div>
  );
}
function MiniRow({ title, sub, tone }: { title: string; sub: string; tone: "destructive" | "amber" }) {
  return (
    <div className="flex items-center gap-2 border-b border-border/40 pb-2 last:border-0">
      <span className={cn("size-1.5 rounded-full shrink-0", tone === "destructive" ? "bg-destructive" : "bg-amber-400")} />
      <div className="min-w-0 flex-1">
        <p className="text-xs font-medium truncate">{title}</p>
        <p className="text-[11px] text-muted-foreground truncate">{sub}</p>
      </div>
      <ChevronRight className="size-3.5 text-muted-foreground shrink-0" />
    </div>
  );
}
function Tag({ children, tone, icon }: { children: React.ReactNode; tone: "destructive" | "amber" | "muted"; icon?: React.ReactNode }) {
  const cls = tone === "destructive" ? "text-destructive border-destructive/30 bg-destructive/10" : tone === "amber" ? "text-amber-400 border-amber-400/30 bg-amber-400/10" : "text-muted-foreground border-border bg-muted/20";
  return <span className={cn("inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-[10px] font-medium", cls)}>{icon}{children}</span>;
}
function Empty({ text, card }: { text: string; card?: boolean }) {
  if (card) return <div className="card-premium rounded-2xl py-12 text-center text-sm text-muted-foreground">{text}</div>;
  return <p className="text-xs text-muted-foreground">{text}</p>;
}
