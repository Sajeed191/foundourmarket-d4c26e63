import { Link } from "@tanstack/react-router";
import { Suspense, lazy, useEffect, useRef, useState } from "react";
import {
  ShoppingBag, Search, User, Heart, Menu, X, LayoutDashboard,
  Smartphone, Shirt, Home as HomeIcon, Store, Package, Truck, Clock,
  ChevronRight, LifeBuoy, Settings, ShieldCheck, FileText, Mail, LogIn,
  Sparkles, TrendingUp, Zap, Dumbbell, Gem, Grid3x3, Crown, Flame,
} from "lucide-react";
import { useCart } from "@/lib/cart";
import { useAuth } from "@/lib/auth";
import { useWishlist } from "@/lib/wishlist";
const SearchCommand = lazy(() =>
  import("@/components/site/SearchCommand").then((m) => ({ default: m.SearchCommand })),
);
import { NotificationBell } from "@/components/site/NotificationBell";
import { CurrencySwitcher } from "@/components/site/CurrencySwitcher";
import { supabase } from "@/integrations/supabase/client";
import { loadCategories, type Category } from "@/lib/use-categories";
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem,
  DropdownMenuLabel, DropdownMenuSeparator, DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { useTheme } from "@/lib/theme";
import { LightMobileDrawer } from "@/components/site/LightMobileDrawer";
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
  const line =
    "absolute left-1/2 top-1/2 block h-[1.5px] w-5 -translate-x-1/2 rounded-full bg-current will-change-transform [transition:transform_0.4s_cubic-bezier(0.4,0,0.2,1),opacity_0.25s_ease]";
  return (
    <div className="relative size-5 [transform:translateZ(0)]">
      <span
        className={`${line} ${open ? "[transform:translate(-50%,-50%)_rotate(45deg)]" : "[transform:translate(-50%,calc(-50%-5px))]"}`}
      />
      <span
        className={`${line} ${open ? "opacity-0 [transform:translate(-50%,-50%)_scale(0.6)]" : "opacity-100 [transform:translate(-50%,-50%)]"}`}
      />
      <span
        className={`${line} ${open ? "[transform:translate(-50%,-50%)_rotate(-45deg)]" : "[transform:translate(-50%,calc(-50%+5px))]"}`}
      />
    </div>
  );
}



export function Nav() {
  const { count } = useCart();
  const { user } = useAuth();
  const { slugs: wishSlugs } = useWishlist();
  const { effectiveTheme } = useTheme();
  const isLight = effectiveTheme === "light";
  const [open, setOpen] = useState(false);
  // Keep the drawer mounted during its exit transition.
  const [drawerMounted, setDrawerMounted] = useState(false);
  const [drawerVisible, setDrawerVisible] = useState(false);
  const [searchOpen, setSearchOpen] = useState(false);
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
        setSearchOpen(true);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  const navLinks = [
    { to: "/", label: "Shop" },
    { to: "/category/$slug", params: { slug: "electronics" }, label: "Electronics" },
    
    { to: "/category/$slug", params: { slug: "home" }, label: "Home" },
    { to: "/category/$slug", params: { slug: "beauty" }, label: "Beauty" },
    { to: "/category/$slug", params: { slug: "pet-supplies" }, label: "Pet Supplies" },
    { to: "/deals", label: "Deals" },
  ] as const;

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
    { to: "/wishlist" as const, label: "Wishlist", icon: Heart, badge: wishSlugs.size },
    { to: "/cart" as const, label: "Cart", icon: ShoppingBag, badge: count },
    { to: "/track" as const, label: "Track Order", icon: Truck, badge: null as number | null },
  ];

  const displayName = user
    ? ((user.user_metadata?.full_name as string) || (user.email?.split("@")[0] ?? "Account"))
    : "FoundOurMarket™";
  const initial = (displayName?.[0] ?? "F").toUpperCase();

  const lastY = useRef(0);
  const [hidden, setHidden] = useState(false);
  useEffect(() => {
    const onScroll = () => {
      const y = window.scrollY;
      const prev = lastY.current;
      if (y > prev && y > 80) setHidden(true);
      else if (y < prev - 4) setHidden(false);
      lastY.current = y;
    };
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, []);

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
        data-app-header
        style={{
          transform: hidden ? "translateY(-120px)" : "translateY(0)",
          opacity: hidden ? 0 : 1,
          filter: hidden ? "blur(6px)" : "blur(0px)",
          transition: "transform 0.45s cubic-bezier(0.22,1,0.36,1), opacity 0.35s ease, filter 0.35s ease",
          willChange: "transform, opacity",
        }}
        className="sticky top-0 z-50 px-[max(0.75rem,var(--mobile-safe-left))] sm:px-4 pt-[calc(var(--mobile-safe-top)+0.75rem)] sm:pt-[calc(var(--mobile-safe-top)+1rem)]"
      >
        <nav className="max-w-7xl mx-auto rounded-2xl glass-strong shadow-[var(--shadow-float)] ring-1 ring-white/10">
          <div className="flex items-center justify-start px-2 sm:px-5 py-2 sm:py-2.5 gap-1 sm:gap-2">
            {/* Zone 1 — Hamburger (mobile only) */}
            <button
              onClick={() => setOpen(!open)}
              aria-label={open ? "Close menu" : "Open menu"}
              className="md:hidden shrink-0 ml-[8px] size-10 sm:size-11 rounded-xl grid place-items-center text-muted-foreground hover:text-foreground hover:bg-white/5 active:bg-accent/10 active:text-accent transition-all duration-200"
            >
              <AnimatedHamburger open={open} />
            </button>

            {/* Zone 2 — Logo + Brand */}
            <Link
              to="/"
              className="min-w-0 flex-1 md:flex-none flex items-center gap-2 sm:gap-2.5 -ml-0.5 md:ml-0 font-display tracking-tight font-semibold"
            >
              <span className="shrink-0 relative inline-grid place-items-center size-8 sm:size-11 rounded-2xl bg-black/40 ring-1 ring-accent/30 overflow-hidden shadow-[0_0_20px_-4px_var(--color-accent)]">
                <img src={logoSrc} alt="FoundOurMarket logo" className="size-full object-cover" />
              </span>
              <span className="flex min-w-0 flex-col leading-none">
                <span className="truncate text-[15px] sm:text-xl font-semibold tracking-tight">
                  FoundOurMarket<span className="text-accent">™</span>
                </span>
                <span className="mt-0.5 text-[8px] sm:text-[10px] font-mono uppercase tracking-[0.2em] text-accent/80 truncate">
                  Global Marketplace
                </span>
              </span>
            </Link>

            {/* Desktop nav links — centered */}
            <div className="hidden md:flex flex-1 justify-center items-center gap-1 text-[13px] font-medium text-muted-foreground">
              {navLinks.map((l) => (
                <Link
                  key={l.label}
                  to={l.to}
                  params={"params" in l ? l.params : undefined as never}
                  activeProps={{ className: "text-foreground bg-white/5" }}
                  className="px-3.5 py-1.5 rounded-full hover:text-foreground hover:bg-white/5 transition-all whitespace-nowrap"
                >
                  {l.label}
                </Link>
              ))}
            </div>

            {/* Zone 3 — Search • Notifications • Cart */}
            <div className="shrink-0 ml-auto flex items-center gap-0.5 sm:gap-1">
              <button
                onClick={() => setSearchOpen(true)}
                aria-label="Search"
                className="size-10 sm:size-11 rounded-xl grid place-items-center text-muted-foreground hover:text-foreground hover:bg-white/5 active:bg-accent/10 active:text-accent active:scale-95 transition-all duration-200"
              >
                <Search className="size-[18px]" />
              </button>

              <div className="hidden lg:block">
                <CurrencySwitcher />
              </div>

              <Link
                to="/wishlist"
                aria-label="Wishlist"
                className="relative hidden sm:grid size-10 sm:size-11 rounded-xl place-items-center text-muted-foreground hover:text-foreground hover:bg-white/5 active:bg-accent/10 active:text-accent active:scale-95 transition-all duration-200"
              >
                <Heart className="size-[18px]" />
                {wishSlugs.size > 0 && (
                  <span className="absolute -top-0.5 -right-0.5 min-w-4 h-4 px-1 rounded-full bg-accent text-accent-foreground text-[9px] font-bold font-mono grid place-items-center">
                    {wishSlugs.size}
                  </span>
                )}
              </Link>

              {isAdmin && (
                <Link
                  to="/admin"
                  aria-label="Admin"
                  className="hidden sm:grid size-10 sm:size-11 rounded-xl place-items-center text-muted-foreground hover:text-foreground hover:bg-white/5 active:bg-accent/10 active:text-accent active:scale-95 transition-all duration-200"
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
                        ? <img src={user.user_metadata.avatar_url as string} alt="" className="size-full object-cover" />
                        : <User className="size-[17px]" />}
                    </span>
                    <span className="text-[13px] font-medium max-w-[7rem] truncate">{user ? "Account" : "Sign in"}</span>
                  </button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end" className="w-56 glass-strong border-white/10">
                  <DropdownMenuLabel className="truncate">{user ? displayName : "Welcome to FoundOurMarket™"}</DropdownMenuLabel>
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
                className="shrink-0 relative flex items-center justify-center gap-1 sm:gap-1.5 h-10 sm:h-11 min-w-10 sm:min-w-11 px-2 sm:px-3.5 rounded-xl bg-accent text-accent-foreground hover:brightness-110 active:scale-[0.97] transition-all shadow-[var(--shadow-ember)]"
              >
                <ShoppingBag className="size-[18px]" />
                <span className="text-xs font-mono font-semibold">{count}</span>
              </Link>
            </div>
          </div>
        </nav>
      </div>


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
          wishCount={wishSlugs.size}
          cartCount={count}
          isAdmin={isAdmin}
          avatarUrl={user?.user_metadata?.avatar_url as string | undefined}
        />
      )}

      {searchOpen && (
        <Suspense fallback={null}>
          <SearchCommand open={searchOpen} onClose={() => setSearchOpen(false)} />
        </Suspense>
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

