import { Link, useRouterState } from "@tanstack/react-router";
import { User } from "lucide-react";
import { useAuth } from "@/lib/auth";
import { useAdminMode } from "@/lib/admin-mode";
import { useIsAdmin } from "@/lib/use-admin";

/**
 * Floating account dock for tablet/desktop only. The account entry point was
 * removed from the top header, so this restores quick access to the account /
 * sign-in screen. Hidden on mobile, where MobileBottomNav already surfaces it.
 */
export function DesktopAccountDock() {
  const { user } = useAuth();
  const { adminMode } = useAdminMode();
  const { isAdmin } = useIsAdmin();
  const pathname = useRouterState({ select: (s) => s.location.pathname });

  // Stay out of the way while staff are actively managing the store.
  if (adminMode && isAdmin) return null;

  const active = pathname === "/account" || pathname === "/auth";
  const label = user ? "Account" : "Sign in";

  return (
    <div
      className="hidden md:block fixed bottom-5 right-5 z-[var(--z-bottom-nav)] pointer-events-none print:hidden"
      aria-label="Account navigation"
    >
      <Link
        to={user ? "/account" : "/auth"}
        className={`pointer-events-auto flex items-center gap-2 rounded-full glass-strong border border-white/10 px-4 py-2.5 text-sm font-medium shadow-[0_8px_28px_-12px_oklch(0_0_0/0.6)] transition-colors ${
          active ? "text-accent ring-1 ring-accent/40" : "text-white/80 hover:text-foreground"
        }`}
      >
        <span className="grid place-items-center size-7 rounded-full bg-accent/15 ring-1 ring-accent/30">
          <User className={`size-4 ${active ? "text-accent" : "text-white/80"}`} strokeWidth={active ? 2.4 : 2} />
        </span>
        {label}
      </Link>
    </div>
  );
}
