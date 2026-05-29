import { Link, useRouterState } from "@tanstack/react-router";
import { Home, Search, Heart, ShoppingBag, User } from "lucide-react";
import { motion } from "framer-motion";
import { useCart } from "@/lib/cart";
import { useAuth } from "@/lib/auth";
import { useWishlist } from "@/lib/wishlist";

export function MobileBottomNav() {
  const { count } = useCart();
  const { user } = useAuth();
  const { slugs } = useWishlist();
  const pathname = useRouterState({ select: (s) => s.location.pathname });

  const items: { to: string; label: string; icon: typeof Home; match: (p: string) => boolean; badge?: number }[] = [
    { to: "/", label: "Home", icon: Home, match: (p) => p === "/" },
    { to: "/search", label: "Search", icon: Search, match: (p) => p === "/search" || p.startsWith("/category") },
    { to: "/wishlist", label: "Saved", icon: Heart, match: (p) => p === "/wishlist", badge: slugs.size },
    { to: "/cart", label: "Cart", icon: ShoppingBag, match: (p) => p === "/cart", badge: count },
    { to: user ? "/account" : "/auth", label: user ? "Me" : "Sign in", icon: User, match: (p) => p === "/account" || p === "/auth" },
  ];

    <nav
      aria-label="Primary mobile navigation"
      className="md:hidden fixed bottom-0 inset-x-0 z-40 px-4 pb-[max(1rem,calc(env(safe-area-inset-bottom)+0.6rem))] pt-2 pointer-events-none"
    >
      {/* Ambient ember glow behind the bar — softened ~50% */}
      <div
        aria-hidden
        className="absolute inset-x-10 bottom-4 h-16 -z-10 blur-3xl opacity-45"
        style={{ background: "var(--gradient-ember-soft)" }}
      />
      <ul className="pointer-events-auto relative grid grid-cols-5 gap-0.5 rounded-[26px] px-2.5 py-2.5 ring-1 ring-white/[0.09] shadow-[0_24px_60px_-20px_rgba(0,0,0,0.75),0_0_26px_-14px_oklch(0.74_0.19_49/0.4),inset_0_1px_0_oklch(1_0_0/0.08)] backdrop-blur-2xl backdrop-saturate-150" style={{ background: "linear-gradient(180deg, rgba(22,13,9,0.62), rgba(10,6,4,0.78))" }}>

        {items.map(({ to, label, icon: Icon, match, badge }) => {
          const active = match(pathname);
          return (
            <li key={label} className="relative">
              <Link
                to={to}
                className={`relative flex flex-col items-center justify-center gap-1 py-2 rounded-2xl text-[10px] font-mono uppercase tracking-widest transition-colors ${
                  active ? "text-accent-foreground" : "text-white/70 hover:text-white"
                }`}
              >
                {active && (
                  <motion.span
                    layoutId="mbnav-pill"
                    transition={{ type: "spring", stiffness: 420, damping: 34, mass: 0.7 }}
                    className="absolute inset-0 rounded-2xl bg-accent shadow-[0_6px_16px_-8px_var(--color-accent),0_0_0_1px_oklch(1_0_0/0.12)_inset]"
                  />
                )}
                <motion.span
                  animate={{ scale: active ? 1.08 : 1, y: active ? -1 : 0 }}
                  transition={{ type: "spring", stiffness: 380, damping: 22 }}
                  className="relative"
                >
                  <Icon className="size-[20px]" strokeWidth={active ? 2.6 : 2} />
                  {typeof badge === "number" && badge > 0 && (
                    <span className={`absolute -top-1.5 -right-2 min-w-4 h-4 px-1 rounded-full text-[9px] font-bold grid place-items-center ring-2 ring-background ${
                      active ? "bg-background text-accent" : "bg-accent text-accent-foreground shadow-[0_0_10px_var(--color-accent)]"
                    }`}>
                      {badge > 99 ? "99+" : badge}
                    </span>
                  )}
                </motion.span>
                <span className={`relative truncate max-w-full text-[9px] font-semibold ${active ? "opacity-100" : "opacity-80"}`}>{label}</span>
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
