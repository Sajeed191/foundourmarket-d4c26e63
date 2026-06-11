import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { supabaseAdmin } from "@/integrations/supabase/client.server";
import { buildTrackingUrl, courierLabel } from "@/lib/courier";

const schema = z.object({
  orderId: z.string().trim().min(6).max(64),
  email: z.string().trim().email().max(255),
});

const ORDER_COLUMNS =
  "id, user_id, status, fulfillment_status, currency, subtotal, discount, tax, shipping, total, contact_email, shipping_address, created_at, updated_at";

export const trackOrder = createServerFn({ method: "POST" })
  .inputValidator((input) => schema.parse(input))
  .handler(async ({ data }) => {
    // Normalize the supplied identifier: drop a leading "#" (shown in the UI),
    // trim, and lowercase. Customers usually paste the SHORT id (#abc12345) that
    // we display on the success screen / emails — i.e. the first 8 chars of the
    // UUID — not the full 36-char UUID. Support both.
    const rawId = data.orderId.trim().replace(/^#/, "").toLowerCase();
    const supplied = data.email.trim().toLowerCase();

    const isUuid =
      /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/.test(rawId);
    const isShortId = /^[0-9a-f]{8}$/.test(rawId);

    if (!isUuid && !isShortId) {
      console.warn("[trackOrder] invalid order id format", { rawId });
      return { found: false as const, reason: "invalid_id" as const };
    }

    // Resolve candidate orders. Full UUID => exact match. Short id => range
    // scan over the first UUID segment (id BETWEEN prefix-000…0 AND prefix-fff…f).
    let candidates: Array<Record<string, unknown>> = [];
    if (isUuid) {
      const { data: order, error } = await supabaseAdmin
        .from("orders")
        .select(ORDER_COLUMNS)
        .eq("id", rawId)
        .maybeSingle();
      if (error) throw new Error(error.message);
      if (order) candidates = [order];
    } else {
      const { data: rows, error } = await supabaseAdmin
        .from("orders")
        .select(ORDER_COLUMNS)
        .gte("id", `${rawId}-0000-0000-0000-000000000000`)
        .lte("id", `${rawId}-ffff-ffff-ffff-ffffffffffff`);
      if (error) throw new Error(error.message);
      candidates = rows ?? [];
    }

    console.log("[trackOrder] lookup", {
      rawId,
      mode: isUuid ? "uuid" : "short",
      email: supplied,
      candidates: candidates.length,
    });

    if (candidates.length === 0) {
      return { found: false as const, reason: "not_found" as const };
    }

    // Match the supplied email against each candidate's stored contact email,
    // falling back to the registered email of the order owner (covers legacy
    // orders created before contact_email was captured).
    let order: Record<string, unknown> | null = null;
    for (const c of candidates) {
      const contactEmail = ((c.contact_email as string) ?? "").trim().toLowerCase();
      if (contactEmail && contactEmail === supplied) {
        order = c;
        break;
      }
      const userId = c.user_id as string | null;
      if (userId) {
        const { data: authUser } = await supabaseAdmin.auth.admin.getUserById(userId);
        const ownerEmail = authUser?.user?.email?.trim().toLowerCase() ?? "";
        if (ownerEmail && ownerEmail === supplied) {
          order = c;
          break;
        }
      }
    }

    if (!order) {
      console.warn("[trackOrder] email mismatch", { rawId, email: supplied });
      return { found: false as const, reason: "email_mismatch" as const };
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

