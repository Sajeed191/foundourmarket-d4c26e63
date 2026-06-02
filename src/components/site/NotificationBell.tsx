import { useEffect, useMemo, useRef, useState } from "react";
import { Bell, Check, CheckCheck, Settings, Trash2, ShoppingBag, X } from "lucide-react";
import { Link, useRouterState } from "@tanstack/react-router";
import { useNotifications, categoryOf, type NotificationCategory, type Notification } from "@/lib/notifications";
import { CAT_META, CATEGORY_ORDER, timeAgo } from "@/lib/notification-meta";

type Filter = "all" | NotificationCategory;

export function NotificationBell() {
  const { items, unread, markRead, markAllRead, remove } = useNotifications();
  const [open, setOpen] = useState(false);
  const [filter, setFilter] = useState<Filter>("all");
  const [pulse, setPulse] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  const prevUnread = useRef(unread);

  useEffect(() => {
    const onClick = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", onClick);
    return () => document.removeEventListener("mousedown", onClick);
  }, []);

  // Pulse the bell when a new notification arrives
  useEffect(() => {
    if (unread > prevUnread.current) {
      setPulse(true);
      const t = setTimeout(() => setPulse(false), 1200);
      return () => clearTimeout(t);
    }
    prevUnread.current = unread;
  }, [unread]);

  const tabs: Filter[] = ["all", ...CATEGORY_ORDER];
  const counts = useMemo(() => {
    const c: Record<string, number> = { all: items.length };
    for (const n of items) {
      const cat = categoryOf(n);
      c[cat] = (c[cat] ?? 0) + 1;
    }
    return c;
  }, [items]);

  const filtered = useMemo(
    () => (filter === "all" ? items : items.filter((n) => categoryOf(n) === filter)),
    [items, filter],
  );

  const visible = filtered.slice(0, 6);
  const extra = filtered.length - visible.length;
  const hasReadItems = items.some((n) => n.read_at);

  const clearRead = async () => {
    await Promise.all(items.filter((n) => n.read_at).map((n) => remove(n.id)));
  };

  return (
    <div className="relative" ref={ref}>
      <button
        onClick={() => setOpen((o) => !o)}
        aria-label="Notifications"
        className={`relative size-9 rounded-full grid place-items-center transition-colors hover:bg-white/5 ${
          open ? "bg-white/5" : ""
        }`}
      >
        <Bell className={`size-4 ${pulse ? "animate-glow text-accent" : ""}`} />
        {unread > 0 && (
          <span className="absolute -top-0.5 -right-0.5 min-w-4 h-4 px-1 rounded-full bg-accent text-accent-foreground text-[9px] font-bold font-mono grid place-items-center shadow-[0_0_10px_2px_oklch(0.74_0.19_49_/_0.6)]">
            {unread > 9 ? "9+" : unread}
          </span>
        )}
      </button>

      {open && (
        <div
          className="fixed sm:absolute right-[max(0.5rem,env(safe-area-inset-right))] sm:right-0 top-[calc(env(safe-area-inset-top)+4rem)] sm:top-12 w-[min(92vw,420px)] sm:w-[400px] max-h-[calc(100dvh-env(safe-area-inset-top)-env(safe-area-inset-bottom)-5.5rem)] sm:max-h-[70vh] flex flex-col rounded-2xl border border-accent/20 bg-popover/90 backdrop-blur-2xl shadow-[0_30px_80px_-30px_oklch(0_0_0_/_0.8),0_0_0_1px_oklch(0.74_0.19_49_/_0.15),0_0_40px_-8px_oklch(0.74_0.19_49_/_0.25)] z-[80] animate-scale-in origin-top-right overflow-hidden"
        >
          {/* Header */}
          <div className="shrink-0 border-b border-border/60 bg-gradient-to-b from-accent/[0.06] to-transparent">
            <div className="flex items-center justify-between px-4 py-3">
              <div className="flex items-center gap-2">
                <div className="size-7 rounded-full grid place-items-center bg-accent/15 border border-accent/30">
                  <Bell className="size-3.5 text-accent" />
                </div>
                <span className="text-sm font-display font-semibold">Notifications</span>
                {unread > 0 && (
                  <span className="text-[10px] font-mono px-1.5 py-0.5 rounded-full bg-accent/15 text-accent border border-accent/30">
                    {unread}
                  </span>
                )}
              </div>
              <div className="flex items-center gap-1">
                {unread > 0 && (
                  <button
                    onClick={markAllRead}
                    title="Mark all read"
                    className="size-7 grid place-items-center rounded-full hover:bg-white/5 text-muted-foreground hover:text-accent transition-colors"
                  >
                    <CheckCheck className="size-3.5" />
                  </button>
                )}
                <Link
                  to="/account/preferences"
                  onClick={() => setOpen(false)}
                  title="Notification settings"
                  className="size-7 grid place-items-center rounded-full hover:bg-white/5 text-muted-foreground hover:text-foreground transition-colors"
                >
                  <Settings className="size-3.5" />
                </Link>
              </div>
            </div>

            {/* Category tabs */}
            <div className="flex items-center gap-1.5 overflow-x-auto px-3 pb-2.5 scrollbar-none">
              {tabs.map((t) => {
                const active = filter === t;
                const label = t === "all" ? "All" : CAT_META[t as NotificationCategory].label;
                const count = counts[t] ?? 0;
                if (t !== "all" && count === 0) return null;
                return (
                  <button
                    key={t}
                    onClick={() => setFilter(t)}
                    className={`shrink-0 inline-flex items-center gap-1 rounded-full border px-2.5 py-1 text-[11px] font-medium transition-all ${
                      active
                        ? "border-accent/50 bg-accent/15 text-accent shadow-[0_0_12px_-4px_oklch(0.74_0.19_49_/_0.6)]"
                        : "border-border/60 text-muted-foreground hover:text-foreground hover:border-border"
                    }`}
                  >
                    {label}
                    <span className="font-mono text-[9px] opacity-70">{count}</span>
                  </button>
                );
              })}
            </div>
          </div>

          {/* List */}
          <div className="flex-1 overflow-y-auto">
            {visible.length === 0 ? (
              <EmptyState onClose={() => setOpen(false)} />
            ) : (
              <ul className="p-2 space-y-1.5">
                {visible.map((n) => (
                  <NotifCard
                    key={n.id}
                    n={n}
                    onRead={markRead}
                    onRemove={remove}
                    onClose={() => setOpen(false)}
                  />
                ))}
              </ul>
            )}
          </div>

          {/* Footer */}
          <div className="shrink-0 border-t border-border/60 bg-gradient-to-t from-accent/[0.05] to-transparent px-3 py-2.5 flex items-center justify-between gap-2">
            <Link
              to="/account/notifications"
              onClick={() => setOpen(false)}
              className="text-[11px] font-mono uppercase tracking-widest text-accent hover:underline"
            >
              {extra > 0 ? `View all ${filtered.length} →` : "View all notifications →"}
            </Link>
            {hasReadItems && (
              <button
                onClick={clearRead}
                className="text-[11px] font-mono uppercase tracking-widest text-muted-foreground hover:text-rose-400 transition-colors inline-flex items-center gap-1"
              >
                <Trash2 className="size-3" /> Clear read
              </button>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

function EmptyState({ onClose }: { onClose: () => void }) {
  return (
    <div className="px-6 py-10 text-center">
      <div className="relative mx-auto mb-5 size-16 grid place-items-center">
        <span className="absolute inset-0 rounded-full bg-accent/15 blur-xl animate-glow" />
        <div className="relative size-14 grid place-items-center rounded-full border border-accent/30 bg-accent/10">
          <Bell className="size-6 text-accent animate-float" />
        </div>
      </div>
      <p className="text-sm font-display font-semibold">All caught up</p>
      <p className="text-xs text-muted-foreground mt-1.5 max-w-[240px] mx-auto leading-relaxed">
        No new notifications right now. We'll notify you when something important happens.
      </p>
      <Link
        to="/"
        onClick={onClose}
        className="mt-4 inline-flex items-center gap-1.5 rounded-full border border-accent/40 bg-accent/10 px-3.5 py-1.5 text-xs font-medium text-accent hover:bg-accent/20 transition-colors"
      >
        <ShoppingBag className="size-3.5" /> Continue Shopping
      </Link>
    </div>
  );
}

function NotifCard({
  n, onRead, onRemove, onClose,
}: {
  n: Notification;
  onRead: (id: string) => void;
  onRemove: (id: string) => void;
  onClose: () => void;
}) {
  const cat = categoryOf(n);
  const { Icon, tone, dot } = CAT_META[cat];
  const unread = !n.read_at;

  const inner = (
    <div className="flex items-start gap-3 p-3">
      <div className={`mt-0.5 size-9 shrink-0 grid place-items-center rounded-xl border ${unread ? tone : "border-border bg-white/5 text-muted-foreground"}`}>
        <Icon className="size-4" />
      </div>
      <div className="min-w-0 flex-1">
        <div className="flex items-start justify-between gap-2">
          <p className={`leading-tight text-sm flex items-center gap-1.5 ${unread ? "font-semibold" : "font-medium text-foreground/90"}`}>
            {n.title}
            {unread && <span className={`size-1.5 rounded-full ${dot} shadow-[0_0_8px_2px_oklch(0.74_0.19_49_/_0.5)] animate-pulse`} />}
          </p>
          <span className="text-[10px] font-mono text-muted-foreground whitespace-nowrap">{timeAgo(n.created_at)}</span>
        </div>
        {n.body && <p className="text-xs text-muted-foreground mt-0.5 line-clamp-2">{n.body}</p>}
      </div>
    </div>
  );

  return (
    <li
      className={`group relative rounded-xl border overflow-hidden transition-all ${
        unread
          ? "border-accent/25 bg-accent/[0.06] hover:bg-accent/[0.09]"
          : "border-border/50 bg-white/[0.02] hover:bg-white/[0.04]"
      }`}
    >
      {n.link ? (
        <Link to={n.link} onClick={() => { if (unread) onRead(n.id); onClose(); }}>{inner}</Link>
      ) : (
        <div onClick={() => unread && onRead(n.id)} className={unread ? "cursor-pointer" : ""}>{inner}</div>
      )}
      <div className="absolute top-2 right-2 flex items-center gap-1 opacity-0 group-hover:opacity-100 focus-within:opacity-100 transition-opacity">
        {unread && (
          <button
            onClick={(e) => { e.preventDefault(); e.stopPropagation(); onRead(n.id); }}
            aria-label="Mark as read"
            className="size-6 grid place-items-center rounded-full bg-background/80 backdrop-blur border border-border text-muted-foreground hover:text-accent"
          >
            <Check className="size-3" />
          </button>
        )}
        <button
          onClick={(e) => { e.preventDefault(); e.stopPropagation(); onRemove(n.id); }}
          aria-label="Delete notification"
          className="size-6 grid place-items-center rounded-full bg-background/80 backdrop-blur border border-border text-muted-foreground hover:text-rose-400"
        >
          <X className="size-3" />
        </button>
      </div>
    </li>
  );
}
