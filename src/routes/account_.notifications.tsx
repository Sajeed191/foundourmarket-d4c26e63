import { createFileRoute, Link } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import {
  Bell, Check, Trash2, ArrowLeft, Settings as SettingsIcon, CheckCheck, Search, ShoppingBag, X,
} from "lucide-react";
import {
  useNotifications, categoryOf, type NotificationCategory, type Notification,
} from "@/lib/notifications";
import { CAT_META, CATEGORY_ORDER, timeAgo } from "@/lib/notification-meta";

export const Route = createFileRoute("/account_/notifications")({
  head: () => ({ meta: [{ title: "Notifications — FoundOurMarket™" }] }),
  component: NotificationsPage,
});

type Filter = "all" | NotificationCategory;

function NotificationsPage() {
  const { items, unread, markRead, markAllRead, remove, clearAll, loading } = useNotifications();
  const [filter, setFilter] = useState<Filter>("all");
  const [query, setQuery] = useState("");

  const counts = useMemo(() => {
    const c: Record<string, number> = { all: items.length };
    for (const n of items) {
      const cat = categoryOf(n);
      c[cat] = (c[cat] ?? 0) + 1;
    }
    return c;
  }, [items]);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    return items.filter((n) => {
      if (filter !== "all" && categoryOf(n) !== filter) return false;
      if (q && !(`${n.title} ${n.body ?? ""}`.toLowerCase().includes(q))) return false;
      return true;
    });
  }, [items, filter, query]);

  const tabs: Filter[] = ["all", ...CATEGORY_ORDER];
  const hasReadItems = items.some((n) => n.read_at);
  const clearRead = async () => {
    await Promise.all(items.filter((n) => n.read_at).map((n) => remove(n.id)));
  };

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
            <h1 className="text-fluid-2xl font-display font-semibold mt-2 flex items-center gap-2">
              Notification Center
              {unread > 0 && (
                <span className="text-xs font-mono px-2 py-0.5 rounded-full bg-accent/15 text-accent border border-accent/30 align-middle">
                  {unread}
                </span>
              )}
            </h1>
            <p className="text-sm text-muted-foreground mt-2">Real-time order, payment & support alerts.</p>
          </div>
          <Link
            to="/account/preferences"
            className="inline-flex items-center gap-1.5 text-xs font-mono uppercase tracking-widest text-muted-foreground hover:text-foreground"
          >
            <SettingsIcon className="size-3.5" /> Preferences
          </Link>
        </div>
      </motion.div>

      {/* Search */}
      <div className="relative mb-4">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 size-4 text-muted-foreground" />
        <input
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Search notifications…"
          className="w-full rounded-xl border border-border bg-card pl-9 pr-9 py-2.5 text-sm outline-none focus:border-accent/50 transition-colors"
        />
        {query && (
          <button onClick={() => setQuery("")} className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground">
            <X className="size-4" />
          </button>
        )}
      </div>

      {/* Filter tabs */}
      <div className="flex items-center gap-2 overflow-x-auto pb-2 mb-4 -mx-1 px-1">
        {tabs.map((t) => {
          const active = filter === t;
          const label = t === "all" ? "All" : CAT_META[t as NotificationCategory].label;
          const count = counts[t] ?? 0;
          if (t !== "all" && count === 0) return null;
          return (
            <button
              key={t}
              onClick={() => setFilter(t)}
              className={`shrink-0 inline-flex items-center gap-1.5 rounded-full border px-3.5 py-1.5 text-xs font-medium transition-all ${
                active
                  ? "border-accent/50 bg-accent/10 text-accent shadow-[0_0_12px_-4px_oklch(0.74_0.19_49_/_0.6)]"
                  : "border-border text-muted-foreground hover:text-foreground"
              }`}
            >
              {label}
              <span className={`font-mono text-[10px] ${active ? "text-accent" : "text-muted-foreground/70"}`}>{count}</span>
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
          {hasReadItems && (
            <button onClick={clearRead} className="inline-flex items-center gap-1.5 text-xs font-mono uppercase tracking-widest text-muted-foreground hover:text-foreground transition-colors">
              <Trash2 className="size-3.5" /> Clear read
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
          className="rounded-2xl border border-accent/15 bg-card p-12 sm:p-16 text-center"
        >
          <div className="relative size-16 mx-auto mb-5 grid place-items-center">
            <span className="absolute inset-0 rounded-full bg-accent/15 blur-xl animate-glow" />
            <div className="relative size-14 grid place-items-center rounded-full border border-accent/30 bg-accent/10">
              <Bell className="size-6 text-accent animate-float" />
            </div>
          </div>
          <p className="text-base font-display font-semibold">All caught up</p>
          <p className="text-sm text-muted-foreground mt-1.5 max-w-sm mx-auto">
            No new notifications right now. We'll notify you when something important happens.
          </p>
          <Link to="/" className="mt-5 inline-flex items-center gap-1.5 rounded-full border border-accent/40 bg-accent/10 px-4 py-2 text-sm font-medium text-accent hover:bg-accent/20 transition-colors">
            <ShoppingBag className="size-4" /> Continue Shopping
          </Link>
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
  const { Icon, tone, dot } = CAT_META[cat];
  const unread = !n.read_at;

  const content = (
    <div className="flex items-start gap-3 p-4 sm:p-5">
      <div className={`mt-0.5 size-9 shrink-0 grid place-items-center rounded-xl border ${unread ? tone : "border-border bg-white/5 text-muted-foreground"}`}>
        <Icon className="size-4" />
      </div>
      <div className="min-w-0 flex-1">
        <div className="flex items-start justify-between gap-2">
          <p className={`leading-tight flex items-center gap-2 ${unread ? "font-semibold" : "font-medium"}`}>
            {n.title}
            {unread && <span className={`size-1.5 rounded-full ${dot} shadow-[0_0_8px_2px_oklch(0.74_0.19_49_/_0.5)]`} />}
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
        unread ? "border-accent/30 bg-accent/[0.05]" : "border-border"
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
