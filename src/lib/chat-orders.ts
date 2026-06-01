import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { supabase } from "@/integrations/supabase/client";

export type ChatOrderItem = { name: string; image: string | null; quantity: number };
export type ChatOrder = {
  id: string;
  status: string;
  fulfillment_status: string;
  total: number;
  currency: string;
  created_at: string;
  tracking_number: string | null;
  carrier: string | null;
  order_items: ChatOrderItem[];
};

export type OrderStage =
  | "processing"
  | "shipped"
  | "out_for_delivery"
  | "delivered"
  | "returned"
  | "cancelled";

const STAGE_META: Record<OrderStage, { label: string; emoji: string; prompt: string | null; tone: string }> = {
  processing: { label: "Processing", emoji: "📦", prompt: "Need an update on your order?", tone: "text-amber-400" },
  shipped: { label: "Shipped", emoji: "🚚", prompt: "Track your shipment", tone: "text-sky-400" },
  out_for_delivery: { label: "Out for Delivery", emoji: "📍", prompt: "Track your shipment", tone: "text-sky-300" },
  delivered: { label: "Delivered", emoji: "✅", prompt: "Need help with your delivered item?", tone: "text-emerald-400" },
  returned: { label: "Returned", emoji: "↩️", prompt: "Check refund status", tone: "text-violet-400" },
  cancelled: { label: "Cancelled", emoji: "❌", prompt: null, tone: "text-muted-foreground" },
};

export function orderStage(o: { status: string; fulfillment_status: string }): OrderStage {
  const s = (o.status || "").toLowerCase();
  const f = (o.fulfillment_status || "").toLowerCase();
  if (s.includes("cancel")) return "cancelled";
  if (s.includes("refund") || s.includes("return") || f.includes("return")) return "returned";
  if (f.includes("out_for_delivery") || f.includes("out for delivery")) return "out_for_delivery";
  if (s.includes("deliver") || f.includes("deliver")) return "delivered";
  if (s.includes("ship") || f.includes("ship") || f.includes("transit")) return "shipped";
  return "processing";
}

export function stageMeta(stage: OrderStage) {
  return STAGE_META[stage];
}

export function orderNumber(id: string): string {
  return `FOM-${id.slice(0, 8).toUpperCase()}`;
}

export function primaryItem(o: ChatOrder): ChatOrderItem | null {
  return o.order_items?.[0] ?? null;
}

type UseChatOrders = {
  orders: ChatOrder[];
  loading: boolean;
  /** Most recent order update detected via realtime, for the in-chat toast. */
  lastUpdate: { id: string; stage: OrderStage } | null;
  clearUpdate: () => void;
};

const SELECT = "id,status,fulfillment_status,total,currency,created_at,tracking_number,carrier,order_items(name,image,quantity)";

// Loads the signed-in user's recent orders (RLS-scoped) and watches for live
// status changes — never blocks chat initialisation.
export function useChatOrders(userId: string | null | undefined): UseChatOrders {
  const [orders, setOrders] = useState<ChatOrder[]>([]);
  const [loading, setLoading] = useState(false);
  const [lastUpdate, setLastUpdate] = useState<{ id: string; stage: OrderStage } | null>(null);
  const stages = useRef<Map<string, OrderStage>>(new Map());

  const clearUpdate = useCallback(() => setLastUpdate(null), []);

  useEffect(() => {
    if (!userId) { setOrders([]); stages.current.clear(); return; }
    let active = true;
    setLoading(true);

    const load = () =>
      supabase
        .from("orders")
        .select(SELECT)
        .order("created_at", { ascending: false })
        .limit(8)
        .then(({ data }) => {
          if (!active) return;
          const list = (data as ChatOrder[] | null) ?? [];
          // Detect status transitions for the live update toast.
          for (const o of list) {
            const next = orderStage(o);
            const prev = stages.current.get(o.id);
            if (prev && prev !== next) setLastUpdate({ id: o.id, stage: next });
            stages.current.set(o.id, next);
          }
          setOrders(list);
          setLoading(false);
        });

    load();

    const channel = supabase
      .channel(`chat-orders:${userId}`)
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "orders", filter: `user_id=eq.${userId}` },
        () => load(),
      )
      .subscribe();

    return () => {
      active = false;
      supabase.removeChannel(channel);
    };
  }, [userId]);

  return useMemo(() => ({ orders, loading, lastUpdate, clearUpdate }), [orders, loading, lastUpdate, clearUpdate]);
}
