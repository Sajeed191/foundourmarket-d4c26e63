import { useEffect, useMemo, useState, type ReactNode } from "react";
import { Link, useNavigate, useRouterState } from "@tanstack/react-router";
import { AnimatePresence, motion } from "framer-motion";
import {
  LayoutDashboard, ShoppingBag, Package, Users, BarChart3, Megaphone,
  FileText, Truck, RotateCcw, Pencil, Activity, Wallet, Globe, Search,
  Boxes, Loader2, ShieldAlert, Menu, X, Sparkles, TrendingUp, ShoppingCart,
  Cpu, ChevronRight,
} from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/lib/auth";

type Role = "admin" | "super_admin" | "manager" | "support" | "fulfillment" | "warehouse_staff" | "editor";

type NavItem = {
  to: string;
  label: string;
  icon: typeof LayoutDashboard;
  roles?: Role[];
};

const NAV: { group: string; items: NavItem[] }[] = [
  {
    group: "Overview",
    items: [
      { to: "/admin", label: "Dashboard", icon: LayoutDashboard },
      { to: "/admin-live", label: "Live activity", icon: Activity },
      { to: "/admin-analytics", label: "Analytics", icon: BarChart3 },
      { to: "/admin-financial", label: "Financial", icon: Wallet, roles: ["admin", "super_admin", "manager"] },
      { to: "/admin-traffic", label: "Traffic", icon: Globe, roles: ["admin", "super_admin", "manager"] },
    ],
  },
  {
    group: "Operations",
    items: [
      { to: "/admin-shipments", label: "Shipments", icon: Truck, roles: ["admin", "super_admin", "manager", "fulfillment", "warehouse_staff"] },
      { to: "/admin-returns", label: "Returns", icon: RotateCcw, roles: ["admin", "super_admin", "manager", "support"] },
      { to: "/admin-inventory", label: "Inventory", icon: Boxes, roles: ["admin", "super_admin", "manager", "warehouse_staff"] },
    ],
  },
  {
    group: "Customers",
    items: [
      { to: "/admin-customers", label: "Customers", icon: Users, roles: ["admin", "super_admin", "manager", "support"] },
    ],
  },
  {
    group: "Catalog",
    items: [
      { to: "/admin?tab=products", label: "Products", icon: Package },
      { to: "/admin?tab=categories", label: "Categories", icon: Boxes },
    ],
  },
  {
    group: "Marketing",
    items: [
      { to: "/admin-marketing", label: "Promotions", icon: Megaphone, roles: ["admin", "super_admin", "manager", "editor"] },
      { to: "/admin-search", label: "Search trends", icon: Search, roles: ["admin", "super_admin", "manager"] },
      { to: "/admin?tab=subscribers", label: "Subscribers", icon: ShoppingBag },
    ],
  },
  {
    group: "Content",
    items: [
      { to: "/admin-cms", label: "CMS", icon: Pencil, roles: ["admin", "super_admin", "editor"] },
    ],
  },
  {
    group: "Insights",
    items: [
      { to: "/admin-reports", label: "Reports", icon: FileText, roles: ["admin", "super_admin", "manager"] },
      { to: "/admin-activity", label: "Activity log", icon: Activity, roles: ["admin", "super_admin"] },
    ],
  },
];

export function useAdminRoles() {
  const { user, loading } = useAuth();
  const [roles, setRoles] = useState<Role[] | null>(null);
  useEffect(() => {
    if (!user) { setRoles(null); return; }
    supabase.from("user_roles").select("role").eq("user_id", user.id)
      .then(({ data }) => setRoles((data?.map((r) => r.role as Role)) ?? []));
  }, [user]);
  return { user, loading, roles };
}

export function AdminShell({
  title, subtitle, actions, children, allow,
}: {
  title: string;
  subtitle?: string;
  actions?: ReactNode;
  children: ReactNode;
  allow?: Role[];
}) {
  const { user, loading, roles } = useAdminRoles();
  const nav = useNavigate();
  const path = useRouterState({ select: (s) => s.location.pathname });
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");

  useEffect(() => { if (!loading && !user) nav({ to: "/auth" }); }, [loading, user, nav]);
  useEffect(() => { setOpen(false); }, [path]);

  const groupTitle = useMemo(() => {
    for (const g of NAV) for (const it of g.items) {
      const [base] = it.to.split("?");
      if (base === path) return g.group;
    }
    return "Admin";
  }, [path]);

  if (loading || roles === null) {
    return (
      <div className="min-h-[60vh] grid place-items-center">
        <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="flex flex-col items-center gap-3">
          <Loader2 className="size-5 animate-spin text-accent" />
          <p className="text-[10px] font-mono uppercase tracking-[0.3em] text-muted-foreground">Verifying access…</p>
        </motion.div>
      </div>
    );
  }

  const allowedDefault: Role[] = ["admin", "super_admin", "manager", "support", "fulfillment", "warehouse_staff", "editor"];
  const required = allow ?? allowedDefault;
  const hasAccess = roles.some((r) => required.includes(r));

  if (!hasAccess) {
    return (
      <div className="min-h-[60vh] grid place-items-center px-6">
        <motion.div
          initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.45, ease: [0.16, 1, 0.3, 1] }}
          className="text-center max-w-md"
        >
          <div className="size-14 mx-auto mb-5 grid place-items-center rounded-full border border-border bg-destructive/5">
            <ShieldAlert className="size-5 text-destructive" />
          </div>
          <h1 className="text-2xl font-display font-semibold mb-2">Access restricted</h1>
          <p className="text-sm text-muted-foreground mb-6">
            Signed in as <span className="text-foreground">{user?.email}</span>. You need one of: {required.join(", ")}.
          </p>
          <code className="block text-left text-[11px] bg-card border border-border rounded-xl p-4 font-mono text-muted-foreground overflow-x-auto">
            insert into user_roles (user_id, role) values ('{user?.id}', 'admin');
          </code>
          <Link to="/" className="inline-block mt-6 text-xs uppercase tracking-widest text-accent hover:underline">← Back to shop</Link>
        </motion.div>
      </div>
    );
  }

  function isActive(to: string) {
    const [base] = to.split("?");
    return path === base;
  }

  function visibleItem(it: NavItem) {
    if (!it.roles) return true;
    return roles!.some((r) => it.roles!.includes(r));
  }

  const q = query.trim().toLowerCase();

  return (
    <div className="min-h-screen flex w-full bg-background">
      {/* Sidebar — floating operator console */}
      <aside className={`fixed lg:sticky lg:top-0 inset-y-0 left-0 z-40 w-[17.5rem] transform transition-transform duration-500 ease-[cubic-bezier(0.16,1,0.3,1)] lg:transform-none ${open ? "translate-x-0" : "-translate-x-[110%] lg:translate-x-0"} h-screen p-3`}>
        <div className="relative h-full flex flex-col rounded-[1.75rem] overflow-hidden glass-strong glass-reflect" style={{ boxShadow: "var(--shadow-float), var(--shadow-ember)" }}>
          {/* Ambient lighting */}
          <div className="orb animate-orb -top-16 -left-10 size-48" style={{ background: "var(--gradient-ember)" }} />
          <div className="orb -bottom-20 -right-12 size-52 opacity-40" style={{ background: "var(--gradient-ember-soft)" }} />
          <div className="pointer-events-none absolute inset-0 rounded-[1.75rem]" style={{ background: "radial-gradient(120% 80% at 50% -10%, oklch(1 0 0 / 0.05), transparent 55%)" }} />

          {/* Brand + close */}
          <div className="relative px-4 pt-4 pb-3 flex items-center justify-between shrink-0">
            <Link to="/" className="group inline-flex items-center gap-2.5">
              <span className="relative size-8 rounded-xl bg-gradient-to-br from-accent to-primary grid place-items-center shadow-[0_8px_24px_-8px_oklch(0.74_0.19_49_/_0.7)]">
                <Sparkles className="size-4 text-accent-foreground" />
                <span className="absolute inset-0 rounded-xl ring-1 ring-inset ring-white/20" />
              </span>
              <span className="font-display text-[15px] tracking-tight">FoundOurMarket™</span>
            </Link>
            <button onClick={() => setOpen(false)} className="lg:hidden size-8 grid place-items-center rounded-full hover:bg-white/5 transition-colors">
              <X className="size-4" />
            </button>
          </div>

          {/* Operator profile card */}
          <div className="relative px-3 shrink-0">
            <div className="relative overflow-hidden rounded-2xl glass p-3 flex items-center gap-3">
              <div className="pointer-events-none absolute -top-8 -right-6 size-24 rounded-full opacity-40" style={{ background: "var(--gradient-ember-soft)", filter: "blur(20px)" }} />
              <div className="relative size-11 rounded-xl bg-gradient-to-br from-accent/25 to-primary/10 grid place-items-center ring-1 ring-inset ring-white/15 shrink-0">
                <span className="font-display text-sm text-accent uppercase">{user?.email?.[0] ?? "F"}</span>
                <motion.span
                  className="absolute -bottom-0.5 -right-0.5 size-3 rounded-full bg-emerald-400 ring-2 ring-card"
                  animate={{ scale: [1, 1.25, 1], opacity: [1, 0.7, 1] }}
                  transition={{ duration: 2, repeat: Infinity, ease: "easeInOut" }}
                />
              </div>
              <div className="min-w-0 flex-1">
                <p className="text-[13px] font-medium leading-tight truncate">Founder</p>
                <p className="text-[10px] font-mono uppercase tracking-[0.18em] text-muted-foreground mt-0.5">Operator Console</p>
                <div className="mt-1.5 inline-flex items-center gap-1.5">
                  <span className="size-1.5 rounded-full bg-emerald-400 animate-pulse" />
                  <span className="text-[9px] font-mono uppercase tracking-[0.2em] text-emerald-400/90">Live System Active</span>
                </div>
              </div>
            </div>
          </div>

          {/* Live operator widgets */}
          <div className="relative px-3 pt-3 shrink-0">
            <div className="grid grid-cols-3 gap-2">
              {[
                { icon: ShoppingCart, label: "Orders", value: "128" },
                { icon: TrendingUp, label: "Revenue", value: "$14k" },
                { icon: Cpu, label: "Status", value: "OK" },
              ].map((w, i) => (
                <motion.div
                  key={w.label}
                  initial={{ opacity: 0, y: 8 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: 0.1 + i * 0.06, ease: [0.16, 1, 0.3, 1] }}
                  className="relative overflow-hidden rounded-xl glass px-2 py-2"
                >
                  <div className="pointer-events-none absolute -top-6 -right-4 size-12 rounded-full opacity-30" style={{ background: "var(--gradient-ember-soft)", filter: "blur(12px)" }} />
                  <w.icon className="size-3 text-accent mb-1" />
                  <p className="text-[13px] font-display leading-none">{w.value}</p>
                  <p className="text-[8px] font-mono uppercase tracking-[0.15em] text-muted-foreground mt-1">{w.label}</p>
                </motion.div>
              ))}
            </div>
          </div>

          {/* Search console */}
          <div className="relative px-3 pt-3 pb-2 shrink-0">
            <div className="relative group">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 size-3.5 text-muted-foreground group-focus-within:text-accent transition-colors" />
              <input
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="Search console…"
                className="w-full bg-white/[0.03] border border-white/10 rounded-xl pl-9 pr-3 py-2.5 text-xs placeholder:text-muted-foreground focus:outline-none focus:border-accent/50 focus:bg-white/[0.05] focus:shadow-[0_0_0_3px_oklch(0.74_0.19_49_/_0.1),0_0_28px_-8px_oklch(0.74_0.19_49_/_0.5)] transition-all duration-300"
              />
            </div>
          </div>

          <nav className="relative px-2.5 py-2 space-y-4 flex-1 overflow-y-auto">
            {NAV.map((g) => {
              const items = g.items
                .filter(visibleItem)
                .filter((it) => !q || it.label.toLowerCase().includes(q) || g.group.toLowerCase().includes(q));
              if (!items.length) return null;
              return (
                <div key={g.group}>
                  <div className="flex items-center gap-2 px-2.5 mb-1.5">
                    <p className="text-[9px] font-mono uppercase tracking-[0.32em] text-muted-foreground/70">{g.group}</p>
                    <span className="flex-1 h-px bg-gradient-to-r from-white/10 to-transparent" />
                  </div>
                  <ul className="space-y-0.5">
                    {items.map((it) => {
                      const active = isActive(it.to);
                      return (
                        <li key={it.to}>
                          <Link
                            to={it.to as string}
                            className={`group relative flex items-center gap-3 px-2.5 py-2 rounded-xl text-[13px] transition-all duration-300 hover:translate-x-0.5 ${
                              active
                                ? "text-accent"
                                : "text-muted-foreground hover:text-foreground hover:bg-white/[0.035]"
                            }`}
                          >
                            {active && (
                              <motion.span
                                layoutId="admin-active-indicator"
                                className="absolute inset-0 rounded-xl bg-gradient-to-r from-accent/15 via-accent/5 to-transparent ring-1 ring-inset ring-accent/20 shadow-[inset_0_0_24px_-12px_oklch(0.74_0.19_49_/_0.8)]"
                                transition={{ type: "spring", stiffness: 380, damping: 32 }}
                              />
                            )}
                            {active && (
                              <motion.span
                                layoutId="admin-active-bar"
                                className="absolute left-0 top-1/2 -translate-y-1/2 h-5 w-0.5 rounded-r bg-accent shadow-[0_0_12px_2px_oklch(0.74_0.19_49_/_0.7)]"
                                transition={{ type: "spring", stiffness: 380, damping: 30 }}
                              />
                            )}
                            <it.icon className={`relative size-4 shrink-0 transition-transform duration-300 group-hover:scale-110 ${active ? "drop-shadow-[0_0_6px_oklch(0.74_0.19_49_/_0.6)]" : ""}`} />
                            <span className="relative truncate flex-1">{it.label}</span>
                            <ChevronRight className={`relative size-3.5 shrink-0 transition-all duration-300 ${active ? "opacity-70" : "opacity-0 -translate-x-1 group-hover:opacity-50 group-hover:translate-x-0"}`} />
                          </Link>
                        </li>
                      );
                    })}
                  </ul>
                </div>
              );
            })}
          </nav>

          <div className="relative px-4 py-3.5 shrink-0 border-t border-white/[0.07]">
            <p className="text-[9px] font-mono uppercase tracking-[0.25em] text-muted-foreground/70 mb-1">Signed in</p>
            <p className="text-xs truncate">{user?.email}</p>
            <div className="mt-2 flex flex-wrap gap-1">
              {roles.map((r) => (
                <span key={r} className="text-[9px] font-mono uppercase tracking-widest px-2 py-0.5 rounded-full bg-accent/10 text-accent border border-accent/20">{r}</span>
              ))}
            </div>
          </div>
        </div>
      </aside>


      <AnimatePresence>
        {open && (
          <motion.button
            initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
            onClick={() => setOpen(false)}
            className="lg:hidden fixed inset-0 z-30 bg-black/70 backdrop-blur-sm"
            aria-label="Close menu"
          />
        )}
      </AnimatePresence>

      {/* Main */}
      <div className="flex-1 min-w-0 flex flex-col">
        <header className="sticky top-0 z-20 bg-background/80 backdrop-blur-xl border-b border-border">
          <div className="px-5 lg:px-10 h-16 flex items-center gap-3">
            <button
              onClick={() => setOpen(true)}
              className="lg:hidden size-9 grid place-items-center rounded-full hover:bg-white/5 border border-border"
            >
              <Menu className="size-4" />
            </button>
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2 text-[10px] font-mono uppercase tracking-[0.3em] text-muted-foreground">
                <span className="text-accent">Operator</span>
                <span>/</span>
                <span>{groupTitle}</span>
              </div>
              <h1 className="text-base md:text-lg font-display font-semibold truncate">{title}</h1>
            </div>
            <div className="flex items-center gap-2 flex-wrap">{actions}</div>
          </div>
          {subtitle && <p className="px-5 lg:px-10 pb-3 text-xs text-muted-foreground">{subtitle}</p>}
        </header>
        <main className="flex-1 px-5 lg:px-10 py-8">
          <motion.div
            key={path}
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.35, ease: [0.16, 1, 0.3, 1] }}
          >
            {children}
          </motion.div>
        </main>
      </div>
    </div>
  );
}

export function logActivity(action: string, entity_type?: string, entity_id?: string, metadata?: Record<string, unknown>) {
  supabase.from("admin_activity_logs").insert({
    action,
    entity_type: entity_type ?? null,
    entity_id: entity_id ?? null,
    metadata: (metadata ?? {}) as never,
  }).then(() => {}, () => {});
}
