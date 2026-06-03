/**
 * Shared order lifecycle model for FoundOurMarket™.
 *
 * Single source of truth for the strict fulfilment sequence, allowed
 * transitions, customer-facing labels, timeline steps and status colors.
 * Mirrors the database `order_lifecycle_step` / transition trigger so the
 * UI never offers an action the DB would reject.
 */

export const LIFECYCLE_ORDER = [
  "pending",
  "confirmed",
  "processing",
  "packed",
  "shipped",
  "out_for_delivery",
  "delivered",
  "completed",
] as const;

export type LifecycleStatus = (typeof LIFECYCLE_ORDER)[number];

/** 1-based step (0 = not a lifecycle status). */
export function lifecycleStep(status?: string | null): number {
  const i = LIFECYCLE_ORDER.indexOf((status ?? "").toLowerCase() as LifecycleStatus);
  return i === -1 ? 0 : i + 1;
}

export type StatusMeta = {
  key: string;
  /** Customer-facing label. */
  label: string;
  /** Admin action button label to REACH this status from the previous one. */
  action: string;
  /** Tailwind badge classes (premium dark theme). */
  badge: string;
  /** Dot/indicator color class. */
  dot: string;
};

export const STATUS_META: Record<LifecycleStatus, StatusMeta> = {
  pending: {
    key: "pending", label: "Pending", action: "Mark Pending",
    badge: "bg-zinc-500/10 text-zinc-300 border-zinc-500/30", dot: "bg-zinc-400",
  },
  confirmed: {
    key: "confirmed", label: "Order Confirmed", action: "Confirm Order",
    badge: "bg-blue-500/10 text-blue-300 border-blue-500/30", dot: "bg-blue-400",
  },
  processing: {
    key: "processing", label: "Processing", action: "Start Processing",
    badge: "bg-purple-500/10 text-purple-300 border-purple-500/30", dot: "bg-purple-400",
  },
  packed: {
    key: "packed", label: "Packed", action: "Mark Packed",
    badge: "bg-orange-500/10 text-orange-300 border-orange-500/30", dot: "bg-orange-400",
  },
  shipped: {
    key: "shipped", label: "Shipped", action: "Mark Shipped",
    badge: "bg-indigo-500/10 text-indigo-300 border-indigo-500/30", dot: "bg-indigo-400",
  },
  out_for_delivery: {
    key: "out_for_delivery", label: "Out for Delivery", action: "Mark Out For Delivery",
    badge: "bg-amber-500/10 text-amber-300 border-amber-500/30", dot: "bg-amber-400",
  },
  delivered: {
    key: "delivered", label: "Delivered", action: "Mark Delivered",
    badge: "bg-green-500/10 text-green-300 border-green-500/30", dot: "bg-green-400",
  },
  completed: {
    key: "completed", label: "Completed", action: "Mark Completed",
    badge: "bg-emerald-500/10 text-emerald-300 border-emerald-500/30", dot: "bg-emerald-400",
  },
};

/** Side / terminal states shown outside the forward sequence. */
export const SIDE_STATUS_META: Record<string, StatusMeta> = {
  cancelled: { key: "cancelled", label: "Cancelled", action: "Cancel Order", badge: "bg-rose-500/10 text-rose-300 border-rose-500/30", dot: "bg-rose-400" },
  refunded: { key: "refunded", label: "Refunded", action: "Refund", badge: "bg-fuchsia-500/10 text-fuchsia-300 border-fuchsia-500/30", dot: "bg-fuchsia-400" },
  returned: { key: "returned", label: "Returned", action: "Return", badge: "bg-amber-500/10 text-amber-300 border-amber-500/30", dot: "bg-amber-400" },
  payment_failed: { key: "payment_failed", label: "Payment Failed", action: "—", badge: "bg-rose-500/10 text-rose-300 border-rose-500/30", dot: "bg-rose-400" },
};

export function statusMeta(status?: string | null): StatusMeta {
  const s = (status ?? "").toLowerCase();
  return STATUS_META[s as LifecycleStatus]
    ?? SIDE_STATUS_META[s]
    ?? { key: s || "unknown", label: status || "—", action: "—", badge: "bg-muted text-muted-foreground border-border", dot: "bg-muted-foreground" };
}

/** The single next allowed forward status, or null if at the end / off-track. */
export function nextStatus(status?: string | null): LifecycleStatus | null {
  const step = lifecycleStep(status);
  if (step === 0 || step >= LIFECYCLE_ORDER.length) return null;
  return LIFECYCLE_ORDER[step];
}

/** Customer-facing tracking timeline (excludes terminal 'completed'). */
export const TRACKING_TIMELINE: LifecycleStatus[] = [
  "confirmed",
  "processing",
  "packed",
  "shipped",
  "out_for_delivery",
  "delivered",
];

/** A status that can still be cancelled by the customer (pending/confirmed). */
export function customerCancellable(status?: string | null, windowExpiresAt?: string | null): boolean {
  const s = (status ?? "").toLowerCase();
  if (s !== "pending" && s !== "confirmed") return false;
  if (!windowExpiresAt) return false;
  return Date.now() < new Date(windowExpiresAt).getTime();
}
