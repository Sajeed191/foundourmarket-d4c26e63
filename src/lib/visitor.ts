import { supabase } from "@/integrations/supabase/client";

/**
 * Enterprise visitor identity + traffic tracking engine.
 *
 * Single source of truth for visitor/session identity. Every page view is
 * written to `page_views` and folded into `visitor_sessions` via the
 * `track_visit` RPC (SECURITY DEFINER so guests can keep sessions alive).
 * Rich domain events flow into `analytics_events` with classified metadata.
 */

const VISITOR_KEY = "fom_visitor_id"; // persistent across sessions (localStorage)
const SESSION_KEY = "fom_session_id"; // current session (sessionStorage)
const SESSION_TS_KEY = "fom_session_ts"; // last-activity timestamp (localStorage)
const SESSION_TTL_MS = 30 * 60 * 1000; // 30 min inactivity = new session

function uuid(): string {
  try {
    return crypto.randomUUID();
  } catch {
    return "id-" + Math.random().toString(36).slice(2) + Date.now().toString(36);
  }
}

/** Stable per-device visitor id — survives refresh, navigation, return visits. */
export function visitorId(): string {
  if (typeof window === "undefined") return "ssr";
  let v = localStorage.getItem(VISITOR_KEY);
  if (!v) {
    v = uuid();
    localStorage.setItem(VISITOR_KEY, v);
  }
  return v;
}

/**
 * Session id that survives refresh/navigation but rotates after 30 min of
 * inactivity. Stored in localStorage (mobile browsers drop sessionStorage on
 * reload) with an activity timestamp guard.
 */
export function sessionId(): { id: string; isNew: boolean } {
  if (typeof window === "undefined") return { id: "ssr", isNew: false };
  const now = Date.now();
  const last = Number(localStorage.getItem(SESSION_TS_KEY) || 0);
  let id = localStorage.getItem(SESSION_KEY);
  let isNew = false;
  if (!id || !last || now - last > SESSION_TTL_MS) {
    id = uuid();
    localStorage.setItem(SESSION_KEY, id);
    isNew = true;
  }
  localStorage.setItem(SESSION_TS_KEY, String(now));
  return { id, isNew };
}

export function deviceType(): "mobile" | "tablet" | "desktop" {
  if (typeof navigator === "undefined") return "desktop";
  const ua = navigator.userAgent;
  if (/iPad|Tablet|PlayBook|Silk|(Android(?!.*Mobile))/i.test(ua)) return "tablet";
  if (/Mobi|Android|iPhone|iPod|IEMobile|BlackBerry|Opera Mini/i.test(ua)) return "mobile";
  return "desktop";
}

export function browserName(): string {
  if (typeof navigator === "undefined") return "unknown";
  const ua = navigator.userAgent;
  if (/Edg\//.test(ua)) return "Edge";
  if (/OPR\/|Opera/.test(ua)) return "Opera";
  if (/Chrome\//.test(ua) && !/Chromium/.test(ua)) return "Chrome";
  if (/Firefox\//.test(ua)) return "Firefox";
  if (/Safari\//.test(ua) && /Version\//.test(ua)) return "Safari";
  return "Other";
}

export function osName(): string {
  if (typeof navigator === "undefined") return "unknown";
  const ua = navigator.userAgent;
  if (/Windows/.test(ua)) return "Windows";
  if (/Android/.test(ua)) return "Android";
  if (/iPhone|iPad|iPod/.test(ua)) return "iOS";
  if (/Mac OS X/.test(ua)) return "macOS";
  if (/Linux/.test(ua)) return "Linux";
  return "Other";
}

/** Region the visitor is currently browsing (India / International). */
export function currentRegion(): "india" | "international" {
  if (typeof window === "undefined") return "international";
  return localStorage.getItem("market_region") === "india" ? "india" : "international";
}

function countryLabel(): string {
  return currentRegion() === "india" ? "India" : "International";
}

/**
 * Classify a referrer + UTM params into a canonical traffic source.
 * Drives the Traffic Source Intelligence dashboard.
 */
export function classifySource(referrer: string, url?: string): string {
  try {
    const u = url ? new URL(url) : typeof window !== "undefined" ? new URL(window.location.href) : null;
    const utm = u?.searchParams.get("utm_source")?.toLowerCase();
    if (utm) {
      const map: Record<string, string> = {
        google: "Google Search", bing: "Bing", yahoo: "Yahoo",
        facebook: "Facebook", fb: "Facebook", instagram: "Instagram", ig: "Instagram",
        youtube: "YouTube", tiktok: "TikTok", reddit: "Reddit", pinterest: "Pinterest",
        whatsapp: "WhatsApp", telegram: "Telegram", email: "Email Campaigns",
        newsletter: "Email Campaigns", influencer: "Influencers", affiliate: "Affiliate Sources",
      };
      if (map[utm]) return map[utm];
    }
  } catch {
    /* ignore */
  }

  if (!referrer) return "Direct";
  let host = referrer;
  try {
    host = new URL(referrer).hostname.replace(/^www\./, "").toLowerCase();
  } catch {
    /* ignore */
  }
  if (typeof window !== "undefined" && host.includes(window.location.hostname)) return "Direct";

  const rules: [RegExp, string][] = [
    [/google\./, "Google Search"], [/bing\./, "Bing"], [/yahoo\./, "Yahoo"],
    [/duckduckgo\./, "Google Search"],
    [/facebook\.|fb\.com|fb\.me/, "Facebook"], [/instagram\./, "Instagram"],
    [/youtube\.|youtu\.be/, "YouTube"], [/tiktok\./, "TikTok"], [/reddit\./, "Reddit"],
    [/pinterest\./, "Pinterest"], [/whatsapp\.|wa\.me/, "WhatsApp"], [/t\.me|telegram\./, "Telegram"],
  ];
  for (const [re, label] of rules) if (re.test(host)) return label;
  return "Referral Sites";
}

/** Derive a route category + slugs from a pathname for journey analytics. */
export function classifyRoute(path: string): {
  route: string;
  productSlug: string | null;
  categorySlug: string | null;
} {
  const seg = path.split("?")[0].split("/").filter(Boolean);
  if (seg.length === 0) return { route: "home", productSlug: null, categorySlug: null };
  const [first, second] = seg;
  if (first === "products") return { route: "product", productSlug: second ?? null, categorySlug: null };
  if (first === "category") return { route: "category", productSlug: null, categorySlug: second ?? null };
  const map: Record<string, string> = {
    search: "search", cart: "cart", checkout: "checkout", account: "account",
    blog: "blog", pages: "cms", deals: "deals", wishlist: "wishlist", compare: "compare",
  };
  return { route: map[first] ?? first, productSlug: null, categorySlug: null };
}

let lastPath = "";

/**
 * Record a page view + keep the visitor session live. Called on every route
 * change. Also emits a `page_view` analytics_event with classified metadata.
 */
export async function trackVisit(path: string): Promise<void> {
  if (typeof window === "undefined") return;
  if (path === lastPath) return; // guard against duplicate effect fires
  lastPath = path;

  const { id: sid, isNew } = sessionId();
  const referrer = document.referrer || "";
  const device = deviceType();
  const country = countryLabel();
  const source = classifySource(referrer);
  const { route, productSlug, categorySlug } = classifyRoute(path);

  try {
    await supabase.rpc("track_visit", {
      _path: path,
      _session_id: sid,
      _referrer: referrer || undefined,
      _user_agent: navigator.userAgent,
      _country: country,
      _device: device,
      _is_new_session: isNew,
    });
  } catch {
    /* swallow tracking errors — never break the storefront */
  }

  // Rich event copy for funnel / journey / source dashboards.
  void trackEvent("page_view", {
    path,
    productSlug: productSlug ?? undefined,
    metadata: {
      route, source, device, region: currentRegion(),
      browser: browserName(), os: osName(),
      visitor_id: visitorId(),
      category_slug: categorySlug,
      is_new_session: isNew,
      referrer,
    },
  });

  // GA4 page_view for SPA route changes.
  void import("@/lib/ga4").then((m) => m.ga4PageView(path)).catch(() => {});
}

/** Emit a domain analytics event (product_view, add_to_cart, purchase, …). */
export async function trackEvent(
  event: string,
  opts: {
    path?: string;
    productSlug?: string;
    value?: number;
    metadata?: Record<string, unknown>;
  } = {},
): Promise<void> {
  if (typeof window === "undefined") return;
  try {
    const { data: { user } } = await supabase.auth.getUser();
    await supabase.from("analytics_events").insert({
      user_id: user?.id ?? null,
      session_id: sessionId().id,
      event,
      path: opts.path ?? window.location.pathname,
      referrer: document.referrer || null,
      product_slug: opts.productSlug ?? null,
      value: opts.value ?? null,
      metadata: {
        region: currentRegion(),
        device: deviceType(),
        visitor_id: visitorId(),
        ...(opts.metadata ?? {}),
      } as never,
    });
  } catch {
    /* swallow analytics errors */
  }
}
