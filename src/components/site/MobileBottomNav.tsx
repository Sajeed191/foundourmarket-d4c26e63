import { Link, useRouterState } from "@tanstack/react-router";
import { Home, Search, Heart, ShoppingBag, User } from "lucide-react";
import { useCart } from "@/lib/cart";
import { useAuth } from "@/lib/auth";
import { useWishlist } from "@/lib/wishlist";
import { useAdminMode } from "@/lib/admin-mode";
import { useIsAdmin } from "@/lib/use-admin";
import { useTheme } from "@/lib/theme";

export function MobileBottomNav() {
  const { count } = useCart();
  const { user } = useAuth();
  const { slugs } = useWishlist();
  const { adminMode } = useAdminMode();
  const { isAdmin } = useIsAdmin();
  const { effectiveTheme } = useTheme();
  const pathname = useRouterState({ select: (s) => s.location.pathname });

  // Hand the bottom dock over to the admin bar when a staff member is actively
  // managing the store, so the two navigations never stack.
  if (adminMode && isAdmin) return null;

  // Light & grey themes get a dedicated frosted-glass surface so the bar stays
  // fully visible against their light backgrounds. Dark is left as before.
  const isLight = effectiveTheme === "light";
  const isGrey = effectiveTheme === "grey";
  const frosted = isLight || isGrey;

  const items: { to: string; label: string; icon: typeof Home; match: (p: string) => boolean; badge?: number }[] = [
    { to: "/", label: "Home", icon: Home, match: (p) => p === "/" },
    { to: "/search", label: "Search", icon: Search, match: (p) => p === "/search" || p.startsWith("/category") },
    { to: "/wishlist", label: "Saved", icon: Heart, match: (p) => p === "/wishlist", badge: slugs.size },
    { to: "/cart", label: "Cart", icon: ShoppingBag, match: (p) => p === "/cart", badge: count },
    { to: user ? "/account" : "/auth", label: "Account", icon: User, match: (p) => p === "/account" || p === "/auth" },
  ];

  return (
    <nav
      data-app-bottom-nav
      aria-label="Primary mobile navigation"
      className="md:hidden fixed inset-x-0 bottom-0 z-[var(--z-bottom-nav)] px-[max(0.75rem,var(--mobile-safe-left))] pb-[calc(var(--mobile-safe-bottom)+var(--mobile-nav-edge-gap))] pt-[var(--mobile-nav-top-gap)] pointer-events-none"
    >
      {/* Soft ambient glow — reduced ~40%, subtle only */}
      <div
        aria-hidden
        className={`absolute inset-x-16 bottom-[calc(var(--mobile-safe-bottom)+var(--mobile-nav-edge-gap))] h-16 -z-10 blur-2xl ${isLight ? "opacity-[0.12]" : "opacity-[0.18]"}`}
        style={{ background: "var(--gradient-ember-soft)" }}
      />
      <ul
        className={
          isLight
            ? "bottom-nav-light pointer-events-auto relative max-w-7xl mx-auto grid h-[var(--mobile-nav-surface-height)] grid-cols-5 rounded-[26px] px-1.5 py-2"
            : "pointer-events-auto relative max-w-7xl mx-auto grid h-[var(--mobile-nav-surface-height)] grid-cols-5 rounded-2xl glass-strong border border-white/10 shadow-[0_8px_28px_-12px_oklch(0_0_0/0.6)] px-1.5 py-2"
        }
      >
        {items.map(({ to, label, icon: Icon, match, badge }) => {
          const active = match(pathname);
          return (
            <li key={label} className="min-w-0">
              <Link
                to={to}
                className="flex h-full flex-col items-center justify-center gap-1.5 rounded-xl text-[10px] font-medium transition-colors duration-200"
              >
                <span className="relative grid place-items-center size-8 rounded-full transition-all duration-300 ease-out active:scale-90">
                  {/* Small premium capsule behind icon only */}
                  <span
                    aria-hidden
                    className={
                      isLight
                        ? `absolute inset-0 rounded-full bg-accent/12 ring-1 ring-accent/25 shadow-[0_4px_12px_-4px_oklch(0.66_0.205_47/0.4)] transition-all duration-300 ${active ? "opacity-100 scale-100" : "opacity-0 scale-75"}`
                        : `absolute inset-0 rounded-full bg-accent/15 ring-1 ring-accent/30 transition-opacity duration-200 ${active ? "opacity-100" : "opacity-0"}`
                    }
                  />
                  <span className="relative">
                    <Icon
                      className={`size-[19px] transition-colors duration-200 ${
                        active ? "text-accent" : isLight ? "text-muted-foreground" : "text-white/70"
                      }`}
                      strokeWidth={active ? 2.4 : 2}
                    />
                    {typeof badge === "number" && badge > 0 && (
                      <span className="absolute -top-1.5 -right-2 min-w-4 h-4 px-1 rounded-full text-[9px] font-bold grid place-items-center ring-2 ring-background bg-accent text-accent-foreground">
                        {badge > 99 ? "99+" : badge}
                      </span>
                    )}
                  </span>
                </span>
                <span
                  className={`truncate max-w-full leading-none transition-colors duration-200 ${
                    active ? "text-accent font-semibold" : isLight ? "text-muted-foreground" : "text-white/60"
                  }`}
                >
                  {label}
                </span>
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
