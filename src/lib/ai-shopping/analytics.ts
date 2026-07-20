// AI Shopping — lightweight client-side analytics buffer (v1.3 Step 2).
// Captures anonymous, non-PII events into a bounded localStorage ring so a
// future backend can drain them. No network calls, no personal data, no ids.
//
// PRIVACY: never accepts email/phone/address/token/order/payment fields. The
// caller is responsible for not passing PII; we still shallow-strip a small
// deny-list of well-known keys as a defensive net.

import type { ShoppingPage } from "./shopping-context";

export type AiAnalyticsEventType =
  | "ai_message_sent"
  | "ai_reply_received"
  | "ai_recommendation_shown"
  | "ai_product_clicked"
  | "ai_chip_clicked"
  | "ai_support_handoff";

export type AiAnalyticsEvent = {
  type: AiAnalyticsEventType;
  page: ShoppingPage | null;
  route: string | null;
  ts: number;
  meta?: Record<string, string | number | boolean | null>;
};

const STORAGE_KEY = "fom_ai_analytics_v1";
const MAX_EVENTS = 200;

const DENY_KEYS = new Set([
  "email", "phone", "address", "password", "otp", "token", "session",
  "auth", "authorization", "cookie", "payment", "card", "cvv", "iban",
]);

function safeMeta(
  meta?: Record<string, unknown>,
): Record<string, string | number | boolean | null> | undefined {
  if (!meta) return undefined;
  const out: Record<string, string | number | boolean | null> = {};
  for (const [k, v] of Object.entries(meta)) {
    if (DENY_KEYS.has(k.toLowerCase())) continue;
    if (v == null) { out[k] = null; continue; }
    if (typeof v === "string") out[k] = v.slice(0, 120);
    else if (typeof v === "number" || typeof v === "boolean") out[k] = v;
    // objects/arrays skipped to keep payload tiny
  }
  return out;
}

function readBuffer(): AiAnalyticsEvent[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [];
  } catch { return []; }
}

function writeBuffer(events: AiAnalyticsEvent[]): void {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(
      STORAGE_KEY,
      JSON.stringify(events.slice(-MAX_EVENTS)),
    );
  } catch { /* quota / private mode — ignore */ }
}

export function recordAiEvent(
  type: AiAnalyticsEventType,
  ctx?: { page?: ShoppingPage | null; route?: string | null },
  meta?: Record<string, unknown>,
): void {
  if (typeof window === "undefined") return;
  const event: AiAnalyticsEvent = {
    type,
    page: ctx?.page ?? null,
    route: ctx?.route ?? null,
    ts: Date.now(),
    meta: safeMeta(meta),
  };
  const buf = readBuffer();
  buf.push(event);
  writeBuffer(buf);
}

/** Drain the buffer (used by a future exporter). Currently unused. */
export function drainAiEvents(): AiAnalyticsEvent[] {
  const buf = readBuffer();
  writeBuffer([]);
  return buf;
}

/** Read without draining, for debugging. */
export function peekAiEvents(): AiAnalyticsEvent[] {
  return readBuffer();
}
