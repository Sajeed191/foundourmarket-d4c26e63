import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useMemo, useRef, useState } from "react";
import {
  Loader2, Plus, Search, X, Package, Truck, CheckCircle2, RotateCcw, Ban,
  MapPin, Mail, Phone, User, CalendarClock, Hash, RefreshCw, AlertTriangle,
  Activity, Gauge, Users, Radio, Download, Send, TrendingUp,
  ShieldAlert, Clock, PackageCheck, FileText, FileSpreadsheet, Printer, Wifi, WifiOff,
  Copy, Receipt, ChevronDown,
} from "lucide-react";
import { AdminShell, logActivity } from "@/components/admin/AdminShell";
import { supabase } from "@/integrations/supabase/client";
import { createShipmentNotification } from "@/lib/shipment-notify.functions";
import {
  computeDelay, computeKpis, computeHealthScore, computeCourierPerf,
  matchQueue, QUEUE_LABEL, SEVERITY_LABEL, HEALTH_LABEL,
  type ShipRow, type OrderRow, type EventRow, type DelayInfo, type QueueKey, type HealthTier,
} from "@/lib/shipment-analytics";
import type { ShipmentExportRow } from "@/lib/packing-slip";
// PDF stack (jspdf + qrcode + invoice generator) is loaded on demand only —
// keeps ~470KB of jspdf out of the admin route chunk until a document is
// actually requested.
const loadPacking = () => import("@/lib/packing-slip");
const loadInvoice = () => import("@/lib/invoice");
import { SUPPORTED_COURIERS, courierLabel } from "@/lib/courier";
import { AnimatedCounter } from "@/components/site/Reveal";
import { toast } from "sonner";

export const Route = createFileRoute("/admin-shipments")({
  validateSearch: (search) => ({
    order: typeof search.order === "string" ? search.order : undefined,
    shipment: typeof search.shipment === "string" ? search.shipment : undefined,
    queue: typeof search.queue === "string" ? search.queue : undefined,
  }),
  head: () => ({ meta: [{ title: "Shipment Command Center — Admin" }] }),
  component: AdminShipmentsPage,
});

type ShipAddress = {
  full_name?: string; phone?: string; line1?: string; line2?: string;
  city?: string; state?: string; postal?: string; country?: string;
} | null;

type OrderItem = {
  name: string;
  quantity: number;
  image: string | null;
  product_slug: string | null;
  unit_price: number | null;
  line_total: number | null;
};
type Order = OrderRow & { payment_method: string | null; order_items: OrderItem[]; shipping_address: ShipAddress };
type Shipment = ShipRow & { notes: string | null };

const STATUSES = [
  "pending", "packed", "shipped", "in_transit", "out_for_delivery",
  "delivered", "failed_delivery", "returned", "cancelled",
] as const;
type ShipStatus = (typeof STATUSES)[number];

const STATUS_LABEL: Record<string, string> = {
  pending: "Pending", packed: "Packed", shipped: "Shipped",
  in_transit: "In Transit", out_for_delivery: "Out for Delivery",
  delivered: "Delivered", failed_delivery: "Failed Delivery",
  returned: "Returned", cancelled: "Cancelled",
};

const STATUS_CLS: Record<string, string> = {
  pending: "text-amber-400 border-amber-400/30 bg-amber-400/10",
  packed: "text-sky-400 border-sky-400/30 bg-sky-400/10",
  shipped: "text-sky-400 border-sky-400/30 bg-sky-400/10",
  in_transit: "text-indigo-400 border-indigo-400/30 bg-indigo-400/10",
  out_for_delivery: "text-violet-400 border-violet-400/30 bg-violet-400/10",
  delivered: "text-emerald-400 border-emerald-400/30 bg-emerald-400/10",
  failed_delivery: "text-destructive border-destructive/30 bg-destructive/10",
  returned: "text-orange-400 border-orange-400/30 bg-orange-400/10",
  cancelled: "text-muted-foreground border-border bg-muted/30",
};

const ORDER_FULFILLMENT: Record<string, string> = {
  pending: "unfulfilled", packed: "processing", shipped: "shipped",
  in_transit: "shipped", out_for_delivery: "shipped", delivered: "delivered",
  failed_delivery: "shipped", returned: "returned", cancelled: "cancelled",
};

async function notifyCustomer(userId: string | null, orderId: string, status: string) {
  if (!userId) return;
  try {
    const res = await createShipmentNotification({ data: { targetUserId: userId, orderId, status: status as never } });
    if (!res.ok) console.error("[shipment.notify] failed", res.reason);
  } catch (e) {
    console.error("[shipment.notify] error", e);
  }
}

const PAGE = 25;
const fmtDate = (s: string | null) => (s ? new Date(s).toLocaleDateString() : "—");
const fmtTime = (s: string) => new Date(s).toLocaleString([], { month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" });
const money = (n: number, c: string | null) =>
  (c === "USD" ? "$" : "₹") + Math.round(n || 0).toLocaleString(c === "USD" ? "en-US" : "en-IN");
const pct = (n: number) => `${Math.round(n * 100)}%`;
const shortId = (id: string) => id.slice(0, 8).toUpperCase();
const safeText = (...values: unknown[]) => values.find((v) => typeof v === "string" && v.trim()) as string | undefined;
const paymentLabel = (method: string | null | undefined, status: string | null | undefined) => {
  const raw = (method || status || "").toLowerCase();
  if (!raw) return "—";
  if (raw.includes("global_beta") || raw === "demo") return "Demo payment";
  if (raw.includes("cod") || raw.includes("cash")) return "Cash on delivery";
  if (raw.includes("upi")) return "UPI";
  if (raw.includes("card")) return "Card";
  if (raw.includes("razorpay")) return "Razorpay";
  if (raw === "paid" || raw === "succeeded" || raw === "captured") return "Online paid";
  return method ?? status ?? "—";
};

const SEV_CLS: Record<string, string> = {
  minor: "text-amber-400 border-amber-400/30 bg-amber-400/10",
  moderate: "text-orange-400 border-orange-400/30 bg-orange-400/10",
  critical: "text-destructive border-destructive/30 bg-destructive/10",
};
const HEALTH_CLS: Record<HealthTier, string> = {
  excellent: "text-emerald-400", good: "text-sky-400", attention: "text-amber-400", critical: "text-destructive",
};

type FeedItem = { id: string; kind: string; label: string; detail: string; at: string; tone: string };
type ShipmentPair = { order: Order; ship: Shipment | null };
const OP_QUEUE_KEYS: QueueKey[] = ["all", "pending", "needs_tracking", "packed", "in_transit", "out_for_delivery", "delivered", "delayed", "stuck", "failed_delivery", "returned", "rto", "cancelled"];
const isQueueKey = (v: string | undefined): v is QueueKey => !!v && OP_QUEUE_KEYS.includes(v as QueueKey);

function pairMatchesSearch({ order, ship }: ShipmentPair, term: string) {
  if (!term) return true;
  const addr = order.shipping_address;
  const itemText = order.order_items?.map((it) => `${it.name} ${it.product_slug ?? ""}`).join(" ") ?? "";
  return [order.id, ship?.tracking_number, order.tracking_number, addr?.full_name, addr?.city, addr?.state, order.contact_email, addr?.phone, ship?.carrier, order.carrier, order.payment_method, itemText]
    .some((v) => (v ?? "").toString().toLowerCase().includes(term));
}

function pairMatchesQueue({ order, ship }: ShipmentPair, queue: QueueKey, delayById: Map<string, DelayInfo>) {
  if (queue === "all") return true;
  if (!ship) return queue === "pending" && !["cancelled", "delivered", "returned"].includes(order.status);
  return matchQueue(queue, ship, delayById.get(ship.id) ?? computeDelay(ship, null));
}

// ── Export row builder (single source of truth for every export format) ────────
function buildExportRow(order: Order, ship: Shipment | null): ShipmentExportRow {
  const addr = order.shipping_address;
  const units = order.order_items?.reduce((a, b) => a + (b.quantity || 0), 0) ?? 0;
  return {
    orderId: order.id,
    trackingNumber: ship?.tracking_number ?? order.tracking_number ?? "",
    courier: courierLabel(ship?.carrier ?? order.carrier) ?? "",
    status: ship?.status ?? order.fulfillment_status ?? "pending",
    customer: addr?.full_name ?? "",
    email: order.contact_email ?? "",
    phone: addr?.phone ?? "",
    city: addr?.city ?? "",
    state: addr?.state ?? "",
    total: order.total,
    currency: order.currency,
    units,
    estimatedDelivery: ship?.estimated_delivery ?? null,
    shippedAt: ship?.shipped_at ?? null,
    deliveredAt: ship?.delivered_at ?? null,
    createdAt: order.created_at,
  };
}

// ── Mini shipment timeline ─────────────────────────────────────────────────────
const TIMELINE_STAGES = [
  { key: "pending", label: "Pending" },
  { key: "packed", label: "Packed" },
  { key: "shipped", label: "Pickup" },
  { key: "in_transit", label: "In Transit" },
  { key: "out_for_delivery", label: "Out" },
  { key: "delivered", label: "Delivered" },
] as const;

const STAGE_INDEX: Record<string, number> = {
  pending: 0, packed: 1, shipped: 2, in_transit: 3, out_for_delivery: 4, delivered: 5,
};

function MiniTimeline({ status }: { status: string }) {
  const terminal = status === "cancelled" || status === "returned" || status === "failed_delivery";
  const active = STAGE_INDEX[status] ?? 0;
  return (
    <div className="flex items-center gap-1 w-full">
      {TIMELINE_STAGES.map((stage, i) => {
        const done = !terminal && i <= active;
        return (
          <div key={stage.key} className="flex-1 flex flex-col items-center gap-1 min-w-0">
            <div className="flex items-center w-full">
              <span className={`size-2 rounded-full shrink-0 transition-colors duration-300 ${done ? "bg-accent shadow-[0_0_8px_color-mix(in_oklab,var(--accent)_60%,transparent)]" : "bg-border"}`} />
              {i < TIMELINE_STAGES.length - 1 && (
                <span className={`h-px flex-1 transition-colors duration-300 ${!terminal && i < active ? "bg-accent" : "bg-border"}`} />
              )}
            </div>
            <span className={`text-[8px] uppercase tracking-wide truncate w-full text-center ${done ? "text-accent" : "text-muted-foreground"}`}>{stage.label}</span>
          </div>
        );
      })}
    </div>
  );
}

// ── Searchable courier dropdown (native datalist — lightweight, accessible) ─────
function CourierSelect({ value, onSave }: { value: string; onSave: (v: string) => void }) {
  return (
    <div>
      <label className="text-[10px] uppercase tracking-widest text-muted-foreground">Courier</label>
      <input
        list="courier-options"
        defaultValue={courierLabel(value) ?? value}
        placeholder="Search courier…"
        onBlur={(e) => { const v = e.target.value.trim(); if (v !== value) onSave(v); }}
        className="mt-1 w-full bg-background border border-border rounded-lg px-3 py-2 text-xs focus:outline-none focus:border-accent"
      />
      <datalist id="courier-options">
        {SUPPORTED_COURIERS.map((c) => <option key={c.key} value={c.label} />)}
      </datalist>
    </div>
  );
}

// ── Export menu (CSV / Excel / PDF / Packing slips, with scope) ────────────────
type ExportScope = "selected" | "filtered" | "all";
function ExportMenu({ selectedCount, onExport, onPackingSlips }: {
  selectedCount: number;
  onExport: (format: "csv" | "excel" | "pdf", scope: ExportScope) => void;
  onPackingSlips: (scope: ExportScope) => void;
}) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement | null>(null);
  useEffect(() => {
    const onDoc = (e: MouseEvent) => { if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false); };
    document.addEventListener("mousedown", onDoc);
    return () => document.removeEventListener("mousedown", onDoc);
  }, []);
  const scope: ExportScope = selectedCount > 0 ? "selected" : "filtered";
  const scopeLabel = selectedCount > 0 ? `${selectedCount} selected` : "filtered view";
  const items: { label: string; icon: React.ReactNode; run: () => void }[] = [
    { label: "Export CSV", icon: <FileText className="size-3.5" />, run: () => onExport("csv", scope) },
    { label: "Export Excel", icon: <FileSpreadsheet className="size-3.5" />, run: () => onExport("excel", scope) },
    { label: "Export PDF", icon: <FileText className="size-3.5" />, run: () => onExport("pdf", scope) },
    { label: "Download Packing Slips", icon: <Printer className="size-3.5" />, run: () => onPackingSlips(scope) },
  ];
  return (
    <div className="relative" ref={ref}>
      <button onClick={() => setOpen((o) => !o)}
        className="inline-flex items-center gap-1.5 text-xs px-3 py-2 rounded-xl border border-border hover:border-accent/40">
        <Download className="size-3.5" /> Export <ChevronDown className={`size-3 transition-transform ${open ? "rotate-180" : ""}`} />
      </button>
      {open && (
        <div className="absolute right-0 z-30 mt-1.5 w-56 rounded-xl border border-border bg-background/95 backdrop-blur-xl p-1.5 shadow-xl">
          <div className="px-2.5 py-1.5 text-[10px] uppercase tracking-widest text-muted-foreground">Scope · {scopeLabel}</div>
          {items.map((it) => (
            <button key={it.label} onClick={() => { it.run(); setOpen(false); }}
              className="flex w-full items-center gap-2 rounded-lg px-2.5 py-2 text-xs hover:bg-accent/10 hover:text-accent">
              {it.icon}{it.label}
            </button>
          ))}
          <div className="my-1 h-px bg-border/60" />
          <button onClick={() => { onExport("csv", "all"); setOpen(false); }}
            className="flex w-full items-center gap-2 rounded-lg px-2.5 py-2 text-xs text-muted-foreground hover:bg-accent/10 hover:text-accent">
            <Download className="size-3.5" /> Export ALL as CSV
          </button>
        </div>
      )}
    </div>
  );
}

// ── Enterprise system status card ──────────────────────────────────────────────
function SystemStatusCard({ online, lastUpdated, courierCount, pending, health }: {
  online: boolean; lastUpdated: number; courierCount: number; pending: number; health: { score: number; tier: HealthTier };
}) {
  const syncTime = new Date(lastUpdated).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
  const tiles = [
    {
      icon: online ? <Wifi className="size-4" /> : <WifiOff className="size-4" />,
      label: "Realtime Sync",
      value: online ? "Active" : "Offline",
      tone: online ? "text-emerald-400" : "text-muted-foreground",
      dot: online,
    },
    { icon: <Truck className="size-4" />, label: "Connected Couriers", value: `${courierCount} courier${courierCount !== 1 ? "s" : ""}`, tone: "text-accent" },
    { icon: <Clock className="size-4" />, label: "Last Sync", value: syncTime, tone: "text-sky-400" },
    { icon: <Gauge className="size-4" />, label: "Health Score", value: `${health.score}%`, tone: HEALTH_CLS[health.tier] },
  ];
  return (
    <div className="card-premium rounded-2xl p-4">
      <div className="flex items-center gap-2 mb-3">
        <span className="relative flex size-2">
          <span className={`absolute inline-flex h-full w-full rounded-full opacity-60 ${online ? "bg-emerald-400 animate-ping" : "bg-muted-foreground"}`} />
          <span className={`relative inline-flex rounded-full size-2 ${online ? "bg-emerald-400" : "bg-muted-foreground"}`} />
        </span>
        <h2 className="text-[11px] font-bold uppercase tracking-[0.18em] text-muted-foreground">System Status</h2>
        {pending > 0 && (
          <span className="ml-auto inline-flex items-center gap-1 text-[11px] font-semibold text-amber-400">
            <AlertTriangle className="size-3.5" />{pending} awaiting action
          </span>
        )}
      </div>
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5">
        {tiles.map((t) => (
          <div key={t.label} className="rounded-xl border border-border/50 bg-background/40 p-3">
            <div className="flex items-center justify-between">
              <span className={t.tone}>{t.icon}</span>
              {"dot" in t && t.dot && (
                <span className="size-1.5 rounded-full bg-emerald-400 shadow-[0_0_8px_color-mix(in_oklab,var(--accent)_60%,transparent)]" />
              )}
            </div>
            <div className={`mt-2 text-base font-bold leading-none ${t.tone}`}>{t.value}</div>
            <div className="mt-1 text-[10px] uppercase tracking-widest text-muted-foreground">{t.label}</div>
          </div>
        ))}
      </div>
    </div>
  );
}

// ── Revenue operations strip ────────────────────────────────────────────────────
type RevenueOps = { revenueToday: number; ordersToday: number; pendingPayments: number; codOrders: number; refundRequests: number; currency: string | null };
function RevenueStrip({ ops }: { ops: RevenueOps }) {
  const cards = [
    { label: "Revenue Today", value: money(ops.revenueToday, ops.currency), icon: <TrendingUp className="size-3.5" />, tone: "text-emerald-400" },
    { label: "Pending Payments", value: String(ops.pendingPayments), icon: <Clock className="size-3.5" />, tone: ops.pendingPayments ? "text-amber-400" : "text-foreground" },
    { label: "COD Orders", value: String(ops.codOrders), icon: <Receipt className="size-3.5" />, tone: "text-foreground" },
    { label: "Refund Requests", value: String(ops.refundRequests), icon: <RotateCcw className="size-3.5" />, tone: ops.refundRequests ? "text-orange-400" : "text-foreground" },
  ];
  return (
    <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5">
      {cards.map((c) => (
        <div key={c.label} className="card-premium rounded-xl px-3 py-2.5">
          <div className="flex items-center justify-between text-muted-foreground">
            <span className="text-[9px] uppercase tracking-widest">{c.label}</span>
            <span className={c.tone}>{c.icon}</span>
          </div>
          <div className={`mt-1.5 text-base font-bold tabular-nums leading-none ${c.tone}`}>{c.value}</div>
        </div>
      ))}
    </div>
  );
}


function StatusPill({ status }: { status: string }) {
  return (
    <span className={`inline-flex items-center text-[10px] font-mono uppercase tracking-wider px-2 py-0.5 rounded-full border ${STATUS_CLS[status] ?? STATUS_CLS.pending}`}>
      {STATUS_LABEL[status] ?? status}
    </span>
  );
}

type Section = "operations" | "couriers" | "customers" | "warroom";

function AdminShipmentsPage() {
  const search = Route.useSearch();
  const [orders, setOrders] = useState<Order[] | null>(null);
  const [shipments, setShipments] = useState<Shipment[]>([]);
  const [events, setEvents] = useState<EventRow[]>([]);
  const [feed, setFeed] = useState<FeedItem[]>([]);
  const [creating, setCreating] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [q, setQ] = useState("");
  const [queue, setQueue] = useState<QueueKey>("all");
  const [section, setSection] = useState<Section>("operations");
  const [visible, setVisible] = useState(PAGE);
  const [refreshing, setRefreshing] = useState(false);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [bulkBusy, setBulkBusy] = useState(false);
  const [online, setOnline] = useState(false);
  const [lastUpdated, setLastUpdated] = useState(Date.now());
  const reloadTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => { void load(); }, []);

  useEffect(() => {
    if (search.order || search.shipment) {
      setSection("operations");
      setQ(search.order ?? search.shipment ?? "");
      setQueue("all");
      setVisible(PAGE);
    } else if (isQueueKey(search.queue)) {
      setSection("operations");
      setQueue(search.queue);
      setVisible(PAGE);
    }
  }, [search.order, search.shipment, search.queue]);

  // Realtime: any change to logistics tables refreshes the dashboard (debounced)
  // and pushes a live entry into the War Room feed.
  useEffect(() => {
    const scheduleReload = () => {
      if (reloadTimer.current) clearTimeout(reloadTimer.current);
      reloadTimer.current = setTimeout(() => void load(true), 600);
    };
    const ch = supabase
      .channel("shipment-command-center")
      .on("postgres_changes", { event: "*", schema: "public", table: "shipments" }, scheduleReload)
      .on("postgres_changes", { event: "INSERT", schema: "public", table: "shipment_events" }, (p) => {
        const e = p.new as EventRow;
        pushFeed({
          id: `ev-${e.id}`, kind: "event",
          label: STATUS_LABEL[e.status] ?? e.status,
          detail: e.description ?? "Shipment event", at: e.occurred_at ?? e.created_at,
          tone: e.status,
        });
        scheduleReload();
      })
      .on("postgres_changes", { event: "INSERT", schema: "public", table: "courier_webhook_events" }, (p) => {
        const w = p.new as { id: string; courier: string | null; status: string | null; received_at: string };
        pushFeed({
          id: `wh-${w.id}`, kind: "webhook", label: "Courier Webhook Received",
          detail: `${w.courier ?? "courier"} · ${w.status ?? "scan"}`, at: w.received_at, tone: "in_transit",
        });
      })
      .on("postgres_changes", { event: "INSERT", schema: "public", table: "notifications" }, (p) => {
        const n = p.new as { id: string; title: string; created_at: string; type: string };
        if (!/ship|order|deliver/i.test(`${n.type} ${n.title}`)) return;
        pushFeed({ id: `nt-${n.id}`, kind: "notify", label: "Customer Notified", detail: n.title, at: n.created_at, tone: "delivered" });
      })
      .subscribe((status) => setOnline(status === "SUBSCRIBED"));
    return () => { setOnline(false); supabase.removeChannel(ch); if (reloadTimer.current) clearTimeout(reloadTimer.current); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  function pushFeed(item: FeedItem) {
    setFeed((prev) => (prev.some((f) => f.id === item.id) ? prev : [item, ...prev].slice(0, 80)));
  }

  async function load(silent = false) {
    if (!silent) setRefreshing(true);
    const [{ data: o }, { data: s }, { data: ev }, { data: wh }, { data: nt }] = await Promise.all([
      supabase.from("orders")
        .select("id,user_id,status,total,currency,contact_email,payment_status,payment_method,fulfillment_status,tracking_number,carrier,shipping_address,created_at,order_items(name,quantity,image,product_slug,unit_price,line_total)")
        .order("created_at", { ascending: false }).limit(1000),
      supabase.from("shipments").select("*").order("created_at", { ascending: false }),
      supabase.from("shipment_events").select("*").order("occurred_at", { ascending: false }).limit(120),
      supabase.from("courier_webhook_events").select("id,courier,status,received_at").order("received_at", { ascending: false }).limit(40),
      supabase.from("notifications").select("id,title,type,created_at").order("created_at", { ascending: false }).limit(60),
    ]);
    setOrders((o as Order[]) ?? []);
    setShipments((s as Shipment[]) ?? []);
    const evRows = (ev as EventRow[]) ?? [];
    setEvents(evRows);

    // Build initial War Room feed from real rows.
    const evFeed: FeedItem[] = evRows.map((e) => ({
      id: `ev-${e.id}`, kind: "event", label: STATUS_LABEL[e.status] ?? e.status,
      detail: e.description ?? "Shipment event", at: e.occurred_at ?? e.created_at, tone: e.status,
    }));
    const whFeed: FeedItem[] = ((wh as { id: string; courier: string | null; status: string | null; received_at: string }[]) ?? []).map((w) => ({
      id: `wh-${w.id}`, kind: "webhook", label: "Courier Webhook Received",
      detail: `${w.courier ?? "courier"} · ${w.status ?? "scan"}`, at: w.received_at, tone: "in_transit",
    }));
    const ntFeed: FeedItem[] = ((nt as { id: string; title: string; type: string; created_at: string }[]) ?? [])
      .filter((n) => /ship|order|deliver/i.test(`${n.type} ${n.title}`))
      .map((n) => ({ id: `nt-${n.id}`, kind: "notify", label: "Customer Notified", detail: n.title, at: n.created_at, tone: "delivered" }));
    setFeed([...evFeed, ...whFeed, ...ntFeed].sort((a, b) => +new Date(b.at) - +new Date(a.at)).slice(0, 80));
    setLastUpdated(Date.now());
    if (!silent) setRefreshing(false);
  }

  async function createShipment(o: Order) {
    setCreating(o.id);
    const { error, data } = await supabase.from("shipments").insert({
      order_id: o.id, user_id: o.user_id, status: "pending", carrier: o.carrier, tracking_number: o.tracking_number,
    }).select().single();
    setCreating(null);
    if (error) { toast.error(error.message); return; }
    const created = data as { id: string } | null;
    if (created?.id) {
      await supabase.from("shipment_events").insert({
        shipment_id: created.id, status: "pending", description: "Shipment created — preparing your order",
      });
    }
    toast.success("Shipment created");
    logActivity("shipment_create", "shipment", created?.id, { order_id: o.id });
    setShipments((prev) => [data as Shipment, ...prev]);
  }

  async function patchShipment(s: Shipment, patch: Partial<Shipment>) {
    const { error } = await supabase.from("shipments").update(patch as never).eq("id", s.id);
    if (error) { toast.error(error.message); return false; }
    setShipments((prev) => prev.map((x) => (x.id === s.id ? { ...x, ...patch } : x)));
    return true;
  }

  async function assignTracking(s: Shipment, patch: Partial<Shipment>) {
    const ok = await patchShipment(s, patch);
    if (!ok) return;
    await supabase.from("orders").update({
      carrier: patch.carrier ?? s.carrier, tracking_number: patch.tracking_number ?? s.tracking_number,
    }).eq("id", s.order_id);
    logActivity("shipment_tracking", "shipment", s.id, patch);
  }

  async function applyStatus(s: Shipment, status: ShipStatus, silentToast = false) {
    const now = new Date().toISOString();
    const patch: Partial<Shipment> = { status };
    if (status === "packed" && !s.packed_at) patch.packed_at = now;
    if ((status === "shipped" || status === "in_transit") && !s.shipped_at) patch.shipped_at = now;
    if (status === "delivered" && !s.delivered_at) patch.delivered_at = now;
    if (status === "returned") patch.returned_at = now;
    if (status === "cancelled") patch.cancelled_at = now;

    const ok = await patchShipment(s, patch);
    if (!ok) return false;
    await supabase.from("shipment_events").insert({
      shipment_id: s.id, status, description: `Status updated to ${STATUS_LABEL[status]}`,
    });
    const fulfillment = ORDER_FULFILLMENT[status];
    const orderPatch: { fulfillment_status: string; status?: string } = { fulfillment_status: fulfillment };
    if (status === "delivered") orderPatch.status = "delivered";
    if (status === "cancelled") orderPatch.status = "cancelled";
    await supabase.from("orders").update(orderPatch).eq("id", s.order_id);
    setOrders((prev) => prev?.map((o) => (o.id === s.order_id ? { ...o, fulfillment_status: fulfillment } : o)) ?? prev);
    await notifyCustomer(s.user_id, s.order_id, status);
    logActivity("shipment_status", "shipment", s.id, { status });
    if (!silentToast) toast.success(`Marked ${STATUS_LABEL[status]}`);
    return true;
  }

  async function setStatus(s: Shipment, status: ShipStatus) {
    setBusy(s.id);
    await applyStatus(s, status);
    setBusy(null);
  }

  // ── Derived analytics (all from real DB rows) ──────────────────────────────
  const lastScanByShipment = useMemo(() => {
    const m = new Map<string, number>();
    for (const e of events) {
      const t = +new Date(e.occurred_at ?? e.created_at);
      const cur = m.get(e.shipment_id) ?? 0;
      if (t > cur) m.set(e.shipment_id, t);
    }
    return m;
  }, [events]);

  const delayById = useMemo(() => {
    const m = new Map<string, DelayInfo>();
    for (const s of shipments) m.set(s.id, computeDelay(s, lastScanByShipment.get(s.id) ?? null));
    return m;
  }, [shipments, lastScanByShipment]);

  const kpis = useMemo(() => computeKpis(shipments, orders ?? [], delayById), [shipments, orders, delayById]);
  const health = useMemo(() => computeHealthScore(shipments, delayById), [shipments, delayById]);
  const couriers = useMemo(() => computeCourierPerf(shipments, delayById), [shipments, delayById]);

  const allPairs = useMemo<ShipmentPair[]>(() => {
    if (!orders) return [];
    const shipmentsByOrder = new Map(shipments.map((s) => [s.order_id, s]));
    return orders.map((o) => ({ order: o, ship: shipmentsByOrder.get(o.id) ?? null }));
  }, [orders, shipments]);

  const enriched = useMemo(() => {
    const term = q.trim().toLowerCase();
    return allPairs
      .filter((pair) => pairMatchesQueue(pair, queue, delayById))
      .filter((pair) => pairMatchesSearch(pair, term));
  }, [allPairs, q, queue, delayById]);

  const customerImpact = useMemo(() => {
    const ordersById = new Map((orders ?? []).map((o) => [o.id, o]));
    const today = new Date();
    const isSameDay = (s: string | null) => s && new Date(s).toDateString() === today.toDateString();
    const waitingToday = shipments.filter((s) => s.status === "out_for_delivery" || (s.estimated_delivery && isSameDay(s.estimated_delivery) && !["delivered", "cancelled"].includes(s.status))).length;
    const delayedCustomers = shipments.filter((s) => delayById.get(s.id)?.delayed).length;
    const failed = shipments.filter((s) => s.status === "failed_delivery").length;
    const returns = shipments.filter((s) => s.status === "returned").length;
    const pendingRefunds = (orders ?? []).filter((o) => ["returned", "cancelled"].includes(o.status) && (o.payment_status === "succeeded" || o.payment_status === "paid")).length;
    const needsIntervention = shipments.filter((s) => {
      const d = delayById.get(s.id);
      return s.status === "failed_delivery" || d?.severity === "critical" || d?.stuck;
    }).length;
    return { waitingToday, delayedCustomers, failed, returns, pendingRefunds, needsIntervention, ordersById };
  }, [shipments, orders, delayById]);

  // ── Revenue operations (real orders) ───────────────────────────────────────
  const revenueOps = useMemo<RevenueOps>(() => {
    const list = orders ?? [];
    const today = new Date();
    const sameDay = (s: string | null) => !!s && new Date(s).toDateString() === today.toDateString();
    const isPaid = (o: Order) => ["paid", "succeeded", "captured"].includes((o.payment_status ?? "").toLowerCase());
    const isCod = (o: Order) => /cod|cash/i.test(o.payment_method ?? "");
    const revenueToday = list.filter((o) => sameDay(o.created_at) && isPaid(o) && o.status !== "cancelled").reduce((a, o) => a + (o.total || 0), 0);
    const ordersToday = list.filter((o) => sameDay(o.created_at)).length;
    const pendingPayments = list.filter((o) => !isPaid(o) && !isCod(o) && !["cancelled"].includes(o.status)).length;
    const codOrders = list.filter((o) => isCod(o) && !["delivered", "cancelled", "returned"].includes(o.status)).length;
    const refundRequests = list.filter((o) => ["returned", "cancelled"].includes(o.status) && isPaid(o)).length;
    return { revenueToday, ordersToday, pendingPayments, codOrders, refundRequests, currency: list[0]?.currency ?? "INR" };
  }, [orders]);

  // ── Bulk actions ───────────────────────────────────────────────────────────
  const selectedShipments = useMemo(() => shipments.filter((s) => selected.has(s.id)), [shipments, selected]);
  function toggleSelect(id: string) {
    setSelected((prev) => { const n = new Set(prev); n.has(id) ? n.delete(id) : n.add(id); return n; });
  }
  function clearSelection() { setSelected(new Set()); }

  async function bulkStatus(status: ShipStatus) {
    if (!selectedShipments.length) return;
    setBulkBusy(true);
    for (const s of selectedShipments) await applyStatus(s, status, true);
    setBulkBusy(false); clearSelection();
    toast.success(`${selectedShipments.length} shipment(s) → ${STATUS_LABEL[status]}`);
  }
  async function bulkAssignCourier() {
    const carrier = window.prompt("Assign courier to selected shipments:");
    if (!carrier) return;
    setBulkBusy(true);
    for (const s of selectedShipments) await assignTracking(s, { carrier });
    setBulkBusy(false); clearSelection(); toast.success("Courier assigned");
  }
  async function bulkNotify() {
    if (!selectedShipments.length) return;
    setBulkBusy(true);
    for (const s of selectedShipments) await notifyCustomer(s.user_id, s.order_id, s.status);
    setBulkBusy(false); toast.success("Customers notified");
  }
  // ── Unified export system ───────────────────────────────────────────────────
  const exportRowsFor = (scope: ExportScope): ShipmentExportRow[] => {
    let pairs: { order: Order; ship: Shipment | null }[];
    if (scope === "selected") {
      pairs = enriched.filter(({ ship }) => ship && selected.has(ship.id));
    } else if (scope === "filtered") {
      pairs = enriched;
    } else {
      pairs = allPairs;
    }
    return pairs.map(({ order, ship }) => buildExportRow(order, ship));
  };

  async function runExport(format: "csv" | "excel" | "pdf", scope: ExportScope) {
    const rows = exportRowsFor(scope);
    if (!rows.length) { toast.error("Nothing to export"); return; }
    const m = await loadPacking();
    if (format === "csv") m.exportShipmentsCsv(rows);
    else if (format === "excel") m.exportShipmentsExcel(rows);
    else m.exportShipmentsPdf(rows);
    toast.success(`Exported ${rows.length} shipment(s)`);
  }

  async function exportPackingSlips(scope: ExportScope) {
    const rows = exportRowsFor(scope);
    if (!rows.length) { toast.error("Nothing to export"); return; }
    toast.message(`Generating ${rows.length} packing slip(s)…`);
    const { downloadPackingSlip } = await loadPacking();
    for (const r of rows) await downloadPackingSlip(r.orderId);
    toast.success("Packing slips downloaded");
  }



  const SECTIONS: { key: Section; label: string; icon: React.ReactNode }[] = [
    { key: "operations", label: "Operations", icon: <Activity className="size-3.5" /> },
    { key: "couriers", label: "Couriers", icon: <Gauge className="size-3.5" /> },
    { key: "customers", label: "Customers", icon: <Users className="size-3.5" /> },
    { key: "warroom", label: "War Room", icon: <Radio className="size-3.5" /> },
  ];

  return (
    <AdminShell
      title="Shipment Command Center"
      subtitle="Live logistics operations — KPIs, delay detection, courier performance and exception management. All metrics computed from real records."
      allow={["admin", "super_admin", "manager", "fulfillment", "warehouse_staff"]}
      actions={
        <div className="flex items-center gap-2">
          <ExportMenu selectedCount={selected.size} onExport={runExport} onPackingSlips={exportPackingSlips} />
          <button onClick={() => void load()} disabled={refreshing}
            className="inline-flex items-center gap-1.5 text-xs px-3 py-2 rounded-xl border border-border hover:border-accent/40 disabled:opacity-50">
            {refreshing ? <Loader2 className="size-3.5 animate-spin" /> : <RefreshCw className="size-3.5" />} Refresh
          </button>
        </div>
      }
    >
      <div className="space-y-4">
        {/* Enterprise system status */}
        <SystemStatusCard
          online={online} lastUpdated={lastUpdated} courierCount={couriers.length}
          pending={kpis.awaitingShipment + kpis.pending} health={health}
        />

        {/* Operation KPIs — priority emphasis on Awaiting & Delayed */}
        <div>
          <h2 className="mb-2 text-[11px] font-bold uppercase tracking-[0.18em] text-muted-foreground">Operations</h2>
          <div className="-mx-1 px-1 overflow-x-auto scrollbar-none">
            <div className="flex gap-2 min-w-max sm:min-w-0 sm:grid sm:grid-cols-3 lg:grid-cols-6">
              <StatChip label="Orders Today" value={revenueOps.ordersToday} icon={<Package className="size-3.5" />} />
              <StatChip label="Awaiting Shipment" value={kpis.awaitingShipment} icon={<CalendarClock className="size-3.5" />} tone={kpis.awaitingShipment ? "amber" : undefined} highlight={kpis.awaitingShipment > 0} />
              <StatChip label="In Transit" value={kpis.inTransit} icon={<Truck className="size-3.5" />} />
              <StatChip label="Delivered Today" value={kpis.deliveredToday} icon={<CheckCircle2 className="size-3.5" />} tone="emerald" />
              <StatChip label="Delayed" value={kpis.delayed} icon={<Clock className="size-3.5" />} tone={kpis.delayed ? "destructive" : undefined} highlight={kpis.delayed > 0} />
              <StatChip label="Returns" value={kpis.returned} icon={<RotateCcw className="size-3.5" />} tone={kpis.returned ? "orange" : undefined} />
            </div>
          </div>
        </div>

        {/* Revenue operations */}
        <div>
          <h2 className="mb-2 text-[11px] font-bold uppercase tracking-[0.18em] text-muted-foreground">Revenue Operations</h2>
          <RevenueStrip ops={revenueOps} />
        </div>





        {/* Section tabs */}
        <div className="flex flex-wrap gap-1.5">
          {SECTIONS.map((s) => (
            <button key={s.key} onClick={() => setSection(s.key)}
              className={`inline-flex items-center gap-1.5 rounded-full border px-3.5 py-1.5 text-xs font-semibold transition-colors ${
                section === s.key ? "border-accent/50 bg-accent/15 text-accent" : "border-border/60 text-muted-foreground hover:text-foreground"
              }`}>
              {s.icon}{s.label}
            </button>
          ))}
        </div>

        {orders === null ? (
          <div className="grid place-items-center py-20"><Loader2 className="size-5 animate-spin text-accent" /></div>
        ) : section === "operations" ? (
          <OperationsView
            enriched={enriched} allPairs={allPairs} delayById={delayById} queue={queue} setQueue={setQueue}
            q={q} setQ={setQ} visible={visible} setVisible={setVisible}
            selected={selected} toggleSelect={toggleSelect} clearSelection={clearSelection}
            selectedCount={selected.size} bulkBusy={bulkBusy}
            onBulkStatus={bulkStatus} onBulkCourier={bulkAssignCourier} onBulkNotify={bulkNotify}
            onExport={runExport} onPackingSlips={exportPackingSlips}
            creating={creating} busy={busy}
            onCreate={createShipment} onAssign={assignTracking} onStatus={setStatus}
          />
        ) : section === "couriers" ? (
          <CourierView couriers={couriers} />
        ) : section === "customers" ? (
          <CustomerView impact={customerImpact} health={health} />
        ) : (
          <WarRoomView feed={feed} />
        )}
      </div>
    </AdminShell>
  );
}

// ── Operations view ──────────────────────────────────────────────────────────
function OperationsView(props: {
  enriched: { order: Order; ship: Shipment | null }[];
  allPairs: ShipmentPair[];
  delayById: Map<string, DelayInfo>;
  queue: QueueKey; setQueue: (q: QueueKey) => void;
  q: string; setQ: (v: string) => void; visible: number; setVisible: React.Dispatch<React.SetStateAction<number>>;
  selected: Set<string>; toggleSelect: (id: string) => void; clearSelection: () => void;
  selectedCount: number; bulkBusy: boolean;
  onBulkStatus: (s: ShipStatus) => void; onBulkCourier: () => void; onBulkNotify: () => void;
  onExport: (format: "csv" | "excel" | "pdf", scope: ExportScope) => void; onPackingSlips: (scope: ExportScope) => void;
  creating: string | null; busy: string | null;
  onCreate: (o: Order) => void; onAssign: (s: Shipment, p: Partial<Shipment>) => void; onStatus: (s: Shipment, st: ShipStatus) => void;
}) {
  const { enriched, allPairs, delayById, queue, setQueue, q, setQ, visible, setVisible } = props;
  const searchTerm = q.trim().toLowerCase();
  const queueCount = (key: QueueKey) =>
    allPairs.filter((pair) => pairMatchesQueue(pair, key, delayById) && pairMatchesSearch(pair, searchTerm)).length;
  return (
    <div className="space-y-4">
      {/* Bulk action bar */}
      {props.selectedCount > 0 && (
        <div className="card-premium rounded-2xl p-3 flex flex-wrap items-center gap-2 border-accent/40">
          <span className="text-xs font-semibold mr-1">{props.selectedCount} selected</span>
          <BulkBtn onClick={() => props.onBulkStatus("packed")} disabled={props.bulkBusy} icon={<PackageCheck className="size-3" />}>Mark Packed</BulkBtn>
          <BulkBtn onClick={props.onBulkCourier} disabled={props.bulkBusy} icon={<Truck className="size-3" />}>Assign Courier</BulkBtn>
          <BulkBtn onClick={() => props.onBulkStatus("out_for_delivery")} disabled={props.bulkBusy} icon={<RotateCcw className="size-3" />}>Retry Delivery</BulkBtn>
          <BulkBtn onClick={props.onBulkNotify} disabled={props.bulkBusy} icon={<Send className="size-3" />}>Notify</BulkBtn>
          <BulkBtn onClick={() => props.onExport("csv", "selected")} disabled={props.bulkBusy} icon={<FileText className="size-3" />}>CSV</BulkBtn>
          <BulkBtn onClick={() => props.onExport("excel", "selected")} disabled={props.bulkBusy} icon={<FileSpreadsheet className="size-3" />}>Excel</BulkBtn>
          <BulkBtn onClick={() => props.onExport("pdf", "selected")} disabled={props.bulkBusy} icon={<FileText className="size-3" />}>PDF</BulkBtn>
          <BulkBtn onClick={() => props.onPackingSlips("selected")} disabled={props.bulkBusy} icon={<Printer className="size-3" />}>Packing Slips</BulkBtn>
          <button onClick={props.clearSelection} className="ml-auto text-xs text-muted-foreground hover:text-foreground">Clear</button>
        </div>
      )}

      {/* Search + filters — sticky operations bar */}
      <div className="card-premium rounded-2xl p-3 space-y-3 sticky top-2 z-20">

        <div className="flex gap-2">
          <div className="relative flex-1">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 size-3.5 text-muted-foreground" />
            <input value={q} onChange={(e) => { setQ(e.target.value); setVisible(PAGE); }}
              placeholder="Search order ID, tracking, name, email, phone…"
              className="w-full rounded-xl border border-border bg-background/60 pl-9 pr-9 py-2 text-sm outline-none focus:border-accent/50" />
            {q && <button onClick={() => setQ("")} className="absolute right-3 top-1/2 -translate-y-1/2"><X className="size-4 text-muted-foreground" /></button>}
          </div>
          <button onClick={() => props.onExport("csv", "filtered")} className="inline-flex items-center gap-1.5 text-xs px-3 rounded-xl border border-border hover:border-accent/40">
            <Download className="size-3.5" /> CSV
          </button>
        </div>
        <div className="-mx-1 px-1 flex gap-1.5 overflow-x-auto scrollbar-none">
          {OP_QUEUE_KEYS.map((key) => (
            <button key={key} onClick={() => { setQueue(key); setVisible(PAGE); }}
              className={`shrink-0 rounded-full border px-3 py-1.5 text-xs font-medium whitespace-nowrap transition-colors ${
                queue === key ? "border-accent/50 bg-accent/15 text-accent" : "border-border/60 text-muted-foreground hover:text-foreground"
              }`}>
              {QUEUE_LABEL[key]} <span className="opacity-60 tabular-nums">{queueCount(key)}</span>
            </button>
          ))}
        </div>

      </div>

      {enriched.length === 0 ? (
        <div className="card-premium rounded-2xl py-8 px-5 text-center">
          <Package className="size-7 mx-auto mb-2 text-muted-foreground" />
          <p className="text-sm font-semibold">{allPairs.length ? "No matching shipment records" : "No shipment records yet"}</p>
          <p className="text-xs text-muted-foreground mt-1">
            {allPairs.length > 0 ? `Clear filters to view ${allPairs.length} real order${allPairs.length !== 1 ? "s" : ""} across shipment queues.` : "Shipments will appear here as real orders are placed."}
          </p>
          {(queue !== "all" || q) && (
            <button onClick={() => { setQueue("all"); setQ(""); setVisible(PAGE); }}
              className="mt-3 inline-flex items-center gap-1.5 rounded-full border border-accent/40 bg-accent/10 px-3.5 py-1.5 text-xs font-medium text-accent hover:bg-accent/20">
              <Package className="size-3.5" /> View all shipments
            </button>
          )}
        </div>

      ) : (
        <div className="space-y-3">
          {enriched.slice(0, visible).map(({ order, ship }) => (
            <ShipmentCard key={order.id} order={order} ship={ship}
              delay={ship ? delayById.get(ship.id) ?? null : null}
              selected={ship ? props.selected.has(ship.id) : false}
              onToggleSelect={() => ship && props.toggleSelect(ship.id)}
              creating={props.creating === order.id} busy={props.busy === ship?.id}
              onCreate={() => props.onCreate(order)}
              onAssign={(patch) => ship && props.onAssign(ship, patch)}
              onStatus={(st) => ship && props.onStatus(ship, st)} />
          ))}
          {enriched.length > visible && (
            <div className="grid place-items-center py-4">
              <button onClick={() => setVisible((v) => v + PAGE)}
                className="inline-flex items-center gap-2 rounded-full border border-border bg-white/5 px-4 py-2 text-xs hover:border-accent/50">
                Load more ({enriched.length - visible})
              </button>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

// ── Courier performance view ─────────────────────────────────────────────────
function CourierView({ couriers }: { couriers: ReturnType<typeof computeCourierPerf> }) {
  if (couriers.length === 0) {
    return <div className="card-premium rounded-2xl py-16 text-center text-sm text-muted-foreground">No courier data yet.</div>;
  }
  return (
    <div className="space-y-3">
      {couriers.map((c, i) => (
        <div key={c.key} className="card-premium rounded-2xl p-4">
          <div className="flex items-center gap-2 mb-3">
            <span className="grid place-items-center size-6 rounded-full bg-accent/15 text-accent text-xs font-bold">{i + 1}</span>
            <span className="font-semibold text-sm">{c.label}</span>
            <span className="text-[11px] text-muted-foreground ml-auto">{c.volume} shipment{c.volume !== 1 ? "s" : ""}</span>
          </div>
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-2 text-center">
            <Metric label="Avg Days" value={c.avgDeliveryDays != null ? `${c.avgDeliveryDays}d` : "—"} />
            <Metric label="Success" value={pct(c.successRate)} tone="emerald" />
            <Metric label="Returns" value={pct(c.returnRate)} tone="orange" />
            <Metric label="Failures" value={pct(c.failureRate)} tone="destructive" />
            <Metric label="Delays" value={pct(c.delayRate)} tone="amber" />
            <Metric label="Delivered" value={String(c.delivered)} />
          </div>
        </div>
      ))}
    </div>
  );
}

// ── Customer impact view ─────────────────────────────────────────────────────
function CustomerView({ impact, health }: { impact: { waitingToday: number; delayedCustomers: number; failed: number; returns: number; pendingRefunds: number; needsIntervention: number }; health: { score: number; tier: HealthTier } }) {
  const cards = [
    { label: "Waiting Today", value: impact.waitingToday, icon: <Clock className="size-4" /> },
    { label: "Delayed Customers", value: impact.delayedCustomers, icon: <AlertTriangle className="size-4" />, tone: "amber" },
    { label: "Failed Deliveries", value: impact.failed, icon: <Ban className="size-4" />, tone: "destructive" },
    { label: "Returns Initiated", value: impact.returns, icon: <RotateCcw className="size-4" />, tone: "orange" },
    { label: "Pending Refunds", value: impact.pendingRefunds, icon: <TrendingUp className="size-4" /> },
    { label: "Needs Intervention", value: impact.needsIntervention, icon: <ShieldAlert className="size-4" />, tone: "destructive" },
  ] as const;
  return (
    <div className="space-y-4">
      <div className="card-premium rounded-2xl p-5 flex items-center gap-4">
        <Gauge className={`size-8 ${HEALTH_CLS[health.tier]}`} />
        <div>
          <div className={`text-3xl font-bold tabular-nums ${HEALTH_CLS[health.tier]}`}>{health.score}<span className="text-base text-muted-foreground">/100</span></div>
          <div className={`text-xs font-semibold ${HEALTH_CLS[health.tier]}`}>Shipment Health — {HEALTH_LABEL[health.tier]}</div>
        </div>
      </div>
      <div className="grid grid-cols-2 lg:grid-cols-3 gap-2.5">
        {cards.map((c) => <Kpi key={c.label} label={c.label} value={c.value} icon={c.icon} tone={(c as { tone?: string }).tone as never} />)}
      </div>
    </div>
  );
}

// ── War room live feed ───────────────────────────────────────────────────────
function WarRoomView({ feed }: { feed: FeedItem[] }) {
  return (
    <div className="card-premium rounded-2xl p-4">
      <div className="flex items-center gap-2 mb-3">
        <span className="relative flex size-2.5">
          <span className="absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-60 animate-ping" />
          <span className="relative inline-flex rounded-full size-2.5 bg-emerald-400" />
        </span>
        <span className="text-sm font-semibold">Live Feed</span>
        <span className="text-[11px] text-muted-foreground ml-auto">{feed.length} events · realtime</span>
      </div>
      {feed.length === 0 ? (
        <p className="py-12 text-center text-xs text-muted-foreground">No recent activity.</p>
      ) : (
        <ol className="space-y-2 max-h-[70vh] overflow-y-auto">
          {feed.map((f) => (
            <li key={f.id} className="flex items-start gap-2.5 text-sm border-b border-border/40 pb-2 last:border-0">
              <span className={`mt-1.5 size-2 rounded-full shrink-0 ${(STATUS_CLS[f.tone] ?? STATUS_CLS.pending).split(" ").find((c) => c.startsWith("bg-")) ?? "bg-accent"}`} />
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-2">
                  <span className="font-medium text-xs">{f.label}</span>
                  <span className="text-[10px] text-muted-foreground ml-auto shrink-0">{fmtTime(f.at)}</span>
                </div>
                <p className="text-xs text-muted-foreground truncate">{f.detail}</p>
              </div>
            </li>
          ))}
        </ol>
      )}
    </div>
  );
}

// ── Shared small components ───────────────────────────────────────────────────
function StatChip({ label, value, icon, tone, highlight }: { label: string; value: number; icon?: React.ReactNode; tone?: "emerald" | "amber" | "orange" | "destructive"; highlight?: boolean }) {
  const toneCls = tone === "emerald" ? "text-emerald-400" : tone === "amber" ? "text-amber-400" : tone === "orange" ? "text-orange-400" : tone === "destructive" ? "text-destructive" : "text-foreground";
  return (
    <div className={`card-premium rounded-xl px-3 py-2 flex items-center gap-2.5 shrink-0 w-[7.5rem] sm:w-auto ${highlight ? "ring-1 ring-accent/40 border-accent/40" : ""}`}>
      <span className={tone ? toneCls : "text-accent/70"}>{icon}</span>
      <div className="min-w-0">
        <div className={`text-lg font-semibold tabular-nums leading-none ${toneCls}`}><AnimatedCounter to={value} duration={1} /></div>
        <div className="text-[9px] uppercase tracking-widest text-muted-foreground mt-1 truncate">{label}</div>
      </div>
    </div>
  );
}

function Kpi({ label, value, icon, tone }: { label: string; value: number; icon?: React.ReactNode; tone?: "emerald" | "amber" | "orange" | "destructive" }) {
  const toneCls = tone === "emerald" ? "text-emerald-400" : tone === "amber" ? "text-amber-400" : tone === "orange" ? "text-orange-400" : tone === "destructive" ? "text-destructive" : "";
  return (
    <div className="group relative overflow-hidden card-premium rounded-2xl p-4 hover:border-accent/40 transition-colors">
      <div className="relative">
        <div className="flex items-center justify-between text-muted-foreground mb-1">
          <span className="text-[10px] uppercase tracking-widest leading-tight">{label}</span>
          <span className={tone ? toneCls : "text-accent/70"}>{icon}</span>
        </div>
        <div className={`text-2xl font-semibold tabular-nums ${toneCls}`}><AnimatedCounter to={value} duration={1} /></div>
      </div>
    </div>
  );
}


function Metric({ label, value, tone }: { label: string; value: string; tone?: "emerald" | "amber" | "orange" | "destructive" }) {
  const toneCls = tone === "emerald" ? "text-emerald-400" : tone === "amber" ? "text-amber-400" : tone === "orange" ? "text-orange-400" : tone === "destructive" ? "text-destructive" : "";
  return (
    <div className="rounded-xl border border-border/50 bg-background/40 p-2">
      <div className="text-[9px] uppercase tracking-widest text-muted-foreground">{label}</div>
      <div className={`text-sm font-semibold tabular-nums ${toneCls}`}>{value}</div>
    </div>
  );
}

function BulkBtn({ onClick, disabled, icon, children }: { onClick: () => void; disabled?: boolean; icon: React.ReactNode; children: React.ReactNode }) {
  return (
    <button onClick={onClick} disabled={disabled}
      className="inline-flex items-center gap-1 rounded-lg border border-accent/30 text-accent px-2.5 py-1.5 text-[11px] font-medium hover:bg-accent/10 disabled:opacity-50">
      {icon}{children}
    </button>
  );
}

function InfoLine({ icon, value, mono = false }: { icon: React.ReactNode; value: string; mono?: boolean }) {
  return (
    <p className={`flex items-center gap-1.5 min-w-0 text-muted-foreground ${mono ? "font-mono" : ""}`}>
      <span className="shrink-0 text-accent/70">{icon}</span>
      <span className="truncate">{value}</span>
    </p>
  );
}

function ShipmentCard({ order, ship, delay, selected, onToggleSelect, creating, busy, onCreate, onAssign, onStatus }: {
  order: Order; ship: Shipment | null; delay: DelayInfo | null; selected: boolean; onToggleSelect: () => void;
  creating: boolean; busy: boolean;
  onCreate: () => void; onAssign: (patch: Partial<Shipment>) => void; onStatus: (s: ShipStatus) => void;
}) {
  const addr = order.shipping_address;
  const primary = order.order_items?.[0] ?? null;
  const extraItems = Math.max(0, (order.order_items?.length ?? 0) - 1);
  const units = order.order_items?.reduce((a, b) => a + (b.quantity || 0), 0) ?? 0;
  const fullAddr = addr ? [addr.line1, addr.line2, addr.city, addr.state, addr.postal, addr.country].filter(Boolean).join(", ") : "—";
  const customer = safeText(addr?.full_name, (addr as { name?: string } | null)?.name, order.contact_email, "Guest") ?? "Guest";
  const cityState = [addr?.city, addr?.state].filter(Boolean).join(", ") || fullAddr;
  const status = ship?.status ?? (order.fulfillment_status || "pending");
  const tracking = ship?.tracking_number ?? order.tracking_number;
  const courier = courierLabel(ship?.carrier ?? order.carrier) ?? ship?.carrier ?? order.carrier ?? "Unassigned";
  const productName = primary?.name ?? "Order items pending sync";
  const variant = primary?.product_slug ? primary.product_slug.replace(/-/g, " ") : "—";
  const [docBusy, setDocBusy] = useState<string | null>(null);

  const runDoc = async (key: string, fn: () => Promise<boolean>) => {
    setDocBusy(key);
    try {
      const ok = await fn();
      if (!ok) toast.error("Could not generate document");
    } catch { toast.error("Document generation failed"); }
    finally { setDocBusy(null); }
  };
  const copyTracking = async () => {
    const tn = ship?.tracking_number ?? order.tracking_number;
    if (!tn) { toast.error("No tracking number"); return; }
    try { await navigator.clipboard.writeText(tn); toast.success("Tracking ID copied"); }
    catch { toast.error("Copy failed"); }
  };


  return (
    <div className={`card-premium rounded-2xl p-3.5 md:p-4 ${selected ? "border-accent/50" : ""}`}>
      <div className="grid gap-3 lg:grid-cols-[auto_1fr_minmax(16rem,0.62fr)]">
        <div className="flex gap-3 min-w-0">
          {ship && (
            <input type="checkbox" checked={selected} onChange={onToggleSelect}
              className="mt-1 size-3.5 accent-current text-accent rounded shrink-0" aria-label="Select shipment" />
          )}
          <div className="relative size-20 sm:size-24 shrink-0 overflow-hidden rounded-xl border border-border/70 bg-muted">
            {primary?.image ? (
              <img src={primary.image} alt={productName} loading="lazy" className="size-full object-cover" />
            ) : (
              <div className="size-full grid place-items-center"><Package className="size-7 text-muted-foreground" /></div>
            )}
            <span className={`absolute inset-x-0 bottom-0 h-1 ${(STATUS_CLS[status] ?? STATUS_CLS.pending).split(" ").find((c) => c.startsWith("bg-")) ?? "bg-accent"}`} />
          </div>
        </div>

        <div className="min-w-0 space-y-2">
          <div className="flex items-center gap-2 flex-wrap">
            <StatusPill status={status} />
            <span className="inline-flex items-center gap-1 font-mono text-[11px] text-muted-foreground"><Hash className="size-3" />ORD-{shortId(order.id)}</span>
            {delay?.delayed && (
              <span className={`inline-flex items-center gap-1 text-[10px] font-mono uppercase tracking-wider px-2 py-0.5 rounded-full border ${SEV_CLS[delay.severity]}`}>
                <AlertTriangle className="size-3" />{SEVERITY_LABEL[delay.severity]} · {delay.delayDays > 0 ? `${delay.delayDays}d` : `${delay.delayHours}h`}
              </span>
            )}
            <span className="text-sm font-semibold tabular-nums ml-auto">{money(order.total, order.currency)}</span>
          </div>
          <div className="min-w-0">
            <p className="text-sm sm:text-base font-semibold truncate">{productName}</p>
            <p className="text-[11px] text-muted-foreground mt-0.5 truncate">
              Qty {primary?.quantity ?? (units || 1)} · Variant/SKU {variant}{extraItems ? ` · +${extraItems} more item${extraItems !== 1 ? "s" : ""}` : ""}
            </p>
          </div>
          {delay?.delayed && delay.reason && <p className="text-[11px] text-amber-400/90">⚠ {delay.reason}</p>}
          <div className="grid sm:grid-cols-2 xl:grid-cols-3 gap-x-4 gap-y-1.5 text-xs">
            <InfoLine icon={<User className="size-3.5" />} value={customer} />
            <InfoLine icon={<MapPin className="size-3.5" />} value={cityState} />
            <InfoLine icon={<Truck className="size-3.5" />} value={courier} />
            <InfoLine icon={<Hash className="size-3.5" />} value={tracking ? tracking : "No tracking assigned"} mono />
            <InfoLine icon={<CalendarClock className="size-3.5" />} value={`ETA ${fmtDate(ship?.estimated_delivery ?? null)}`} />
            <InfoLine icon={<Receipt className="size-3.5" />} value={paymentLabel(order.payment_method, order.payment_status)} />
          </div>
          <div className="flex items-center gap-3 text-[11px] text-muted-foreground pt-1 flex-wrap">
            <span>{units} unit{units !== 1 ? "s" : ""}</span>
            <span>Placed {fmtTime(order.created_at)}</span>
            {ship && <span>Updated {fmtTime(ship.updated_at)}</span>}
            {order.contact_email && <span className="inline-flex items-center gap-1 min-w-0"><Mail className="size-3" /><span className="truncate max-w-[14rem]">{order.contact_email}</span></span>}
            {addr?.phone && <span className="inline-flex items-center gap-1"><Phone className="size-3" />{addr.phone}</span>}
          </div>
        </div>

        <div className="lg:border-l lg:border-border/40 lg:pl-4 min-w-0">
          {!ship ? (
            <button onClick={onCreate} disabled={creating}
              className="inline-flex items-center justify-center gap-2 w-full bg-accent text-accent-foreground px-4 py-2 rounded-xl text-xs font-bold uppercase tracking-wider disabled:opacity-50">
              {creating ? <Loader2 className="size-3.5 animate-spin" /> : <Plus className="size-3.5" />} Create shipment
            </button>
          ) : (
            <div className="space-y-2.5">
              <div className="grid grid-cols-2 gap-2">
                <CourierSelect value={ship.carrier ?? ""} onSave={(v) => onAssign({ carrier: v })} />
                <Field label="Tracking #" value={ship.tracking_number ?? ""} onSave={(v) => onAssign({ tracking_number: v })} placeholder="AWB number" mono />
                <Field label="Tracking URL" value={ship.tracking_url ?? ""} onSave={(v) => onAssign({ tracking_url: v })} placeholder="https://…" className="col-span-2" />
                <DateField label="Est. delivery" value={ship.estimated_delivery} onSave={(v) => onAssign({ estimated_delivery: v })} className="col-span-2" />
              </div>
              <div className="pt-1"><MiniTimeline status={ship.status} /></div>
              <div className="flex flex-wrap gap-1.5 pt-0.5">
                <ActionBtn onClick={() => onStatus("packed")} disabled={busy} icon={<PackageCheck className="size-3" />}>Packed</ActionBtn>
                <ActionBtn onClick={() => onStatus("shipped")} disabled={busy} icon={<Truck className="size-3" />}>Shipped</ActionBtn>
                <ActionBtn onClick={() => onStatus("out_for_delivery")} disabled={busy} icon={<MapPin className="size-3" />}>OFD</ActionBtn>
                <ActionBtn onClick={() => onStatus("delivered")} disabled={busy} icon={<CheckCircle2 className="size-3" />} tone="emerald">Delivered</ActionBtn>
                <ActionBtn onClick={() => onStatus("returned")} disabled={busy} icon={<RotateCcw className="size-3" />} tone="orange">Returned</ActionBtn>
                <ActionBtn onClick={() => onStatus("cancelled")} disabled={busy} icon={<Ban className="size-3" />} tone="destructive">Cancel</ActionBtn>
              </div>
              <div className="flex flex-wrap gap-1.5 border-t border-border/40 pt-2">
                <ActionBtn onClick={() => runDoc("slip", async () => (await loadPacking()).downloadPackingSlip(order.id))} disabled={docBusy === "slip"} icon={<FileText className="size-3" />}>Packing Slip</ActionBtn>
                <ActionBtn onClick={() => runDoc("inv", async () => (await loadInvoice()).downloadInvoice(order.id))} disabled={docBusy === "inv"} icon={<Receipt className="size-3" />}>Invoice</ActionBtn>
                <ActionBtn onClick={() => runDoc("label", async () => (await loadPacking()).downloadShippingLabel(order.id))} disabled={docBusy === "label"} icon={<Printer className="size-3" />}>Print Label</ActionBtn>
                <ActionBtn onClick={copyTracking} icon={<Copy className="size-3" />}>Copy Tracking</ActionBtn>
              </div>
            </div>
          )}
        </div>

      </div>
    </div>
  );
}

function Field({ label, value, onSave, placeholder, mono, className = "" }: {
  label: string; value: string; onSave: (v: string) => void; placeholder?: string; mono?: boolean; className?: string;
}) {
  return (
    <div className={className}>
      <label className="text-[10px] uppercase tracking-widest text-muted-foreground">{label}</label>
      <input defaultValue={value} placeholder={placeholder}
        onBlur={(e) => e.target.value !== value && onSave(e.target.value)}
        className={`mt-1 w-full bg-background border border-border rounded-lg px-3 py-2 text-xs focus:outline-none focus:border-accent ${mono ? "font-mono" : ""}`} />
    </div>
  );
}

function DateField({ label, value, onSave, className = "" }: {
  label: string; value: string | null; onSave: (v: string) => void; className?: string;
}) {
  return (
    <div className={className}>
      <label className="text-[10px] uppercase tracking-widest text-muted-foreground">{label}</label>
      <input type="date" defaultValue={value ?? ""}
        onBlur={(e) => e.target.value !== (value ?? "") && onSave(e.target.value)}
        className="mt-1 w-full bg-background border border-border rounded-lg px-3 py-2 text-xs focus:outline-none focus:border-accent" />
    </div>
  );
}

function ActionBtn({ onClick, disabled, icon, children, tone = "accent" }: {
  onClick: () => void; disabled?: boolean; icon: React.ReactNode; children: React.ReactNode; tone?: "accent" | "emerald" | "orange" | "destructive";
}) {
  const cls = {
    accent: "border-accent/30 text-accent hover:bg-accent/10",
    emerald: "border-emerald-400/30 text-emerald-400 hover:bg-emerald-400/10",
    orange: "border-orange-400/30 text-orange-400 hover:bg-orange-400/10",
    destructive: "border-destructive/30 text-destructive hover:bg-destructive/10",
  }[tone];
  return (
    <button onClick={onClick} disabled={disabled}
      className={`inline-flex items-center gap-1 rounded-lg border px-2.5 py-1.5 text-[11px] font-medium transition-colors disabled:opacity-50 ${cls}`}>
      {icon}{children}
    </button>
  );
}
