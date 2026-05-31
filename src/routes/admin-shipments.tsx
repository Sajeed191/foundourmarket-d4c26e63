import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import {
  Loader2, Plus, Search, X, Package, Truck, CheckCircle2, RotateCcw, Ban,
  MapPin, Mail, Phone, User, CalendarClock, Hash, RefreshCw,
} from "lucide-react";
import { AdminShell, logActivity } from "@/components/admin/AdminShell";
import { supabase } from "@/integrations/supabase/client";
import { createShipmentNotification } from "@/lib/shipment-notify.functions";
import { toast } from "sonner";

export const Route = createFileRoute("/admin-shipments")({
  head: () => ({ meta: [{ title: "Shipments — Admin" }] }),
  component: AdminShipmentsPage,
});

type ShipAddress = {
  full_name?: string; phone?: string; line1?: string; line2?: string;
  city?: string; state?: string; postal?: string; country?: string;
} | null;

type Order = {
  id: string;
  user_id: string;
  status: string;
  total: number;
  currency: string | null;
  contact_email: string | null;
  fulfillment_status: string | null;
  tracking_number: string | null;
  carrier: string | null;
  shipping_address: ShipAddress;
  created_at: string;
  order_items: { quantity: number }[];
};

type Shipment = {
  id: string;
  order_id: string;
  user_id: string;
  carrier: string | null;
  tracking_number: string | null;
  tracking_url: string | null;
  status: string;
  estimated_delivery: string | null;
  packed_at: string | null;
  shipped_at: string | null;
  delivered_at: string | null;
  returned_at: string | null;
  cancelled_at: string | null;
  notes: string | null;
  created_at: string;
  updated_at: string;
};

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

// Mirror shipment status onto the parent order's fulfillment_status so the
// customer order tracking timeline reflects changes instantly.
const ORDER_FULFILLMENT: Record<string, string> = {
  pending: "unfulfilled", packed: "processing", shipped: "shipped",
  in_transit: "shipped", out_for_delivery: "shipped", delivered: "delivered",
  failed_delivery: "shipped", returned: "returned", cancelled: "cancelled",
};

// Customer-facing in-app notification copy for each status change.
const STATUS_NOTIFICATION: Record<string, { title: string; body: string }> = {
  packed: { title: "📦 Order packed", body: "Your order has been packed and is ready to ship." },
  shipped: { title: "🚚 Order shipped", body: "Your order is on its way." },
  in_transit: { title: "🚚 In transit", body: "Your package is moving through the courier network." },
  out_for_delivery: { title: "📍 Out for delivery", body: "Your package is out for delivery today." },
  delivered: { title: "✅ Delivered", body: "Your package has been delivered. Enjoy!" },
  failed_delivery: { title: "⚠️ Delivery attempt failed", body: "We couldn't deliver your package. We'll retry shortly." },
  returned: { title: "↩️ Order returned", body: "Your order has been returned." },
  cancelled: { title: "❌ Order cancelled", body: "Your order has been cancelled." },
};

async function notifyCustomer(userId: string | null, orderId: string, status: string) {
  const copy = STATUS_NOTIFICATION[status];
  if (!userId || !copy) return;
  await supabase.from("notifications").insert({
    user_id: userId,
    type: "shipment",
    title: copy.title,
    body: copy.body,
    link: "/track",
    priority: status === "delivered" || status === "out_for_delivery" ? "high" : "normal",
    data: { order_id: orderId, status },
  });
}

const PAGE = 25;
const fmtDate = (s: string | null) => (s ? new Date(s).toLocaleDateString() : "—");
const money = (n: number, c: string | null) =>
  (c === "USD" ? "$" : "₹") + Math.round(n || 0).toLocaleString(c === "USD" ? "en-US" : "en-IN");

function StatusPill({ status }: { status: string }) {
  return (
    <span className={`inline-flex items-center text-[10px] font-mono uppercase tracking-wider px-2 py-0.5 rounded-full border ${STATUS_CLS[status] ?? STATUS_CLS.pending}`}>
      {STATUS_LABEL[status] ?? status}
    </span>
  );
}

function AdminShipmentsPage() {
  const [orders, setOrders] = useState<Order[] | null>(null);
  const [shipments, setShipments] = useState<Shipment[]>([]);
  const [creating, setCreating] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [q, setQ] = useState("");
  const [filter, setFilter] = useState<ShipStatus | "all" | "unshipped">("all");
  const [visible, setVisible] = useState(PAGE);
  const [refreshing, setRefreshing] = useState(false);

  useEffect(() => { void load(); }, []);

  async function load() {
    setRefreshing(true);
    const [{ data: o }, { data: s }] = await Promise.all([
      supabase
        .from("orders")
        .select("id,user_id,status,total,currency,contact_email,fulfillment_status,tracking_number,carrier,shipping_address,created_at,order_items(quantity)")
        .order("created_at", { ascending: false })
        .limit(500),
      supabase.from("shipments").select("*").order("created_at", { ascending: false }),
    ]);
    setOrders((o as Order[]) ?? []);
    setShipments((s as Shipment[]) ?? []);
    setRefreshing(false);
  }

  async function createShipment(o: Order) {
    setCreating(o.id);
    const { error, data } = await supabase.from("shipments").insert({
      order_id: o.id,
      user_id: o.user_id,
      status: "pending",
      carrier: o.carrier,
      tracking_number: o.tracking_number,
    }).select().single();
    setCreating(null);
    if (error) { toast.error(error.message); return; }
    // Seed an initial "pending" event so the customer timeline is never empty.
    const created = data as { id: string } | null;
    if (created?.id) {
      await supabase.from("shipment_events").insert({
        shipment_id: created.id,
        status: "pending",
        description: "Shipment created — preparing your order",
      });
    }
    toast.success("Shipment created");
    logActivity("shipment_create", "shipment", created?.id, { order_id: o.id });
    setShipments((prev) => [data as Shipment, ...prev]);
  }

  async function patchShipment(s: Shipment, patch: Partial<Shipment>) {
    const { error } = await supabase.from("shipments").update(patch).eq("id", s.id);
    if (error) { toast.error(error.message); return false; }
    setShipments((prev) => prev.map((x) => (x.id === s.id ? { ...x, ...patch } : x)));
    return true;
  }

  async function assignTracking(s: Shipment, patch: Partial<Shipment>) {
    const ok = await patchShipment(s, patch);
    if (!ok) return;
    // keep the order row in sync so customer sees carrier / tracking
    await supabase.from("orders").update({
      carrier: patch.carrier ?? s.carrier,
      tracking_number: patch.tracking_number ?? s.tracking_number,
    }).eq("id", s.order_id);
    logActivity("shipment_tracking", "shipment", s.id, patch);
  }

  async function setStatus(s: Shipment, status: ShipStatus) {
    setBusy(s.id);
    const now = new Date().toISOString();
    const patch: Partial<Shipment> = { status };
    if (status === "packed" && !s.packed_at) patch.packed_at = now;
    if ((status === "shipped" || status === "in_transit") && !s.shipped_at) patch.shipped_at = now;
    if (status === "delivered" && !s.delivered_at) patch.delivered_at = now;
    if (status === "returned") patch.returned_at = now;
    if (status === "cancelled") patch.cancelled_at = now;

    const ok = await patchShipment(s, patch);
    if (ok) {
      // shipment_events feed the customer-facing tracking timeline
      await supabase.from("shipment_events").insert({
        shipment_id: s.id,
        status,
        description: `Status updated to ${STATUS_LABEL[status]}`,
      });
      // mirror onto the order so order tracking + lists reflect instantly
      const fulfillment = ORDER_FULFILLMENT[status];
      const orderPatch: { fulfillment_status: string; status?: string } = { fulfillment_status: fulfillment };
      if (status === "delivered") orderPatch.status = "delivered";
      if (status === "cancelled") orderPatch.status = "cancelled";
      await supabase.from("orders").update(orderPatch).eq("id", s.order_id);
      setOrders((prev) => prev?.map((o) =>
        o.id === s.order_id ? { ...o, fulfillment_status: fulfillment } : o) ?? prev);
      // Send a permanent in-app notification to the customer.
      await notifyCustomer(s.user_id, s.order_id, status);
      logActivity("shipment_status", "shipment", s.id, { status });
      toast.success(`Marked ${STATUS_LABEL[status]}`);
    }
    setBusy(null);
  }

  const enriched = useMemo(() => {
    if (!orders) return [];
    const term = q.trim().toLowerCase();
    return orders
      .map((o) => ({ order: o, ship: shipments.find((s) => s.order_id === o.id) ?? null }))
      .filter(({ order, ship }) => {
        if (filter === "unshipped") return !ship;
        if (filter !== "all") return ship?.status === filter;
        return true;
      })
      .filter(({ order, ship }) => {
        if (!term) return true;
        const addr = order.shipping_address;
        return [
          order.id, ship?.tracking_number, order.tracking_number,
          addr?.full_name, order.contact_email, addr?.phone, ship?.carrier, order.carrier,
        ].some((v) => (v ?? "").toString().toLowerCase().includes(term));
      });
  }, [orders, shipments, q, filter]);

  const stats = useMemo(() => ({
    total: shipments.length,
    transit: shipments.filter((s) => ["shipped", "in_transit", "out_for_delivery"].includes(s.status)).length,
    delivered: shipments.filter((s) => s.status === "delivered").length,
    pending: (orders ?? []).filter((o) => !shipments.some((s) => s.order_id === o.id)).length,
  }), [shipments, orders]);

  return (
    <AdminShell
      title="Shipments"
      subtitle="Create shipments, assign tracking and update delivery status. Updates sync to customer order tracking instantly."
      allow={["admin", "super_admin", "manager", "fulfillment", "warehouse_staff"]}
      actions={
        <button onClick={() => void load()} disabled={refreshing}
          className="inline-flex items-center gap-1.5 text-xs px-3 py-1.5 rounded-lg border border-border hover:border-accent/40 disabled:opacity-50">
          {refreshing ? <Loader2 className="size-3.5 animate-spin" /> : <RefreshCw className="size-3.5" />} Refresh
        </button>
      }
    >
      <div className="space-y-4">
        {/* Stats */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          <StatCard label="Shipments" value={stats.total} icon={<Package className="size-4" />} />
          <StatCard label="In Transit" value={stats.transit} icon={<Truck className="size-4" />} />
          <StatCard label="Delivered" value={stats.delivered} icon={<CheckCircle2 className="size-4" />} />
          <StatCard label="Awaiting" value={stats.pending} icon={<CalendarClock className="size-4" />} />
        </div>

        {/* Controls */}
        <div className="card-premium rounded-2xl p-3 space-y-3">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 size-3.5 text-muted-foreground" />
            <input value={q} onChange={(e) => { setQ(e.target.value); setVisible(PAGE); }}
              placeholder="Search order ID, tracking, name, email, phone…"
              className="w-full rounded-xl border border-border bg-background/60 pl-9 pr-9 py-2 text-sm outline-none focus:border-accent/50" />
            {q && <button onClick={() => setQ("")} className="absolute right-3 top-1/2 -translate-y-1/2"><X className="size-4 text-muted-foreground" /></button>}
          </div>
          <div className="flex flex-wrap gap-1.5">
            <FilterChip active={filter === "all"} onClick={() => setFilter("all")}>All</FilterChip>
            <FilterChip active={filter === "unshipped"} onClick={() => setFilter("unshipped")}>No shipment</FilterChip>
            {STATUSES.map((st) => (
              <FilterChip key={st} active={filter === st} onClick={() => setFilter(st)}>{STATUS_LABEL[st]}</FilterChip>
            ))}
          </div>
        </div>

        {/* List */}
        {orders === null ? (
          <div className="grid place-items-center py-20"><Loader2 className="size-5 animate-spin text-accent" /></div>
        ) : enriched.length === 0 ? (
          <div className="card-premium rounded-2xl py-16 text-center">
            <Package className="size-8 mx-auto mb-3 text-muted-foreground" />
            <p className="text-sm font-semibold">No shipments found</p>
            <p className="text-xs text-muted-foreground mt-1">Try a different search or filter.</p>
          </div>
        ) : (
          <div className="space-y-3">
            {enriched.slice(0, visible).map(({ order, ship }) => (
              <ShipmentCard
                key={order.id}
                order={order}
                ship={ship}
                creating={creating === order.id}
                busy={busy === ship?.id}
                onCreate={() => createShipment(order)}
                onAssign={(patch) => ship && assignTracking(ship, patch)}
                onStatus={(st) => ship && setStatus(ship, st)}
              />
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
    </AdminShell>
  );
}

function StatCard({ label, value, icon }: { label: string; value: number; icon: React.ReactNode }) {
  return (
    <div className="card-premium rounded-2xl p-4">
      <div className="flex items-center justify-between text-muted-foreground mb-1">
        <span className="text-[10px] uppercase tracking-widest">{label}</span>{icon}
      </div>
      <div className="text-2xl font-semibold tabular-nums">{value.toLocaleString("en-IN")}</div>
    </div>
  );
}

function FilterChip({ active, onClick, children }: { active: boolean; onClick: () => void; children: React.ReactNode }) {
  return (
    <button onClick={onClick}
      className={`rounded-full border px-3 py-1.5 text-xs font-medium transition-colors ${
        active ? "border-accent/50 bg-accent/15 text-accent" : "border-border/60 text-muted-foreground hover:text-foreground"
      }`}>
      {children}
    </button>
  );
}

function ShipmentCard({ order, ship, creating, busy, onCreate, onAssign, onStatus }: {
  order: Order; ship: Shipment | null; creating: boolean; busy: boolean;
  onCreate: () => void; onAssign: (patch: Partial<Shipment>) => void; onStatus: (s: ShipStatus) => void;
}) {
  const addr = order.shipping_address;
  const units = order.order_items?.reduce((a, b) => a + (b.quantity || 0), 0) ?? 0;
  const fullAddr = addr
    ? [addr.line1, addr.line2, addr.city, addr.state, addr.postal, addr.country].filter(Boolean).join(", ")
    : "—";

  return (
    <div className="card-premium rounded-2xl p-4 md:p-5">
      <div className="grid md:grid-cols-[1.2fr_1fr] gap-4">
        {/* Customer + order */}
        <div className="space-y-2 min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <span className="inline-flex items-center gap-1 font-mono text-[11px] text-muted-foreground">
              <Hash className="size-3" />{order.id.slice(0, 8)}
            </span>
            {ship ? <StatusPill status={ship.status} /> : (
              <span className="text-[10px] font-mono uppercase tracking-wider px-2 py-0.5 rounded-full border border-border bg-muted/30 text-muted-foreground">No shipment</span>
            )}
            <span className="text-sm font-semibold tabular-nums ml-auto">{money(order.total, order.currency)}</span>
          </div>
          <div className="space-y-1 text-sm">
            <p className="flex items-center gap-2 font-medium min-w-0"><User className="size-3.5 shrink-0 text-muted-foreground" /><span className="truncate">{addr?.full_name ?? "Guest"}</span></p>
            <p className="flex items-center gap-2 text-xs text-muted-foreground min-w-0"><Mail className="size-3.5 shrink-0" /><span className="truncate">{order.contact_email ?? "—"}</span></p>
            <p className="flex items-center gap-2 text-xs text-muted-foreground"><Phone className="size-3.5 shrink-0" />{addr?.phone ?? "—"}</p>
            <p className="flex items-start gap-2 text-xs text-muted-foreground"><MapPin className="size-3.5 shrink-0 mt-0.5" /><span className="break-words">{fullAddr}</span></p>
          </div>
          <div className="flex items-center gap-3 text-[11px] text-muted-foreground pt-1">
            <span className="inline-flex items-center gap-1"><Package className="size-3" />{units} item{units !== 1 ? "s" : ""}</span>
            <span>Created {fmtDate(order.created_at)}</span>
            {ship && <span>Updated {fmtDate(ship.updated_at)}</span>}
          </div>
        </div>

        {/* Shipment controls */}
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
                <ActionBtn onClick={() => onStatus("shipped")} disabled={busy} icon={<Truck className="size-3" />}>Mark Shipped</ActionBtn>
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
