import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { motion } from "framer-motion";
import { Loader2, Package, Search, ArrowRight, Calendar } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/lib/auth";
import { useRegion } from "@/lib/region";

export const Route = createFileRoute("/account_/orders")({
  head: () => ({ meta: [{ title: "Orders — FoundOurMarket™" }] }),
  component: OrdersPage,
});

type Order = {
  id: string;
  status: string;
  total: number;
  currency: string;
  created_at: string;
  tracking_number: string | null;
  order_items: { name: string; quantity: number; image: string | null }[];
};

const FILTERS = ["all", "active", "delivered", "cancelled"] as const;
type Filter = (typeof FILTERS)[number];

const STATUS_STEPS: Record<string, number> = {
  pending: 20, processing: 40, shipped: 65, in_transit: 80, delivered: 100, cancelled: 0, refunded: 0,
};

function OrdersPage() {
  const { user, loading } = useAuth();
  const { format } = useRegion();
  const nav = useNavigate();
  const [orders, setOrders] = useState<Order[] | null>(null);
  const [q, setQ] = useState("");
  const [filter, setFilter] = useState<Filter>("all");

  useEffect(() => {
    if (!loading && !user) nav({ to: "/auth" });
  }, [loading, user, nav]);

  useEffect(() => {
    if (!user) return;
    let cancelled = false;
    supabase
      .from("orders")
      .select("id,status,total,currency,created_at,tracking_number,order_items(name,quantity,image)")
      .order("created_at", { ascending: false })
      .then(({ data }) => { if (!cancelled) setOrders((data as Order[]) ?? []); });
    return () => { cancelled = true; };
  }, [user]);

  const filtered = useMemo(() => {
    const list = orders ?? [];
    return list.filter((o) => {
      const s = String(o.status).toLowerCase();
      if (filter === "active" && ["delivered", "cancelled", "refunded"].includes(s)) return false;
      if (filter === "delivered" && s !== "delivered") return false;
      if (filter === "cancelled" && !["cancelled", "refunded"].includes(s)) return false;
      if (q) {
        const needle = q.toLowerCase();
        if (!o.id.toLowerCase().includes(needle) &&
            !o.order_items.some((i) => i.name.toLowerCase().includes(needle))) return false;
      }
      return true;
    });
  }, [orders, q, filter]);

  if (loading || !user) {
    return <div className="min-h-[60vh] grid place-items-center"><Loader2 className="size-5 animate-spin text-muted-foreground" /></div>;
  }

  return (
    <div className="container-page py-10 sm:py-14 max-w-5xl">
      <motion.div initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.4 }}>
        <p className="text-[10px] font-mono uppercase tracking-[0.3em] text-accent mb-3">Account</p>
        <div className="flex items-end justify-between flex-wrap gap-4 mb-6">
          <div>
            <h1 className="text-fluid-2xl font-display font-semibold">Your orders</h1>
            <p className="text-sm text-muted-foreground mt-2">Track, reorder and manage every purchase.</p>
          </div>
          <Link to="/account" className="text-xs uppercase tracking-widest text-muted-foreground hover:text-accent">← Back to account</Link>
        </div>
      </motion.div>

      <div className="flex flex-col sm:flex-row gap-3 mb-6">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 size-4 text-muted-foreground" />
          <input
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Search by order # or product"
            className="w-full pl-10 pr-4 py-3 rounded-full bg-card border border-border text-sm focus:border-accent outline-none"
          />
        </div>
        <div className="flex gap-1.5 overflow-x-auto -mx-1 px-1">
          {FILTERS.map((f) => (
            <button
              key={f}
              onClick={() => setFilter(f)}
              className={`px-4 py-2 rounded-full text-[11px] uppercase tracking-widest font-mono transition-all whitespace-nowrap ${
                filter === f ? "bg-accent text-accent-foreground" : "bg-card border border-border text-muted-foreground hover:text-foreground"
              }`}
            >
              {f}
            </button>
          ))}
        </div>
      </div>

      {orders === null ? (
        <div className="space-y-3">
          {[1, 2, 3].map((i) => <div key={i} className="h-28 rounded-2xl bg-card border border-border animate-pulse" />)}
        </div>
      ) : filtered.length === 0 ? (
        <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="bg-card border border-border rounded-2xl p-12 sm:p-16 text-center">
          <div className="size-14 mx-auto mb-5 grid place-items-center rounded-full border border-border">
            <Package className="size-5 text-muted-foreground" />
          </div>
          <p className="text-base font-medium">{q || filter !== "all" ? "No matching orders" : "No orders yet"}</p>
          <p className="text-sm text-muted-foreground mt-1">{q || filter !== "all" ? "Try a different filter." : "Start shopping to see them here."}</p>
          {!q && filter === "all" && (
            <Link to="/" className="mt-5 inline-flex items-center gap-1.5 bg-accent text-accent-foreground px-5 py-2.5 rounded-full text-xs uppercase tracking-widest font-bold">
              Shop now <ArrowRight className="size-3" />
            </Link>
          )}
        </motion.div>
      ) : (
        <ul className="space-y-3">
          {filtered.map((o, i) => {
            const step = STATUS_STEPS[String(o.status).toLowerCase()] ?? 50;
            return (
              <motion.li key={o.id} initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: i * 0.03, duration: 0.3 }}>
                <Link to="/orders/$id" params={{ id: o.id }} className="block card-premium rounded-2xl p-4 sm:p-5 group hover:border-accent/40 transition-colors">
                  <div className="flex items-center justify-between gap-3 mb-3">
                    <div className="flex items-center gap-3 min-w-0">
                      <div className="flex -space-x-2 shrink-0">
                        {o.order_items.slice(0, 3).map((it, idx) =>
                          it.image ? (
                            <img key={idx} src={it.image} alt="" className="size-10 rounded-full border-2 border-background object-cover" />
                          ) : (
                            <div key={idx} className="size-10 rounded-full border-2 border-background bg-muted grid place-items-center text-[9px]">{idx + 1}</div>
                          )
                        )}
                      </div>
                      <div className="min-w-0">
                        <p className="text-sm font-medium truncate">#{o.id.slice(0, 8)}</p>
                        <p className="text-[11px] text-muted-foreground">{new Date(o.created_at).toLocaleDateString()} · {o.order_items.length} item{o.order_items.length !== 1 ? "s" : ""}</p>
                      </div>
                    </div>
                    <div className="text-right shrink-0">
                      <p className="font-mono text-sm">{format(Number(o.total))}</p>
                      <p className="text-[10px] uppercase tracking-widest text-accent">{o.status}</p>
                    </div>
                  </div>
                  <div className="h-1 bg-border rounded-full overflow-hidden">
                    <div className="h-full bg-accent transition-all" style={{ width: `${step}%` }} />
                  </div>
                  {o.tracking_number && (
                    <p className="text-[10px] font-mono text-muted-foreground mt-2">Tracking · {o.tracking_number}</p>
                  )}
                </Link>
              </motion.li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
