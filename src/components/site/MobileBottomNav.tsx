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
import { scrollDampeningMs } from "@/lib/motion-tier";

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
  const compactRef = useRef(false);
  useEffect(() => {
    // Single source of scroll state. One rAF evaluator decides the nav state;
    // a scroll-stop detector then LOCKS the state for a settle window so residual
    // inertia deltas can't flap it (the cause of the Android Chrome vibration).
    const THRESHOLD = 7; // ignore sub-threshold jitter/noise
    let rafId = 0;
    let ticking = false;
    let locked = false;
    let idleTimer: ReturnType<typeof setTimeout> | undefined;
    let lockTimer: ReturnType<typeof setTimeout> | undefined;

    const commit = (next: boolean) => {
      if (next === compactRef.current) return;
      compactRef.current = next;
      setCompact(next);
    };

    const evaluate = () => {
      ticking = false;
      if (locked) return;
      const y = window.scrollY;
      const delta = y - lastY.current;
      if (Math.abs(delta) < THRESHOLD) return; // micro-flap guard
      if (y > 80 && delta > 0) commit(true);
      else if (delta < 0 || y < 40) commit(false);
      lastY.current = y;
    };

    const onScroll = () => {
      // Scroll-stop detection → one final frame commit, then freeze the state
      // for a settle lock window. No recalculation happens during the lock, which
      // removes the oscillation/vibration entirely.
      if (idleTimer) clearTimeout(idleTimer);
      idleTimer = setTimeout(() => {
        locked = true;
        requestAnimationFrame(() => {
          commit(window.scrollY < 40 ? false : compactRef.current);
        });
        if (lockTimer) clearTimeout(lockTimer);
        lockTimer = setTimeout(() => {
          locked = false;
          lastY.current = window.scrollY;
        }, scrollDampeningMs() + 120);
      }, 90);

      if (ticking || locked) return;
      ticking = true;
      rafId = requestAnimationFrame(evaluate);
    };

    window.addEventListener("scroll", onScroll, { passive: true });
    return () => {
      window.removeEventListener("scroll", onScroll);
      cancelAnimationFrame(rafId);
      if (idleTimer) clearTimeout(idleTimer);
      if (lockTimer) clearTimeout(lockTimer);
    };
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
        style={{ willChange: "transform" }}
        className={
          (frosted
            ? "bottom-nav-light pointer-events-auto relative mx-auto grid max-w-md grid-cols-5 rounded-[30px] px-2"
            : "nav-glass pointer-events-auto relative mx-auto grid max-w-md grid-cols-5 rounded-[30px] px-2") +
          // Transform ONLY on state switch — no height/padding animation (those
          // reflow and cause the settle-phase vibration on Chrome Android). The
          // dimensions stay fixed; compaction is expressed purely via transform
          // (dock lift) plus the children's opacity/scale. transform-gpu keeps a
          // single stable compositor layer so the settle never flickers.
          ` h-[var(--mobile-nav-surface-height)] py-2 transform-gpu transition-transform duration-200 ease-[cubic-bezier(0.2,0.8,0.2,1)] shadow-[0_16px_42px_-18px_oklch(0_0_0/0.7)] ${
            compact ? "-translate-y-1.5" : "translate-y-0"
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
                  {/* Energy pulse field behind the active icon — soft radial bloom, breathing */}
                  <span
                    aria-hidden
                    className={`absolute inset-0 rounded-full blur-[7px] transition-opacity duration-300 ease-[cubic-bezier(0.2,0.8,0.2,1)] [background:radial-gradient(circle,color-mix(in_oklab,var(--color-accent)_55%,transparent)_0%,transparent_70%)] ${
                      active ? "opacity-100 animate-energy-breathe" : "opacity-0"
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
