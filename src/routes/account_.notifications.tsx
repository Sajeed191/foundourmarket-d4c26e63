import { createFileRoute, Link } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import {
  Bell, BellOff, Check, Trash2, Package, CreditCard, ShieldAlert,
  ArrowLeft, Settings as SettingsIcon, CheckCheck,
} from "lucide-react";
import {
  useNotifications, categoryOf, type NotificationCategory, type Notification,
} from "@/lib/notifications";

export const Route = createFileRoute("/account_/notifications")({
  head: () => ({ meta: [{ title: "Notifications — FoundOurMarket™" }] }),
  component: NotificationsPage,
});

function timeAgo(iso: string) {
  const s = Math.max(1, Math.floor((Date.now() - new Date(iso).getTime()) / 1000));
  if (s < 60) return `${s}s ago`;
  const m = Math.floor(s / 60); if (m < 60) return `${m}m ago`;
  const h = Math.floor(m / 60); if (h < 24) return `${h}h ago`;
  const d = Math.floor(h / 24); if (d < 7) return `${d}d ago`;
  return new Date(iso).toLocaleDateString();
}

const CAT_META: Record<NotificationCategory, { label: string; Icon: typeof Bell; tone: string }> = {
  order: { label: "Orders", Icon: Package, tone: "text-sky-400 border-sky-400/40" },
  payment: { label: "Payments", Icon: CreditCard, tone: "text-accent border-accent/40" },
  security: { label: "Security", Icon: ShieldAlert, tone: "text-rose-400 border-rose-400/40" },
  other: { label: "General", Icon: Bell, tone: "text-muted-foreground border-border" },
};

type Filter = "all" | NotificationCategory;

function NotificationsPage() {
  const { items, unread, markRead, markAllRead, remove, clearAll, loading } = useNotifications();
  const [filter, setFilter] = useState<Filter>("all");

  const counts = useMemo(() => {
    const c: Record<Filter, number> = { all: items.length, order: 0, payment: 0, security: 0, other: 0 };
    for (const n of items) c[categoryOf(n)]++;
    return c;
  }, [items]);

  const filtered = useMemo(
    () => (filter === "all" ? items : items.filter((n) => categoryOf(n) === filter)),
    [items, filter],
  );

  const tabs: Filter[] = ["all", "order", "payment", "security"];

  return (
    <div className="container-page py-10 sm:py-16 max-w-3xl">
      <motion.div
        initial={{ opacity: 0, y: 12 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.4 }}
        className="mb-6"
      >
        <Link to="/account" className="inline-flex items-center gap-1.5 text-xs font-mono uppercase tracking-widest text-muted-foreground hover:text-foreground mb-4">
          <ArrowLeft className="size-3" /> Back to account
        </Link>
        <div className="flex items-end justify-between gap-4 flex-wrap">
          <div>
            <p className="text-[10px] font-mono uppercase tracking-[0.3em] text-accent">Account</p>
            <h1 className="text-fluid-2xl font-display font-semibold mt-2">Notification Center</h1>
            <p className="text-sm text-muted-foreground mt-2">
              Real-time order, payment & security alerts.
              {unread > 0 && <span className="ml-2 text-accent font-mono">· {unread} unread</span>}
            </p>
          </div>
          <Link
            to="/account/preferences"
            className="inline-flex items-center gap-1.5 text-xs font-mono uppercase tracking-widest text-muted-foreground hover:text-foreground"
          >
            <SettingsIcon className="size-3.5" /> Preferences
          </Link>
        </div>
      </motion.div>

      {/* Filter tabs */}
      <div className="flex items-center gap-2 overflow-x-auto pb-2 mb-4 -mx-1 px-1">
        {tabs.map((t) => {
          const active = filter === t;
          const label = t === "all" ? "All" : CAT_META[t as NotificationCategory].label;
          return (
            <button
              key={t}
              onClick={() => setFilter(t)}
              className={`shrink-0 inline-flex items-center gap-1.5 rounded-full border px-3.5 py-1.5 text-xs font-medium transition-colors ${
                active ? "border-accent/50 bg-accent/10 text-accent" : "border-border text-muted-foreground hover:text-foreground"
              }`}
            >
              {label}
              <span className={`font-mono text-[10px] ${active ? "text-accent" : "text-muted-foreground/70"}`}>
                {counts[t]}
              </span>
            </button>
          );
        })}
      </div>

      {/* Bulk actions */}
      {items.length > 0 && (
        <div className="flex items-center justify-end gap-4 mb-4">
          {unread > 0 && (
            <button onClick={markAllRead} className="inline-flex items-center gap-1.5 text-xs font-mono uppercase tracking-widest text-accent hover:underline">
              <CheckCheck className="size-3.5" /> Mark all read
            </button>
          )}
          <button onClick={clearAll} className="inline-flex items-center gap-1.5 text-xs font-mono uppercase tracking-widest text-muted-foreground hover:text-rose-400 transition-colors">
            <Trash2 className="size-3.5" /> Clear all
          </button>
        </div>
      )}

      {loading ? (
        <ul className="space-y-2">
          {[0, 1, 2, 3].map((i) => (
            <li key={i} className="h-20 rounded-2xl border border-border bg-card animate-pulse" />
          ))}
        </ul>
      ) : filtered.length === 0 ? (
        <motion.div
          initial={{ opacity: 0, scale: 0.98 }}
          animate={{ opacity: 1, scale: 1 }}
          className="rounded-2xl border border-border bg-card p-12 sm:p-16 text-center"
        >
          <div className="size-14 mx-auto mb-5 grid place-items-center rounded-full border border-border">
            <BellOff className="size-5 text-muted-foreground" />
          </div>
          <p className="text-base font-medium">You're all caught up</p>
          <p className="text-sm text-muted-foreground mt-1">
            {filter === "all" ? "New notifications will land here in real time." : "No notifications in this category."}
          </p>
        </motion.div>
      ) : (
        <ul className="space-y-2">
          <AnimatePresence initial={false}>
            {filtered.map((n) => (
              <Row key={n.id} n={n} onRead={markRead} onRemove={remove} />
            ))}
          </AnimatePresence>
        </ul>
      )}
    </div>
  );
}

function Row({
  n, onRead, onRemove,
}: {
  n: Notification;
  onRead: (id: string) => void;
  onRemove: (id: string) => void;
}) {
  const cat = categoryOf(n);
  const { Icon, tone } = CAT_META[cat];
  const unread = !n.read_at;

  const content = (
    <div className="flex items-start gap-3 p-4 sm:p-5">
      <div className={`mt-0.5 size-9 shrink-0 grid place-items-center rounded-full border ${unread ? tone : "border-border text-muted-foreground"}`}>
        <Icon className="size-4" />
      </div>
      <div className="min-w-0 flex-1">
        <div className="flex items-start justify-between gap-2">
          <p className="font-medium leading-tight flex items-center gap-2">
            {n.title}
            {unread && <span className="size-1.5 rounded-full bg-accent shrink-0" />}
          </p>
          <span className="text-[10px] font-mono text-muted-foreground whitespace-nowrap">{timeAgo(n.created_at)}</span>
        </div>
        {n.body && <p className="text-sm text-muted-foreground mt-1">{n.body}</p>}
      </div>
    </div>
  );

  return (
    <motion.li
      layout
      initial={{ opacity: 0, x: -8 }}
      animate={{ opacity: 1, x: 0 }}
      exit={{ opacity: 0, x: 12, height: 0, marginBottom: 0 }}
      transition={{ duration: 0.22 }}
      className={`group relative rounded-2xl border bg-card overflow-hidden transition-colors ${
        unread ? "border-accent/30 bg-accent/[0.04]" : "border-border"
      }`}
    >
      {n.link ? (
        <Link to={n.link} onClick={() => unread && onRead(n.id)}>{content}</Link>
      ) : (
        <div onClick={() => unread && onRead(n.id)} className={unread ? "cursor-pointer" : ""}>{content}</div>
      )}
      <div className="absolute top-2.5 right-2.5 flex items-center gap-1 opacity-0 group-hover:opacity-100 focus-within:opacity-100 transition-opacity">
        {unread && (
          <button
            onClick={(e) => { e.preventDefault(); e.stopPropagation(); onRead(n.id); }}
            aria-label="Mark as read"
            className="size-7 grid place-items-center rounded-full bg-background/80 backdrop-blur border border-border text-muted-foreground hover:text-accent"
          >
            <Check className="size-3.5" />
          </button>
        )}
        <button
          onClick={(e) => { e.preventDefault(); e.stopPropagation(); onRemove(n.id); }}
          aria-label="Delete notification"
          className="size-7 grid place-items-center rounded-full bg-background/80 backdrop-blur border border-border text-muted-foreground hover:text-rose-400"
        >
          <Trash2 className="size-3.5" />
        </button>
      </div>
    </motion.li>
  );
}
