import { supabase } from "@/integrations/supabase/client";
import { sessionId } from "@/lib/visitor";

/**
 * Client-side marketing attribution capture.
 *
 * When a visitor lands with UTM params (or a campaign id `fom_cid` injected by
 * the click-tracking redirect), we record a real `attribution_touches` row tied
 * to the current session. The server-side order trigger later resolves first-
 * and last-touch revenue attribution from these rows — no simulated data.
 *
 * The latest captured UTM/session is also mirrored to localStorage so it can be
 * attached to orders at checkout for deterministic attribution.
 */

const UTM_KEYS = ["utm_source", "utm_medium", "utm_campaign", "utm_content", "utm_term"] as const;
const STORE_KEY = "fom_attribution";
const LAST_TOUCH_KEY = "fom_last_touch_key";

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export type AttributionPayload = {
  session_id: string;
  utm: Record<string, string>;
  campaign_id: string | null;
  captured_at: string;
};

/** Read the persisted attribution payload (for attaching to orders). */
export function getStoredAttribution(): AttributionPayload | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = localStorage.getItem(STORE_KEY);
    return raw ? (JSON.parse(raw) as AttributionPayload) : null;
  } catch {
    return null;
  }
}

/**
 * Capture an attribution touch from the current URL. Safe to call on every
 * navigation — only records when real UTM/campaign params are present, and
 * de-duplicates identical consecutive touches within a session.
 */
export async function captureAttribution(): Promise<void> {
  if (typeof window === "undefined") return;

  let params: URLSearchParams;
  try {
    params = new URL(window.location.href).searchParams;
  } catch {
    return;
  }

  const utm: Record<string, string> = {};
  for (const k of UTM_KEYS) {
    const v = params.get(k);
    if (v) utm[k] = v.slice(0, 200);
  }
  const cidRaw = params.get("fom_cid");
  const campaignId = cidRaw && UUID_RE.test(cidRaw) ? cidRaw : null;

  // Nothing to attribute.
  if (Object.keys(utm).length === 0 && !campaignId) return;

  const { id: session_id } = sessionId();
  const landing = window.location.pathname.slice(0, 300);
  const referrer = document.referrer ? document.referrer.slice(0, 400) : null;

  // De-dupe identical touch (same params) within the same session.
  const touchKey = `${session_id}|${campaignId ?? ""}|${JSON.stringify(utm)}`;
  if (localStorage.getItem(LAST_TOUCH_KEY) === touchKey) return;
  localStorage.setItem(LAST_TOUCH_KEY, touchKey);

  const { data: auth } = await supabase.auth.getUser();
  const userId = auth.user?.id ?? null;

  await supabase.from("attribution_touches").insert({
    session_id,
    user_id: userId,
    campaign_id: campaignId,
    utm_source: utm.utm_source ?? null,
    utm_medium: utm.utm_medium ?? null,
    utm_campaign: utm.utm_campaign ?? null,
    utm_content: utm.utm_content ?? null,
    utm_term: utm.utm_term ?? null,
    landing_path: landing,
    referrer,
  });

  const payload: AttributionPayload = {
    session_id,
    utm,
    campaign_id: campaignId,
    captured_at: new Date().toISOString(),
  };
  try {
    localStorage.setItem(STORE_KEY, JSON.stringify(payload));
  } catch {
    /* ignore quota */
  }
}
