import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useMemo, useRef, useState } from "react";
import { motion, useInView, animate } from "framer-motion";
import {
  Loader2, Eye, MousePointerClick, Percent, Layers, Tag, TrendingUp, RefreshCw, Package,
} from "lucide-react";
import {
  AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer,
} from "recharts";
import { AdminShell } from "@/components/admin/AdminShell";
import { Button } from "@/components/ui/button";
import {
  loadBadgeAnalytics,
  badgeAnimationClass,
  type BadgeAnalytics,
} from "@/lib/use-product-badges";

export const Route = createFileRoute("/admin-badges-analytics")({
  head: () => ({
    meta: [
      { title: "Badge Analytics — FoundOurMarket™" },
      { name: "description", content: "Impressions, clicks, CTR and conversion insights for product badges." },
    ],
  }),
  component: BadgeAnalyticsPage,
});

function BadgeAnalyticsPage() {
  return (
    <AdminShell
      title="Badge Analytics"
      subtitle="Impressions, clicks, CTR & merchandising performance"
      allow={["admin", "super_admin", "manager"]}
    >
      <BadgeAnalyticsInner />
    </AdminShell>
  );
}

function Counter({ value, suffix = "" }: { value: number; suffix?: string }) {
  const ref = useRef<HTMLSpanElement>(null);
  const inView = useInView(ref, { once: true });
  const [display, setDisplay] = useState(0);
  useEffect(() => {
    if (!inView) return;
    const controls = animate(0, value, {
      duration: 0.9,
      ease: [0.16, 1, 0.3, 1],
      onUpdate: (v) => setDisplay(v),
    });
    return () => controls.stop();
  }, [inView, value]);
  return <span ref={ref}>{Math.round(display).toLocaleString()}{suffix}</span>;
}

const RANGES = [
  { label: "7D", days: 7 },
  { label: "30D", days: 30 },
  { label: "90D", days: 90 },
];

function BadgeAnalyticsInner() {
  const [days, setDays] = useState(30);
  const [data, setData] = useState<BadgeAnalytics | null>(null);
  const [loading, setLoading] = useState(true);

  const fetchData = useMemo(
    () => async (d: number, soft = false) => {
      if (!soft) setLoading(true);
      try {
        setData(await loadBadgeAnalytics(d));
      } finally {
        setLoading(false);
      }
    },
    [],
  );

  useEffect(() => {
    void fetchData(days);
  }, [days, fetchData]);

  const stats = [
    { label: "Impressions", value: data?.totalImpressions ?? 0, icon: Eye, suffix: "" },
    { label: "Clicks", value: data?.totalClicks ?? 0, icon: MousePointerClick, suffix: "" },
    { label: "Avg CTR", value: Math.round((data?.avgCtr ?? 0) * 1000) / 10, icon: Percent, suffix: "%" },
    { label: "Active badges", value: data?.activeBadges ?? 0, icon: Tag, suffix: "" },
    { label: "Assignments", value: data?.totalAssignments ?? 0, icon: Layers, suffix: "" },
  ];

  return (
    <div className="space-y-6">
      {/* Range selector */}
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <div className="flex items-center gap-1 rounded-xl border border-border/60 bg-card/40 p-1 backdrop-blur">
          {RANGES.map((r) => (
            <button
              key={r.days}
              onClick={() => setDays(r.days)}
              className={`px-3 py-1.5 text-xs font-semibold rounded-lg transition-colors ${
                days === r.days
                  ? "bg-accent text-accent-foreground shadow"
                  : "text-muted-foreground hover:text-foreground"
              }`}
            >
              {r.label}
            </button>
          ))}
        </div>
        <Button
          variant="outline"
          size="sm"
          onClick={() => fetchData(days, true)}
          className="gap-2"
        >
          <RefreshCw className="h-4 w-4" /> Refresh
        </Button>
      </div>

      {/* Stat cards */}
      <div className="grid grid-cols-2 md:grid-cols-3 xl:grid-cols-5 gap-3">
        {stats.map((s, i) => (
          <motion.div
            key={s.label}
            initial={{ opacity: 0, y: 12 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: i * 0.05 }}
            className="relative overflow-hidden rounded-2xl border border-border/60 bg-card/50 p-4 backdrop-blur"
          >
            <div className="absolute -right-6 -top-6 h-20 w-20 rounded-full bg-accent/10 blur-2xl" />
            <s.icon className="h-4 w-4 text-accent mb-2" />
            <div className="text-2xl font-bold tracking-tight">
              <Counter value={s.value} suffix={s.suffix} />
            </div>
            <div className="text-[11px] uppercase tracking-wide text-muted-foreground mt-1">{s.label}</div>
          </motion.div>
        ))}
      </div>

      {loading ? (
        <div className="flex items-center justify-center py-24 text-muted-foreground">
          <Loader2 className="h-6 w-6 animate-spin" />
        </div>
      ) : (
        <>
          {/* Trend chart */}
          <div className="rounded-2xl border border-border/60 bg-card/50 p-4 backdrop-blur">
            <div className="flex items-center gap-2 mb-4">
              <TrendingUp className="h-4 w-4 text-accent" />
              <h3 className="text-sm font-semibold">Impressions & clicks over time</h3>
            </div>
            <div className="h-64 w-full">
              <ResponsiveContainer width="100%" height="100%">
                <AreaChart data={data?.series ?? []} margin={{ top: 4, right: 8, left: -16, bottom: 0 }}>
                  <defs>
                    <linearGradient id="impr" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="0%" stopColor="hsl(var(--muted-foreground))" stopOpacity={0.35} />
                      <stop offset="100%" stopColor="hsl(var(--muted-foreground))" stopOpacity={0} />
                    </linearGradient>
                    <linearGradient id="clk" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="0%" stopColor="hsl(var(--accent))" stopOpacity={0.5} />
                      <stop offset="100%" stopColor="hsl(var(--accent))" stopOpacity={0} />
                    </linearGradient>
                  </defs>
                  <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" opacity={0.3} />
                  <XAxis
                    dataKey="date"
                    tickFormatter={(d: string) => d.slice(5)}
                    tick={{ fontSize: 10, fill: "hsl(var(--muted-foreground))" }}
                    tickLine={false}
                    axisLine={false}
                    minTickGap={24}
                  />
                  <YAxis
                    tick={{ fontSize: 10, fill: "hsl(var(--muted-foreground))" }}
                    tickLine={false}
                    axisLine={false}
                    width={36}
                  />
                  <Tooltip
                    contentStyle={{
                      background: "hsl(var(--card))",
                      border: "1px solid hsl(var(--border))",
                      borderRadius: 12,
                      fontSize: 12,
                    }}
                  />
                  <Area type="monotone" dataKey="impressions" stroke="hsl(var(--muted-foreground))" fill="url(#impr)" strokeWidth={2} />
                  <Area type="monotone" dataKey="clicks" stroke="hsl(var(--accent))" fill="url(#clk)" strokeWidth={2} />
                </AreaChart>
              </ResponsiveContainer>
            </div>
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
            {/* Per-badge leaderboard */}
            <div className="lg:col-span-2 rounded-2xl border border-border/60 bg-card/50 p-4 backdrop-blur">
              <h3 className="text-sm font-semibold mb-4 flex items-center gap-2">
                <Tag className="h-4 w-4 text-accent" /> Badge performance
              </h3>
              <div className="space-y-2">
                <div className="grid grid-cols-[1fr_auto_auto_auto_auto] gap-3 px-3 pb-1 text-[10px] uppercase tracking-wide text-muted-foreground">
                  <span>Badge</span>
                  <span className="text-right w-14">Impr.</span>
                  <span className="text-right w-12">Clicks</span>
                  <span className="text-right w-12">CTR</span>
                  <span className="text-right w-14">Products</span>
                </div>
                {(data?.perBadge ?? []).length === 0 && (
                  <p className="px-3 py-6 text-center text-sm text-muted-foreground">No badge activity yet.</p>
                )}
                {(data?.perBadge ?? []).map((s) => (
                  <div
                    key={s.badge.id}
                    className="grid grid-cols-[1fr_auto_auto_auto_auto] items-center gap-3 rounded-xl border border-border/40 bg-background/40 px-3 py-2.5"
                  >
                    <div className="flex items-center gap-2 min-w-0">
                      <span
                        className={`inline-flex shrink-0 items-center gap-1 rounded-md px-2 py-0.5 text-[11px] font-bold ${badgeAnimationClass(s.badge.animation)}`}
                        style={{
                          background: s.badge.backgroundColor,
                          color: s.badge.textColor,
                          border: s.badge.borderColor ? `1px solid ${s.badge.borderColor}` : undefined,
                        }}
                      >
                        {s.badge.emoji} {s.badge.label}
                      </span>
                    </div>
                    <span className="text-right w-14 tabular-nums text-sm">{s.impressions.toLocaleString()}</span>
                    <span className="text-right w-12 tabular-nums text-sm">{s.clicks.toLocaleString()}</span>
                    <span className="text-right w-12 tabular-nums text-sm font-semibold text-accent">
                      {(s.ctr * 100).toFixed(1)}%
                    </span>
                    <span className="text-right w-14 tabular-nums text-sm">{s.products.toLocaleString()}</span>
                  </div>
                ))}
              </div>
            </div>

            {/* Top products */}
            <div className="rounded-2xl border border-border/60 bg-card/50 p-4 backdrop-blur">
              <h3 className="text-sm font-semibold mb-4 flex items-center gap-2">
                <Package className="h-4 w-4 text-accent" /> Top clicked products
              </h3>
              <div className="space-y-2">
                {(data?.topProducts ?? []).length === 0 && (
                  <p className="py-6 text-center text-sm text-muted-foreground">No clicks yet.</p>
                )}
                {(data?.topProducts ?? []).map((p, i) => (
                  <div key={p.slug} className="flex items-center gap-3 rounded-xl border border-border/40 bg-background/40 px-3 py-2">
                    <span className="text-xs font-bold text-accent w-5">{i + 1}</span>
                    <span className="text-sm truncate flex-1">{p.slug}</span>
                    <span className="text-sm tabular-nums font-semibold">{p.clicks.toLocaleString()}</span>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </>
      )}
    </div>
  );
}
