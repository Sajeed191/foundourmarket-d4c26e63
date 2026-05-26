import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { supabaseAdmin } from "@/integrations/supabase/client.server";

const schema = z.object({
  orderId: z.string().trim().min(8).max(64),
  email: z.string().trim().email().max(255),
});

export const trackOrder = createServerFn({ method: "POST" })
  .inputValidator((input) => schema.parse(input))
  .handler(async ({ data }) => {
    const { data: order, error } = await supabaseAdmin
      .from("orders")
      .select("id, status, currency, subtotal, discount, tax, shipping, total, contact_email, shipping_address, created_at, updated_at")
      .eq("id", data.orderId)
      .maybeSingle();

    if (error) throw new Error(error.message);
    if (!order || (order.contact_email ?? "").toLowerCase() !== data.email.toLowerCase()) {
      return { found: false as const };
    }

    const { data: items } = await supabaseAdmin
      .from("order_items")
      .select("name, product_slug, image, quantity, unit_price, line_total")
      .eq("order_id", order.id);

    return { found: true as const, order, items: items ?? [] };
  });
