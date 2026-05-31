import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { supabaseAdmin } from "@/integrations/supabase/client.server";
import { buildTrackingUrl, courierLabel } from "@/lib/courier";

const schema = z.object({
  orderId: z.string().trim().min(8).max(64),
  email: z.string().trim().email().max(255),
});

export const trackOrder = createServerFn({ method: "POST" })
  .inputValidator((input) => schema.parse(input))
  .handler(async ({ data }) => {
    const isUuid =
      /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(
        data.orderId,
      );
    if (!isUuid) {
      return { found: false as const };
    }

    const { data: order, error } = await supabaseAdmin
      .from("orders")
      .select("id, status, fulfillment_status, currency, subtotal, discount, tax, shipping, total, contact_email, shipping_address, created_at, updated_at")
      .eq("id", data.orderId)
      .maybeSingle();

    if (error) throw new Error(error.message);
    if (!order) return { found: false as const };

    // Match the supplied email against the order's stored contact email, and
    // fall back to the registered email of the order owner (covers legacy
    // orders created before contact_email was captured).
    const supplied = data.email.toLowerCase();
    let emailMatches = (order.contact_email ?? "").toLowerCase() === supplied;
    if (!emailMatches && order.user_id) {
      const { data: authUser } = await supabaseAdmin.auth.admin.getUserById(order.user_id);
      const ownerEmail = authUser?.user?.email?.toLowerCase() ?? "";
      emailMatches = ownerEmail === supplied;
    }
    if (!emailMatches) {
      return { found: false as const };
    }


    const { data: items } = await supabaseAdmin
      .from("order_items")
      .select("name, product_slug, image, quantity, unit_price, line_total")
      .eq("order_id", order.id);

    // Latest shipment for the order (customers see the most recent one).
    const { data: shipmentRow } = await supabaseAdmin
      .from("shipments")
      .select(
        "id, status, carrier, tracking_number, tracking_url, estimated_delivery, shipped_at, delivered_at, packed_at, returned_at, cancelled_at, created_at, updated_at",
      )
      .eq("order_id", order.id)
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();

    let events: {
      id: string;
      status: string;
      description: string | null;
      location: string | null;
      occurred_at: string | null;
      created_at: string;
    }[] = [];

    let shipment:
      | {
          id: string;
          status: string;
          carrier: string | null;
          carrierLabel: string | null;
          tracking_number: string | null;
          tracking_url: string | null;
          estimated_delivery: string | null;
          shipped_at: string | null;
          delivered_at: string | null;
          packed_at: string | null;
        }
      | null = null;

    if (shipmentRow) {
      const { data: eventRows } = await supabaseAdmin
        .from("shipment_events")
        .select("id, status, description, location, occurred_at, created_at")
        .eq("shipment_id", shipmentRow.id)
        .order("occurred_at", { ascending: true });
      events = eventRows ?? [];

      shipment = {
        id: shipmentRow.id,
        status: shipmentRow.status,
        carrier: shipmentRow.carrier,
        carrierLabel: courierLabel(shipmentRow.carrier),
        tracking_number: shipmentRow.tracking_number,
        tracking_url: buildTrackingUrl({
          carrier: shipmentRow.carrier,
          trackingNumber: shipmentRow.tracking_number,
          trackingUrl: shipmentRow.tracking_url,
        }),
        estimated_delivery: shipmentRow.estimated_delivery,
        shipped_at: shipmentRow.shipped_at,
        delivered_at: shipmentRow.delivered_at,
        packed_at: shipmentRow.packed_at,
      };
    }

    return { found: true as const, order, items: items ?? [], shipment, events };
  });

