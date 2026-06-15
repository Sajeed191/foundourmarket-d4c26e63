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
  const isActive = pathname === "/account/notifications" || pathname === "/admin/notifications";

  const to = isAdmin ? "/admin/notifications" : "/account/notifications";

  return (
    <Link
      to={to}
      aria-label="Notifications"
      className={`relative size-10 sm:size-11 rounded-xl grid place-items-center text-muted-foreground transition-all duration-200 hover:text-foreground hover:bg-white/5 active:bg-accent/10 active:text-accent active:scale-95 ${
        isActive ? "bg-white/5 text-foreground" : ""
      }`}
    >
      <Bell className="size-[18px]" />
      {totalUnread > 0 && (
        <span className="absolute -top-0.5 -right-0.5 min-w-4 h-4 px-1 rounded-full bg-accent text-accent-foreground text-[9px] font-bold font-mono grid place-items-center shadow-[0_0_10px_2px_oklch(0.74_0.19_49_/_0.6)]">
          {totalUnread > 99 ? "99+" : totalUnread}
        </span>
      )}
    </Link>
  );
}
