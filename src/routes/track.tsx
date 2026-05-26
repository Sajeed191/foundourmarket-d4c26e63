import { createFileRoute } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useMutation } from "@tanstack/react-query";
import { useState } from "react";
import { Package, Search, Loader2, CheckCircle2, Truck, Clock, XCircle } from "lucide-react";
import { trackOrder } from "@/lib/track-order.functions";
import { useRegion } from "@/lib/region";

export const Route = createFileRoute("/track")({
  head: () => ({
    meta: [
      { title: "Track Your Order — FoundOurMarket™" },
      { name: "description", content: "Look up the status of your order with your order ID and email." },
      { property: "og:title", content: "Track Your Order — FoundOurMarket™" },
      { property: "og:description", content: "Look up the status of your order with your order ID and email." },
    ],
  }),
  component: TrackPage,
});

const STATUSES = [
  { key: "pending", label: "Order placed", icon: Clock },
  { key: "paid", label: "Payment received", icon: CheckCircle2 },
  { key: "shipped", label: "Shipped", icon: Truck },
  { key: "delivered", label: "Delivered", icon: Package },
] as const;

function TrackPage() {
  const track = useServerFn(trackOrder);
  const { format } = useRegion();
  const [orderId, setOrderId] = useState("");
  const [email, setEmail] = useState("");

  const m = useMutation({
    mutationFn: (vars: { orderId: string; email: string }) =>
      track({ data: vars }),
  });

  const onSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    m.mutate({ orderId: orderId.trim(), email: email.trim() });
  };

  const result = m.data;
  const currentStatusIdx = result?.found
    ? STATUSES.findIndex((s) => s.key === result.order.status)
    : -1;
  const cancelled = result?.found && result.order.status === "cancelled";

  return (
    <div className="max-w-3xl mx-auto px-4 sm:px-6 py-12 sm:py-20">
      <div className="text-center mb-10">
        <p className="text-[10px] font-mono uppercase tracking-[0.3em] text-accent mb-3">Order Status</p>
        <h1 className="text-3xl sm:text-5xl font-display font-semibold tracking-tight mb-3">Track your order</h1>
        <p className="text-sm text-muted-foreground">Enter your order ID and the email used at checkout.</p>
      </div>

      <form onSubmit={onSubmit} className="bg-card border border-border rounded-2xl p-5 sm:p-6 space-y-4">
        <div>
          <label className="text-[10px] font-mono uppercase tracking-widest text-muted-foreground">Order ID</label>
          <input
            value={orderId}
            onChange={(e) => setOrderId(e.target.value)}
            required
            placeholder="e.g. 8f3c2a1b-..."
            className="mt-2 w-full bg-background border border-border rounded-full px-4 py-3 text-sm font-mono"
          />
        </div>
        <div>
          <label className="text-[10px] font-mono uppercase tracking-widest text-muted-foreground">Email</label>
          <input
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            type="email"
            required
            placeholder="you@example.com"
            className="mt-2 w-full bg-background border border-border rounded-full px-4 py-3 text-sm"
          />
        </div>
        <button
          type="submit"
          disabled={m.isPending}
          className="w-full bg-accent text-accent-foreground font-bold py-3 rounded-full text-xs uppercase tracking-widest hover:brightness-110 transition-all disabled:opacity-50 inline-flex items-center justify-center gap-2"
        >
          {m.isPending ? <Loader2 className="size-4 animate-spin" /> : <Search className="size-4" />}
          Track Order
        </button>
      </form>

      {m.isError && (
        <p className="mt-6 text-center text-sm text-destructive">Something went wrong. Please try again.</p>
      )}

      {result && !result.found && (
        <div className="mt-8 bg-card border border-border rounded-2xl p-8 text-center">
          <XCircle className="size-8 mx-auto text-muted-foreground mb-3" />
          <h3 className="font-display text-lg mb-1">No order found</h3>
          <p className="text-sm text-muted-foreground">Check that the order ID and email match exactly.</p>
        </div>
      )}

      {result?.found && (
        <div className="mt-8 space-y-6">
          <div className="bg-card border border-border rounded-2xl p-6">
            <div className="flex items-center justify-between flex-wrap gap-3 mb-6">
              <div>
                <p className="text-[10px] font-mono uppercase tracking-widest text-muted-foreground">Order</p>
                <p className="font-mono text-sm break-all">{result.order.id}</p>
              </div>
              <div className="text-right">
                <p className="text-[10px] font-mono uppercase tracking-widest text-muted-foreground">Placed</p>
                <p className="font-mono text-sm">{new Date(result.order.created_at).toLocaleDateString()}</p>
              </div>
            </div>

            {cancelled ? (
              <div className="flex items-center gap-3 p-4 bg-destructive/10 border border-destructive/30 rounded-xl">
                <XCircle className="size-5 text-destructive" />
                <span className="text-sm font-medium">This order was cancelled.</span>
              </div>
            ) : (
              <ol className="relative grid grid-cols-4 gap-2">
                {STATUSES.map((s, i) => {
                  const done = i <= currentStatusIdx;
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

          <div className="bg-card border border-border rounded-2xl p-6">
            <h3 className="text-[10px] font-mono uppercase tracking-widest text-accent mb-4">Items</h3>
            <ul className="space-y-3">
              {result.items.map((it, i) => (
                <li key={i} className="flex items-center gap-3">
                  {it.image && <img src={it.image} alt="" className="size-14 rounded-lg object-cover border border-border" />}
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium truncate">{it.name}</p>
                    <p className="text-xs text-muted-foreground font-mono">Qty {it.quantity}</p>
                  </div>
                  <p className="font-mono text-sm">{format(Number(it.line_total))}</p>
                </li>
              ))}
            </ul>
            <div className="mt-5 pt-5 border-t border-border space-y-1.5 text-sm">
              <Row label="Subtotal" value={format(Number(result.order.subtotal))} />
              {Number(result.order.discount) > 0 && <Row label="Discount" value={`− ${format(Number(result.order.discount))}`} />}
              <Row label="Shipping" value={format(Number(result.order.shipping))} />
              <Row label="Tax" value={format(Number(result.order.tax))} />
              <div className="flex justify-between pt-2 border-t border-border font-bold">
                <span>Total</span>
                <span className="font-mono text-accent">{format(Number(result.order.total))}</span>
              </div>
            </div>
          </div>
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
