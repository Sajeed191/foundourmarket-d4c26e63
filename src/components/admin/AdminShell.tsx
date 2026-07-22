import { useEffect, useMemo, useState, type ReactNode } from "react";
import { Link, useNavigate, useRouterState } from "@tanstack/react-router";
import { AnimatePresence, motion } from "framer-motion";
import {
  LayoutDashboard, ShoppingBag, Package, Users, BarChart3, Megaphone, Zap, Target, Flame,
  FileText, Truck, RotateCcw, Pencil, Activity, Wallet, Globe, Search,
  Boxes, Loader2, ShieldAlert, Menu, X, Sparkles, TrendingUp, ShoppingCart,
  Cpu, ChevronRight, Mail, ShieldBan, Inbox, PackageCheck, MailCheck, LifeBuoy, Database, Images, Bell, Gem, Crown, Store, UserCog, AlertTriangle, Trophy, ShieldCheck, Gauge, Filter, Brain, SlidersHorizontal, Star,
} from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/lib/auth";
import { useCommandCenter } from "@/lib/command-center";
import { NotificationBell } from "@/components/site/NotificationBell";
import { BrandName } from "@/components/site/BrandName";
import { ThemeMenu } from "@/components/site/ThemeMenu";
import { useAdminSupportUnread } from "@/lib/use-support-unread";
import { useCustomerIntelSummary } from "@/lib/use-customer-intel-summary";

export type Role = "admin" | "super_admin" | "manager" | "support" | "fulfillment" | "warehouse_staff" | "editor";

export type NavItem = {
  to: string;
  search?: Record<string, string>;
  label: string;
  icon: typeof LayoutDashboard;
  roles?: Role[];
};

export const NAV: { group: string; items: NavItem[] }[] = [
  {
    group: "Overview",
    items: [
      { to: "/admin", label: "Dashboard", icon: LayoutDashboard },
     { to: "/admin-executive", label: "Executive Dashboard", icon: Crown, roles: ["admin", "super_admin", "manager"] },
     { to: "/admin-ai-operations", label: "AI Operations", icon: Sparkles, roles: ["admin", "super_admin", "manager"] },
      { to: "/admin-notifications", label: "Operations Center", icon: Bell },
      { to: "/admin-live", label: "Live activity", icon: Activity },
      { to: "/admin-analytics", label: "Analytics", icon: BarChart3 },
      { to: "/admin-checkout-analytics", label: "Checkout Conversion", icon: ShoppingCart, roles: ["admin", "super_admin", "manager"] },
      { to: "/admin-checkout-funnel", label: "Checkout Funnel", icon: Filter, roles: ["admin", "super_admin", "manager"] },
      { to: "/admin-financial", label: "Financial", icon: Wallet, roles: ["admin", "super_admin", "manager"] },
      { to: "/admin-payments", label: "Payments", icon: Wallet, roles: ["admin", "super_admin", "manager", "support"] },

      { to: "/admin-traffic", label: "Traffic", icon: Globe, roles: ["admin", "super_admin", "manager"] },
    ],
  },
  {
    group: "Operations",
    items: [
      { to: "/admin-orders-ops", label: "Order Operations", icon: PackageCheck, roles: ["admin", "super_admin", "manager", "support", "fulfillment", "warehouse_staff"] },
      { to: "/admin-shipments", label: "Shipments", icon: Truck, roles: ["admin", "super_admin", "manager", "fulfillment", "warehouse_staff"] },
      { to: "/admin-returns", label: "Returns", icon: RotateCcw, roles: ["admin", "super_admin", "manager", "support"] },
      { to: "/admin-inventory", label: "Inventory", icon: Boxes, roles: ["admin", "super_admin", "manager", "warehouse_staff"] },
      { to: "/admin-low-stock", label: "Low Stock Center", icon: AlertTriangle, roles: ["admin", "super_admin", "manager", "warehouse_staff"] },
      { to: "/admin-inventory-intelligence", label: "Inventory Intelligence", icon: Cpu, roles: ["admin", "super_admin", "manager", "warehouse_staff"] },
    ],
  },
  {
    group: "Customers",
    items: [
      { to: "/admin-customers", label: "Customers", icon: Users, roles: ["admin", "super_admin", "manager", "support"] },
      { to: "/admin-users", label: "User & Staff Intelligence", icon: UserCog, roles: ["admin", "super_admin", "manager", "support"] },
      { to: "/admin-customer-intelligence", label: "Customer Intelligence", icon: Gem, roles: ["admin", "super_admin", "manager", "support"] },
      { to: "/admin-support", label: "Support", icon: LifeBuoy, roles: ["admin", "super_admin", "manager", "support"] },
    ],
  },
  {
    group: "Security & Trust",
    items: [
      { to: "/admin-security", label: "Fraud & Security", icon: ShieldAlert, roles: ["admin", "super_admin", "manager", "support"] },
    ],
  },
  {
    group: "Catalog",
    items: [
      { to: "/admin-products", label: "Products", icon: Package },
      { to: "/admin-catalog-intelligence", label: "Catalog Intelligence", icon: Sparkles, roles: ["admin", "super_admin", "manager"] },
      { to: "/admin-duplicate-intelligence", label: "Duplicate Intelligence", icon: ShieldCheck, roles: ["admin", "super_admin", "manager"] },
      { to: "/admin-categories", label: "Category Intelligence", icon: BarChart3, roles: ["admin", "super_admin", "manager"] },
      { to: "/admin-merchandising", label: "Merchandising Center", icon: Images, roles: ["admin", "super_admin", "manager"] },
      { to: "/admin-performance", label: "Performance", icon: Trophy, roles: ["admin", "super_admin", "manager"] },
      { to: "/admin-recommendation-health", label: "Recommendation Health", icon: Brain, roles: ["admin", "super_admin", "manager"] },
      { to: "/admin-recommendation-rules", label: "Recommendation Rules", icon: SlidersHorizontal, roles: ["admin", "super_admin"] },
      { to: "/admin-quality", label: "Quality Scanner", icon: ShieldCheck, roles: ["admin", "super_admin", "manager", "editor"] },
      { to: "/admin-marketplace-quality", label: "Marketplace Quality", icon: Gauge, roles: ["admin", "super_admin", "manager", "editor"] },
      { to: "/admin-badges", label: "Badge Manager", icon: Gem, roles: ["admin", "super_admin", "manager"] },
      { to: "/admin-badges-bulk", label: "Bulk Badges", icon: Gem, roles: ["admin", "super_admin", "manager"] },
      { to: "/admin-badges-analytics", label: "Badge Analytics", icon: BarChart3, roles: ["admin", "super_admin", "manager"] },
      { to: "/admin-media", label: "Media library", icon: Images, roles: ["admin", "super_admin", "manager", "editor"] },

      { to: "/admin-categories-manage", label: "Categories", icon: Boxes },
    ],
  },
  {
    group: "Marketing",
    items: [
      { to: "/admin-marketing", label: "Promotions", icon: Megaphone, roles: ["admin", "super_admin", "manager", "editor"] },
      { to: "/admin-flash-deals", label: "Flash Deals", icon: Flame, roles: ["admin", "super_admin", "manager"] },
      { to: "/admin-marketing-automation", label: "Marketing Automation", icon: Zap, roles: ["admin", "super_admin", "manager", "editor"] },
      { to: "/admin-acquisition-intelligence", label: "Acquisition Intelligence", icon: Target, roles: ["admin", "super_admin", "manager", "editor"] },
      { to: "/admin-seo-intelligence", label: "SEO Intelligence", icon: Search, roles: ["admin", "super_admin", "manager", "editor"] },
      { to: "/admin-seo-health", label: "SEO Health", icon: ShieldCheck, roles: ["admin", "super_admin", "manager", "editor"] },
      { to: "/admin-search", label: "Search trends", icon: Search, roles: ["admin", "super_admin", "manager"] },
      { to: "/admin-newsletter", label: "Newsletter", icon: Mail, roles: ["admin", "super_admin", "manager", "support", "editor"] },
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
      { to: "/admin-email-diagnostics", label: "Email diagnostics", icon: Activity, roles: ["admin", "super_admin", "manager"] },
      { to: "/admin-emails", label: "Email settings", icon: Mail, roles: ["admin", "super_admin", "manager"] },
      { to: "/admin-email-ops", label: "Email operations", icon: ShieldBan, roles: ["admin", "super_admin", "manager"] },
      { to: "/admin-email-queue", label: "Email queue", icon: Inbox, roles: ["admin", "super_admin", "manager"] },
      { to: "/admin-email-delivery", label: "Email delivery", icon: PackageCheck, roles: ["admin", "super_admin", "manager"] },
      { to: "/admin-email-health", label: "Email health", icon: Activity, roles: ["admin", "super_admin", "manager"] },
      { to: "/admin-inbox-placement", label: "Inbox placement", icon: MailCheck, roles: ["admin", "super_admin", "manager"] },
      { to: "/admin-system-health", label: "System health", icon: Cpu, roles: ["admin", "super_admin", "manager"] },
      { to: "/admin-activity", label: "Activity log", icon: Activity, roles: ["admin", "super_admin"] },
      { to: "/admin-seed", label: "Seed data", icon: Database, roles: ["admin", "super_admin", "manager"] },
      { to: "/admin-rating-recovery", label: "Rating recovery", icon: Star, roles: ["admin", "super_admin"] },


    ],
  },
  {
    group: "Marketplace",
    items: [
      { to: "/admin-site-rules", label: "Site Rules", icon: SlidersHorizontal, roles: ["admin", "super_admin", "manager"] },
      { to: "/admin-vendors", label: "Vendors", icon: Store, roles: ["super_admin"] },
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
  const location = useRouterState({ select: (s) => s.location });
  const path = location.pathname;
  const activeTab = typeof location.search.tab === "string" ? location.search.tab : null;
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [live, setLive] = useState<{ revenue: number; orders: number }>({ revenue: 0, orders: 0 });
  const { count: supportUnread } = useAdminSupportUnread();
  const intel = useCustomerIntelSummary(!!user);
  const cmd = useCommandCenter();

  useEffect(() => { if (!loading && !user) nav({ to: "/auth" }); }, [loading, user, nav]);
  useEffect(() => { setOpen(false); }, [path, activeTab]);

  useEffect(() => {
    if (!user) return;
    let active = true;
    const load = async () => {
      const since = new Date(); since.setHours(0, 0, 0, 0);
      const { data } = await supabase
        .from("orders")
        .select("total,payment_status,status")
        .gte("created_at", since.toISOString())
        .limit(1000);
      if (!active) return;
      const rows = (data as { total: number; payment_status: string; status: string }[]) ?? [];
      const paid = rows.filter((o) => o.payment_status === "paid" || o.status === "paid" || o.status === "fulfilled");
      setLive({ revenue: paid.reduce((s, o) => s + (Number(o.total) || 0), 0), orders: rows.length });
    };
    load();
    const ch = supabase.channel("admin-shell-live")
      .on("postgres_changes", { event: "*", schema: "public", table: "orders" }, load)
      .subscribe();
    return () => { active = false; supabase.removeChannel(ch); };
  }, [user]);


  const groupTitle = useMemo(() => {
    for (const g of NAV) for (const it of g.items) {
      if (isActive(it)) return g.group;
    }
    return "Admin";
  }, [path, activeTab]);

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
            Signed in as <span className="text-foreground">{user?.email}</span>. This area requires elevated access. Please contact your super-admin to be granted permission.
          </p>
          <Link to="/" className="inline-block mt-6 text-xs uppercase tracking-widest text-accent hover:underline">← Back to shop</Link>
        </motion.div>
      </div>
    );
  }

  function isActive(it: NavItem) {
    if (path !== it.to) return false;
    if (it.search?.tab) return activeTab === it.search.tab;
    if (it.to === "/admin") return !activeTab;
    return true;
  }

  function visibleItem(it: NavItem) {
    if (!it.roles) return true;
    return roles!.some((r) => it.roles!.includes(r));
  }

  const q = query.trim().toLowerCase();

  return (
    <div className="relative min-h-screen flex w-full bg-background">
      {/* Background atmosphere — ambient cinematic depth */}
      <div className="pointer-events-none fixed inset-0 z-0 overflow-hidden">
        <div className="orb animate-orb -top-32 left-1/4 size-[28rem] opacity-30" style={{ background: "var(--gradient-ember-soft)" }} />
        <div className="orb animate-float-soft bottom-0 right-0 size-[24rem] opacity-20" style={{ background: "var(--gradient-ember-soft)" }} />
        <div className="absolute inset-0" style={{ background: "radial-gradient(140% 100% at 50% -10%, oklch(1 0 0 / 0.015), transparent 50%), radial-gradient(120% 120% at 50% 120%, oklch(0 0 0 / 0.5), transparent 60%)" }} />
      </div>
      {/* Sidebar — floating operator console */}
      <aside className={`fixed lg:sticky top-14 lg:top-0 bottom-0 left-0 z-30 lg:z-40 w-[17.5rem] transform transition-transform duration-500 ease-[cubic-bezier(0.16,1,0.3,1)] lg:transform-none ${open ? "translate-x-0" : "-translate-x-[110%] lg:translate-x-0"} h-[calc(100vh-3.5rem)] lg:h-screen p-3`}>

        <div className="relative h-full flex flex-col rounded-[1.75rem] overflow-hidden glass-strong glass-reflect" style={{ boxShadow: "var(--shadow-float), 0 0 50px -22px oklch(0.74 0.19 49 / 0.3), inset 0 1px 0 oklch(1 0 0 / 0.06)" }}>
          {/* Ambient lighting */}
          <div className="orb animate-orb -top-16 -left-10 size-44 opacity-40" style={{ background: "var(--gradient-ember)" }} />
          <div className="orb animate-float-soft -bottom-20 -right-12 size-48 opacity-30" style={{ background: "var(--gradient-ember-soft)" }} />
          <div className="pointer-events-none absolute inset-0 rounded-[1.75rem]" style={{ background: "radial-gradient(120% 80% at 50% -10%, oklch(1 0 0 / 0.04), transparent 55%)" }} />


          {/* Brand + close */}
          <div className="relative px-4 pt-4 pb-3 flex items-center justify-between shrink-0">
            <Link to="/" className="group inline-flex items-center gap-2.5">
              <span className="relative size-7 rounded-lg bg-gradient-to-br from-accent to-primary grid place-items-center shadow-[0_6px_20px_-10px_oklch(0.74_0.19_49_/_0.6)] transition-transform duration-500 group-hover:scale-105">
                <Sparkles className="size-3.5 text-accent-foreground" />
                <span className="absolute inset-0 rounded-lg ring-1 ring-inset ring-white/15" />
              </span>
              <BrandName className="font-display text-sm tracking-tight" />
            </Link>
            <button onClick={() => setOpen(false)} className="lg:hidden size-7 grid place-items-center rounded-full hover:bg-white/5 transition-colors">
              <X className="size-3.5" />
            </button>
          </div>

          {/* Operator profile card */}
          <div className="relative px-3 shrink-0">
            <motion.div
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.5, ease: [0.16, 1, 0.3, 1] }}
              className="relative overflow-hidden rounded-2xl glass p-3 flex items-center gap-3"
              style={{ boxShadow: "inset 0 1px 0 oklch(1 0 0 / 0.06), 0 14px 36px -22px oklch(0 0 0 / 0.7)" }}
            >
              <div className="pointer-events-none absolute -top-8 -right-6 size-20 rounded-full opacity-25" style={{ background: "var(--gradient-ember-soft)", filter: "blur(22px)" }} />
              <div className="relative size-10 rounded-xl bg-gradient-to-br from-accent/20 to-primary/[0.08] grid place-items-center ring-1 ring-inset ring-white/10 shrink-0">
                <span className="font-display text-sm text-accent uppercase">{user?.email?.[0] ?? "F"}</span>

                <motion.span
                  className="absolute -bottom-0.5 -right-0.5 size-2.5 rounded-full bg-emerald-400 ring-2 ring-card"
                  animate={{ scale: [1, 1.18, 1], opacity: [0.9, 0.55, 0.9] }}
                  transition={{ duration: 2.4, repeat: Infinity, ease: "easeInOut" }}
                />
              </div>
              <div className="min-w-0 flex-1">
                <p className="text-[13px] font-medium leading-tight truncate">Founder</p>
                <p className="text-[9px] font-mono uppercase tracking-[0.2em] text-muted-foreground/80 mt-0.5">Operator Console</p>
                <div className="mt-1.5 inline-flex items-center gap-1.5">
                  <span className="size-1.5 rounded-full bg-emerald-400/90 shadow-[0_0_6px_oklch(0.7_0.17_160_/_0.6)] animate-pulse" />
                  <span className="text-[8px] font-mono uppercase tracking-[0.22em] text-emerald-400/80">Live System Active</span>
                </div>
              </div>
            </motion.div>
          </div>

          {/* Live operator widgets — asymmetric hierarchy */}
          <div className="relative px-3 pt-3 shrink-0">
            <div className="grid grid-cols-5 gap-2">
              {[
                { icon: TrendingUp, label: "Revenue today", value: new Intl.NumberFormat("en-IN", { notation: "compact", style: "currency", currency: "INR", maximumFractionDigits: 1 }).format(live.revenue), span: "col-span-3", big: true },
                { icon: ShoppingCart, label: "Orders today", value: String(live.orders), span: "col-span-2", big: false },

              ].map((w, i) => (
                <motion.div
                  key={w.label}
                  initial={{ opacity: 0, y: 8 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: 0.12 + i * 0.06, ease: [0.16, 1, 0.3, 1] }}
                  className={`${w.span} relative overflow-hidden rounded-xl glass ${w.big ? "px-3 py-2.5" : "px-2.5 py-2.5"}`}
                >
                  <div className="pointer-events-none absolute -top-6 -right-4 size-12 rounded-full opacity-25" style={{ background: "var(--gradient-ember-soft)", filter: "blur(14px)" }} />
                  <w.icon className={`${w.big ? "size-3.5" : "size-3"} text-accent mb-1`} />
                  <p className={`${w.big ? "text-base" : "text-[13px]"} font-display leading-none`}>{w.value}</p>
                  <p className="text-[8px] font-mono uppercase tracking-[0.18em] text-muted-foreground/80 mt-1.5">{w.label}</p>
                </motion.div>
              ))}
            </div>
            <motion.div
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.24, ease: [0.16, 1, 0.3, 1] }}
              className="mt-2 relative overflow-hidden rounded-xl glass px-3 py-2 flex items-center gap-2"
            >
              <Cpu className="size-3 text-accent shrink-0" />
              <span className="text-[9px] font-mono uppercase tracking-[0.18em] text-muted-foreground/80">System status</span>
              <span className="ml-auto inline-flex items-center gap-1.5 text-[9px] font-mono uppercase tracking-[0.18em] text-emerald-400/85">
                <span className="size-1.5 rounded-full bg-emerald-400/90 animate-pulse" /> OK
              </span>
            </motion.div>
          </div>

          {/* Search console — operator command bar */}
          <div className="relative px-3 pt-3 pb-2 shrink-0">
            <div className="relative group">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 size-3.5 text-muted-foreground/70 group-focus-within:text-accent transition-colors duration-300" />
              <input
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="Search console…"
                className="w-full bg-white/[0.025] border border-white/[0.08] rounded-xl pl-9 pr-12 py-2.5 text-xs placeholder:text-muted-foreground/70 focus:outline-none focus:border-accent/40 focus:bg-white/[0.04] focus:shadow-[inset_0_1px_2px_oklch(0_0_0_/_0.4),0_0_0_3px_oklch(0.74_0.19_49_/_0.08),0_0_26px_-10px_oklch(0.74_0.19_49_/_0.45)] transition-all duration-500"
                style={{ boxShadow: "inset 0 1px 2px oklch(0 0 0 / 0.35)" }}
              />
              <button
                type="button"
                onClick={() => cmd.setOpen(true)}
                aria-label="Open command center"
                className="absolute right-2.5 top-1/2 -translate-y-1/2 hidden md:inline-flex items-center rounded-md border border-white/10 bg-white/[0.03] px-1.5 py-0.5 text-[9px] font-mono text-muted-foreground/60 hover:border-accent/40 hover:text-accent transition-colors"
              >⌘K</button>
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
                      const active = isActive(it);
                      return (
                        <li key={`${it.to}:${it.search?.tab ?? ""}`}>
                          <Link
                            to={it.to as string}
                            search={(it.search ?? undefined) as never}
                            className={`group relative flex items-center gap-3 px-2.5 py-2 rounded-xl text-[13px] transition-all duration-300 hover:translate-x-0.5 ${
                              active
                                ? "text-accent"
                                : "text-muted-foreground hover:text-foreground hover:bg-white/[0.035]"
                            }`}
                          >
                            {active && (
                              <motion.span
                                layoutId="admin-active-indicator"
                                className="absolute inset-0 rounded-xl bg-gradient-to-r from-accent/[0.12] via-accent/[0.04] to-transparent ring-1 ring-inset ring-accent/15 shadow-[inset_0_0_20px_-14px_oklch(0.74_0.19_49_/_0.7)]"
                                transition={{ type: "spring", stiffness: 320, damping: 34 }}
                              />
                            )}
                            {active && (
                              <motion.span
                                layoutId="admin-active-bar"
                                className="absolute left-0 top-1/2 -translate-y-1/2 h-4 w-[2px] rounded-r bg-accent shadow-[0_0_10px_1px_oklch(0.74_0.19_49_/_0.55)]"
                                transition={{ type: "spring", stiffness: 320, damping: 32 }}
                              />
                            )}

                            <it.icon className={`relative size-4 shrink-0 transition-transform duration-300 group-hover:scale-110 ${active ? "drop-shadow-[0_0_6px_oklch(0.74_0.19_49_/_0.6)]" : ""}`} />
                            <span className="relative truncate flex-1">{it.label}</span>
                            {it.to === "/admin-support" && supportUnread > 0 && (
                              <span className="relative min-w-4 h-4 px-1 rounded-full bg-accent text-accent-foreground text-[9px] font-bold font-mono grid place-items-center shadow-[0_0_10px_var(--color-accent)]">
                                {supportUnread > 99 ? "99+" : supportUnread}
                              </span>
                            )}
                            {it.to === "/admin-customer-intelligence" && intel && (intel.vip + intel.atRisk + intel.newCustomers) > 0 && (
                              <span className="relative flex items-center gap-1">
                                {intel.vip > 0 && (
                                  <span title="VIP customers" className="min-w-4 h-4 px-1 rounded-full bg-amber-400/15 text-amber-300 ring-1 ring-inset ring-amber-400/30 text-[8px] font-bold font-mono grid place-items-center">{intel.vip > 99 ? "99+" : intel.vip}</span>
                                )}
                                {intel.atRisk > 0 && (
                                  <span title="At-risk customers" className="min-w-4 h-4 px-1 rounded-full bg-destructive/15 text-destructive ring-1 ring-inset ring-destructive/30 text-[8px] font-bold font-mono grid place-items-center">{intel.atRisk > 99 ? "99+" : intel.atRisk}</span>
                                )}
                                {intel.newCustomers > 0 && (
                                  <span title="New customers (30d)" className="min-w-4 h-4 px-1 rounded-full bg-emerald-400/15 text-emerald-300 ring-1 ring-inset ring-emerald-400/30 text-[8px] font-bold font-mono grid place-items-center">{intel.newCustomers > 99 ? "99+" : intel.newCustomers}</span>
                                )}
                              </span>
                            )}
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
            className="lg:hidden fixed top-14 inset-x-0 bottom-0 z-20 bg-black/70 backdrop-blur-sm"

            aria-label="Close menu"
          />
        )}
      </AnimatePresence>
      {/* Main */}
      <div className="relative z-10 flex-1 min-w-0 flex flex-col">
        <header className="sticky top-0 z-20 overflow-hidden bg-background/60 backdrop-blur-2xl border-b border-white/[0.05]">
          {/* Ambient header lighting */}
          <div className="pointer-events-none absolute -top-16 right-1/4 size-48 rounded-full opacity-25 animate-orb" style={{ background: "var(--gradient-ember-soft)", filter: "blur(44px)" }} />
          <div className="pointer-events-none absolute inset-x-0 top-0 h-px bg-gradient-to-r from-transparent via-white/12 to-transparent" />

          <div className="pointer-events-none absolute inset-x-0 top-0 h-px bg-gradient-to-r from-transparent via-white/15 to-transparent" />

          {/* Top OS nav bar: left / center / right */}
          <div className="relative px-3 lg:px-10 h-14 grid grid-cols-[1fr_auto_1fr] items-center gap-3">
            {/* LEFT — hamburger */}
            <div className="flex items-center justify-start">
              <button
                onClick={() => setOpen(true)}
                className="lg:hidden size-8 grid place-items-center rounded-xl bg-white/[0.03] border border-white/[0.08] hover:bg-white/[0.06] hover:border-accent/25 transition-all duration-300 shadow-[0_4px_16px_-10px_oklch(0_0_0_/_0.6)] active:scale-95"
                aria-label="Open menu"
              >
                <Menu className="size-[17px]" />
              </button>
            </div>

            {/* CENTER — brand */}
            <Link to="/" className="lg:hidden group inline-flex items-center gap-2 min-w-0">
              <span className="relative size-6 shrink-0 rounded-lg bg-gradient-to-br from-accent to-primary grid place-items-center shadow-[0_5px_16px_-9px_oklch(0.74_0.19_49_/_0.6)]">
                <Sparkles className="size-3 text-accent-foreground" />
                <span className="absolute inset-0 rounded-lg ring-1 ring-inset ring-white/15" />
              </span>
              <BrandName className="font-display text-[13px] tracking-tight truncate max-w-[9.5rem]" />
            </Link>
            {/* Desktop breadcrumb/title sits in the center slot */}
            <div className="hidden lg:block min-w-0">
              <div className="flex items-center gap-2 text-[10px] font-mono uppercase tracking-[0.32em] text-muted-foreground/80">
                <span className="text-accent">Operator</span>
                <span className="text-muted-foreground/40">/</span>
                <span>{groupTitle}</span>
              </div>
              <h1 className="text-base md:text-lg font-display font-semibold truncate">{title}</h1>
            </div>

            {/* RIGHT — actions */}
            <div className="flex items-center justify-end gap-2">
              <span className="hidden sm:inline-flex items-center gap-1.5 rounded-full border border-emerald-500/25 bg-emerald-500/[0.07] px-2.5 py-1 text-[9px] font-mono uppercase tracking-[0.18em] text-emerald-400/90">
                <span className="size-1.5 rounded-full bg-emerald-400 animate-pulse shadow-[0_0_6px_oklch(0.7_0.17_160_/_0.6)]" /> Synced
              </span>
              <ThemeMenu />
              <NotificationBell />
              {actions}
            </div>
          </div>


          {/* Mobile contextual title row */}
          <div className="lg:hidden relative px-4 pb-2.5 -mt-0.5">
            <div className="flex items-center gap-2 text-[9px] font-mono uppercase tracking-[0.3em] text-muted-foreground">
              <span className="text-accent">Operator</span>
              <span>/</span>
              <span>{groupTitle}</span>
            </div>
            <h1 className="text-[15px] font-display font-semibold truncate">{title}</h1>
          </div>
          {subtitle && <p className="px-4 lg:px-10 pb-2.5 text-xs text-muted-foreground">{subtitle}</p>}
        </header>

        <main className="flex-1 px-4 lg:px-10 pt-4 pb-8 lg:pt-6">

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
