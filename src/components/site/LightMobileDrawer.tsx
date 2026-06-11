import { Link } from "@tanstack/react-router";
import {
  ShoppingBag, Heart, X, LayoutDashboard, Package, Truck, ChevronRight,
  LifeBuoy, Mail, MessageCircle, HelpCircle,
  Sparkles, TrendingUp, Zap, Grid3x3, Crown, Home as HomeIcon, Clock,
  Monitor, Moon, Palette, Sun, Check, ShieldCheck,
} from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useTheme, THEME_OPTIONS, type ThemePreference } from "@/lib/theme";
import type { Category } from "@/lib/use-categories";

const THEME_ICONS: Record<ThemePreference, React.ComponentType<{ className?: string }>> = {
  system: Monitor,
  dark: Moon,
  grey: Palette,
  light: Sun,
};

function catFallbackIcon(slug: string, name: string) {
  const hay = `${slug} ${name}`.toLowerCase();
  if (/(home|decor|furnitur|kitchen)/.test(hay)) return HomeIcon;
  return Package;
}

type Props = {
  visible: boolean;
  onClose: () => void;
  user: unknown;
  displayName: string;
  initial: string;
  membership?: string;
  ordersCount: number | null;
  cats: Category[];
  wishCount: number;
  cartCount: number;
  isAdmin: boolean;
  avatarUrl?: string;
};

const quickActions = [
  { to: "/account/orders" as const, label: "Orders", icon: Package, tone: "amber" },
  { to: "/wishlist" as const, label: "Wishlist", icon: Heart, tone: "rose" },
  { to: "/cart" as const, label: "Cart", icon: ShoppingBag, tone: "blue" },
  { to: "/recently-viewed" as const, label: "Recently", icon: Clock, tone: "emerald" },
];

const mainNav = [
  { to: "/" as const, label: "Home", icon: HomeIcon },
  { to: "/categories" as const, label: "Categories", icon: Grid3x3 },
  { to: "/products/trending" as const, label: "Trending Products", icon: TrendingUp },
  { to: "/deals" as const, label: "Flash Deals", icon: Zap },
  { to: "/products/best-sellers" as const, label: "Best Sellers", icon: Crown },
  { to: "/products/new-arrivals" as const, label: "New Arrivals", icon: Sparkles },
  { to: "/track" as const, label: "Track Order", icon: Truck },
];

const supportLinks = [
  { to: "/contact" as const, label: "Contact Us", icon: Mail },
  { to: "/help" as const, label: "Live Chat", icon: MessageCircle },
  { to: "/help" as const, label: "Help Center", icon: LifeBuoy },
  { to: "/help" as const, label: "FAQ", icon: HelpCircle },
];


const TONES: Record<string, string> = {
  amber: "bg-amber-500/15 text-amber-600 dark:text-amber-400",
  rose: "bg-rose-500/15 text-rose-600 dark:text-rose-400",
  blue: "bg-blue-500/15 text-blue-600 dark:text-blue-400",
  emerald: "bg-emerald-500/15 text-emerald-600 dark:text-emerald-400",
};

export function LightMobileDrawer({
  visible, onClose, user, displayName, initial, membership, ordersCount,
  cats, wishCount, cartCount, isAdmin, avatarUrl,
}: Props) {
  const { theme, setTheme } = useTheme();

  const badgeFor = (label: string) =>
    label === "Wishlist" ? wishCount : label === "Cart" ? cartCount : 0;

  return (
    <div className="fixed inset-0 z-[100] md:hidden">
      {/* Soft blurred backdrop */}
      <div
        style={{ opacity: visible ? 1 : 0, transition: "opacity 0.3s ease" }}
        className="absolute inset-0 bg-foreground/30 backdrop-blur-[6px]"
        onClick={onClose}
      />
      <aside
        style={{
          transform: visible ? "translateX(0)" : "translateX(-100%)",
          transition: "transform 0.42s cubic-bezier(0.22,1,0.36,1)",
        }}
        className="absolute left-0 top-0 bottom-0 w-[92%] max-w-[420px] flex flex-col overflow-hidden border-r border-border bg-background shadow-[0_0_60px_-10px_oklch(0.4_0.02_260/0.25)] will-change-transform"
      >
        {/* Header */}
        <div className="flex items-center justify-between px-5 pt-5 pb-3">
          <Link to="/" onClick={onClose} className="text-[20px] font-display tracking-tight font-semibold flex items-center gap-3">
            <img src="/logo.webp" alt="FoundOurMarket logo" className="size-[50px] rounded-xl object-cover ring-1 ring-border" />
            FoundOurMarket<span className="text-accent">™</span>
          </Link>
          <button
            onClick={onClose}
            aria-label="Close menu"
            className="size-9 rounded-full grid place-items-center bg-card text-muted-foreground ring-1 ring-border shadow-sm hover:text-foreground active:scale-95 transition"
          >
            <X className="size-4.5" />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto px-4 pt-2 pb-5 space-y-5">
          {/* 1. Premium user header */}
          <Link
            to={user ? "/account" : "/auth"}
            onClick={onClose}
            className="group relative flex items-center gap-4 rounded-3xl px-5 py-5 overflow-hidden bg-accent/10 ring-1 ring-accent/20 shadow-[var(--shadow-card)] active:scale-[0.985] transition-transform"
          >
            <span className="relative shrink-0">
              <span className="relative grid place-items-center size-13 rounded-full bg-gradient-to-br from-accent to-[oklch(0.6_0.16_30)] text-accent-foreground font-semibold text-lg ring-2 ring-background shadow-[0_6px_18px_-6px_oklch(0.55_0.16_55/0.7)] overflow-hidden">
                {avatarUrl ? <img src={avatarUrl} alt="" className="size-full object-cover" /> : initial}
              </span>
            </span>
            <span className="min-w-0 flex-1">
              <span className="block text-[11px] font-medium text-muted-foreground">{user ? "Welcome back" : "Welcome to"}</span>
              <span className="flex items-center gap-1.5 min-w-0">
                <span className="block truncate text-[16px] font-bold text-foreground">{displayName}</span>
                {membership && (
                  <span className="shrink-0 inline-flex items-center gap-1 rounded-full bg-accent/12 text-accent ring-1 ring-accent/25 px-1.5 py-0.5 text-[9px] font-bold uppercase tracking-wide">
                    <Crown className="size-2.5" /> {membership}
                  </span>
                )}
              </span>
              <span className="mt-1 inline-flex items-center gap-1 text-[11px] font-semibold text-accent">
                {user ? (
                  <>
                    <ShieldCheck className="size-3" />
                    {ordersCount != null ? `${ordersCount} ${ordersCount === 1 ? "order" : "orders"} · View profile` : "View profile"}
                  </>
                ) : "Sign in →"}
              </span>
            </span>
            <ChevronRight className="size-4 text-muted-foreground group-hover:translate-x-0.5 transition" />
          </Link>

          {/* 2. Quick access */}
          <div>
            <p className="px-1 mb-2 text-[11px] font-bold uppercase tracking-[0.18em] text-muted-foreground">Quick Access</p>
            <div className="grid grid-cols-2 gap-2.5">
              {quickActions.map((q) => {
                const badge = badgeFor(q.label);
                return (
                  <Link
                    key={q.label}
                    to={q.to}
                    onClick={onClose}
                    className="relative flex items-center gap-2.5 rounded-2xl bg-card px-3.5 py-3 ring-1 ring-border shadow-[var(--shadow-card)] active:scale-[0.97] hover:ring-accent/30 transition"
                  >
                    <span className={`grid place-items-center size-9 rounded-xl ${TONES[q.tone]}`}>
                      <q.icon className="size-4.5" />
                    </span>
                    <span className="text-[13px] font-semibold text-foreground truncate">{q.label}</span>
                    {badge > 0 && (
                      <span className="ml-auto min-w-4 h-4 px-1 rounded-full bg-accent text-accent-foreground text-[9px] font-bold grid place-items-center">{badge}</span>
                    )}
                  </Link>
                );
              })}
            </div>
          </div>

          {/* 3. Main navigation */}
          <div>
            <p className="px-1 mb-2 text-[11px] font-bold uppercase tracking-[0.18em] text-muted-foreground">Browse</p>
            <div className="rounded-2xl bg-card ring-1 ring-border shadow-[var(--shadow-card)] overflow-hidden divide-y divide-border">
              {mainNav.map((item) => (
                <Link
                  key={item.label}
                  to={item.to}
                  onClick={onClose}
                  className="group flex items-center gap-3.5 px-4 py-3.5 active:bg-muted/50 transition"
                >
                  <span className="grid place-items-center size-9 rounded-xl bg-muted text-muted-foreground group-hover:bg-accent/12 group-hover:text-accent transition">
                    <item.icon className="size-4.5" />
                  </span>
                  <span className="flex-1 text-[14.5px] font-semibold text-foreground">{item.label}</span>
                  <ChevronRight className="size-4 text-muted-foreground/50 group-hover:text-accent group-hover:translate-x-0.5 transition" />
                </Link>
              ))}
            </div>
          </div>

          {/* Categories (top 6) */}
          {cats.length > 0 && (
            <div>
              <p className="px-1 mb-2 text-[11px] font-bold uppercase tracking-[0.18em] text-muted-foreground">Categories</p>
              <div className="grid grid-cols-2 gap-2.5">
                {cats.slice(0, 6).map((cat) => {
                  const img = cat.mobile_image || cat.image;
                  const Fallback = catFallbackIcon(cat.slug, cat.name);
                  return (
                    <Link
                      key={cat.id}
                      to="/category/$slug"
                      params={{ slug: cat.slug }}
                      onClick={() => {
                        onClose();
                        void supabase.rpc("track_category_event", { _id: cat.id, _event: "click" });
                      }}
                      className="flex items-center gap-2.5 rounded-2xl bg-card px-3 py-2.5 ring-1 ring-border shadow-[var(--shadow-card)] active:scale-[0.97] hover:ring-accent/30 transition"
                    >
                      <span className="grid place-items-center size-9 rounded-xl overflow-hidden bg-muted text-accent shrink-0">
                        {img ? <img src={img} alt="" loading="lazy" className="size-full object-cover" /> : <Fallback className="size-4.5" />}
                      </span>
                      <span className="flex-1 min-w-0 text-[13px] font-semibold text-foreground truncate">{cat.name}</span>
                    </Link>
                  );
                })}
              </div>
            </div>
          )}

          {/* 4. Support card */}
          <div>
            <p className="px-1 mb-2 text-[11px] font-bold uppercase tracking-[0.18em] text-muted-foreground">Support</p>
            <div className="rounded-2xl p-2 bg-accent/8 ring-1 ring-accent/15 shadow-[var(--shadow-card)] grid grid-cols-2 gap-1.5">
              {supportLinks.map((s) => (
                <Link
                  key={s.label}
                  to={s.to}
                  onClick={onClose}
                  className="flex items-center gap-2 rounded-xl bg-card/70 px-3 py-2.5 active:scale-[0.97] hover:bg-card transition"
                >
                  <s.icon className="size-4 text-accent shrink-0" />
                  <span className="text-[12.5px] font-semibold text-foreground truncate">{s.label}</span>
                </Link>
              ))}
            </div>
          </div>

          {/* 5. Appearance / theme selector */}
          <div>
            <p className="px-1 mb-2 text-[11px] font-bold uppercase tracking-[0.18em] text-muted-foreground">Appearance</p>
            <div className="grid grid-cols-4 gap-1.5 rounded-2xl bg-muted p-1.5 ring-1 ring-border">
              {THEME_OPTIONS.map((opt) => {
                const Icon = THEME_ICONS[opt.value];
                const active = theme === opt.value;
                return (
                  <button
                    key={opt.value}
                    type="button"
                    onClick={() => setTheme(opt.value)}
                    className={`relative flex flex-col items-center gap-1.5 rounded-xl py-2.5 transition ${
                      active
                        ? "bg-card text-accent shadow-[var(--shadow-card)] ring-1 ring-accent/25"
                        : "text-muted-foreground active:scale-95"
                    }`}
                  >
                    {active && (
                      <span className="absolute right-1 top-1 grid size-3.5 place-items-center rounded-full bg-accent text-accent-foreground">
                        <Check className="size-2.5" />
                      </span>
                    )}
                    <Icon className="size-4.5" />
                    <span className="text-[10px] font-semibold">{opt.label}</span>
                  </button>
                );
              })}
            </div>
          </div>

          {isAdmin && (
            <Link
              to="/admin"
              onClick={onClose}
              className="flex items-center justify-center gap-2 rounded-2xl bg-accent/10 px-3 py-3 text-[13px] font-bold text-accent ring-1 ring-accent/25 active:scale-[0.98] transition"
            >
              <LayoutDashboard className="size-4" /> Admin Panel
            </Link>
          )}
        </div>
      </aside>
    </div>
  );
}
