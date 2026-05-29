import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useMemo, useRef, useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import {
  ShoppingBag, UserPlus, Heart, Eye, RotateCcw, AlertTriangle,
  Activity, Pause, Play, Trash2, Filter, Radio, TrendingUp,
} from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { AdminShell } from "@/components/admin/AdminShell";

export const Route = createFileRoute("/admin-live")({
  head: () => ({
    meta: [
      { title: "Live Activity — Admin" },
      { name: "description", content: "Realtime stream of orders, customer events, and system alerts." },
    ],
  }),
  component: AdminLivePage,
});

type EventKind =
  | "order_new" | "order_update"
  | "signup" | "subscriber"
  | "wishlist" | "cart" | "view" | "purchase"
  | "return" | "low_stock" | "admin";

type LiveEvent = {
  id: string;
  kind: EventKind;
  title: string;
  body?: string;
  amount?: number;
  link?: string;
  at: number;
};

/* Refined, muted operator palette — amber / teal / crimson / violet / neutral */
const KIND_META: Record<EventKind, { label: string; icon: typeof ShoppingBag; fg: string; dot: string; glow: string }> = {
  order_new:    { label: "New Order",       icon: ShoppingBag,   fg: "text-accent",       dot: "bg-accent",            glow: "oklch(0.74 0.19 49 / 0.4)" },
  order_update: { label: "Order Update",    icon: ShoppingBag,   fg: "text-teal-300",     dot: "bg-teal-400",          glow: "oklch(0.78 0.12 195 / 0.35)" },
  signup:       { label: "Signup",          icon: UserPlus,      fg: "text-violet-300",   dot: "bg-violet-400",        glow: "oklch(0.6 0.16 290 / 0.35)" },
  subscriber:   { label: "Subscriber",      icon: UserPlus,      fg: "text-violet-300",   dot: "bg-violet-400",        glow: "oklch(0.6 0.16 290 / 0.35)" },
  wishlist:     { label: "Wishlist",        icon: Heart,         fg: "text-rose-300",     dot: "bg-rose-400",          glow: "oklch(0.65 0.16 15 / 0.32)" },
  cart:         { label: "Add to Cart",     icon: ShoppingBag,   fg: "text-accent",       dot: "bg-accent",            glow: "oklch(0.74 0.19 49 / 0.35)" },
  view:         { label: "Product View",    icon: Eye,           fg: "text-muted-foreground", dot: "bg-muted-foreground", glow: "oklch(0.7 0.018 260 / 0.25)" },
  purchase:     { label: "Purchase Signal", icon: ShoppingBag,   fg: "text-teal-300",     dot: "bg-teal-400",          glow: "oklch(0.78 0.12 195 / 0.32)" },
  return:       { label: "Return",          icon: RotateCcw,     fg: "text-amber-300",    dot: "bg-amber-400",         glow: "oklch(0.78 0.15 70 / 0.32)" },
  low_stock:    { label: "Low Stock",       icon: AlertTriangle, fg: "text-rose-300",     dot: "bg-rose-400",          glow: "oklch(0.65 0.2 25 / 0.35)" },
  admin:        { label: "Admin Action",    icon: Activity,      fg: "text-sky-300",      dot: "bg-sky-400",           glow: "oklch(0.7 0.13 230 / 0.32)" },
};

const ALL_KINDS = Object.keys(KIND_META) as EventKind[];

function timeAgo(ms: number): string {
  const d = Date.now() - ms;
  if (d < 5_000) return "just now";
  if (d < 60_000) return `${Math.floor(d / 1000)}s ago`;
  if (d < 3_600_000) return `${Math.floor(d / 60_000)}m ago`;
  return `${Math.floor(d / 3_600_000)}h ago`;
}

const EASE = [0.16, 1, 0.3, 1] as const;

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

/* ---- Featured / secondary analytics widgets ---- */
function FeaturedStat({ label, value, sub }: { label: string; value: string; sub: string }) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 16 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.6, ease: EASE }}
      whileHover={{ y: -3 }}
      className="card-ambient glass-reflect noise-layer relative overflow-hidden rounded-3xl p-6 sm:p-7 row-span-2 flex flex-col justify-between min-h-[180px]"
    >
      <div className="absolute -top-20 -right-16 size-56 rounded-full bg-accent/15 blur-3xl animate-ambient" />
      <div className="relative flex items-center gap-2 text-accent">
        <TrendingUp className="size-4" />
        <span className="text-[10px] font-mono uppercase tracking-[0.3em]">{label}</span>
      </div>
      <div className="relative mt-4">
        <p className="font-display font-semibold tabular-nums leading-none text-[clamp(2.25rem,8vw,3.25rem)] text-gradient-ember">{value}</p>
        <p className="mt-2 text-xs font-mono uppercase tracking-widest text-muted-foreground">{sub}</p>
      </div>
    </motion.div>
  );
}

function MiniStat({ label, value, icon, i, tone }: { label: string; value: string; icon: React.ReactNode; i: number; tone?: string }) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 14 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.5, ease: EASE, delay: 0.08 * i }}
      whileHover={{ y: -3 }}
      className="card-elevated glass-reflect relative overflow-hidden rounded-2xl p-4"
    >
      <div className="flex items-center gap-2 text-muted-foreground mb-2">
        <span className={tone ?? "text-accent"}>{icon}</span>
        <span className="text-[9px] font-mono uppercase tracking-[0.28em]">{label}</span>
      </div>
      <p className="text-2xl font-display font-semibold tabular-nums">{value}</p>
    </motion.div>
  );
}

function AdminLivePage() {
  const [events, setEvents] = useState<LiveEvent[]>([]);
  const [paused, setPaused] = useState(false);
  const [filter, setFilter] = useState<Set<EventKind>>(new Set(ALL_KINDS));
  const [, force] = useState(0);
  const pausedRef = useRef(paused);
  pausedRef.current = paused;

  useEffect(() => {
    const t = setInterval(() => force((n) => n + 1), 15_000);
    return () => clearInterval(t);
  }, []);

  const push = (e: Omit<LiveEvent, "id" | "at"> & { at?: number }) => {
    if (pausedRef.current) return;
    setEvents((prev) => [
      { id: crypto.randomUUID(), at: e.at ?? Date.now(), ...e },
      ...prev,
    ].slice(0, 200));
  };

  useEffect(() => {
    const channels = [
      supabase.channel("live-orders")
        .on("postgres_changes", { event: "INSERT", schema: "public", table: "orders" }, (p) => {
          const o = p.new as { id: string; total: number; currency: string };
          push({
            kind: "order_new",
            title: `Order #${o.id.slice(0, 8)} placed`,
            body: `${o.currency} ${Number(o.total).toFixed(2)}`,
            amount: Number(o.total),
            link: `/orders/${o.id}`,
          });
        })
        .on("postgres_changes", { event: "UPDATE", schema: "public", table: "orders" }, (p) => {
          const o = p.new as { id: string; status: string };
          const old = p.old as { status?: string };
          if (old?.status === o.status) return;
          push({
            kind: "order_update",
            title: `Order #${o.id.slice(0, 8)} → ${o.status}`,
            link: `/orders/${o.id}`,
          });
        })
        .subscribe(),

      supabase.channel("live-rec-events")
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
        .subscribe(),

      supabase.channel("live-returns")
        .on("postgres_changes", { event: "INSERT", schema: "public", table: "returns" }, (p) => {
          const r = p.new as { id: string; reason: string };
          push({ kind: "return", title: "Return requested", body: r.reason, link: "/admin-returns" });
        })
        .subscribe(),

      supabase.channel("live-subscribers")
        .on("postgres_changes", { event: "INSERT", schema: "public", table: "newsletter_subscribers" }, (p) => {
          const s = p.new as { email: string };
          push({ kind: "subscriber", title: `New subscriber`, body: s.email });
        })
        .subscribe(),

      supabase.channel("live-stock")
        .on("postgres_changes", { event: "UPDATE", schema: "public", table: "products" }, (p) => {
          const n = p.new as { name: string; slug: string; stock_quantity: number; low_stock_threshold: number };
          const o = p.old as { stock_quantity?: number };
          if (n.stock_quantity > n.low_stock_threshold) return;
          if (o?.stock_quantity !== undefined && o.stock_quantity <= n.low_stock_threshold) return;
          push({
            kind: "low_stock",
            title: `Low stock: ${n.name}`,
            body: `${n.stock_quantity} units left (threshold ${n.low_stock_threshold})`,
            link: `/admin-inventory`,
          });
        })
        .subscribe(),

      supabase.channel("live-admin-logs")
        .on("postgres_changes", { event: "INSERT", schema: "public", table: "admin_activity_logs" }, (p) => {
          const a = p.new as { action: string; entity_type?: string | null; entity_id?: string | null };
          push({
            kind: "admin",
            title: a.action,
            body: a.entity_type ? `${a.entity_type}${a.entity_id ? `:${a.entity_id.slice(0, 8)}` : ""}` : undefined,
            link: "/admin-activity",
          });
        })
        .subscribe(),
    ];

    return () => { channels.forEach((c) => supabase.removeChannel(c)); };
  }, []);

  const visible = useMemo(() => events.filter((e) => filter.has(e.kind)), [events, filter]);

  const counts = useMemo(() => {
    const c: Record<EventKind, number> = Object.fromEntries(ALL_KINDS.map((k) => [k, 0])) as Record<EventKind, number>;
    for (const e of events) c[e.kind]++;
    return c;
  }, [events]);

  const revenueLastHour = useMemo(() => {
    const hr = Date.now() - 3_600_000;
    return events.filter((e) => e.kind === "order_new" && e.at >= hr).reduce((s, e) => s + (e.amount ?? 0), 0);
  }, [events]);

  const toggle = (k: EventKind) => {
    setFilter((prev) => {
      const next = new Set(prev);
      if (next.has(k)) next.delete(k); else next.add(k);
      return next;
    });
  };

  return (
    <AdminShell title="Live Activity" subtitle="Realtime stream of orders, customer signals, and system alerts">
      <Atmosphere />

      {/* Asymmetric analytics composition — featured Revenue widget + secondary cards */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 mb-8">
        <div className="col-span-2 lg:col-span-2 row-span-2">
          <FeaturedStat label="Revenue · last hour" value={`$${revenueLastHour.toFixed(2)}`} sub={`${counts.order_new} orders this session`} />
        </div>
        <MiniStat i={0} label="Events captured" value={events.length.toString()} icon={<Activity className="size-4" />} />
        <MiniStat i={1} label="Orders" value={counts.order_new.toString()} icon={<ShoppingBag className="size-4" />} />
        <MiniStat i={2} label="Low-stock" value={counts.low_stock.toString()} icon={<AlertTriangle className="size-4" />} tone="text-rose-300" />
        <MiniStat i={3} label="Signups" value={(counts.signup + counts.subscriber).toString()} icon={<UserPlus className="size-4" />} tone="text-violet-300" />
      </div>

      {/* Ambient divider */}
      <div className="relative h-px mb-7" style={{ background: "linear-gradient(90deg, transparent, oklch(0.74 0.19 49 / 0.35), transparent)" }} />

      {/* Operator controls */}
      <div className="flex flex-wrap items-center gap-2 mb-5">
        <motion.button
          whileTap={{ scale: 0.94 }}
          onClick={() => setPaused((p) => !p)}
          className={`inline-flex items-center gap-2 px-3.5 py-1.5 rounded-full text-[11px] font-medium border backdrop-blur-md transition-colors ${
            paused ? "bg-amber-500/10 border-amber-500/30 text-amber-300" : "bg-accent/10 border-accent/30 text-accent"
          }`}
        >
          {paused ? <><Play className="size-3" /> Resume</> : <><Pause className="size-3" /> Pause</>}
        </motion.button>
        <motion.button
          whileTap={{ scale: 0.94 }}
          onClick={() => setEvents([])}
          className="inline-flex items-center gap-2 px-3.5 py-1.5 rounded-full text-[11px] font-medium border border-border bg-white/[0.02] backdrop-blur-md hover:bg-white/5 transition-colors"
        >
          <Trash2 className="size-3" /> Clear
        </motion.button>
        <div className="text-[9px] font-mono uppercase tracking-[0.28em] text-muted-foreground inline-flex items-center gap-1.5 ml-1">
          <Filter className="size-3" /> Filter
        </div>
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
              <span className={`absolute inline-flex rounded-full size-2.5 ${paused ? "bg-amber-400" : "bg-accent animate-signal"}`} />
              <span className={`relative inline-flex rounded-full size-2.5 ${paused ? "bg-amber-400" : "bg-accent"}`} />
            </span>
            <span className="text-[10px] font-mono uppercase tracking-[0.28em] text-muted-foreground">
              {paused ? "Stream paused" : "Live stream"} · {visible.length} visible
            </span>
          </div>
          <Radio className={`size-4 ${paused ? "text-muted-foreground" : "text-accent animate-glow"}`} />
        </div>

        {/* Stream body */}
        <div className="relative max-h-[68vh] overflow-y-auto scrollbar-hide">
          {visible.length === 0 ? (
            <div className="px-6 py-20 text-center">
              <motion.div
                animate={{ scale: [1, 1.06, 1], opacity: [0.6, 1, 0.6] }}
                transition={{ duration: 3, repeat: Infinity, ease: "easeInOut" }}
                className="mx-auto mb-5 grid place-items-center size-16 rounded-2xl bg-accent/10 border border-accent/20"
              >
                <Radio className="size-6 text-accent" />
              </motion.div>
              <p className="text-sm text-foreground/90 font-medium">Console online — awaiting signals</p>
              <p className="mt-1.5 text-xs text-muted-foreground max-w-sm mx-auto">
                Any new order, signup, cart action or low-stock alert appears here the instant it happens.
              </p>
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
                  const row = (
                    <div className="flex items-start gap-3 px-4 sm:px-5 py-3.5 hover:bg-white/[0.03] transition-colors">
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
