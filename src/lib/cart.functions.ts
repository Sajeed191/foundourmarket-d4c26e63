import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { supabaseAdmin } from "@/integrations/supabase/client.server";
import { resolveIndianPincode } from "./pincode-lookup.server";

/**
 * Cart server functions.
 * All pricing/inventory is computed from the trusted products table — the
 * client total is never used to make pricing or stock decisions.
 */

const lineSchema = z.object({
  slug: z.string().min(1).max(200),
  qty: z.number().int().min(1).max(99),
});

/** Re-compute subtotal (USD) from DB prices for a set of cart lines. */
async function subtotalFromDb(items: { slug: string; qty: number }[]) {
  const slugs = items.map((i) => i.slug);
  if (!slugs.length) return { subtotal: 0, bySlug: new Map<string, any>() };
  const { data, error } = await supabaseAdmin
    .from("products")
    .select("slug,price")
    .in("slug", slugs);
  if (error) throw new Error("Could not load products.");
  const bySlug = new Map<string, any>((data ?? []).map((p: any) => [p.slug, p]));
  const subtotal = items.reduce((s, i) => {
    const p = bySlug.get(i.slug);
    return p ? s + Number(p.price) * i.qty : s;
  }, 0);
  return { subtotal: +subtotal.toFixed(2), bySlug };
}

/**
 * Apply / validate a coupon against the real promo_codes table using a
 * server-recomputed subtotal. Returns the discount in USD.
 */
export const applyCoupon = createServerFn({ method: "POST" })
  .inputValidator((input) =>
    z
      .object({
        code: z.string().trim().min(1).max(64),
        items: z.array(lineSchema).min(1).max(100),
      })
      .parse(input),
  )
  .handler(async ({ data }) => {
    const { subtotal } = await subtotalFromDb(data.items);
    const code = data.code.toUpperCase();

    const { data: promo } = await supabaseAdmin
      .from("promo_codes")
      .select("code,kind,value,min_subtotal,max_uses,uses,active,expires_at")
      .ilike("code", code)
      .maybeSingle();

    if (!promo || !promo.active) {
      return { ok: false as const, reason: "This coupon code is not valid." };
    }
    if (promo.expires_at && new Date(promo.expires_at) < new Date()) {
      return { ok: false as const, reason: "This coupon has expired." };
    }
    if (promo.max_uses != null && promo.uses >= promo.max_uses) {
      return { ok: false as const, reason: "This coupon has reached its usage limit." };
    }
    if (Number(promo.min_subtotal) > subtotal) {
      return {
        ok: false as const,
        reason: `Add more to your cart to use this coupon (min subtotal $${Number(
          promo.min_subtotal,
        ).toFixed(2)}).`,
      };
    }

    const discount =
      promo.kind === "percent"
        ? +(subtotal * (Number(promo.value) / 100)).toFixed(2)
        : Math.min(subtotal, Number(promo.value));

    return {
      ok: true as const,
      code: promo.code as string,
      kind: promo.kind as string,
      value: Number(promo.value),
      discount,
      subtotal,
    };
  });

/**
 * Validate cart inventory against live stock (stock_quantity - reserved).
 * Returns availability per slug so the UI can flag out-of-stock / low-stock.
 */
export const validateCartInventory = createServerFn({ method: "POST" })
  .inputValidator((input) =>
    z.object({ items: z.array(lineSchema).min(1).max(100) }).parse(input),
  )
  .handler(async ({ data }) => {
    const slugs = data.items.map((i) => i.slug);
    const { data: rows, error } = await supabaseAdmin
      .from("products")
      .select("slug,stock_quantity,reserved_quantity,low_stock_threshold,in_stock")
      .in("slug", slugs);
    if (error) throw new Error("Could not validate inventory.");

    const bySlug = new Map<string, any>((rows ?? []).map((r: any) => [r.slug, r]));
    const results = data.items.map((i) => {
      const r = bySlug.get(i.slug);
      const available = r ? Math.max(0, r.stock_quantity - r.reserved_quantity) : 0;
      return {
        slug: i.slug,
        requested: i.qty,
        available,
        inStock: !!r?.in_stock && available > 0,
        lowStock: available > 0 && available <= (r?.low_stock_threshold ?? 5),
        exceedsStock: i.qty > available,
      };
    });

    return {
      ok: results.every((r) => r.inStock && !r.exceedsStock),
      results,
    };
  });

/**
 * Estimate shipping + delivery for an Indian PIN code using the India Post
 * public API. Shipping cost rules mirror checkout (free over $50).
 */
export const estimateShipping = createServerFn({ method: "POST" })
  .inputValidator((input) =>
    z
      .object({
        pincode: z.string().trim().regex(/^\d{6}$/, "PIN code must be 6 digits"),
        subtotal: z.number().min(0).max(1_000_000),
      })
      .parse(input),
  )
  .handler(async ({ data }) => {
    const resolved = await resolveIndianPincode(data.pincode);

    if (!resolved.ok) {
      // Distinguish a transient outage from a genuinely bad PIN.
      if (resolved.reason === "service_down") {
        return {
          ok: false as const,
          reason:
            "Delivery verification is temporarily unavailable. Our team will confirm availability before dispatch.",
        };
      }
      return {
        ok: false as const,
        reason: "We couldn't find this PIN code. Please check and try again.",
      };
    }

    const city: string | null = resolved.city;
    const state: string | null = resolved.state;

    // Metro / remote heuristics for delivery speed and COD availability.
    const metroStates = ["Delhi", "Maharashtra", "Karnataka", "Tamil Nadu", "Telangana", "Gujarat"];
    const remoteStates = [
      "Jammu and Kashmir",
      "Ladakh",
      "Arunachal Pradesh",
      "Nagaland",
      "Manipur",
      "Mizoram",
      "Andaman and Nicobar Islands",
      "Lakshadweep",
    ];
    const isMetro = state ? metroStates.includes(state) : false;
    const isRemote = state ? remoteStates.includes(state) : false;

    const minDays = isMetro ? 2 : isRemote ? 6 : 4;
    const maxDays = isMetro ? 4 : isRemote ? 9 : 6;
    const shippingUsd = data.subtotal > 50 ? 0 : 9.99;

    const eta = new Date();
    eta.setDate(eta.getDate() + maxDays);

    return {
      ok: true as const,
      city,
      state,
      minDays,
      maxDays,
      etaIso: eta.toISOString(),
      shippingUsd,
      codAvailable: !isRemote,
      expressAvailable: isMetro,
    };
  });
