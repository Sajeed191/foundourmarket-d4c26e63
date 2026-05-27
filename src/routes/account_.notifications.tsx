import { createFileRoute, Link } from "@tanstack/react-router";
import { motion } from "framer-motion";
import { Bell, BellOff } from "lucide-react";
import { useNotifications } from "@/lib/notifications";

export const Route = createFileRoute("/account_/notifications")({
  head: () => ({ meta: [{ title: "Notifications — FoundOurMarket™" }] }),
  component: NotificationsPage,
});

function NotificationsPage() {
  const { items, unread, markRead, markAllRead, loading } = useNotifications();

  return (
    <div className="container-page py-10 sm:py-16 max-w-3xl">
      <motion.div
        initial={{ opacity: 0, y: 12 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.4 }}
        className="flex items-end justify-between gap-4 mb-8 flex-wrap"
      >
        <div>
          <p className="text-[10px] font-mono uppercase tracking-[0.3em] text-accent">Account</p>
          <h1 className="text-fluid-2xl font-display font-semibold mt-2">Notifications</h1>
          <p className="text-sm text-muted-foreground mt-2">
            Order updates, shipping alerts, and account activity.
            {unread > 0 && <span className="ml-2 text-accent font-mono">· {unread} unread</span>}
          </p>
        </div>
        {unread > 0 && (
          <button
            onClick={markAllRead}
            className="text-xs font-mono uppercase tracking-widest text-accent hover:underline"
          >
            Mark all read
          </button>
        )}
      </motion.div>

      {loading ? (
        <p className="text-sm text-muted-foreground">Loading…</p>
      ) : items.length === 0 ? (
        <motion.div
          initial={{ opacity: 0, scale: 0.98 }}
          animate={{ opacity: 1, scale: 1 }}
          className="rounded-2xl border border-border bg-card p-12 sm:p-16 text-center"
        >
          <div className="size-14 mx-auto mb-5 grid place-items-center rounded-full border border-border">
            <BellOff className="size-5 text-muted-foreground" />
          </div>
          <p className="text-base font-medium">You're all caught up</p>
          <p className="text-sm text-muted-foreground mt-1">New notifications will land here.</p>
        </motion.div>
      ) : (
        <ul className="divide-y divide-border rounded-2xl border border-border bg-card overflow-hidden">
          {items.map((n, i) => {
            const body = (
              <div className={`p-4 sm:p-5 hover:bg-white/5 transition-colors ${!n.read_at ? "bg-accent/5" : ""}`}>
                <div className="flex items-start gap-3">
                  <div className={`mt-0.5 size-8 shrink-0 grid place-items-center rounded-full border ${!n.read_at ? "border-accent/40 text-accent" : "border-border text-muted-foreground"}`}>
                    <Bell className="size-3.5" />
                  </div>
                  <div className="min-w-0 flex-1">
                    <div className="flex items-start justify-between gap-2">
                      <p className="font-medium leading-tight">{n.title}</p>
                      <span className="text-[10px] font-mono text-muted-foreground whitespace-nowrap">
                        {new Date(n.created_at).toLocaleDateString()}
                      </span>
                    </div>
                    {n.body && <p className="text-sm text-muted-foreground mt-1">{n.body}</p>}
                  </div>
                </div>
              </div>
            );
            return (
              <motion.li
                key={n.id}
                initial={{ opacity: 0, x: -8 }}
                animate={{ opacity: 1, x: 0 }}
                transition={{ duration: 0.25, delay: Math.min(i * 0.03, 0.3) }}
                onClick={() => !n.read_at && markRead(n.id)}
              >
                {n.link ? <Link to={n.link}>{body}</Link> : body}
              </motion.li>
            );
          })}
        </ul>
      )}

      <div className="mt-8">
        <Link to="/account" className="text-xs font-mono uppercase tracking-widest text-muted-foreground hover:text-foreground">
          ← Back to account
        </Link>
      </div>
    </div>
  );
}
