import { useState } from "react";
import { Link, useNavigate, useRouterState } from "@tanstack/react-router";
import { motion, AnimatePresence } from "framer-motion";
import {
  LayoutDashboard,
  Package,
  Truck,
  Bell,
  Plus,
  X,
  PackagePlus,
  Boxes,
  Megaphone,
  LifeBuoy,
  Command as CommandIcon,
  ShoppingBag,
  Crown,
  Sparkles,
  Pencil,
  Store,
} from "lucide-react";
import { useIsAdmin } from "@/lib/use-admin";
import { useAdminMode } from "@/lib/admin-mode";
import { useCommandCenter } from "@/lib/command-center";
import { useAdminSupportUnread } from "@/lib/use-support-unread";
import { useNotifications } from "@/lib/notifications";
import { cn } from "@/lib/utils";

type NavItem = {
  to: string;
  label: string;
  icon: React.ComponentType<{ className?: string; strokeWidth?: number }>;
  match: (p: string) => boolean;
  badge?: number;
};

type QuickAction = {
  label: string;
  hint: string;
  icon: React.ComponentType<{ className?: string }>;
  to?: string;
  search?: Record<string, string>;
  onClick?: () => void;
};

/**
 * App-like bottom admin navigation for mobile/tablet. Renders only for staff
 * accounts while Admin Mode is active, turning the storefront into a management
 * console without leaving the current screen. Pure UX surface — every
 * destination and action remains role-protected + RLS-enforced server-side.
 */
export function AdminMobileBar() {
  const { isAdmin, loading } = useIsAdmin();
  const { adminMode, setAdminMode } = useAdminMode();
  const { setOpen: setCmdOpen } = useCommandCenter();
  const { count: supportUnread } = useAdminSupportUnread();
  const { unread } = useNotifications();
  const navigate = useNavigate();
  const pathname = useRouterState({ select: (s) => s.location.pathname });
  const [createOpen, setCreateOpen] = useState(false);

  if (loading || !isAdmin || !adminMode) return null;

  const items: NavItem[] = [
    { to: "/admin", label: "Console", icon: LayoutDashboard, match: (p) => p === "/admin" || p === "/admin-executive" },
    { to: "/admin-products", label: "Products", icon: Package, match: (p) => p === "/admin-products" },
    { to: "/admin-shipments", label: "Orders", icon: Truck, match: (p) => p === "/admin-shipments" || p === "/admin-returns" },
    { to: "/admin-notifications", label: "Alerts", icon: Bell, match: (p) => p === "/admin-notifications", badge: unread },
  ];

  const quickActions: QuickAction[] = [
    { label: "Add product", hint: "New catalog item", icon: PackagePlus, to: "/admin-products" },
    { label: "Categories", hint: "Manage catalog groups", icon: Boxes, to: "/admin", search: { tab: "categories" } },
    { label: "Inventory", hint: "Adjust stock", icon: Boxes, to: "/admin-inventory" },
    { label: "Orders", hint: "Fulfil & ship", icon: ShoppingBag, to: "/admin-shipments" },
    { label: "Promotion", hint: "Launch campaign", icon: Megaphone, to: "/admin-marketing-automation", search: { action: "create" } },
    { label: "Executive", hint: "Business pulse", icon: Crown, to: "/admin-executive" },
    { label: "AI Operations", hint: "Smart actions", icon: Sparkles, to: "/admin-ai-operations" },
    { label: "Support", hint: supportUnread > 0 ? `${supportUnread} unread` : "Customer inbox", icon: LifeBuoy, to: "/admin-support" },
    { label: "Command", hint: "Search & run", icon: CommandIcon, onClick: () => setCmdOpen(true) },
  ];

  return (
    <>
      {/* Quick-create sheet */}
      <AnimatePresence>
        {createOpen && (
          <div className="lg:hidden fixed inset-0 z-[70] flex items-end print:hidden">
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="absolute inset-0 bg-background/70 backdrop-blur-sm"
              onClick={() => setCreateOpen(false)}
            />
            <motion.div
              initial={{ y: "100%" }}
              animate={{ y: 0 }}
              exit={{ y: "100%" }}
              transition={{ type: "spring", stiffness: 320, damping: 32 }}
              className="relative z-10 w-full rounded-t-3xl border-t border-accent/25 bg-background/95 px-4 pb-[max(1.5rem,calc(env(safe-area-inset-bottom)+1rem))] pt-3 backdrop-blur-2xl shadow-[0_-20px_60px_-15px_oklch(0.74_0.19_49/0.4)]"
            >
              <div className="mx-auto mb-3 h-1 w-10 rounded-full bg-white/15" />
              <div className="mb-3 flex items-center justify-between">
                <span className="flex items-center gap-1.5 text-[10px] font-mono uppercase tracking-widest text-accent">
                  <Sparkles className="size-3.5" /> Quick actions
                </span>
                <button
                  onClick={() => setCreateOpen(false)}
                  aria-label="Close quick actions"
                  className="grid size-7 place-items-center rounded-full text-muted-foreground hover:text-foreground"
                >
                  <X className="size-4" />
                </button>
              </div>
              <div className="grid grid-cols-2 gap-2">
                {quickActions.map((a) => {
                  const inner = (
                    <>
                      <span className="grid size-9 shrink-0 place-items-center rounded-xl bg-accent/15 text-accent">
                        <a.icon className="size-4" />
                      </span>
                      <span className="min-w-0">
                        <span className="block truncate text-[13px] font-medium text-foreground">{a.label}</span>
                        <span className="block truncate text-[10px] text-muted-foreground">{a.hint}</span>
                      </span>
                    </>
                  );
                  const cls =
                    "flex items-center gap-2.5 rounded-2xl border border-white/5 bg-white/[0.02] px-3 py-2.5 text-left transition-all hover:border-accent/40 hover:bg-accent/10";
                  if (a.onClick) {
                    return (
                      <button key={a.label} onClick={() => { a.onClick!(); setCreateOpen(false); }} className={cls}>
                        {inner}
                      </button>
                    );
                  }
                  return (
                    <Link
                      key={a.label}
                      to={a.to!}
                      search={(a.search ?? undefined) as never}
                      onClick={() => setCreateOpen(false)}
                      className={cls}
                    >
                      {inner}
                    </Link>
                  );
                })}
              </div>
              <button
                onClick={() => { setAdminMode(false); setCreateOpen(false); }}
                className="mt-2 flex w-full items-center justify-center gap-2 rounded-2xl border border-white/5 bg-white/[0.02] px-3 py-2.5 text-xs font-medium text-muted-foreground transition-colors hover:text-foreground"
              >
                <Store className="size-3.5" /> Exit to storefront
              </button>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* Bottom admin nav */}
      <nav
        data-app-bottom-nav
        aria-label="Admin mobile navigation"
        className="lg:hidden fixed inset-x-0 bottom-0 z-[var(--z-bottom-nav)] h-[var(--mobile-nav-clearance)] px-[max(1rem,var(--mobile-safe-left))] pb-[calc(var(--mobile-safe-bottom)+var(--mobile-nav-edge-gap))] pt-[var(--mobile-nav-top-gap)] pointer-events-none print:hidden"
      >
        <div
          aria-hidden
          className="absolute inset-x-10 bottom-[calc(var(--mobile-safe-bottom)+var(--mobile-nav-edge-gap))] h-16 -z-10 blur-3xl opacity-50"
          style={{ background: "var(--gradient-ember-soft)" }}
        />
        <div
          className="pointer-events-auto relative flex h-[var(--mobile-nav-surface-height)] items-center justify-between gap-1 rounded-[26px] px-3 py-2.5 ring-1 ring-white/[0.09] shadow-[0_24px_60px_-20px_rgba(0,0,0,0.75),0_0_26px_-14px_oklch(0.74_0.19_49/0.45),inset_0_1px_0_oklch(1_0_0/0.08)] backdrop-blur-2xl backdrop-saturate-150"
          style={{ background: "linear-gradient(180deg, rgba(22,13,9,0.66), rgba(10,6,4,0.82))" }}
        >
          {items.slice(0, 2).map((it) => (
            <NavButton key={it.label} item={it} active={it.match(pathname)} />
          ))}

          {/* Center quick-create FAB */}
          <button
            onClick={() => { navigator.vibrate?.(8); setCreateOpen(true); }}
            aria-label="Quick actions"
            className="relative -mt-7 grid size-14 shrink-0 place-items-center rounded-full bg-accent text-accent-foreground shadow-[0_12px_30px_-8px_oklch(0.74_0.19_49/0.7)] ring-4 ring-background transition-transform active:scale-95"
          >
            <span aria-hidden className="pointer-events-none absolute inset-0 -z-10 rounded-full opacity-70 blur-md" style={{ background: "var(--gradient-ember-soft)" }} />
            <Plus className="size-6" strokeWidth={2.6} />
          </button>

          {items.slice(2).map((it) => (
            <NavButton key={it.label} item={it} active={it.match(pathname)} />
          ))}
        </div>

        {/* Admin-mode active strip */}
        <div className="pointer-events-none mt-1.5 flex items-center justify-center">
          <span className="inline-flex items-center gap-1.5 rounded-full bg-accent/15 px-2.5 py-0.5 text-[9px] font-mono uppercase tracking-widest text-accent">
            <Pencil className="size-2.5" /> Admin mode
          </span>
        </div>
      </nav>
    </>
  );

  function NavButton({ item, active }: { item: NavItem; active: boolean }) {
    const { to, label, icon: Icon, badge } = item;
    return (
      <Link
        to={to}
        onClick={() => navigator.vibrate?.(6)}
        className={cn(
          "relative flex flex-1 flex-col items-center justify-center gap-1 rounded-2xl py-2 text-[10px] font-mono uppercase tracking-widest transition-colors",
          active ? "text-accent-foreground" : "text-white/70 hover:text-white",
        )}
      >
        {active && (
          <motion.span
            layoutId="admin-mbnav-pill"
            transition={{ type: "spring", stiffness: 420, damping: 34, mass: 0.7 }}
            className="absolute inset-0 rounded-2xl bg-accent shadow-[0_6px_16px_-8px_var(--color-accent),0_0_0_1px_oklch(1_0_0/0.12)_inset]"
          />
        )}
        <span className="relative">
          <Icon className="size-[20px]" strokeWidth={active ? 2.6 : 2} />
          {typeof badge === "number" && badge > 0 && (
            <span
              className={cn(
                "absolute -top-1.5 -right-2 grid h-4 min-w-4 place-items-center rounded-full px-1 text-[9px] font-bold ring-2 ring-background",
                active ? "bg-background text-accent" : "bg-accent text-accent-foreground shadow-[0_0_10px_var(--color-accent)]",
              )}
            >
              {badge > 99 ? "99+" : badge}
            </span>
          )}
        </span>
        <span className="relative truncate text-[10px] font-semibold tracking-wide">{label}</span>
      </Link>
    );
  }
}
