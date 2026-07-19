import { createContext, useContext, useEffect, useRef, useState, useCallback, type ReactNode, type MouseEvent } from "react";
import { useRouterState, useNavigate } from "@tanstack/react-router";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/lib/auth";

export type Notification = {
  id: string;
  user_id: string;
  type: string;
  title: string;
  body: string | null;
  link: string | null;
  data: Record<string, unknown> | null;
  read_at: string | null;
  archived_at?: string | null;
  created_at: string;
};

export type NotificationCategory =
  | "order"
  | "shipping"
  | "payment"
  | "support"
  | "promotion"
  | "executive"
  | "ai"
  | "system"
  | "other";

const EXECUTIVE_TYPES = [
  "critical_business_risk", "revenue_spike", "profit_opportunity",
  "margin_collapse", "inventory_crisis", "customer_churn_risk", "support_crisis",
  "executive", "business_risk", "business_health",
];

const AI_TYPES = [
  "ai_critical_alert", "ai_profit_opportunity", "ai_growth_opportunity",
  "ai_inventory_risk", "ai_customer_risk", "ai_marketing_risk", "ai_financial_risk",
];

export function categoryOf(n: Pick<Notification, "type">): NotificationCategory {
  const t = (n.type || "").toLowerCase();
  if (AI_TYPES.includes(t) || t.startsWith("ai_"))
    return "ai";
  if (EXECUTIVE_TYPES.includes(t) || t.startsWith("executive") || t.startsWith("business_") ||
    t.includes("margin_collapse") || t.includes("revenue_spike") || t.includes("profit_opportunity") ||
    t.includes("churn_risk") || t.includes("business_risk"))
    return "executive";
  if (t.includes("ship") || t.includes("tracking") || t.includes("delivery") || t === "return")
    return "shipping";
  if (t.includes("order")) return "order";
  if (t.includes("payment") || t.includes("refund") || t.includes("invoice")) return "payment";
  if (t.includes("support") || t.includes("ticket") || t === "question" || t === "review")
    return "support";
  if (t.includes("promo") || t.includes("marketing") || t.includes("deal") || t.includes("sale"))
    return "promotion";
  if (t.includes("security") || t.includes("system") || t.includes("alert") || t.includes("stock"))
    return "system";
  return "other";
}

/**
 * Resolve the best destination for a notification when clicked.
 * Admins are routed to the relevant operational command center; customers
 * to their account pages. Falls back to an explicit `n.link` first, then to
 * a category-based route, and finally a sensible home.
 */
export function resolveNotificationLink(
  n: Pick<Notification, "type" | "link" | "data">,
  isAdmin: boolean,
): string {
  const t = (n.type || "").toLowerCase();
  const data = (n.data ?? {}) as Record<string, unknown>;
  const cat = categoryOf(n);
  const explicit = typeof n.link === "string" && n.link.startsWith("/") && !n.link.startsWith("//") ? n.link : null;
  const str = (...keys: string[]) => {
    for (const key of keys) {
      const value = data[key];
      if (typeof value === "string" && value.trim()) return encodeURIComponent(value.trim());
    }
    return null;
  };
  const orderId = str("order_id", "orderId", "order");
  const productSlug = str("product_slug", "productSlug", "slug");
  const ticketId = str("ticket_id", "ticketId", "support_ticket_id");
  const returnId = str("return_id", "returnId");
  const paymentId = str("payment_id", "paymentId", "razorpay_payment_id");
  const shipmentId = str("shipment_id", "shipmentId");

  if (productSlug && (t.includes("flash") || t.includes("deal") || t.includes("wishlist") || t.includes("price") || t.includes("restock") || t.includes("product"))) {
    return isAdmin ? `/admin-product/${productSlug}` : `/products/${productSlug}`;
  }

  if (isAdmin) {
    if (t.includes("return")) return `/admin-returns${returnId ? `?return=${returnId}` : orderId ? `?order=${orderId}` : ""}`;
    if (t.includes("payment") || t.includes("refund") || t.includes("charge") || t.includes("razorpay")) return `/admin-payments${paymentId ? `?payment=${paymentId}` : orderId ? `?order=${orderId}` : ""}`;
    if (t.includes("support") || t.includes("ticket") || t.includes("message") || t === "question") return `/admin-support${ticketId ? `?ticket=${ticketId}` : orderId ? `?order=${orderId}` : ""}`;
    if (t.includes("ship") || t.includes("tracking") || t.includes("delivery") || t.includes("packed") || t.includes("courier")) return `/admin-shipments${orderId ? `?order=${orderId}` : shipmentId ? `?shipment=${shipmentId}` : ""}`;
    if (t.includes("order")) return `/admin-orders-ops${orderId ? `?order=${orderId}` : ""}`;
    switch (cat) {
      case "shipping":
        return `/admin-shipments${orderId ? `?order=${orderId}` : ""}`;
      case "order":
        return `/admin-orders-ops${orderId ? `?order=${orderId}` : ""}`;
      case "payment":
        return `/admin-payments${paymentId ? `?payment=${paymentId}` : orderId ? `?order=${orderId}` : ""}`;
      case "support":
        if (t.includes("review") || t === "review") return "/admin-products";
        if (t === "return" || t.includes("return")) return `/admin-returns${returnId ? `?return=${returnId}` : orderId ? `?order=${orderId}` : ""}`;
        return `/admin-support${ticketId ? `?ticket=${ticketId}` : ""}`;
      case "executive":
        return "/admin-executive";
      case "ai":
        return "/admin-ai-operations";
      case "system":
        if (t.includes("stock") || t.includes("inventory")) return "/admin-inventory";
        if (t.includes("email")) return "/admin-email-health";
        return "/admin-system-health";
      case "promotion":
        return "/admin-marketing";
      default:
        return explicit || "/admin-notifications";
    }
  }

  // Customer-facing destinations
  if (t.includes("return")) return `/account/returns${orderId ? `?order=${orderId}` : ""}`;
  if (t.includes("refund")) return `/account/payments${orderId ? `?order=${orderId}` : ""}`;
  if (t.includes("payment") && (t.includes("fail") || t.includes("retry"))) return `/account/orders${orderId ? `?order=${orderId}&filter=failed` : "?filter=failed"}`;
  if (t.includes("support") || t.includes("ticket") || t.includes("message")) return `/account/support${ticketId ? `?ticket=${ticketId}` : ""}`;
  if (t.includes("ship") || t.includes("tracking") || t.includes("delivery") || t.includes("packed") || t.includes("order")) return orderId ? `/orders/${orderId}` : "/account/orders";
  switch (cat) {
    case "shipping":
      return orderId ? `/orders/${orderId}` : "/account/orders";
    case "order":
      return orderId ? `/orders/${orderId}` : "/account/orders";
    case "payment":
      return `/account/payments${orderId ? `?order=${orderId}` : ""}`;
    case "support":
      return `/account/support${ticketId ? `?ticket=${ticketId}` : ""}`;
    case "promotion":
      return explicit || "/deals";
    default:
      return explicit || "/account/notifications";
  }
}

/**
 * Split a resolved destination string (which may contain a query string, e.g.
 * `/account/support?ticket=abc`) into a TanStack-friendly `{ to, search }`
 * pair. Passing the raw string to `<Link to>` makes the router treat the whole
 * thing — query string included — as the pathname, which matches no route and
 * renders a 404. Always navigate with the split form instead.
 */
export function splitDestination(dest: string): { to: string; search: Record<string, string> } {
  const [path, qs] = dest.split("?");
  const search: Record<string, string> = {};
  if (qs) {
    for (const [k, v] of new URLSearchParams(qs).entries()) search[k] = v;
  }
  return { to: path || "/", search };
}

/**
 * Safe, logged, fallback-protected notification navigation. Renders an anchor
 * (for accessibility / middle-click) but intercepts the click to navigate via
 * the router using a split `{ to, search }`. If navigation fails (stale or
 * invalid deep link), it falls back to the section index — support deep links
 * fall back to the Support Center with a friendly toast — so a notification can
 * never strand the user on a 404 page.
 */
export function NotificationLink({
  dest,
  onClick,
  className,
  children,
}: {
  dest: string;
  onClick?: () => void;
  className?: string;
  children: ReactNode;
}) {
  const navigate = useNavigate();
  const { to, search } = splitDestination(dest);
  const isSupport = to.includes("support");

  const handle = (e: MouseEvent<HTMLAnchorElement>) => {
    // Respect new-tab / modifier clicks — let the browser handle the href.
    if (e.metaKey || e.ctrlKey || e.shiftKey || e.altKey || e.button !== 0) return;
    e.preventDefault();
    onClick?.();
    // eslint-disable-next-line no-console
    console.log("[notification] navigate", { dest, to, search });
    void navigate({ to: to as never, search: search as never }).catch((err) => {
      console.error("[notification] navigation failed — falling back", { dest, to, err });
      if (isSupport) {
        toast("Conversation not found. Opening Support Center.");
        void navigate({ to: "/account/support" as never, search: {} as never });
      } else {
        void navigate({ to: "/account/notifications" as never, search: {} as never });
      }
    });
  };

  return (
    <a href={dest} onClick={handle} className={className}>
      {children}
    </a>
  );
}

type Ctx = {
  items: Notification[];
  unread: number;
  loading: boolean;
  markRead: (id: string) => Promise<void>;
  markAllRead: () => Promise<void>;
  remove: (id: string) => Promise<void>;
  archive: (id: string) => Promise<void>;
  clearAll: () => Promise<void>;
  refresh: () => Promise<void>;
};

const NotificationsCtx = createContext<Ctx>({
  items: [], unread: 0, loading: false,
  markRead: async () => {}, markAllRead: async () => {},
  remove: async () => {}, archive: async () => {}, clearAll: async () => {}, refresh: async () => {},
});

/**
 * Drives the browser-tab unread badge: `FoundOurMarket™` → `(8) FoundOurMarket™`.
 * Uses a MutationObserver so the prefix survives TanStack head() title swaps on
 * navigation, and re-applies whenever the unread count changes. Caps at 99+.
 */
function TabBadge({ unread }: { unread: number }) {
  // React to route changes so the badge re-applies after head() rewrites <title>.
  useRouterState({ select: (s) => s.location.pathname });
  const unreadRef = useRef(unread);
  unreadRef.current = unread;

  const apply = useCallback(() => {
    if (typeof document === "undefined") return;
    const u = unreadRef.current;
    const base = document.title.replace(/^\(\d+\+?\)\s+/, "");
    const next = u > 0 ? `(${u > 99 ? "99+" : u}) ${base}` : base;
    if (document.title !== next) document.title = next;
  }, []);

  useEffect(() => {
    if (typeof document === "undefined") return;
    const titleEl = document.querySelector("title");
    apply();
    if (!titleEl) return;
    const obs = new MutationObserver(() => apply());
    obs.observe(titleEl, { childList: true, characterData: true, subtree: true });
    return () => obs.disconnect();
  }, [apply]);

  useEffect(() => { apply(); }, [unread, apply]);
  return null;
}

export function NotificationsProvider({ children }: { children: ReactNode }) {
  const { user } = useAuth();
  const [items, setItems] = useState<Notification[]>([]);
  const [loading, setLoading] = useState(false);

  const refresh = useCallback(async () => {
    if (!user) { setItems([]); return; }
    setLoading(true);
    const { data } = await supabase
      .from("notifications")
      .select("*")
      .eq("user_id", user.id)
      .is("archived_at", null)
      .order("created_at", { ascending: false })
      .limit(100);
    setItems((data ?? []) as Notification[]);
    setLoading(false);
  }, [user]);

  useEffect(() => { refresh(); }, [refresh]);

  useEffect(() => {
    if (!user) return;
    const channel = supabase
      .channel(`notifications:${user.id}`)
      .on("postgres_changes",
        { event: "INSERT", schema: "public", table: "notifications", filter: `user_id=eq.${user.id}` },
        (payload) => setItems((prev) => {
          const n = payload.new as Notification;
          if (prev.some((p) => p.id === n.id)) return prev;
          return [n, ...prev].slice(0, 100);
        }))
      .on("postgres_changes",
        { event: "UPDATE", schema: "public", table: "notifications", filter: `user_id=eq.${user.id}` },
        (payload) => setItems((prev) => {
          const n = payload.new as Notification;
          if (n.archived_at) return prev.filter((p) => p.id !== n.id);
          return prev.map((p) => (p.id === n.id ? n : p));
        }))
      .on("postgres_changes",
        { event: "DELETE", schema: "public", table: "notifications", filter: `user_id=eq.${user.id}` },
        (payload) => setItems((prev) => prev.filter(n => n.id !== (payload.old as { id: string }).id)))
      .subscribe();
    return () => { supabase.removeChannel(channel); };
  }, [user]);

  const markRead = async (id: string) => {
    if (!user) return;
    setItems(prev => prev.map(n => n.id === id ? { ...n, read_at: new Date().toISOString() } : n));
    const { resilientUpdate } = await import("@/lib/infra/supabase-resilient");
    await resilientUpdate("analytics.event", "notifications", { id }, { read_at: new Date().toISOString() }, `notif.read:${id}`);
  };
  const markAllRead = async () => {
    if (!user) return;
    const now = new Date().toISOString();
    setItems(prev => prev.map(n => n.read_at ? n : { ...n, read_at: now }));
    // Bulk (is.null filter) — not queueable via resilient helper; keep direct call.
    await supabase.from("notifications").update({ read_at: now }).eq("user_id", user.id).is("read_at", null);
  };
  const remove = async (id: string) => {
    if (!user) return;
    setItems(prev => prev.filter(n => n.id !== id));
    const { resilientDelete } = await import("@/lib/infra/supabase-resilient");
    await resilientDelete("analytics.event", "notifications", { id }, `notif.del:${id}`);
  };
  const archive = async (id: string) => {
    if (!user) return;
    setItems(prev => prev.filter(n => n.id !== id));
    const { resilientUpdate } = await import("@/lib/infra/supabase-resilient");
    await resilientUpdate("analytics.event", "notifications", { id }, { archived_at: new Date().toISOString() }, `notif.arch:${id}`);
  };
  const clearAll = async () => {
    if (!user) return;
    setItems([]);
    // Bulk per-user — not queueable via resilient helper.
    await supabase.from("notifications").delete().eq("user_id", user.id);
  };


  const unread = items.filter(n => !n.read_at).length;

  return (
    <NotificationsCtx.Provider value={{ items, unread, loading, markRead, markAllRead, remove, archive, clearAll, refresh }}>
      <TabBadge unread={unread} />
      {children}
    </NotificationsCtx.Provider>
  );
}

export const useNotifications = () => useContext(NotificationsCtx);
