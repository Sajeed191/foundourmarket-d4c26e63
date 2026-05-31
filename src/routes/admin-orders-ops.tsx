import { createFileRoute } from "@tanstack/react-router";
import { useMemo, useState, useEffect } from "react";
import {
  ShoppingBag, Loader2, AlertTriangle, Download, RefreshCw, Search, X,
  Package, Truck, RotateCcw, Wallet, Crown, Globe, ShieldAlert, Sparkles,
  Clock, Zap, Gauge, TrendingUp, Users, CreditCard, MapPin, Mail, ArrowDownRight,
  Phone, Receipt, Bell, ShieldCheck, Copy, Check, LifeBuoy,
} from "lucide-react";
import { AdminShell } from "@/components/admin/AdminShell";
import { KpiCard } from "@/components/admin/KpiCard";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { useOrderOperations } from "@/lib/use-order-operations";
import { fetchOrderDetail } from "@/lib/order-operations";
import type { EnrichedOrder, OrderOps, WarRoomTag, OrderDetail } from "@/lib/order-operations";
import { exportRows, exportJson, type ExportFormat } from "@/lib/traffic-export";
import { OrderActionCenter } from "@/components/admin/OrderActionCenter";

export const Route = createFileRoute("/admin-orders-ops")({
  head: () => ({ meta: [{ title: "Order Operations Center — Admin" }] }),
  component: OrderOpsPage,
});

type Role = "admin" | "super_admin" | "manager" | "support" | "fulfillment" | "warehouse_staff" | "editor";
const ALLOW: Role[] = ["admin", "super_admin", "manager", "support", "fulfillment", "warehouse_staff"];
const inr = (n: number) => "₹" + Math.round(n || 0).toLocaleString("en-IN");
const num = (n: number) => Math.round(n || 0).toLocaleString("en-IN");
const timeAgo = (s: string | null) => {
  if (!s) return "—";
  const d = Date.now() - +new Date(s);
  if (d < 6e4) return "just now";
  if (d < 36e5) return Math.floor(d / 6e4) + "m ago";
  if (d < 864e5) return Math.floor(d / 36e5) + "h ago";
  return Math.floor(d / 864e5) + "d ago";
};

function Card({ title, icon, children, className = "", actions }: { title?: string; icon?: React.ReactNode; children: React.ReactNode; className?: string; actions?: React.ReactNode }) {
  return (
    <div className={`card-premium rounded-2xl p-5 ${className}`}>
      {(title || actions) && (
        <div className="flex items-center justify-between mb-4">
          {title && <h2 className="text-sm font-medium flex items-center gap-2">{icon}{title}</h2>}
          {actions}
        </div>
      )}
      {children}
    </div>
  );
}

function Avatar({ name, url, size = 32 }: { name: string | null; url: string | null; size?: number }) {
  if (url) return <img src={url} alt={name ?? ""} className="rounded-full object-cover shrink-0" style={{ width: size, height: size }} />;
  const initials = (name || "?").split(" ").map((p) => p[0]).join("").slice(0, 2).toUpperCase();
  return (
    <div className="rounded-full grid place-items-center bg-accent/10 text-accent font-medium shrink-0" style={{ width: size, height: size, fontSize: size * 0.36 }}>
      {initials}
    </div>
  );
}

const TAG_META: Record<WarRoomTag, { label: string; cls: string; icon: React.ReactNode }> = {
  new: { label: "New", cls: "text-sky-400 border-sky-400/30 bg-sky-400/10", icon: <Sparkles className="size-3" /> },
  failed_payment: { label: "Failed Pay", cls: "text-destructive border-destructive/30 bg-destructive/10", icon: <CreditCard className="size-3" /> },
  cod: { label: "COD", cls: "text-amber-400 border-amber-400/30 bg-amber-400/10", icon: <Wallet className="size-3" /> },
  high_value: { label: "High Value", cls: "text-emerald-400 border-emerald-400/30 bg-emerald-400/10", icon: <TrendingUp className="size-3" /> },
  international: { label: "Intl", cls: "text-cyan-400 border-cyan-400/30 bg-cyan-400/10", icon: <Globe className="size-3" /> },
  vip: { label: "VIP", cls: "text-violet-400 border-violet-400/30 bg-violet-400/10", icon: <Crown className="size-3" /> },
  refund_request: { label: "Refund", cls: "text-orange-400 border-orange-400/30 bg-orange-400/10", icon: <Wallet className="size-3" /> },
  return_request: { label: "Return", cls: "text-orange-400 border-orange-400/30 bg-orange-400/10", icon: <RotateCcw className="size-3" /> },
  shipment_delay: { label: "Delayed", cls: "text-destructive border-destructive/30 bg-destructive/10", icon: <Clock className="size-3" /> },
  support_linked: { label: "Support", cls: "text-pink-400 border-pink-400/30 bg-pink-400/10", icon: <Users className="size-3" /> },
};

function TagPill({ t }: { t: WarRoomTag }) {
  const m = TAG_META[t];
  return <span className={`inline-flex items-center gap-1 text-[9px] font-mono uppercase tracking-wider px-1.5 py-0.5 rounded border ${m.cls}`}>{m.icon}{m.label}</span>;
}

function RiskBadge({ score }: { score: number }) {
  const cls = score >= 60 ? "text-destructive border-destructive/30 bg-destructive/10"
    : score >= 30 ? "text-amber-400 border-amber-400/30 bg-amber-400/10"
    : "text-emerald-400 border-emerald-400/30 bg-emerald-400/10";
  return <span className={`text-[10px] font-mono px-1.5 py-0.5 rounded border tabular-nums ${cls}`}>{score}</span>;
}

function StatusPill({ s }: { s: string | null }) {
  const v = (s || "—").toLowerCase();
  const cls = v.includes("deliver") ? "text-emerald-400 border-emerald-400/30 bg-emerald-400/10"
    : v.includes("ship") ? "text-sky-400 border-sky-400/30 bg-sky-400/10"
    : v.includes("process") || v.includes("pending") ? "text-amber-400 border-amber-400/30 bg-amber-400/10"
    : v.includes("cancel") || v.includes("fail") ? "text-destructive border-destructive/30 bg-destructive/10"
    : "text-muted-foreground border-border bg-muted/30";
  return <span className={`text-[10px] font-mono uppercase tracking-wider px-1.5 py-0.5 rounded border ${cls}`}>{s || "—"}</span>;
}

function Bar({ value, max, color = "bg-accent" }: { value: number; max: number; color?: string }) {
  const pct = max > 0 ? Math.min(100, (value / max) * 100) : 0;
  return <div className="h-1.5 rounded-full bg-muted/40 overflow-hidden"><div className={`h-full rounded-full ${color}`} style={{ width: `${pct}%` }} /></div>;
}

function ExportMenu({ data }: { data: OrderOps }) {
  const [open, setOpen] = useState(false);
  const rows = data.orders.map((o) => {
    const a = o.shipping_address ?? {};
    const addr = [a.line1, a.line2, a.landmark, a.city, a.state, a.postal ?? a.postal_code, a.country]
      .filter(Boolean).join(", ");
    return {
      order_id: o.id,
      customer: o.full_name ?? o.contact_email ?? "Guest",
      phone: o.phone ?? (a.phone as string) ?? "",
      email: o.contact_email ?? "",
      address: addr,
      payment_id: o.razorpay_payment_id ?? "",
      razorpay_order_id: o.razorpay_order_id ?? "",
      payment_method: o.payment_method ?? "",
      amount: o.total,
      currency: o.currency ?? "",
      status: o.status,
      payment_status: o.payment_status,
      fulfillment: o.fulfillment_status,
      courier: o.carrier ?? "",
      tracking_number: o.tracking_number ?? "",
      created_at: o.created_at,
      region: o.market_region ?? o.country,
      units: o.units, profit: Math.round(o.profit), risk: o.riskScore,
      tags: o.tags.join("|"),
    };
  });
  const exp = (f: ExportFormat) => { exportRows(f, rows, "order-operations"); setOpen(false); };
  return (
    <div className="relative">
      <button onClick={() => setOpen((v) => !v)} className="inline-flex items-center gap-1.5 text-xs px-3 py-1.5 rounded-lg border border-border hover:border-accent/40"><Download className="size-3.5" /> Export</button>
      {open && (
        <div className="absolute right-0 mt-1 z-20 w-36 rounded-lg border border-border bg-card shadow-xl p-1 text-xs">
          {(["csv", "excel"] as ExportFormat[]).map((f) => (
            <button key={f} onClick={() => exp(f)} className="w-full text-left px-2 py-1.5 rounded hover:bg-muted/50 uppercase">{f}</button>
          ))}
          <button onClick={() => { exportJson(data, "order-operations"); setOpen(false); }} className="w-full text-left px-2 py-1.5 rounded hover:bg-muted/50 uppercase">json</button>
          <button onClick={() => { window.print(); setOpen(false); }} className="w-full text-left px-2 py-1.5 rounded hover:bg-muted/50 uppercase">pdf (print)</button>
        </div>
      )}
    </div>
  );
}

function OrderRow({ o, onClick }: { o: EnrichedOrder; onClick: () => void }) {
  return (
    <button onClick={onClick} className="w-full text-left grid grid-cols-[auto_1fr_auto] gap-3 items-center p-3 rounded-xl hover:bg-muted/40 transition-colors border border-transparent hover:border-border">
      <Avatar name={o.full_name} url={o.avatar_url} />
      <div className="min-w-0">
        <div className="flex items-center gap-2 flex-wrap">
          <span className="text-sm font-medium truncate">{o.full_name ?? o.contact_email ?? "Guest"}</span>
          <span className="text-[10px] font-mono text-muted-foreground">#{o.id.slice(0, 8)}</span>
          <RiskBadge score={o.riskScore} />
        </div>
        <div className="flex items-center gap-1.5 mt-1 flex-wrap">
          {o.tags.slice(0, 4).map((t) => <TagPill key={t} t={t} />)}
        </div>
        <div className="flex items-center gap-2 mt-1 text-[11px] text-muted-foreground">
          <StatusPill s={o.status} />
          <span>{o.units} item{o.units !== 1 ? "s" : ""}</span>
          <span>·</span>
          <span>{timeAgo(o.created_at)}</span>
        </div>
      </div>
      <div className="text-right">
        <div className="text-sm font-semibold tabular-nums">{inr(o.total)}</div>
        <div className={`text-[11px] tabular-nums ${o.profit < 0 ? "text-destructive" : "text-emerald-400"}`}>{o.profit < 0 ? "−" : "+"}{inr(Math.abs(o.profit))}</div>
      </div>
    </button>
  );
}

function CopyBtn({ value }: { value: string }) {
  const [done, setDone] = useState(false);
  return (
    <button
      onClick={() => { navigator.clipboard?.writeText(value); setDone(true); setTimeout(() => setDone(false), 1200); }}
      className="p-0.5 rounded hover:bg-muted/50 text-muted-foreground"
      aria-label="Copy"
    >{done ? <Check className="size-3 text-emerald-400" /> : <Copy className="size-3" />}</button>
  );
}

function Section({ title, icon, children }: { title: string; icon: React.ReactNode; children: React.ReactNode }) {
  return (
    <div className="rounded-xl border border-border p-3">
      <p className="text-[10px] uppercase tracking-widest text-muted-foreground mb-2 flex items-center gap-1.5">{icon}{title}</p>
      <div className="space-y-1.5 text-xs">{children}</div>
    </div>
  );
}

function MonoRow({ k, v, copy }: { k: string; v: string | null | undefined; copy?: boolean }) {
  if (!v) return <Row k={k} v="—" />;
  return (
    <div className="flex items-center justify-between gap-3 py-1 border-b border-border/40 last:border-0">
      <span className="text-muted-foreground">{k}</span>
      <span className="flex items-center gap-1.5 text-right font-mono text-[11px] break-all">{v}{copy && <CopyBtn value={v} />}</span>
    </div>
  );
}

function OrderDrawer({ o, onClose, onRefresh }: { o: EnrichedOrder; onClose: () => void; onRefresh: () => void }) {
  const [detail, setDetail] = useState<OrderDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState<string | null>(null);
  const [bump, setBump] = useState(0);

  useEffect(() => {
    let alive = true;
    setLoading(true); setErr(null);
    fetchOrderDetail(o.id)
      .then((d) => { if (alive) setDetail(d); })
      .catch((e) => { if (alive) setErr(e instanceof Error ? e.message : "Failed to load detail"); })
      .finally(() => { if (alive) setLoading(false); });
    return () => { alive = false; };
  }, [o.id, bump]);

  const a = (detail?.order.shipping_address ?? o.shipping_address ?? {}) as Record<string, string | undefined>;
  const pay = detail?.payment;
  const meta = (pay?.meta ?? {}) as Record<string, unknown>;
  const metaStr = (k: string) => { const v = meta[k]; return typeof v === "string" || typeof v === "number" ? String(v) : null; };
  const billing = detail?.addresses.find((x) => x.is_default_billing);
  const cur = detail?.order.currency ?? o.currency ?? "INR";
  const money = (n: number | null | undefined) => (cur === "INR" ? inr(n ?? 0) : `${cur} ${(n ?? 0).toFixed(2)}`);

  return (
    <div className="fixed inset-0 z-50 flex justify-end" onClick={onClose}>
      <div className="absolute inset-0 bg-background/70 backdrop-blur-sm" />
      <div className="relative w-full max-w-md h-full overflow-y-auto bg-card border-l border-border p-5 space-y-4" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-start justify-between">
          <div className="flex items-center gap-3">
            <Avatar name={o.full_name} url={o.avatar_url} size={44} />
            <div>
              <p className="text-sm font-medium">{o.full_name ?? "Guest"}</p>
              <p className="text-[11px] text-muted-foreground flex items-center gap-1"><Mail className="size-3" />{o.contact_email ?? "—"}</p>
              <p className="text-[11px] text-muted-foreground flex items-center gap-1"><MapPin className="size-3" />{o.market_region ?? o.country ?? "—"}</p>
            </div>
          </div>
          <button onClick={onClose} className="p-1 rounded-lg hover:bg-muted/50"><X className="size-4" /></button>
        </div>

        <div className="flex flex-wrap gap-1.5">{o.tags.map((t) => <TagPill key={t} t={t} />)}</div>

        <div className="grid grid-cols-3 gap-2 text-center">
          <div className="rounded-xl border border-border p-2"><div className="text-[9px] text-muted-foreground uppercase">Total</div><div className="text-sm font-semibold">{money(o.total)}</div></div>
          <div className="rounded-xl border border-border p-2"><div className="text-[9px] text-muted-foreground uppercase">Profit</div><div className={`text-sm font-semibold ${o.profit < 0 ? "text-destructive" : "text-emerald-400"}`}>{inr(o.profit)}</div></div>
          <div className="rounded-xl border border-border p-2"><div className="text-[9px] text-muted-foreground uppercase">Risk</div><div className="text-sm font-semibold"><RiskBadge score={o.riskScore} /></div></div>
        </div>

        <OrderActionCenter
          orderId={o.id}
          hasCustomer={!!o.user_id}
          onDone={() => { setBump((b) => b + 1); onRefresh(); }}
        />



        {/* Order Information */}
        <Section title="Order Information" icon={<ShoppingBag className="size-3" />}>
          <MonoRow k="Order ID" v={o.id} copy />
          <Row k="Placed" v={new Date(o.created_at).toLocaleString()} />
          <Row k="Status" v={<StatusPill s={o.status} />} />
          <Row k="Fulfilment" v={<StatusPill s={o.fulfillment_status || o.ship_status} />} />
        </Section>

        {/* Payment Intelligence */}
        <Section title="Payment Intelligence" icon={<CreditCard className="size-3" />}>
          <Row k="Payment status" v={<StatusPill s={o.payment_status} />} />
          <Row k="Amount paid" v={money(pay?.amount ?? o.total)} />
          <Row k="Currency" v={cur} />
          <Row k="Method" v={pay?.method ?? o.payment_method ?? "—"} />
          <Row k="Gateway" v={detail?.order.payment_provider ?? o.payment_provider ?? "—"} />
          <MonoRow k="Razorpay Order ID" v={pay?.razorpay_order_id ?? o.razorpay_order_id} copy />
          <MonoRow k="Razorpay Payment ID" v={pay?.razorpay_payment_id ?? o.razorpay_payment_id} copy />
          <MonoRow k="Transaction ID" v={pay?.transaction_id} copy />
          <MonoRow k="Bank Ref" v={metaStr("bank_reference") ?? metaStr("rrn")} />
          <MonoRow k="UPI Txn ID" v={metaStr("upi_transaction_id") ?? metaStr("vpa")} />
          <MonoRow k="Signature" v={pay?.signature ? `${pay.signature.slice(0, 18)}…` : null} />
          <Row k="Capture status" v={metaStr("captured") ?? (pay?.status ?? "—")} />
          <Row k="Settlement" v={metaStr("settlement_status") ?? "—"} />
          <Row k="Gateway fee" v={pay?.fee != null ? money(pay.fee) : "—"} />
          {pay && <Row k="Recorded" v={new Date(pay.created_at).toLocaleString()} />}
        </Section>

        {/* Customer Information */}
        <Section title="Customer Information" icon={<Users className="size-3" />}>
          <Row k="Full name" v={detail?.profile?.full_name ?? o.full_name ?? "—"} />
          <MonoRow k="Email" v={o.contact_email} copy />
          <MonoRow k="Phone" v={detail?.profile?.phone ?? o.phone ?? a.phone} copy />
          <MonoRow k="Customer ID" v={o.user_id} copy />
          <Row k="Lifetime orders" v={String(detail?.lifetime.orders ?? o.lifetime_orders)} />
          <Row k="Lifetime spend" v={money(detail?.lifetime.spend ?? o.lifetime_value)} />
        </Section>

        {/* Shipping Information */}
        <Section title="Shipping Information" icon={<MapPin className="size-3" />}>
          <Row k="Recipient" v={(a.name as string) ?? (a.full_name as string) ?? "—"} />
          <MonoRow k="Phone" v={a.phone} copy />
          <Row k="Address line 1" v={a.line1 ?? "—"} />
          {a.line2 && <Row k="Address line 2" v={a.line2} />}
          {a.landmark && <Row k="Landmark" v={a.landmark} />}
          {a.area && <Row k="Area" v={a.area} />}
          <Row k="City" v={a.city ?? "—"} />
          {a.district && <Row k="District" v={a.district} />}
          <Row k="State" v={a.state ?? a.region ?? "—"} />
          <Row k="Country" v={a.country ?? "—"} />
          <MonoRow k="PIN code" v={a.postal_code ?? a.postal} />
          {a.address_type && <Row k="Type" v={a.address_type} />}
        </Section>

        {/* Billing Information */}
        <Section title="Billing Information" icon={<Receipt className="size-3" />}>
          {billing ? (
            <>
              <Row k="Billing name" v={billing.full_name ?? "—"} />
              <MonoRow k="Billing phone" v={billing.phone} />
              <Row k="Billing address" v={[billing.line1, billing.city, billing.state, billing.postal].filter(Boolean).join(", ") || "—"} />
              <Row k="Same as shipping" v="No" />
            </>
          ) : (
            <Row k="Same as shipping" v="Yes" />
          )}
        </Section>

        {/* Shipment Timeline */}
        <Section title="Shipment Timeline" icon={<Truck className="size-3" />}>
          <Row k="Carrier" v={o.carrier ?? "—"} />
          <MonoRow k="Tracking" v={o.tracking_number} copy />
          {(detail?.shipments ?? []).length === 0 && <p className="text-[11px] text-muted-foreground">No shipment yet.</p>}
          {(detail?.shipments ?? []).flatMap((s) => s.events).slice(0, 8).map((ev) => (
            <div key={ev.id} className="flex items-start gap-2 py-1 border-b border-border/40 last:border-0">
              <span className="mt-1 size-1.5 rounded-full bg-accent shrink-0" />
              <div className="min-w-0 flex-1">
                <p className="text-[11px]">{ev.description ?? ev.status}</p>
                <p className="text-[10px] text-muted-foreground">{new Date(ev.occurred_at).toLocaleString()}{ev.location ? ` · ${ev.location}` : ""}{ev.source ? ` · ${ev.source}` : ""}</p>
              </div>
            </div>
          ))}
        </Section>

        {/* Refund History */}
        {(detail?.refunds ?? []).length > 0 && (
          <Section title="Refund History" icon={<ArrowDownRight className="size-3" />}>
            {detail!.refunds.map((r) => (
              <div key={r.id} className="flex items-center justify-between gap-2 py-1 border-b border-border/40 last:border-0">
                <span className="text-[11px]">{money(r.amount)} · {r.status}</span>
                <span className="text-[10px] text-muted-foreground">{new Date(r.created_at).toLocaleDateString()}</span>
              </div>
            ))}
          </Section>
        )}

        {/* Support History */}
        {(detail?.tickets ?? []).length > 0 && (
          <Section title="Support History" icon={<LifeBuoy className="size-3" />}>
            {detail!.tickets.map((t) => (
              <div key={t.id} className="flex items-center justify-between gap-2 py-1 border-b border-border/40 last:border-0">
                <span className="text-[11px] truncate">{t.subject ?? t.category ?? "Ticket"}</span>
                <StatusPill s={t.status} />
              </div>
            ))}
          </Section>
        )}

        {/* Notification History */}
        {(detail?.notifications ?? []).length > 0 && (
          <Section title="Notification History" icon={<Bell className="size-3" />}>
            {detail!.notifications.slice(0, 12).map((n) => (
              <div key={n.id} className="flex items-start gap-2 py-1 border-b border-border/40 last:border-0">
                <span className={`mt-1 size-1.5 rounded-full shrink-0 ${n.read_at ? "bg-muted-foreground/40" : "bg-accent"}`} />
                <div className="min-w-0 flex-1">
                  <p className="text-[11px] truncate">{n.title ?? n.type}</p>
                  <p className="text-[10px] text-muted-foreground">{new Date(n.created_at).toLocaleString()}</p>
                </div>
              </div>
            ))}
          </Section>
        )}

        {o.riskReasons.length > 0 && (
          <div className="rounded-xl border border-destructive/30 bg-destructive/5 p-3">
            <p className="text-[10px] uppercase tracking-widest text-destructive mb-1.5 flex items-center gap-1"><ShieldAlert className="size-3" />Risk signals</p>
            <ul className="text-[11px] text-muted-foreground space-y-0.5 list-disc list-inside">{o.riskReasons.map((r) => <li key={r}>{r}</li>)}</ul>
          </div>
        )}

        <div>
          <p className="text-[10px] uppercase tracking-widest text-muted-foreground mb-2">Products ({o.line_count})</p>
          <div className="space-y-2">
            {o.items.map((it, i) => (
              <div key={i} className="flex items-center gap-2">
                {it.image ? <img src={it.image} alt="" className="size-9 rounded-lg object-cover" /> : <div className="size-9 rounded-lg bg-muted/40 grid place-items-center"><Package className="size-4 text-muted-foreground" /></div>}
                <div className="min-w-0 flex-1"><p className="text-xs truncate">{it.name}</p><p className="text-[10px] text-muted-foreground">×{it.quantity} · {inr(it.unit_price)}</p></div>
                <span className="text-xs tabular-nums">{inr(it.line_total)}</span>
              </div>
            ))}
          </div>
        </div>

        {loading && <div className="flex items-center gap-2 text-[11px] text-muted-foreground"><Loader2 className="size-3 animate-spin" /> Loading full payment & customer detail…</div>}
        {err && <p className="text-[11px] text-destructive">{err}</p>}
        <div className="flex items-center gap-1 text-[10px] text-muted-foreground"><ShieldCheck className="size-3" /> Staff-only · this view is audit-logged</div>
      </div>
    </div>
  );
}

function Row({ k, v }: { k: string; v: React.ReactNode }) {
  return <div className="flex items-center justify-between gap-3 py-1 border-b border-border/40 last:border-0"><span className="text-muted-foreground">{k}</span><span className="text-right font-medium">{v}</span></div>;
}

function OrderOpsPage() {
  const { data, staffPerf, loading, refreshing, error, refresh } = useOrderOperations();
  const [sel, setSel] = useState<EnrichedOrder | null>(null);
  const [q, setQ] = useState("");
  const [filter, setFilter] = useState<WarRoomTag | "all">("all");

  const filtered = useMemo(() => {
    if (!data) return [];
    let rows = data.orders;
    if (filter !== "all") rows = rows.filter((o) => o.tags.includes(filter));
    const t = q.trim().toLowerCase();
    if (t) rows = rows.filter((o) =>
      o.id.toLowerCase().includes(t) ||
      (o.full_name ?? "").toLowerCase().includes(t) ||
      (o.contact_email ?? "").toLowerCase().includes(t) ||
      (o.phone ?? "").toLowerCase().includes(t) ||
      (o.razorpay_payment_id ?? "").toLowerCase().includes(t) ||
      (o.razorpay_order_id ?? "").toLowerCase().includes(t) ||
      (o.tracking_number ?? "").toLowerCase().includes(t) ||
      o.items.some((it) => (it.name ?? "").toLowerCase().includes(t)));
    return rows;
  }, [data, q, filter]);

  if (loading) {
    return <AdminShell title="Order Operations Center" allow={ALLOW}>
      <div className="min-h-[50vh] grid place-items-center"><Loader2 className="size-5 animate-spin text-accent" /></div>
    </AdminShell>;
  }
  if (error || !data) {
    return <AdminShell title="Order Operations Center" allow={ALLOW}>
      <div className="min-h-[40vh] grid place-items-center text-center"><div><AlertTriangle className="size-6 text-destructive mx-auto mb-2" /><p className="text-sm text-muted-foreground">{error ?? "No data"}</p><button onClick={refresh} className="mt-3 text-xs px-3 py-1.5 rounded-lg border border-border">Retry</button></div></div>
    </AdminShell>;
  }

  const k = data.kpis;
  const f = data.fulfillment;
  const maxCourier = Math.max(1, ...data.courierPerformance.map((c) => c.shipments));
  const maxRegion = Math.max(1, ...data.regionPerformance.map((r) => r.orders));
  const maxReason = Math.max(1, ...data.returnReasons.map((r) => r.cnt));

  const warTags: WarRoomTag[] = ["new", "failed_payment", "cod", "high_value", "international", "vip", "refund_request", "return_request", "shipment_delay", "support_linked"];

  return (
    <AdminShell
      title="Order Operations Center"
      subtitle="Live, database-backed fulfilment, delivery & risk intelligence"
      allow={ALLOW}
      actions={
        <div className="flex items-center gap-2">
          {refreshing && <Loader2 className="size-3.5 animate-spin text-accent" />}
          <button onClick={refresh} className="inline-flex items-center gap-1.5 text-xs px-3 py-1.5 rounded-lg border border-border hover:border-accent/40"><RefreshCw className="size-3.5" /> Refresh</button>
          <ExportMenu data={data} />
        </div>
      }
    >
      <div className="space-y-5">
        {/* KPIs */}
        <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-3">
          <KpiCard label="Total Orders" value={num(k.total_orders)} icon={<ShoppingBag className="size-4" />} sub={<span className="text-[11px] text-muted-foreground">{k.today_orders} today</span>} />
          <KpiCard label="Revenue" value={inr(k.revenue)} icon={<Wallet className="size-4" />} />
          <KpiCard label="Profit" value={inr(k.profit)} icon={<TrendingUp className="size-4" />} />
          <KpiCard label="AOV" value={inr(data.aov)} icon={<Gauge className="size-4" />} />
          <KpiCard label="Paid" value={num(k.paid_orders)} icon={<CreditCard className="size-4" />} sub={<span className="text-[11px] text-muted-foreground">{k.cod_orders} COD</span>} />
          <KpiCard label="Satisfaction" value={`${data.satisfactionScore}%`} icon={<Sparkles className="size-4" />} />
        </div>
        <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-3">
          <KpiCard label="Pending" value={num(k.pending)} icon={<Clock className="size-4" />} />
          <KpiCard label="Processing" value={num(k.processing)} icon={<Package className="size-4" />} />
          <KpiCard label="Shipped" value={num(k.shipped)} icon={<Truck className="size-4" />} />
          <KpiCard label="Delivered" value={num(k.delivered)} icon={<Truck className="size-4" />} />
          <KpiCard label="Returns" value={num(k.returned)} icon={<RotateCcw className="size-4" />} sub={<span className="text-[11px] text-muted-foreground">{data.returnRate}% rate</span>} />
          <KpiCard label="Refunded" value={inr(k.refund_total)} icon={<ArrowDownRight className="size-4" />} sub={<span className="text-[11px] text-muted-foreground">{data.refundRate}% rate</span>} />
        </div>

        <Tabs defaultValue="warroom">
          <TabsList className="flex-wrap h-auto">
            <TabsTrigger value="warroom">War Room</TabsTrigger>
            <TabsTrigger value="orders">Orders</TabsTrigger>
            <TabsTrigger value="fulfillment">Fulfilment</TabsTrigger>
            <TabsTrigger value="delivery">Delivery</TabsTrigger>
            <TabsTrigger value="returns">Returns & Refunds</TabsTrigger>
            <TabsTrigger value="staff">Staff</TabsTrigger>
            <TabsTrigger value="performance">Performance</TabsTrigger>
          </TabsList>

          {/* WAR ROOM */}
          <TabsContent value="warroom" className="space-y-5 mt-4">
            <Card title="AI Order Assistant" icon={<Sparkles className="size-4 text-accent" />}>
              <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-3">
                {data.aiInsights.length === 0 && <p className="text-sm text-muted-foreground">All clear — no operational risks detected.</p>}
                {data.aiInsights.map((i) => (
                  <div key={i.id} className={`rounded-xl border p-3 ${i.severity === "critical" ? "border-destructive/30 bg-destructive/5" : i.severity === "warning" ? "border-amber-400/30 bg-amber-400/5" : "border-border bg-muted/20"}`}>
                    <div className="flex items-center justify-between">
                      <p className="text-xs font-medium">{i.title}</p>
                      <span className="text-lg font-display font-semibold tabular-nums">{i.count}</span>
                    </div>
                    <p className="text-[11px] text-muted-foreground mt-1">{i.detail}</p>
                  </div>
                ))}
              </div>
            </Card>

            <div className="grid md:grid-cols-2 gap-3">
              {warTags.map((t) => {
                const rows = data.warRoom[t];
                return (
                  <Card key={t} title={`${TAG_META[t].label} (${rows.length})`} icon={TAG_META[t].icon}>
                    {rows.length === 0 ? <p className="text-xs text-muted-foreground">None</p> : (
                      <div className="space-y-1 max-h-64 overflow-y-auto">
                        {rows.slice(0, 8).map((o) => <OrderRow key={o.id} o={o} onClick={() => setSel(o)} />)}
                      </div>
                    )}
                  </Card>
                );
              })}
            </div>
          </TabsContent>

          {/* ORDERS */}
          <TabsContent value="orders" className="space-y-3 mt-4">
            <div className="flex flex-col sm:flex-row gap-2">
              <div className="relative flex-1">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 size-4 text-muted-foreground" />
                <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search orders, customers, products…" className="w-full pl-9 pr-3 py-2 text-sm rounded-lg border border-border bg-background focus:border-accent/40 outline-none" />
              </div>
              <select value={filter} onChange={(e) => setFilter(e.target.value as WarRoomTag | "all")} className="text-sm rounded-lg border border-border bg-background px-3 py-2 outline-none">
                <option value="all">All tags</option>
                {warTags.map((t) => <option key={t} value={t}>{TAG_META[t].label}</option>)}
              </select>
            </div>
            <Card>
              <p className="text-[11px] text-muted-foreground mb-2">{filtered.length} orders</p>
              <div className="space-y-1 max-h-[70vh] overflow-y-auto">
                {filtered.map((o) => <OrderRow key={o.id} o={o} onClick={() => setSel(o)} />)}
                {filtered.length === 0 && <p className="text-sm text-muted-foreground py-6 text-center">No matching orders</p>}
              </div>
            </Card>
          </TabsContent>

          {/* FULFILMENT */}
          <TabsContent value="fulfillment" className="space-y-5 mt-4">
            <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
              <KpiCard label="Avg Processing" value={f.avgProcessingHours != null ? `${f.avgProcessingHours.toFixed(1)}h` : "—"} icon={<Clock className="size-4" />} />
              <KpiCard label="Avg Delivery" value={f.avgDeliveryDays != null ? `${f.avgDeliveryDays.toFixed(1)}d` : "—"} icon={<Truck className="size-4" />} />
              <KpiCard label="Delayed" value={num(f.delayedCount)} icon={<AlertTriangle className="size-4" />} />
              <KpiCard label="In Transit" value={num(data.orders.filter((o) => o.shipped_at && !o.delivered_at).length)} icon={<Zap className="size-4" />} />
            </div>
            <div className="grid md:grid-cols-2 gap-3">
              <Card title="Fastest deliveries" icon={<Zap className="size-4 text-emerald-400" />}>
                <div className="space-y-1">{f.fastest.map((o) => <div key={o.id} className="flex items-center justify-between text-xs py-1.5 border-b border-border/40 last:border-0"><span className="truncate">#{o.id.slice(0, 8)} · {o.full_name ?? "Guest"}</span><span className="text-emerald-400 tabular-nums">{o.deliveryDays?.toFixed(1)}d</span></div>)}{f.fastest.length === 0 && <p className="text-xs text-muted-foreground">No delivered orders yet</p>}</div>
              </Card>
              <Card title="Slowest deliveries" icon={<Clock className="size-4 text-destructive" />}>
                <div className="space-y-1">{f.slowest.map((o) => <div key={o.id} className="flex items-center justify-between text-xs py-1.5 border-b border-border/40 last:border-0"><span className="truncate">#{o.id.slice(0, 8)} · {o.full_name ?? "Guest"}</span><span className="text-destructive tabular-nums">{o.deliveryDays?.toFixed(1)}d</span></div>)}{f.slowest.length === 0 && <p className="text-xs text-muted-foreground">No delivered orders yet</p>}</div>
              </Card>
            </div>
          </TabsContent>

          {/* DELIVERY */}
          <TabsContent value="delivery" className="space-y-5 mt-4">
            <Card title="Courier performance" icon={<Truck className="size-4 text-accent" />}>
              <div className="space-y-3">
                {data.courierPerformance.map((c) => (
                  <div key={c.courier}>
                    <div className="flex items-center justify-between text-xs mb-1">
                      <span className="font-medium">{c.courier}</span>
                      <span className="text-muted-foreground">{c.shipments} shipments · {c.successRate}% success · {c.returnRate}% return · {c.avg_days != null ? `${c.avg_days.toFixed(1)}d` : "—"} · quality {c.quality}</span>
                    </div>
                    <Bar value={c.shipments} max={maxCourier} color={c.quality >= 70 ? "bg-emerald-400" : c.quality >= 50 ? "bg-amber-400" : "bg-destructive"} />
                  </div>
                ))}
                {data.courierPerformance.length === 0 && <p className="text-xs text-muted-foreground">No shipment data yet</p>}
              </div>
            </Card>
            <Card title="Region performance" icon={<Globe className="size-4 text-accent" />}>
              <div className="space-y-3">
                {data.regionPerformance.map((r) => (
                  <div key={r.region}>
                    <div className="flex items-center justify-between text-xs mb-1">
                      <span className="font-medium">{r.region}</span>
                      <span className="text-muted-foreground">{r.orders} orders · {inr(r.revenue)} · {r.returnRate}% return</span>
                    </div>
                    <Bar value={r.orders} max={maxRegion} />
                  </div>
                ))}
                {data.regionPerformance.length === 0 && <p className="text-xs text-muted-foreground">No region data yet</p>}
              </div>
            </Card>
          </TabsContent>

          {/* RETURNS & REFUNDS */}
          <TabsContent value="returns" className="space-y-5 mt-4">
            <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
              <KpiCard label="Returns" value={num(k.returned)} icon={<RotateCcw className="size-4" />} />
              <KpiCard label="Return Rate" value={`${data.returnRate}%`} icon={<ArrowDownRight className="size-4" />} />
              <KpiCard label="Refunded Orders" value={num(k.refunded)} icon={<Wallet className="size-4" />} />
              <KpiCard label="Refund Total" value={inr(k.refund_total)} icon={<ArrowDownRight className="size-4" />} />
            </div>
            <div className="grid md:grid-cols-2 gap-3">
              <Card title="Return reasons" icon={<RotateCcw className="size-4 text-accent" />}>
                <div className="space-y-3">
                  {data.returnReasons.map((r) => (
                    <div key={r.reason}>
                      <div className="flex items-center justify-between text-xs mb-1"><span className="truncate">{r.reason}</span><span className="text-muted-foreground tabular-nums">{r.cnt}</span></div>
                      <Bar value={r.cnt} max={maxReason} color="bg-orange-400" />
                    </div>
                  ))}
                  {data.returnReasons.length === 0 && <p className="text-xs text-muted-foreground">No returns yet</p>}
                </div>
              </Card>
              <Card title="Most returned products" icon={<Package className="size-4 text-accent" />}>
                <div className="space-y-1">
                  {data.topReturned.map((p) => <div key={p.slug} className="flex items-center justify-between text-xs py-1.5 border-b border-border/40 last:border-0"><span className="truncate">{p.name ?? p.slug}</span><span className="text-muted-foreground tabular-nums">{p.cnt}</span></div>)}
                  {data.topReturned.length === 0 && <p className="text-xs text-muted-foreground">No returns yet</p>}
                </div>
              </Card>
            </div>
          </TabsContent>

          {/* STAFF */}
          <TabsContent value="staff" className="space-y-5 mt-4">
            <Card title="Support performance" icon={<Users className="size-4 text-accent" />}>
              <div className="space-y-1">
                {data.staffSupport.map((s) => (
                  <div key={s.uid} className="flex items-center gap-3 py-2 border-b border-border/40 last:border-0">
                    <Avatar name={s.full_name} url={s.avatar_url} size={30} />
                    <div className="flex-1 min-w-0"><p className="text-xs font-medium truncate">{s.full_name ?? "Staff"}</p><p className="text-[11px] text-muted-foreground">{s.tickets_resolved}/{s.tickets_handled} resolved</p></div>
                    <span className="text-[11px] text-muted-foreground">{s.avg_handling_hours != null ? `${s.avg_handling_hours.toFixed(1)}h avg` : "—"}</span>
                  </div>
                ))}
                {data.staffSupport.length === 0 && <p className="text-xs text-muted-foreground">No staff ticket data yet</p>}
              </div>
            </Card>
            <Card title="Admin activity" icon={<Zap className="size-4 text-accent" />}>
              <div className="space-y-1">
                {data.staffActivity.map((s) => (
                  <div key={s.uid} className="flex items-center gap-3 py-2 border-b border-border/40 last:border-0">
                    <Avatar name={s.full_name} url={s.avatar_url} size={30} />
                    <div className="flex-1 min-w-0"><p className="text-xs font-medium truncate">{s.full_name ?? "Staff"}</p><p className="text-[11px] text-muted-foreground">{timeAgo(s.last_action)}</p></div>
                    <span className="text-[11px] text-muted-foreground tabular-nums">{num(s.actions)} actions</span>
                  </div>
                ))}
                {data.staffActivity.length === 0 && <p className="text-xs text-muted-foreground">No admin activity yet</p>}
              </div>
            </Card>
          </TabsContent>

          <TabsContent value="performance" className="space-y-5 mt-4">
            {(() => {
              const totPacked = staffPerf.reduce((a, s) => a + s.packed, 0);
              const totShipped = staffPerf.reduce((a, s) => a + s.shipped, 0);
              const totRefunds = staffPerf.reduce((a, s) => a + s.refunds_handled, 0);
              const hrs = staffPerf.map((s) => s.avg_handling_hours).filter((h): h is number => h != null);
              const avgHrs = hrs.length ? hrs.reduce((a, b) => a + b, 0) / hrs.length : null;
              return (
                <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
                  <KpiCard label="Packed" value={num(totPacked)} icon={<Package className="size-4" />} />
                  <KpiCard label="Shipped" value={num(totShipped)} icon={<Truck className="size-4" />} />
                  <KpiCard label="Refunds Handled" value={num(totRefunds)} icon={<RotateCcw className="size-4" />} />
                  <KpiCard label="Avg Handling" value={avgHrs != null ? `${avgHrs.toFixed(1)}h` : "—"} icon={<Clock className="size-4" />} />
                </div>
              );
            })()}
            <Card title="Staff performance" icon={<Gauge className="size-4 text-accent" />}
              actions={<span className="text-[11px] text-muted-foreground">{staffPerf.length} staff · fulfilment KPIs</span>}>
              {staffPerf.length === 0 ? (
                <p className="text-xs text-muted-foreground">No fulfilment activity recorded yet. Packed, shipped and refund actions appear here as staff process orders.</p>
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full text-xs">
                    <thead>
                      <tr className="text-muted-foreground border-b border-border/60">
                        <th className="text-left font-medium py-2 pr-3">Staff</th>
                        <th className="text-right font-medium py-2 px-2">Packed</th>
                        <th className="text-right font-medium py-2 px-2">Shipped</th>
                        <th className="text-right font-medium py-2 px-2">Refunds</th>
                        <th className="text-right font-medium py-2 px-2">Avg Handling</th>
                        <th className="text-right font-medium py-2 pl-2">Last Active</th>
                      </tr>
                    </thead>
                    <tbody>
                      {staffPerf.map((s) => (
                        <tr key={s.uid} className="border-b border-border/40 last:border-0">
                          <td className="py-2 pr-3">
                            <div className="flex items-center gap-2.5 min-w-0">
                              <Avatar name={s.full_name} url={s.avatar_url} size={28} />
                              <div className="min-w-0">
                                <p className="font-medium truncate">{s.full_name ?? "Staff"}</p>
                                {s.roles.length > 0 && <p className="text-[10px] text-muted-foreground truncate">{s.roles.join(", ")}</p>}
                              </div>
                            </div>
                          </td>
                          <td className="text-right tabular-nums py-2 px-2">{num(s.packed)}</td>
                          <td className="text-right tabular-nums py-2 px-2">{num(s.shipped)}</td>
                          <td className="text-right tabular-nums py-2 px-2">{num(s.refunds_handled)}</td>
                          <td className="text-right tabular-nums py-2 px-2">{s.avg_handling_hours != null ? `${s.avg_handling_hours.toFixed(1)}h` : "—"}</td>
                          <td className="text-right text-muted-foreground py-2 pl-2">{timeAgo(s.last_action)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </Card>
          </TabsContent>
        </Tabs>
      </div>

      {sel && <OrderDrawer o={sel} onClose={() => setSel(null)} />}
    </AdminShell>
  );
}
