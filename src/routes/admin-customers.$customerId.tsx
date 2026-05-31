import { createFileRoute, useNavigate, Link } from "@tanstack/react-router";
import { useCallback, useEffect, useRef, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import {
  ArrowLeft, Loader2, Radio, ShieldAlert, IndianRupee, ShoppingBag, Truck,
  RotateCcw, LifeBuoy, Bell, MapPin, Copy, Check, Download, Mail, Plus, X, CreditCard,
  User, Clock, ExternalLink,
} from "lucide-react";
import { AdminShell } from "@/components/admin/AdminShell";
import { supabase } from "@/integrations/supabase/client";
import {
  getCustomerProfileFn, getCustomerRiskFn, createCustomerTicketFn, type CustomerProfile,
} from "@/lib/customer-center.functions";

export const Route = createFileRoute("/admin-customers/$customerId")({
  head: () => ({ meta: [{ title: "Customer Profile — FoundOurMarket™" }] }),
  component: ProfilePage,
});

const money = (v: number | null | undefined, c = "INR") =>
  new Intl.NumberFormat("en-IN", { style: "currency", currency: c, maximumFractionDigits: 0 }).format(Number(v) || 0);
const when = (s: string | null) => (s ? new Date(s).toLocaleString("en-IN", { dateStyle: "medium", timeStyle: "short" }) : "—");
const dateOnly = (s: string | null) => (s ? new Date(s).toLocaleDateString("en-IN", { dateStyle: "medium" }) : "—");
const accountAge = (s: string | null) => {
  if (!s) return "—";
  const days = Math.floor((Date.now() - new Date(s).getTime()) / 86400000);
  if (days < 30) return `${days}d`;
  if (days < 365) return `${Math.floor(days / 30)}mo`;
  return `${(days / 365).toFixed(1)}y`;
};

function riskTone(score: number) {
  if (score >= 70) return "text-destructive border-destructive/30 bg-destructive/10";
  if (score >= 35) return "text-amber-400 border-amber-500/30 bg-amber-500/10";
  return "text-emerald-400 border-emerald-500/30 bg-emerald-500/10";
}
function StatusPill({ status }: { status: string | null }) {
  const s = status ?? "—";
  const map: Record<string, string> = {
    succeeded: "text-emerald-400 border-emerald-500/30 bg-emerald-500/10",
    paid: "text-emerald-400 border-emerald-500/30 bg-emerald-500/10",
    delivered: "text-emerald-400 border-emerald-500/30 bg-emerald-500/10",
    fulfilled: "text-emerald-400 border-emerald-500/30 bg-emerald-500/10",
    resolved: "text-emerald-400 border-emerald-500/30 bg-emerald-500/10",
    pending: "text-amber-400 border-amber-500/30 bg-amber-500/10",
    open: "text-amber-400 border-amber-500/30 bg-amber-500/10",
    failed: "text-destructive border-destructive/30 bg-destructive/10",
    cancelled: "text-destructive border-destructive/30 bg-destructive/10",
    refunded: "text-sky-400 border-sky-500/30 bg-sky-500/10",
  };
  return (
    <span className={`inline-flex items-center rounded-full border px-2 py-0.5 text-[10px] font-mono uppercase tracking-wider ${map[s] ?? "text-muted-foreground border-white/10 bg-white/5"}`}>
      {s}
    </span>
  );
}

function CopyBtn({ value, label }: { value: string | null | undefined; label?: string }) {
  const [done, setDone] = useState(false);
  if (!value) return <span className="text-muted-foreground">—</span>;
  return (
    <button
      onClick={() => { navigator.clipboard.writeText(value); setDone(true); setTimeout(() => setDone(false), 1200); }}
      className="inline-flex items-center gap-1 font-mono text-xs hover:text-accent transition-colors"
    >
      <span className="truncate max-w-[200px]">{label ?? value}</span>
      {done ? <Check className="size-3 text-emerald-400" /> : <Copy className="size-3 opacity-50" />}
    </button>
  );
}

function Section({ icon: Icon, title, count, children }: { icon: typeof User; title: string; count?: number; children: React.ReactNode }) {
  return (
    <div className="glass border border-white/10 rounded-2xl p-4">
      <div className="flex items-center gap-2 mb-3">
        <Icon className="size-4 text-accent" />
        <h2 className="text-sm font-semibold">{title}</h2>
        {count !== undefined && <span className="text-[10px] font-mono text-muted-foreground">({count})</span>}
      </div>
      {children}
    </div>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-xl border border-white/10 bg-white/[0.02] p-3">
      <p className="text-[10px] uppercase tracking-widest text-muted-foreground">{label}</p>
      <p className="mt-1 text-sm font-bold tabular-nums">{value}</p>
    </div>
  );
}

function ProfilePage() {
  return (
    <AdminShell title="Customer Profile" subtitle="Customer 360° dossier" allow={["admin", "super_admin", "manager"]}>
      <ProfileInner />
    </AdminShell>
  );
}

type Risk = {
  score: number; level: string; open_alerts: number; failed_payments: number;
  total_attempts: number; address_count: number; chargeback_risk: string;
};

function ProfileInner() {
  const { customerId } = Route.useParams();
  const nav = useNavigate();
  const profileFn = useServerFn(getCustomerProfileFn);
  const riskFn = useServerFn(getCustomerRiskFn);
  const ticketFn = useServerFn(createCustomerTicketFn);

  const [data, setData] = useState<CustomerProfile | null>(null);
  const [risk, setRisk] = useState<Risk | null>(null);
  const [loading, setLoading] = useState(true);
  const [pulse, setPulse] = useState(false);
  const [showTicket, setShowTicket] = useState(false);
  const [copiedAll, setCopiedAll] = useState(false);
  const reqId = useRef(0);

  const load = useCallback(async () => {
    const id = ++reqId.current;
    setLoading(true);
    try {
      const [p, r] = await Promise.all([
        profileFn({ data: { customerId } }),
        riskFn({ data: { customerId } }).catch(() => null),
      ]);
      if (id !== reqId.current) return;
      setData(p);
      setRisk(r as Risk | null);
    } finally {
      if (id === reqId.current) setLoading(false);
    }
  }, [profileFn, riskFn, customerId]);

  useEffect(() => { load(); }, [load]);

  // Realtime only for this active profile.
  useEffect(() => {
    const ping = () => { setPulse(true); setTimeout(() => setPulse(false), 1000); load(); };
    const flt = `user_id=eq.${customerId}`;
    const ch = supabase
      .channel(`admin-customer-${customerId}`)
      .on("postgres_changes", { event: "*", schema: "public", table: "orders", filter: flt }, ping)
      .on("postgres_changes", { event: "*", schema: "public", table: "payments", filter: flt }, ping)
      .on("postgres_changes", { event: "*", schema: "public", table: "shipments", filter: flt }, ping)
      .on("postgres_changes", { event: "*", schema: "public", table: "returns", filter: flt }, ping)
      .on("postgres_changes", { event: "*", schema: "public", table: "support_tickets", filter: flt }, ping)
      .on("postgres_changes", { event: "*", schema: "public", table: "notifications", filter: flt }, ping)
      .subscribe();
    return () => { supabase.removeChannel(ch); };
  }, [customerId, load]);

  const exportHistory = () => {
    if (!data) return;
    const blob = new Blob([JSON.stringify(data, null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `customer-${customerId}.json`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const copyAll = () => {
    if (!data?.profile) return;
    const p = data.profile;
    const text = [
      `Name: ${p.full_name ?? "—"}`, `Email: ${p.email ?? "—"}`, `Phone: ${p.phone ?? "—"}`,
      `Country: ${p.country ?? "—"}`, `Customer ID: ${p.id}`,
      `Lifetime Revenue: ${money(data.value.lifetime_revenue)}`, `Total Orders: ${data.value.total_orders}`,
    ].join("\n");
    navigator.clipboard.writeText(text);
    setCopiedAll(true); setTimeout(() => setCopiedAll(false), 1500);
  };

  if (loading && !data) {
    return <div className="min-h-[40vh] grid place-items-center"><Loader2 className="size-5 animate-spin text-accent" /></div>;
  }
  if (!data?.profile) {
    return (
      <div className="space-y-4">
        <button onClick={() => nav({ to: "/admin-customers" })} className="inline-flex items-center gap-2 text-xs text-muted-foreground hover:text-foreground">
          <ArrowLeft className="size-4" /> Back to customers
        </button>
        <p className="text-muted-foreground">Customer not found.</p>
      </div>
    );
  }

  const p = data.profile;
  const v = data.value;
  const refundRate = v.total_orders > 0 ? Math.round((v.refund_count / v.total_orders) * 100) : 0;
  const returnRate = v.total_orders > 0 ? Math.round((v.return_count / v.total_orders) * 100) : 0;
  const aov = v.succeeded_payments > 0 ? v.lifetime_revenue / v.succeeded_payments : 0;
  const score = risk?.score ?? 0;

  return (
    <div className="space-y-5">
      {/* Header / actions */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <button onClick={() => nav({ to: "/admin-customers" })} className="inline-flex items-center gap-2 text-xs text-muted-foreground hover:text-foreground">
          <ArrowLeft className="size-4" /> Back
        </button>
        <div className="flex flex-wrap items-center gap-2">
          <span className="inline-flex items-center gap-1.5 text-[10px] font-mono uppercase tracking-widest text-emerald-400">
            <Radio className={`size-3 ${pulse ? "text-accent animate-ping" : ""}`} /> Live
          </span>
          {p.email && (
            <a href={`mailto:${p.email}`} className="inline-flex items-center gap-1.5 rounded-xl border border-white/10 px-3 py-1.5 text-xs hover:bg-white/5">
              <Mail className="size-3.5" /> Contact
            </a>
          )}
          <button onClick={() => setShowTicket(true)} className="inline-flex items-center gap-1.5 rounded-xl border border-white/10 px-3 py-1.5 text-xs hover:bg-white/5">
            <Plus className="size-3.5" /> Ticket
          </button>
          <button onClick={copyAll} className="inline-flex items-center gap-1.5 rounded-xl border border-white/10 px-3 py-1.5 text-xs hover:bg-white/5">
            {copiedAll ? <Check className="size-3.5 text-emerald-400" /> : <Copy className="size-3.5" />} Copy
          </button>
          <button onClick={exportHistory} className="inline-flex items-center gap-1.5 rounded-xl border border-white/10 px-3 py-1.5 text-xs hover:bg-white/5">
            <Download className="size-3.5" /> Export
          </button>
        </div>
      </div>

      {/* SECTION 1 — Customer Intelligence */}
      <Section icon={User} title="Customer Intelligence">
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
          <Stat label="Name" value={p.full_name ?? "—"} />
          <div className="rounded-xl border border-white/10 bg-white/[0.02] p-3">
            <p className="text-[10px] uppercase tracking-widest text-muted-foreground">Email</p>
            <div className="mt-1 text-sm"><CopyBtn value={p.email} /></div>
          </div>
          <div className="rounded-xl border border-white/10 bg-white/[0.02] p-3">
            <p className="text-[10px] uppercase tracking-widest text-muted-foreground">Phone</p>
            <div className="mt-1 text-sm"><CopyBtn value={p.phone} /></div>
          </div>
          <Stat label="Country" value={p.country ?? "—"} />
          <Stat label="Account Age" value={accountAge(p.created_at)} />
          <Stat label="Last Login" value={when(p.last_sign_in_at)} />
          <Stat label="Last Order" value={dateOnly(data.orders[0]?.created_at ?? null)} />
          <div className="rounded-xl border border-white/10 bg-white/[0.02] p-3">
            <p className="text-[10px] uppercase tracking-widest text-muted-foreground">Risk Score</p>
            <span className={`mt-1 inline-flex items-center rounded-full border px-2 py-0.5 text-xs font-mono ${riskTone(score)}`}>
              <ShieldAlert className="size-3 mr-1" />{score} · {risk?.level ?? "low"}
            </span>
          </div>
        </div>
      </Section>

      {/* SECTION 2 — Customer Value */}
      <Section icon={IndianRupee} title="Customer Value">
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3">
          <Stat label="Lifetime Revenue" value={money(v.lifetime_revenue)} />
          <Stat label="Avg Order Value" value={money(aov)} />
          <Stat label="Total Orders" value={String(v.total_orders)} />
          <Stat label="Delivered" value={String(v.delivered_orders)} />
          <Stat label="Refund Rate" value={`${refundRate}%`} />
          <Stat label="Return Rate" value={`${returnRate}%`} />
        </div>
      </Section>

      {/* SECTION 3 — Orders Timeline */}
      <Section icon={ShoppingBag} title="Orders Timeline" count={data.orders.length}>
        {data.orders.length === 0 ? <Empty /> : (
          <div className="space-y-2">
            {data.orders.map((o) => (
              <div key={o.id} className="flex items-center justify-between gap-2 rounded-xl border border-white/10 bg-white/[0.02] p-2.5 text-xs">
                <div className="min-w-0">
                  <div className="flex items-center gap-2">
                    <span className="font-mono">{o.id.slice(0, 8)}</span>
                    <StatusPill status={o.status} />
                    <StatusPill status={o.payment_status} />
                  </div>
                  <p className="text-[10px] text-muted-foreground mt-0.5">{when(o.created_at)}</p>
                </div>
                <div className="flex items-center gap-3 shrink-0">
                  <span className="font-mono">{money(o.total, o.currency ?? "INR")}</span>
                  <Link to="/admin-orders-ops" className="text-accent hover:underline"><ExternalLink className="size-3.5" /></Link>
                </div>
              </div>
            ))}
          </div>
        )}
      </Section>

      {/* SECTION 4 — Payment Intelligence */}
      <Section icon={CreditCard} title="Payment Intelligence" count={data.payments.length}>
        <div className="grid grid-cols-3 gap-3 mb-3">
          <Stat label="Successful" value={String(v.succeeded_payments)} />
          <Stat label="Failed" value={String(v.failed_payments)} />
          <Stat label="Attempts" value={String(risk?.total_attempts ?? data.payments.length)} />
        </div>
        {data.payments.length === 0 ? <Empty /> : (
          <div className="space-y-2">
            {data.payments.map((pay) => (
              <div key={pay.id} className="flex items-center justify-between gap-2 rounded-xl border border-white/10 bg-white/[0.02] p-2.5 text-xs">
                <div className="min-w-0">
                  <div className="flex items-center gap-2">
                    <span className="capitalize">{pay.method || "—"}</span>
                    <StatusPill status={pay.status} />
                  </div>
                  <div className="text-[10px] text-muted-foreground mt-0.5">
                    <CopyBtn value={pay.razorpay_payment_id || pay.transaction_id} />
                  </div>
                </div>
                <span className="font-mono shrink-0">{money(pay.amount, pay.currency ?? "INR")}</span>
              </div>
            ))}
          </div>
        )}
      </Section>

      {/* SECTION 5 — Address Intelligence */}
      <Section icon={MapPin} title="Address Intelligence" count={data.addresses.length}>
        {data.addresses.length === 0 ? <Empty /> : (
          <div className="grid sm:grid-cols-2 gap-3">
            {data.addresses.map((a) => {
              const full = [a.line1, a.line2, a.city, a.state, a.postal, a.country].filter(Boolean).join(", ");
              const maps = a.latitude && a.longitude
                ? `https://www.google.com/maps?q=${a.latitude},${a.longitude}`
                : `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(full)}`;
              return (
                <div key={a.id} className="rounded-xl border border-white/10 bg-white/[0.02] p-3 text-xs">
                  <div className="flex items-center gap-2 mb-1">
                    <span className="font-medium">{a.full_name || a.label || "Address"}</span>
                    {a.is_default_shipping && <span className="text-[9px] rounded-full border border-emerald-500/30 bg-emerald-500/10 text-emerald-400 px-1.5 py-0.5">SHIP</span>}
                    {a.is_default_billing && <span className="text-[9px] rounded-full border border-sky-500/30 bg-sky-500/10 text-sky-400 px-1.5 py-0.5">BILL</span>}
                  </div>
                  <p className="text-muted-foreground">{full || "—"}</p>
                  {a.phone && <p className="text-muted-foreground mt-0.5">{a.phone}</p>}
                  <div className="mt-2 flex items-center gap-3">
                    <a href={maps} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 text-accent hover:underline">
                      <MapPin className="size-3" /> Maps
                    </a>
                    <CopyBtn value={full} label="Copy" />
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </Section>

      {/* SECTION 6 — Shipment Intelligence */}
      <Section icon={Truck} title="Shipment Intelligence" count={data.shipments.length}>
        {data.shipments.length === 0 ? <Empty /> : (
          <div className="space-y-2">
            {data.shipments.map((s) => (
              <div key={s.id} className="flex items-center justify-between gap-2 rounded-xl border border-white/10 bg-white/[0.02] p-2.5 text-xs">
                <div className="min-w-0">
                  <div className="flex items-center gap-2">
                    <span>{s.carrier || "—"}</span>
                    <StatusPill status={s.status} />
                  </div>
                  <div className="text-[10px] text-muted-foreground mt-0.5"><CopyBtn value={s.tracking_number} /></div>
                </div>
                <div className="text-right shrink-0 text-[10px] text-muted-foreground">
                  <p>{s.delivered_at ? `Delivered ${dateOnly(s.delivered_at)}` : s.estimated_delivery ? `ETA ${dateOnly(s.estimated_delivery)}` : dateOnly(s.created_at)}</p>
                  {s.tracking_url && <a href={s.tracking_url} target="_blank" rel="noreferrer" className="text-accent hover:underline">Track</a>}
                </div>
              </div>
            ))}
          </div>
        )}
      </Section>

      {/* SECTION 7 — Returns & Refunds */}
      <Section icon={RotateCcw} title="Returns & Refunds" count={data.returns.length + data.refunds.length}>
        <div className="grid sm:grid-cols-2 gap-4">
          <div>
            <p className="text-[10px] uppercase tracking-widest text-muted-foreground mb-2">Returns</p>
            {data.returns.length === 0 ? <Empty /> : data.returns.map((r) => (
              <div key={r.id} className="flex items-center justify-between gap-2 rounded-xl border border-white/10 bg-white/[0.02] p-2.5 text-xs mb-2">
                <div className="min-w-0">
                  <StatusPill status={r.status} />
                  <p className="text-[10px] text-muted-foreground mt-0.5 truncate">{r.reason || "—"}</p>
                </div>
                <span className="font-mono shrink-0">{money(r.refund_amount)}</span>
              </div>
            ))}
          </div>
          <div>
            <p className="text-[10px] uppercase tracking-widest text-muted-foreground mb-2">Refunds</p>
            {data.refunds.length === 0 ? <Empty /> : data.refunds.map((r) => (
              <div key={r.id} className="flex items-center justify-between gap-2 rounded-xl border border-white/10 bg-white/[0.02] p-2.5 text-xs mb-2">
                <div className="min-w-0">
                  <StatusPill status={r.status} />
                  <p className="text-[10px] text-muted-foreground mt-0.5 truncate">{r.reason || "—"}</p>
                </div>
                <span className="font-mono shrink-0">{money(r.amount, r.currency ?? "INR")}</span>
              </div>
            ))}
          </div>
        </div>
      </Section>

      {/* SECTION 8 — Support Intelligence */}
      <Section icon={LifeBuoy} title="Support Intelligence" count={data.tickets.length}>
        {data.tickets.length === 0 ? <Empty /> : (
          <div className="space-y-2">
            {data.tickets.map((t) => (
              <Link key={t.id} to="/admin-support" className="flex items-center justify-between gap-2 rounded-xl border border-white/10 bg-white/[0.02] p-2.5 text-xs hover:bg-white/[0.04]">
                <div className="min-w-0">
                  <p className="truncate font-medium">{t.subject || "Ticket"}</p>
                  <p className="text-[10px] text-muted-foreground mt-0.5">{t.category} · {when(t.last_message_at ?? t.created_at)}</p>
                </div>
                <StatusPill status={t.status} />
              </Link>
            ))}
          </div>
        )}
      </Section>

      {/* SECTION 9 — Notification History */}
      <Section icon={Bell} title="Notification History" count={data.notifications.length}>
        {data.notifications.length === 0 ? <Empty /> : (
          <div className="space-y-2 max-h-72 overflow-y-auto pr-1">
            {data.notifications.map((n) => (
              <div key={n.id} className="rounded-xl border border-white/10 bg-white/[0.02] p-2.5 text-xs">
                <div className="flex items-center justify-between gap-2">
                  <span className="font-medium truncate">{n.title || n.type}</span>
                  <span className="text-[10px] text-muted-foreground shrink-0 inline-flex items-center gap-1"><Clock className="size-3" />{when(n.created_at)}</span>
                </div>
                {n.body && <p className="text-[10px] text-muted-foreground mt-0.5 line-clamp-2">{n.body}</p>}
              </div>
            ))}
          </div>
        )}
      </Section>

      {/* SECTION 10 — Fraud Intelligence */}
      <Section icon={ShieldAlert} title="Fraud Intelligence" count={data.fraud.length}>
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-3">
          <Stat label="Risk Score" value={String(score)} />
          <Stat label="Open Alerts" value={String(risk?.open_alerts ?? 0)} />
          <Stat label="Failed Payments" value={String(risk?.failed_payments ?? 0)} />
          <Stat label="Chargeback Risk" value={risk?.chargeback_risk ?? "low"} />
        </div>
        {data.fraud.length === 0 ? <Empty label="No fraud signals." /> : (
          <div className="space-y-2">
            {data.fraud.map((f) => (
              <div key={f.id} className="rounded-xl border border-white/10 bg-white/[0.02] p-2.5 text-xs">
                <div className="flex items-center justify-between gap-2">
                  <span className="font-medium truncate">{f.title || f.fraud_type}</span>
                  <span className={`inline-flex items-center rounded-full border px-2 py-0.5 text-[10px] font-mono ${riskTone(Number(f.score) || 0)}`}>{f.severity || f.score}</span>
                </div>
                {f.detail && <p className="text-[10px] text-muted-foreground mt-0.5">{f.detail}</p>}
              </div>
            ))}
          </div>
        )}
      </Section>

      {showTicket && (
        <TicketModal
          onClose={() => setShowTicket(false)}
          onCreate={async (subject, priority) => {
            await ticketFn({ data: { customerId, subject, priority } });
            setShowTicket(false);
            load();
          }}
        />
      )}
    </div>
  );
}

function Empty({ label = "No records." }: { label?: string }) {
  return <p className="text-xs text-muted-foreground py-3 text-center">{label}</p>;
}

function TicketModal({ onClose, onCreate }: { onClose: () => void; onCreate: (subject: string, priority: "low" | "normal" | "high" | "urgent") => Promise<void> }) {
  const [subject, setSubject] = useState("");
  const [priority, setPriority] = useState<"low" | "normal" | "high" | "urgent">("normal");
  const [busy, setBusy] = useState(false);
  return (
    <div className="fixed inset-0 z-50 grid place-items-center bg-black/60 p-4" onClick={onClose}>
      <div className="glass border border-white/10 rounded-2xl p-5 w-full max-w-md" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between mb-3">
          <h3 className="text-sm font-semibold">Create Support Ticket</h3>
          <button onClick={onClose}><X className="size-4 text-muted-foreground" /></button>
        </div>
        <input
          value={subject} onChange={(e) => setSubject(e.target.value)} placeholder="Subject"
          className="w-full bg-white/[0.03] border border-white/10 rounded-xl px-3 py-2 text-sm mb-3 focus:outline-none focus:border-accent/40"
        />
        <select value={priority} onChange={(e) => setPriority(e.target.value as typeof priority)}
          className="w-full bg-white/[0.03] border border-white/10 rounded-xl px-3 py-2 text-sm mb-4 focus:outline-none focus:border-accent/40">
          {["low", "normal", "high", "urgent"].map((p) => <option key={p} value={p} className="bg-background">{p}</option>)}
        </select>
        <button
          disabled={busy || subject.trim().length < 3}
          onClick={async () => { setBusy(true); try { await onCreate(subject.trim(), priority); } finally { setBusy(false); } }}
          className="w-full rounded-xl bg-accent text-accent-foreground py-2 text-sm font-medium disabled:opacity-40"
        >
          {busy ? <Loader2 className="size-4 animate-spin mx-auto" /> : "Create Ticket"}
        </button>
      </div>
    </div>
  );
}
