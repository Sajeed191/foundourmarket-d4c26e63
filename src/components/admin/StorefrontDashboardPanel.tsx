import { useEffect, useMemo, useState } from "react";
import { Link } from "@tanstack/react-router";
import { motion, AnimatePresence } from "framer-motion";
import { createPortal } from "react-dom";
import {
  X,
  TrendingUp,
  ShoppingBag,
  Clock,
  AlertTriangle,
  Package,
  ArrowUpRight,
  Loader2,
  Activity,
} from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useProducts } from "@/lib/use-products";
import { resolveImage } from "@/lib/products";

type Order = {
  id: string;
  status: string;
  payment_status: string;
  total: number;
  currency: string;
  contact_email: string | null;
  created_at: string;
};

const STATUS_LABEL: Record<string, string> = {
  pending: "Pending",
  processing: "Processing",
  shipped: "Shipped",
  delivered: "Delivered",
  cancelled: "Cancelled",
  paid: "Paid",
  fulfilled: "Fulfilled",
};

/**
 * Unified storefront dashboard. A slide-in command panel that surfaces live
 * revenue, today's orders, and product/stock health directly on top of the
 * live site — admins never have to leave the storefront to triage. Reads are
 * RLS-protected (only staff can select all orders); this is a read surface
 * plus deep links into the full admin console.
 */
export function StorefrontDashboardPanel({
  open,
  onClose,
}: {
  open: boolean;
  onClose: () => void;
}) {
  const { products } = useProducts();
  const [orders, setOrders] = useState<Order[] | null>(null);

  useEffect(() => {
    if (!open) return;
    let active = true;
    const load = async () => {
      const { data } = await supabase
        .from("orders")
        .select("id,status,payment_status,total,currency,contact_email,created_at")
        .order("created_at", { ascending: false })
        .limit(200);
      if (active) setOrders((data as Order[]) ?? []);
    };
    load();
    const ch = supabase
      .channel("storefront-dashboard")
      .on("postgres_changes", { event: "*", schema: "public", table: "orders" }, load)
      .subscribe();
    return () => {
      active = false;
      supabase.removeChannel(ch);
    };
  }, [open]);

  const stats = useMemo(() => {
    const list = orders ?? [];
    const startToday = new Date();
    startToday.setHours(0, 0, 0, 0);

    const isPaid = (o: Order) =>
      o.payment_status === "paid" || o.status === "paid" || o.status === "fulfilled";

    const today = list.filter((o) => new Date(o.created_at) >= startToday);
    const revenueToday = today.filter(isPaid).reduce((s, o) => s + (Number(o.total) || 0), 0);
    const pending = list.filter((o) => o.status === "pending" || o.status === "processing").length;

    const outOfStock = products.filter((p) => !p.inStock);
    const lowStock = products.filter(
      (p) => p.inStock && p.stockQuantity > 0 && p.stockQuantity <= p.lowStockThreshold,
    );

    const recent = list.slice(0, 6);

    return {
      revenueToday,
      ordersToday: today.length,
      pending,
      outOfStock,
      lowStock,
      recent,
      productCount: products.length,
    };
  }, [orders, products]);

  if (typeof document === "undefined") return null;

  const metrics = [
    {
      icon: TrendingUp,
      label: "Revenue today",
      value: `₹${stats.revenueToday.toLocaleString("en-IN", { maximumFractionDigits: 0 })}`,
    },
    { icon: ShoppingBag, label: "Orders today", value: String(stats.ordersToday) },
    { icon: Clock, label: "Pending", value: String(stats.pending) },
    { icon: Package, label: "Products", value: String(stats.productCount) },
  ];

  return createPortal(
    <AnimatePresence>
      {open && (
        <div className="fixed inset-0 z-[110] print:hidden">
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="absolute inset-0 bg-background/60 backdrop-blur-sm"
            onClick={onClose}
          />
          <motion.aside
            initial={{ x: "100%" }}
            animate={{ x: 0 }}
            exit={{ x: "100%" }}
            transition={{ type: "spring", stiffness: 260, damping: 30 }}
            className="absolute right-0 top-0 flex h-full w-full max-w-md flex-col border-l border-accent/20 bg-background/95 backdrop-blur-2xl shadow-[-30px_0_80px_-30px_oklch(0.74_0.19_49/0.4)]"
          >
            {/* Header */}
            <div className="flex items-center gap-3 border-b border-border/60 px-4 py-3.5">
              <span className="grid size-8 place-items-center rounded-xl bg-gradient-to-br from-accent to-primary text-accent-foreground">
                <Activity className="size-4" />
              </span>
              <div className="flex-1">
                <p className="text-[9px] font-mono uppercase tracking-[0.25em] text-accent">
                  Live storefront
                </p>
                <p className="text-sm font-medium">Operator dashboard</p>
              </div>
              <button
                onClick={onClose}
                aria-label="Close dashboard"
                className="grid size-8 place-items-center rounded-full text-muted-foreground hover:bg-white/5 hover:text-foreground"
              >
                <X className="size-4" />
              </button>
            </div>

            <div className="flex-1 space-y-4 overflow-y-auto px-4 py-4">
              {/* Metrics */}
              <div className="grid grid-cols-2 gap-2.5">
                {metrics.map((m) => (
                  <div
                    key={m.label}
                    className="relative overflow-hidden rounded-2xl border border-border bg-card/70 p-3"
                  >
                    <div
                      className="pointer-events-none absolute -right-4 -top-6 size-16 rounded-full opacity-25"
                      style={{ background: "var(--gradient-ember-soft)", filter: "blur(16px)" }}
                    />
                    <m.icon className="size-4 text-accent" />
                    <p className="mt-1.5 text-xl font-display tabular-nums leading-none">{m.value}</p>
                    <p className="mt-1.5 text-[9px] font-mono uppercase tracking-[0.18em] text-muted-foreground">
                      {m.label}
                    </p>
                  </div>
                ))}
              </div>

              {/* Stock health */}
              {(stats.outOfStock.length > 0 || stats.lowStock.length > 0) && (
                <div className="rounded-2xl border border-destructive/30 bg-destructive/5 p-3">
                  <p className="mb-2 inline-flex items-center gap-1.5 text-[10px] font-mono uppercase tracking-widest text-destructive">
                    <AlertTriangle className="size-3" /> Stock alerts
                  </p>
                  <div className="flex flex-wrap gap-1.5">
                    {stats.outOfStock.slice(0, 6).map((p) => (
                      <Link
                        key={p.slug}
                        to="/products/$slug"
                        params={{ slug: p.slug }}
                        onClick={onClose}
                        className="rounded-lg border border-destructive/30 bg-card px-2 py-1 text-[11px] text-foreground hover:border-destructive/60"
                      >
                        {p.name} · OOS
                      </Link>
                    ))}
                    {stats.lowStock.slice(0, 6).map((p) => (
                      <Link
                        key={p.slug}
                        to="/products/$slug"
                        params={{ slug: p.slug }}
                        onClick={onClose}
                        className="rounded-lg border border-amber-500/30 bg-card px-2 py-1 text-[11px] text-foreground hover:border-amber-500/60"
                      >
                        {p.name} · {p.stockQuantity} left
                      </Link>
                    ))}
                  </div>
                </div>
              )}

              {/* Recent orders */}
              <div className="rounded-2xl border border-border bg-card/50 p-3">
                <div className="mb-2 flex items-center justify-between">
                  <p className="text-[10px] font-mono uppercase tracking-widest text-muted-foreground">
                    Recent orders
                  </p>
                  <Link
                    to="/admin-shipments"
                    onClick={onClose}
                    className="inline-flex items-center gap-1 text-[10px] font-mono uppercase tracking-widest text-accent hover:underline"
                  >
                    All <ArrowUpRight className="size-3" />
                  </Link>
                </div>
                {orders === null ? (
                  <div className="flex items-center justify-center py-6">
                    <Loader2 className="size-4 animate-spin text-accent" />
                  </div>
                ) : stats.recent.length === 0 ? (
                  <p className="py-4 text-center text-xs text-muted-foreground">No orders yet.</p>
                ) : (
                  <ul className="divide-y divide-border/60">
                    {stats.recent.map((o) => (
                      <li key={o.id} className="flex items-center gap-3 py-2">
                        <Clock className="size-3.5 shrink-0 text-muted-foreground" />
                        <div className="min-w-0 flex-1">
                          <p className="truncate text-xs">{o.contact_email ?? "Guest"}</p>
                          <p className="text-[9px] font-mono uppercase tracking-widest text-muted-foreground">
                            {new Date(o.created_at).toLocaleString(undefined, {
                              month: "short",
                              day: "numeric",
                              hour: "2-digit",
                              minute: "2-digit",
                            })}
                            {" · "}
                            {STATUS_LABEL[o.status] ?? o.status}
                          </p>
                        </div>
                        <p className="font-mono text-xs text-accent">
                          {o.currency === "INR" ? "₹" : "$"}
                          {Number(o.total).toFixed(2)}
                        </p>
                      </li>
                    ))}
                  </ul>
                )}
              </div>

              {/* Deep links */}
              <div className="grid grid-cols-2 gap-2">
                {[
                  { label: "Full dashboard", to: "/admin" },
                  { label: "Products", to: "/admin-products" },
                  { label: "Analytics", to: "/admin-analytics" },
                  { label: "Inventory", to: "/admin-inventory" },
                ].map((l) => (
                  <Link
                    key={l.to}
                    to={l.to}
                    onClick={onClose}
                    className="rounded-xl border border-border bg-card/60 px-3 py-2.5 text-center text-xs text-muted-foreground transition-colors hover:border-accent/40 hover:text-foreground"
                  >
                    {l.label}
                  </Link>
                ))}
              </div>
            </div>
          </motion.aside>
        </div>
      )}
    </AnimatePresence>,
    document.body,
  );
}
