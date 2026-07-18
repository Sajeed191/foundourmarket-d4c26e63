import { useCallback, useEffect, useRef, useState } from "react";
import { Link } from "@tanstack/react-router";
import { motion, AnimatePresence } from "framer-motion";
import {
  ShieldCheck,
  LayoutDashboard,
  PackagePlus,
  ImagePlus,
  FolderTree,
  ShoppingBag,
  BarChart3,
  Megaphone,
  Boxes,
  ChevronUp,
  X,
  Pencil,
  Activity,
  Layers,
  LayoutTemplate,
  Brain,
  Gem,
  Rocket,
  Users,
  Crown,
  RotateCcw,
  Wallet,
  TrendingUp,
  Target,
  Percent,
  Sparkles,
} from "lucide-react";
import { useIsAdmin } from "@/lib/use-admin";
import { useAdminMode } from "@/lib/admin-mode";
import { useCommandCenter } from "@/lib/command-center";
import { Command as CommandIcon } from "lucide-react";
import { cn } from "@/lib/utils";
import { StorefrontDashboardPanel } from "@/components/admin/StorefrontDashboardPanel";
import { BulkVisibilityPanel } from "@/components/admin/BulkVisibilityPanel";

type Action = {
  label: string;
  icon: typeof LayoutDashboard;
  to: string;
};

const ACTIONS: Action[] = [
  { label: "Executive Dashboard", icon: Crown, to: "/admin-executive" },
  { label: "Business Health", icon: Crown, to: "/admin-executive?view=health" },
  { label: "Executive Risks", icon: Crown, to: "/admin-executive?view=risks" },
  { label: "Executive Opportunities", icon: Crown, to: "/admin-executive?view=opportunities" },
  { label: "AI Operations", icon: Brain, to: "/admin-ai-operations" },
  { label: "Critical Actions", icon: Brain, to: "/admin-ai-operations?view=critical" },
  { label: "Executive Briefing", icon: Brain, to: "/admin-ai-operations?view=briefing" },
  { label: "Profit Opportunities", icon: Brain, to: "/admin-ai-operations?view=profit" },
  { label: "Dashboard", icon: LayoutDashboard, to: "/admin" },
  { label: "Products", icon: ShoppingBag, to: "/admin-products" },
  { label: "Add product", icon: PackagePlus, to: "/admin-products" },
  { label: "Banners", icon: ImagePlus, to: "/admin-cms" },
  { label: "Categories", icon: FolderTree, to: "/admin-inventory" },
  { label: "Inventory", icon: Boxes, to: "/admin-inventory" },
  { label: "Intelligence", icon: Brain, to: "/admin-inventory-intelligence" },
  { label: "Customers", icon: Gem, to: "/admin-customer-intelligence" },
  { label: "Orders", icon: ShoppingBag, to: "/admin-shipments" },
  { label: "Marketing", icon: Megaphone, to: "/admin-marketing" },
  { label: "Analytics", icon: BarChart3, to: "/admin-analytics" },
];

/**
 * Global admin command dock. Mounted app-wide but renders only for staff
 * accounts (useIsAdmin). Every destination is itself role-protected, so this
 * is a pure UX shortcut layer — customers never see or reach it.
 */
export function AdminFloatingToolbar() {
  const { isAdmin, loading } = useIsAdmin();
  const { adminMode, toggle } = useAdminMode();
  const { setOpen: setCmdOpen } = useCommandCenter();
  const [open, setOpen] = useState(false);
  const [dashboard, setDashboard] = useState(false);
  const [bulk, setBulk] = useState(false);

  if (loading || !isAdmin) return null;

  return (
    <div data-floating-control className="fixed right-3 z-[var(--z-floating-controls)] bottom-[var(--floating-bottom-offset)] md:bottom-6 md:right-6 print:hidden">
      <AnimatePresence>
        {open && (
          <motion.div
            initial={{ opacity: 0, y: 12, scale: 0.96 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 12, scale: 0.96 }}
            transition={{ duration: 0.22, ease: [0.16, 1, 0.3, 1] }}
            className="mb-3 w-60 overflow-hidden rounded-2xl border border-accent/30 bg-background/80 p-2 backdrop-blur-2xl shadow-[0_20px_60px_-15px_oklch(0.74_0.19_49/0.45)]"
          >
            <div className="mb-1.5 flex items-center justify-between px-2 pt-1">
              <span className="flex items-center gap-1.5 text-[10px] font-mono uppercase tracking-widest text-accent">
                <ShieldCheck className="size-3.5" /> Admin console
              </span>
              <button
                onClick={() => setOpen(false)}
                className="grid size-6 place-items-center rounded-full text-muted-foreground hover:text-foreground"
                aria-label="Close admin console"
              >
                <X className="size-3.5" />
              </button>
            </div>
            <button
              onClick={() => {
                setOpen(false);
                setCmdOpen(true);
              }}
              className="mb-2 flex w-full items-center gap-2 rounded-xl border border-accent/40 bg-accent/15 px-3 py-2.5 transition-all hover:bg-accent/25"
            >
              <CommandIcon className="size-3.5 text-accent" />
              <span className="text-xs font-medium text-foreground">Command Center</span>
              <span className="ml-auto hidden items-center gap-1 text-[9px] font-mono uppercase tracking-widest text-accent sm:flex">
                <kbd className="rounded bg-accent/20 px-1 py-0.5">⌘K</kbd>
              </span>
            </button>
            <button
              onClick={toggle}
              className={cn(
                "mb-2 flex w-full items-center justify-between rounded-xl border px-3 py-2.5 transition-all",
                adminMode
                  ? "border-accent/50 bg-accent/15"
                  : "border-white/5 bg-white/[0.02] hover:border-accent/30",
              )}
            >
              <span className="flex items-center gap-2">
                <Pencil className={cn("size-3.5", adminMode ? "text-accent" : "text-muted-foreground")} />
                <span className="text-xs font-medium text-foreground">Admin Mode</span>
              </span>
              <span
                className={cn(
                  "relative h-5 w-9 rounded-full transition-colors",
                  adminMode ? "bg-accent" : "bg-white/15",
                )}
                aria-hidden
              >
                <span
                  className={cn(
                    "absolute top-0.5 size-4 rounded-full bg-white transition-transform",
                    adminMode ? "translate-x-[1.125rem]" : "translate-x-0.5",
                  )}
                />
              </span>
            </button>
            <button
              onClick={() => {
                setOpen(false);
                setDashboard(true);
              }}
              className="mb-2 flex w-full items-center gap-2 rounded-xl border border-accent/30 bg-accent/10 px-3 py-2.5 transition-all hover:bg-accent/20"
            >
              <Activity className="size-3.5 text-accent" />
              <span className="text-xs font-medium text-foreground">Live dashboard</span>
              <span className="ml-auto inline-flex items-center gap-1 text-[9px] font-mono uppercase tracking-widest text-accent">
                <span className="size-1.5 rounded-full bg-accent animate-pulse" /> Live
              </span>
            </button>
            <Link
              to="/builder"
              onClick={() => setOpen(false)}
              className="mb-2 flex w-full items-center gap-2 rounded-xl border border-accent/30 bg-accent/10 px-3 py-2.5 transition-all hover:bg-accent/20"
            >
              <LayoutTemplate className="size-3.5 text-accent" />
              <span className="text-xs font-medium text-foreground">Storefront builder</span>
              <span className="ml-auto text-[9px] font-mono uppercase tracking-widest text-accent">
                Visual
              </span>
            </Link>
            <Link
              to="/admin-marketing-automation"
              onClick={() => setOpen(false)}
              className="mb-2 flex w-full items-center gap-2 rounded-xl border border-accent/30 bg-accent/10 px-3 py-2.5 transition-all hover:bg-accent/20"
            >
              <Megaphone className="size-3.5 text-accent" />
              <span className="text-xs font-medium text-foreground">Marketing Automation</span>
              <span className="ml-auto text-[9px] font-mono uppercase tracking-widest text-accent">
                Engine
              </span>
            </Link>
            <div className="mb-2 grid grid-cols-3 gap-1">
              <Link
                to="/admin-marketing-automation"
                search={{ action: "create" } as never}
                onClick={() => setOpen(false)}
                className="group flex flex-col items-center gap-1 rounded-xl border border-white/5 bg-white/[0.02] px-1.5 py-2.5 text-center transition-all hover:border-accent/40 hover:bg-accent/10"
              >
                <Rocket className="size-4 text-muted-foreground group-hover:text-accent" />
                <span className="text-[9px] font-medium text-muted-foreground group-hover:text-foreground">Launch</span>
              </Link>
              <Link
                to="/admin-marketing-automation"
                search={{ tab: "automations" } as never}
                onClick={() => setOpen(false)}
                className="group flex flex-col items-center gap-1 rounded-xl border border-white/5 bg-white/[0.02] px-1.5 py-2.5 text-center transition-all hover:border-accent/40 hover:bg-accent/10"
              >
                <Activity className="size-4 text-muted-foreground group-hover:text-accent" />
                <span className="text-[9px] font-medium text-muted-foreground group-hover:text-foreground">Automate</span>
              </Link>
              <Link
                to="/admin-marketing-automation"
                search={{ action: "analytics" } as never}
                onClick={() => setOpen(false)}
                className="group flex flex-col items-center gap-1 rounded-xl border border-white/5 bg-white/[0.02] px-1.5 py-2.5 text-center transition-all hover:border-accent/40 hover:bg-accent/10"
              >
                <BarChart3 className="size-4 text-muted-foreground group-hover:text-accent" />
                <span className="text-[9px] font-medium text-muted-foreground group-hover:text-foreground">Analytics</span>
              </Link>
            </div>
            <Link
              to="/admin-customer-intelligence"
              search={{ view: "marketing" } as never}
              onClick={() => setOpen(false)}
              className="mb-2 flex w-full items-center gap-2 rounded-xl border border-accent/30 bg-accent/10 px-3 py-2.5 transition-all hover:bg-accent/20"
            >
              <Users className="size-3.5 text-accent" />
              <span className="text-xs font-medium text-foreground">Customer Marketing</span>
              <span className="ml-auto text-[9px] font-mono uppercase tracking-widest text-accent">
                Targeting
              </span>
            </Link>
            <div className="mb-2 grid grid-cols-3 gap-1">
              <Link
                to="/admin-customer-intelligence"
                search={{ view: "audiences" } as never}
                onClick={() => setOpen(false)}
                className="group flex flex-col items-center gap-1 rounded-xl border border-white/5 bg-white/[0.02] px-1.5 py-2.5 text-center transition-all hover:border-accent/40 hover:bg-accent/10"
              >
                <Users className="size-4 text-muted-foreground group-hover:text-accent" />
                <span className="text-[9px] font-medium text-muted-foreground group-hover:text-foreground">Audiences</span>
              </Link>
              <Link
                to="/admin-customer-intelligence"
                search={{ view: "vip" } as never}
                onClick={() => setOpen(false)}
                className="group flex flex-col items-center gap-1 rounded-xl border border-white/5 bg-white/[0.02] px-1.5 py-2.5 text-center transition-all hover:border-accent/40 hover:bg-accent/10"
              >
                <Crown className="size-4 text-muted-foreground group-hover:text-accent" />
                <span className="text-[9px] font-medium text-muted-foreground group-hover:text-foreground">VIP</span>
              </Link>
              <Link
                to="/admin-customer-intelligence"
                search={{ view: "atrisk" } as never}
                onClick={() => setOpen(false)}
                className="group flex flex-col items-center gap-1 rounded-xl border border-white/5 bg-white/[0.02] px-1.5 py-2.5 text-center transition-all hover:border-accent/40 hover:bg-accent/10"
              >
                <RotateCcw className="size-4 text-muted-foreground group-hover:text-accent" />
                <span className="text-[9px] font-medium text-muted-foreground group-hover:text-foreground">Winback</span>
              </Link>
            </div>
            <Link
              to="/admin-financial"
              search={{ view: "profit" } as never}
              onClick={() => setOpen(false)}
              className="mb-2 flex w-full items-center gap-2 rounded-xl border border-accent/30 bg-accent/10 px-3 py-2.5 transition-all hover:bg-accent/20"
            >
              <Wallet className="size-3.5 text-accent" />
              <span className="text-xs font-medium text-foreground">Financial Marketing</span>
              <span className="ml-auto text-[9px] font-mono uppercase tracking-widest text-accent">Profit</span>
            </Link>
            <div className="mb-2 grid grid-cols-2 gap-1">
              <Link
                to="/admin-financial"
                search={{ view: "profit" } as never}
                onClick={() => setOpen(false)}
                className="group flex flex-col items-center gap-1 rounded-xl border border-white/5 bg-white/[0.02] px-1.5 py-2.5 text-center transition-all hover:border-accent/40 hover:bg-accent/10"
              >
                <TrendingUp className="size-4 text-muted-foreground group-hover:text-accent" />
                <span className="text-[9px] font-medium text-muted-foreground group-hover:text-foreground">Profit Intel</span>
              </Link>
              <Link
                to="/admin-financial"
                search={{ view: "campaigns" } as never}
                onClick={() => setOpen(false)}
                className="group flex flex-col items-center gap-1 rounded-xl border border-white/5 bg-white/[0.02] px-1.5 py-2.5 text-center transition-all hover:border-accent/40 hover:bg-accent/10"
              >
                <Target className="size-4 text-muted-foreground group-hover:text-accent" />
                <span className="text-[9px] font-medium text-muted-foreground group-hover:text-foreground">Campaign ROI</span>
              </Link>
              <Link
                to="/admin-financial"
                search={{ view: "alerts" } as never}
                onClick={() => setOpen(false)}
                className="group flex flex-col items-center gap-1 rounded-xl border border-white/5 bg-white/[0.02] px-1.5 py-2.5 text-center transition-all hover:border-accent/40 hover:bg-accent/10"
              >
                <Percent className="size-4 text-muted-foreground group-hover:text-accent" />
                <span className="text-[9px] font-medium text-muted-foreground group-hover:text-foreground">Margin Alerts</span>
              </Link>
              <Link
                to="/admin-financial"
                search={{ view: "recs" } as never}
                onClick={() => setOpen(false)}
                className="group flex flex-col items-center gap-1 rounded-xl border border-white/5 bg-white/[0.02] px-1.5 py-2.5 text-center transition-all hover:border-accent/40 hover:bg-accent/10"
              >
                <Sparkles className="size-4 text-muted-foreground group-hover:text-accent" />
                <span className="text-[9px] font-medium text-muted-foreground group-hover:text-foreground">Profit Ops</span>
              </Link>
            </div>
            <button
              onClick={() => {
                setOpen(false);
                setBulk(true);
              }}
              className="mb-2 flex w-full items-center gap-2 rounded-xl border border-white/5 bg-white/[0.02] px-3 py-2.5 transition-all hover:border-accent/30 hover:bg-accent/10"
            >
              <Layers className="size-3.5 text-accent" />
              <span className="text-xs font-medium text-foreground">Bulk visibility</span>
              <span className="ml-auto text-[9px] font-mono uppercase tracking-widest text-muted-foreground">
                Categories · Banners
              </span>
            </button>
            <div className="grid grid-cols-3 gap-1">
              {ACTIONS.map((a) => (
                <Link
                  key={a.label}
                  to={a.to}
                  onClick={() => setOpen(false)}
                  className="group flex flex-col items-center gap-1 rounded-xl border border-white/5 bg-white/[0.02] px-1.5 py-2.5 text-center transition-all hover:border-accent/40 hover:bg-accent/10"
                >
                  <a.icon className="size-4 text-muted-foreground transition-colors group-hover:text-accent" />
                  <span className="text-[9px] font-medium leading-tight text-muted-foreground group-hover:text-foreground">
                    {a.label}
                  </span>
                </Link>
              ))}
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      <motion.button
        whileTap={{ scale: 0.94 }}
        onClick={() => setOpen((v) => !v)}
        className={cn(
          "flex items-center gap-2 rounded-full border border-accent/40 bg-background/70 px-4 py-3 backdrop-blur-2xl transition-all",
          "shadow-[0_10px_40px_-10px_oklch(0.74_0.19_49/0.55)] hover:brightness-110",
        )}
        aria-label="Open admin tools"
      >
        <span
          aria-hidden
          className="pointer-events-none absolute inset-0 -z-10 rounded-full opacity-60"
          style={{ background: "var(--gradient-ember-soft)", filter: "blur(16px)" }}
        />
        <ShieldCheck className="size-4 text-accent" />
        <span className="hidden text-xs font-semibold uppercase tracking-widest text-accent sm:inline">
          Admin
        </span>
        <ChevronUp
          className={cn(
            "size-4 text-accent transition-transform",
            open && "rotate-180",
          )}
        />
      </motion.button>

      <StorefrontDashboardPanel open={dashboard} onClose={() => setDashboard(false)} />
      <BulkVisibilityPanel open={bulk} onClose={() => setBulk(false)} />
    </div>
  );
}
