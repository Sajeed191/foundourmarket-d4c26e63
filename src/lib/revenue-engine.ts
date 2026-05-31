/**
 * Client-side wrappers for the Revenue Automation execution layer.
 *
 * These call the staff-gated server functions (which re-verify the role
 * server-side and audit every action). They provide typed responses and
 * consistent error handling for the Growth Center UI. The server functions
 * are invoked directly (callable RPC stubs in the client bundle); the bearer
 * token is attached automatically by the global functionMiddleware.
 */
import { activateSegmentFn, getRevenueAttributionFn } from "./revenue-engine.functions";

export type SegmentKey =
  | "vip" | "high_value" | "high_ltv" | "high_spend" | "frequent" | "frequent_buyers"
  | "dormant" | "dormant_buyers" | "winback" | "new" | "new_customers" | "refund_risk"
  | "abandoned_cart" | "abandoned" | "wishlist" | "wishlist_heavy" | "coupon_hunters";

export type SegmentAction = "notify" | "coupon" | "campaign" | "export";

export type ActivateSegmentInput = {
  segment: SegmentKey;
  action: SegmentAction;
  label?: string | null;
  message?: string | null;
  kind?: "percent" | "fixed";
  value?: number;
  link?: string | null;
};

export type ActivateSegmentResult = {
  segment: string;
  action: SegmentAction;
  matched: number;
  run_id: string;
  result: Record<string, unknown> & { code?: string; campaign_id?: string };
  ran_at: string;
};

export type RevenueAttribution = {
  total_revenue: number;
  coupon_revenue: number;
  coupon_orders: number;
  recovered_revenue: number;
  recovered_orders: number;
  winback_revenue: number;
  campaign_revenue: number;
  campaign_spend: number;
  campaign_roi: number;
  repeat_revenue: number;
  repeat_orders: number;
  notif_sent: number;
  notif_converted: number;
  notif_conversion_rate: number;
  generated_at: string;
};

function toError(e: unknown, fallback: string): Error {
  if (e instanceof Error) return e;
  return new Error(fallback);
}

/** Execute a real action (notify / coupon / campaign / export) against a live segment. */
export async function activateSegment(input: ActivateSegmentInput): Promise<ActivateSegmentResult> {
  try {
    const res = (await activateSegmentFn({ data: input })) as ActivateSegmentResult;
    return res;
  } catch (e) {
    throw toError(e, "Failed to activate segment");
  }
}

/** Fetch live revenue attribution KPIs. */
export async function getRevenueAttribution(): Promise<RevenueAttribution> {
  try {
    const res = (await getRevenueAttributionFn()) as RevenueAttribution;
    return res;
  } catch (e) {
    throw toError(e, "Failed to load revenue attribution");
  }
}
