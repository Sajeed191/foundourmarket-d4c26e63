import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { supabaseAdmin } from "@/integrations/supabase/client.server";
import { resolveRegion, repriceFromDb } from "./razorpay.functions";
import { enqueueOrderEmail } from "./order-emails.server";

const lineItemSchema = z.object({
  slug: z.string().min(1).max(200),
  qty: z.number().int().min(1).max(99),
});

const attributionSchema = z
  .object({
    session_id: z.string().max(120).optional().nullable(),
    utm: z.record(z.string().max(200)).optional().nullable(),
  })
  .optional()
  .nullable();

const demoSchema = z.object({
  items: z.array(lineItemSchema).min(1).max(100),
  addressId: z.string().uuid(),
  attribution: attributionSchema,
});

/**
 * Place a demo order for international (Global Beta) customers while real
 * international payment gateways are still being integrated. The order is
 * created normally with a "demo" payment status so it flows through the same
 * fulfilment / admin tooling, but no real charge is attempted.
 */
export const placeDemoOrder = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) => demoSchema.parse(input))
  .handler(async ({ data, context }) => {
    const { supabase, userId, claims } = context as {
      supabase: any;
      userId: string;
      claims?: { email?: string };
    };

    // Region is resolved server-side; demo checkout only applies to non-India.
    const resolution = await resolveRegion(supabase, userId);
    const region = resolution.region === "india" ? "international" : resolution.region;

    const priced = await repriceFromDb(supabase, region, data.items, null);
    if (priced.totals.total < 1) {
      throw new Error("Order total is too low to process.");
    }

    // Load shipping address (RLS guarantees ownership of the row)
    const { data: addr, error: addrErr } = await supabase
      .from("addresses")
      .select("full_name,phone,line1,line2,city,state,postal,country")
      .eq("id", data.addressId)
      .maybeSingle();
    if (addrErr || !addr) throw new Error("Shipping address not found.");

    const { data: order, error: oErr } = await supabaseAdmin
      .from("orders")
      .insert({
        user_id: userId,
        status: "pending",
        currency: priced.totals.currency,
        subtotal: priced.totals.subtotal,
        shipping: priced.totals.shipping,
        tax: priced.totals.tax,
        discount: priced.totals.discount,
        total: priced.totals.total,
        contact_email: claims?.email ?? null,
        shipping_address: addr,
        payment_method: "global_beta",
        payment_status: "demo",
        payment_provider: "global_beta",
        market_region: "international",
        attribution_session_id: data.attribution?.session_id ?? null,
        attribution_utm: (data.attribution?.utm ?? {}) as never,
      })
      .select("id")
      .single();
    if (oErr || !order) throw new Error("Could not create demo order.");

    const orderItems = priced.lines.map((l) => ({
      order_id: order.id,
      product_slug: l.slug,
      name: l.name,
      image: l.image,
      unit_price: l.unit,
      quantity: l.qty,
      line_total: l.lineTotal,
    }));
    const { error: oiErr } = await supabaseAdmin.from("order_items").insert(orderItems);
    if (oiErr) {
      await supabaseAdmin.from("orders").delete().eq("id", order.id);
      throw new Error("Could not record order items.");
    }

    // Record a demo payment so it surfaces in the admin payment center.
    await supabaseAdmin.from("payments").insert({
      order_id: order.id,
      user_id: userId,
      method: "demo",
      status: "demo",
      amount: priced.totals.total,
      currency: priced.totals.currency,
      transaction_id: `DEMO-${order.id}`,
      demo: true,
      meta: {
        provider: "global_beta",
        country: (addr as any).country ?? resolution.detectedCountry ?? null,
      } as never,
    });

    // Send the "Demo Order Received" acknowledgement (idempotent).
    enqueueOrderEmail(order.id, "demo-order-received").catch(() => {});

    return {
      ok: true,
      orderId: order.id as string,
      total: priced.totals.total,
      currency: priced.totals.currency,
    };
  });

const waitlistSchema = z.object({
  name: z.string().trim().min(1).max(120),
  email: z.string().trim().email().max(255),
  country: z.string().trim().max(120).optional().nullable(),
  productSlug: z.string().trim().max(200).optional().nullable(),
});

/** Capture interest in international / global payments. */
export const joinGlobalWaitlist = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) => waitlistSchema.parse(input))
  .handler(async ({ data, context }) => {
    const { userId } = context as { userId: string };
    const { error } = await supabaseAdmin.from("international_waitlist").insert({
      user_id: userId,
      name: data.name,
      email: data.email.toLowerCase(),
      country: data.country ?? null,
      product_slug: data.productSlug ?? null,
    });
    if (error) throw new Error("Could not save your details. Please try again.");
    return { ok: true };
  });

export type GlobalExpansionStats = {
  interestCount: number;
  countries: { country: string; count: number }[];
  topProducts: { name: string; count: number }[];
  demoOrders: number;
};

const STAFF = ["admin", "super_admin", "manager"];

/** Staff-gated metrics for the admin Global Expansion widget. */
export const getGlobalExpansionStats = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { userId } = context as { userId: string };
    const { data: roleRows } = await supabaseAdmin
      .from("user_roles")
      .select("role")
      .eq("user_id", userId);
    const roles = (roleRows ?? []).map((r: any) => r.role);
    if (!roles.some((r: string) => STAFF.includes(r))) {
      throw new Error("You are not authorised to view this data.");
    }

    const [{ data: waitlist }, { data: demoOrders }] = await Promise.all([
      supabaseAdmin.from("international_waitlist").select("country"),
      supabaseAdmin
        .from("orders")
        .select("id, order_items(name, quantity)")
        .eq("payment_method", "global_beta"),
    ]);

    const countryMap = new Map<string, number>();
    for (const w of waitlist ?? []) {
      const c = ((w as any).country ?? "Unknown").toString().trim() || "Unknown";
      countryMap.set(c, (countryMap.get(c) ?? 0) + 1);
    }
    const countries = [...countryMap.entries()]
      .map(([country, count]) => ({ country, count }))
      .sort((a, b) => b.count - a.count);

    const productMap = new Map<string, number>();
    for (const o of demoOrders ?? []) {
      for (const it of ((o as any).order_items ?? []) as { name: string; quantity: number }[]) {
        const n = (it.name ?? "Unknown").toString();
        productMap.set(n, (productMap.get(n) ?? 0) + (Number(it.quantity) || 1));
      }
    }
    const topProducts = [...productMap.entries()]
      .map(([name, count]) => ({ name, count }))
      .sort((a, b) => b.count - a.count)
      .slice(0, 5);

    return {
      interestCount: (waitlist ?? []).length,
      countries,
      topProducts,
      demoOrders: (demoOrders ?? []).length,
    } satisfies GlobalExpansionStats;
  });
