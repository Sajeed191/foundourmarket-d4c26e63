import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { ArrowLeft, Clock, CheckCircle2, Truck, Package, XCircle, Loader2, MapPin, RotateCcw, ExternalLink } from "lucide-react";
import { motion } from "framer-motion";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/lib/auth";
import { useRegion } from "@/lib/region";
import { safeExternalUrl } from "@/lib/safe-redirect";
import { ReturnRequestDialog } from "@/components/site/ReturnRequestDialog";
import { OrderSupportSection } from "@/components/site/OrderSupportSection";

export const Route = createFileRoute("/orders/$id")({
  head: () => ({ meta: [{ title: "Order Details — FoundOurMarket™" }] }),
  component: OrderDetailPage,
});

const STATUSES = [
  { key: "pending", label: "Order placed", icon: Clock },
  { key: "paid", label: "Payment received", icon: CheckCircle2 },
  { key: "shipped", label: "Shipped", icon: Truck },
  { key: "out_for_delivery", label: "Out for delivery", icon: MapPin },
  { key: "delivered", label: "Delivered", icon: Package },
] as const;

type OrderItem = { id: string; name: string; quantity: number; image: string | null; unit_price: number; line_total: number; product_slug: string; variant_name?: string | null; variant_size?: string | null; variant_color?: string | null; variant_sku?: string | null; variant_image?: string | null };
type Order = {
  id: string;
  status: string;
  subtotal: number;
  discount: number;
  shipping: number;
  tax: number;
  total: number;
  currency: string;
  promo_code: string | null;
  contact_email: string | null;
  shipping_address: { name?: string; line1?: string; line2?: string; city?: string; region?: string; postal_code?: string; country?: string } | null;
  created_at: string;
  updated_at: string;
  order_items: OrderItem[];
};

type ShipmentEvent = { id: string; status: string; description: string | null; location: string | null; occurred_at: string };
type Shipment = { id: string; status: string; carrier: string | null; tracking_number: string | null; tracking_url: string | null; shipped_at: string | null; delivered_at: string | null; shipment_events: ShipmentEvent[] };
type ReturnRec = { id: string; status: string; reason: string; resolution_type: string; replacement_status: string; refund_status: string; refund_amount: number | null; created_at: string };

function OrderDetailPage() {
  const { id } = Route.useParams();
  const { user, loading: authLoading } = useAuth();
  const { format } = useRegion();
  const nav = useNavigate();
  const [order, setOrder] = useState<Order | null | undefined>(undefined);
  const [shipments, setShipments] = useState<Shipment[]>([]);
  const [returnOpen, setReturnOpen] = useState(false);
  const [returnRec, setReturnRec] = useState<ReturnRec | null>(null);

  useEffect(() => {
    if (!authLoading && !user) nav({ to: "/auth" });
  }, [authLoading, user, nav]);

  useEffect(() => {
    if (!user) return;
    supabase
      .from("orders")
      .select("id,status,subtotal,discount,shipping,tax,total,currency,promo_code,contact_email,shipping_address,created_at,updated_at,order_items(id,name,quantity,image,unit_price,line_total,product_slug,variant_name,variant_size,variant_color,variant_sku,variant_image)")
      .eq("id", id)
      .maybeSingle()
      .then(({ data }) => setOrder((data as Order) ?? null));
    supabase
      .from("shipments")
      .select("id,status,carrier,tracking_number,tracking_url,shipped_at,delivered_at,shipment_events(id,status,description,location,occurred_at)")
      .eq("order_id", id)
      .order("created_at", { ascending: true })
      .then(({ data }) => setShipments((data as Shipment[]) ?? []));
    supabase
      .from("returns")
      .select("id,status,reason,resolution_type,replacement_status,refund_status,refund_amount,created_at")
      .eq("order_id", id)
      .order("created_at", { ascending: false })
      .limit(1)
      .then(({ data }) => setReturnRec(((data as ReturnRec[]) ?? [])[0] ?? null));
  }, [user, id]);

  if (authLoading || order === undefined) {
    return (
      <div className="min-h-[60vh] grid place-items-center">
        <Loader2 className="size-5 animate-spin text-muted-foreground" />
      </div>
    );
  }

  if (!order) {
    return (
      <div className="max-w-2xl mx-auto px-6 py-20 text-center">
        <XCircle className="size-8 mx-auto text-muted-foreground mb-3" />
        <h1 className="font-display text-2xl mb-2">Order not found</h1>
        <p className="text-sm text-muted-foreground mb-6">We couldn't find that order on your account.</p>
        <Link to="/account" className="inline-block bg-accent text-accent-foreground rounded-full px-6 py-3 text-xs uppercase tracking-widest font-bold">Back to Account</Link>
      </div>
    );
  }

  // Derive progress from order.status plus the latest shipment status so the
  // admin's "out for delivery"/"delivered" marks reflect on the customer page.
  const shipStatuses = shipments.map((s) => s.status);
  const reachedKey = shipStatuses.includes("delivered")
    ? "delivered"
    : shipStatuses.includes("out_for_delivery")
      ? "out_for_delivery"
      : order.status;
  const orderIdx = STATUSES.findIndex((s) => s.key === order.status);
  const shipIdx = STATUSES.findIndex((s) => s.key === reachedKey);
  const currentIdx = Math.max(orderIdx, shipIdx);
  const cancelled = order.status === "cancelled";
  const addr = order.shipping_address;

  const deliveredShipment = shipments.find((s) => s.delivered_at);
  const isDelivered = order.status === "delivered" || shipments.some((s) => s.status === "delivered");
  const RETURN_WINDOW_DAYS = 4;
  const deliveredAt = deliveredShipment?.delivered_at ?? (order.status === "delivered" ? order.updated_at : null);
  const returnWindowOpen = isDelivered && deliveredAt
    ? Date.now() < new Date(deliveredAt).getTime() + RETURN_WINDOW_DAYS * 24 * 60 * 60 * 1000
    : false;
  const fmtDate = (d: Date) => d.toLocaleDateString(undefined, { weekday: "short", month: "short", day: "numeric" });
  const etaLabel = (() => {
    if (order.status === "delivered") {
      const when = deliveredShipment?.delivered_at ?? order.updated_at;
      return fmtDate(new Date(when));
    }
    const base = new Date(order.created_at);
    const lo = new Date(base); lo.setDate(lo.getDate() + 3);
    const hi = new Date(base); hi.setDate(hi.getDate() + 5);
    return `${fmtDate(lo)} — ${fmtDate(hi)}`;
  })();


  return (
    <div className="container-page py-10 sm:py-16 max-w-4xl">
      <Link to="/account" className="inline-flex items-center gap-2 text-xs uppercase tracking-widest text-muted-foreground hover:text-foreground mb-6">
        <ArrowLeft className="size-3.5" /> Back to Orders
      </Link>

      <motion.div
        initial={{ opacity: 0, y: 12 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.4 }}
        className="mb-8"
      >
        <p className="text-[10px] font-mono uppercase tracking-[0.3em] text-accent mb-3">Order</p>
        <h1 className="text-fluid-2xl font-display font-semibold tracking-tight break-all">#{order.id.slice(0, 8)}</h1>
        <p className="text-sm text-muted-foreground mt-2 font-mono">Placed {new Date(order.created_at).toLocaleString()}</p>
      </motion.div>

      <motion.div
        initial={{ opacity: 0, y: 12 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.4, delay: 0.05 }}
        className="bg-card border border-border rounded-2xl p-5 sm:p-6 mb-6"
      >
        {cancelled ? (
          <div className="flex items-center gap-3 p-4 bg-destructive/10 border border-destructive/30 rounded-xl">
            <XCircle className="size-5 text-destructive" />
            <span className="text-sm font-medium">This order was cancelled.</span>
          </div>
        ) : (
          <>
            <ol className="grid grid-cols-5 gap-1 sm:gap-2 relative">
              <div className="absolute top-5 left-[10%] right-[10%] h-px bg-border -z-0" aria-hidden />
              <div
                className="absolute top-5 left-[10%] h-px bg-accent -z-0 transition-all duration-700"
                style={{ width: `${Math.max(0, currentIdx) / 4 * 80}%` }}
                aria-hidden
              />
              {STATUSES.map((s, i) => {
                const done = i <= currentIdx;
                const Icon = s.icon;
                return (
                  <li key={s.key} className="flex flex-col items-center text-center relative z-10">
                    <div className={`size-10 rounded-full grid place-items-center border-2 bg-card transition-colors ${done ? "bg-accent border-accent text-accent-foreground" : "border-border text-muted-foreground"}`}>
                      <Icon className="size-4" />
                    </div>
                    <span className={`mt-2 text-[9px] sm:text-[10px] font-mono uppercase tracking-widest leading-tight ${done ? "text-foreground" : "text-muted-foreground"}`}>
                      {s.label}
                    </span>
                  </li>
                );
              })}
            </ol>

            <div className="mt-6 pt-5 border-t border-border flex items-center gap-3">
              <div className="size-10 rounded-full grid place-items-center bg-accent/10 text-accent shrink-0">
                {order.status === "delivered" ? <Package className="size-4" /> : <Truck className="size-4" />}
              </div>
              <div className="min-w-0">
                <p className="text-[10px] font-mono uppercase tracking-widest text-muted-foreground">
                  {order.status === "delivered" ? "Delivered" : "Estimated delivery"}
                </p>
                <p className="text-sm font-medium">{etaLabel}</p>
              </div>
            </div>
          </>
        )}
      </motion.div>


      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <motion.div
          initial={{ opacity: 0, y: 12 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.4, delay: 0.1 }}
          className="lg:col-span-2 min-w-0 bg-card border border-border rounded-2xl p-5 sm:p-6"
        >
          <h3 className="text-[10px] font-mono uppercase tracking-widest text-accent mb-4">Items</h3>
          <ul className="space-y-3">
            {order.order_items.map((it) => {
              const options = [it.variant_color, it.variant_size].filter(Boolean).join(" · ") || it.variant_name || "";
              return (
              <li key={it.id} className="flex items-center gap-3">
                {(it.variant_image || it.image) && <img decoding="async" src={it.variant_image || it.image || undefined} alt="" className="size-14 rounded-lg object-cover border border-border" loading="lazy" />}
                <div className="flex-1 min-w-0">
                  <Link to="/products/$slug" params={{ slug: it.product_slug }} className="text-sm font-medium truncate hover:text-accent block">{it.name}</Link>
                  {options && <p className="text-xs text-accent/90 truncate">{options}{it.variant_sku ? ` · ${it.variant_sku}` : ""}</p>}
                  <p className="text-xs text-muted-foreground font-mono">Qty {it.quantity} · {format(Number(it.unit_price))} ea</p>
                </div>
                <p className="font-mono text-sm whitespace-nowrap">{format(Number(it.line_total))}</p>
              </li>
              );
            })}
          </ul>
          <div className="mt-5 pt-5 border-t border-border space-y-1.5 text-sm">
            <Row label="Subtotal" value={format(Number(order.subtotal))} />
            {Number(order.discount) > 0 && <Row label={`Discount${order.promo_code ? ` (${order.promo_code})` : ""}`} value={`− ${format(Number(order.discount))}`} />}
            <Row label="Shipping" value={format(Number(order.shipping))} />
            <Row label="Tax" value={format(Number(order.tax))} />
            <div className="flex justify-between pt-2 border-t border-border font-bold text-base">
              <span>Total</span>
              <span className="font-mono text-accent">{format(Number(order.total))}</span>
            </div>
          </div>
        </motion.div>

        <div className="space-y-6 min-w-0">
          {addr && (
            <motion.div
              initial={{ opacity: 0, y: 12 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.4, delay: 0.15 }}
              className="bg-card border border-border rounded-2xl p-5 sm:p-6"
            >
              <h3 className="text-[10px] font-mono uppercase tracking-widest text-accent mb-4 flex items-center gap-2">
                <MapPin className="size-3.5" /> Shipping Address
              </h3>
              <div className="text-sm space-y-0.5">
                {addr.name && <p className="font-medium">{addr.name}</p>}
                {addr.line1 && <p>{addr.line1}</p>}
                {addr.line2 && <p>{addr.line2}</p>}
                <p>{[addr.city, addr.region, addr.postal_code].filter(Boolean).join(", ")}</p>
                {addr.country && <p>{addr.country}</p>}
              </div>
              {order.contact_email && <p className="text-xs text-muted-foreground font-mono mt-3 break-all">{order.contact_email}</p>}
            </motion.div>
          )}

          {returnRec && (
            <div className="rounded-2xl border border-border p-4">
              <div className="flex items-center justify-between gap-3 flex-wrap">
                <div className="min-w-0">
                  <p className="text-[10px] font-mono uppercase tracking-widest text-muted-foreground">Resolution Method</p>
                  <p className="text-sm font-medium mt-1 flex items-center gap-2">
                    <RotateCcw className="size-3.5 text-accent" />
                    {returnRec.resolution_type === "refund" ? "Refund" : "Replacement"}
                  </p>
                </div>
                <div className="text-right">
                  <p className="text-[10px] font-mono uppercase tracking-widest text-muted-foreground">Status</p>
                  <p className="text-sm font-semibold text-accent capitalize mt-1">
                    {returnRec.status === "rejected"
                      ? "Rejected"
                      : returnRec.resolution_type === "refund"
                        ? returnRec.refund_status
                        : (returnRec.replacement_status || "pending")}
                  </p>
                </div>
              </div>
            </div>
          )}
          {returnWindowOpen && user && (
            <>
              <button
                type="button"
                onClick={() => setReturnOpen(true)}
                className="flex items-center justify-center gap-2 text-xs uppercase tracking-widest border border-border rounded-full px-5 py-3 hover:border-accent/40 hover:text-accent transition-colors"
              >
                <RotateCcw className="size-3.5" /> Request return
              </button>
              <ReturnRequestDialog
                open={returnOpen}
                onOpenChange={setReturnOpen}
                orderId={order.id}
                userId={user.id}
                items={order.order_items}
              />
            </>
          )}

        </div>
      </div>

      {shipments.length > 0 && (
        <motion.div
          initial={{ opacity: 0, y: 12 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.4, delay: 0.2 }}
          className="bg-card border border-border rounded-2xl p-5 sm:p-6 mt-6"
        >
          <h3 className="text-[10px] font-mono uppercase tracking-widest text-accent mb-4 flex items-center gap-2">
            <Truck className="size-3.5" /> Tracking
          </h3>
          {shipments.map((s) => (
            <div key={s.id} className="mb-5 last:mb-0">
              <div className="flex items-center justify-between flex-wrap gap-2 mb-3">
                <p className="text-sm">
                  {s.carrier ?? "Shipment"}{s.tracking_number ? <span className="font-mono text-muted-foreground"> · {s.tracking_number}</span> : null}
                </p>
                <div className="flex items-center gap-2">
                  <span className="text-[10px] font-mono uppercase tracking-widest text-accent bg-accent/10 px-2 py-1 rounded-full">{s.status.replace(/_/g, " ")}</span>
                  {safeExternalUrl(s.tracking_url) && (
                    <a href={safeExternalUrl(s.tracking_url)!} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1 text-[10px] uppercase tracking-widest text-accent hover:underline">
                      Track <ExternalLink className="size-3" />
                    </a>
                  )}
                </div>
              </div>
              {s.shipment_events.length > 0 && (
                <ol className="relative border-l border-border/60 pl-4 space-y-3">
                  {[...s.shipment_events].sort((a, b) => +new Date(b.occurred_at) - +new Date(a.occurred_at)).map((e) => (
                    <li key={e.id} className="relative">
                      <span className="absolute -left-[21px] top-1 size-2 rounded-full bg-accent" />
                      <p className="text-xs font-medium">{e.description ?? e.status.replace(/_/g, " ")}</p>
                      <p className="text-[10px] font-mono text-muted-foreground">{new Date(e.occurred_at).toLocaleString()}{e.location ? ` · ${e.location}` : ""}</p>
                    </li>
                  ))}
                </ol>
              )}
            </div>
          ))}
        </motion.div>
      )}

      <OrderSupportSection
        orderId={order.id}
        prefill={{
          order: order.id,
          category: "order_issue",
          subject: `Help with order #${order.id.slice(0, 8)}`,
          context: {
            order_number: order.id.slice(0, 8),
            order_status: order.status,
            product_name: order.order_items[0]?.name,
            product_image: order.order_items[0]?.image ?? undefined,
            tracking_number: shipments.find((s) => s.tracking_number)?.tracking_number ?? undefined,
            carrier: shipments.find((s) => s.carrier)?.carrier ?? undefined,
            delivery_status: reachedKey,
          },
        }}
      />
    </div>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex justify-between text-muted-foreground">
      <span>{label}</span>
      <span className="font-mono text-foreground">{value}</span>
    </div>
  );
}
