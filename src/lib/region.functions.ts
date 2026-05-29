import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { getRequestHeader } from "@tanstack/react-start/server";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

export type MarketRegion = "india" | "international";

/**
 * Suggest a market region from edge geo headers + browser locale.
 * This is only a suggestion for the selection modal — the user always confirms,
 * and the choice is locked server-side via `lockMarketRegion`.
 */
export const detectRegion = createServerFn({ method: "GET" }).handler(async () => {
  // Cloudflare / edge geo header
  const country =
    (getRequestHeader("cf-ipcountry") ||
      getRequestHeader("x-vercel-ip-country") ||
      getRequestHeader("x-country") ||
      "").toUpperCase();

  const lang = (getRequestHeader("accept-language") || "").toLowerCase();

  let suggested: MarketRegion = "international";
  if (country === "IN" || lang.includes("-in") || lang.startsWith("hi")) {
    suggested = "india";
  }

  return {
    suggested,
    countryCode: country || null,
  };
});

/**
 * Permanently lock the authenticated user's market region.
 * The database trigger refuses any later change, so this is write-once.
 */
export const lockMarketRegion = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) =>
    z
      .object({
        region: z.enum(["india", "international"]),
        countryCode: z.string().trim().max(4).optional().nullable(),
      })
      .parse(input),
  )
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context as { supabase: any; userId: string };

    // Refuse if already locked (defence in depth on top of the DB trigger)
    const { data: existing } = await supabase
      .from("profiles")
      .select("market_region")
      .eq("id", userId)
      .maybeSingle();

    if (existing?.market_region) {
      return { region: existing.market_region as MarketRegion, alreadyLocked: true };
    }

    const { error } = await supabase
      .from("profiles")
      .update({
        market_region: data.region,
        country_code: data.countryCode ?? null,
      })
      .eq("id", userId);

    if (error) throw new Error(error.message || "Could not set your region.");
    return { region: data.region, alreadyLocked: false };
  });

/** Read the authenticated user's locked region (null until they choose). */
export const getMyRegion = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { supabase, userId } = context as { supabase: any; userId: string };
    const { data } = await supabase
      .from("profiles")
      .select("market_region,country_code,region_locked_at")
      .eq("id", userId)
      .maybeSingle();
    return {
      region: (data?.market_region ?? null) as MarketRegion | null,
      countryCode: (data?.country_code ?? null) as string | null,
      lockedAt: (data?.region_locked_at ?? null) as string | null,
    };
  });
