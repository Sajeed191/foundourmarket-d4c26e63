/**
 * Centralized checkout funnel logger + human-readable error mapper.
 *
 * Every meaningful checkout step is logged to the browser console with a stable
 * `[checkout:funnel]` prefix (for live debugging) AND persisted to
 * `analytics_events` via the visitor tracker (for the conversion funnel).
 *
 * Funnel steps (in order):
 *   add_to_cart
 *   → proceed_to_checkout
 *   → address_submitted
 *   → order_created            (pending order + razorpay order id)
 *   → payment_initialized      (Razorpay modal opened)
 *   → payment_success | payment_failed | payment_cancelled
 *
 * Failure steps (order_create_failed, payment_init_failed, …) make the silent
 * pre-payment drop-off measurable instead of invisible.
 */

export type CheckoutStep =
  | "add_to_cart"
  | "proceed_to_checkout"
  | "address_submitted"
  | "order_created"
  | "order_create_failed"
  | "payment_initialized"
  | "payment_init_failed"
  | "payment_success"
  | "payment_failed"
  | "payment_cancelled"
  | "cod_order_placed"
  | "cod_order_failed";

const PREFIX = "[checkout:funnel]";

/** Log one funnel step to the console and persist it for the conversion funnel. */
export function logCheckout(
  step: CheckoutStep,
  data: Record<string, unknown> = {},
): void {
  const isError = step.endsWith("_failed");
  const payload = { step, ts: new Date().toISOString(), ...data };
  if (isError) console.error(PREFIX, step, payload);
  else console.info(PREFIX, step, payload);

  // Persist (best-effort; never blocks or throws into the checkout flow).
  if (typeof window !== "undefined") {
    void import("@/lib/visitor")
      .then((m) =>
        m.trackEvent(`funnel_${step}`, {
          value: typeof data.value === "number" ? (data.value as number) : undefined,
          metadata: data,
        }),
      )
      .catch(() => {});
  }
}

/**
 * Translate raw/technical errors (server-fn throws, Razorpay codes, network
 * failures) into a calm, readable message the customer can act on. Users must
 * never see a raw stack trace, "fetch failed", or an internal error string.
 */
export function friendlyCheckoutError(e: unknown): string {
  const raw =
    (e as { message?: string } | null)?.message ??
    (typeof e === "string" ? e : "") ??
    "";
  const msg = raw.toLowerCase();

  // Network / connectivity
  if (
    msg.includes("failed to fetch") ||
    msg.includes("networkerror") ||
    msg.includes("network request failed") ||
    msg.includes("load failed") ||
    msg.includes("check your network")
  ) {
    return "We couldn't reach our servers. Please check your internet connection and try again.";
  }

  // Razorpay SDK didn't load (ad-blocker, flaky mobile network)
  if (msg.includes("razorpay not loaded") || msg.includes("failed to load razorpay")) {
    return "The secure payment window couldn't load. Disable any ad-blocker and try again.";
  }

  // Stock / inventory
  if (msg.includes("stock") || msg.includes("out of stock") || msg.includes("inventory")) {
    return "Some items in your cart just went out of stock. Please review your cart and retry.";
  }

  // Pricing / region
  if (msg.includes("pricing unavailable") || msg.includes("price")) {
    return "Pricing for one of your items isn't available in your region right now. Please try again shortly.";
  }

  // Address
  if (msg.includes("address")) {
    return "We couldn't use that shipping address. Please re-select or add a delivery address.";
  }

  // Razorpay credentials / gateway
  if (
    msg.includes("razorpay credentials") ||
    msg.includes("could not initialise payment") ||
    msg.includes("could not start checkout") ||
    msg.includes("gateway")
  ) {
    return "Our payment service is temporarily unavailable. Please try again in a moment.";
  }

  // Auth / session
  if (msg.includes("unauthorized") || msg.includes("not authorised") || msg.includes("auth")) {
    return "Your session expired. Please sign in again to complete your order.";
  }

  // Signature / verification
  if (msg.includes("verification") || msg.includes("signature")) {
    return "We couldn't verify your payment. If you were charged, it will auto-resolve and we'll email you.";
  }

  // Fall back to a trimmed version of a readable server message, else generic.
  if (raw && raw.length < 140 && !/[{}<>]/.test(raw)) return raw;
  return "Something went wrong while processing your order. Your cart is safe — please try again.";
}
