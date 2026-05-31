import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useMemo, useRef, useState } from "react";
import {
  Loader2, Plus, Search, X, Package, Truck, CheckCircle2, RotateCcw, Ban,
  MapPin, Mail, Phone, User, CalendarClock, Hash, RefreshCw, AlertTriangle,
  Activity, Gauge, Users, Radio, Download, Send, TrendingUp,
  ShieldAlert, Clock, PackageCheck,
} from "lucide-react";
import { AdminShell, logActivity } from "@/components/admin/AdminShell";
import { supabase } from "@/integrations/supabase/client";
import { createShipmentNotification } from "@/lib/shipment-notify.functions";
import {
  computeDelay, computeKpis, computeHealthScore, computeCourierPerf,
  matchQueue, QUEUE_LABEL, SEVERITY_LABEL, HEALTH_LABEL,
  type ShipRow, type OrderRow, type EventRow, type DelayInfo, type QueueKey, type HealthTier,
} from "@/lib/shipment-analytics";
import { toast } from "sonner";

export const Route = createFileRoute("/admin-shipments")({
  head: () => ({ meta: [{ title: "Shipment Command Center — Admin" }] }),
  component: AdminShipmentsPage,
});

type ShipAddress = {
  full_name?: string; phone?: string; line1?: string; line2?: string;
  city?: string; state?: string; postal?: string; country?: string;
} | null;

type Order = OrderRow & { order_items: { quantity: number }[]; shipping_address: ShipAddress };
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

const SEV_CLS: Record<string, string> = {
  minor: "text-amber-400 border-amber-400/30 bg-amber-400/10",
  moderate: "text-orange-400 border-orange-400/30 bg-orange-400/10",
  critical: "text-destructive border-destructive/30 bg-destructive/10",
};
const HEALTH_CLS: Record<HealthTier, string> = {
  excellent: "text-emerald-400", good: "text-sky-400", attention: "text-amber-400", critical: "text-destructive",
};

type FeedItem = { id: string; kind: string; label: string; detail: string; at: string; tone: string };

function StatusPill({ status }: { status: string }) {
  return (
    <span className={`inline-flex items-center text-[10px] font-mono uppercase tracking-wider px-2 py-0.5 rounded-full border ${STATUS_CLS[status] ?? STATUS_CLS.pending}`}>
      {STATUS_LABEL[status] ?? status}
    </span>
  );
}

type Section = "operations" | "couriers" | "customers" | "warroom";

function AdminShipmentsPage() {
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
  const reloadTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => { void load(); }, []);

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
      .subscribe();
    return () => { supabase.removeChannel(ch); if (reloadTimer.current) clearTimeout(reloadTimer.current); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  function pushFeed(item: FeedItem) {
    setFeed((prev) => (prev.some((f) => f.id === item.id) ? prev : [item, ...prev].slice(0, 80)));
  }

  async function load(silent = false) {
    if (!silent) setRefreshing(true);
    const [{ data: o }, { data: s }, { data: ev }, { data: wh }, { data: nt }] = await Promise.all([
      supabase.from("orders")
        .select("id,user_id,status,total,currency,contact_email,payment_status,fulfillment_status,tracking_number,carrier,shipping_address,created_at,order_items(quantity)")
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

  const enriched = useMemo(() => {
    if (!orders) return [];
    const term = q.trim().toLowerCase();
    return orders
      .map((o) => ({ order: o, ship: shipments.find((s) => s.order_id === o.id) ?? null }))
      .filter(({ order, ship }) => {
        if (queue === "all") return true;
        if (!ship) return false;
        return matchQueue(queue, ship, delayById.get(ship.id) ?? computeDelay(ship, null));
      })
      .filter(({ order, ship }) => {
        if (!term) return true;
        const addr = order.shipping_address;
        return [order.id, ship?.tracking_number, order.tracking_number, addr?.full_name, order.contact_email, addr?.phone, ship?.carrier, order.carrier]
          .some((v) => (v ?? "").toString().toLowerCase().includes(term));
      });
  }, [orders, shipments, q, queue, delayById]);

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
  function bulkExportCsv() {
    const rows = (selectedShipments.length ? selectedShipments : shipments);
    const header = ["shipment_id", "order_id", "carrier", "tracking_number", "status", "estimated_delivery", "shipped_at", "delivered_at"];
    const csv = [header.join(",")].concat(rows.map((s) =>
      [s.id, s.order_id, s.carrier ?? "", s.tracking_number ?? "", s.status, s.estimated_delivery ?? "", s.shipped_at ?? "", s.delivered_at ?? ""]
        .map((v) => `"${String(v).replace(/"/g, '""')}"`).join(","))).join("\n");
    const url = URL.createObjectURL(new Blob([csv], { type: "text/csv" }));
    const a = document.createElement("a"); a.href = url; a.download = `shipments-${Date.now()}.csv`; a.click(); URL.revokeObjectURL(url);
    toast.success(`Exported ${rows.length} rows`);
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
        <button onClick={() => void load()} disabled={refreshing}
          className="inline-flex items-center gap-1.5 text-xs px-3 py-1.5 rounded-lg border border-border hover:border-accent/40 disabled:opacity-50">
          {refreshing ? <Loader2 className="size-3.5 animate-spin" /> : <RefreshCw className="size-3.5" />} Refresh
        </button>
      }
    >
      <div className="space-y-4">
        {/* Executive KPI bar */}
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-2.5">
          <Kpi label="Total" value={kpis.total} icon={<Package className="size-4" />} />
          <Kpi label="Awaiting" value={kpis.awaitingShipment} icon={<CalendarClock className="size-4" />} />
          <Kpi label="Pending" value={kpis.pending} />
          <Kpi label="Packed" value={kpis.packed} />
          <Kpi label="In Transit" value={kpis.inTransit} icon={<Truck className="size-4" />} />
          <Kpi label="Out for Delivery" value={kpis.outForDelivery} />
          <Kpi label="Delivered Today" value={kpis.deliveredToday} icon={<CheckCircle2 className="size-4" />} tone="emerald" />
          <Kpi label="Delayed" value={kpis.delayed} icon={<Clock className="size-4" />} tone={kpis.delayed ? "amber" : undefined} />
          <Kpi label="Failed" value={kpis.failed} tone={kpis.failed ? "destructive" : undefined} />
          <Kpi label="Returned" value={kpis.returned} tone={kpis.returned ? "orange" : undefined} />
          <Kpi label="Cancelled" value={kpis.cancelled} />
          <div className="card-premium rounded-2xl p-4">
            <div className="flex items-center justify-between text-muted-foreground mb-1">
              <span className="text-[10px] uppercase tracking-widest">Health</span><Gauge className="size-4" />
            </div>
            <div className={`text-2xl font-semibold tabular-nums ${HEALTH_CLS[health.tier]}`}>{health.score}</div>
            <div className={`text-[10px] font-medium ${HEALTH_CLS[health.tier]}`}>{HEALTH_LABEL[health.tier]}</div>
          </div>
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
            enriched={enriched} shipments={shipments} delayById={delayById} queue={queue} setQueue={setQueue}
            q={q} setQ={setQ} visible={visible} setVisible={setVisible}
            selected={selected} toggleSelect={toggleSelect} clearSelection={clearSelection}
            selectedCount={selected.size} bulkBusy={bulkBusy}
            onBulkStatus={bulkStatus} onBulkCourier={bulkAssignCourier} onBulkNotify={bulkNotify} onBulkExport={bulkExportCsv}
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
  shipments: Shipment[]; delayById: Map<string, DelayInfo>;
  queue: QueueKey; setQueue: (q: QueueKey) => void;
  q: string; setQ: (v: string) => void; visible: number; setVisible: React.Dispatch<React.SetStateAction<number>>;
  selected: Set<string>; toggleSelect: (id: string) => void; clearSelection: () => void;
  selectedCount: number; bulkBusy: boolean;
  onBulkStatus: (s: ShipStatus) => void; onBulkCourier: () => void; onBulkNotify: () => void; onBulkExport: () => void;
  creating: string | null; busy: string | null;
  onCreate: (o: Order) => void; onAssign: (s: Shipment, p: Partial<Shipment>) => void; onStatus: (s: Shipment, st: ShipStatus) => void;
}) {
  const { enriched, shipments, delayById, queue, setQueue, q, setQ, visible, setVisible } = props;
  const queueCount = (key: QueueKey) =>
    key === "all" ? shipments.length : shipments.filter((s) => matchQueue(key, s, delayById.get(s.id) ?? computeDelay(s, null))).length;
  const QUEUES: QueueKey[] = ["all", "pending", "needs_tracking", "packed", "in_transit", "out_for_delivery", "delivered", "delayed", "stuck", "failed_delivery", "returned", "rto", "cancelled"];

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
          <BulkBtn onClick={props.onBulkExport} disabled={props.bulkBusy} icon={<Download className="size-3" />}>Export CSV</BulkBtn>
          <button onClick={props.clearSelection} className="ml-auto text-xs text-muted-foreground hover:text-foreground">Clear</button>
        </div>
      )}

      {/* Search + export */}
      <div className="card-premium rounded-2xl p-3 space-y-3">
        <div className="flex gap-2">
          <div className="relative flex-1">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 size-3.5 text-muted-foreground" />
            <input value={q} onChange={(e) => { setQ(e.target.value); setVisible(PAGE); }}
              placeholder="Search order ID, tracking, name, email, phone…"
              className="w-full rounded-xl border border-border bg-background/60 pl-9 pr-9 py-2 text-sm outline-none focus:border-accent/50" />
            {q && <button onClick={() => setQ("")} className="absolute right-3 top-1/2 -translate-y-1/2"><X className="size-4 text-muted-foreground" /></button>}
          </div>
          <button onClick={props.onBulkExport} className="inline-flex items-center gap-1.5 text-xs px-3 rounded-xl border border-border hover:border-accent/40">
            <Download className="size-3.5" /> CSV
          </button>
        </div>
        <div className="flex flex-wrap gap-1.5">
          {QUEUES.map((key) => (
            <button key={key} onClick={() => { setQueue(key); setVisible(PAGE); }}
              className={`rounded-full border px-3 py-1.5 text-xs font-medium transition-colors ${
                queue === key ? "border-accent/50 bg-accent/15 text-accent" : "border-border/60 text-muted-foreground hover:text-foreground"
              }`}>
              {QUEUE_LABEL[key]} <span className="opacity-60 tabular-nums">{queueCount(key)}</span>
            </button>
          ))}
        </div>
      </div>

      {enriched.length === 0 ? (
        <div className="card-premium rounded-2xl py-16 text-center">
          <Package className="size-8 mx-auto mb-3 text-muted-foreground" />
          <p className="text-sm font-semibold">No shipments in this queue</p>
          <p className="text-xs text-muted-foreground mt-1">Try a different search or queue.</p>
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
function Kpi({ label, value, icon, tone }: { label: string; value: number; icon?: React.ReactNode; tone?: "emerald" | "amber" | "orange" | "destructive" }) {
  const toneCls = tone === "emerald" ? "text-emerald-400" : tone === "amber" ? "text-amber-400" : tone === "orange" ? "text-orange-400" : tone === "destructive" ? "text-destructive" : "";
  return (
    <div className="card-premium rounded-2xl p-4">
      <div className="flex items-center justify-between text-muted-foreground mb-1">
        <span className="text-[10px] uppercase tracking-widest leading-tight">{label}</span>{icon}
      </div>
      <div className={`text-2xl font-semibold tabular-nums ${toneCls}`}>{value.toLocaleString("en-IN")}</div>
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

function ShipmentCard({ order, ship, delay, selected, onToggleSelect, creating, busy, onCreate, onAssign, onStatus }: {
  order: Order; ship: Shipment | null; delay: DelayInfo | null; selected: boolean; onToggleSelect: () => void;
  creating: boolean; busy: boolean;
  onCreate: () => void; onAssign: (patch: Partial<Shipment>) => void; onStatus: (s: ShipStatus) => void;
}) {
  const addr = order.shipping_address;
  const units = order.order_items?.reduce((a, b) => a + (b.quantity || 0), 0) ?? 0;
  const fullAddr = addr ? [addr.line1, addr.line2, addr.city, addr.state, addr.postal, addr.country].filter(Boolean).join(", ") : "—";

  return (
    <div className={`card-premium rounded-2xl p-4 md:p-5 ${selected ? "border-accent/50" : ""}`}>
      <div className="grid md:grid-cols-[1.2fr_1fr] gap-4">
        <div className="space-y-2 min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            {ship && (
              <input type="checkbox" checked={selected} onChange={onToggleSelect}
                className="size-3.5 accent-current text-accent rounded" aria-label="Select shipment" />
            )}
            <span className="inline-flex items-center gap-1 font-mono text-[11px] text-muted-foreground">
              <Hash className="size-3" />{order.id.slice(0, 8)}
            </span>
            {ship ? <StatusPill status={ship.status} /> : (
              <span className="text-[10px] font-mono uppercase tracking-wider px-2 py-0.5 rounded-full border border-border bg-muted/30 text-muted-foreground">No shipment</span>
            )}
            {delay?.delayed && (
              <span className={`inline-flex items-center gap-1 text-[10px] font-mono uppercase tracking-wider px-2 py-0.5 rounded-full border ${SEV_CLS[delay.severity]}`}>
                <AlertTriangle className="size-3" />{SEVERITY_LABEL[delay.severity]} · {delay.delayDays > 0 ? `${delay.delayDays}d` : `${delay.delayHours}h`}
              </span>
            )}
            <span className="text-sm font-semibold tabular-nums ml-auto">{money(order.total, order.currency)}</span>
          </div>
          {delay?.delayed && delay.reason && <p className="text-[11px] text-amber-400/90">⚠ {delay.reason}</p>}
          <div className="space-y-1 text-sm">
            <p className="flex items-center gap-2 font-medium min-w-0"><User className="size-3.5 shrink-0 text-muted-foreground" /><span className="truncate">{addr?.full_name ?? "Guest"}</span></p>
            <p className="flex items-center gap-2 text-xs text-muted-foreground min-w-0"><Mail className="size-3.5 shrink-0" /><span className="truncate">{order.contact_email ?? "—"}</span></p>
            <p className="flex items-center gap-2 text-xs text-muted-foreground"><Phone className="size-3.5 shrink-0" />{addr?.phone ?? "—"}</p>
            <p className="flex items-start gap-2 text-xs text-muted-foreground"><MapPin className="size-3.5 shrink-0 mt-0.5" /><span className="break-words">{fullAddr}</span></p>
          </div>
          <div className="flex items-center gap-3 text-[11px] text-muted-foreground pt-1 flex-wrap">
            <span className="inline-flex items-center gap-1"><Package className="size-3" />{units} item{units !== 1 ? "s" : ""}</span>
            <span>Created {fmtDate(order.created_at)}</span>
            {ship && <span>Updated {fmtDate(ship.updated_at)}</span>}
          </div>
        </div>

        <div className="md:border-l md:border-border/40 md:pl-4">
          {!ship ? (
            <button onClick={onCreate} disabled={creating}
              className="inline-flex items-center gap-2 bg-accent text-accent-foreground px-4 py-2 rounded-xl text-xs font-bold uppercase tracking-wider disabled:opacity-50">
              {creating ? <Loader2 className="size-3.5 animate-spin" /> : <Plus className="size-3.5" />} Create shipment
            </button>
          ) : (
            <div className="space-y-2.5">
              <div className="grid grid-cols-2 gap-2">
                <Field label="Courier" value={ship.carrier ?? ""} onSave={(v) => onAssign({ carrier: v })} placeholder="e.g. Delhivery" />
                <Field label="Tracking #" value={ship.tracking_number ?? ""} onSave={(v) => onAssign({ tracking_number: v })} placeholder="AWB number" mono />
                <Field label="Tracking URL" value={ship.tracking_url ?? ""} onSave={(v) => onAssign({ tracking_url: v })} placeholder="https://…" className="col-span-2" />
                <DateField label="Est. delivery" value={ship.estimated_delivery} onSave={(v) => onAssign({ estimated_delivery: v })} className="col-span-2" />
              </div>
              <div>
                <label className="text-[10px] uppercase tracking-widest text-muted-foreground">Status</label>
                <select value={ship.status} disabled={busy} onChange={(e) => onStatus(e.target.value as ShipStatus)}
                  className="mt-1 w-full bg-background border border-border rounded-lg px-3 py-2 text-xs focus:outline-none focus:border-accent">
                  {STATUSES.map((st) => <option key={st} value={st}>{STATUS_LABEL[st]}</option>)}
                </select>
              </div>
              <div className="flex flex-wrap gap-1.5 pt-0.5">
                <ActionBtn onClick={() => onStatus("packed")} disabled={busy} icon={<PackageCheck className="size-3" />}>Packed</ActionBtn>
                <ActionBtn onClick={() => onStatus("shipped")} disabled={busy} icon={<Truck className="size-3" />}>Shipped</ActionBtn>
                <ActionBtn onClick={() => onStatus("delivered")} disabled={busy} icon={<CheckCircle2 className="size-3" />} tone="emerald">Delivered</ActionBtn>
                <ActionBtn onClick={() => onStatus("returned")} disabled={busy} icon={<RotateCcw className="size-3" />} tone="orange">Returned</ActionBtn>
                <ActionBtn onClick={() => onStatus("cancelled")} disabled={busy} icon={<Ban className="size-3" />} tone="destructive">Cancel</ActionBtn>
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
