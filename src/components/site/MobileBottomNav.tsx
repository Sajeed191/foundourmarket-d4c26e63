import { Link, useRouterState } from "@tanstack/react-router";
import { Home, Search, Heart, ShoppingBag, User } from "lucide-react";
import { useCart } from "@/lib/cart";
import { useAuth } from "@/lib/auth";
import { useWishlist } from "@/lib/wishlist";
import { useAdminMode } from "@/lib/admin-mode";
import { useIsAdmin } from "@/lib/use-admin";

export function MobileBottomNav() {
  const { count } = useCart();
  const { user } = useAuth();
  const { slugs } = useWishlist();
  const { adminMode } = useAdminMode();
  const { isAdmin } = useIsAdmin();
  const pathname = useRouterState({ select: (s) => s.location.pathname });

  // Hand the bottom dock over to the admin bar when a staff member is actively
  // managing the store, so the two navigations never stack.
  if (adminMode && isAdmin) return null;


  const items: { to: string; label: string; icon: typeof Home; match: (p: string) => boolean; badge?: number }[] = [
    { to: "/", label: "Home", icon: Home, match: (p) => p === "/" },
    { to: "/search", label: "Search", icon: Search, match: (p) => p === "/search" || p.startsWith("/category") },
    { to: "/wishlist", label: "Saved", icon: Heart, match: (p) => p === "/wishlist", badge: slugs.size },
    { to: "/cart", label: "Cart", icon: ShoppingBag, match: (p) => p === "/cart", badge: count },
    { to: user ? "/account" : "/auth", label: user ? "Me" : "Sign in", icon: User, match: (p) => p === "/account" || p === "/auth" },
  ];

  return (
    <nav
      data-app-bottom-nav
      aria-label="Primary mobile navigation"
      className="md:hidden fixed inset-x-0 bottom-0 z-[var(--z-bottom-nav)] px-[max(0.75rem,var(--mobile-safe-left))] pb-[calc(var(--mobile-safe-bottom)+var(--mobile-nav-edge-gap))] pt-[var(--mobile-nav-top-gap)] pointer-events-none"
    >
      <div
        aria-hidden
        className="absolute inset-x-10 bottom-[calc(var(--mobile-safe-bottom)+var(--mobile-nav-edge-gap))] h-20 -z-10 blur-3xl opacity-45"
        style={{ background: "var(--gradient-ember-soft)" }}
      />
      <ul
        className="pointer-events-auto relative max-w-7xl mx-auto grid h-[var(--mobile-nav-surface-height)] grid-cols-5 gap-0.5 rounded-2xl glass-strong ring-1 ring-white/10 shadow-[var(--shadow-float),0_0_60px_-22px_oklch(0.74_0.19_49/0.45)] px-2.5 py-2.5"
      >
        {items.map(({ to, label, icon: Icon, match, badge }) => {
          const active = match(pathname);
          return (
            <li key={label} className="relative">
              <Link
                to={to}
                className={`relative flex h-full flex-col items-center justify-center gap-1.5 py-2 rounded-2xl text-[10px] font-mono uppercase tracking-widest transition-colors ${
                  active ? "text-accent-foreground" : "text-white/70 hover:text-white"
                }`}
              >
                <span
                  aria-hidden
                  className={`absolute inset-0 rounded-2xl bg-accent shadow-[0_6px_16px_-8px_var(--color-accent),0_0_0_1px_oklch(1_0_0/0.12)_inset] transition-opacity duration-300 ${active ? "opacity-100" : "opacity-0"}`}
                />
                <span
                  className="relative transition-transform duration-300 ease-out"
                  style={{ transform: active ? "translateY(-1px) scale(1.08)" : "none" }}
                >
                  <Icon className="size-[20px]" strokeWidth={active ? 2.6 : 2} />
                  {typeof badge === "number" && badge > 0 && (
                    <span className={`absolute -top-1.5 -right-2 min-w-4 h-4 px-1 rounded-full text-[9px] font-bold grid place-items-center ring-2 ring-background ${
                      active ? "bg-background text-accent" : "bg-accent text-accent-foreground shadow-[0_0_10px_var(--color-accent)]"
                    }`}>
                      {badge > 99 ? "99+" : badge}
                    </span>
                  )}
                </span>
                <span className={`relative truncate max-w-full text-[10px] font-semibold tracking-wide ${active ? "opacity-100" : "opacity-80"}`}>{label}</span>
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
