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
import { waitForLayoutReady, isHeaderLayoutReady } from "@/lib/wait-for-layout";
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

  // NOTE: do NOT early-return before the hooks below. Doing so changes the
  // hook count between renders (loading→ready flips `isAdmin`) and triggers
  // "Rendered more hooks than during the previous render", which cascades
  // into AppErrorBoundary and blanks the entire app. Gate the final render
  // instead — every hook must run on every render.
  const gated = loading || !isAdmin;


  // --- Draggable Messenger-style chat-head behavior (mirrors LiveChat orb) ---
  // Position is NEVER persisted; resets to default (bottom-right) on every mount.
  const wrapRef = useRef<HTMLDivElement | null>(null);
  const posRef = useRef({ x: 0, y: 0 });
  const dragRef = useRef({
    active: false,
    moved: false,
    startX: 0,
    startY: 0,
    baseX: 0,
    baseY: 0,
    rafId: 0,
    nextX: 0,
    nextY: 0,
  });

  const EDGE_MARGIN = 12;
  const HIDDEN_RATIO = 0.4;
  const TAP_THRESHOLD = 8;

  const getBounds = useCallback(() => {
    const el = wrapRef.current;
    const rect = el?.getBoundingClientRect();
    const w = rect?.width || 120;
    const h = rect?.height || 48;
    const vw = window.innerWidth;
    const vh = window.innerHeight;
    const cs = getComputedStyle(document.documentElement);
    const headerH = parseFloat(cs.getPropertyValue("--app-header-height")) || 64;
    const navRaw = cs.getPropertyValue("--floating-bottom-offset").trim();
    let navH = 104;
    const n = parseFloat(navRaw);
    if (Number.isFinite(n) && !navRaw.includes("calc")) navH = n;
    return {
      w,
      h,
      vw,
      vh,
      minX: EDGE_MARGIN,
      maxX: vw - w - EDGE_MARGIN,
      minY: headerH + EDGE_MARGIN,
      maxY: Math.max(headerH + EDGE_MARGIN, vh - navH - h),
    };
  }, []);

  const applyTransform = useCallback(
    (x: number, y: number, scale = 1, withTransition = false) => {
      const el = wrapRef.current;
      if (!el) return;
      el.style.transition = withTransition
        ? "transform 260ms cubic-bezier(0.22, 1, 0.36, 1)"
        : "none";
      el.style.transform = `translate3d(${x}px, ${y}px, 0) scale(${scale})`;
    },
    [],
  );

  const resetToDefault = useCallback(
    (withTransition = true) => {
      const b = getBounds();
      posRef.current = { x: b.maxX, y: b.maxY };
      applyTransform(b.maxX, b.maxY, 1, withTransition);
    },
    [applyTransform, getBounds],
  );

  const [placed, setPlaced] = useState(false);
  useEffect(() => {
    if (gated) return;
    // Wait until the sticky header actually published --app-header-height
    // (LayoutMetricsProvider writes it on its own rAF, and font/layout shifts
    // can push that past two frames). Only then compute the safe position and
    // reveal the toolbar. Capped at ~30 frames so a broken header can never
    // hide the widget forever.
    const cancelWait = waitForLayoutReady(isHeaderLayoutReady, () => {
      // One more rAF so the resolved values are committed before we read them.
      const raf = requestAnimationFrame(() => {
        resetToDefault(false);
        setPlaced(true);
      });
      cleanupExtra = () => cancelAnimationFrame(raf);
    });
    let cleanupExtra = () => {};
    const onResize = () => {
      const b = getBounds();
      const x = Math.min(Math.max(posRef.current.x, b.minX - b.w * HIDDEN_RATIO), b.maxX + b.w * HIDDEN_RATIO);
      const y = Math.min(Math.max(posRef.current.y, b.minY), b.maxY);
      posRef.current = { x, y };
      applyTransform(x, y, 1, false);
    };
    window.addEventListener("resize", onResize);
    window.addEventListener("orientationchange", onResize);
    return () => {
      cancelWait();
      cleanupExtra();
      window.removeEventListener("resize", onResize);
      window.removeEventListener("orientationchange", onResize);
    };
  }, [applyTransform, getBounds, resetToDefault, gated]);

  // When the panel opens, ensure the toolbar is fully on-screen so the popover is reachable.
  useEffect(() => {
    if (open) resetToDefault(true);
  }, [open, resetToDefault]);

  const flushFrame = useCallback(() => {
    dragRef.current.rafId = 0;
    applyTransform(dragRef.current.nextX, dragRef.current.nextY, 1.05, false);
  }, [applyTransform]);

  const onPointerDown = useCallback((e: React.PointerEvent<HTMLButtonElement>) => {
    if (open) return; // don't drag while panel is open
    const d = dragRef.current;
    d.active = true;
    d.moved = false;
    d.startX = e.clientX;
    d.startY = e.clientY;
    d.baseX = posRef.current.x;
    d.baseY = posRef.current.y;
    d.nextX = posRef.current.x;
    d.nextY = posRef.current.y;
    try {
      (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
    } catch {
      /* noop */
    }
  }, [open]);

  const onPointerMove = useCallback(
    (e: React.PointerEvent<HTMLButtonElement>) => {
      const d = dragRef.current;
      if (!d.active) return;
      const dx = e.clientX - d.startX;
      const dy = e.clientY - d.startY;
      if (!d.moved && Math.hypot(dx, dy) < TAP_THRESHOLD) return;
      d.moved = true;
      const b = getBounds();
      const x = Math.min(Math.max(d.baseX + dx, b.minX), b.maxX);
      const y = Math.min(Math.max(d.baseY + dy, b.minY), b.maxY);
      d.nextX = x;
      d.nextY = y;
      if (!d.rafId) d.rafId = requestAnimationFrame(flushFrame);
    },
    [flushFrame, getBounds],
  );

  const endDrag = useCallback(
    (e: React.PointerEvent<HTMLButtonElement>) => {
      const d = dragRef.current;
      if (!d.active) return;
      d.active = false;
      try {
        (e.currentTarget as HTMLElement).releasePointerCapture(e.pointerId);
      } catch {
        /* noop */
      }
      if (d.rafId) {
        cancelAnimationFrame(d.rafId);
        d.rafId = 0;
      }
      if (!d.moved) {
        applyTransform(posRef.current.x, posRef.current.y, 1, true);
        return; // click handler will fire and toggle the panel
      }
      const b = getBounds();
      const centerX = d.nextX + b.w / 2;
      const hiddenPx = b.w * HIDDEN_RATIO;
      const snapX = centerX < b.vw / 2 ? -hiddenPx : b.vw - b.w + hiddenPx;
      const snapY = Math.min(Math.max(d.nextY, b.minY), b.maxY);
      posRef.current = { x: snapX, y: snapY };
      applyTransform(snapX, snapY, 1, true);
    },
    [applyTransform, getBounds],
  );

  if (gated) return null;

  return (
    <div
      ref={wrapRef}
      data-floating-control
      className="fixed left-0 top-0 z-[var(--z-floating-controls)] print:hidden"
      style={{
        willChange: "transform",
        touchAction: "none",
        opacity: placed ? 1 : 0,
        visibility: placed ? "visible" : "hidden",
        transition: placed ? "opacity 180ms ease-out" : "none",
      }}
    >
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
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={endDrag}
        onPointerCancel={endDrag}
        onClick={() => {
          if (dragRef.current.moved) {
            dragRef.current.moved = false;
            return;
          }
          setOpen((v) => !v);
        }}
        className={cn(
          "flex items-center gap-2 rounded-full border border-accent/40 bg-background/70 px-4 py-3 backdrop-blur-2xl transition-all touch-none select-none",
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
