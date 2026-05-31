// Single source of truth for checkout readiness. BOTH the desktop and mobile
// CTAs (and the progress stepper) derive their enabled/disabled state and the
// human-readable blocked reason from this one pure function — no duplicated
// logic anywhere in the checkout UI.

import type { Region } from "./pricing";

export type CheckoutStepId =
  | "cart"
  | "address"
  | "delivery"
  | "payment"
  | "review"
  | "complete";

export const CHECKOUT_STEPS: { id: CheckoutStepId; label: string }[] = [
  { id: "cart", label: "Cart" },
  { id: "address", label: "Address" },
  { id: "delivery", label: "Delivery" },
  { id: "payment", label: "Payment" },
  { id: "review", label: "Review" },
  { id: "complete", label: "Complete" },
];

export type DeliveryStatus =
  | "idle"
  | "checking"
  | "serviceable"
  | "service_down"
  | "not_serviceable";

export type CheckoutStateInput = {
  region: Region;
  /** An address row is selected. */
  addressSelected: boolean;
  /** Selected address has all the fields needed to ship. */
  addressComplete: boolean;
  deliveryStatus: DeliveryStatus;
  /** A serviceability message to surface when not deliverable. */
  deliveryMessage?: string | null;
  paymentSelected: boolean;
  /** Every cart line is in stock. */
  stockAvailable: boolean;
  /** Cart has at least one line. */
  cartValid: boolean;
  /** User session present and stock reservation not expired. */
  sessionValid: boolean;
  /** Region (currency) resolved before pricing rendered. */
  regionVerified: boolean;
  /** Order total in region-native currency. */
  total: number;
  /** Currently busy (opening / verifying payment). */
  busy: boolean;
  orderPlaced?: boolean;
};

export type CheckoutState = {
  addressValid: boolean;
  deliveryVerified: boolean;
  paymentSelected: boolean;
  stockAvailable: boolean;
  regionVerified: boolean;
  cartValid: boolean;
  sessionValid: boolean;
  checkoutReady: boolean;
  blockedReason: string | null;
  currentStep: CheckoutStepId;
  /** Steps the user has fully cleared (for checkmarks). */
  completedSteps: CheckoutStepId[];
};

/** Minimum order value per region (keeps tiny test orders from blocking real ones). */
export const MIN_ORDER: Record<Region, number> = {
  india: 1,
  international: 1,
};

export function computeCheckoutState(input: CheckoutStateInput): CheckoutState {
  const addressValid = input.addressSelected && input.addressComplete;
  const deliveryVerified =
    input.deliveryStatus === "serviceable" || input.deliveryStatus === "service_down";
  const aboveMinimum = input.total >= MIN_ORDER[input.region];

  // Blocking order is intentional: clear the most fundamental problems first so
  // the customer is told the single most important next action.
  let blockedReason: string | null = null;
  if (!input.regionVerified) blockedReason = "Detecting your region…";
  else if (!input.cartValid) blockedReason = "Your cart is empty";
  else if (!input.sessionValid) blockedReason = "Session expired — refresh to continue";
  else if (!input.addressSelected) blockedReason = "Select a delivery address";
  else if (!input.addressComplete) blockedReason = "Address incomplete — add the missing details";
  else if (input.deliveryStatus === "checking") blockedReason = "Verifying delivery location…";
  else if (input.deliveryStatus === "not_serviceable")
    blockedReason = input.deliveryMessage || "Verify delivery location";
  else if (!input.paymentSelected) blockedReason = "Choose a payment method";
  else if (!input.stockAvailable) blockedReason = "Product out of stock";
  else if (!aboveMinimum) blockedReason = "Order amount below minimum";

  const checkoutReady = blockedReason === null && !input.busy;

  // Current step + completed checkmarks.
  const completedSteps: CheckoutStepId[] = ["cart"];
  if (addressValid) completedSteps.push("address");
  if (deliveryVerified) completedSteps.push("delivery");
  if (addressValid && deliveryVerified && input.paymentSelected) completedSteps.push("payment");
  if (input.orderPlaced) completedSteps.push("review", "complete");

  let currentStep: CheckoutStepId = "review";
  if (input.orderPlaced) currentStep = "complete";
  else if (!addressValid) currentStep = "address";
  else if (!deliveryVerified) currentStep = "delivery";
  else if (!input.paymentSelected) currentStep = "payment";
  else currentStep = "review";

  return {
    addressValid,
    deliveryVerified,
    paymentSelected: input.paymentSelected,
    stockAvailable: input.stockAvailable,
    regionVerified: input.regionVerified,
    cartValid: input.cartValid,
    sessionValid: input.sessionValid,
    checkoutReady,
    blockedReason,
    currentStep,
    completedSteps,
  };
}
