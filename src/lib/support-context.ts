/**
 * Shared support-ticket context helpers (Phase 2 — marketplace integration).
 *
 * These power "smart ticket creation": entry points across the app deep-link
 * into the support page with prefill params so a customer never has to search
 * for support or re-type their order details.
 */

export type SupportCategoryId =
  | "order_issue"
  | "shipping_delay"
  | "damaged_product"
  | "return_request"
  | "refund_request"
  | "product_question"
  | "payment_issue"
  | "other";

export const SUPPORT_CATEGORIES: { id: SupportCategoryId; label: string }[] = [
  { id: "order_issue", label: "Order issue" },
  { id: "shipping_delay", label: "Shipping delay" },
  { id: "damaged_product", label: "Damaged product" },
  { id: "return_request", label: "Return request" },
  { id: "refund_request", label: "Refund request" },
  { id: "product_question", label: "Product question" },
  { id: "payment_issue", label: "Payment issue" },
  { id: "other", label: "Other" },
];

export function categoryLabel(id: string): string {
  return SUPPORT_CATEGORIES.find((c) => c.id === id)?.label ?? "Support";
}

/** Snapshot of the order/product captured on the ticket at creation time. */
export type SupportContextSnapshot = {
  order_number?: string;
  order_status?: string;
  product_name?: string;
  product_image?: string;
  tracking_number?: string;
  carrier?: string;
  delivery_status?: string;
  return_status?: string;
  refund_status?: string;
  total?: number;
  currency?: string;
};

export type SupportPrefill = {
  order?: string;
  return?: string;
  refund?: string;
  category?: SupportCategoryId;
  subject?: string;
};

/** Search-param object for navigating to the support page with prefill. */
export function supportSearch(prefill: SupportPrefill): Record<string, string> {
  const out: Record<string, string> = { compose: "1" };
  if (prefill.order) out.order = prefill.order;
  if (prefill.return) out.return = prefill.return;
  if (prefill.refund) out.refund = prefill.refund;
  if (prefill.category) out.category = prefill.category;
  if (prefill.subject) out.subject = prefill.subject;
  return out;
}
