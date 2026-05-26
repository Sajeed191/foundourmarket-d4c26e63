import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { ArrowLeft, Clock, CheckCircle2, Truck, Package, XCircle, Loader2, MapPin, RotateCcw, ExternalLink } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/lib/auth";
import { useRegion } from "@/lib/region";

export const Route = createFileRoute("/orders/$id")({
  head: () => ({ meta: [{ title: "Order Details — FoundOurMarket™" }] }),
  component: OrderDetailPage,
});

const STATUSES = [
  { key: "pending", label: "Order placed", icon: Clock },
  { key: "paid", label: "Payment received", icon: CheckCircle2 },
  { key: "shipped", label: "Shipped", icon: Truck },
  { key: "delivered", label: "Delivered", icon: Package },
] as const;

type OrderItem = { id: string; name: string; quantity: number; image: string | null; unit_price: number; line_total: number; product_slug: string };
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

function OrderDetailPage() {
  const { id } = Route.useParams();
  const { user, loading: authLoading } = useAuth();
  const { format } = useRegion();
  const nav = useNavigate();
  const [order, setOrder] = useState<Order | null | undefined>(undefined);

  useEffect(() => {
    if (!authLoading && !user) nav({ to: "/auth" });
  }, [authLoading, user, nav]);

  useEffect(() => {
    if (!user) return;
    supabase
      .from("orders")
      .select("id,status,subtotal,discount,shipping,tax,total,currency,promo_code,contact_email,shipping_address,created_at,updated_at,order_items(id,name,quantity,image,unit_price,line_total,product_slug)")
      .eq("id", id)
      .maybeSingle()
      .then(({ data }) => setOrder((data as Order) ?? null));
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

  const currentIdx = STATUSES.findIndex((s) => s.key === order.status);
  const cancelled = order.status === "cancelled";
  const addr = order.shipping_address;

  return (
    <div className="max-w-3xl mx-auto px-4 sm:px-6 py-12 sm:py-16">
      <Link to="/account" className="inline-flex items-center gap-2 text-xs uppercase tracking-widest text-muted-foreground hover:text-foreground mb-6">
        <ArrowLeft className="size-3.5" /> Back to Orders
      </Link>

      <div className="mb-8">
        <p className="text-[10px] font-mono uppercase tracking-[0.3em] text-accent mb-3">Order</p>
        <h1 className="text-2xl sm:text-4xl font-display font-semibold tracking-tight break-all">#{order.id.slice(0, 8)}</h1>
        <p className="text-sm text-muted-foreground mt-2 font-mono">Placed {new Date(order.created_at).toLocaleString()}</p>
      </div>

      <div className="bg-card border border-border rounded-2xl p-5 sm:p-6 mb-6">
        {cancelled ? (
          <div className="flex items-center gap-3 p-4 bg-destructive/10 border border-destructive/30 rounded-xl">
            <XCircle className="size-5 text-destructive" />
            <span className="text-sm font-medium">This order was cancelled.</span>
          </div>
        ) : (
          <ol className="grid grid-cols-4 gap-2">
            {STATUSES.map((s, i) => {
              const done = i <= currentIdx;
              const Icon = s.icon;
              return (
                <li key={s.key} className="flex flex-col items-center text-center">
                  <div className={`size-10 rounded-full grid place-items-center border-2 transition-colors ${done ? "bg-accent border-accent text-accent-foreground" : "border-border text-muted-foreground"}`}>
                    <Icon className="size-4" />
                  </div>
                  <span className={`mt-2 text-[10px] font-mono uppercase tracking-widest ${done ? "text-foreground" : "text-muted-foreground"}`}>
                    {s.label}
                  </span>
                </li>
              );
            })}
          </ol>
        )}
      </div>

      <div className="bg-card border border-border rounded-2xl p-5 sm:p-6 mb-6">
        <h3 className="text-[10px] font-mono uppercase tracking-widest text-accent mb-4">Items</h3>
        <ul className="space-y-3">
          {order.order_items.map((it) => (
            <li key={it.id} className="flex items-center gap-3">
              {it.image && <img src={it.image} alt="" className="size-14 rounded-lg object-cover border border-border" />}
              <div className="flex-1 min-w-0">
                <Link to="/products/$slug" params={{ slug: it.product_slug }} className="text-sm font-medium truncate hover:text-accent block">{it.name}</Link>
                <p className="text-xs text-muted-foreground font-mono">Qty {it.quantity} · {format(Number(it.unit_price))} ea</p>
              </div>
              <p className="font-mono text-sm">{format(Number(it.line_total))}</p>
            </li>
          ))}
        </ul>
        <div className="mt-5 pt-5 border-t border-border space-y-1.5 text-sm">
          <Row label="Subtotal" value={format(Number(order.subtotal))} />
          {Number(order.discount) > 0 && <Row label={`Discount${order.promo_code ? ` (${order.promo_code})` : ""}`} value={`− ${format(Number(order.discount))}`} />}
          <Row label="Shipping" value={format(Number(order.shipping))} />
          <Row label="Tax" value={format(Number(order.tax))} />
          <div className="flex justify-between pt-2 border-t border-border font-bold">
            <span>Total</span>
            <span className="font-mono text-accent">{format(Number(order.total))}</span>
          </div>
        </div>
      </div>

      {addr && (
        <div className="bg-card border border-border rounded-2xl p-5 sm:p-6">
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
          {order.contact_email && <p className="text-xs text-muted-foreground font-mono mt-3">{order.contact_email}</p>}
        </div>
      )}
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
