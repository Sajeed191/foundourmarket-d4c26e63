import { createFileRoute } from "@tanstack/react-router";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { motion, AnimatePresence, useMotionValue, useSpring, useTransform } from "framer-motion";
import {
  ShoppingBag, UserPlus, AlertTriangle,
  Pause, Play, Trash2, Filter, Radio, TrendingUp,
  Wifi, WifiOff, Database, Gauge, RefreshCw, Users,
} from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { AdminShell } from "@/components/admin/AdminShell";
import { fetchLiveMetrics, type LiveMetrics } from "@/lib/live-metrics";
import {
  ACTIVITY_META as KIND_META,
  ALL_ACTIVITY_KINDS as ALL_KINDS,
  ACTIVITY_CATEGORIES,
  fetchActivityHistory,
  type ActivityKind as EventKind,
  type ActivityEvent as LiveEvent,
} from "@/lib/unified-activity";

export const Route = createFileRoute("/admin-live")({
  head: () => ({
    meta: [
      { title: "Live Activity — Admin" },
      { name: "description", content: "Unified realtime operations stream across orders, payments, intelligence, support, and system alerts." },
    ],
  }),
  component: AdminLivePage,
});

const FILTER_STORAGE_KEY = "fom_live_filter_v2";

function timeAgo(ms: number): string {
  const d = Date.now() - ms;
  if (d < 5_000) return "just now";
  if (d < 60_000) return `${Math.floor(d / 1000)}s ago`;
  if (d < 3_600_000) return `${Math.floor(d / 60_000)}m ago`;
  return `${Math.floor(d / 3_600_000)}h ago`;
}

const EASE = [0.16, 1, 0.3, 1] as const;

type ConnState = "connecting" | "live" | "error";

/* ---- Background atmosphere ---- */
function Atmosphere() {
  return (
    <div aria-hidden className="pointer-events-none fixed inset-0 -z-10 overflow-hidden">
      <div className="orb animate-mesh" style={{ top: "-10%", left: "-5%", width: "45vw", height: "45vw", background: "var(--gradient-ember-soft)" }} />
      <div className="orb animate-mesh" style={{ bottom: "-15%", right: "-8%", width: "50vw", height: "50vw", background: "var(--gradient-violet)", animationDelay: "-6s" }} />
      <div className="absolute inset-0 grid-texture opacity-40" />
      <div className="absolute inset-0" style={{ background: "radial-gradient(120% 80% at 50% -10%, transparent 60%, oklch(0 0 0 / 0.55) 100%)" }} />
    </div>
  );
}

/* ---- Animated, interpolated number ---- */
function AnimatedNumber({ value, prefix = "", decimals = 0 }: { value: number; prefix?: string; decimals?: number }) {
  const mv = useMotionValue(value);
  const spring = useSpring(mv, { stiffness: 90, damping: 20, mass: 0.6 });
  const text = useTransform(spring, (v) =>
    `${prefix}${v.toLocaleString(undefined, { minimumFractionDigits: decimals, maximumFractionDigits: decimals })}`
  );
  useEffect(() => { mv.set(value); }, [value, mv]);
  return <motion.span>{text}</motion.span>;
}

/* ---- Featured / secondary analytics widgets ---- */
function FeaturedStat({ label, value, sub }: { label: string; value: number; sub: string }) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 16 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.6, ease: EASE }}
      whileHover={{ y: -3 }}
      className="card-ambient glass-reflect noise-layer relative overflow-hidden rounded-3xl p-6 sm:p-7 row-span-2 flex flex-col justify-between min-h-[180px] will-change-transform"
    >
      <div className="absolute -top-20 -right-16 size-56 rounded-full bg-accent/15 blur-3xl animate-ambient" />
      <div className="relative flex items-center gap-2 text-accent">
        <TrendingUp className="size-4" />
        <span className="text-[10px] font-mono uppercase tracking-[0.3em]">{label}</span>
      </div>
      <div className="relative mt-4">
        <p className="font-display font-semibold tabular-nums leading-none text-[clamp(2.25rem,8vw,3.25rem)] text-gradient-ember">
          <AnimatedNumber value={value} prefix="$" decimals={2} />
        </p>
        <p className="mt-2 text-xs font-mono uppercase tracking-widest text-muted-foreground">{sub}</p>
      </div>
    </motion.div>
  );
}

function MiniStat({ label, value, icon, i, tone, decimals = 0, prefix = "" }: { label: string; value: number; icon: React.ReactNode; i: number; tone?: string; decimals?: number; prefix?: string }) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 14 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.5, ease: EASE, delay: 0.08 * i }}
      whileHover={{ y: -3 }}
      className="card-elevated glass-reflect relative overflow-hidden rounded-2xl p-4 will-change-transform"
    >
      <div className="flex items-center gap-2 text-muted-foreground mb-2">
        <span className={tone ?? "text-accent"}>{icon}</span>
        <span className="text-[9px] font-mono uppercase tracking-[0.28em]">{label}</span>
      </div>
      <p className="text-2xl font-display font-semibold tabular-nums">
        <AnimatedNumber value={value} decimals={decimals} prefix={prefix} />
      </p>
    </motion.div>
  );
}

/* ---- System status engine ---- */
function StatusEngine({ conn, latency, queue, lastSync }: { conn: ConnState; latency: number | null; queue: number; lastSync: number | null }) {
  const items = [
    {
      label: "Realtime",
      ok: conn === "live",
      pending: conn === "connecting",
      icon: conn === "error" ? WifiOff : Wifi,
      value: conn === "live" ? "Connected" : conn === "connecting" ? "Linking…" : "Reconnecting",
    },
    { label: "Database", ok: conn !== "error", pending: false, icon: Database, value: conn === "error" ? "Degraded" : "Healthy" },
    { label: "Latency", ok: latency !== null && latency < 800, pending: latency === null, icon: Gauge, value: latency !== null ? `${latency}ms` : "—" },
    { label: "Queue", ok: true, pending: false, icon: RefreshCw, value: `${queue} buffered` },
  ];
  return (
    <div className="card-elevated glass-reflect rounded-2xl px-3 py-2.5 mb-4 flex flex-wrap items-center gap-x-5 gap-y-2">
      {items.map((it) => {
        const Icon = it.icon;
        const color = it.pending ? "text-amber-300" : it.ok ? "text-accent" : "text-rose-300";
        const dot = it.pending ? "bg-amber-400" : it.ok ? "bg-accent" : "bg-rose-400";
        return (
          <div key={it.label} className="flex items-center gap-2 min-w-0">
            <span className="relative inline-flex size-1.5">
              <span className={`absolute inline-flex rounded-full size-1.5 ${dot} ${it.ok && !it.pending ? "animate-signal" : ""}`} />
              <span className={`relative inline-flex rounded-full size-1.5 ${dot}`} />
            </span>
            <Icon className={`size-3.5 ${color}`} />
            <span className="text-[9px] font-mono uppercase tracking-[0.22em] text-muted-foreground">{it.label}</span>
            <span className="text-[10px] font-mono text-foreground/80">{it.value}</span>
          </div>
        );
      })}
      <div className="ml-auto text-[9px] font-mono uppercase tracking-[0.22em] text-muted-foreground">
        {lastSync ? `synced ${timeAgo(lastSync)}` : "syncing…"}
      </div>
    </div>
  );
}

const EMPTY_MESSAGES = [
  "Monitoring checkout activity across active regions.",
  "Awaiting inventory synchronization events.",
  "Realtime customer signals connected.",
  "Scanning order pipeline for new transactions.",
  "Listening for low-stock thresholds across catalogue.",
];

function loadFilter(): Set<EventKind> {
  if (typeof window === "undefined") return new Set(ALL_KINDS);
  try {
    const raw = localStorage.getItem(FILTER_STORAGE_KEY);
    if (!raw) return new Set(ALL_KINDS);
    const arr = JSON.parse(raw) as EventKind[];
    const valid = arr.filter((k) => ALL_KINDS.includes(k));
    return valid.length ? new Set(valid) : new Set(ALL_KINDS);
  } catch {
    return new Set(ALL_KINDS);
  }
}

function AdminLivePage() {
  const [events, setEvents] = useState<LiveEvent[]>([]);
  const [paused, setPaused] = useState(false);
  const [filter, setFilter] = useState<Set<EventKind>>(loadFilter);
  const [, force] = useState(0);
  const [conn, setConn] = useState<ConnState>("connecting");
  const [latency, setLatency] = useState<number | null>(null);
  const [lastSync, setLastSync] = useState<number | null>(null);
  const [unread, setUnread] = useState(0);
  const [metrics, setMetrics] = useState<LiveMetrics | null>(null);
  const [emptyIdx, setEmptyIdx] = useState(0);

  const pausedRef = useRef(paused);
  pausedRef.current = paused;
  const channelStatus = useRef<Record<string, boolean>>({});

  /* timestamps refresh */
  useEffect(() => {
    const t = setInterval(() => force((n) => n + 1), 10_000);
    return () => clearInterval(t);
  }, []);

  /* rotating intelligent empty-state copy */
  useEffect(() => {
    const t = setInterval(() => setEmptyIdx((i) => (i + 1) % EMPTY_MESSAGES.length), 4_000);
    return () => clearInterval(t);
  }, []);

  /* persist filter */
  useEffect(() => {
    try { localStorage.setItem(FILTER_STORAGE_KEY, JSON.stringify([...filter])); } catch { /* ignore */ }
  }, [filter]);

  /* real backend metrics: seed + poll + latency probe */
  const loadMetrics = useCallback(async () => {
    const t0 = performance.now();
    try {
      const m = await fetchLiveMetrics();
      setMetrics(m);
      setLatency(Math.round(performance.now() - t0));
      setLastSync(Date.now());
    } catch {
      setConn("error");
    }
  }, []);

  useEffect(() => {
    loadMetrics();
    const t = setInterval(loadMetrics, 25_000);
    return () => clearInterval(t);
  }, [loadMetrics]);

  /* historical backfill — merge recent rows from every system into the stream */
  useEffect(() => {
    let alive = true;
    fetchActivityHistory(40)
      .then((hist) => { if (alive) setEvents((prev) => (prev.length ? prev : hist)); })
      .catch(() => { /* ignore — realtime will populate */ });
    return () => { alive = false; };
  }, []);

  const push = useCallback((e: Omit<LiveEvent, "id" | "at" | "severity"> & { at?: number }) => {
    if (pausedRef.current) { setUnread((u) => u + 1); return; }
    setEvents((prev) => [
      { id: crypto.randomUUID(), at: e.at ?? Date.now(), severity: KIND_META[e.kind].severity, ...e },
      ...prev,
    ].slice(0, 200));
  }, []);

  /* live metric increments from the realtime stream (optimistic, then reconciled by poll) */
  const bumpMetric = useCallback((patch: Partial<LiveMetrics>) => {
    setMetrics((m) => (m ? { ...m, ...Object.fromEntries(Object.entries(patch).map(([k, v]) => [k, (m[k as keyof LiveMetrics] as number) + (v as number)])) } as LiveMetrics : m));
  }, []);

  useEffect(() => {
    const markStatus = (name: string, ok: boolean) => {
      channelStatus.current[name] = ok;
      const all = Object.values(channelStatus.current);
      if (all.some((v) => v === false)) setConn("error");
      else if (all.length >= 12) setConn("live");
    };

    const sub = (name: string, builder: (ch: ReturnType<typeof supabase.channel>) => ReturnType<typeof supabase.channel>) => {
      const ch = builder(supabase.channel(name)).subscribe((status) => {
        if (status === "SUBSCRIBED") markStatus(name, true);
        else if (status === "CHANNEL_ERROR" || status === "TIMED_OUT" || status === "CLOSED") markStatus(name, false);
      });
      return ch;
    };

    const channels = [
      sub("live-orders", (ch) => ch
        .on("postgres_changes", { event: "INSERT", schema: "public", table: "orders" }, (p) => {
          const o = p.new as { id: string; total: number; currency: string };
          push({ kind: "order_new", title: `Order #${o.id.slice(0, 8)} placed`, body: `${o.currency} ${Number(o.total).toFixed(2)}`, amount: Number(o.total), link: `/orders/${o.id}` });
          bumpMetric({ ordersToday: 1, ordersPending: 1, revenueToday: Number(o.total) });
        })
        .on("postgres_changes", { event: "UPDATE", schema: "public", table: "orders" }, (p) => {
          const o = p.new as { id: string; status: string };
          const old = p.old as { status?: string };
          if (old?.status === o.status) return;
          push({ kind: "order_update", title: `Order #${o.id.slice(0, 8)} → ${o.status}`, link: `/orders/${o.id}` });
        })
      ),

      sub("live-rec-events", (ch) => ch
        .on("postgres_changes", { event: "INSERT", schema: "public", table: "recommendation_events" }, (p) => {
          const e = p.new as { event_type: string; product_slug: string | null; query: string | null };
          const kind: EventKind | null =
            e.event_type === "add_to_cart" ? "cart" :
            e.event_type === "wishlist" ? "wishlist" :
            e.event_type === "purchase" ? "purchase" :
            e.event_type === "view" ? "view" : null;
          if (!kind) return;
          push({
            kind,
            title: kind === "view" ? `Viewed ${e.product_slug ?? "product"}` :
                   kind === "cart" ? `Added ${e.product_slug ?? "item"} to cart` :
                   kind === "wishlist" ? `Wishlisted ${e.product_slug ?? "item"}` :
                   `Purchase signal: ${e.product_slug ?? ""}`,
            link: e.product_slug ? `/products/${e.product_slug}` : undefined,
          });
        })
      ),

      sub("live-returns", (ch) => ch
        .on("postgres_changes", { event: "INSERT", schema: "public", table: "returns" }, (p) => {
          const r = p.new as { id: string; reason: string };
          push({ kind: "return", title: "Return requested", body: r.reason, link: "/admin-returns" });
          bumpMetric({ returnsOpen: 1 });
        })
      ),

      sub("live-subscribers", (ch) => ch
        .on("postgres_changes", { event: "INSERT", schema: "public", table: "newsletter_subscribers" }, (p) => {
          const s = p.new as { email: string };
          push({ kind: "subscriber", title: `New subscriber`, body: s.email });
          bumpMetric({ subscribersToday: 1 });
        })
      ),

      sub("live-stock", (ch) => ch
        .on("postgres_changes", { event: "UPDATE", schema: "public", table: "products" }, (p) => {
          const n = p.new as { name: string; slug: string; stock_quantity: number; low_stock_threshold: number };
          const o = p.old as { stock_quantity?: number };
          if (n.stock_quantity > n.low_stock_threshold) return;
          if (o?.stock_quantity !== undefined && o.stock_quantity <= n.low_stock_threshold) return;
          push({ kind: "low_stock", title: `Low stock: ${n.name}`, body: `${n.stock_quantity} units left (threshold ${n.low_stock_threshold})`, link: `/admin-inventory` });
          bumpMetric({ lowStockNow: 1 });
        })
      ),

      sub("live-admin-logs", (ch) => ch
        .on("postgres_changes", { event: "INSERT", schema: "public", table: "admin_activity_logs" }, (p) => {
          const a = p.new as { action: string; entity_type?: string | null; entity_id?: string | null };
          push({ kind: "admin", title: a.action, body: a.entity_type ? `${a.entity_type}${a.entity_id ? `:${a.entity_id.slice(0, 8)}` : ""}` : undefined, link: "/admin-activity" });
        })
      ),

      sub("live-payments", (ch) => ch
        .on("postgres_changes", { event: "INSERT", schema: "public", table: "payments" }, (p) => {
          const pay = p.new as { order_id: string | null; amount: number; currency: string; status: string; method: string | null };
          const st = String(pay.status ?? "").toLowerCase();
          const failed = ["failed", "declined", "error", "cancelled", "canceled"].includes(st);
          push({
            kind: failed ? "payment_failed" : "payment",
            title: failed ? `Payment failed · ${pay.method ?? "card"}` : `Payment captured · ${pay.method ?? "card"}`,
            body: `${pay.currency ?? ""} ${Number(pay.amount).toFixed(2)}`,
            amount: failed ? undefined : Number(pay.amount),
            link: pay.order_id ? `/orders/${pay.order_id}` : undefined,
          });
        })
      ),

      sub("live-refunds", (ch) => ch
        .on("postgres_changes", { event: "INSERT", schema: "public", table: "refunds" }, (p) => {
          const r = p.new as { order_id: string | null; amount: number; currency: string; status: string; reason: string | null };
          push({ kind: "refund", title: `Refund ${r.status ?? "issued"}`, body: `${r.currency ?? ""} ${Number(r.amount).toFixed(2)}${r.reason ? ` · ${r.reason}` : ""}`, link: r.order_id ? `/orders/${r.order_id}` : "/admin-returns" });
        })
      ),

      sub("live-reviews", (ch) => ch
        .on("postgres_changes", { event: "INSERT", schema: "public", table: "product_reviews" }, (p) => {
          const r = p.new as { product_slug: string | null; rating: number; title: string | null };
          push({ kind: "review", title: `${r.rating}★ review${r.title ? ` · ${r.title}` : ""}`, body: r.product_slug ?? undefined, link: r.product_slug ? `/products/${r.product_slug}` : undefined });
        })
      ),

      sub("live-support", (ch) => ch
        .on("postgres_changes", { event: "INSERT", schema: "public", table: "support_tickets" }, (p) => {
          const t = p.new as { subject: string | null; category: string | null; priority: string | null };
          push({ kind: "support", title: t.subject || "New support ticket", body: `${t.category ?? "general"} · ${t.priority ?? "normal"}`, link: "/admin-support" });
        })
      ),

      sub("live-ai-recs", (ch) => ch
        .on("postgres_changes", { event: "INSERT", schema: "public", table: "ai_recommendations" }, (p) => {
          const r = p.new as { title: string | null; category: string | null; priority: string | null; deep_link: string | null };
          push({ kind: "ai_rec", title: r.title || "AI recommendation", body: `${r.category ?? "ops"} · ${r.priority ?? "normal"} priority`, link: r.deep_link || "/admin-ai-operations" });
        })
      ),

      sub("live-automations", (ch) => ch
        .on("postgres_changes", { event: "INSERT", schema: "public", table: "automation_executions" }, (p) => {
          const a = p.new as { trigger_key: string | null; status: string | null; matched_count: number | null; action_taken: string | null; summary: string | null; error: string | null };
          const failed = String(a.status ?? "").toUpperCase().includes("FAIL");
          push({
            kind: failed ? "automation_failed" : "automation",
            title: failed ? `Automation failed · ${a.trigger_key ?? ""}` : (a.action_taken || a.summary || `Automation ran · ${a.trigger_key ?? ""}`),
            body: failed ? (a.error ?? undefined) : `${a.matched_count ?? 0} matched`,
            link: "/admin-marketing-automation?view=health",
          });
        })
      ),
    ];

    return () => { channels.forEach((c) => supabase.removeChannel(c)); };
  }, [push, bumpMetric]);

  const visible = useMemo(() => events.filter((e) => filter.has(e.kind)), [events, filter]);

  const counts = useMemo(() => {
    const c: Record<EventKind, number> = Object.fromEntries(ALL_KINDS.map((k) => [k, 0])) as Record<EventKind, number>;
    for (const e of events) c[e.kind]++;
    return c;
  }, [events]);

  const toggle = (k: EventKind) => {
    setFilter((prev) => {
      const next = new Set(prev);
      if (next.has(k)) next.delete(k); else next.add(k);
      return next;
    });
  };

  const allOn = filter.size === ALL_KINDS.length;

  const resume = () => { setPaused(false); setUnread(0); };

  return (
    <AdminShell title="Live Activity" subtitle="Realtime stream of orders, customer signals, and system alerts">
      <Atmosphere />

      <StatusEngine conn={conn} latency={latency} queue={paused ? unread : 0} lastSync={lastSync} />

      {/* Asymmetric analytics composition — featured Revenue widget + secondary cards */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 mb-8">
        <div className="col-span-2 lg:col-span-2 row-span-2">
          <FeaturedStat label="Revenue · today" value={metrics?.revenueToday ?? 0} sub={`${metrics?.ordersToday ?? 0} orders · ${metrics?.ordersPending ?? 0} pending`} />
        </div>
        <MiniStat i={0} label="Orders today" value={metrics?.ordersToday ?? 0} icon={<ShoppingBag className="size-4" />} />
        <MiniStat i={1} label="Active sessions" value={metrics?.activeSessions ?? 0} icon={<Users className="size-4" />} tone="text-teal-300" />
        <MiniStat i={2} label="Low-stock" value={metrics?.lowStockNow ?? 0} icon={<AlertTriangle className="size-4" />} tone="text-rose-300" />
        <MiniStat i={3} label="Signups today" value={metrics?.subscribersToday ?? 0} icon={<UserPlus className="size-4" />} tone="text-violet-300" />
      </div>

      {/* Ambient divider */}
      <div className="relative h-px mb-7" style={{ background: "linear-gradient(90deg, transparent, oklch(0.74 0.19 49 / 0.35), transparent)" }} />

      {/* Operator controls */}
      <div className="flex flex-wrap items-center gap-2 mb-5">
        <motion.button
          whileTap={{ scale: 0.94 }}
          onClick={() => (paused ? resume() : setPaused(true))}
          className={`relative inline-flex items-center gap-2 px-3.5 py-1.5 rounded-full text-[11px] font-medium border backdrop-blur-md transition-colors ${
            paused ? "bg-amber-500/10 border-amber-500/30 text-amber-300" : "bg-accent/10 border-accent/30 text-accent"
          }`}
        >
          {paused ? <><Play className="size-3" /> Resume</> : <><Pause className="size-3" /> Pause</>}
          {paused && unread > 0 && (
            <span className="absolute -top-1.5 -right-1.5 grid place-items-center min-w-[18px] h-[18px] px-1 rounded-full bg-accent text-[9px] font-mono text-accent-foreground">{unread > 99 ? "99+" : unread}</span>
          )}
        </motion.button>
        <motion.button
          whileTap={{ scale: 0.94 }}
          onClick={() => { setEvents([]); setUnread(0); }}
          className="inline-flex items-center gap-2 px-3.5 py-1.5 rounded-full text-[11px] font-medium border border-border bg-white/[0.02] backdrop-blur-md hover:bg-white/5 transition-colors"
        >
          <Trash2 className="size-3" /> Clear
        </motion.button>
        <motion.button
          whileTap={{ scale: 0.94 }}
          onClick={loadMetrics}
          className="inline-flex items-center gap-2 px-3.5 py-1.5 rounded-full text-[11px] font-medium border border-border bg-white/[0.02] backdrop-blur-md hover:bg-white/5 transition-colors"
        >
          <RefreshCw className="size-3" /> Sync
        </motion.button>
        <button
          onClick={() => setFilter(allOn ? new Set() : new Set(ALL_KINDS))}
          className="text-[9px] font-mono uppercase tracking-[0.28em] text-muted-foreground inline-flex items-center gap-1.5 ml-1 hover:text-foreground transition-colors"
        >
          <Filter className="size-3" /> {allOn ? "Clear filters" : "Select all"}
        </button>
      </div>

      {/* Premium muted filter chips */}
      <div className="flex flex-wrap gap-2 mb-7">
        {ALL_KINDS.map((k) => {
          const m = KIND_META[k];
          const active = filter.has(k);
          return (
            <motion.button
              key={k}
              whileTap={{ scale: 0.93 }}
              whileHover={{ y: -1 }}
              transition={{ type: "spring", stiffness: 500, damping: 28 }}
              onClick={() => toggle(k)}
              className={`relative inline-flex items-center gap-1.5 text-[10px] font-mono uppercase tracking-[0.18em] px-3 py-1.5 rounded-full border backdrop-blur-md transition-colors ${
                active ? `${m.fg} bg-white/[0.04]` : "text-muted-foreground/70 border-border hover:text-foreground"
              }`}
              style={active ? { borderColor: m.glow, boxShadow: `0 0 18px -8px ${m.glow}` } : undefined}
            >
              <span className={`size-1.5 rounded-full ${active ? m.dot : "bg-muted-foreground/40"}`} />
              {m.label}
              {counts[k] > 0 && <span className="ml-0.5 text-muted-foreground/60">{counts[k]}</span>}
            </motion.button>
          );
        })}
      </div>

      {/* Cinematic live-stream console */}
      <div className="relative rounded-3xl overflow-hidden card-elevated glass-reflect noise-layer">
        {/* Ambient texture + scan-line */}
        <div className="pointer-events-none absolute inset-0 grid-texture opacity-50" />
        <div className="pointer-events-none absolute inset-x-0 top-0 h-24 animate-scanline" style={{ background: "linear-gradient(180deg, oklch(0.74 0.19 49 / 0.12), transparent)" }} />
        <div className="pointer-events-none absolute -top-24 left-1/2 -translate-x-1/2 size-72 rounded-full bg-accent/10 blur-3xl animate-ambient" />

        {/* Console header */}
        <div className="relative flex items-center justify-between px-5 py-3.5 border-b border-border/60 animate-sheen">
          <div className="flex items-center gap-2.5">
            <span className="relative inline-flex size-2.5">
              <span className={`absolute inline-flex rounded-full size-2.5 ${paused ? "bg-amber-400" : conn === "error" ? "bg-rose-400" : "bg-accent animate-signal"}`} />
              <span className={`relative inline-flex rounded-full size-2.5 ${paused ? "bg-amber-400" : conn === "error" ? "bg-rose-400" : "bg-accent"}`} />
            </span>
            <span className="text-[10px] font-mono uppercase tracking-[0.28em] text-muted-foreground">
              {paused ? "Stream paused" : conn === "error" ? "Reconnecting" : "Live stream"} · {visible.length} visible
            </span>
          </div>
          <Radio className={`size-4 ${paused || conn === "error" ? "text-muted-foreground" : "text-accent animate-glow"}`} />
        </div>

        {/* Stream body */}
        <div className="relative max-h-[68vh] overflow-y-auto scrollbar-hide [content-visibility:auto]">
          {visible.length === 0 ? (
            <div className="px-6 py-20 text-center">
              <motion.div
                animate={{ scale: [1, 1.06, 1], opacity: [0.6, 1, 0.6] }}
                transition={{ duration: 3, repeat: Infinity, ease: "easeInOut" }}
                className="mx-auto mb-5 grid place-items-center size-16 rounded-2xl bg-accent/10 border border-accent/20"
              >
                <Radio className="size-6 text-accent" />
              </motion.div>
              <p className="text-sm text-foreground/90 font-medium">
                {conn === "live" ? "Console online — channels synchronized" : conn === "error" ? "Re-establishing realtime link…" : "Establishing realtime link…"}
              </p>
              <AnimatePresence mode="wait">
                <motion.p
                  key={emptyIdx}
                  initial={{ opacity: 0, y: 6 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, y: -6 }}
                  transition={{ duration: 0.4 }}
                  className="mt-1.5 text-xs text-muted-foreground max-w-sm mx-auto"
                >
                  {EMPTY_MESSAGES[emptyIdx]}
                </motion.p>
              </AnimatePresence>
              <div className="mt-6 flex items-center justify-center gap-1.5">
                {[0, 1, 2].map((d) => (
                  <motion.span
                    key={d}
                    className="size-1.5 rounded-full bg-accent/60"
                    animate={{ opacity: [0.2, 1, 0.2] }}
                    transition={{ duration: 1.4, repeat: Infinity, delay: d * 0.2 }}
                  />
                ))}
              </div>
            </div>
          ) : (
            <div className="divide-y divide-border/40">
              <AnimatePresence initial={false}>
                {visible.map((e) => {
                  const m = KIND_META[e.kind];
                  const Icon = m.icon;
                  const sevBar =
                    e.severity === "critical" ? "bg-rose-400" :
                    e.severity === "warning" ? "bg-amber-400" :
                    e.severity === "success" ? "bg-accent" : "bg-sky-400/60";
                  const row = (
                    <div className="relative flex items-start gap-3 px-4 sm:px-5 py-3.5 hover:bg-white/[0.03] transition-colors">
                      <span className={`absolute left-0 top-2 bottom-2 w-0.5 rounded-full ${sevBar}`} />
                      <div
                        className="size-9 rounded-xl grid place-items-center shrink-0 bg-white/[0.03] border border-border/60"
                        style={{ boxShadow: `0 0 16px -8px ${m.glow}` }}
                      >
                        <Icon className={`size-4 ${m.fg}`} />
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2">
                          <span className="text-[9px] font-mono uppercase tracking-[0.22em] text-muted-foreground">{m.label}</span>
                          <span className="text-[9px] font-mono text-muted-foreground/50">· {timeAgo(e.at)}</span>
                        </div>
                        <div className="text-sm font-medium truncate mt-0.5">{e.title}</div>
                        {e.body && <div className="text-xs text-muted-foreground truncate">{e.body}</div>}
                      </div>
                      {e.amount !== undefined && (
                        <div className="text-sm font-mono text-accent shrink-0 tabular-nums">+${e.amount.toFixed(2)}</div>
                      )}
                    </div>
                  );
                  return (
                    <motion.div
                      key={e.id}
                      layout
                      initial={{ opacity: 0, y: -8, filter: "blur(6px)" }}
                      animate={{ opacity: 1, y: 0, filter: "blur(0px)" }}
                      exit={{ opacity: 0, height: 0 }}
                      transition={{ duration: 0.4, ease: EASE }}
                    >
                      {e.link ? <a href={e.link} className="block">{row}</a> : row}
                    </motion.div>
                  );
                })}
              </AnimatePresence>
            </div>
          )}
        </div>
      </div>
    </AdminShell>
  );
}
