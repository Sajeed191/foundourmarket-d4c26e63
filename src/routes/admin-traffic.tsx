import { createFileRoute, Link } from "@tanstack/react-router";
import { useState } from "react";
import {
  AreaChart, Area, BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip,
  ResponsiveContainer, PieChart, Pie, Cell, Legend,
} from "recharts";
import {
  Globe, Users, Eye, MousePointerClick, Loader2, Smartphone, Monitor, Tablet,
  RadioTower, Activity, Search, Flame, Sparkles, Crown, TrendingUp, TrendingDown,
  Download, AlertTriangle, ArrowDownRight, Wifi, MapPin, Route as RouteIcon, Package,
} from "lucide-react";
import { AdminShell } from "@/components/admin/AdminShell";
import { KpiCard } from "@/components/admin/KpiCard";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { useTrafficIntelligence } from "@/lib/use-traffic-intelligence";
import { exportRows, exportJson, type ExportFormat } from "@/lib/traffic-export";
import type { TrafficIntelligence } from "@/lib/traffic-intelligence";

export const Route = createFileRoute("/admin-traffic")({
  head: () => ({ meta: [{ title: "Traffic Intelligence — Admin" }] }),
  component: TrafficPage,
});

const COLORS = ["#a3e635", "#22d3ee", "#a78bfa", "#f59e0b", "#f43f5e", "#34d399", "#fb923c"];
const inr = (n: number) => "₹" + Math.round(n).toLocaleString("en-IN");
const pct = (n: number) => `${n.toFixed(1)}%`;
const ago = (ts: number) => {
  const s = Math.max(0, Math.round((Date.now() - ts) / 1000));
  if (s < 60) return `${s}s`;
  if (s < 3600) return `${Math.round(s / 60)}m`;
  return `${Math.round(s / 3600)}h`;
};

function Card({ title, icon, children, className = "" }: { title?: string; icon?: React.ReactNode; children: React.ReactNode; className?: string }) {
  return (
    <div className={`card-premium rounded-2xl p-5 ${className}`}>
      {title && <h2 className="text-sm font-medium mb-4 flex items-center gap-2">{icon}{title}</h2>}
      {children}
    </div>
  );
}

function ExportMenu({ getRows, name, full }: { getRows: () => Record<string, unknown>[]; name: string; full?: unknown }) {
  return (
    <div className="inline-flex items-center gap-1.5">
      <Download className="size-3.5 text-muted-foreground" />
      {(["csv", "excel", "json"] as ExportFormat[]).map((f) => (
        <button
          key={f}
          onClick={() => (f === "json" && full ? exportJson(full, name) : exportRows(f, getRows(), name))}
          className="px-2 py-0.5 text-[10px] font-mono uppercase tracking-widest rounded-full border border-border hover:border-accent/50 hover:text-accent transition-colors"
        >
          {f}
        </button>
      ))}
    </div>
  );
}

function ScoreRing({ label, value }: { label: string; value: number }) {
  const color = value >= 70 ? "#a3e635" : value >= 45 ? "#f59e0b" : "#f43f5e";
  return (
    <div className="card-premium rounded-2xl p-5 flex flex-col items-center justify-center text-center">
      <div className="relative size-20">
        <svg viewBox="0 0 36 36" className="size-20 -rotate-90">
          <circle cx="18" cy="18" r="15.9" fill="none" stroke="rgba(255,255,255,0.08)" strokeWidth="3" />
          <circle cx="18" cy="18" r="15.9" fill="none" stroke={color} strokeWidth="3" strokeLinecap="round"
            strokeDasharray={`${value} 100`} />
        </svg>
        <span className="absolute inset-0 flex items-center justify-center text-lg font-display font-semibold tabular-nums">{value}</span>
      </div>
      <span className="mt-3 text-[10px] font-mono uppercase tracking-[0.2em] text-muted-foreground">{label}</span>
    </div>
  );
}

function TrafficPage() {
  const [days, setDays] = useState<7 | 14 | 30>(14);
  const { data, loading, refreshing } = useTrafficIntelligence(days);

  return (
    <AdminShell
      title="Traffic Intelligence"
      subtitle="Live operations center — visitors, journeys, conversion & revenue"
      allow={["admin", "super_admin", "manager"]}
      actions={
        <>
          <span className="inline-flex items-center gap-1.5 text-[10px] font-mono uppercase tracking-widest text-accent">
            <span className="size-1.5 rounded-full bg-accent animate-pulse" /> Live · {data?.live.active ?? 0}
            {refreshing && <Loader2 className="size-3 animate-spin" />}
          </span>
          <div className="inline-flex rounded-full border border-border bg-card p-0.5">
            {([7, 14, 30] as const).map((p) => (
              <button key={p} onClick={() => setDays(p)} className={`px-2.5 py-1 text-[10px] font-mono uppercase tracking-widest rounded-full ${days === p ? "bg-accent text-accent-foreground" : "text-muted-foreground"}`}>{p}d</button>
            ))}
          </div>
        </>
      }
    >
      {loading || !data ? (
        <div className="flex items-center justify-center py-32"><Loader2 className="size-6 animate-spin text-muted-foreground" /></div>
      ) : (
        <Intelligence data={data} />
      )}
    </AdminShell>
  );
}

function Intelligence({ data }: { data: TrafficIntelligence }) {
  return (
    <Tabs defaultValue="war" className="w-full">
      <div className="overflow-x-auto -mx-1 px-1 mb-5">
        <TabsList className="inline-flex h-auto flex-nowrap gap-1 bg-card border border-border rounded-xl p-1">
          {[
            ["war", "War Room"], ["journey", "Journey"], ["products", "Products"],
            ["sources", "Sources"], ["regions", "Regions"], ["devices", "Devices"],
            ["search", "Search"], ["heatmaps", "Heatmaps"], ["advisor", "AI Advisor"], ["exec", "Executive"],
          ].map(([v, l]) => (
            <TabsTrigger key={v} value={v} className="text-[11px] font-mono uppercase tracking-wider whitespace-nowrap">{l}</TabsTrigger>
          ))}
        </TabsList>
      </div>

      <TabsContent value="war"><WarRoom data={data} /></TabsContent>
      <TabsContent value="journey"><Journey data={data} /></TabsContent>
      <TabsContent value="products"><Products data={data} /></TabsContent>
      <TabsContent value="sources"><Sources data={data} /></TabsContent>
      <TabsContent value="regions"><Regions data={data} /></TabsContent>
      <TabsContent value="devices"><Devices data={data} /></TabsContent>
      <TabsContent value="search"><SearchIntel data={data} /></TabsContent>
      <TabsContent value="heatmaps"><Heatmaps data={data} /></TabsContent>
      <TabsContent value="advisor"><Advisor data={data} /></TabsContent>
      <TabsContent value="exec"><Executive data={data} /></TabsContent>
    </Tabs>
  );
}

/* ----------------------------------------------------------- SECTION 1 */
function WarRoom({ data }: { data: TrafficIntelligence }) {
  const l = data.live;
  return (
    <div className="space-y-6">
      <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-8 gap-3">
        <KpiCard label="Active now" value={l.active} icon={<RadioTower className="size-4" />} />
        <KpiCard label="India" value={l.india} icon={<MapPin className="size-4" />} />
        <KpiCard label="International" value={l.international} icon={<Globe className="size-4" />} />
        <KpiCard label="Logged in" value={l.loggedIn} icon={<Users className="size-4" />} />
        <KpiCard label="Guests" value={l.guests} icon={<Users className="size-4" />} />
        <KpiCard label="Mobile" value={l.mobile} icon={<Smartphone className="size-4" />} />
        <KpiCard label="Tablet" value={l.tablet} icon={<Tablet className="size-4" />} />
        <KpiCard label="Desktop" value={l.desktop} icon={<Monitor className="size-4" />} />
      </div>

      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-3">
        <KpiCard label="Page views" value={data.totals.views.toLocaleString()} icon={<Eye className="size-4" />} />
        <KpiCard label="Sessions" value={data.totals.sessions.toLocaleString()} icon={<Activity className="size-4" />} />
        <KpiCard label="Unique visitors" value={data.totals.visitors.toLocaleString()} icon={<Users className="size-4" />} />
        <KpiCard label="Orders" value={data.totals.orders.toLocaleString()} icon={<MousePointerClick className="size-4" />} />
        <KpiCard label="Conversion" value={pct(data.totals.conversion)} />
        <KpiCard label="Revenue" value={inr(data.totals.revenue)} />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-5">
        <Card title="Visitors & views" icon={<TrendingUp className="size-4 text-muted-foreground" />} className="lg:col-span-2">
          <ResponsiveContainer width="100%" height={260}>
            <AreaChart data={data.trend}>
              <defs>
                <linearGradient id="v" x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stopColor="#a3e635" stopOpacity={0.4} /><stop offset="100%" stopColor="#a3e635" stopOpacity={0} /></linearGradient>
                <linearGradient id="u" x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stopColor="#22d3ee" stopOpacity={0.4} /><stop offset="100%" stopColor="#22d3ee" stopOpacity={0} /></linearGradient>
              </defs>
              <CartesianGrid stroke="rgba(255,255,255,0.06)" />
              <XAxis dataKey="date" stroke="rgba(255,255,255,0.4)" fontSize={10} />
              <YAxis stroke="rgba(255,255,255,0.4)" fontSize={10} />
              <Tooltip contentStyle={{ background: "#0a0a0a", border: "1px solid rgba(255,255,255,0.1)" }} />
              <Area type="monotone" dataKey="views" stroke="#a3e635" fill="url(#v)" />
              <Area type="monotone" dataKey="visitors" stroke="#22d3ee" fill="url(#u)" />
            </AreaChart>
          </ResponsiveContainer>
        </Card>

        <Card title="Live visitor feed" icon={<Wifi className="size-4 text-accent" />}>
          <div className="max-h-[260px] overflow-y-auto pr-1 space-y-2">
            {data.liveFeed.length === 0 && <p className="text-xs text-muted-foreground">No active visitors in the last 5 minutes.</p>}
            {data.liveFeed.map((v) => (
              <div key={v.sessionId} className="flex items-center justify-between text-xs border-b border-border/40 pb-2">
                <div className="min-w-0">
                  <p className="font-mono truncate">{v.path}</p>
                  <p className="text-[10px] text-muted-foreground">
                    {v.region === "india" ? "🇮🇳" : "🌍"} {v.device} · {v.source} {v.loggedIn ? "· 👤" : ""}
                  </p>
                </div>
                <div className="text-right shrink-0 ml-2">
                  <p className="text-accent font-mono">{ago(v.lastSeen)} ago</p>
                  <p className="text-[10px] text-muted-foreground">{Math.round((v.lastSeen - v.startedAt) / 1000)}s session</p>
                </div>
              </div>
            ))}
          </div>
        </Card>
      </div>
    </div>
  );
}

/* ----------------------------------------------------------- SECTION 2 */
function Journey({ data }: { data: TrafficIntelligence }) {
  const max = Math.max(1, ...data.funnel.map((f) => f.visitors));
  const worst = data.funnel.slice(1).sort((a, b) => b.dropPct - a.dropPct)[0];
  return (
    <div className="space-y-5">
      <div className="flex items-center justify-end">
        <ExportMenu name="customer-journey" getRows={() => data.funnel as unknown as Record<string, unknown>[]} />
      </div>
      <Card title="Customer journey" icon={<RouteIcon className="size-4 text-muted-foreground" />}>
        <div className="space-y-3">
          {data.funnel.map((f) => {
            const bottleneck = worst && f.step === worst.step && worst.dropPct > 40;
            return (
              <div key={f.step}>
                <div className="flex items-center justify-between text-xs mb-1">
                  <span className="font-medium flex items-center gap-2">
                    {f.step}
                    {bottleneck && <span className="inline-flex items-center gap-1 text-destructive text-[10px]"><AlertTriangle className="size-3" /> bottleneck</span>}
                  </span>
                  <span className="font-mono text-muted-foreground">
                    {f.visitors.toLocaleString()} · {pct(f.conversionPct)}
                    {f.dropPct > 0 && <span className="text-destructive ml-2"><ArrowDownRight className="inline size-3" />{pct(f.dropPct)}</span>}
                    {f.revenue > 0 && <span className="text-accent ml-2">{inr(f.revenue)}</span>}
                  </span>
                </div>
                <div className="h-7 rounded-lg bg-muted/30 overflow-hidden">
                  <div className={`h-full rounded-lg ${bottleneck ? "bg-destructive/70" : "bg-accent/70"}`} style={{ width: `${(f.visitors / max) * 100}%` }} />
                </div>
              </div>
            );
          })}
        </div>
      </Card>
    </div>
  );
}

/* ----------------------------------------------------------- SECTION 3 */
function Products({ data }: { data: TrafficIntelligence }) {
  const byRevenue = [...data.products].sort((a, b) => b.revenue - a.revenue).slice(0, 8);
  const topViewed = [...data.products].slice(0, 8);
  const converting = [...data.products].filter((p) => p.purchases > 0).sort((a, b) => b.conversion - a.conversion).slice(0, 8);
  const lowConv = [...data.products].filter((p) => p.views >= 5).sort((a, b) => a.conversion - b.conversion).slice(0, 8);
  const abandoned = [...data.products].filter((p) => p.addToCart > 0).sort((a, b) => (b.addToCart - b.purchases) - (a.addToCart - a.purchases)).slice(0, 8);

  const rows = () => data.products.map((p) => ({
    product: p.name, views: p.views, uniques: p.uniques, add_to_cart: p.addToCart,
    checkout: p.checkout, purchases: p.purchases, atc_rate: p.atcRate.toFixed(1),
    conversion: p.conversion.toFixed(2), revenue: Math.round(p.revenue), india: p.india, international: p.international,
  }));

  if (!data.products.length)
    return <Card><p className="text-xs text-muted-foreground">No product engagement events recorded yet for this window.</p></Card>;

  const List = ({ title, items, metric }: { title: string; items: typeof data.products; metric: (p: typeof data.products[number]) => string }) => (
    <Card title={title} icon={<Package className="size-4 text-muted-foreground" />}>
      <ul className="space-y-2">
        {items.map((p) => (
          <li key={p.slug} className="flex items-center justify-between text-xs gap-2">
            <Link to="/products/$slug" params={{ slug: p.slug }} className="truncate hover:text-accent">{p.name}</Link>
            <span className="font-mono text-accent shrink-0">{metric(p)}</span>
          </li>
        ))}
        {!items.length && <p className="text-xs text-muted-foreground">No data.</p>}
      </ul>
    </Card>
  );

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-end"><ExportMenu name="product-performance" getRows={rows} /></div>
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5">
        <List title="Top viewed" items={topViewed} metric={(p) => `${p.views} views`} />
        <List title="Highest revenue" items={byRevenue} metric={(p) => inr(p.revenue)} />
        <List title="Top converting" items={converting} metric={(p) => pct(p.conversion)} />
        <List title="Lowest converting" items={lowConv} metric={(p) => pct(p.conversion)} />
        <List title="Most abandoned" items={abandoned} metric={(p) => `${p.addToCart - p.purchases} lost`} />
      </div>
    </div>
  );
}

/* ----------------------------------------------------------- SECTION 4 */
function Sources({ data }: { data: TrafficIntelligence }) {
  const rows = () => data.sources.map((s) => ({
    source: s.source, visitors: s.visitors, sessions: s.sessions, orders: s.orders,
    revenue: Math.round(s.revenue), conversion: s.conversion.toFixed(2), aov: Math.round(s.aov),
  }));
  return (
    <div className="space-y-5">
      <div className="flex items-center justify-end"><ExportMenu name="traffic-sources" getRows={rows} /></div>
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
        <Card title="Visitors by source" icon={<Globe className="size-4 text-muted-foreground" />}>
          <ResponsiveContainer width="100%" height={280}>
            <BarChart data={data.sources.slice(0, 8)} layout="vertical">
              <CartesianGrid stroke="rgba(255,255,255,0.06)" horizontal={false} />
              <XAxis type="number" stroke="rgba(255,255,255,0.4)" fontSize={10} />
              <YAxis type="category" dataKey="source" width={90} stroke="rgba(255,255,255,0.4)" fontSize={10} />
              <Tooltip contentStyle={{ background: "#0a0a0a", border: "1px solid rgba(255,255,255,0.1)" }} />
              <Bar dataKey="visitors" fill="#a3e635" radius={[0, 4, 4, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </Card>
        <Card title="Source performance" icon={<TrendingUp className="size-4 text-muted-foreground" />}>
          <div className="overflow-x-auto">
            <table className="w-full text-xs">
              <thead><tr className="text-muted-foreground text-left"><th className="py-1">Source</th><th>Visitors</th><th>Orders</th><th>Conv</th><th>Rev</th><th>AOV</th></tr></thead>
              <tbody>
                {data.sources.slice(0, 12).map((s) => (
                  <tr key={s.source} className="border-t border-border/40">
                    <td className="py-1.5">{s.source}</td><td className="font-mono">{s.visitors}</td>
                    <td className="font-mono">{s.orders}</td><td className="font-mono">{pct(s.conversion)}</td>
                    <td className="font-mono text-accent">{inr(s.revenue)}</td><td className="font-mono">{inr(s.aov)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Card>
      </div>
    </div>
  );
}

/* ----------------------------------------------------------- SECTION 5 */
function Regions({ data }: { data: TrafficIntelligence }) {
  const rows = () => data.regions.map((r) => ({
    region: r.region, visitors: r.visitors, sessions: r.sessions, orders: r.orders,
    revenue: Math.round(r.revenue), aov: Math.round(r.aov), conversion: r.conversion.toFixed(2),
  }));
  return (
    <div className="space-y-5">
      <div className="flex items-center justify-end"><ExportMenu name="region-intelligence" getRows={rows} /></div>
      <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
        {data.regions.map((r) => (
          <Card key={r.region} title={r.region === "india" ? "🇮🇳 India" : "🌍 International"} icon={<MapPin className="size-4 text-muted-foreground" />}>
            <div className="grid grid-cols-2 gap-3 mb-4">
              <Metric label="Visitors" value={r.visitors.toLocaleString()} />
              <Metric label="Sessions" value={r.sessions.toLocaleString()} />
              <Metric label="Orders" value={r.orders.toLocaleString()} />
              <Metric label="Revenue" value={inr(r.revenue)} />
              <Metric label="AOV" value={inr(r.aov)} />
              <Metric label="Conversion" value={pct(r.conversion)} />
            </div>
            <p className="text-[10px] font-mono uppercase tracking-widest text-muted-foreground mb-2">Top products</p>
            <ul className="space-y-1">
              {r.topProducts.map((p) => (
                <li key={p.slug} className="flex justify-between text-xs"><span className="truncate">{p.slug}</span><span className="font-mono text-accent">{p.n}</span></li>
              ))}
              {!r.topProducts.length && <p className="text-xs text-muted-foreground">No product views yet.</p>}
            </ul>
          </Card>
        ))}
      </div>
    </div>
  );
}

function Metric({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-xl border border-border/50 bg-muted/20 p-3">
      <p className="text-[10px] font-mono uppercase tracking-widest text-muted-foreground">{label}</p>
      <p className="text-lg font-display font-semibold tabular-nums">{value}</p>
    </div>
  );
}

/* ----------------------------------------------------------- SECTION 6 */
function Devices({ data }: { data: TrafficIntelligence }) {
  const rows = () => data.devices.map((d) => ({
    device: d.device, visitors: d.visitors, sessions: d.sessions, revenue: Math.round(d.revenue),
    conversion: d.conversion.toFixed(2), avg_duration_s: Math.round(d.avgDuration), bounce: d.bounceRate.toFixed(1),
  }));
  const pie = data.devices.map((d) => ({ name: d.device, value: d.sessions }));
  const problem = data.devices.filter((d) => d.sessions > 5 && d.bounceRate > 65);
  return (
    <div className="space-y-5">
      <div className="flex items-center justify-end"><ExportMenu name="device-intelligence" getRows={rows} /></div>
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-5">
        <Card title="Sessions by device" icon={<Smartphone className="size-4 text-muted-foreground" />}>
          <ResponsiveContainer width="100%" height={240}>
            <PieChart>
              <Pie data={pie} dataKey="value" nameKey="name" outerRadius={85} innerRadius={48} paddingAngle={3}>
                {pie.map((_, i) => <Cell key={i} fill={COLORS[i % COLORS.length]} />)}
              </Pie>
              <Tooltip contentStyle={{ background: "#0a0a0a", border: "1px solid rgba(255,255,255,0.1)" }} />
              <Legend wrapperStyle={{ fontSize: 10, fontFamily: "monospace", textTransform: "uppercase" }} />
            </PieChart>
          </ResponsiveContainer>
        </Card>
        <Card title="Device performance" className="lg:col-span-2" icon={<Monitor className="size-4 text-muted-foreground" />}>
          <table className="w-full text-xs">
            <thead><tr className="text-muted-foreground text-left"><th className="py-1">Device</th><th>Visitors</th><th>Revenue</th><th>Conv</th><th>Avg session</th><th>Bounce</th></tr></thead>
            <tbody>
              {data.devices.map((d) => (
                <tr key={d.device} className="border-t border-border/40">
                  <td className="py-1.5 capitalize">{d.device}</td><td className="font-mono">{d.visitors}</td>
                  <td className="font-mono text-accent">{inr(d.revenue)}</td><td className="font-mono">{pct(d.conversion)}</td>
                  <td className="font-mono">{Math.round(d.avgDuration)}s</td>
                  <td className={`font-mono ${d.bounceRate > 65 ? "text-destructive" : ""}`}>{pct(d.bounceRate)}</td>
                </tr>
              ))}
            </tbody>
          </table>
          {problem.length > 0 && (
            <p className="mt-3 text-xs text-destructive flex items-center gap-2"><AlertTriangle className="size-3" /> High bounce on {problem.map((p) => p.device).join(", ")} — investigate UX.</p>
          )}
        </Card>
      </div>
    </div>
  );
}

/* ----------------------------------------------------------- SECTION 7 */
function SearchIntel({ data }: { data: TrafficIntelligence }) {
  const s = data.search;
  const rows = () => s.top.map((x) => ({ query: x.query, searches: x.count, avg_results: x.avgResults.toFixed(1), clicks: x.clicks, conversion: x.conversion.toFixed(1) }));
  const Block = ({ title, icon, items }: { title: string; icon: React.ReactNode; items: { left: string; right: string; warn?: boolean }[] }) => (
    <Card title={title} icon={icon}>
      <ul className="space-y-2">
        {items.map((i, idx) => (
          <li key={idx} className="flex justify-between text-xs"><span className="truncate">{i.left}</span><span className={`font-mono ${i.warn ? "text-destructive" : "text-accent"}`}>{i.right}</span></li>
        ))}
        {!items.length && <p className="text-xs text-muted-foreground">No data yet.</p>}
      </ul>
    </Card>
  );
  return (
    <div className="space-y-5">
      <div className="flex items-center justify-end"><ExportMenu name="search-intelligence" getRows={rows} /></div>
      <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
        <Block title="Most searched" icon={<Search className="size-4 text-muted-foreground" />} items={s.top.map((x) => ({ left: x.query, right: `${x.count}` }))} />
        <Block title="Fastest growing" icon={<TrendingUp className="size-4 text-muted-foreground" />} items={s.growing.map((x) => ({ left: x.query, right: `+${x.growth.toFixed(0)}%` }))} />
        <Block title="No-result searches" icon={<AlertTriangle className="size-4 text-destructive" />} items={s.noResults.map((x) => ({ left: x.query, right: `${x.count}`, warn: true }))} />
        <Block title="Highest converting" icon={<MousePointerClick className="size-4 text-muted-foreground" />} items={s.converting.map((x) => ({ left: x.query, right: pct(x.conversion) }))} />
      </div>
      {s.noResults.length > 0 && (
        <Card title="Recommendations" icon={<Sparkles className="size-4 text-accent" />}>
          <p className="text-xs text-muted-foreground">
            {s.noResults.length} queries returned no results. Consider adding products or synonyms for: {s.noResults.slice(0, 5).map((x) => x.query).join(", ")}.
          </p>
        </Card>
      )}
    </div>
  );
}

/* ----------------------------------------------------------- SECTION 8 */
function Heatmaps({ data }: { data: TrafficIntelligence }) {
  const h = data.heatmaps;
  const Bars = ({ title, items, icon }: { title: string; items: { label: string; value: number }[]; icon: React.ReactNode }) => {
    const max = Math.max(1, ...items.map((i) => i.value));
    return (
      <Card title={title} icon={icon}>
        <div className="space-y-2">
          {items.map((i) => (
            <div key={i.label}>
              <div className="flex justify-between text-xs mb-0.5"><span className="truncate font-mono">{i.label}</span><span className="text-accent font-mono">{i.value}</span></div>
              <div className="h-2 rounded-full bg-muted/30 overflow-hidden"><div className="h-full bg-accent/70 rounded-full" style={{ width: `${(i.value / max) * 100}%` }} /></div>
            </div>
          ))}
          {!items.length && <p className="text-xs text-muted-foreground">No data yet.</p>}
        </div>
      </Card>
    );
  };
  return (
    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5">
      <Bars title="Most viewed pages" icon={<Eye className="size-4 text-muted-foreground" />} items={h.pages} />
      <Bars title="Most clicked categories" icon={<Flame className="size-4 text-muted-foreground" />} items={h.categories} />
      <Bars title="Most clicked products" icon={<Package className="size-4 text-muted-foreground" />} items={h.products} />
      <Bars title="Most clicked banners" icon={<Flame className="size-4 text-muted-foreground" />} items={h.banners} />
      <Bars title="Homepage sections" icon={<MousePointerClick className="size-4 text-muted-foreground" />} items={h.sections} />
    </div>
  );
}

/* ----------------------------------------------------------- SECTION 9 */
function Advisor({ data }: { data: TrafficIntelligence }) {
  const tone = (i: string) => i === "high" ? "text-destructive border-destructive/30 bg-destructive/10" : i === "medium" ? "text-accent border-accent/30 bg-accent/10" : "text-muted-foreground border-border";
  return (
    <div className="space-y-5">
      <div className="flex items-center justify-end"><ExportMenu name="ai-traffic-advisor" getRows={() => data.advice as unknown as Record<string, unknown>[]} /></div>
      {!data.advice.length && <Card><p className="text-xs text-muted-foreground">No critical issues detected. Keep monitoring as traffic grows.</p></Card>}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
        {data.advice.map((a) => (
          <Card key={a.id}>
            <div className="flex items-start justify-between gap-3 mb-2">
              <h3 className="text-sm font-medium flex items-center gap-2"><Sparkles className="size-4 text-accent" />{a.title}</h3>
              <span className={`text-[10px] font-mono uppercase tracking-widest px-2 py-0.5 rounded-full border ${tone(a.impact)}`}>{a.impact}</span>
            </div>
            <p className="text-xs text-muted-foreground mb-3">{a.detail}</p>
            <div className="flex flex-wrap gap-2 mb-3 text-[10px] font-mono uppercase tracking-widest">
              <span className="px-2 py-0.5 rounded-full border border-border">Confidence {a.confidence}%</span>
              {a.opportunity > 0 && <span className="px-2 py-0.5 rounded-full border border-accent/30 text-accent">~{inr(a.opportunity)} opportunity</span>}
            </div>
            <p className="text-xs"><span className="text-muted-foreground">Action: </span>{a.action}</p>
          </Card>
        ))}
      </div>
    </div>
  );
}

/* ---------------------------------------------------------- SECTION 10 */
function Executive({ data }: { data: TrafficIntelligence }) {
  const s = data.scores;
  return (
    <div className="space-y-6">
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <ScoreRing label="Traffic Health" value={s.trafficHealth} />
        <ScoreRing label="Conversion Health" value={s.conversionHealth} />
        <ScoreRing label="Growth" value={s.growth} />
        <ScoreRing label="Revenue Efficiency" value={s.revenueEfficiency} />
      </div>
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
        <Insight icon={<Crown className="size-4 text-accent" />} label="Biggest opportunity" value={s.biggestOpportunity} />
        <Insight icon={<AlertTriangle className="size-4 text-destructive" />} label="Biggest risk" value={s.biggestRisk} />
        <Insight icon={<TrendingUp className="size-4 text-accent" />} label="Fastest growing source" value={s.fastestSource} />
        <Insight icon={<Package className="size-4 text-accent" />} label="Best performing product" value={s.bestProduct} />
        <Insight icon={<TrendingDown className="size-4 text-destructive" />} label="Weakest funnel stage" value={s.weakestStage} />
      </div>
      <div className="flex items-center justify-end">
        <ExportMenu name="traffic-intelligence-full" getRows={() => []} full={data} />
      </div>
    </div>
  );
}

function Insight({ icon, label, value }: { icon: React.ReactNode; label: string; value: string }) {
  return (
    <Card>
      <div className="flex items-center gap-2 text-muted-foreground mb-2">{icon}<span className="text-[10px] font-mono uppercase tracking-[0.2em]">{label}</span></div>
      <p className="text-sm font-medium">{value}</p>
    </Card>
  );
}
