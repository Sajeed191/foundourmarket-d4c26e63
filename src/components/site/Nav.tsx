import { Link } from "@tanstack/react-router";
import { useCallback, useEffect, useRef, useState } from "react";
import {
  ShoppingBag, User, Heart, Menu, X, LayoutDashboard,
  Smartphone, Shirt, Home as HomeIcon, Store, Package, Truck, Clock,
  ChevronRight, LifeBuoy, Settings, ShieldCheck, FileText, Mail, LogIn,
  Sparkles, TrendingUp, Zap, Dumbbell, Gem, Grid3x3, Crown, Flame,
} from "lucide-react";
import { useCart } from "@/lib/cart";
import { useAuth } from "@/lib/auth";
import { useVisibleWishlistCount } from "@/lib/product-availability";
import { useSearchUI } from "@/lib/search-ui";
import { NotificationBell } from "@/components/site/NotificationBell";
import { BrandName } from "@/components/site/BrandName";
import { CurrencySwitcher } from "@/components/site/CurrencySwitcher";
import { MegaMenu } from "@/components/site/MegaMenu";
import { supabase } from "@/integrations/supabase/client";
import { loadCategories, type Category } from "@/lib/use-categories";
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem,
  DropdownMenuLabel, DropdownMenuSeparator, DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { useTheme } from "@/lib/theme";
import { LightMobileDrawer } from "@/components/site/LightMobileDrawer";
import { useMotionTier } from "@/lib/motion-tier";
const logoSrc = "/logo.webp";

const ADMIN_ROLES = ["admin","super_admin","manager","support","fulfillment","warehouse_staff","editor"];

/** Fire-and-forget, schema-agnostic merchandising signal. A listener can be
 *  attached later (e.g. to persist menu engagement) without touching this UI. */
function trackMenu(label: string, kind: string) {
  if (typeof window !== "undefined") {
    window.dispatchEvent(new CustomEvent("fom:menu_click", { detail: { label, kind, ts: Date.now() } }));
  }
}

/** Fallback glyph when a category has no image. */
function catFallbackIcon(slug: string, name: string) {
  const hay = `${slug} ${name}`.toLowerCase();
  if (/(electronic|tech|gadget|phone)/.test(hay)) return Smartphone;
  if (/(cloth|apparel|wear)/.test(hay)) return Shirt;
  if (/(home|decor|furnitur|kitchen)/.test(hay)) return HomeIcon;
  if (/(fitness|sport|gym)/.test(hay)) return Dumbbell;
  if (/(beauty|cosmetic|skin)/.test(hay)) return Gem;
  return Package;
}

function AnimatedHamburger({ open }: { open: boolean }) {
  // Lay the three bars out with flexbox so their base position never depends on
  // CSS transforms. Android strips `transform` from header descendants (a
  // compositor mitigation in styles.css); the previous transform-based offsets
  // collapsed all three bars onto one point, leaving a single visible line.
  // Transform is now used only for the open→X morph (cosmetic on Android).
  const line =
    "block h-[1.5px] w-5 rounded-full bg-current origin-center [transition:transform_0.4s_cubic-bezier(0.4,0,0.2,1),opacity_0.25s_ease]";
  return (
    <div className="flex size-5 flex-col items-center justify-center gap-[4px]">
      <span className={`${line} ${open ? "[transform:translateY(5.5px)_rotate(45deg)]" : ""}`} />
      <span className={`${line} ${open ? "opacity-0" : "opacity-100"}`} />
      <span className={`${line} ${open ? "[transform:translateY(-5.5px)_rotate(-45deg)]" : ""}`} />
    </div>
  );
}



export function Nav() {
  const { count } = useCart();
  const { user } = useAuth();
  const wishCount = useVisibleWishlistCount();
  const { effectiveTheme } = useTheme();
  const isLight = effectiveTheme === "light";
  const [open, setOpen] = useState(false);
  // Keep the drawer mounted during its exit transition.
  const [drawerMounted, setDrawerMounted] = useState(false);
  const [drawerVisible, setDrawerVisible] = useState(false);
  const { open: searchOpen, openSearch } = useSearchUI();
  const [isAdmin, setIsAdmin] = useState(false);

  useEffect(() => {
    if (!user) { setIsAdmin(false); return; }
    supabase.from("user_roles").select("role").eq("user_id", user.id)
      .then(({ data }) => setIsAdmin((data ?? []).some((r) => ADMIN_ROLES.includes(r.role as string))));
  }, [user]);

  useEffect(() => {
    document.body.style.overflow = open ? "hidden" : "";
    if (open) document.body.setAttribute("data-menu-open", "");
    else document.body.removeAttribute("data-menu-open");
    return () => {
      document.body.style.overflow = "";
      document.body.removeAttribute("data-menu-open");
    };
  }, [open]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "k") {
        e.preventDefault();
        openSearch();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);




  // Lazily-loaded merchandising data — only fetched the first time the drawer
  // opens, so non-shopping pages never pay for it (and we reuse cached data).
  const [cats, setCats] = useState<Category[]>([]);
  const [ordersCount, setOrdersCount] = useState<number | null>(null);
  const drawerDataLoaded = useRef(false);

  useEffect(() => {
    if (!open || drawerDataLoaded.current) return;
    drawerDataLoaded.current = true;
    loadCategories().then((list) => setCats(list.filter((c) => !c.parent_id)));
  }, [open]);

  // Customer order count for the profile card (lazy, only when signed in).
  useEffect(() => {
    if (!open || !user) return;
    let active = true;
    supabase.from("orders").select("id", { count: "exact", head: true }).eq("user_id", user.id)
      .then(({ count: c }) => { if (active) setOrdersCount(c ?? 0); });
    return () => { active = false; };
  }, [open, user]);

  const membership = (user?.user_metadata?.membership || user?.user_metadata?.tier) as string | undefined;

  const collections = [
    { to: "/products/trending" as const, label: "Trending Products", desc: "Popular right now", icon: TrendingUp },
    { to: "/products/best-sellers" as const, label: "Best Sellers", desc: "Most loved", icon: Zap },
    { to: "/products/new-arrivals" as const, label: "New Arrivals", desc: "Fresh drops", icon: Sparkles },
  ];

  const quickActions = [
    { to: "/account/orders" as const, label: "Orders", icon: Package, badge: null as number | null },
    { to: "/wishlist" as const, label: "Wishlist", icon: Heart, badge: wishCount },
    { to: "/cart" as const, label: "Cart", icon: ShoppingBag, badge: count },
    { to: "/track" as const, label: "Track Order", icon: Truck, badge: null as number | null },
  ];

  const displayName = user
    ? ((user.user_metadata?.full_name as string) || (user.email?.split("@")[0] ?? "Account"))
    : "FoundOurMarket™";
  const initial = (displayName?.[0] ?? "F").toUpperCase();

  const lastY = useRef(0);
  const topNavRef = useRef<HTMLDivElement | null>(null);
  const motionTier = useMotionTier();
  const lowEnd = motionTier === "low";
  // Live mirror of the search-overlay state so the imperative visibility layer
  // (which runs on scroll/touch rAF callbacks) never fights the search hide.
  const searchOpenRef = useRef(searchOpen);
  const forceTopNavVisible = useCallback(() => {
    const topNav = topNavRef.current;
    if (!topNav) return;
    // While the immersive search surface is open, the nav must stay hidden.
    // Bailing here prevents scroll/touch callbacks from re-showing it.
    if (searchOpenRef.current) return;
    topNav.style.display = "block";
    topNav.style.opacity = "1";
    topNav.style.visibility = "visible";
    topNav.style.pointerEvents = "";
    // Intentionally do NOT set a transform here. Visibility is driven by
    // display/opacity/visibility above; an identity translateY(0) would only
    // re-promote the fixed header to a composited layer (Chrome 149 GPU-raster
    // tile corruption trigger) with no visual effect.
    topNav.style.transform = "";
  }, []);

  // Single source of truth for hiding/restoring the top nav around search.
  // The nav is NEVER unmounted (a remount stranded imperative inline styles and
  // the scroll machine, leaving the header stuck over the hero). Instead we
  // toggle it imperatively and fully reset it the instant search closes.
  useEffect(() => {
    searchOpenRef.current = searchOpen;
    const topNav = topNavRef.current;
    if (!topNav) return;
    if (searchOpen) {
      topNav.style.display = "none";
      topNav.style.visibility = "hidden";
      topNav.style.pointerEvents = "none";
    } else {
      setScrollMode("visible");
      lastY.current = Math.max(window.scrollY, 0);
      forceTopNavVisible();
    }
  }, [searchOpen, forceTopNavVisible]);

  // Keep the reserved header spacer exactly as tall as the pinned header in
  // every state (expanded/compact) so there is never an implicit gap or
  // overlap between the fixed top nav and page content.
  const [headerHeight, setHeaderHeight] = useState<number | null>(null);
  useEffect(() => {
    const topNav = topNavRef.current;
    if (!topNav) return;
    const sync = () => {
      const h = topNav.offsetHeight;
      setHeaderHeight(h);
      // Expose the live header height so overlay sections (e.g. the hero) can
      // extend their own background up behind the floating nav pill — no
      // separate colored spacer band renders behind the navigation.
      document.documentElement.style.setProperty("--app-header-h", `${h}px`);
    };
    sync();
    const ro = new ResizeObserver(sync);
    ro.observe(topNav);
    window.addEventListener("resize", sync);
    window.addEventListener("orientationchange", sync);
    return () => {
      ro.disconnect();
      window.removeEventListener("resize", sync);
      window.removeEventListener("orientationchange", sync);
    };
  }, []);


  // Deterministic top-nav scroll machine. The header is NEVER hidden — only
  // "visible" and "compact" are valid states. The fixed visibility layer is
  // hard-restored on mount and during every scroll/touch update so Android
  // momentum scrolling cannot strand the header in a clipped or transparent state.
  const [scrollMode, setScrollMode] = useState<"visible" | "compact">("visible");
  useEffect(() => {
    const JITTER = 6; // ignore micro scroll noise (<6px)
    forceTopNavVisible();

    // Perf v3 — shared scroll bus. Fires once per animation frame with the
    // cached scrollY, so no local ticking gate is needed.
    let off: (() => void) | undefined;
    import("@/lib/scroll-bus").then(({ onScroll: onScrollBus }) => {
      off = onScrollBus((rawY) => {
        forceTopNavVisible();
        const y = Math.max(rawY, 0);
        const delta = y - lastY.current;

        if (lowEnd || y < 30) {
          setScrollMode("visible");
          lastY.current = y;
          return;
        }
        // Micro jitter — do not commit a direction change (keep last state).
        if (Math.abs(delta) < JITTER) return;

        // Upward intent is the priority signal: reveal instantly, per frame.
        if (delta < 0) setScrollMode("visible");
        else if (y > 80) setScrollMode("compact");
        lastY.current = y;
      });
    });
    const restore = () => forceTopNavVisible();
    window.addEventListener("touchstart", restore, { passive: true });
    window.addEventListener("wheel", restore, { passive: true });
    return () => {
      off?.();
      window.removeEventListener("touchstart", restore);
      window.removeEventListener("wheel", restore);
    };
  }, [forceTopNavVisible, lowEnd]);
  const compact = !lowEnd && scrollMode === "compact";


  // Drive the drawer enter/exit transition without framer-motion.
  useEffect(() => {
    if (open) {
      setDrawerMounted(true);
      const raf = requestAnimationFrame(() => setDrawerVisible(true));
      return () => cancelAnimationFrame(raf);
    }
    setDrawerVisible(false);
    const t = setTimeout(() => setDrawerMounted(false), 320);
    return () => clearTimeout(t);
  }, [open]);

  return (
    <>
      <div
        ref={topNavRef}
        data-app-header
        data-scroll-mode={scrollMode}
        style={{
          position: "fixed",
          top: 0,
          left: 0,
          right: 0,
          zIndex: 99999,
          display: "block",
          filter: "none",
          visibility: "visible",
          /* No transform: an identity translateY(0) still forces Chromium to
             promote this fixed header to its own composited layer, which is the
             layer that overlaps document-scrolling content and triggers the
             Chrome 149 GPU-raster tile bug (duplicated tiles / horizontal
             bands / stale fragments). Omitting it is a visual no-op. */
          opacity: 1,
          transition: "none",
          willChange: "auto",
          backfaceVisibility: "visible",
          contain: "none",
          perspective: "none",
        }}
        className="fixed inset-x-0 top-0 z-[99999] px-[max(0.75rem,var(--mobile-safe-left))] sm:px-4 pt-[calc(var(--mobile-safe-top)+0.4rem)] sm:pt-[calc(var(--mobile-safe-top)+0.6rem)]"
      >
        <nav
          className={`max-w-7xl lg:max-w-[1480px] mx-auto rounded-[26px] glass-strong bg-gradient-to-b from-white/[0.06] to-black/30 shadow-[0_10px_40px_-18px_oklch(0_0_0/0.7)] ring-1 lg:shadow-[0_16px_60px_-22px_oklch(0_0_0/0.75),0_0_50px_-22px_oklch(0.74_0.19_49/0.4)] ${
            compact
              ? "bg-black/60 ring-accent/[0.14] shadow-[0_14px_46px_-18px_oklch(0_0_0/0.8),0_0_22px_-14px_oklch(0.74_0.19_49/0.3)]"
              : "ring-white/10 lg:ring-white/15"
          }`}
        >
          <div
            className={`flex items-center justify-start px-2.5 sm:px-5 lg:px-7 gap-1 sm:gap-2 lg:gap-3 transition-[padding,gap] duration-200 ease-[cubic-bezier(0.2,0.8,0.2,1)] ${
              compact ? "py-1.5 sm:py-2 lg:py-2.5" : "py-2.5 sm:py-3 lg:py-4"
            }`}
          >




            {/* Zone 1 — Hamburger (mobile only) */}
            <button
              onClick={() => setOpen(!open)}
              aria-label={open ? "Close menu" : "Open menu"}
              className="md:hidden shrink-0 -ml-1 size-10 sm:size-11 rounded-xl grid place-items-center text-muted-foreground hover:text-foreground hover:bg-white/5 active:bg-accent/10 active:text-accent transition-all duration-200"
            >
              <AnimatedHamburger open={open} />
            </button>

            {/* Zone 2 — Logo + Brand */}
            <Link
              to="/"
              className="min-w-0 flex-1 md:flex-none flex items-center gap-2 sm:gap-2.5 -ml-0.5 md:ml-0 font-display tracking-tight font-semibold"
            >
              <span
                className={`shrink-0 relative inline-grid place-items-center rounded-2xl bg-black/40 ring-1 ring-accent/40 overflow-hidden shadow-[0_0_24px_-4px_var(--color-accent),inset_0_1px_0_oklch(1_0_0/0.1)] transition-[width,height,box-shadow] duration-200 ease-out hover:shadow-[0_0_34px_-2px_var(--color-accent)] ${
                  compact ? "size-8 sm:size-9 lg:size-10" : "size-9 sm:size-11 lg:size-12"
                }`}
              >
                <span aria-hidden className="pointer-events-none absolute -inset-1 rounded-2xl bg-accent/25 blur-md -z-[1]" />
                <img loading="lazy" decoding="async" src={logoSrc} alt="FoundOurMarket logo" className="size-full object-cover" />
              </span>
              <span className="flex min-w-0 flex-col leading-none">
                <span className="truncate text-[15px] sm:text-xl lg:text-[22px] font-semibold tracking-tight">
                  <BrandName />
                </span>
                <span
                  className={`overflow-hidden font-mono uppercase tracking-[0.2em] text-accent/80 truncate transition-[max-height,opacity,margin] duration-200 ease-out text-[8px] sm:text-[10px] ${
                    compact ? "max-h-0 opacity-0 mt-0" : "max-h-4 opacity-100 mt-0.5"
                  }`}
                >
                  Global Marketplace
                </span>
              </span>
            </Link>


            {/* Desktop nav links — premium mega menu (centered) */}
            <MegaMenu />

            {/* Zone 3 — Notifications • Cart */}
            <div className="shrink-0 ml-auto flex items-center gap-0.5 sm:gap-1.5">


              <div className="hidden lg:block">
                <CurrencySwitcher />
              </div>

              <Link
                to="/wishlist"
                aria-label="Wishlist"
                className="relative hidden sm:grid size-10 sm:size-11 rounded-xl place-items-center text-muted-foreground hover:text-accent hover:bg-accent/10 hover:shadow-[0_0_18px_-6px_var(--color-accent)] active:bg-accent/15 active:text-accent active:scale-90 transition-all duration-200"
              >
                <Heart className="size-[18px]" />
                {wishCount > 0 && (
                  <span key={wishCount} className="absolute top-1 right-1 grid size-4 place-items-center rounded-full bg-accent text-accent-foreground text-[9px] font-bold font-mono leading-none ring-2 ring-background shadow-[0_2px_6px_-1px_oklch(0.74_0.19_49/0.7)] animate-scale-in">
                    {wishCount > 9 ? "9+" : wishCount}
                  </span>
                )}
              </Link>


              {isAdmin && (
                <Link
                  to="/admin"
                  aria-label="Admin"
                  className="hidden sm:grid size-10 sm:size-11 rounded-xl place-items-center text-muted-foreground hover:text-accent hover:bg-accent/10 hover:shadow-[0_0_18px_-6px_var(--color-accent)] active:bg-accent/15 active:text-accent active:scale-90 transition-all duration-200"
                  title="Admin"
                >
                  <LayoutDashboard className="size-[18px]" />
                </Link>
              )}

              <div className="flex items-center">
                <NotificationBell />
              </div>

              {/* Account — desktop dropdown (replaces floating launcher) */}
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <button
                    aria-label="Account"
                    className="hidden md:flex items-center gap-2 h-10 sm:h-11 pl-1.5 pr-3 rounded-xl text-muted-foreground hover:text-foreground hover:bg-white/5 active:bg-accent/10 active:text-accent active:scale-95 transition-all duration-200"
                  >
                    <span className="grid place-items-center size-8 rounded-lg bg-accent/15 ring-1 ring-accent/30 overflow-hidden text-accent">
                      {user?.user_metadata?.avatar_url
                        ? <img loading="lazy" decoding="async" src={user.user_metadata.avatar_url as string} alt="" className="size-full object-cover" />
                        : <User className="size-[17px]" />}
                    </span>
                    <span className="text-[13px] font-medium max-w-[7rem] truncate">{user ? "Account" : "Sign in"}</span>
                  </button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end" className="w-56 glass-strong border-white/10">
                  <DropdownMenuLabel className="truncate">{user ? displayName : <>Welcome to <BrandName /></>}</DropdownMenuLabel>
                  <DropdownMenuSeparator />
                  {user ? (
                    <>
                      <DropdownMenuItem asChild><Link to="/account">My Account</Link></DropdownMenuItem>
                      <DropdownMenuItem asChild><Link to="/account">Orders</Link></DropdownMenuItem>
                      <DropdownMenuItem asChild><Link to="/wishlist">Wishlist</Link></DropdownMenuItem>
                      <DropdownMenuItem asChild><Link to="/track">Track Order</Link></DropdownMenuItem>
                      {isAdmin && (
                        <>
                          <DropdownMenuSeparator />
                          <DropdownMenuItem asChild><Link to="/admin">Admin Panel</Link></DropdownMenuItem>
                        </>
                      )}
                    </>
                  ) : (
                    <>
                      <DropdownMenuItem asChild><Link to="/auth">Sign in</Link></DropdownMenuItem>
                      <DropdownMenuItem asChild><Link to="/track">Track Order</Link></DropdownMenuItem>
                      <DropdownMenuItem asChild><Link to="/help">Help Center</Link></DropdownMenuItem>
                    </>
                  )}
                </DropdownMenuContent>
              </DropdownMenu>


              {/* Soft divider between actions and cart */}
              <span aria-hidden className="self-center mx-0.5 sm:mx-1.5 h-6 w-px bg-gradient-to-b from-transparent via-white/15 to-transparent" />

              <Link
                to="/cart"
                aria-label="Cart"
                className="shrink-0 relative flex items-center justify-center gap-1 sm:gap-1.5 h-10 sm:h-11 min-w-10 sm:min-w-11 px-2 sm:px-3.5 rounded-xl bg-accent text-accent-foreground hover:brightness-110 active:scale-[0.96] transition-all shadow-[var(--shadow-ember)]"
              >
                <ShoppingBag className="size-[17px]" />
                <span key={count} className="text-[11px] font-mono font-semibold animate-scale-in">{count}</span>
              </Link>
            </div>
          </div>
        </nav>
      </div>
      <div
        aria-hidden="true"
        data-app-header-spacer
        className="shrink-0"
        style={{
          // Synced to the real pinned header height (expanded/compact) to avoid
          // any gap or overlap; calc() is only the pre-measure fallback.
          height: headerHeight != null ? `${headerHeight}px` : "calc(var(--mobile-safe-top) + 4.75rem)",
          // Reserved header space carries the page background so it stays
          // continuous with the content below — no darker/blank band on refresh.
          background: "var(--background)",
        }}
      />


      {/* Mobile drawer — unified design for all themes (colors adapt per theme) */}
      {drawerMounted && (
        <LightMobileDrawer
          visible={drawerVisible}
          onClose={() => setOpen(false)}
          user={user}
          displayName={displayName}
          initial={initial}
          membership={membership}
          ordersCount={ordersCount}
          cats={cats}
          wishCount={wishCount}
          cartCount={count}
          isAdmin={isAdmin}
          avatarUrl={user?.user_metadata?.avatar_url as string | undefined}
        />
      )}
    </>
  );
}

function Section({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="py-4 first:pt-1">
      <p className="px-1 mb-3 text-xs font-semibold uppercase tracking-[0.2em] text-foreground/90">{label}</p>
      <div className="space-y-1">{children}</div>
    </div>
  );
}

function FooterAction({
  icon: Icon, label, to, badge, onNavigate,
}: {
  icon: React.ComponentType<{ className?: string }>;
  label: string;
  to: string;
  badge?: number;
  onNavigate?: () => void;
}) {
  return (
    <Link
      to={to}
      onClick={onNavigate}
      className="group relative flex flex-col items-center justify-center gap-1 rounded-xl glass border border-white/[0.06] py-2.5 hover:border-accent/40 hover:bg-white/[0.05] active:scale-[0.96] transition"
    >
      <span className="relative">
        <Icon className="size-4.5 text-muted-foreground group-hover:text-accent transition" />
        {badge != null && badge > 0 && (
          <span className="absolute -top-1.5 -right-2 min-w-4 h-4 px-1 rounded-full bg-accent text-accent-foreground text-[9px] font-bold grid place-items-center">{badge > 99 ? "99+" : badge}</span>
        )}
      </span>
      <span className="text-[10px] font-medium text-muted-foreground group-hover:text-foreground transition">{label}</span>
    </Link>
  );
}




function NavItem({
  icon: Icon, label, to, badge, accent, onNavigate,
}: {
  icon: React.ComponentType<{ className?: string }>;
  label: string;
  to: string;
  badge?: number;
  accent?: boolean;
  onNavigate?: () => void;
}) {
  return (
    <Link
      to={to}
      onClick={onNavigate}
      className={`group flex items-center gap-3 rounded-xl px-3 py-2.5 hover:bg-white/5 active:scale-[0.98] transition ${accent ? "text-accent" : ""}`}
    >
      <Icon className={`size-4 ${accent ? "text-accent" : "text-muted-foreground group-hover:text-foreground"} transition`} />
      <span className="flex-1 text-sm font-medium">{label}</span>
      {badge != null && badge > 0 && (
        <span className="min-w-5 h-5 px-1.5 rounded-full bg-accent/15 text-accent text-[10px] font-bold grid place-items-center">{badge}</span>
      )}
    </Link>
  );
}

