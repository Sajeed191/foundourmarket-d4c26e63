import { supabase } from "@/integrations/supabase/client";

type EventType = "impression" | "click" | "purchase";

// De-dupe impressions per page session so a single render doesn't spam rows.
const seenImpressions = new Set<string>();

export function trackFlashDealEvent(
  type: EventType,
  dealId: string | null,
  productId: string | null,
) {
  if (type === "impression" && dealId) {
    if (seenImpressions.has(dealId)) return;
    seenImpressions.add(dealId);
  }
  // Fire-and-forget; analytics must never block or break the UI.
  void supabase
    .from("flash_deal_events")
    .insert({ event_type: type, deal_id: dealId, product_id: productId })
    .then(() => {}, () => {});
}
