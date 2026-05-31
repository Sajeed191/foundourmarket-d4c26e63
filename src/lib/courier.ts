// Courier tracking URL generation + display metadata.
// Shared by the customer tracking page and admin shipment tools.

export type CourierKey =
  | "delhivery"
  | "bluedart"
  | "dtdc"
  | "indiapost"
  | "xpressbees"
  | "ecomexpress"
  | "fedex"
  | "dhl";

type CourierDef = {
  key: CourierKey;
  label: string;
  /** Build a public tracking URL for a given AWB / tracking number. */
  url: (tn: string) => string;
  /** Matchers against a free-text carrier name stored on the shipment. */
  match: RegExp;
};

const COURIERS: CourierDef[] = [
  {
    key: "delhivery",
    label: "Delhivery",
    url: (tn) => `https://www.delhivery.com/track/package/${encodeURIComponent(tn)}`,
    match: /delhivery/i,
  },
  {
    key: "bluedart",
    label: "Blue Dart",
    url: (tn) => `https://www.bluedart.com/web/guest/trackdartresult?trackFor=0&trackNo=${encodeURIComponent(tn)}`,
    match: /blue\s*dart/i,
  },
  {
    key: "dtdc",
    label: "DTDC",
    url: (tn) => `https://www.dtdc.in/tracking/tracking_results.asp?Ttype=awb_no&strCnno=${encodeURIComponent(tn)}`,
    match: /dtdc/i,
  },
  {
    key: "indiapost",
    label: "India Post",
    url: (tn) => `https://www.indiapost.gov.in/_layouts/15/dop.portal.tracking/trackconsignment.aspx?LogicalName=${encodeURIComponent(tn)}`,
    match: /india\s*post|speed\s*post/i,
  },
  {
    key: "xpressbees",
    label: "XpressBees",
    url: (tn) => `https://www.xpressbees.com/shipment/tracking?awbNo=${encodeURIComponent(tn)}`,
    match: /xpress\s*bees/i,
  },
  {
    key: "ecomexpress",
    label: "Ecom Express",
    url: (tn) => `https://ecomexpress.in/tracking/?awb_field=${encodeURIComponent(tn)}`,
    match: /ecom\s*express/i,
  },
  {
    key: "fedex",
    label: "FedEx",
    url: (tn) => `https://www.fedex.com/fedextrack/?trknbr=${encodeURIComponent(tn)}`,
    match: /fedex/i,
  },
  {
    key: "dhl",
    label: "DHL",
    url: (tn) => `https://www.dhl.com/in-en/home/tracking/tracking-express.html?submit=1&tracking-id=${encodeURIComponent(tn)}`,
    match: /dhl/i,
  },
];

/** Resolve a carrier free-text name to a known courier definition. */
export function resolveCourier(carrier?: string | null): CourierDef | null {
  if (!carrier) return null;
  return COURIERS.find((c) => c.match.test(carrier)) ?? null;
}

/**
 * Build a public tracking URL. Prefers an explicit URL the admin saved;
 * otherwise auto-generates one from the carrier + tracking number.
 */
export function buildTrackingUrl(opts: {
  carrier?: string | null;
  trackingNumber?: string | null;
  trackingUrl?: string | null;
}): string | null {
  if (opts.trackingUrl && /^https?:\/\//i.test(opts.trackingUrl)) return opts.trackingUrl;
  if (!opts.trackingNumber) return null;
  const courier = resolveCourier(opts.carrier);
  return courier ? courier.url(opts.trackingNumber) : null;
}

export function courierLabel(carrier?: string | null): string | null {
  return resolveCourier(carrier)?.label ?? carrier ?? null;
}

export const SUPPORTED_COURIERS = COURIERS.map((c) => ({ key: c.key, label: c.label }));
