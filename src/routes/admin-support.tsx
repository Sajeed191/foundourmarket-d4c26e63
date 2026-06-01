import { createFileRoute } from "@tanstack/react-router";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  Loader2, LifeBuoy, MessageSquare, Search, X, Gauge, Inbox, RotateCcw,
  Banknote, AlertTriangle, Clock, Flame, Sparkles, User, Package, Truck,
  Bell, ShieldAlert, Copy, ChevronRight, TrendingUp,
  Check, Ban, FileText, Mail, Phone, MapPin, Users, Activity, Radio,
} from "lucide-react";
import { AdminShell, logActivity } from "@/components/admin/AdminShell";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/lib/auth";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import { ThreadSheet } from "@/routes/account_.support";
import { notifySupportEvent } from "@/lib/support.functions";
import { useSupportSettings, updateSupportSettings, type SupportStatusMode } from "@/lib/use-support-settings";
import { suggestSupportReply } from "@/lib/support-ai.functions";
import { refundActionFn, returnActionFn } from "@/lib/support-actions.functions";
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

type Section = "dashboard" | "tickets" | "refunds" | "returns" | "agents" | "warroom" | "settings";

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
      supabase.from("fraud_alerts").select("subject_id,subject_type").limit(1000),
    ]);
    if (t.error) { toast.error(t.error.message); setTickets([]); return; }
    setTickets((t.data as TicketRow[]) ?? []);
    setMessages((m.data as MessageRow[]) ?? []);
    setOrders((o.data as OrderLite[]) ?? []);
    setRefunds((rf.data as RefundRow[]) ?? []);
    setReturns((rt.data as ReturnRow[]) ?? []);
    setProfiles(new Map(((pf.data as { id: string; full_name: string | null }[]) ?? []).map((p) => [p.id, p.full_name ?? "Customer"])));
    setFailedOrders(new Set(((sh.data as { order_id: string }[]) ?? []).map((s) => s.order_id)));
    setFraudUsers(new Set(((fr.data as { subject_id: string | null; subject_type: string | null }[]) ?? []).filter((f) => f.subject_type === "user").map((f) => f.subject_id).filter(Boolean) as string[]));
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
    { key: "agents", label: "Agents", icon: <Users className="size-3.5" /> },
    { key: "warroom", label: "War Room", icon: <Radio className="size-3.5" /> },
    { key: "settings", label: "Settings", icon: <Gauge className="size-3.5" /> },
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
          <RefundsView refunds={refunds} orders={orders} onChanged={load} />
        ) : section === "returns" ? (
          <ReturnsView returns={returns} onChanged={load} />
        ) : section === "agents" ? (
          <AgentPerformanceView enriched={enriched} profiles={profiles} />
        ) : section === "settings" ? (
          <SupportSettingsView />
        ) : (
          <WarRoomView enriched={enriched} refunds={refunds} returns={returns} fraudCount={fraudUsers.size} />
        )}
      </div>

      {activeId && user && <ThreadSheet ticketId={activeId} userId={user.id} isStaff onClose={() => setActiveId(null)} />}
      {c360 && <Customer360Sheet userId={c360.userId} name={c360.name} onClose={() => setC360(null)} />}
      {aiTicket && <AiAssistSheet ticketId={aiTicket} onClose={() => setAiTicket(null)} />}
    </AdminShell>
  );
}

// ── Support Settings ──────────────────────────────────────────────────────────
function SupportSettingsView() {
  const { settings } = useSupportSettings();
  const [status, setStatus] = useState<SupportStatusMode>(settings.supportStatus);
  const [minutes, setMinutes] = useState<number>(settings.responseMinutes);
  const [numbers, setNumbers] = useState<string>(settings.whatsappNumbers.join("\n"));
  const [saving, setSaving] = useState(false);
  const [hydrated, setHydrated] = useState(false);

  useEffect(() => {
    if (hydrated) return;
    setStatus(settings.supportStatus);
    setMinutes(settings.responseMinutes);
    setNumbers(settings.whatsappNumbers.join("\n"));
    setHydrated(true);
  }, [settings, hydrated]);

  const save = async () => {
    setSaving(true);
    try {
      const list = numbers.split("\n").map((n) => n.trim()).filter(Boolean).slice(0, 10);
      await updateSupportSettings({
        support_status: status,
        support_response_minutes: Math.max(1, Math.min(600, Math.round(minutes) || 1)),
        support_whatsapp_numbers: list,
      });
      toast.success("Support settings saved");
    } catch (e: any) {
      toast.error(e?.message ?? "Failed to save");
    } finally {
      setSaving(false);
    }
  };

  const STATUS_OPTS: { key: SupportStatusMode; label: string }[] = [
    { key: "auto", label: "Auto (time-based)" },
    { key: "online", label: "All channels online" },
    { key: "high_volume", label: "High volume" },
  ];

  return (
    <div className="max-w-xl space-y-5 rounded-2xl border border-border/60 bg-card/40 p-5">
      <div>
        <p className="text-sm font-semibold">Help Center support settings</p>
        <p className="text-xs text-muted-foreground mt-0.5">Controls the live status banner, response time and WhatsApp numbers shown on the public Help Center.</p>
      </div>

      <div className="space-y-2">
        <label className="text-[11px] font-mono uppercase tracking-widest text-muted-foreground">Status banner</label>
        <div className="flex flex-wrap gap-2">
          {STATUS_OPTS.map((o) => (
            <button key={o.key} onClick={() => setStatus(o.key)} type="button"
              className={cn("rounded-full px-3 py-1.5 text-xs ring-1 transition",
                status === o.key ? "bg-accent/15 text-accent ring-accent/40" : "bg-white/[0.03] text-muted-foreground ring-border hover:ring-accent/30")}>
              {o.label}
            </button>
          ))}
        </div>
      </div>

      <div className="space-y-2">
        <label className="text-[11px] font-mono uppercase tracking-widest text-muted-foreground">Average response time (minutes)</label>
        <input type="number" min={1} max={600} value={minutes} onChange={(e) => setMinutes(Number(e.target.value))}
          className="w-32 bg-white/[0.04] border border-border rounded-xl px-3 py-2 text-sm focus:outline-none focus:border-accent/60" />
      </div>

      <div className="space-y-2">
        <label className="text-[11px] font-mono uppercase tracking-widest text-muted-foreground">WhatsApp numbers (one per line)</label>
        <textarea value={numbers} onChange={(e) => setNumbers(e.target.value)} rows={4}
          placeholder="+91 97458 44213"
          className="w-full bg-white/[0.04] border border-border rounded-xl px-3 py-2.5 text-sm font-mono focus:outline-none focus:border-accent/60 resize-none" />
      </div>

      <button onClick={save} disabled={saving}
        className="bg-accent text-accent-foreground rounded-full px-6 py-2.5 text-xs uppercase tracking-widest font-bold disabled:opacity-50 hover:brightness-110 transition-all inline-flex items-center gap-2">
        {saving ? <><Loader2 className="size-4 animate-spin" /> Saving…</> : "Save settings"}
      </button>
    </div>
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
type RefundAction = "approve" | "reject" | "escalate" | "processing" | "complete" | "request_evidence";

function RefundsView({ refunds, orders, onChanged }: { refunds: RefundRow[]; orders: OrderLite[]; onChanged: () => void }) {
  const [busy, setBusy] = useState<string | null>(null);
  const groups = groupByStatus(refunds);
  const refundsByOrder = new Map<string, number>();
  for (const r of refunds) refundsByOrder.set(r.order_id, (refundsByOrder.get(r.order_id) ?? 0) + 1);
  const buckets = ["pending", "approved", "processing", "completed", "rejected", "evidence_requested"];

  // Real revenue impact: total approved/processing/completed refund value vs paid revenue.
  const impactStatuses = new Set(["approved", "processing", "completed"]);
  const refundValue = refunds.filter((r) => impactStatuses.has((r.status ?? "").toLowerCase())).reduce((a, b) => a + (b.amount || 0), 0);
  const paidOrders = orders.filter((o) => ["paid", "succeeded", "delivered", "shipped", "completed"].includes((o.payment_status ?? o.status ?? "").toLowerCase()));
  const paidRevenue = paidOrders.reduce((a, b) => a + (b.total || 0), 0);
  const refundRate = paidOrders.length ? Math.round((refunds.length / paidOrders.length) * 1000) / 10 : 0;
  const revenueImpact = paidRevenue ? Math.round((refundValue / paidRevenue) * 1000) / 10 : 0;

  async function act(refundId: string, action: RefundAction) {
    setBusy(refundId + action);
    try {
      await refundActionFn({ data: { refundId, action } });
      logActivity("refund_action", "refund", refundId, { action });
      toast.success(`Refund ${action.replace("_", " ")}`);
      onChanged();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Action failed");
    } finally {
      setBusy(null);
    }
  }

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-2.5">
        {buckets.map((b) => <Kpi key={b} label={b.replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase())} value={(groups[b] ?? []).length} />)}
      </div>
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-2.5">
        <KpiText label="Refund Value" value={money(refundValue, orders[0]?.currency ?? null)} icon={<Banknote className="size-4" />} />
        <KpiText label="Refund Rate" value={`${refundRate}%`} tone={refundRate >= 10 ? "destructive" : refundRate >= 5 ? "amber" : "emerald"} />
        <KpiText label="Revenue Impact" value={`${revenueImpact}%`} icon={<TrendingUp className="size-4" />} tone={revenueImpact >= 10 ? "destructive" : revenueImpact >= 5 ? "amber" : undefined} />
      </div>
      {refunds.length === 0 ? <Empty text="No refunds recorded." card /> : (
        <div className="space-y-2">
          {refunds.slice(0, 50).map((r) => {
            const risk = refundRisk(r, refundsByOrder, HIGH_VALUE_ORDER);
            const st = (r.status ?? "").toLowerCase();
            const settled = ["rejected", "completed"].includes(st);
            return (
              <div key={r.id} className="card-premium rounded-xl p-3 space-y-2.5">
                <div className="flex items-center gap-3 flex-wrap">
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
                {!settled && (
                  <div className="flex flex-wrap gap-1.5">
                    <ActBtn label="Approve" icon={<Check className="size-3" />} tone="emerald" loading={busy === r.id + "approve"} onClick={() => act(r.id, "approve")} />
                    <ActBtn label="Reject" icon={<Ban className="size-3" />} tone="destructive" loading={busy === r.id + "reject"} onClick={() => act(r.id, "reject")} />
                    <ActBtn label="Processing" icon={<Clock className="size-3" />} loading={busy === r.id + "processing"} onClick={() => act(r.id, "processing")} />
                    <ActBtn label="Complete" icon={<Check className="size-3" />} tone="emerald" loading={busy === r.id + "complete"} onClick={() => act(r.id, "complete")} />
                    <ActBtn label="Escalate" icon={<Flame className="size-3" />} tone="amber" loading={busy === r.id + "escalate"} onClick={() => act(r.id, "escalate")} />
                    <ActBtn label="Request Evidence" icon={<FileText className="size-3" />} loading={busy === r.id + "request_evidence"} onClick={() => act(r.id, "request_evidence")} />
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

// ── Returns command center ───────────────────────────────────────────────────
type ReturnAction = "approve" | "reject" | "generate_label" | "received" | "refunded";

function ReturnsView({ returns, onChanged }: { returns: ReturnRow[]; onChanged: () => void }) {
  const [busy, setBusy] = useState<string | null>(null);
  const groups = groupByStatus(returns);
  const buckets = ["requested", "approved", "received", "inspected", "refunded", "rejected"];

  async function act(returnId: string, action: ReturnAction) {
    setBusy(returnId + action);
    try {
      await returnActionFn({ data: { returnId, action } });
      logActivity("return_action", "return", returnId, { action });
      toast.success(`Return ${action.replace("_", " ")}`);
      onChanged();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Action failed");
    } finally {
      setBusy(null);
    }
  }

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-2.5">
        {buckets.map((b) => <Kpi key={b} label={b.replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase())} value={(groups[b] ?? []).length} />)}
      </div>
      {returns.length === 0 ? <Empty text="No returns recorded." card /> : (
        <div className="space-y-2">
          {returns.slice(0, 50).map((r) => {
            const st = (r.status ?? "").toLowerCase();
            const settled = ["rejected", "refunded"].includes(st);
            return (
              <div key={r.id} className="card-premium rounded-xl p-3 space-y-2.5">
                <div className="flex items-center gap-3 flex-wrap">
                  <RotateCcw className="size-4 text-muted-foreground shrink-0" />
                  <div className="min-w-0 flex-1">
                    <p className="text-sm font-medium truncate">{r.reason ?? "Return request"}</p>
                    <p className="font-mono text-[11px] text-muted-foreground truncate">order #{r.order_id.slice(0, 8)} · {fmtTime(r.created_at)}{r.refund_amount ? ` · refund ${money(r.refund_amount, null)}` : ""}</p>
                  </div>
                  {r.refund_status && <span className="rounded-full px-2 py-0.5 text-[10px] font-mono uppercase border border-border bg-muted/30">refund {r.refund_status}</span>}
                  <span className="rounded-full px-2 py-0.5 text-[10px] font-mono uppercase border border-border bg-muted/30">{r.status}</span>
                </div>
                {!settled && (
                  <div className="flex flex-wrap gap-1.5">
                    <ActBtn label="Approve" icon={<Check className="size-3" />} tone="emerald" loading={busy === r.id + "approve"} onClick={() => act(r.id, "approve")} />
                    <ActBtn label="Reject" icon={<Ban className="size-3" />} tone="destructive" loading={busy === r.id + "reject"} onClick={() => act(r.id, "reject")} />
                    <ActBtn label="Generate Label" icon={<FileText className="size-3" />} loading={busy === r.id + "generate_label"} onClick={() => act(r.id, "generate_label")} />
                    <ActBtn label="Mark Received" icon={<Package className="size-3" />} loading={busy === r.id + "received"} onClick={() => act(r.id, "received")} />
                    <ActBtn label="Mark Refunded" icon={<Banknote className="size-3" />} tone="emerald" loading={busy === r.id + "refunded"} onClick={() => act(r.id, "refunded")} />
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

// ── Agent performance dashboard (derived from real ticket assignment) ─────────
function AgentPerformanceView({ enriched, profiles }: { enriched: Enriched[]; profiles: Map<string, string> }) {
  const agents = useMemo(() => {
    const map = new Map<string, { closed: number; open: number; escalations: number; responses: number[]; resolutions: number[] }>();
    for (const e of enriched) {
      const id = e.ticket.assigned_to;
      if (!id) continue;
      const a = map.get(id) ?? { closed: 0, open: 0, escalations: 0, responses: [], resolutions: [] };
      if (e.stage === "resolved" || e.stage === "closed") a.closed++;
      else a.open++;
      if (e.stage === "escalated" || e.escalations.length) a.escalations++;
      if (e.sla.firstResponseH != null) a.responses.push(e.sla.firstResponseH);
      if (e.sla.resolutionH != null) a.resolutions.push(e.sla.resolutionH);
      map.set(id, a);
    }
    const avg = (n: number[]) => (n.length ? Math.round((n.reduce((x, y) => x + y, 0) / n.length) * 10) / 10 : null);
    return [...map.entries()].map(([id, a]) => ({
      id, name: profiles.get(id) ?? `Agent ${id.slice(0, 6)}`,
      closed: a.closed, open: a.open, escalations: a.escalations,
      avgResponse: avg(a.responses), avgResolution: avg(a.resolutions),
    })).sort((x, y) => y.closed - x.closed);
  }, [enriched, profiles]);

  if (agents.length === 0) return <Empty text="No tickets are assigned to agents yet." card />;
  return (
    <div className="space-y-2">
      {agents.map((a) => (
        <div key={a.id} className="card-premium rounded-xl p-4">
          <div className="flex items-center gap-2.5 mb-3">
            <span className="size-8 grid place-items-center rounded-xl bg-accent/10 text-accent shrink-0"><User className="size-4" /></span>
            <p className="text-sm font-semibold truncate">{a.name}</p>
          </div>
          <div className="grid grid-cols-3 sm:grid-cols-5 gap-2">
            <Stat label="Closed" value={String(a.closed)} />
            <Stat label="Open" value={String(a.open)} />
            <Stat label="Escalations" value={String(a.escalations)} tone={a.escalations ? "destructive" : undefined} />
            <Stat label="Avg Response" value={hrs(a.avgResponse)} />
            <Stat label="Avg Resolution" value={hrs(a.avgResolution)} />
          </div>
        </div>
      ))}
    </div>
  );
}

// ── Realtime war room ─────────────────────────────────────────────────────────
function WarRoomView({ enriched, refunds, returns, fraudCount }: { enriched: Enriched[]; refunds: RefundRow[]; returns: ReturnRow[]; fraudCount: number }) {
  type Feed = { id: string; at: string; kind: string; tone: "destructive" | "amber" | "muted"; title: string; sub: string };
  const feed: Feed[] = [];
  for (const e of enriched) {
    feed.push({ id: "t" + e.ticket.id, at: e.ticket.last_message_at, kind: e.stage === "escalated" ? "Escalation" : "Ticket", tone: e.stage === "escalated" ? "destructive" : e.sla.overdue ? "amber" : "muted", title: e.ticket.subject, sub: `${e.customerName} · ${STAGE_LABEL[e.stage]}` });
  }
  for (const r of refunds) feed.push({ id: "r" + r.id, at: r.created_at, kind: "Refund", tone: "amber", title: money(r.amount, r.currency), sub: `order #${r.order_id.slice(0, 8)} · ${r.status}` });
  for (const r of returns) feed.push({ id: "rt" + r.id, at: r.created_at, kind: "Return", tone: "muted", title: r.reason ?? "Return request", sub: `order #${r.order_id.slice(0, 8)} · ${r.status}` });
  feed.sort((a, b) => +new Date(b.at) - +new Date(a.at));

  const newTickets = enriched.filter((e) => e.stage === "new").length;
  const escalations = enriched.filter((e) => e.stage === "escalated").length;
  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-2.5">
        <Kpi label="New Tickets" value={newTickets} icon={<Inbox className="size-4" />} />
        <Kpi label="Refund Requests" value={refunds.length} icon={<Banknote className="size-4" />} />
        <Kpi label="Return Requests" value={returns.length} icon={<RotateCcw className="size-4" />} />
        <Kpi label="Escalations" value={escalations} icon={<Flame className="size-4" />} tone={escalations ? "destructive" : undefined} />
        <Kpi label="Fraud Signals" value={fraudCount} icon={<ShieldAlert className="size-4" />} tone={fraudCount ? "destructive" : undefined} />
      </div>
      <Panel title="Live activity feed" icon={<Activity className="size-4 text-accent" />}>
        {feed.length === 0 ? <Empty text="No activity yet." /> : feed.slice(0, 40).map((f) => (
          <div key={f.id} className="flex items-center gap-2 border-b border-border/40 pb-2 last:border-0">
            <span className={cn("size-1.5 rounded-full shrink-0", f.tone === "destructive" ? "bg-destructive" : f.tone === "amber" ? "bg-amber-400" : "bg-muted-foreground")} />
            <span className="rounded-full px-2 py-0.5 text-[9px] font-mono uppercase border border-border bg-muted/30 shrink-0">{f.kind}</span>
            <div className="min-w-0 flex-1">
              <p className="text-xs font-medium truncate">{f.title}</p>
              <p className="text-[11px] text-muted-foreground truncate">{f.sub}</p>
            </div>
            <span className="text-[10px] text-muted-foreground shrink-0">{fmtTime(f.at)}</span>
          </div>
        ))}
      </Panel>
    </div>
  );
}

function ActBtn({ label, icon, tone, loading, onClick }: { label: string; icon: React.ReactNode; tone?: "emerald" | "destructive" | "amber"; loading?: boolean; onClick: () => void }) {
  const cls = tone === "emerald" ? "border-emerald-400/30 text-emerald-400 hover:bg-emerald-400/10"
    : tone === "destructive" ? "border-destructive/30 text-destructive hover:bg-destructive/10"
    : tone === "amber" ? "border-amber-400/30 text-amber-400 hover:bg-amber-400/10"
    : "border-border text-muted-foreground hover:border-accent/40 hover:text-foreground";
  return (
    <button disabled={loading} onClick={onClick}
      className={cn("inline-flex items-center gap-1 rounded-lg border px-2.5 py-1.5 text-[11px] font-medium transition-colors disabled:opacity-50", cls)}>
      {loading ? <Loader2 className="size-3 animate-spin" /> : icon}{label}
    </button>
  );
}


// ── Customer 360 sheet ───────────────────────────────────────────────────────
function Customer360Sheet({ userId, name, onClose }: { userId: string; name: string; onClose: () => void }) {
  const [data, setData] = useState<null | {
    profile: { full_name: string | null; phone: string | null; country: string | null; market_region: string | null; created_at: string } | null;
    email: string | null; address: string | null;
    orders: number; successfulOrders: number; failedPayments: number; ltv: number;
    refunds: number; refundTotal: number; returns: number; activeShipments: number;
    support: number; riskScore: number;
    notifications: { id: string; title: string; created_at: string }[];
    tickets: { id: string; subject: string; status: string; created_at: string }[];
    fraud: number;
  }>(null);

  useEffect(() => {
    let alive = true;
    (async () => {
      const [pf, ord, ref, ret, ship, notif, tk, fr] = await Promise.all([
        supabase.from("profiles").select("full_name,phone,country,market_region,created_at").eq("id", userId).maybeSingle(),
        supabase.from("orders").select("total,currency,status,payment_status,contact_email,shipping_address").eq("user_id", userId),
        supabase.from("refunds").select("amount,order_id,orders!inner(user_id)").eq("orders.user_id", userId),
        supabase.from("returns").select("id").eq("user_id", userId),
        supabase.from("shipments").select("id,status").eq("user_id", userId),
        supabase.from("notifications").select("id,title,created_at").eq("user_id", userId).order("created_at", { ascending: false }).limit(6),
        supabase.from("support_tickets").select("id,subject,status,created_at").eq("user_id", userId).order("created_at", { ascending: false }).limit(50),
        supabase.from("fraud_alerts").select("id,score").eq("subject_id", userId).eq("subject_type", "user"),
      ]);
      if (!alive) return;
      const orders = (ord.data as { total: number; status: string; payment_status: string | null; contact_email: string | null; shipping_address: Record<string, unknown> | null }[]) ?? [];
      const refundsArr = (ref.data as { amount: number }[]) ?? [];
      const shipArr = (ship.data as { status: string }[]) ?? [];
      const fraudArr = (fr.data as { score: number | null }[]) ?? [];
      const paid = (o: { status: string; payment_status: string | null }) => ["paid", "succeeded", "delivered", "shipped", "completed"].includes((o.payment_status ?? o.status ?? "").toLowerCase());
      const successfulOrders = orders.filter(paid).length;
      const failedPayments = orders.filter((o) => ["failed", "cancelled"].includes((o.payment_status ?? "").toLowerCase())).length;
      const support = ((tk.data as unknown[]) ?? []).length;
      const ltv = orders.filter(paid).reduce((a, b) => a + (b.total || 0), 0);
      const addr = orders.find((o) => o.shipping_address)?.shipping_address as { line1?: string; city?: string; state?: string; country?: string } | null;
      // Composite risk score (0-100) from real signals: fraud alerts, refund rate, failed payments.
      const fraudMax = fraudArr.reduce((m, f) => Math.max(m, f.score ?? 50), 0);
      const refundRatio = successfulOrders ? refundsArr.length / successfulOrders : 0;
      const riskScore = Math.min(100, Math.round(fraudMax * 0.6 + refundRatio * 100 * 0.3 + Math.min(failedPayments, 5) * 4));
      setData({
        profile: (pf.data as never) ?? null,
        email: orders.find((o) => o.contact_email)?.contact_email ?? null,
        address: addr ? [addr.line1, addr.city, addr.state, addr.country].filter(Boolean).join(", ") : null,
        orders: orders.length, successfulOrders, failedPayments, ltv,
        refunds: refundsArr.length,
        refundTotal: refundsArr.reduce((a, b) => a + (b.amount || 0), 0),
        returns: ((ret.data as unknown[]) ?? []).length,
        activeShipments: shipArr.filter((s) => !["delivered", "cancelled", "returned"].includes(s.status)).length,
        support, riskScore,
        notifications: (notif.data as { id: string; title: string; created_at: string }[]) ?? [],
        tickets: ((tk.data as { id: string; subject: string; status: string; created_at: string }[]) ?? []).slice(0, 6),
        fraud: fraudArr.length,
      });
    })();
    return () => { alive = false; };
  }, [userId]);

  return (
    <Sheet title="Customer 360" subtitle={name} onClose={onClose}>
      {!data ? <Loader2 className="size-5 animate-spin text-accent mx-auto my-12" /> : (
        <div className="space-y-4">
          <div className="rounded-xl border border-border/50 bg-background/40 p-3 space-y-1.5 text-xs">
            {data.email && <p className="flex items-center gap-2 truncate"><Mail className="size-3.5 text-muted-foreground shrink-0" />{data.email}</p>}
            {data.profile?.phone && <p className="flex items-center gap-2 truncate"><Phone className="size-3.5 text-muted-foreground shrink-0" />{data.profile.phone}</p>}
            {data.address && <p className="flex items-center gap-2"><MapPin className="size-3.5 text-muted-foreground shrink-0 mt-0.5" /><span className="truncate">{data.address}</span></p>}
          </div>
          <div className="grid grid-cols-3 gap-2">
            <Stat label="Total Orders" value={String(data.orders)} icon={<Package className="size-3.5" />} />
            <Stat label="Lifetime Value" value={money(data.ltv, null)} icon={<TrendingUp className="size-3.5" />} />
            <Stat label="Successful" value={String(data.successfulOrders)} icon={<Check className="size-3.5" />} />
            <Stat label="Failed Payments" value={String(data.failedPayments)} tone={data.failedPayments ? "destructive" : undefined} />
            <Stat label="Refunds" value={`${data.refunds}`} icon={<Banknote className="size-3.5" />} />
            <Stat label="Returns" value={String(data.returns)} icon={<RotateCcw className="size-3.5" />} />
            <Stat label="Support Tickets" value={String(data.support)} icon={<MessageSquare className="size-3.5" />} />
            <Stat label="Active Shipments" value={String(data.activeShipments)} icon={<Truck className="size-3.5" />} />
            <Stat label="Risk Score" value={String(data.riskScore)} icon={<ShieldAlert className="size-3.5" />} tone={data.riskScore >= 60 ? "destructive" : undefined} />
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
