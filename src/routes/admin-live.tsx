import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useMemo, useRef, useState } from "react";
import {
  ShoppingBag, UserPlus, Heart, Eye, RotateCcw, AlertTriangle,
  Activity, Pause, Play, Trash2, Filter,
} from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { AdminShell } from "@/components/admin/AdminShell";
import { KpiCard } from "@/components/admin/KpiCard";

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

const KIND_META: Record<EventKind, { label: string; icon: typeof ShoppingBag; tone: string }> = {
  order_new: { label: "New Order", icon: ShoppingBag, tone: "text-emerald-400 bg-emerald-500/10" },
  order_update: { label: "Order Update", icon: ShoppingBag, tone: "text-sky-400 bg-sky-500/10" },
  signup: { label: "Signup", icon: UserPlus, tone: "text-violet-400 bg-violet-500/10" },
  subscriber: { label: "Subscriber", icon: UserPlus, tone: "text-violet-400 bg-violet-500/10" },
  wishlist: { label: "Wishlist", icon: Heart, tone: "text-pink-400 bg-pink-500/10" },
  cart: { label: "Add to Cart", icon: ShoppingBag, tone: "text-amber-400 bg-amber-500/10" },
  view: { label: "Product View", icon: Eye, tone: "text-muted-foreground bg-white/5" },
  purchase: { label: "Purchase Signal", icon: ShoppingBag, tone: "text-emerald-400 bg-emerald-500/10" },
  return: { label: "Return", icon: RotateCcw, tone: "text-orange-400 bg-orange-500/10" },
  low_stock: { label: "Low Stock", icon: AlertTriangle, tone: "text-red-400 bg-red-500/10" },
  admin: { label: "Admin Action", icon: Activity, tone: "text-blue-400 bg-blue-500/10" },
};

const ALL_KINDS = Object.keys(KIND_META) as EventKind[];

function timeAgo(ms: number): string {
  const d = Date.now() - ms;
  if (d < 5_000) return "just now";
  if (d < 60_000) return `${Math.floor(d / 1000)}s ago`;
  if (d < 3_600_000) return `${Math.floor(d / 60_000)}m ago`;
  return `${Math.floor(d / 3_600_000)}h ago`;
}

function AdminLivePage() {
  const [events, setEvents] = useState<LiveEvent[]>([]);
  const [paused, setPaused] = useState(false);
  const [filter, setFilter] = useState<Set<EventKind>>(new Set(ALL_KINDS));
  const [, force] = useState(0);
  const pausedRef = useRef(paused);
  pausedRef.current = paused;

  // Tick every 15s to refresh "x seconds ago" labels
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
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-6">
        <KpiCard label="Events captured" value={events.length.toString()} icon={<Activity className="size-4" />} />
        <KpiCard label="Orders (session)" value={counts.order_new.toString()} icon={<ShoppingBag className="size-4" />} />
        <KpiCard label="Revenue last hour" value={`$${revenueLastHour.toFixed(2)}`} icon={<ShoppingBag className="size-4" />} />
        <KpiCard label="Low-stock alerts" value={counts.low_stock.toString()} icon={<AlertTriangle className="size-4" />} />
      </div>

      <div className="flex flex-wrap items-center gap-2 mb-4">
        <button
          onClick={() => setPaused((p) => !p)}
          className={`inline-flex items-center gap-2 px-3 py-1.5 rounded-full text-xs font-medium border transition-colors ${
            paused ? "bg-amber-500/10 border-amber-500/40 text-amber-300" : "bg-emerald-500/10 border-emerald-500/40 text-emerald-300"
          }`}
        >
          {paused ? <><Play className="size-3" /> Resume</> : <><Pause className="size-3" /> Pause</>}
        </button>
        <button
          onClick={() => setEvents([])}
          className="inline-flex items-center gap-2 px-3 py-1.5 rounded-full text-xs font-medium border border-border hover:bg-white/5"
        >
          <Trash2 className="size-3" /> Clear
        </button>
        <div className="text-[10px] font-mono uppercase tracking-widest text-muted-foreground inline-flex items-center gap-1 ml-2">
          <Filter className="size-3" /> Filter:
        </div>
        {ALL_KINDS.map((k) => {
          const m = KIND_META[k];
          const active = filter.has(k);
          return (
            <button
              key={k}
              onClick={() => toggle(k)}
              className={`text-[10px] font-mono uppercase tracking-widest px-2.5 py-1 rounded-full border transition-colors ${
                active ? `${m.tone} border-transparent` : "text-muted-foreground border-border hover:bg-white/5"
              }`}
            >
              {m.label}
            </button>
          );
        })}
      </div>

      <div className="rounded-2xl border border-border bg-card overflow-hidden">
        <div className="flex items-center justify-between px-4 py-3 border-b border-border">
          <div className="flex items-center gap-2">
            <span className={`size-2 rounded-full ${paused ? "bg-amber-400" : "bg-emerald-400 animate-pulse"}`} />
            <span className="text-xs font-mono uppercase tracking-widest text-muted-foreground">
              {paused ? "Stream paused" : "Live stream"} · {visible.length} visible
            </span>
          </div>
        </div>
        <div className="max-h-[70vh] overflow-y-auto divide-y divide-border">
          {visible.length === 0 ? (
            <div className="px-6 py-16 text-center text-sm text-muted-foreground">
              Waiting for events… any new order, signup, cart action or low-stock alert will appear here instantly.
            </div>
          ) : visible.map((e) => {
            const m = KIND_META[e.kind];
            const Icon = m.icon;
            const row = (
              <div className="flex items-start gap-3 px-4 py-3 hover:bg-white/[0.02] transition-colors">
                <div className={`size-9 rounded-full grid place-items-center shrink-0 ${m.tone}`}>
                  <Icon className="size-4" />
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <span className="text-[9px] font-mono uppercase tracking-widest text-muted-foreground">{m.label}</span>
                    <span className="text-[9px] font-mono text-muted-foreground/60">· {timeAgo(e.at)}</span>
                  </div>
                  <div className="text-sm font-medium truncate">{e.title}</div>
                  {e.body && <div className="text-xs text-muted-foreground truncate">{e.body}</div>}
                </div>
                {e.amount !== undefined && (
                  <div className="text-sm font-mono text-emerald-300 shrink-0">+${e.amount.toFixed(2)}</div>
                )}
              </div>
            );
            return e.link ? (
              <a key={e.id} href={e.link} className="block animate-fade-up">{row}</a>
            ) : (
              <div key={e.id} className="animate-fade-up">{row}</div>
            );
          })}
        </div>
      </div>
    </AdminShell>
  );
}
