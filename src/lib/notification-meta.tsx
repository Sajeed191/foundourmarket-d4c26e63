import {
  Bell, Package, Truck, CreditCard, LifeBuoy, Tag, ShieldAlert,
} from "lucide-react";
import type { NotificationCategory } from "@/lib/notifications";

export const CAT_META: Record<
  NotificationCategory,
  { label: string; Icon: typeof Bell; tone: string; dot: string }
> = {
  order: { label: "Orders", Icon: Package, tone: "text-sky-400 border-sky-400/40 bg-sky-400/10", dot: "bg-sky-400" },
  shipping: { label: "Shipping", Icon: Truck, tone: "text-emerald-400 border-emerald-400/40 bg-emerald-400/10", dot: "bg-emerald-400" },
  payment: { label: "Payments", Icon: CreditCard, tone: "text-accent border-accent/40 bg-accent/10", dot: "bg-accent" },
  support: { label: "Support", Icon: LifeBuoy, tone: "text-violet-400 border-violet-400/40 bg-violet-400/10", dot: "bg-violet-400" },
  promotion: { label: "Promotions", Icon: Tag, tone: "text-pink-400 border-pink-400/40 bg-pink-400/10", dot: "bg-pink-400" },
  system: { label: "System", Icon: ShieldAlert, tone: "text-rose-400 border-rose-400/40 bg-rose-400/10", dot: "bg-rose-400" },
  other: { label: "General", Icon: Bell, tone: "text-muted-foreground border-border bg-white/5", dot: "bg-muted-foreground" },
};

export const CATEGORY_ORDER: NotificationCategory[] = [
  "order", "shipping", "payment", "support", "promotion", "system",
];

export function timeAgo(iso: string) {
  const s = Math.max(1, Math.floor((Date.now() - new Date(iso).getTime()) / 1000));
  if (s < 60) return `${s}s ago`;
  const m = Math.floor(s / 60); if (m < 60) return `${m}m ago`;
  const h = Math.floor(m / 60); if (h < 24) return `${h}h ago`;
  const d = Math.floor(h / 24); if (d < 7) return `${d}d ago`;
  return new Date(iso).toLocaleDateString();
}
