import { createFileRoute } from "@tanstack/react-router";
import { useMemo, useState, useEffect } from "react";
import {
  ShoppingBag, Loader2, AlertTriangle, Download, RefreshCw, Search, X,
  Package, Truck, RotateCcw, Wallet, Globe, ShieldAlert, Sparkles,
  Clock, Zap, Gauge, TrendingUp, Users, CreditCard, MapPin, Mail, ArrowDownRight,
  Phone, Receipt, Bell, ShieldCheck, Copy, Check, LifeBuoy,
  CheckCircle2, XCircle, ChevronDown, Hash, Calendar,
} from "lucide-react";
import { AdminShell } from "@/components/admin/AdminShell";
import { KpiCard } from "@/components/admin/KpiCard";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { useOrderOperations } from "@/lib/use-order-operations";
import { fetchOrderDetail } from "@/lib/order-operations";
import type { EnrichedOrder, OrderOps, WarRoomTag, OrderDetail } from "@/lib/order-operations";
import { exportRows, exportJson, type ExportFormat } from "@/lib/traffic-export";
import { OrderActionCenter } from "@/components/admin/OrderActionCenter";
import { openInvoice } from "@/lib/order-invoice";
import { OrderIntegrityMonitor } from "@/components/admin/OrderIntegrityMonitor";

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
  vip: { label: "Loyal", cls: "text-violet-400 border-violet-400/30 bg-violet-400/10", icon: <TrendingUp className="size-3" /> },
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
    <button onClick={onClick} className="w-full text-left grid grid-cols-[auto_1fr_auto] gap-3 sm:gap-4 items-center p-3 sm:p-3.5 rounded-xl hover:bg-muted/30 transition-colors border border-transparent hover:border-border/70 active:bg-muted/40">
      <Avatar name={o.full_name} url={o.avatar_url} size={40} />
      <div className="min-w-0">
        <div className="flex items-center gap-2 min-w-0">
          <span className="text-sm font-semibold truncate">{o.full_name ?? o.contact_email ?? "Guest"}</span>
          <RiskBadge score={o.riskScore} />
        </div>
        <div className="flex items-center gap-2 mt-1 text-[11px] text-muted-foreground">
          <span className="font-mono">#{o.id.slice(0, 8)}</span>
          <span className="text-border">·</span>
          <span>{timeAgo(o.created_at)}</span>
        </div>
        <div className="flex items-center gap-1.5 mt-2 flex-wrap">
          <StatusPill s={o.status} />
          {o.tags.slice(0, 2).map((t) => <TagPill key={t} t={t} />)}
        </div>
      </div>
      <div className="text-right shrink-0">
        <div className="text-sm font-semibold tabular-nums">{inr(o.total)}</div>
        <div className={`text-[11px] tabular-nums mt-0.5 ${o.profit < 0 ? "text-destructive" : "text-emerald-400"}`}>{o.profit < 0 ? "−" : "+"}{inr(Math.abs(o.profit))}</div>
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

function Section({ title, icon, children, tint }: { title: string; icon: React.ReactNode; children: React.ReactNode; tint?: "danger" | "amber" }) {
  const ring = tint === "danger" ? "border-destructive/30 bg-destructive/[0.03]"
    : tint === "amber" ? "border-amber-400/25 bg-amber-400/[0.03]"
    : "border-border bg-card/40";
  return (
    <div className={`rounded-2xl border ${ring} p-4`}>
      <p className="text-[11px] font-medium uppercase tracking-widest text-muted-foreground mb-3 flex items-center gap-2">{icon}{title}</p>
      <div className="space-y-1 text-[13px]">{children}</div>
    </div>
  );
}

function MonoRow({ k, v, copy }: { k: string; v: string | null | undefined; copy?: boolean }) {
  if (!v) return <Row k={k} v="—" />;
  return (
    <div className="flex items-center justify-between gap-3 py-1.5 border-b border-border/30 last:border-0">
      <span className="text-muted-foreground shrink-0">{k}</span>
      <span className="flex items-center gap-1.5 text-right font-mono text-[11px] break-all">{v}{copy && <CopyBtn value={v} />}</span>
    </div>
  );
}

/** Larger, high-contrast status badge for the header. */
function StatusBadge({ s, kind }: { s: string | null; kind: "order" | "payment" }) {
  const v = (s || "—").toLowerCase();
  const fail = v.includes("fail") || v.includes("cancel") || v.includes("declin");
  const good = v.includes("deliver") || v.includes("complete") || v.includes("paid") || v.includes("captur") || v.includes("success");
  const transit = v.includes("ship") || v.includes("out_for") || v.includes("transit");
  const cls = fail ? "text-destructive border-destructive/40 bg-destructive/10"
    : good ? "text-emerald-400 border-emerald-400/40 bg-emerald-400/10"
    : transit ? "text-sky-400 border-sky-400/40 bg-sky-400/10"
    : "text-amber-400 border-amber-400/40 bg-amber-400/10";
  const dot = fail ? "bg-destructive" : good ? "bg-emerald-400" : transit ? "bg-sky-400" : "bg-amber-400";
  return (
    <div className={`inline-flex items-center gap-2 rounded-full border px-3 py-1.5 ${cls}`}>
      <span className={`size-1.5 rounded-full ${dot}`} />
      <span className="text-[10px] uppercase tracking-wider text-muted-foreground/70">{kind === "order" ? "Order" : "Payment"}</span>
      <span className="text-[12px] font-semibold capitalize">{(s || "—").replace(/_/g, " ")}</span>
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
  const payFailed = (o.payment_status || "").toLowerCase().includes("fail") || (o.payment_status || "").toLowerCase().includes("declin");

  const recipient = (a.name as string) ?? (a.full_name as string) ?? o.full_name ?? "—";
  const addrLines = [a.line1, a.line2, a.landmark, a.area, [a.city, a.district].filter(Boolean).join(", "), [a.state ?? a.region, a.postal_code ?? a.postal].filter(Boolean).join(" "), a.country].filter(Boolean) as string[];

  // VIP removed: never surface the vip war-room tag in the details view.
  const tags = o.tags.filter((t) => t !== "vip");

  return (
    <div className="fixed inset-0 z-[90] flex justify-end" onClick={onClose}>
      <div className="absolute inset-0 bg-background/80 backdrop-blur-md" />
      <div className="relative w-full max-w-md h-full overflow-y-auto overscroll-contain bg-card border-l border-border shadow-2xl" onClick={(e) => e.stopPropagation()}>

        {/* ---- Header ---- */}
        <div className="sticky top-0 z-10 bg-card/95 backdrop-blur border-b border-border px-5 pt-5 pb-4">
          <div className="flex items-start justify-between gap-3">
            <div className="flex items-center gap-3 min-w-0">
              <Avatar name={o.full_name} url={o.avatar_url} size={46} />
              <div className="min-w-0">
                <p className="text-[15px] font-semibold truncate leading-tight">{o.full_name ?? "Guest"}</p>
                <p className="text-[12px] text-muted-foreground flex items-center gap-1.5 truncate"><Mail className="size-3 shrink-0" /><span className="truncate">{o.contact_email ?? "—"}</span></p>
                <p className="text-[12px] text-muted-foreground flex items-center gap-1.5 truncate"><MapPin className="size-3 shrink-0" />{o.market_region ?? o.country ?? "—"}</p>
              </div>
            </div>
            <button onClick={onClose} className="p-1.5 rounded-lg hover:bg-muted/50 shrink-0"><X className="size-4" /></button>
          </div>

          <div className="flex flex-wrap items-center gap-2 mt-4">
            <StatusBadge s={o.status} kind="order" />
            <StatusBadge s={o.payment_status} kind="payment" />
          </div>
          {tags.length > 0 && (
            <div className="flex flex-wrap gap-1.5 mt-2.5">{tags.map((t) => <TagPill key={t} t={t} />)}</div>
          )}
        </div>

        <div className="p-5 space-y-4">

          {/* ---- Key facts ---- */}
          <div className="grid grid-cols-3 gap-2.5">
            <div className="rounded-2xl border border-border bg-card/40 p-3 text-center">
              <div className="text-[9px] text-muted-foreground uppercase tracking-wider">Total</div>
              <div className="text-base font-bold tabular-nums mt-0.5">{money(o.total)}</div>
            </div>
            <div className="rounded-2xl border border-border bg-card/40 p-3 text-center">
              <div className="text-[9px] text-muted-foreground uppercase tracking-wider">Profit</div>
              <div className={`text-base font-bold tabular-nums mt-0.5 ${o.profit < 0 ? "text-destructive" : "text-emerald-400"}`}>{inr(o.profit)}</div>
            </div>
            <div className="rounded-2xl border border-border bg-card/40 p-3 text-center">
              <div className="text-[9px] text-muted-foreground uppercase tracking-wider">Items</div>
              <div className="text-base font-bold tabular-nums mt-0.5">{o.line_count}</div>
            </div>
          </div>

          <OrderActionCenter
            orderId={o.id}
            hasCustomer={!!o.user_id}
            currentStage={o.fulfillment_status || o.ship_status}
            onDone={() => { setBump((b) => b + 1); onRefresh(); }}
          />

          <button
            onClick={() => openInvoice({
              orderId: o.id,
              createdAt: o.created_at,
              currency: cur,
              total: pay?.amount ?? o.total,
              customerName: detail?.profile?.full_name ?? o.full_name,
              customerEmail: o.contact_email,
              customerPhone: detail?.profile?.phone ?? o.phone ?? (a.phone as string | undefined),
              paymentMethod: pay?.method ?? o.payment_method,
              paymentStatus: o.payment_status,
              recipient,
              recipientPhone: a.phone as string | undefined,
              addressLines: [a.line1, a.line2, a.landmark, a.area].filter(Boolean) as string[],
              city: (a.city ?? a.district) as string | undefined,
              state: (a.state ?? a.region) as string | undefined,
              country: a.country as string | undefined,
              pin: (a.postal_code ?? a.postal) as string | undefined,
              items: o.items.map((it) => ({
                name: it.name,
                quantity: it.quantity,
                unit_price: it.unit_price,
                line_total: it.line_total,
              })),
            })}
            className="w-full inline-flex items-center justify-center gap-2 text-[13px] font-medium px-4 py-2.5 rounded-xl border border-accent/40 bg-accent/[0.06] text-accent hover:bg-accent/10 transition-colors"
          >
            <Download className="size-4" /> Download Invoice
          </button>



          {/* ---- Order Information ---- */}
          <Section title="Order Information" icon={<ShoppingBag className="size-3.5" />}>
            <Row k="Status" v={<StatusPill s={o.status} />} />
            <Row k="Fulfilment" v={<StatusPill s={o.fulfillment_status || o.ship_status} />} />
            <Row k="Total amount" v={<span className="font-semibold">{money(o.total)}</span>} />
            <Row k="Placed" v={<span className="flex items-center gap-1.5"><Calendar className="size-3 text-muted-foreground" />{new Date(o.created_at).toLocaleString()}</span>} />
            <MonoRow k="Order ID" v={o.id} copy />
          </Section>

          {/* ---- Payment Intelligence ---- */}
          <Section title="Payment" icon={<CreditCard className="size-3.5" />} tint={payFailed ? "danger" : undefined}>
            {payFailed && (
              <div className="flex items-center gap-2 rounded-lg bg-destructive/10 border border-destructive/30 px-3 py-2 mb-2 text-[12px] text-destructive font-medium">
                <AlertTriangle className="size-3.5 shrink-0" /> Payment failed — action may be required
              </div>
            )}
            <Row k="Payment status" v={<StatusPill s={o.payment_status} />} />
            <Row k="Amount paid" v={<span className="font-semibold">{money(pay?.amount ?? o.total)}</span>} />
            <Row k="Currency" v={cur} />
            <Row k="Method" v={pay?.method ?? o.payment_method ?? "—"} />
            <Row k="Gateway" v={detail?.order.payment_provider ?? o.payment_provider ?? "—"} />
            {pay && <Row k="Recorded" v={new Date(pay.created_at).toLocaleString()} />}

            <details className="group mt-2 rounded-xl border border-border/60 bg-muted/20">
              <summary className="flex items-center justify-between gap-2 cursor-pointer list-none px-3 py-2 text-[11px] uppercase tracking-wider text-muted-foreground">
                <span className="flex items-center gap-1.5"><Hash className="size-3" /> Technical Payment Details</span>
                <ChevronDown className="size-3.5 transition-transform group-open:rotate-180" />
              </summary>
              <div className="px-3 pb-2 space-y-1">
                <MonoRow k="Razorpay Order ID" v={pay?.razorpay_order_id ?? o.razorpay_order_id} copy />
                <MonoRow k="Razorpay Payment ID" v={pay?.razorpay_payment_id ?? o.razorpay_payment_id} copy />
                <MonoRow k="Transaction ID" v={pay?.transaction_id} copy />
                <MonoRow k="Bank Ref" v={metaStr("bank_reference") ?? metaStr("rrn")} />
                <MonoRow k="UPI Txn ID" v={metaStr("upi_transaction_id") ?? metaStr("vpa")} />
                <MonoRow k="Signature" v={pay?.signature ? `${pay.signature.slice(0, 18)}…` : null} />
                <Row k="Capture status" v={metaStr("captured") ?? (pay?.status ?? "—")} />
                <Row k="Settlement" v={metaStr("settlement_status") ?? "—"} />
                <Row k="Gateway fee" v={pay?.fee != null ? money(pay.fee) : "—"} />
              </div>
            </details>
          </Section>

          {/* ---- Customer Information ---- */}
          <Section title="Customer" icon={<Users className="size-3.5" />}>
            <Row k="Name" v={<span className="font-medium">{detail?.profile?.full_name ?? o.full_name ?? "—"}</span>} />
            <MonoRow k="Email" v={o.contact_email} copy />
            <MonoRow k="Phone" v={detail?.profile?.phone ?? o.phone ?? a.phone} copy />
            <div className="grid grid-cols-2 gap-2 pt-2 mt-1 border-t border-border/30">
              <div className="rounded-lg bg-muted/20 px-2.5 py-2">
                <div className="text-[9px] uppercase tracking-wider text-muted-foreground">Lifetime orders</div>
                <div className="text-sm font-semibold tabular-nums">{String(detail?.lifetime.orders ?? o.lifetime_orders)}</div>
              </div>
              <div className="rounded-lg bg-muted/20 px-2.5 py-2">
                <div className="text-[9px] uppercase tracking-wider text-muted-foreground">Lifetime spend</div>
                <div className="text-sm font-semibold tabular-nums">{money(detail?.lifetime.spend ?? o.lifetime_value)}</div>
              </div>
            </div>
            <MonoRow k="Customer ID" v={o.user_id} copy />
          </Section>

          {/* ---- Shipping Information (label-style) ---- */}
          <Section title="Shipping Address" icon={<MapPin className="size-3.5" />}>
            <div className="rounded-xl border border-dashed border-border bg-muted/10 p-3.5">
              <p className="text-[14px] font-semibold">{recipient}</p>
              {(a.phone) && <p className="text-[12px] text-muted-foreground flex items-center gap-1.5 mt-0.5"><Phone className="size-3" />{a.phone}</p>}
              <div className="mt-2 text-[13px] leading-relaxed text-foreground/90">
                {addrLines.length > 0 ? addrLines.map((l, i) => <p key={i}>{l}</p>) : <p className="text-muted-foreground">No address on file</p>}
              </div>
              {a.address_type && <span className="inline-block mt-2 text-[10px] uppercase tracking-wider px-2 py-0.5 rounded border border-border text-muted-foreground">{a.address_type}</span>}
            </div>
          </Section>

          {/* ---- Billing Information ---- */}
          {billing ? (
            <Section title="Billing" icon={<Receipt className="size-3.5" />}>
              <Row k="Billing name" v={billing.full_name ?? "—"} />
              <MonoRow k="Billing phone" v={billing.phone} />
              <Row k="Billing address" v={[billing.line1, billing.city, billing.state, billing.postal].filter(Boolean).join(", ") || "—"} />
            </Section>
          ) : null}

          {/* ---- Shipment Timeline ---- */}
          <Section title="Shipment Timeline" icon={<Truck className="size-3.5" />}>
            <div className="flex items-center justify-between gap-3 pb-2 mb-1 border-b border-border/30">
              <span className="text-muted-foreground text-[12px]">Carrier</span>
              <span className="font-medium text-[12px]">{o.carrier ?? "—"}</span>
            </div>
            {o.tracking_number && <MonoRow k="Tracking" v={o.tracking_number} copy />}
            {(detail?.shipments ?? []).flatMap((s) => s.events).length === 0 ? (
              <p className="text-[12px] text-muted-foreground pt-1">No shipment movement yet.</p>
            ) : (
              <ol className="relative ml-1 mt-2 border-l border-border/60 space-y-3 pl-4">
                {(detail?.shipments ?? []).flatMap((s) => s.events).slice(0, 8).map((ev) => (
                  <li key={ev.id} className="relative">
                    <span className="absolute -left-[21px] top-1 size-2 rounded-full bg-accent ring-4 ring-card" />
                    <p className="text-[12px] font-medium capitalize">{(ev.description ?? ev.status ?? "").replace(/_/g, " ")}</p>
                    <p className="text-[10px] text-muted-foreground">{new Date(ev.occurred_at).toLocaleString()}{ev.location ? ` · ${ev.location}` : ""}{ev.source ? ` · ${ev.source}` : ""}</p>
                  </li>
                ))}
              </ol>
            )}
          </Section>

          {/* ---- Refund History ---- */}
          {(detail?.refunds ?? []).length > 0 && (
            <Section title="Refund History" icon={<ArrowDownRight className="size-3.5" />}>
              {detail!.refunds.map((r) => (
                <div key={r.id} className="flex items-center justify-between gap-2 py-1.5 border-b border-border/30 last:border-0">
                  <span className="text-[12px]">{money(r.amount)} · {r.status}</span>
                  <span className="text-[11px] text-muted-foreground">{new Date(r.created_at).toLocaleDateString()}</span>
                </div>
              ))}
            </Section>
          )}

          {/* ---- Support History ---- */}
          {(detail?.tickets ?? []).length > 0 && (
            <Section title="Support History" icon={<LifeBuoy className="size-3.5" />}>
              {detail!.tickets.map((t) => (
                <div key={t.id} className="flex items-center justify-between gap-2 py-1.5 border-b border-border/30 last:border-0">
                  <span className="text-[12px] truncate">{t.subject ?? t.category ?? "Ticket"}</span>
                  <StatusPill s={t.status} />
                </div>
              ))}
            </Section>
          )}

          {/* ---- Notification History ---- */}
          {(detail?.notifications ?? []).length > 0 && (
            <Section title="Notification History" icon={<Bell className="size-3.5" />}>
              {detail!.notifications.slice(0, 12).map((n) => {
                const label = (n.title ?? n.type ?? "").toLowerCase();
                const bad = label.includes("fail") || label.includes("cancel") || label.includes("declin");
                const ok = label.includes("deliver") || label.includes("confirm") || label.includes("ship") || label.includes("paid");
                const Icon = bad ? XCircle : ok ? CheckCircle2 : Bell;
                const tone = bad ? "text-destructive" : ok ? "text-emerald-400" : "text-muted-foreground";
                return (
                  <div key={n.id} className={`flex items-start gap-2.5 py-1.5 border-b border-border/30 last:border-0 ${bad ? "bg-destructive/[0.04] -mx-1 px-1 rounded" : ""}`}>
                    <Icon className={`size-3.5 mt-0.5 shrink-0 ${tone}`} />
                    <div className="min-w-0 flex-1">
                      <p className="text-[12px] font-medium capitalize">{(n.title ?? n.type ?? "").replace(/_/g, " ")}</p>
                      <p className="text-[10px] text-muted-foreground">{new Date(n.created_at).toLocaleString()}</p>
                    </div>
                  </div>
                );
              })}
            </Section>
          )}

          {/* ---- Risk signals (compact alert) ---- */}
          {o.riskReasons.length > 0 && (
            <div className="rounded-xl border border-destructive/30 bg-destructive/[0.06] p-3">
              <p className="text-[11px] uppercase tracking-widest text-destructive mb-1.5 flex items-center gap-1.5"><ShieldAlert className="size-3.5" />Risk signals <RiskBadge score={o.riskScore} /></p>
              <ul className="text-[12px] text-muted-foreground space-y-0.5 list-disc list-inside">{o.riskReasons.map((r) => <li key={r}>{r}</li>)}</ul>
            </div>
          )}

          {/* ---- Products ---- */}
          <Section title={`Products (${o.line_count})`} icon={<Package className="size-3.5" />}>
            <div className="space-y-3">
              {o.items.map((it, i) => (
                <div key={i} className="flex items-start gap-3">
                  {it.image ? <img src={it.image} alt="" className="size-12 rounded-xl object-cover shrink-0 border border-border" /> : <div className="size-12 rounded-xl bg-muted/40 grid place-items-center shrink-0"><Package className="size-5 text-muted-foreground" /></div>}
                  <div className="min-w-0 flex-1">
                    <p className="text-[13px] font-medium leading-snug line-clamp-2">{it.name}</p>
                    <p className="text-[11px] text-muted-foreground mt-0.5">Qty {it.quantity} · {inr(it.unit_price)} ea</p>
                  </div>
                  <span className="text-[13px] font-semibold tabular-nums shrink-0">{inr(it.line_total)}</span>
                </div>
              ))}
            </div>
          </Section>

          {loading && <div className="flex items-center gap-2 text-[12px] text-muted-foreground"><Loader2 className="size-3.5 animate-spin" /> Loading full payment & customer detail…</div>}
          {err && <p className="text-[12px] text-destructive">{err}</p>}
          <div className="flex items-center gap-1.5 text-[10px] text-muted-foreground pt-1"><ShieldCheck className="size-3" /> Staff-only · this view is audit-logged</div>
        </div>
      </div>
    </div>
  );
}

function Row({ k, v }: { k: string; v: React.ReactNode }) {
  return <div className="flex items-center justify-between gap-3 py-1 border-b border-border/40 last:border-0"><span className="text-muted-foreground">{k}</span><span className="text-right font-medium">{v}</span></div>;
}

/* ---------------- Redesigned section primitives ---------------- */

type Tone = "attn" | "calm" | "normal";

function SectionHeader({ title, sub, icon, actions }: { title: string; sub?: string; icon?: React.ReactNode; actions?: React.ReactNode }) {
  return (
    <div className="flex items-end justify-between gap-3 mb-5">
      <div className="min-w-0">
        <h2 className="text-lg sm:text-xl font-display font-semibold flex items-center gap-2.5 tracking-tight">{icon}<span className="truncate">{title}</span></h2>
        {sub && <p className="text-[12px] text-muted-foreground mt-1 leading-snug">{sub}</p>}
      </div>
      {actions && <div className="shrink-0">{actions}</div>}
    </div>
  );
}

function OverviewStat({ label, value, icon, tone, onClick }: { label: string; value: number; icon: React.ReactNode; tone: Tone; onClick?: () => void }) {
  const active = tone === "attn" && value > 0;
  const cls = active
    ? "border-amber-400/40 bg-amber-400/[0.06]"
    : "border-border/60 bg-card/30";
  const accentCls = active ? "text-amber-300" : tone === "calm" ? "text-emerald-300" : "text-accent";
  const valueCls = active ? "text-amber-300" : tone === "calm" ? "text-emerald-300" : "text-foreground";
  return (
    <button
      onClick={onClick}
      className={`text-left rounded-2xl border p-4 transition-colors hover:border-accent/40 ${cls}`}
    >
      <div className="flex items-center gap-2 text-muted-foreground mb-3">
        <span className={accentCls}>{icon}</span>
        <span className="text-[10px] font-mono uppercase tracking-[0.16em] truncate">{label}</span>
      </div>
      <p className={`text-[28px] sm:text-3xl font-display font-semibold tabular-nums leading-none ${valueCls}`}>{num(value)}</p>
    </button>
  );
}

const PRIORITY_TONE: Record<string, string> = {
  critical: "text-destructive border-destructive/40 bg-destructive/10",
  high: "text-amber-300 border-amber-400/40 bg-amber-400/10",
  medium: "text-sky-300 border-sky-400/40 bg-sky-400/10",
};

const PRIORITY_BAR: Record<string, string> = {
  critical: "bg-destructive",
  high: "bg-amber-400",
  medium: "bg-sky-400",
};

function ActionGroup({ label, count, priority, icon, onView }: { label: string; count: number; priority: "critical" | "high" | "medium"; icon: React.ReactNode; onView: () => void }) {
  const dim = count === 0;
  return (
    <div className={`relative overflow-hidden rounded-2xl border p-4 pl-5 flex flex-col gap-4 transition-colors ${dim ? "border-border/50 bg-card/30" : "border-border/70 bg-card/50 hover:border-accent/40"}`}>
      <span className={`absolute left-0 top-0 bottom-0 w-1 ${dim ? "bg-border/50" : PRIORITY_BAR[priority]}`} />
      <div className="flex items-start justify-between gap-2">
        <div className="flex items-center gap-2 min-w-0">
          <span className={dim ? "text-muted-foreground shrink-0" : "text-accent shrink-0"}>{icon}</span>
          <span className="text-sm font-medium truncate">{label}</span>
        </div>
        <span className={`shrink-0 text-[9px] font-mono uppercase tracking-widest px-2 py-0.5 rounded-full border ${PRIORITY_TONE[priority]}`}>{priority}</span>
      </div>
      <div className="flex items-end justify-between gap-2">
        <span className={`text-[32px] font-display font-semibold tabular-nums leading-none ${dim ? "text-muted-foreground/60" : "text-foreground"}`}>{num(count)}</span>
        <button
          onClick={onView}
          disabled={dim}
          className="text-[11px] font-medium px-3 py-1.5 rounded-lg border border-border hover:border-accent/40 hover:bg-muted/30 disabled:opacity-40 disabled:cursor-not-allowed inline-flex items-center gap-1 transition-colors"
        >
          View <ArrowDownRight className="size-3" />
        </button>
      </div>
    </div>
  );
}

function PipelineStage({ label, value, icon, last }: { label: string; value: number; icon: React.ReactNode; last?: boolean }) {
  const cur = value > 0;
  return (
    <div className="flex items-center gap-3 sm:gap-4 shrink-0">
      <div className={`rounded-2xl border px-4 py-3.5 min-w-[120px] text-center transition-colors ${cur ? "border-accent/30 bg-accent/[0.04]" : "border-border/60 bg-card/40"}`}>
        <div className="flex items-center justify-center gap-1.5 text-muted-foreground mb-2"><span className={cur ? "text-accent" : "text-muted-foreground"}>{icon}</span><span className="text-[10px] font-mono uppercase tracking-[0.12em]">{label}</span></div>
        <p className={`text-2xl font-display font-semibold tabular-nums leading-none ${cur ? "text-foreground" : "text-muted-foreground/60"}`}>{num(value)}</p>
      </div>
      {!last && <span className="text-muted-foreground/30 text-xl shrink-0">→</span>}
    </div>
  );
}

function MiniStat({ label, value, icon, tone }: { label: string; value: string; icon: React.ReactNode; tone?: Tone }) {
  const active = tone === "attn";
  const cls = active ? "border-amber-400/40 bg-amber-400/[0.05]" : "border-border/60 bg-card/40";
  const valueCls = active ? "text-amber-300" : tone === "calm" ? "text-emerald-300" : "text-foreground";
  const accentCls = active ? "text-amber-300" : tone === "calm" ? "text-emerald-300" : "text-accent";
  return (
    <div className={`rounded-2xl border p-4 transition-colors ${cls}`}>
      <div className="flex items-center gap-2 text-muted-foreground mb-3"><span className={accentCls}>{icon}</span><span className="text-[10px] font-mono uppercase tracking-[0.14em] truncate">{label}</span></div>
      <p className={`text-2xl font-display font-semibold tabular-nums leading-none ${valueCls}`}>{value}</p>
    </div>
  );
}

function OrderOpsPage() {
  const { data, staffPerf, loading, refreshing, error, refresh } = useOrderOperations();
  const [sel, setSel] = useState<EnrichedOrder | null>(null);
  const [q, setQ] = useState("");
  const [actionFilter, setActionFilter] = useState<{ label: string; ids: Set<string> } | null>(null);

  const filtered = useMemo(() => {
    if (!data) return [];
    let rows = data.orders;
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
  }, [data, q]);

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
  const ords = data.orders;
  const maxCourier = Math.max(1, ...data.courierPerformance.map((c) => c.shipments));
  const maxRegion = Math.max(1, ...data.regionPerformance.map((r) => r.orders));
  const maxReason = Math.max(1, ...data.returnReasons.map((r) => r.cnt));

  // ---- derived stage / action data (frontend only) ----
  const startToday = new Date(); startToday.setHours(0, 0, 0, 0);
  const today = +startToday;
  const isToday = (s: string | null) => (s ? +new Date(s) >= today : false);
  const stageStr = (o: EnrichedOrder) => `${o.fulfillment_status ?? ""} ${o.ship_status ?? ""} ${o.status ?? ""}`.toLowerCase();
  const isActive = (o: EnrichedOrder) => !["delivered", "cancelled", "canceled"].includes((o.status ?? "").toLowerCase());

  const packedOrders = ords.filter((o) => /pack/i.test(stageStr(o)) && isActive(o));
  const ofdOrders = ords.filter((o) => /out.?for.?delivery|ofd/i.test(stageStr(o)) && isActive(o));
  // Live stage classification — derived from the SAME `ords` source as Recent Orders,
  // so Overview / Pipeline / Action Required / Recent Orders never drift apart.
  const deliveredOrders = ords.filter((o) => o.delivered_at || /delivered|completed/i.test(o.status ?? ""));
  const shippedOrders = ords.filter((o) => (o.shipped_at || /shipped/i.test(stageStr(o))) && !o.delivered_at && !/delivered|completed/i.test(o.status ?? "") && !ofdOrders.includes(o));
  // A payment that failed / was not completed — excluded from the Pending stage.
  const isPaymentFailed = (o: EnrichedOrder) => /fail|declin|error|cancel|void|unpaid/i.test(o.payment_status ?? "");
  // Pending = active orders still early in fulfilment (pending/confirmed/processing),
  // i.e. not yet packed, shipped, out-for-delivery or delivered, and without a failed payment.
  const pendingOrders = ords.filter((o) =>
    isActive(o) && !o.shipped_at && !o.delivered_at && !isPaymentFailed(o) &&
    !packedOrders.includes(o) && !ofdOrders.includes(o) && !shippedOrders.includes(o));
  const cancelOrders = ords.filter((o) => /cancel/i.test(o.status ?? ""));
  const newToProcess = ords.filter((o) => o.payment_status === "paid" && !o.shipped_at && isActive(o));
  const failedOrders = data.warRoom.failed_payment;
  const returnOrders = data.warRoom.return_request;
  const supportOrders = data.warRoom.support_linked;

  const shippedToday = ords.filter((o) => isToday(o.shipped_at)).length;
  const deliveredTodayN = ords.filter((o) => isToday(o.delivered_at)).length;
  const deliveryPerf = k.shipped + k.delivered > 0 ? Math.round((k.delivered / (k.shipped + k.delivered)) * 100) : 0;

  const openTickets = data.staffSupport.reduce((a, s) => a + Math.max(0, s.tickets_handled - s.tickets_resolved), 0);
  const resolvedTickets = data.staffSupport.reduce((a, s) => a + s.tickets_resolved, 0);
  const urgentTickets = supportOrders.filter((o) => o.riskScore >= 60).length;

  const overview: { label: string; value: number; icon: React.ReactNode; tone: Tone; orders?: EnrichedOrder[] }[] = [
    { label: "Pending", value: pendingOrders.length, icon: <Clock className="size-3.5" />, tone: "attn", orders: pendingOrders },
    { label: "Packed", value: packedOrders.length, icon: <Package className="size-3.5" />, tone: "normal", orders: packedOrders },
    { label: "Shipped", value: shippedOrders.length, icon: <Truck className="size-3.5" />, tone: "normal", orders: shippedOrders },
    { label: "Out for Delivery", value: ofdOrders.length, icon: <MapPin className="size-3.5" />, tone: "normal", orders: ofdOrders },
    { label: "Delivered", value: deliveredOrders.length, icon: <Check className="size-3.5" />, tone: "calm", orders: deliveredOrders },
    { label: "Failed Payments", value: k.failed_payments, icon: <CreditCard className="size-3.5" />, tone: "attn", orders: failedOrders },

    { label: "Cancel Requests", value: cancelOrders.length, icon: <X className="size-3.5" />, tone: "attn", orders: cancelOrders },
    { label: "Return Requests", value: returnOrders.length, icon: <RotateCcw className="size-3.5" />, tone: "attn", orders: returnOrders },
  ];

  const actionGroups: { key: string; label: string; orders: EnrichedOrder[]; priority: "critical" | "high" | "medium"; icon: React.ReactNode }[] = [
    { key: "new", label: "New Orders To Process", orders: newToProcess, priority: "high", icon: <Sparkles className="size-4" /> },
    { key: "failed", label: "Failed Payments", orders: failedOrders, priority: "critical", icon: <CreditCard className="size-4" /> },
    { key: "cancel", label: "Cancellation Requests", orders: cancelOrders, priority: "high", icon: <X className="size-4" /> },
    { key: "return", label: "Return Requests", orders: returnOrders, priority: "medium", icon: <RotateCcw className="size-4" /> },
    { key: "support", label: "Customer Support Requests", orders: supportOrders, priority: "medium", icon: <LifeBuoy className="size-4" /> },
  ];

  const pipeline: { label: string; value: number; icon: React.ReactNode; orders: EnrichedOrder[] }[] = [
    { label: "Pending", value: pendingOrders.length, icon: <Clock className="size-3.5" />, orders: pendingOrders },
    { label: "Packed", value: packedOrders.length, icon: <Package className="size-3.5" />, orders: packedOrders },
    { label: "Shipped", value: shippedOrders.length, icon: <Truck className="size-3.5" />, orders: shippedOrders },
    { label: "Out for Delivery", value: ofdOrders.length, icon: <MapPin className="size-3.5" />, orders: ofdOrders },
    { label: "Delivered", value: deliveredOrders.length, icon: <Check className="size-3.5" />, orders: deliveredOrders },
  ];

  const focusOrders = (label: string, list: EnrichedOrder[]) => {
    if (list.length === 0) return;
    setActionFilter({ label, ids: new Set(list.map((o) => o.id)) });
    requestAnimationFrame(() => document.getElementById("recent-orders")?.scrollIntoView({ behavior: "smooth", block: "start" }));
  };

  const recentList = actionFilter ? data.orders.filter((o) => actionFilter.ids.has(o.id)) : filtered;



  return (
    <AdminShell
      title="Order Operations Center"
      subtitle="Live operations — see what needs attention, what's blocked, and who needs a response"
      allow={ALLOW}
      actions={
        <div className="flex items-center gap-2">
          {refreshing && <Loader2 className="size-3.5 animate-spin text-accent" />}
          <button onClick={refresh} className="inline-flex items-center gap-1.5 text-xs px-3 py-1.5 rounded-lg border border-border hover:border-accent/40"><RefreshCw className="size-3.5" /> Refresh</button>
          <ExportMenu data={data} />
        </div>
      }
    >
      <div className="space-y-12">
        {/* SECTION 1 — OPERATIONS OVERVIEW */}
        <section>
          <SectionHeader title="Operations Overview" sub="A single glance at the whole pipeline" icon={<Gauge className="size-5 text-accent" />} />
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-3 sm:gap-4">
            {overview.map((o) => (
              <OverviewStat key={o.label} label={o.label} value={o.value} icon={o.icon} tone={o.tone} onClick={() => focusOrders(o.label, o.orders ?? [])} />
            ))}
          </div>
        </section>

        {/* SECTION 2 — ACTION REQUIRED */}
        <section className="relative rounded-3xl border border-amber-400/20 bg-amber-400/[0.02] p-4 sm:p-6">
          <SectionHeader title="Action Required" sub="Your primary workspace — orders and customers waiting on you" icon={<AlertTriangle className="size-5 text-amber-300" />} />
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3 sm:gap-4">
            {actionGroups.map((g) => (
              <ActionGroup key={g.key} label={g.label} count={g.orders.length} priority={g.priority} icon={g.icon} onView={() => focusOrders(g.label, g.orders)} />
            ))}
          </div>
        </section>

        {/* SECTION 3 — ORDER PIPELINE */}
        <section>
          <SectionHeader title="Order Pipeline" sub="Spot bottlenecks across the fulfilment flow" icon={<TrendingUp className="size-5 text-accent" />} />
          <div className="card-premium rounded-3xl p-4 sm:p-6 overflow-x-auto">
            <div className="flex items-center gap-3 sm:gap-4 min-w-max pb-1">
              {pipeline.map((p, i) => (
                <button key={p.label} onClick={() => focusOrders(p.label, p.orders)} className="text-left">
                  <PipelineStage label={p.label} value={p.value} icon={p.icon} last={i === pipeline.length - 1} />
                </button>
              ))}
            </div>
          </div>
        </section>

        {/* SECTION 4 — RECENT ORDERS */}
        <section id="recent-orders" className="scroll-mt-24">
          <SectionHeader
            title="Recent Orders"
            sub={actionFilter ? undefined : "Search and review the latest orders"}
            icon={<ShoppingBag className="size-5 text-accent" />}
          />
          <div className="space-y-4">
            {actionFilter ? (
              <div className="flex items-center gap-2 flex-wrap">
                <span className="inline-flex items-center gap-2 text-xs font-medium px-3 py-1.5 rounded-full border border-accent/40 bg-accent/10 text-accent">
                  {actionFilter.label} · {recentList.length}
                  <button onClick={() => setActionFilter(null)} className="hover:text-foreground"><X className="size-3.5" /></button>
                </span>
                <span className="text-[11px] text-muted-foreground">Showing filtered orders — clear to browse all</span>
              </div>
            ) : (
              <div className="relative">
                <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 size-4 text-muted-foreground" />
                <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search orders, customers, products, tracking…" className="w-full pl-10 pr-3 py-3 text-sm rounded-xl border border-border bg-background focus:border-accent/40 outline-none transition-colors" />
              </div>
            )}
            <div className="card-premium rounded-3xl p-3 sm:p-4">
              <div className="flex items-center justify-between px-1 mb-2.5">
                <p className="text-[11px] font-mono uppercase tracking-widest text-muted-foreground">{recentList.length} orders</p>
                {recentList.length > 60 && <p className="text-[10px] text-muted-foreground">Showing first 60</p>}
              </div>
              <div className="space-y-1 max-h-[70vh] overflow-y-auto -mx-1 px-1">
                {recentList.slice(0, 60).map((o) => <OrderRow key={o.id} o={o} onClick={() => setSel(o)} />)}
                {recentList.length === 0 && (
                  <div className="py-12 text-center">
                    <ShoppingBag className="size-7 text-muted-foreground/40 mx-auto mb-2" />
                    <p className="text-sm text-muted-foreground">No orders match.</p>
                  </div>
                )}
              </div>
            </div>
          </div>
        </section>

        {/* SECTION 5 — DELIVERY MONITOR */}
        <section>
          <SectionHeader title="Delivery Monitor" sub="Live shipping & delivery health" icon={<Truck className="size-5 text-accent" />} />
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 sm:gap-4">
            <MiniStat label="Shipped Today" value={num(shippedToday)} icon={<Truck className="size-3.5" />} />
            <MiniStat label="Delayed" value={num(f.delayedCount)} icon={<AlertTriangle className="size-3.5" />} tone={f.delayedCount > 0 ? "attn" : "normal"} />
            <MiniStat label="Delivered Today" value={num(deliveredTodayN)} icon={<Check className="size-3.5" />} tone="calm" />
            <MiniStat label="Delivery Performance" value={`${deliveryPerf}%`} icon={<Gauge className="size-3.5" />} />
          </div>
        </section>

        {/* SECTION 6 — SUPPORT CENTER */}
        <section className="rounded-3xl border border-border/60 bg-card/30 p-4 sm:p-6">
          <SectionHeader title="Support Center" sub="Customer conversations, kept separate from fulfilment" icon={<LifeBuoy className="size-5 text-accent" />} />
          <div className="grid grid-cols-2 lg:grid-cols-3 gap-3 sm:gap-4">
            <MiniStat label="Open Tickets" value={num(openTickets)} icon={<LifeBuoy className="size-3.5" />} tone={openTickets > 0 ? "attn" : "normal"} />
            <MiniStat label="Urgent Tickets" value={num(urgentTickets)} icon={<AlertTriangle className="size-3.5" />} tone={urgentTickets > 0 ? "attn" : "normal"} />
            <MiniStat label="Resolved" value={num(resolvedTickets)} icon={<Check className="size-3.5" />} tone="calm" />
          </div>
        </section>

        {/* Integrity monitor preserved */}
        <OrderIntegrityMonitor />

        {/* Advanced analytics — full detail preserved */}
        <section>
          <SectionHeader title="Advanced Analytics" sub="Deep operational reporting" icon={<Zap className="size-5 text-accent" />} />
          <Tabs defaultValue="fulfillment">
            <TabsList className="flex-wrap h-auto">
              <TabsTrigger value="fulfillment">Fulfilment</TabsTrigger>
              <TabsTrigger value="delivery">Delivery</TabsTrigger>
              <TabsTrigger value="returns">Returns &amp; Refunds</TabsTrigger>
              <TabsTrigger value="staff">Staff</TabsTrigger>
              <TabsTrigger value="performance">Performance</TabsTrigger>
            </TabsList>

            {/* FULFILMENT */}
            <TabsContent value="fulfillment" className="space-y-5 mt-4">
              <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                <KpiCard label="Avg Processing" value={f.avgProcessingHours != null ? `${f.avgProcessingHours.toFixed(1)}h` : "—"} icon={<Clock className="size-4" />} />
                <KpiCard label="Avg Delivery" value={f.avgDeliveryDays != null ? `${f.avgDeliveryDays.toFixed(1)}d` : "—"} icon={<Truck className="size-4" />} />
                <KpiCard label="Delayed" value={num(f.delayedCount)} icon={<AlertTriangle className="size-4" />} />
                <KpiCard label="In Transit" value={num(ords.filter((o) => o.shipped_at && !o.delivered_at).length)} icon={<Zap className="size-4" />} />
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
                          <th className="text-right font-medium py-2 px-3">Packed</th>
                          <th className="text-right font-medium py-2 px-3">Shipped</th>
                          <th className="text-right font-medium py-2 px-3">Refunds</th>
                          <th className="text-right font-medium py-2 px-3">Actions</th>
                          <th className="text-right font-medium py-2 px-3">Avg Handling</th>
                          <th className="text-right font-medium py-2 pl-3">Last Active</th>
                        </tr>
                      </thead>
                      <tbody>
                        {staffPerf.map((s) => (
                          <tr key={s.uid} className="border-b border-border/40 last:border-0">
                            <td className="py-2 pr-3">
                              <div className="flex items-center gap-2 min-w-0">
                                <Avatar name={s.full_name} url={s.avatar_url} size={26} />
                                <div className="min-w-0">
                                  <p className="font-medium truncate">{s.full_name ?? "Staff"}</p>
                                  <p className="text-[10px] text-muted-foreground truncate">{s.roles.join(", ") || "—"}</p>
                                </div>
                              </div>
                            </td>
                            <td className="text-right tabular-nums py-2 px-3">{num(s.packed)}</td>
                            <td className="text-right tabular-nums py-2 px-3">{num(s.shipped)}</td>
                            <td className="text-right tabular-nums py-2 px-3">{num(s.refunds_handled)}</td>
                            <td className="text-right tabular-nums py-2 px-3">{num(s.total_actions)}</td>
                            <td className="text-right tabular-nums py-2 px-3">{s.avg_handling_hours != null ? `${s.avg_handling_hours.toFixed(1)}h` : "—"}</td>
                            <td className="text-right text-muted-foreground py-2 pl-3">{timeAgo(s.last_action)}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </Card>
            </TabsContent>
          </Tabs>
        </section>
      </div>

      {sel && <OrderDrawer o={sel} onClose={() => setSel(null)} onRefresh={refresh} />}
    </AdminShell>
  );
}
