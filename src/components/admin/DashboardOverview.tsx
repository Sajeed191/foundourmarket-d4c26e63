import { useMemo, useState } from "react";
import { Link } from "@tanstack/react-router";
import { motion } from "framer-motion";
import { TrendingUp, ShoppingBag, Users, Package, AlertTriangle, ArrowUpRight, ArrowDownRight, Clock } from "lucide-react";
import { resolveImage } from "@/lib/products";
import { StarRating } from "@/components/site/StarRating";
import { CollapsibleModule } from "@/components/admin/CollapsibleModule";
import { DraftActivityWidget } from "@/components/admin/DraftActivityWidget";
import { GlobalExpansionWidget } from "@/components/admin/GlobalExpansionWidget";

type Order = {
  id: string; user_id: string; status: string; total: number; currency: string;
  contact_email: string | null; created_at: string;
  order_items: { name: string; quantity: number; product_slug?: string; unit_price?: number; line_total?: number }[];
};

type ProductRow = {
  id: string; slug: string; name: string; category: string;
  price: number | string; rating: number | string; reviews: number;
  image: string | null; in_stock: boolean;
  stock_quantity?: number; low_stock_threshold?: number;
};

type Props = {
  orders: Order[] | null;
  products: ProductRow[] | null;
  customersCount: number;
};

type Period = 7 | 14 | 30;

function startOfDay(d: Date) { const x = new Date(d); x.setHours(0,0,0,0); return x; }
const STATUS_LABEL: Record<string, string> = {
  pending: "Pending", processing: "Processing", shipped: "Shipped",
  delivered: "Delivered", cancelled: "Cancelled",
};

// Smooth Catmull-Rom → cubic bezier path for cinematic curved lines
function smoothPath(pts: readonly (readonly [number, number])[]) {
  if (pts.length < 2) return "";
  let d = `M${pts[0][0].toFixed(1)},${pts[0][1].toFixed(1)}`;
  for (let i = 0; i < pts.length - 1; i++) {
    const p0 = pts[i - 1] ?? pts[i];
    const p1 = pts[i];
    const p2 = pts[i + 1];
    const p3 = pts[i + 2] ?? p2;
    const cp1x = p1[0] + (p2[0] - p0[0]) / 6;
    const cp1y = p1[1] + (p2[1] - p0[1]) / 6;
    const cp2x = p2[0] - (p3[0] - p1[0]) / 6;
    const cp2y = p2[1] - (p3[1] - p1[1]) / 6;
    d += ` C${cp1x.toFixed(1)},${cp1y.toFixed(1)} ${cp2x.toFixed(1)},${cp2y.toFixed(1)} ${p2[0].toFixed(1)},${p2[1].toFixed(1)}`;
  }
  return d;
}

export function DashboardOverview({ orders, products, customersCount }: Props) {
  const [period, setPeriod] = useState<Period>(14);
  const [hover, setHover] = useState<number | null>(null);

  const stats = useMemo(() => {
    const list = orders ?? [];
    const today = startOfDay(new Date());

    const buckets: { date: Date; revenue: number; orders: number }[] = [];
    for (let i = period - 1; i >= 0; i--) {
      const d = new Date(today); d.setDate(d.getDate() - i);
      buckets.push({ date: d, revenue: 0, orders: 0 });
    }
    const idxOf = (d: string) => {
      const ds = startOfDay(new Date(d)).getTime();
      return buckets.findIndex((b) => b.date.getTime() === ds);
    };

    let revenue = 0;
    const statusCounts: Record<string, number> = {};
    const productSales = new Map<string, { name: string; image?: string | null; units: number; revenue: number; slug?: string }>();

    for (const o of list) {
      const total = Number(o.total) || 0;
      revenue += total;
      statusCounts[o.status] = (statusCounts[o.status] ?? 0) + 1;
      const idx = idxOf(o.created_at);
      if (idx >= 0) { buckets[idx].revenue += total; buckets[idx].orders += 1; }
      for (const it of o.order_items ?? []) {
        const key = it.product_slug ?? it.name;
        const prev = productSales.get(key) ?? { name: it.name, units: 0, revenue: 0, slug: it.product_slug };
        prev.units += it.quantity;
        prev.revenue += Number(it.line_total ?? (it.unit_price ?? 0) * it.quantity) || 0;
        productSales.set(key, prev);
      }
    }

    const productMap = new Map((products ?? []).map((p) => [p.slug, p]));
    for (const [k, v] of productSales) {
      const match = v.slug ? productMap.get(v.slug) : undefined;
      if (match) v.image = match.image;
      productSales.set(k, v);
    }

    const topProducts = [...productSales.values()].sort((a, b) => b.revenue - a.revenue).slice(0, 5);

    const half = Math.floor(period / 2);
    const last = buckets.slice(-half).reduce((s, b) => s + b.revenue, 0);
    const prev = buckets.slice(0, half).reduce((s, b) => s + b.revenue, 0);
    const delta = prev === 0 ? (last > 0 ? 100 : 0) : ((last - prev) / prev) * 100;

    const ordersCount = list.length;
    const aov = ordersCount > 0 ? revenue / ordersCount : 0;
    const pendingCount = (statusCounts["pending"] ?? 0) + (statusCounts["processing"] ?? 0);

    const outOfStock = (products ?? []).filter((p) => !p.in_stock);
    const lowStock = (products ?? []).filter((p) => {
      const qty = p.stock_quantity ?? 0;
      const threshold = p.low_stock_threshold ?? 5;
      return p.in_stock && qty > 0 && qty <= threshold;
    });

    const topRated = [...(products ?? [])]
      .filter((p) => p.reviews > 0)
      .sort((a, b) => Number(b.rating) - Number(a.rating))
      .slice(0, 4);

    const recentOrders = [...list]
      .sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime())
      .slice(0, 6);

    return { buckets, revenue, ordersCount, aov, statusCounts, topProducts, delta, last, prev, pendingCount, outOfStock, lowStock, topRated, recentOrders, half };
  }, [orders, products, period]);

  const max = Math.max(1, ...stats.buckets.map((b) => b.revenue));
  const w = 600, h = 130, pad = 8;
  const stepX = (w - pad * 2) / Math.max(1, stats.buckets.length - 1);
  const points = stats.buckets.map((b, i) => {
    const x = pad + i * stepX;
    const y = h - pad - (b.revenue / max) * (h - pad * 2);
    return [x, y] as const;
  });
  const linePath = smoothPath(points);
  const areaPath = `${linePath} L${(pad + (stats.buckets.length - 1) * stepX).toFixed(1)},${h - pad} L${pad},${h - pad} Z`;
  const end = points[points.length - 1];

  const metrics = [
    { icon: <TrendingUp className="size-4" />, label: "Revenue", value: `$${stats.revenue.toFixed(2)}`, sub: <TrendBadge delta={stats.delta} period={stats.half} /> },
    { icon: <ShoppingBag className="size-4" />, label: "Orders", value: stats.ordersCount, sub: <span className="text-[10px] font-mono uppercase tracking-widest text-muted-foreground">AOV ${stats.aov.toFixed(2)}</span> },
    { icon: <Users className="size-4" />, label: "Customers", value: customersCount, sub: null },
    {
      icon: <Package className="size-4" />, label: "Products", value: products?.length ?? 0,
      sub: stats.outOfStock.length > 0 || stats.lowStock.length > 0 ? (
        <span className="text-[10px] font-mono uppercase tracking-widest text-accent inline-flex items-center gap-1">
          <AlertTriangle className="size-3" />
          {stats.outOfStock.length > 0 && `${stats.outOfStock.length} OOS`}
          {stats.outOfStock.length > 0 && stats.lowStock.length > 0 && " · "}
          {stats.lowStock.length > 0 && `${stats.lowStock.length} low`}
        </span>
      ) : <span className="text-[10px] font-mono uppercase tracking-widest text-muted-foreground">All in stock</span>,
    },
  ];

  const secondary = metrics.slice(1);

  return (
    <div className="space-y-5">
      {/* Asymmetric bento: featured analytics panel + compact metric tiles */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        {/* Featured cinematic revenue analytics panel */}
        <motion.div
          initial={{ opacity: 0, y: 16, filter: "blur(6px)" }}
          animate={{ opacity: 1, y: 0, filter: "blur(0px)" }}
          transition={{ type: "spring", stiffness: 220, damping: 26 }}
          className="col-span-2 lg:col-span-2 lg:row-span-2 relative overflow-hidden card-premium rounded-2xl p-4 sm:p-5"
        >
          <div className="pointer-events-none absolute -top-20 left-1/4 size-72 rounded-full opacity-40" style={{ background: "var(--gradient-ember)", filter: "blur(44px)" }} />

          <div className="relative flex items-start justify-between mb-3">
            <div>
              <p className="text-[9px] font-mono uppercase tracking-[0.3em] text-accent inline-flex items-center gap-1.5">
                <span className="size-1.5 rounded-full bg-accent shadow-[0_0_8px_var(--accent)] animate-pulse" /> Live revenue · {period}d
              </p>
              <p className="text-3xl sm:text-4xl font-display font-semibold tabular-nums tracking-tight mt-1">${stats.revenue.toFixed(2)}</p>
              <div className="mt-1"><TrendBadge delta={stats.delta} period={stats.half} /></div>
            </div>
            <div className="inline-flex rounded-full border border-border bg-background/60 p-0.5">
              {([7, 14, 30] as const).map((p) => (
                <button key={p} onClick={() => setPeriod(p)}
                  className={`px-2.5 py-1 text-[10px] font-mono uppercase tracking-widest rounded-full transition-colors ${period === p ? "bg-accent text-accent-foreground" : "text-muted-foreground hover:text-foreground"}`}>
                  {p}d
                </button>
              ))}
            </div>
          </div>

          <div className="relative">
            <svg viewBox={`0 0 ${w} ${h}`} className="w-full h-40 sm:h-48" preserveAspectRatio="none"
              onMouseLeave={() => setHover(null)}
              onMouseMove={(e) => {
                const rect = (e.currentTarget as SVGSVGElement).getBoundingClientRect();
                const rel = ((e.clientX - rect.left) / rect.width) * w;
                const idx = Math.round((rel - pad) / stepX);
                setHover(Math.max(0, Math.min(points.length - 1, idx)));
              }}
            >
              <defs>
                <linearGradient id="spark" x1="0" x2="0" y1="0" y2="1">
                  <stop offset="0%" stopColor="currentColor" stopOpacity="0.42" />
                  <stop offset="55%" stopColor="currentColor" stopOpacity="0.12" />
                  <stop offset="100%" stopColor="currentColor" stopOpacity="0" />
                </linearGradient>
                <linearGradient id="sparkline" x1="0" x2="1" y1="0" y2="0">
                  <stop offset="0%" stopColor="oklch(0.78 0.17 60)" />
                  <stop offset="100%" stopColor="oklch(0.72 0.2 45)" />
                </linearGradient>
              </defs>
              <g className="text-accent">
                <motion.path d={areaPath} fill="url(#spark)"
                  initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ duration: 0.6 }} />
                <motion.path d={linePath} fill="none" stroke="url(#sparkline)" strokeWidth="2.5" strokeLinejoin="round" strokeLinecap="round"
                  style={{ filter: "drop-shadow(0 3px 12px oklch(0.74 0.19 49 / 0.6))" }}
                  initial={{ pathLength: 0 }} animate={{ pathLength: 1 }} transition={{ duration: 0.9, ease: "easeOut" }} />
                {hover !== null && (
                  <line x1={points[hover][0]} y1={pad} x2={points[hover][0]} y2={h - pad} stroke="currentColor" strokeWidth="0.5" strokeOpacity="0.35" />
                )}
                {hover !== null && <circle cx={points[hover][0]} cy={points[hover][1]} r={4.5} fill="currentColor" style={{ filter: "drop-shadow(0 0 6px oklch(0.74 0.19 49 / 0.9))" }} />}
                {end && <circle className="animate-data-pulse" cx={end[0]} cy={end[1]} r={3} fill="currentColor" />}
                {end && <circle cx={end[0]} cy={end[1]} r={3} fill="currentColor" />}
              </g>
            </svg>

            {hover !== null && (
              <div className="pointer-events-none absolute -top-1 z-10 glass-strong rounded-xl px-3 py-1.5 text-center"
                style={{ left: `${(points[hover][0] / w) * 100}%`, transform: "translateX(-50%)" }}>
                <p className="font-mono text-accent text-xs">${stats.buckets[hover].revenue.toFixed(2)}</p>
                <p className="text-[9px] font-mono uppercase tracking-widest text-muted-foreground">
                  {stats.buckets[hover].date.toLocaleDateString(undefined, { month: "short", day: "numeric" })}
                </p>
              </div>
            )}
          </div>
          <div className="flex justify-between mt-1.5 text-[9px] font-mono uppercase tracking-widest text-muted-foreground">
            <span>{stats.buckets[0].date.toLocaleDateString(undefined, { month: "short", day: "numeric" })}</span>
            <span className="text-accent">${stats.last.toFixed(0)} · past {stats.half}d</span>
            <span>{stats.buckets[stats.buckets.length - 1].date.toLocaleDateString(undefined, { month: "short", day: "numeric" })}</span>
          </div>
        </motion.div>

        {/* Compact metric tiles */}
        {secondary.map((m, i) => (
          <motion.div
            key={m.label}
            initial={{ opacity: 0, y: 12, filter: "blur(4px)" }}
            animate={{ opacity: 1, y: 0, filter: "blur(0px)" }}
            transition={{ delay: 0.1 + i * 0.06, type: "spring", stiffness: 260, damping: 26 }}
            whileHover={{ y: -3, scale: 1.02 }}
            whileTap={{ scale: 0.97 }}
            className="col-span-1"
          >
            <Stat {...m} />
          </motion.div>
        ))}
      </div>


      {/* Collapsible modules */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <CollapsibleModule eyebrow="Pipeline" title="Order status"
          badge={stats.pendingCount > 0 ? <span className="text-[9px] font-mono uppercase tracking-widest text-accent px-2 py-0.5 rounded-full bg-accent/10 border border-accent/20">{stats.pendingCount} live</span> : undefined}>
          <ul className="space-y-2.5">
            {(["pending", "processing", "shipped", "delivered", "cancelled"] as const).map((s) => {
              const count = stats.statusCounts[s] ?? 0;
              const pct = stats.ordersCount > 0 ? (count / stats.ordersCount) * 100 : 0;
              return (
                <li key={s}>
                  <div className="flex justify-between text-[11px] font-mono uppercase tracking-widest mb-1">
                    <span className="text-muted-foreground">{s}</span>
                    <span className="text-foreground">{count}</span>
                  </div>
                  <div className="h-1 rounded-full bg-background overflow-hidden">
                    <motion.div className="h-full bg-accent" initial={{ width: 0 }} animate={{ width: `${pct}%` }} transition={{ type: "spring", stiffness: 120, damping: 22 }} />
                  </div>
                </li>
              );
            })}
          </ul>
        </CollapsibleModule>

        <CollapsibleModule eyebrow="Bestsellers" title="Top products">
          {stats.topProducts.length === 0 ? (
            <p className="text-sm text-muted-foreground">No sales yet.</p>
          ) : (
            <ul className="space-y-2.5">
              {stats.topProducts.map((p, i) => (
                <li key={i} className="flex items-center gap-3">
                  <span className="font-mono text-[10px] text-muted-foreground w-4">{i + 1}</span>
                  <div className="size-9 rounded-lg overflow-hidden bg-background border border-border shrink-0">
                    {p.image && <img loading="lazy" decoding="async" src={resolveImage(p.image)} alt="" className="w-full h-full object-cover" />}
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm truncate">{p.name}</p>
                    <p className="text-[10px] font-mono uppercase tracking-widest text-muted-foreground">{p.units} sold</p>
                  </div>
                  <p className="font-mono text-accent text-sm">${p.revenue.toFixed(2)}</p>
                </li>
              ))}
            </ul>
          )}
        </CollapsibleModule>

        <CollapsibleModule eyebrow="Recent activity" title="Latest orders">
          {stats.recentOrders.length === 0 ? (
            <p className="text-sm text-muted-foreground">No orders yet.</p>
          ) : (
            <ul className="divide-y divide-border/60">
              {stats.recentOrders.map((o) => (
                <li key={o.id} className="py-2.5 flex items-center gap-3">
                  <Clock className="size-3.5 text-muted-foreground shrink-0" />
                  <div className="flex-1 min-w-0">
                    <p className="text-sm truncate">{o.contact_email ?? "Guest"}</p>
                    <p className="text-[10px] font-mono uppercase tracking-widest text-muted-foreground">
                      {new Date(o.created_at).toLocaleString(undefined, { month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" })}
                      {" · "}{STATUS_LABEL[o.status] ?? o.status}
                    </p>
                  </div>
                  <p className="font-mono text-sm text-accent">${Number(o.total).toFixed(2)}</p>
                </li>
              ))}
            </ul>
          )}
        </CollapsibleModule>

        <CollapsibleModule eyebrow="Inventory alerts" title="Stock health"
          badge={(stats.outOfStock.length + stats.lowStock.length) > 0 ? <span className="text-[9px] font-mono uppercase tracking-widest text-destructive px-2 py-0.5 rounded-full bg-destructive/10 border border-destructive/20">{stats.outOfStock.length + stats.lowStock.length}</span> : undefined}>
          {stats.outOfStock.length === 0 && stats.lowStock.length === 0 ? (
            <p className="text-sm text-muted-foreground">All products are well-stocked.</p>
          ) : (
            <div className="space-y-3">
              {stats.outOfStock.length > 0 && (
                <div className="p-3 rounded-xl border border-destructive/30 bg-destructive/5">
                  <p className="text-[10px] font-mono uppercase tracking-widest text-destructive mb-2 inline-flex items-center gap-1">
                    <AlertTriangle className="size-3" /> Out of stock ({stats.outOfStock.length})
                  </p>
                  <div className="flex flex-wrap gap-1.5">
                    {stats.outOfStock.slice(0, 8).map((p) => (
                      <Link key={p.id} to="/products/$slug" params={{ slug: p.slug }} className="text-[10px] font-mono px-2 py-0.5 rounded-full bg-background border border-border hover:border-destructive transition-colors">
                        {p.name}
                      </Link>
                    ))}
                    {stats.outOfStock.length > 8 && <span className="text-[10px] font-mono text-muted-foreground">+{stats.outOfStock.length - 8} more</span>}
                  </div>
                </div>
              )}
              {stats.lowStock.length > 0 && (
                <div className="p-3 rounded-xl border border-accent/30 bg-accent/5">
                  <p className="text-[10px] font-mono uppercase tracking-widest text-accent mb-2 inline-flex items-center gap-1">
                    <AlertTriangle className="size-3" /> Low stock ({stats.lowStock.length})
                  </p>
                  <ul className="space-y-1.5">
                    {stats.lowStock.slice(0, 6).map((p) => (
                      <li key={p.id} className="flex items-center justify-between text-xs">
                        <Link to="/products/$slug" params={{ slug: p.slug }} className="truncate hover:text-accent transition-colors">{p.name}</Link>
                        <span className="font-mono text-accent shrink-0 ml-2">{p.stock_quantity} left</span>
                      </li>
                    ))}
                    {stats.lowStock.length > 6 && <p className="text-[10px] font-mono text-muted-foreground">+{stats.lowStock.length - 6} more</p>}
                  </ul>
                </div>
              )}
            </div>
          )}
        </CollapsibleModule>

        <CollapsibleModule eyebrow="Catalog health" title="Highest rated" defaultOpen={false}>
          {stats.topRated.length === 0 ? (
            <p className="text-sm text-muted-foreground">No reviews yet.</p>
          ) : (
            <ul className="space-y-2">
              {stats.topRated.map((p) => (
                <li key={p.id} className="flex items-center gap-3">
                  <div className="size-9 rounded-lg overflow-hidden bg-background border border-border shrink-0">
                    {p.image && <img loading="lazy" decoding="async" src={resolveImage(p.image)} alt="" className="w-full h-full object-cover" />}
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm truncate">{p.name}</p>
                    <p className="text-[10px] font-mono uppercase tracking-widest text-muted-foreground">{p.reviews} reviews</p>
                  </div>
                  <StarRating
                    rating={Number(p.rating)}
                    showValue
                    starClassName="size-3"
                    textClassName="font-mono text-sm"
                  />
                </li>
              ))}
            </ul>
          )}
        </CollapsibleModule>
      </div>

      <GlobalExpansionWidget />

      <DraftActivityWidget />
    </div>
  );
}

function Stat({ icon, label, value, sub }: { icon: React.ReactNode; label: string; value: React.ReactNode; sub?: React.ReactNode }) {
  return (
    <div className="card-premium relative overflow-hidden rounded-2xl p-4 h-full group">
      <div className="relative flex items-center gap-2 mb-2.5">
        <span className="grid place-items-center size-7 rounded-lg bg-accent/10 border border-accent/20 text-accent">{icon}</span>
        <span className="text-[10px] font-mono uppercase tracking-[0.25em] text-muted-foreground truncate">{label}</span>
      </div>
      <p className="relative text-2xl font-display font-semibold tabular-nums tracking-tight">{value}</p>
      {sub && <div className="relative mt-1.5">{sub}</div>}
    </div>
  );
}

function TrendBadge({ delta, period }: { delta: number; period: number }) {
  const up = delta >= 0;
  const Icon = up ? ArrowUpRight : ArrowDownRight;
  return (
    <span className={`text-[10px] font-mono uppercase tracking-widest inline-flex items-center gap-1 ${up ? "text-accent" : "text-muted-foreground"}`}>
      <Icon className="size-3" /> {Math.abs(delta).toFixed(0)}% vs {period}d
    </span>
  );
}
