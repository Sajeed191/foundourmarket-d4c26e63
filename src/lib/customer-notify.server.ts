// Server-only: the single, canonical path for customer-facing notifications.
//
// Every major customer event flows through `notifyCustomer`, which:
//   1. Enforces notification preferences server-side (mandatory categories
//      always deliver; optional categories respect email_preferences).
//   2. Inserts the in-app notification (service-role, bypasses RLS).
//   3. Writes a tamper-proof audit entry (security_audit_log) — which also
//      surfaces the event on the customer activity timeline.
//
// It is resilient: a notification or audit failure never throws back into the
// commerce path that triggered it.
//
// NEVER import from client code (uses the service-role admin client).
import { supabaseAdmin } from "@/integrations/supabase/client.server";
import { logSecurity } from "./admin-guard.server";

export type NotifyCategory =
  | "order"
  | "payment"
  | "shipment"
  | "security"
  | "account"
  | "return"
  | "refund"
  | "support"
  | "marketing"
  | "wishlist"
  | "price";

/** Categories that ALWAYS deliver regardless of customer preferences. */
const MANDATORY: ReadonlySet<NotifyCategory> = new Set<NotifyCategory>([
  "order",
  "payment",
  "shipment",
  "security",
  "account",
  "return",
  "refund",
  "support",
]);

/** Optional categories → the email_preferences flag that gates delivery. */
const PREF_FLAG: Partial<Record<NotifyCategory, "marketing" | "product_news">> = {
  marketing: "marketing",
  wishlist: "product_news",
  price: "product_news",
};

/**
 * Whether a customer wants notifications of this category. Mandatory
 * categories are always enabled. Optional categories default to ENABLED when
 * no preferences row exists (opt-out model). Never throws.
 */
export async function isCategoryEnabled(
  userId: string,
  category: NotifyCategory,
): Promise<boolean> {
  if (MANDATORY.has(category)) return true;
  const flag = PREF_FLAG[category];
  if (!flag) return true;
  try {
    const { data } = await supabaseAdmin
      .from("email_preferences")
      .select("marketing,product_news")
      .eq("user_id", userId)
      .maybeSingle();
    if (!data) return true;
    return (data as Record<string, boolean | null>)[flag] !== false;
  } catch {
    return true;
  }
}

export type NotifyInput = {
  userId: string | null | undefined;
  category: NotifyCategory;
  /** notification.type — drives categoryOf() + resolveNotificationLink(). */
  type: string;
  title: string;
  body?: string | null;
  /** Standardized customer deep link. Prefer the helpers below. */
  link?: string | null;
  data?: Record<string, unknown>;
  priority?: "low" | "normal" | "high" | "critical";
  /** Who triggered the event (customer or staff). Defaults to userId. */
  actorId?: string | null;
};

/**
 * Deliver a customer notification with preference enforcement + audit trail.
 * Returns whether a notification row was actually inserted.
 */
export async function notifyCustomer(
  input: NotifyInput,
): Promise<{ inserted: boolean; reason?: string }> {
  const { userId, category } = input;
  if (!userId) return { inserted: false, reason: "no_user" };

  // 1) Server-side preference enforcement.
  const enabled = await isCategoryEnabled(userId, category);
  if (!enabled) {
    await logSecurity({
      actorId: input.actorId ?? userId,
      actorRole: null,
      action: `notify.${category}.suppressed`,
      target: userId,
      success: true,
      detail: { type: input.type, reason: "preference_disabled" },
    });
    return { inserted: false, reason: "preference_disabled" };
  }

  // 2) Insert the in-app notification (resilient).
  let inserted = false;
  try {
    const { error } = await supabaseAdmin.from("notifications").insert({
      user_id: userId,
      type: input.type,
      title: input.title,
      body: input.body ?? null,
      link: input.link ?? null,
      priority: input.priority ?? "normal",
      data: (input.data ?? {}) as never,
    });
    if (error) throw new Error(error.message);
    inserted = true;
  } catch (err: any) {
    console.error("[customer-notify] insert failed", {
      category,
      type: input.type,
      error: String(err?.message ?? err),
    });
  }

  // 3) Audit (also surfaces on the customer timeline via security_audit_log).
  await logSecurity({
    actorId: input.actorId ?? userId,
    actorRole: null,
    action: `notify.${category}`,
    target: userId,
    success: inserted,
    detail: { type: input.type, title: input.title, ...(input.data ?? {}) },
  });

  return { inserted };
}

/* ---------------------------------------------------------------------------
 * Standardized customer deep links (match real routes + resolveNotificationLink)
 * ------------------------------------------------------------------------- */

/** Human-friendly order reference, e.g. "FM-8F3A21C9". */
export const fmOrderNo = (id: string) => `FM-${id.slice(0, 8).toUpperCase()}`;

export const orderLink = (orderId: string) => `/orders/${orderId}`;
export const returnLink = (returnId: string, orderId?: string | null) =>
  `/account/returns?return=${returnId}${orderId ? `&order=${orderId}` : ""}`;
export const paymentLink = (orderId: string) => `/account/payments?order=${orderId}`;
export const supportLink = (ticketId: string) => `/account/support?ticket=${ticketId}`;
