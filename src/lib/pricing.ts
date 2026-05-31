// Shared, client-safe pricing rules. Used by BOTH the storefront checkout
// (display) and the server-side re-pricer (charged amount) so the amount a
// customer SEES always equals the amount they are CHARGED.
//
// CRITICAL: There is NO hardcoded currency conversion here. Each region is
// priced in its own native currency using admin-configured prices
// (price_inr for India, price_usd for International).

export type Region = "india" | "international";
export type Currency = "INR" | "USD";

export const REGION_CURRENCY: Record<Region, Currency> = {
  india: "INR",
  international: "USD",
};

/** Free-shipping thresholds and flat shipping fees, in each region's currency. */
export const SHIPPING: Record<Region, { freeAbove: number; flat: number }> = {
  india: { freeAbove: 4000, flat: 99 },
  international: { freeAbove: 50, flat: 9.99 },
};

/** Tax rate applied to the subtotal, per region. */
export const TAX_RATE: Record<Region, number> = {
  india: 0.18,
  international: 0.08,
};

/** INR is charged in whole rupees; USD keeps 2 decimal places. */
export function roundMoney(region: Region, n: number): number {
  return region === "india" ? Math.round(n) : +n.toFixed(2);
}

/** Smallest currency unit (paise / cents) for payment gateways. */
export function toMinorUnits(amount: number): number {
  return Math.round(amount * 100);
}

export type OrderTotals = {
  currency: Currency;
  subtotal: number;
  shipping: number;
  tax: number;
  discount: number;
  total: number;
};

/**
 * Compute order totals from a region-native subtotal. The math mirrors the
 * legacy rules (shipping by subtotal threshold, tax on subtotal, discount last)
 * but is applied in the region's own currency with no conversion.
 */
export function computeOrderTotals(
  region: Region,
  subtotal: number,
  discount = 0,
  /**
   * Admin-defined per-product shipping total (sum of each product's shipping
   * fee × qty). When provided (including 0), it overrides the flat region
   * shipping rule so the charge a customer sees and pays reflects exactly what
   * admin configured per product. Pass `undefined` to use the legacy flat rule.
   */
  shippingOverride?: number,
): OrderTotals {
  const sub = roundMoney(region, Math.max(0, subtotal));
  const disc = roundMoney(region, Math.max(0, Math.min(sub, discount)));
  const shipping =
    shippingOverride != null
      ? roundMoney(region, Math.max(0, shippingOverride))
      : sub > SHIPPING[region].freeAbove
        ? 0
        : SHIPPING[region].flat;
  const tax = roundMoney(region, sub * TAX_RATE[region]);
  const total = Math.max(0, roundMoney(region, sub + shipping + tax - disc));
  return {
    currency: REGION_CURRENCY[region],
    subtotal: sub,
    shipping: roundMoney(region, shipping),
    tax,
    discount: disc,
    total,
  };
}

export function formatMoney(region: Region, amount: number): string {
  if (region === "india") return `₹${Math.round(amount).toLocaleString("en-IN")}`;
  return `$${Number(amount).toFixed(2)}`;
}
