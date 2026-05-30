import { createContext, useContext, useEffect, useState, useCallback, type ReactNode } from "react";
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
  created_at: string;
};

export type NotificationCategory =
  | "order"
  | "shipping"
  | "payment"
  | "support"
  | "promotion"
  | "system"
  | "other";

export function categoryOf(n: Pick<Notification, "type">): NotificationCategory {
  const t = (n.type || "").toLowerCase();
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

type Ctx = {
  items: Notification[];
  unread: number;
  loading: boolean;
  markRead: (id: string) => Promise<void>;
  markAllRead: () => Promise<void>;
  remove: (id: string) => Promise<void>;
  clearAll: () => Promise<void>;
  refresh: () => Promise<void>;
};

const NotificationsCtx = createContext<Ctx>({
  items: [], unread: 0, loading: false,
  markRead: async () => {}, markAllRead: async () => {},
  remove: async () => {}, clearAll: async () => {}, refresh: async () => {},
});

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
        (payload) => setItems((prev) => prev.map(n => n.id === (payload.new as Notification).id ? payload.new as Notification : n)))
      .on("postgres_changes",
        { event: "DELETE", schema: "public", table: "notifications", filter: `user_id=eq.${user.id}` },
        (payload) => setItems((prev) => prev.filter(n => n.id !== (payload.old as { id: string }).id)))
      .subscribe();
    return () => { supabase.removeChannel(channel); };
  }, [user]);

  const markRead = async (id: string) => {
    if (!user) return;
    setItems(prev => prev.map(n => n.id === id ? { ...n, read_at: new Date().toISOString() } : n));
    await supabase.from("notifications").update({ read_at: new Date().toISOString() }).eq("id", id);
  };
  const markAllRead = async () => {
    if (!user) return;
    const now = new Date().toISOString();
    setItems(prev => prev.map(n => n.read_at ? n : { ...n, read_at: now }));
    await supabase.from("notifications").update({ read_at: now }).eq("user_id", user.id).is("read_at", null);
  };
  const remove = async (id: string) => {
    if (!user) return;
    setItems(prev => prev.filter(n => n.id !== id));
    await supabase.from("notifications").delete().eq("id", id);
  };
  const clearAll = async () => {
    if (!user) return;
    setItems([]);
    await supabase.from("notifications").delete().eq("user_id", user.id);
  };

  const unread = items.filter(n => !n.read_at).length;

  return (
    <NotificationsCtx.Provider value={{ items, unread, loading, markRead, markAllRead, remove, clearAll, refresh }}>
      {children}
    </NotificationsCtx.Provider>
  );
}

export const useNotifications = () => useContext(NotificationsCtx);
