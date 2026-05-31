import { useEffect, useMemo, useRef, useState } from "react";
import { Link, useNavigate } from "@tanstack/react-router";
import { motion, AnimatePresence, type PanInfo } from "framer-motion";
import {
  X, Loader2, Package, Truck, MapPin, CheckCircle2, Clock, Boxes, RefreshCw,
  ExternalLink, RotateCcw, LifeBuoy, MessageSquare, Bell, CreditCard,
  ShieldCheck, ChevronRight, Receipt, Download, Copy, Check, Lock,
} from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/lib/auth";
import { useIsAdmin } from "@/lib/use-admin";
import { useRegion } from "@/lib/region";
import { useCart } from "@/lib/cart";
import { downloadInvoice } from "@/lib/invoice";
import { toast } from "sonner";

type OrderItem = { id: string; name: string; quantity: number; image: string | null; unit_price: number; line_total: number; product_slug: string };
type Address = { name?: string; phone?: string; line1?: string; line2?: string; city?: string; region?: string; postal_code?: string; country?: string } | null;
type FullOrder = {
  id: string; status: string; subtotal: number; discount: number; shipping: number; tax: number; total: number;
  currency: string; promo_code: string | null; contact_email: string | null; payment_method: string | null;
  payment_status: string | null; fulfillment_status: string | null; tracking_number: string | null; carrier: string | null;
  shipping_address: Address; razorpay_order_id: string | null; razorpay_payment_id: string | null;
  created_at: string; updated_at: string; order_items: OrderItem[];
};
type ShipmentEvent = { id: string; status: string; description: string | null; location: string | null; occurred_at: string };
type Shipment = {
  id: string; status: string; carrier: string | null; tracking_number: string | null; tracking_url: string | null;
  shipped_at: string | null; packed_at: string | null; delivered_at: string | null; actual_delivery: string | null;
  estimated_delivery: string | null; shipment_events: ShipmentEvent[];
};
type Payment = { id: string; method: string | null; status: string; transaction_id: string | null; razorpay_payment_id: string | null; amount: number; created_at: string };
type Refund = { id: string; status: string; amount: number; reason: string | null; created_at: string; updated_at: string };
type Return = { id: string; status: string; refund_status: string | null; reason: string | null; created_at: string };
type Notif = { id: string; title: string; body: string | null; created_at: string };

type DrawerData = {
  order: FullOrder | null;
  shipments: Shipment[];
  payments: Payment[];
  refunds: Refund[];
  returns: Return[];
  notifications: Notif[];
  returnWindowDays: number;
  cost: number;
};

// Session-scoped cache
const cache = new Map<string, DrawerData>();

const TRACK_STAGES = [
  { key: "placed", label: "Order Placed", icon: Clock },
  { key: "packed", label: "Packed", icon: Boxes },
  { key: "shipped", label: "Shipped", icon: Package },
  { key: "in_transit", label: "In Transit", icon: Truck },
  { key: "out_for_delivery", label: "Out For Delivery", icon: MapPin },
  { key: "delivered", label: "Delivered", icon: CheckCircle2 },
] as const;

function fmtDate(d: string | Date | null | undefined, withTime = false) {
  if (!d) return "—";
  const date = new Date(d);
  return date.toLocaleDateString(undefined, { day: "numeric", month: "short", year: "numeric", ...(withTime ? { hour: "2-digit", minute: "2-digit" } : {}) });
}

export function OrderDetailsDrawer({ orderId, onClose }: { orderId: string | null; onClose: () => void }) {
  const { user } = useAuth();
  const { isAdmin } = useIsAdmin();
  const { format } = useRegion();
  const cart = useCart();
  const nav = useNavigate();
  const [data, setData] = useState<DrawerData | null>(null);
  const [loading, setLoading] = useState(false);
  const [downloading, setDownloading] = useState(false);
  const [ticketing, setTicketing] = useState(false);
  const reqRef = useRef<string | null>(null);

  async function load(id: string, useCache = true) {
    if (useCache && cache.has(id)) { setData(cache.get(id)!); return; }
    setLoading(true);
    reqRef.current = id;
    const [orderRes, shipRes, payRes, refRes, retRes, notifRes] = await Promise.all([
      supabase.from("orders")
        .select("id,status,subtotal,discount,shipping,tax,total,currency,promo_code,contact_email,payment_method,payment_status,fulfillment_status,tracking_number,carrier,shipping_address,razorpay_order_id,razorpay_payment_id,created_at,updated_at,order_items(id,name,quantity,image,unit_price,line_total,product_slug)")
        .eq("id", id).maybeSingle(),
      supabase.from("shipments")
        .select("id,status,carrier,tracking_number,tracking_url,shipped_at,packed_at,delivered_at,actual_delivery,estimated_delivery,shipment_events(id,status,description,location,occurred_at)")
        .eq("order_id", id).order("created_at", { ascending: true }),
      supabase.from("payments").select("id,method,status,transaction_id,razorpay_payment_id,amount,created_at").eq("order_id", id).order("created_at", { ascending: false }),
      supabase.from("refunds").select("id,status,amount,reason,created_at,updated_at").eq("order_id", id).order("created_at", { ascending: false }),
      supabase.from("returns").select("id,status,refund_status,reason,created_at").eq("order_id", id).order("created_at", { ascending: false }),
      supabase.from("notifications").select("id,title,body,created_at,data,link").eq("user_id", user?.id ?? "").order("created_at", { ascending: false }).limit(200),
    ]);

    const order = (orderRes.data as FullOrder) ?? null;
    const slugs = (order?.order_items ?? []).map((i) => i.product_slug).filter(Boolean);
    let returnWindowDays = 0;
    let cost = 0;
    if (slugs.length) {
      const { data: prods } = await supabase.from("products").select("slug,return_window_days,return_eligible,cost_price_inr,cost_price_usd").in("slug", slugs);
      returnWindowDays = Math.max(0, ...((prods ?? []).filter((p) => p.return_eligible).map((p) => Number(p.return_window_days) || 0)), 0);
      const isInr = (order?.currency ?? "").toUpperCase() === "INR";
      const costMap = new Map((prods ?? []).map((p) => [p.slug, Number((isInr ? p.cost_price_inr : p.cost_price_usd) ?? 0) || 0]));
      cost = (order?.order_items ?? []).reduce((n, it) => n + (costMap.get(it.product_slug) ?? 0) * it.quantity, 0);
    }

    const notifications = ((notifRes.data as (Notif & { data: { order_id?: string } | null; link: string | null })[]) ?? [])
      .filter((n) => n.data?.order_id === id || (n.link ?? "").includes(id))
      .map((n) => ({ id: n.id, title: n.title, body: n.body, created_at: n.created_at }));

    const built: DrawerData = {
      order,
      shipments: (shipRes.data as Shipment[]) ?? [],
      payments: (payRes.data as Payment[]) ?? [],
      refunds: (refRes.data as Refund[]) ?? [],
      returns: (retRes.data as Return[]) ?? [],
      notifications,
      returnWindowDays,
      cost,
    };
    if (reqRef.current !== id) return;
    cache.set(id, built);
    setData(built);
    setLoading(false);
  }

  useEffect(() => {
    if (!orderId || !user) { setData(null); return; }
    load(orderId);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [orderId, user]);

  // Realtime: shipments, shipment_events, notifications, refunds
  useEffect(() => {
    if (!orderId || !user) return;
    let t: ReturnType<typeof setTimeout> | null = null;
    const refresh = () => { if (t) clearTimeout(t); t = setTimeout(() => load(orderId, false), 400); };
    const ch = supabase.channel(`order-drawer-${orderId}`)
      .on("postgres_changes", { event: "*", schema: "public", table: "shipments", filter: `order_id=eq.${orderId}` }, refresh)
      .on("postgres_changes", { event: "*", schema: "public", table: "shipment_events" }, refresh)
      .on("postgres_changes", { event: "*", schema: "public", table: "refunds", filter: `order_id=eq.${orderId}` }, refresh)
      .on("postgres_changes", { event: "*", schema: "public", table: "notifications", filter: `user_id=eq.${user.id}` }, refresh)
      .subscribe();
    return () => { if (t) clearTimeout(t); supabase.removeChannel(ch); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [orderId, user]);

  // lock body scroll while open
  useEffect(() => {
    if (orderId) { document.body.style.overflow = "hidden"; return () => { document.body.style.overflow = ""; }; }
  }, [orderId]);

  const order = data?.order ?? null;
  const shipment = data?.shipments?.[0] ?? null;
  const refund = data?.refunds?.[0] ?? null;
  const ret = data?.returns?.[0] ?? null;
  const payment = data?.payments?.[0] ?? null;

  const stageDone = useMemo(() => {
    const done = new Set<string>();
    if (!order) return done;
    done.add("placed");
    if (shipment?.packed_at) done.add("packed");
    if (shipment?.shipped_at) { done.add("packed"); done.add("shipped"); }
    const evs = shipment?.shipment_events ?? [];
    for (const e of evs) {
      const s = (e.status ?? "").toLowerCase();
      if (s.includes("transit")) done.add("in_transit");
      if (s.includes("out_for") || s.includes("out for")) done.add("out_for_delivery");
      if (s.includes("delivered")) done.add("delivered");
      if (s.includes("shipped")) done.add("shipped");
      if (s.includes("packed")) done.add("packed");
    }
    if (shipment?.delivered_at || shipment?.actual_delivery || (order.status ?? "").toLowerCase() === "delivered") {
      ["packed", "shipped", "in_transit", "out_for_delivery", "delivered"].forEach((k) => done.add(k));
    }
    return done;
  }, [order, shipment]);

  async function handleInvoice() {
    if (!order) return;
    setDownloading(true);
    try {
      const ok = await downloadInvoice(order.id);
      if (!ok) toast.error("Could not generate invoice");
    } finally { setDownloading(false); }
  }

  async function handleReorder() {
    if (!order) return;
    for (const it of order.order_items) if (it.product_slug) await cart.add(it.product_slug, it.quantity);
    onClose();
    nav({ to: "/cart" });
  }

  async function openTicket() {
    if (!order || !user) return;
    setTicketing(true);
    try {
      const { error } = await supabase.from("support_tickets").insert({
        user_id: user.id,
        subject: `Help with order #${order.id.slice(0, 8).toUpperCase()}`,
        category: "order",
        status: "open",
        priority: "normal",
        order_id: order.id,
      });
      if (error) { toast.error("Could not open ticket"); return; }
      toast.success("Support ticket created");
      onClose();
      nav({ to: "/account/support" });
    } finally { setTicketing(false); }
  }

  function onDragEnd(_e: unknown, info: PanInfo) {
    if (info.offset.y > 140 || info.velocity.y > 700) onClose();
  }

  const refundEligible = data ? (data.returnWindowDays > 0) : false;
  const windowRemaining = (() => {
    if (!order || !refundEligible) return null;
    const delivered = shipment?.delivered_at ?? shipment?.actual_delivery;
    if (!delivered) return "Available after delivery";
    const end = new Date(delivered); end.setDate(end.getDate() + data!.returnWindowDays);
    const days = Math.ceil((end.getTime() - Date.now()) / 864e5);
    return days > 0 ? `${days} day${days !== 1 ? "s" : ""} left` : "Window closed";
  })();

  return (
    <AnimatePresence>
      {orderId && (
        <>
          <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
            onClick={onClose} className="fixed inset-0 z-50 bg-background/70 backdrop-blur-sm" aria-hidden />
          <motion.div
            initial={{ y: "100%" }} animate={{ y: 0 }} exit={{ y: "100%" }}
            transition={{ type: "spring", damping: 32, stiffness: 320 }}
            drag="y" dragControls={undefined} dragConstraints={{ top: 0, bottom: 0 }} dragElastic={{ top: 0, bottom: 0.4 }} onDragEnd={onDragEnd}
            className="fixed inset-x-0 bottom-0 z-50 h-[94vh] rounded-t-3xl border-t border-border/60 bg-card/95 backdrop-blur-xl shadow-2xl flex flex-col"
            role="dialog" aria-modal="true"
          >
            {/* grabber + header */}
            <div className="shrink-0 px-4 pt-2 pb-3 border-b border-border/50">
              <div className="mx-auto mb-3 h-1.5 w-12 rounded-full bg-border" />
              <div className="flex items-center gap-3">
                <div className="flex-1 min-w-0">
                  <p className="text-[9px] font-mono uppercase tracking-[0.3em] text-accent/80 leading-none">Order details</p>
                  <div className="flex items-center gap-1.5">
                    <h2 className="font-display font-semibold tracking-tight text-base truncate">
                      {order ? `#${order.id.slice(0, 8).toUpperCase()}` : "Loading…"}
                    </h2>
                    {order && (
                      <button onClick={() => { navigator.clipboard.writeText(order.id).then(() => toast.success("Order ID copied")).catch(() => {}); }}
                        aria-label="Copy order ID" className="size-6 grid place-items-center rounded-md border border-border/60 hover:border-accent/50 hover:text-accent active:scale-90 transition">
                        <Copy className="size-3" />
                      </button>
                    )}
                  </div>
                </div>
                <button onClick={onClose} aria-label="Close" className="size-9 grid place-items-center rounded-full border border-border/60 hover:border-accent/50 active:scale-95 transition">
                  <X className="size-4" />
                </button>
              </div>
            </div>

            {/* body */}
            <div className="flex-1 overflow-y-auto overscroll-contain px-4 py-4 space-y-5">
              {loading && !data ? (
                <div className="py-20 grid place-items-center"><Loader2 className="size-5 animate-spin text-muted-foreground" /></div>
              ) : !order ? (
                <div className="py-20 text-center text-sm text-muted-foreground">Order not found.</div>
              ) : (
                <>
                  {/* SECTION 1 — Order summary */}
                  <Section title="Order Summary" icon={Receipt}>
                    <div className="grid grid-cols-2 gap-2 text-xs">
                      <Field label="Order ID" value={`#${order.id.slice(0, 8).toUpperCase()}`} />
                      <Field label="Order Date" value={fmtDate(order.created_at)} />
                      <Field label="Payment Status" value={order.payment_status ?? "—"} />
                      <Field label="Order Status" value={order.status} />
                      <Field label="Fulfillment" value={order.fulfillment_status ?? "—"} />
                      <Field label="Items" value={String(order.order_items.reduce((n, i) => n + i.quantity, 0))} />
                    </div>
                    <div className="mt-3 rounded-xl bg-background/50 border border-border/50 p-3 space-y-1.5 text-xs">
                      <Row label="Subtotal" value={format(Number(order.subtotal))} />
                      {Number(order.discount) > 0 && <Row label={`Discount${order.promo_code ? ` (${order.promo_code})` : ""}`} value={`- ${format(Number(order.discount))}`} tone="text-emerald-400" />}
                      <Row label="Shipping" value={Number(order.shipping) > 0 ? format(Number(order.shipping)) : "Free"} />
                      <Row label="Tax" value={format(Number(order.tax))} />
                      <div className="h-px bg-border/60 my-1" />
                      <Row label="Total" value={format(Number(order.total))} bold />
                    </div>
                  </Section>

                  {/* SECTION 2 — Products */}
                  <Section title="Products" icon={Boxes}>
                    <ul className="space-y-2">
                      {order.order_items.map((it) => (
                        <li key={it.id} className="flex gap-3 rounded-xl bg-background/50 border border-border/50 p-2.5">
                          <ItemThumb item={it} />
                          <div className="flex-1 min-w-0">
                            <p className="text-sm font-medium truncate">{it.name}</p>
                            <p className="text-[11px] text-muted-foreground">Qty {it.quantity} · {format(Number(it.unit_price))}</p>
                            <p className="text-[11px] font-mono mt-0.5">Subtotal {format(Number(it.line_total))}</p>
                            {it.product_slug && (
                              <Link to="/products/$slug" params={{ slug: it.product_slug }} onClick={onClose}
                                className="inline-flex items-center gap-1 text-[10px] font-mono uppercase tracking-widest text-accent mt-1 hover:underline">
                                View product <ChevronRight className="size-3" />
                              </Link>
                            )}
                          </div>
                        </li>
                      ))}
                    </ul>
                  </Section>

                  {/* SECTION 3 — Tracking preview */}
                  <Section title="Tracking" icon={Truck}>
                    <ol className="relative pl-6">
                      <div className="absolute left-[9px] top-1 bottom-1 w-px bg-border/60" />
                      {TRACK_STAGES.map((st) => {
                        const done = stageDone.has(st.key);
                        const Icon = st.icon;
                        return (
                          <li key={st.key} className="relative pb-3 last:pb-0">
                            <span className={`absolute -left-6 top-0 size-[18px] grid place-items-center rounded-full border-2 ${done ? "border-accent bg-accent/15 text-accent" : "border-border bg-card text-muted-foreground"}`}>
                              <Icon className="size-2.5" />
                            </span>
                            <p className={`text-xs ${done ? "font-medium text-foreground" : "text-muted-foreground"}`}>{st.label}</p>
                          </li>
                        );
                      })}
                    </ol>
                    {(shipment?.shipment_events?.length ?? 0) > 0 && (
                      <div className="mt-3 rounded-xl bg-background/50 border border-border/50 p-3 space-y-2">
                        <p className="text-[9px] font-mono uppercase tracking-widest text-muted-foreground">Latest updates</p>
                        {shipment!.shipment_events.slice().sort((a, b) => +new Date(b.occurred_at) - +new Date(a.occurred_at)).slice(0, 5).map((e) => (
                          <div key={e.id} className="text-xs">
                            <p className="font-medium">{e.description ?? e.status}</p>
                            <p className="text-[10px] text-muted-foreground">{[e.location, fmtDate(e.occurred_at, true)].filter(Boolean).join(" · ")}</p>
                          </div>
                        ))}
                      </div>
                    )}
                    {!shipment && <p className="text-[11px] text-muted-foreground mt-2">No tracking updates yet.</p>}
                  </Section>

                  {/* SECTION 4 — Shipping details */}
                  <Section title="Shipping" icon={MapPin}>
                    <div className="grid grid-cols-2 gap-2 text-xs">
                      <Field label="Recipient" value={order.shipping_address?.name ?? "—"} />
                      <Field label="Phone" value={order.shipping_address?.phone ?? "—"} />
                      <Field label="City" value={order.shipping_address?.city ?? "—"} />
                      <Field label="State" value={order.shipping_address?.region ?? "—"} />
                      <Field label="Country" value={order.shipping_address?.country ?? "—"} />
                      <Field label="PIN Code" value={order.shipping_address?.postal_code ?? "—"} />
                      <Field label="Courier" value={shipment?.carrier ?? order.carrier ?? "—"} />
                      <CopyField label="Tracking No." value={shipment?.tracking_number ?? order.tracking_number ?? "—"} />
                      <Field label="Est. Delivery" value={fmtDate(shipment?.estimated_delivery)} />
                    </div>
                    {order.shipping_address?.line1 && (
                      <p className="text-xs text-muted-foreground mt-2">{[order.shipping_address.line1, order.shipping_address.line2].filter(Boolean).join(", ")}</p>
                    )}
                    <div className="mt-2 flex flex-wrap gap-1.5">
                      <CopyButton label="Copy Address" value={[
                        order.shipping_address?.name, order.shipping_address?.phone,
                        order.shipping_address?.line1, order.shipping_address?.line2,
                        order.shipping_address?.city, order.shipping_address?.region,
                        order.shipping_address?.postal_code, order.shipping_address?.country,
                      ].filter(Boolean).join(", ")} />
                      {shipment?.tracking_url && (
                        <a href={shipment.tracking_url} target="_blank" rel="noopener noreferrer"
                          className="inline-flex items-center gap-1.5 text-[10px] font-mono uppercase tracking-widest px-3 py-2 rounded-full border border-border/60 hover:border-accent/40 hover:text-accent active:scale-95 transition">
                          Tracking link <ExternalLink className="size-3" />
                        </a>
                      )}
                    </div>
                  </Section>

                  {/* SECTION 5 — Payment details */}
                  <Section title="Payment" icon={CreditCard}>
                    <div className="grid grid-cols-2 gap-2 text-xs">
                      <Field label="Method" value={order.payment_method === "cod" ? "Cash on Delivery" : (payment?.method ?? order.payment_method ?? "Razorpay")} />
                      <Field label="Status" value={payment?.status ?? order.payment_status ?? "—"} />
                      <Field label="Paid Date" value={fmtDate(payment?.created_at, true)} />
                      <Field label="Amount" value={payment ? format(Number(payment.amount)) : format(Number(order.total))} />
                      <CopyField label="Razorpay Payment ID" value={payment?.razorpay_payment_id ?? order.razorpay_payment_id ?? "—"} />
                      <CopyField label="Transaction ID" value={payment?.transaction_id ?? "—"} />
                      <Field label="Invoice No." value={`INV-${order.id.slice(0, 8).toUpperCase()}`} mono />
                    </div>
                    <button onClick={handleInvoice} disabled={downloading}
                      className="mt-3 inline-flex items-center gap-1.5 text-[10px] font-mono uppercase tracking-widest px-3 py-2 rounded-full border border-border/60 hover:border-accent/40 hover:text-accent active:scale-95 transition disabled:opacity-50">
                      {downloading ? <Loader2 className="size-3 animate-spin" /> : <Download className="size-3" />} Download Invoice
                    </button>
                  </Section>

                  {/* ADMIN-ONLY — internal intelligence */}
                  {isAdmin && (
                    <section className="rounded-2xl border border-amber-500/30 bg-amber-500/[0.04] p-3">
                      <div className="flex items-center gap-1.5 mb-2">
                        <Lock className="size-3.5 text-amber-400" />
                        <h3 className="text-[11px] font-mono uppercase tracking-[0.25em] text-amber-300">Admin Only</h3>
                      </div>
                      <div className="grid grid-cols-2 gap-2 text-xs">
                        <Field label="Customer" value={order.shipping_address?.name ?? order.contact_email ?? "—"} />
                        <Field label="Phone" value={order.shipping_address?.phone ?? "—"} />
                        <CopyField label="Razorpay Payment ID" value={payment?.razorpay_payment_id ?? order.razorpay_payment_id ?? "—"} />
                        <CopyField label="Transaction ID" value={payment?.transaction_id ?? "—"} />
                        <Field label="Cost Price" value={data!.cost > 0 ? format(data!.cost) : "—"} />
                        <Field label="Shipping Cost" value={format(Number(order.shipping))} />
                        <Field label="Order Profit" value={data!.cost > 0 ? format(Number(order.subtotal) - data!.cost) : "—"} />
                        <Field label="Order Revenue" value={format(Number(order.total))} />
                      </div>
                      <CopyButton label="Copy Address" value={[
                        order.shipping_address?.name, order.shipping_address?.phone,
                        order.shipping_address?.line1, order.shipping_address?.line2,
                        order.shipping_address?.city, order.shipping_address?.region,
                        order.shipping_address?.postal_code, order.shipping_address?.country,
                      ].filter(Boolean).join(", ")} />
                    </section>
                  )}


                  {/* SECTION 6 — Returns & refunds */}
                  <Section title="Returns & Refunds" icon={RotateCcw}>
                    <div className="grid grid-cols-2 gap-2 text-xs">
                      <Field label="Return Eligible" value={refundEligible ? "Yes" : "No"} />
                      <Field label="Window" value={windowRemaining ?? "—"} />
                      <Field label="Refund Status" value={refund?.status ?? ret?.refund_status ?? "—"} />
                      <Field label="Refund Amount" value={refund ? format(Number(refund.amount)) : "—"} />
                    </div>
                    {(refund || ret) && (
                      <div className="mt-3 rounded-xl bg-background/50 border border-border/50 p-3 space-y-2">
                        <p className="text-[9px] font-mono uppercase tracking-widest text-muted-foreground">Timeline</p>
                        {ret && <TimelineRow label={`Return requested${ret.reason ? ` · ${ret.reason}` : ""}`} at={ret.created_at} />}
                        {ret && <TimelineRow label={`Return ${ret.status}`} at={ret.created_at} />}
                        {refund && <TimelineRow label={`Refund ${refund.status}`} at={refund.updated_at ?? refund.created_at} />}
                      </div>
                    )}
                    {!refund && !ret && (
                      <Link to="/returns" onClick={onClose} className="inline-flex items-center gap-1 text-[10px] font-mono uppercase tracking-widest text-accent mt-2 hover:underline">
                        Start a return <ChevronRight className="size-3" />
                      </Link>
                    )}
                  </Section>

                  {/* SECTION 7 — Support */}
                  <Section title="Need Help?" icon={LifeBuoy}>
                    <div className="flex flex-wrap gap-1.5">
                      <button onClick={openTicket} disabled={ticketing}
                        className="inline-flex items-center gap-1.5 text-[10px] font-mono uppercase tracking-widest px-3 py-2 rounded-full bg-accent text-accent-foreground active:scale-95 transition disabled:opacity-50">
                        {ticketing ? <Loader2 className="size-3 animate-spin" /> : <MessageSquare className="size-3" />} Open Support Ticket
                      </button>
                      <Link to="/account/support" onClick={onClose} className="inline-flex items-center gap-1.5 text-[10px] font-mono uppercase tracking-widest px-3 py-2 rounded-full border border-border/60 hover:border-accent/40 hover:text-accent active:scale-95 transition">
                        <LifeBuoy className="size-3" /> Live Chat
                      </Link>
                      <Link to="/help" onClick={onClose} className="inline-flex items-center gap-1.5 text-[10px] font-mono uppercase tracking-widest px-3 py-2 rounded-full border border-border/60 hover:border-accent/40 hover:text-accent active:scale-95 transition">
                        <ShieldCheck className="size-3" /> Contact Support
                      </Link>
                    </div>
                  </Section>

                  {/* SECTION 8 — Notifications history */}
                  <Section title="Notifications" icon={Bell}>
                    {data!.notifications.length === 0 ? (
                      <p className="text-[11px] text-muted-foreground">No notifications for this order yet.</p>
                    ) : (
                      <ul className="space-y-2">
                        {data!.notifications.map((n) => (
                          <li key={n.id} className="flex gap-2.5 rounded-xl bg-background/50 border border-border/50 p-2.5">
                            <span className="size-7 shrink-0 grid place-items-center rounded-full bg-accent/10 text-accent"><Bell className="size-3.5" /></span>
                            <div className="min-w-0">
                              <p className="text-xs font-medium truncate">{n.title}</p>
                              {n.body && <p className="text-[11px] text-muted-foreground line-clamp-2">{n.body}</p>}
                              <p className="text-[10px] text-muted-foreground mt-0.5">{fmtDate(n.created_at, true)}</p>
                            </div>
                          </li>
                        ))}
                      </ul>
                    )}
                  </Section>
                </>
              )}
            </div>

            {/* sticky action bar */}
            {order && (
              <div className="shrink-0 border-t border-border/50 bg-card/95 backdrop-blur px-4 py-3 flex gap-2">
                <button onClick={handleReorder}
                  className="flex-1 inline-flex items-center justify-center gap-1.5 text-[11px] font-mono uppercase tracking-widest px-4 py-2.5 rounded-full bg-accent text-accent-foreground active:scale-95 transition">
                  <RefreshCw className="size-3.5" /> Reorder
                </button>
                <Link to="/track" onClick={onClose}
                  className="flex-1 inline-flex items-center justify-center gap-1.5 text-[11px] font-mono uppercase tracking-widest px-4 py-2.5 rounded-full border border-border/60 hover:border-accent/40 hover:text-accent active:scale-95 transition">
                  <MapPin className="size-3.5" /> Track
                </Link>
              </div>
            )}
          </motion.div>
        </>
      )}
    </AnimatePresence>
  );
}

function Section({ title, icon: Icon, children }: { title: string; icon: typeof Truck; children: React.ReactNode }) {
  return (
    <section>
      <div className="flex items-center gap-1.5 mb-2">
        <Icon className="size-3.5 text-accent" />
        <h3 className="text-[11px] font-mono uppercase tracking-[0.25em] text-foreground">{title}</h3>
      </div>
      {children}
    </section>
  );
}

function Field({ label, value, mono }: { label: string; value: string; mono?: boolean }) {
  return (
    <div className="rounded-lg bg-background/40 border border-border/40 px-2.5 py-1.5">
      <p className="text-[9px] font-mono uppercase tracking-widest text-muted-foreground">{label}</p>
      <p className={`text-xs truncate ${mono ? "font-mono" : ""}`}>{value}</p>
    </div>
  );
}

function useCopy() {
  const [copied, setCopied] = useState(false);
  return {
    copied,
    copy: async (v: string) => {
      try { await navigator.clipboard.writeText(v); setCopied(true); toast.success("Copied"); setTimeout(() => setCopied(false), 1500); }
      catch { toast.error("Couldn't copy"); }
    },
  };
}

// Copyable field with one-tap copy button
function CopyField({ label, value, disabled }: { label: string; value: string; disabled?: boolean }) {
  const { copied, copy } = useCopy();
  const empty = disabled || !value || value === "—";
  return (
    <div className="rounded-lg bg-background/40 border border-border/40 px-2.5 py-1.5 flex items-center gap-2">
      <div className="min-w-0 flex-1">
        <p className="text-[9px] font-mono uppercase tracking-widest text-muted-foreground">{label}</p>
        <p className="text-xs font-mono truncate">{value || "—"}</p>
      </div>
      {!empty && (
        <button onClick={() => copy(value)} aria-label={`Copy ${label}`}
          className="size-7 shrink-0 grid place-items-center rounded-md border border-border/60 hover:border-accent/50 hover:text-accent active:scale-90 transition">
          {copied ? <Check className="size-3 text-emerald-400" /> : <Copy className="size-3" />}
        </button>
      )}
    </div>
  );
}

function CopyButton({ label, value }: { label: string; value: string }) {
  const { copied, copy } = useCopy();
  if (!value) return null;
  return (
    <button onClick={() => copy(value)}
      className="inline-flex items-center gap-1.5 text-[10px] font-mono uppercase tracking-widest px-3 py-2 rounded-full border border-border/60 hover:border-accent/40 hover:text-accent active:scale-95 transition">
      {copied ? <Check className="size-3 text-emerald-400" /> : <Copy className="size-3" />} {label}
    </button>
  );
}


function Row({ label, value, bold, tone }: { label: string; value: string; bold?: boolean; tone?: string }) {
  return (
    <div className="flex items-center justify-between">
      <span className={`${bold ? "font-semibold" : "text-muted-foreground"}`}>{label}</span>
      <span className={`font-mono ${bold ? "font-semibold text-sm" : ""} ${tone ?? ""}`}>{value}</span>
    </div>
  );
}

function TimelineRow({ label, at }: { label: string; at: string }) {
  return (
    <div className="flex items-start gap-2 text-xs">
      <CheckCircle2 className="size-3.5 text-accent mt-0.5 shrink-0" />
      <div className="min-w-0">
        <p className="font-medium capitalize truncate">{label}</p>
        <p className="text-[10px] text-muted-foreground">{fmtDate(at, true)}</p>
      </div>
    </div>
  );
}

function ItemThumb({ item }: { item: OrderItem }) {
  const [err, setErr] = useState(false);
  if (item.image && !err) return <img src={item.image} alt={item.name} loading="lazy" onError={() => setErr(true)} className="size-16 rounded-xl object-cover border border-border/60 bg-muted shrink-0" />;
  return <div className="size-16 rounded-xl border border-border/60 bg-muted grid place-items-center shrink-0"><Package className="size-5 text-muted-foreground" /></div>;
}
