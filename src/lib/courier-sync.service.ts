// Courier sync engine — pure, deterministic logic shared by webhook receivers,
// admin tools and the customer tracking page. NO mock data and NO network calls
// live here; this only DETECTS couriers, VALIDATES tracking numbers and
// NORMALIZES courier-specific status text into our unified status set.

export type UnifiedStatus =
  | "pending"
  | "packed"
  | "shipped"
  | "in_transit"
  | "out_for_delivery"
  | "delivered"
  | "failed_delivery"
  | "returned"
  | "cancelled";

export const UNIFIED_STATUSES: UnifiedStatus[] = [
  "pending", "packed", "shipped", "in_transit", "out_for_delivery",
  "delivered", "failed_delivery", "returned", "cancelled",
];

export type CourierKey =
  | "delhivery" | "shiprocket" | "bluedart" | "dtdc" | "xpressbees"
  | "ecomexpress" | "indiapost" | "dhl" | "fedex" | "ups" | "aramex";

type CourierSpec = {
  key: CourierKey;
  label: string;
  region: "india" | "international";
  /** Matches a free-text carrier name stored on the shipment. */
  match: RegExp;
  /** Validates an AWB / tracking number format. Permissive but non-empty. */
  validate: (tn: string) => boolean;
  /** Optional exact courier status-code → unified mapping. */
  codeMap?: Record<string, UnifiedStatus>;
};

const ALNUM = /^[A-Za-z0-9-]{6,40}$/;

export const COURIERS: CourierSpec[] = [
  { key: "delhivery", label: "Delhivery", region: "india", match: /delhivery/i,
    validate: (t) => /^[0-9]{11,14}$/.test(t),
    codeMap: { Manifested: "packed", "In Transit": "in_transit", Dispatched: "out_for_delivery", Delivered: "delivered", RTO: "returned", DTO: "returned", Pending: "pending" } },
  { key: "shiprocket", label: "Shiprocket", region: "india", match: /shiprocket/i, validate: (t) => ALNUM.test(t) },
  { key: "bluedart", label: "Blue Dart", region: "india", match: /blue\s*dart/i, validate: (t) => /^[0-9]{9,12}$/.test(t) },
  { key: "dtdc", label: "DTDC", region: "india", match: /dtdc/i, validate: (t) => ALNUM.test(t) },
  { key: "xpressbees", label: "XpressBees", region: "india", match: /xpress\s*bees/i, validate: (t) => ALNUM.test(t) },
  { key: "ecomexpress", label: "Ecom Express", region: "india", match: /ecom\s*express/i, validate: (t) => /^[0-9]{10,16}$/.test(t) },
  { key: "indiapost", label: "India Post", region: "india", match: /india\s*post|speed\s*post/i, validate: (t) => /^[A-Z]{2}[0-9]{9}[A-Z]{2}$/.test(t) || ALNUM.test(t) },
  { key: "dhl", label: "DHL", region: "international", match: /dhl/i, validate: (t) => /^[0-9]{10,11}$/.test(t) || ALNUM.test(t) },
  { key: "fedex", label: "FedEx", region: "international", match: /fedex/i, validate: (t) => /^[0-9]{12,15}$/.test(t) },
  { key: "ups", label: "UPS", region: "international", match: /\bups\b/i, validate: (t) => /^1Z[0-9A-Z]{16}$/i.test(t) || ALNUM.test(t) },
  { key: "aramex", label: "Aramex", region: "international", match: /aramex/i, validate: (t) => /^[0-9]{10,14}$/.test(t) },
];

/** Detect a courier from its carrier name, or directly by key. */
export function detectCourier(input?: string | null): CourierSpec | null {
  if (!input) return null;
  const direct = COURIERS.find((c) => c.key === input.toLowerCase());
  if (direct) return direct;
  return COURIERS.find((c) => c.match.test(input)) ?? null;
}

/** Validate a tracking number for a given courier (or any courier if unknown). */
export function isValidTrackingNumber(courier: string | null | undefined, tn: string | null | undefined): boolean {
  if (!tn || !tn.trim()) return false;
  const clean = tn.trim();
  const spec = detectCourier(courier);
  if (spec) return spec.validate(clean);
  // Unknown courier: accept a reasonable generic AWB.
  return ALNUM.test(clean) || /^[A-Z]{2}[0-9]{9}[A-Z]{2}$/.test(clean);
}

// Keyword rules applied to free-text courier status / scan descriptions.
// Ordered most-specific first; the first match wins.
const KEYWORD_RULES: { re: RegExp; status: UnifiedStatus }[] = [
  { re: /out\s*for\s*delivery|with\s*delivery\s*(agent|courier)/i, status: "out_for_delivery" },
  { re: /delivered|delivery\s*successful|consignee/i, status: "delivered" },
  { re: /(failed|unsuccessful|undelivered|delivery\s*attempt\s*failed|not\s*delivered)/i, status: "failed_delivery" },
  { re: /\b(rto|return(ed)?\s*(to\s*origin)?|dto)\b/i, status: "returned" },
  { re: /cancel/i, status: "cancelled" },
  { re: /(in\s*transit|arrived\s*at|departed|in\s*scan|received\s*at\s*(hub|facility)|forwarded|line\s*haul|reached)/i, status: "in_transit" },
  { re: /(picked\s*up|shipped|dispatch|manifest.*pickup|out\s*scan|handed\s*over\s*to\s*carrier)/i, status: "shipped" },
  { re: /(packed|ready\s*to\s*ship|manifest(ed)?|label\s*created)/i, status: "packed" },
  { re: /(pending|order\s*placed|booked|info\s*received|awaiting)/i, status: "pending" },
];

/**
 * Normalize a courier status into our unified set.
 * `code` is an exact courier status code (checked against codeMap first);
 * `text` is the human-readable scan description (keyword-matched as fallback).
 */
export function normalizeStatus(
  courier: string | null | undefined,
  code?: string | null,
  text?: string | null,
): UnifiedStatus | null {
  const spec = detectCourier(courier);
  if (spec?.codeMap && code && spec.codeMap[code]) return spec.codeMap[code];
  // Direct unified value passthrough.
  const candidate = (code ?? "").toLowerCase().replace(/[\s-]+/g, "_");
  if ((UNIFIED_STATUSES as string[]).includes(candidate)) return candidate as UnifiedStatus;
  const haystack = `${code ?? ""} ${text ?? ""}`;
  for (const rule of KEYWORD_RULES) if (rule.re.test(haystack)) return rule.status;
  return null;
}

export const STATUS_LABEL: Record<UnifiedStatus, string> = {
  pending: "Pending", packed: "Packed", shipped: "Shipped",
  in_transit: "In Transit", out_for_delivery: "Out for Delivery",
  delivered: "Delivered", failed_delivery: "Failed Delivery",
  returned: "Returned", cancelled: "Cancelled",
};

// ── Live ETA engine ─────────────────────────────────────────────────────────
export type EtaState = "on_schedule" | "arriving_today" | "delayed" | "delivered" | "unknown";

export function computeEta(opts: {
  status: string;
  estimatedDelivery?: string | null; // date or ISO
  actualDelivery?: string | null;
  now?: Date;
}): { state: EtaState; label: string } {
  const now = opts.now ?? new Date();
  if (opts.status === "delivered") return { state: "delivered", label: "Delivered" };
  if (opts.status === "cancelled") return { state: "unknown", label: "Cancelled" };
  if (opts.status === "returned") return { state: "unknown", label: "Returned to origin" };
  if (!opts.estimatedDelivery) return { state: "unknown", label: "ETA pending" };

  const eta = new Date(opts.estimatedDelivery);
  if (isNaN(eta.getTime())) return { state: "unknown", label: "ETA pending" };

  const startOfDay = (d: Date) => new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime();
  const etaDay = startOfDay(eta);
  const today = startOfDay(now);

  if (etaDay < today) return { state: "delayed", label: "Delayed" };
  if (etaDay === today || opts.status === "out_for_delivery") return { state: "arriving_today", label: "Arriving today" };
  return { state: "on_schedule", label: "On schedule" };
}
