import { createFileRoute, Link } from "@tanstack/react-router";
import {
  Loader2, AlertTriangle, Package, Truck, RotateCcw, Wallet, Globe,
  Clock, Zap, Gauge, TrendingUp, Users, ArrowDownRight, ArrowLeft,
} from "lucide-react";
import { AdminShell } from "@/components/admin/AdminShell";
import { KpiCard } from "@/components/admin/KpiCard";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { useOrderOperations } from "@/lib/use-order-operations";
import { OrderIntegrityMonitor } from "@/components/admin/OrderIntegrityMonitor";

export const Route = createFileRoute("/admin-orders-analytics")({
  head: () => ({ meta: [{ title: "Order Analytics — Admin" }] }),
  component: OrderAnalyticsPage,
});

type Role = "admin" | "super_admin" | "manager" | "support" | "fulfillment" | "warehouse_staff" | "editor";
const ALLOW: Role[] = ["admin", "super_admin", "manager", "support", "fulfillment", "warehouse_staff"];
const inr = (n: number) => "₹" + Math.round(n || 0).toLocaleString("en-IN");
const num = (n: number) => Math.round(n || 0).toLocaleString("en-IN");
const timeAgo = (s: string | null) => {
  if (!s) return "—";
  const d = Date.now() - +new Date(s);
  if (d < 6e4) return "just now";
  if (d < 36e5) return Math.floor(d / 6e4) + "m ago";
  if (d < 864e5) return Math.floor(d / 36e5) + "h ago";
  return Math.floor(d / 864e5) + "d ago";
};

function Card({ title, icon, children, className = "", actions }: { title?: string; icon?: React.ReactNode; children: React.ReactNode; className?: string; actions?: React.ReactNode }) {
  return (
    <div className={`card-premium rounded-2xl p-4 sm:p-5 w-full min-w-0 ${className}`}>
      {(title || actions) && (
        <div className="flex items-center justify-between gap-2 mb-4">
          {title && <h2 className="text-sm font-medium flex items-center gap-2 min-w-0"><span className="shrink-0">{icon}</span><span className="truncate">{title}</span></h2>}
          {actions}
        </div>
      )}
      {children}
    </div>
  );
}

function Avatar({ name, url, size = 32 }: { name: string | null; url: string | null; size?: number }) {
  if (url) return <img loading="lazy" decoding="async" src={url} alt={name ?? ""} className="rounded-full object-cover shrink-0" style={{ width: size, height: size }} />;
  const initials = (name || "?").split(" ").map((p) => p[0]).join("").slice(0, 2).toUpperCase();
  return (
    <div className="rounded-full grid place-items-center bg-accent/10 text-accent font-medium shrink-0" style={{ width: size, height: size, fontSize: size * 0.36 }}>
      {initials}
    </div>
  );
}

function Bar({ value, max, color = "bg-accent" }: { value: number; max: number; color?: string }) {
  const pct = max > 0 ? Math.min(100, (value / max) * 100) : 0;
  return <div className="h-1.5 rounded-full bg-muted/40 overflow-hidden"><div className={`h-full rounded-full ${color}`} style={{ width: `${pct}%` }} /></div>;
}

function OrderAnalyticsPage() {
  const { data, staffPerf, loading, error, refresh } = useOrderOperations();

  if (loading) {
    return <AdminShell title="Order Analytics" allow={ALLOW}>
      <div className="min-h-[50vh] grid place-items-center"><Loader2 className="size-5 animate-spin text-accent" /></div>
    </AdminShell>;
  }
  if (error || !data) {
    return <AdminShell title="Order Analytics" allow={ALLOW}>
      <div className="min-h-[40vh] grid place-items-center text-center"><div><AlertTriangle className="size-6 text-destructive mx-auto mb-2" /><p className="text-sm text-muted-foreground">{error ?? "No data"}</p><button onClick={refresh} className="mt-3 text-xs px-3 py-1.5 rounded-lg border border-border">Retry</button></div></div>
    </AdminShell>;
  }

  const k = data.kpis;
  const f = data.fulfillment;
  const ords = data.orders;
  const maxCourier = Math.max(1, ...data.courierPerformance.map((c) => c.shipments));
  const maxRegion = Math.max(1, ...data.regionPerformance.map((r) => r.orders));
  const maxReason = Math.max(1, ...data.returnReasons.map((r) => r.cnt));

  return (
    <AdminShell
      title="Order Analytics"
      subtitle="Deep operational reporting — fulfilment, delivery, returns & staff"
      allow={ALLOW}
      actions={
        <Link to="/admin-orders-ops" className="inline-flex items-center gap-1.5 text-xs px-3 py-1.5 rounded-lg border border-border hover:border-accent/40">
          <ArrowLeft className="size-3.5" /> Operations
        </Link>
      }
    >
      <div className="w-full min-w-0 overflow-x-hidden">
        <OrderIntegrityMonitor />

        <section className="mt-8">
          <Tabs defaultValue="fulfillment">
            <div className="overflow-x-auto -mx-1 px-1">
              <TabsList className="flex-wrap h-auto">
                <TabsTrigger value="fulfillment">Fulfilment</TabsTrigger>
                <TabsTrigger value="delivery">Delivery</TabsTrigger>
                <TabsTrigger value="returns">Returns &amp; Refunds</TabsTrigger>
                <TabsTrigger value="staff">Staff</TabsTrigger>
                <TabsTrigger value="performance">Performance</TabsTrigger>
              </TabsList>
            </div>

            {/* FULFILMENT */}
            <TabsContent value="fulfillment" className="space-y-5 mt-4">
              <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                <KpiCard label="Avg Processing" value={f.avgProcessingHours != null ? `${f.avgProcessingHours.toFixed(1)}h` : "—"} icon={<Clock className="size-4" />} />
                <KpiCard label="Avg Delivery" value={f.avgDeliveryDays != null ? `${f.avgDeliveryDays.toFixed(1)}d` : "—"} icon={<Truck className="size-4" />} />
                <KpiCard label="Delayed" value={num(f.delayedCount)} icon={<AlertTriangle className="size-4" />} />
                <KpiCard label="In Transit" value={num(ords.filter((o) => o.shipped_at && !o.delivered_at).length)} icon={<Zap className="size-4" />} />
              </div>
              <div className="grid md:grid-cols-2 gap-3">
                <Card title="Fastest deliveries" icon={<Zap className="size-4 text-emerald-400" />}>
                  <div className="space-y-1">{f.fastest.map((o) => <div key={o.id} className="flex items-center justify-between gap-2 text-xs py-1.5 border-b border-border/40 last:border-0"><span className="truncate">#{o.id.slice(0, 8)} · {o.full_name ?? "Guest"}</span><span className="text-emerald-400 tabular-nums shrink-0">{o.deliveryDays?.toFixed(1)}d</span></div>)}{f.fastest.length === 0 && <p className="text-xs text-muted-foreground">No delivered orders yet</p>}</div>
                </Card>
                <Card title="Slowest deliveries" icon={<Clock className="size-4 text-destructive" />}>
                  <div className="space-y-1">{f.slowest.map((o) => <div key={o.id} className="flex items-center justify-between gap-2 text-xs py-1.5 border-b border-border/40 last:border-0"><span className="truncate">#{o.id.slice(0, 8)} · {o.full_name ?? "Guest"}</span><span className="text-destructive tabular-nums shrink-0">{o.deliveryDays?.toFixed(1)}d</span></div>)}{f.slowest.length === 0 && <p className="text-xs text-muted-foreground">No delivered orders yet</p>}</div>
                </Card>
              </div>
            </TabsContent>

            {/* DELIVERY */}
            <TabsContent value="delivery" className="space-y-5 mt-4">
              <Card title="Courier performance" icon={<Truck className="size-4 text-accent" />}>
                <div className="space-y-3">
                  {data.courierPerformance.map((c) => (
                    <div key={c.courier}>
                      <div className="flex items-center justify-between gap-2 text-xs mb-1">
                        <span className="font-medium truncate">{c.courier}</span>
                        <span className="text-muted-foreground text-right text-[11px] shrink-0">{c.shipments} ship · {c.successRate}% ok · {c.returnRate}% ret · {c.avg_days != null ? `${c.avg_days.toFixed(1)}d` : "—"}</span>
                      </div>
                      <Bar value={c.shipments} max={maxCourier} color={c.quality >= 70 ? "bg-emerald-400" : c.quality >= 50 ? "bg-amber-400" : "bg-destructive"} />
                    </div>
                  ))}
                  {data.courierPerformance.length === 0 && <p className="text-xs text-muted-foreground">No shipment data yet</p>}
                </div>
              </Card>
              <Card title="Region performance" icon={<Globe className="size-4 text-accent" />}>
                <div className="space-y-3">
                  {data.regionPerformance.map((r) => (
                    <div key={r.region}>
                      <div className="flex items-center justify-between gap-2 text-xs mb-1">
                        <span className="font-medium truncate">{r.region}</span>
                        <span className="text-muted-foreground text-right text-[11px] shrink-0">{r.orders} orders · {inr(r.revenue)} · {r.returnRate}% ret</span>
                      </div>
                      <Bar value={r.orders} max={maxRegion} />
                    </div>
                  ))}
                  {data.regionPerformance.length === 0 && <p className="text-xs text-muted-foreground">No region data yet</p>}
                </div>
              </Card>
            </TabsContent>

            {/* RETURNS & REFUNDS */}
            <TabsContent value="returns" className="space-y-5 mt-4">
              <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                <KpiCard label="Returns" value={num(k.returned)} icon={<RotateCcw className="size-4" />} />
                <KpiCard label="Return Rate" value={`${data.returnRate}%`} icon={<ArrowDownRight className="size-4" />} />
                <KpiCard label="Refunded Orders" value={num(k.refunded)} icon={<Wallet className="size-4" />} />
                <KpiCard label="Refund Total" value={inr(k.refund_total)} icon={<ArrowDownRight className="size-4" />} />
              </div>
              <div className="grid md:grid-cols-2 gap-3">
                <Card title="Return reasons" icon={<RotateCcw className="size-4 text-accent" />}>
                  <div className="space-y-3">
                    {data.returnReasons.map((r) => (
                      <div key={r.reason}>
                        <div className="flex items-center justify-between gap-2 text-xs mb-1"><span className="truncate">{r.reason}</span><span className="text-muted-foreground tabular-nums shrink-0">{r.cnt}</span></div>
                        <Bar value={r.cnt} max={maxReason} color="bg-orange-400" />
                      </div>
                    ))}
                    {data.returnReasons.length === 0 && <p className="text-xs text-muted-foreground">No returns yet</p>}
                  </div>
                </Card>
                <Card title="Most returned products" icon={<Package className="size-4 text-accent" />}>
                  <div className="space-y-1">
                    {data.topReturned.map((p) => <div key={p.slug} className="flex items-center justify-between gap-2 text-xs py-1.5 border-b border-border/40 last:border-0"><span className="truncate">{p.name ?? p.slug}</span><span className="text-muted-foreground tabular-nums shrink-0">{p.cnt}</span></div>)}
                    {data.topReturned.length === 0 && <p className="text-xs text-muted-foreground">No returns yet</p>}
                  </div>
                </Card>
              </div>
            </TabsContent>

            {/* STAFF */}
            <TabsContent value="staff" className="space-y-5 mt-4">
              <Card title="Support performance" icon={<Users className="size-4 text-accent" />}>
                <div className="space-y-1">
                  {data.staffSupport.map((s) => (
                    <div key={s.uid} className="flex items-center gap-3 py-2 border-b border-border/40 last:border-0">
                      <Avatar name={s.full_name} url={s.avatar_url} size={30} />
                      <div className="flex-1 min-w-0"><p className="text-xs font-medium truncate">{s.full_name ?? "Staff"}</p><p className="text-[11px] text-muted-foreground">{s.tickets_resolved}/{s.tickets_handled} resolved</p></div>
                      <span className="text-[11px] text-muted-foreground shrink-0">{s.avg_handling_hours != null ? `${s.avg_handling_hours.toFixed(1)}h avg` : "—"}</span>
                    </div>
                  ))}
                  {data.staffSupport.length === 0 && <p className="text-xs text-muted-foreground">No staff ticket data yet</p>}
                </div>
              </Card>
              <Card title="Admin activity" icon={<Zap className="size-4 text-accent" />}>
                <div className="space-y-1">
                  {data.staffActivity.map((s) => (
                    <div key={s.uid} className="flex items-center gap-3 py-2 border-b border-border/40 last:border-0">
                      <Avatar name={s.full_name} url={s.avatar_url} size={30} />
                      <div className="flex-1 min-w-0"><p className="text-xs font-medium truncate">{s.full_name ?? "Staff"}</p><p className="text-[11px] text-muted-foreground">{timeAgo(s.last_action)}</p></div>
                      <span className="text-[11px] text-muted-foreground tabular-nums shrink-0">{num(s.actions)} actions</span>
                    </div>
                  ))}
                  {data.staffActivity.length === 0 && <p className="text-xs text-muted-foreground">No admin activity yet</p>}
                </div>
              </Card>
            </TabsContent>

            <TabsContent value="performance" className="space-y-5 mt-4">
              {(() => {
                const totPacked = staffPerf.reduce((a, s) => a + s.packed, 0);
                const totShipped = staffPerf.reduce((a, s) => a + s.shipped, 0);
                const totRefunds = staffPerf.reduce((a, s) => a + s.refunds_handled, 0);
                const hrs = staffPerf.map((s) => s.avg_handling_hours).filter((h): h is number => h != null);
                const avgHrs = hrs.length ? hrs.reduce((a, b) => a + b, 0) / hrs.length : null;
                return (
                  <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
                    <KpiCard label="Packed" value={num(totPacked)} icon={<Package className="size-4" />} />
                    <KpiCard label="Shipped" value={num(totShipped)} icon={<Truck className="size-4" />} />
                    <KpiCard label="Refunds Handled" value={num(totRefunds)} icon={<RotateCcw className="size-4" />} />
                    <KpiCard label="Avg Handling" value={avgHrs != null ? `${avgHrs.toFixed(1)}h` : "—"} icon={<Clock className="size-4" />} />
                  </div>
                );
              })()}
              <Card title="Staff performance" icon={<Gauge className="size-4 text-accent" />}
                actions={<span className="text-[11px] text-muted-foreground shrink-0">{staffPerf.length} staff</span>}>
                {staffPerf.length === 0 ? (
                  <p className="text-xs text-muted-foreground">No fulfilment activity recorded yet. Packed, shipped and refund actions appear here as staff process orders.</p>
                ) : (
                  <div className="overflow-x-auto -mx-1 px-1">
                    <table className="w-full text-xs">
                      <thead>
                        <tr className="text-muted-foreground border-b border-border/60">
                          <th className="text-left font-medium py-2 pr-3">Staff</th>
                          <th className="text-right font-medium py-2 px-3">Packed</th>
                          <th className="text-right font-medium py-2 px-3">Shipped</th>
                          <th className="text-right font-medium py-2 px-3">Refunds</th>
                          <th className="text-right font-medium py-2 px-3">Actions</th>
                          <th className="text-right font-medium py-2 px-3">Avg Handling</th>
                          <th className="text-right font-medium py-2 pl-3">Last Active</th>
                        </tr>
                      </thead>
                      <tbody>
                        {staffPerf.map((s) => (
                          <tr key={s.uid} className="border-b border-border/40 last:border-0">
                            <td className="py-2 pr-3">
                              <div className="flex items-center gap-2 min-w-0">
                                <Avatar name={s.full_name} url={s.avatar_url} size={26} />
                                <div className="min-w-0">
                                  <p className="font-medium truncate">{s.full_name ?? "Staff"}</p>
                                  <p className="text-[10px] text-muted-foreground truncate">{s.roles.join(", ") || "—"}</p>
                                </div>
                              </div>
                            </td>
                            <td className="text-right tabular-nums py-2 px-3">{num(s.packed)}</td>
                            <td className="text-right tabular-nums py-2 px-3">{num(s.shipped)}</td>
                            <td className="text-right tabular-nums py-2 px-3">{num(s.refunds_handled)}</td>
                            <td className="text-right tabular-nums py-2 px-3">{num(s.total_actions)}</td>
                            <td className="text-right tabular-nums py-2 px-3">{s.avg_handling_hours != null ? `${s.avg_handling_hours.toFixed(1)}h` : "—"}</td>
                            <td className="text-right text-muted-foreground py-2 pl-3">{timeAgo(s.last_action)}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </Card>
            </TabsContent>
          </Tabs>
        </section>
      </div>
    </AdminShell>
  );
}
