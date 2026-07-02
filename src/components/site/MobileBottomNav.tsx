import { Link, useRouterState } from "@tanstack/react-router";
import { useEffect, useRef, useState } from "react";
import { Home, Search, Heart, ShoppingBag, User } from "lucide-react";
import { useCart } from "@/lib/cart";
import { useAuth } from "@/lib/auth";
import { useWishlist } from "@/lib/wishlist";
import { useAdminMode } from "@/lib/admin-mode";
import { useIsAdmin } from "@/lib/use-admin";
import { useTheme } from "@/lib/theme";
import { useSupportUnread } from "@/lib/use-support-unread";

export function MobileBottomNav() {
  const { count } = useCart();
  const { user } = useAuth();
  const { slugs } = useWishlist();
  const { adminMode } = useAdminMode();
  const { isAdmin } = useIsAdmin();
  const { effectiveTheme } = useTheme();
  const { count: supportUnread } = useSupportUnread();
  const pathname = useRouterState({ select: (s) => s.location.pathname });

  // Direction-aware compaction: scrolling down collapses labels for a cleaner
  // reading area; scrolling up (or near the top) restores them. Transform/size
  // only — no blur or filters, to stay stable on Chrome Android.
  const [compact, setCompact] = useState(false);
  const lastY = useRef(0);
  useEffect(() => {
    let ticking = false;
    const update = () => {
      const y = window.scrollY;
      const prev = lastY.current;
      if (y > prev && y > 80) setCompact(true);
      else if (y < prev - 4 || y < 40) setCompact(false);
      lastY.current = y;
      ticking = false;
    };
    const onScroll = () => {
      if (ticking) return;
      ticking = true;
      requestAnimationFrame(update);
    };
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, []);

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
    { to: user ? "/account" : "/auth", label: "Account", icon: User, match: (p) => p === "/account" || p === "/auth", badge: user ? supportUnread : 0 },
  ];

  return (
    <nav
      data-app-bottom-nav
      aria-label="Primary mobile navigation"
      className="md:hidden fixed inset-x-0 bottom-0 z-[var(--z-bottom-nav)] px-[max(0.875rem,var(--mobile-safe-left))] pb-[calc(var(--mobile-safe-bottom)+var(--mobile-nav-edge-gap))] pt-[var(--mobile-nav-top-gap)] pointer-events-none"
    >
      <ul
        data-compact={compact ? "" : undefined}
        className={
          (frosted
            ? "bottom-nav-light pointer-events-auto relative mx-auto grid max-w-md grid-cols-5 rounded-[30px] px-2"
            : "nav-glass pointer-events-auto relative mx-auto grid max-w-md grid-cols-5 rounded-[30px] px-2") +
          ` transition-[height,padding,transform,box-shadow] duration-200 ease-[cubic-bezier(0.2,0.8,0.2,1)] ${
            compact
              ? "h-[calc(var(--mobile-nav-surface-height)-12px)] py-1 -translate-y-1.5 shadow-[0_18px_46px_-16px_oklch(0_0_0/0.75)]"
              : "h-[var(--mobile-nav-surface-height)] py-2 translate-y-0"
          }`
        }
      >

        {items.map(({ to, label, icon: Icon, match, badge }) => {
          const active = match(pathname);
          return (
            <li key={label} className="min-w-0">
              <Link
                to={to}
                aria-current={active ? "page" : undefined}
                className="group flex h-full min-h-12 flex-col items-center justify-center gap-1 rounded-2xl text-[10px] font-medium"
              >
                <span
                  className={`relative grid place-items-center size-9 rounded-2xl transition-transform duration-200 ease-[cubic-bezier(0.2,0.8,0.2,1)] active:scale-90 ${
                    compact ? "scale-[1.08]" : "scale-100"
                  }`}
                >
                  {/* Soft energy pulse sitting behind the active icon — no ring/border */}
                  <span
                    aria-hidden
                    className={`absolute inset-0 rounded-full blur-[6px] transition-all duration-300 ease-[cubic-bezier(0.2,0.8,0.2,1)] ${
                      active
                        ? "scale-105 bg-accent/25 opacity-100"
                        : "scale-50 opacity-0"
                    }`}
                  />


                  <span className="relative">
                    <Icon
                      className={`size-[21px] transition-colors duration-200 ${
                        active ? "text-accent" : frosted ? "text-muted-foreground" : "text-foreground/65"
                      }`}
                      strokeWidth={active ? 2.5 : 2}
                    />
                    {typeof badge === "number" && badge > 0 && (
                      <span className="absolute -top-1.5 -right-2 grid h-[17px] min-w-[17px] place-items-center rounded-full bg-accent px-1 text-[9px] font-bold leading-none text-accent-foreground ring-2 ring-background">
                        {badge > 99 ? "99+" : badge}
                      </span>
                    )}
                  </span>
                </span>

                <span
                  aria-hidden={compact}
                  className={`h-3 max-w-full truncate leading-none transition-[opacity,transform] duration-200 ease-out ${
                    compact ? "pointer-events-none scale-90 opacity-0" : "scale-100 opacity-100"
                  } ${
                    active ? "font-semibold text-accent" : frosted ? "text-muted-foreground" : "text-foreground/60"
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
