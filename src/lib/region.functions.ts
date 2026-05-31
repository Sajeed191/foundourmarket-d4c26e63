import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { getRequestHeader } from "@tanstack/react-start/server";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

export type MarketRegion = "india" | "international";

/** Server-side detection signals — never trusted blindly on the client. */
export type EdgeGeo = {
  suggested: MarketRegion;
  countryCode: string | null;
  /** 0–100 confidence the edge layer assigns to its suggestion. */
  edgeConfidence: number;
  /** True when the IP looks like a datacenter / proxy / VPN / Tor exit. */
  vpnSuspected: boolean;
  /** Edge-reported IANA timezone, when the platform provides it. */
  timezone: string | null;
};

// ASN / org substrings that strongly indicate hosting / proxy infrastructure.
const DATACENTER_HINTS = [
  "amazon", "aws", "google", "gcp", "microsoft", "azure", "digitalocean",
  "ovh", "hetzner", "linode", "vultr", "oracle", "cloudflare", "leaseweb",
  "choopa", "m247", "datacamp", "hosting", "colocation", "server", "vpn",
  "proxy", "tor", "relay", "datacenter", "data center",
];

/**
 * Layer 1 — Edge Geo-IP. Reads Cloudflare / Vercel / generic edge headers and
 * returns a region suggestion plus a confidence score and VPN/proxy signal.
 * Fast, runs before hydration. The client combines this with timezone + locale.
 */
export const detectRegion = createServerFn({ method: "GET" }).handler(
  async (): Promise<EdgeGeo> => {
    const country =
      (getRequestHeader("cf-ipcountry") ||
        getRequestHeader("x-vercel-ip-country") ||
        getRequestHeader("x-country") ||
        "").toUpperCase();

    const timezone =
      getRequestHeader("x-vercel-ip-timezone") ||
      getRequestHeader("cf-timezone") ||
      null;

    const lang = (getRequestHeader("accept-language") || "").toLowerCase();

    // Proxy / datacenter / Tor heuristics from edge-provided headers.
    const asnOrg = (
      getRequestHeader("cf-connecting-asn-org") ||
      getRequestHeader("x-asn-org") ||
      ""
    ).toLowerCase();
    const viaHeader = getRequestHeader("via") || "";
    const forwarded = getRequestHeader("x-forwarded-for") || "";
    const torHeader = (getRequestHeader("cf-tor") || "").toLowerCase();
    const threatScore = Number(getRequestHeader("cf-threat-score") || "0");

    const vpnSuspected =
      DATACENTER_HINTS.some((h) => asnOrg.includes(h)) ||
      torHeader === "true" ||
      threatScore >= 30 ||
      // Multiple hops in XFF often signals chained proxies.
      forwarded.split(",").filter(Boolean).length > 2 ||
      /\bproxy\b/i.test(viaHeader);

    // Score the suggestion. Country header is the strongest single signal.
    let suggested: MarketRegion = "international";
    let edgeConfidence = 0;

    const isIndiaTz = timezone === "Asia/Kolkata";
    const isIndiaLang = lang.includes("-in") || lang.startsWith("hi");

    if (country === "IN") {
      suggested = "india";
      edgeConfidence = 85;
      if (isIndiaTz) edgeConfidence += 10;
      if (isIndiaLang) edgeConfidence += 5;
    } else if (country) {
      suggested = "international";
      edgeConfidence = 85;
      // Conflicting locale lowers confidence (e.g. NRI on Indian locale abroad).
      if (isIndiaLang || isIndiaTz) edgeConfidence -= 25;
    } else {
      // No country header — fall back to weaker locale/timezone signals.
      if (isIndiaTz || isIndiaLang) {
        suggested = "india";
        edgeConfidence = 40;
      } else {
        suggested = "international";
        edgeConfidence = 35;
      }
    }

    // VPN/proxy collapses confidence so the client forces manual confirmation.
    if (vpnSuspected) edgeConfidence = Math.min(edgeConfidence, 30);

    return {
      suggested,
      countryCode: country || null,
      edgeConfidence: Math.max(0, Math.min(100, edgeConfidence)),
      vpnSuspected,
      timezone,
    };
  },
);

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

    // Self-assignment routine records rich history (method + actor) and refuses
    // to overwrite an already-locked region server-side (defence in depth).
    const { data: locked, error } = await supabase.rpc("self_lock_region", {
      _region: data.region,
      _country: data.countryCode ?? null,
      _method: "self",
    });

    if (error) throw new Error(error.message || "Could not set your region.");
    return { region: (locked ?? data.region) as MarketRegion, alreadyLocked: false };
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

/**
 * Admin-only checkout region debug. Returns exactly the signals the billing
 * path (createRazorpayOrder) uses to pick a currency, so staff can verify that
 * Indian shoppers resolve to IN / INDIA / INR before any Razorpay order exists.
 */
export const getCheckoutRegionDebug = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { supabase, userId } = context as { supabase: any; userId: string };

    const country =
      (getRequestHeader("cf-ipcountry") ||
        getRequestHeader("x-vercel-ip-country") ||
        getRequestHeader("x-country") ||
        "").toUpperCase() || null;
    const timezone =
      getRequestHeader("x-vercel-ip-timezone") ||
      getRequestHeader("cf-timezone") ||
      null;

    const { data } = await supabase
      .from("profiles")
      .select("market_region")
      .eq("id", userId)
      .maybeSingle();

    const locked = data?.market_region === "india" || data?.market_region === "international";
    let region: MarketRegion;
    let pricingSource: "profile_locked" | "edge_geo" | "default";
    let confidence: number;
    if (locked) {
      region = data.market_region;
      pricingSource = "profile_locked";
      confidence = 100;
    } else if (country === "IN") {
      region = "india";
      pricingSource = "edge_geo";
      confidence = 85;
    } else if (country) {
      region = "international";
      pricingSource = "edge_geo";
      confidence = 85;
    } else {
      region = "international";
      pricingSource = "default";
      confidence = 40;
    }

    return {
      detectedCountry: country,
      timezone,
      market: region,
      currency: region === "india" ? "INR" : "USD",
      pricingSource,
      confidence,
      profileLocked: locked,
    };
  });
