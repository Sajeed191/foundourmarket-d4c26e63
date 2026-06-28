import { Bell, ShoppingBag } from "lucide-react";
import { Link, useRouterState } from "@tanstack/react-router";
import { useNotifications } from "@/lib/notifications";
import { useIsAdmin } from "@/lib/use-admin";
import { useSupportUnread } from "@/lib/use-support-unread";

export function NotificationBell() {
  const { unread } = useNotifications();
  const { isAdmin } = useIsAdmin();
  const { count: supportUnread } = useSupportUnread();
  const totalUnread = unread + (isAdmin ? 0 : supportUnread);
  const pathname = useRouterState({ select: (s) => s.location.pathname });
  const isActive = pathname === "/account/notifications" || pathname === "/admin-notifications";

  const to = isAdmin ? "/admin-notifications" : "/account/notifications";


  return (
    <Link
      to={to}
      aria-label="Notifications"
      className={`relative size-10 sm:size-11 rounded-xl grid place-items-center text-muted-foreground transition-all duration-200 hover:text-accent hover:bg-accent/10 hover:shadow-[0_0_18px_-6px_var(--color-accent)] active:bg-accent/15 active:text-accent active:scale-90 ${
        isActive ? "bg-accent/10 text-accent shadow-[0_0_18px_-6px_var(--color-accent)]" : ""
      }`}
    >
      <Bell className="size-[18px]" />
      {totalUnread > 0 && (
        <span key={totalUnread} className="absolute top-1 right-1 grid size-4 place-items-center rounded-full bg-accent text-accent-foreground text-[9px] font-bold font-mono leading-none ring-2 ring-background shadow-[0_2px_6px_-1px_oklch(0.74_0.19_49/0.7)] animate-scale-in">
          {totalUnread > 9 ? "9+" : totalUnread}
        </span>
      )}
    </Link>

  );
}
