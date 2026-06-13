// Server-only Razorpay helpers. Never import from client code.
import { createHmac, timingSafeEqual } from "node:crypto";

export const USD_TO_INR = 83; // keep in sync with src/lib/region.tsx

export function getRazorpayCreds() {
  const keyId = process.env.RAZORPAY_KEY_ID;
  const keySecret = process.env.RAZORPAY_KEY_SECRET;
  if (!keyId || !keySecret) {
    throw new Error("Razorpay credentials are not configured.");
  }
  return { keyId, keySecret };
}

function basicAuth() {
  const { keyId, keySecret } = getRazorpayCreds();
  return "Basic " + Buffer.from(`${keyId}:${keySecret}`).toString("base64");
}

/** Call the Razorpay REST API. Returns parsed JSON or throws with the API error. */
export async function rzpFetch<T = any>(
  path: string,
  init: { method?: string; body?: unknown } = {},
): Promise<T> {
  const res = await fetch(`https://api.razorpay.com/v1${path}`, {
    method: init.method ?? "GET",
    headers: {
      Authorization: basicAuth(),
      "Content-Type": "application/json",
    },
    body: init.body ? JSON.stringify(init.body) : undefined,
  });
  const text = await res.text();
  let json: any = null;
  try {
    json = text ? JSON.parse(text) : null;
  } catch {
    /* non-json */
  }
  if (!res.ok) {
    const message = json?.error?.description || `Razorpay API error (${res.status})`;
    throw new Error(message);
  }
  return json as T;
}

/** Verify the checkout handshake signature: HMAC_SHA256(order_id|payment_id, key_secret). */
export function verifyPaymentSignature(
  orderId: string,
  paymentId: string,
  signature: string,
): boolean {
  const { keySecret } = getRazorpayCreds();
  const expected = createHmac("sha256", keySecret)
    .update(`${orderId}|${paymentId}`)
    .digest("hex");
  return safeEqualHex(expected, signature);
}

/** Verify a webhook payload signature against the webhook secret. */
export function verifyWebhookSignature(rawBody: string, signature: string): boolean {
  const secret = process.env.RAZORPAY_WEBHOOK_SECRET;
  if (!secret) return false;
  const expected = createHmac("sha256", secret).update(rawBody).digest("hex");
  return safeEqualHex(expected, signature);
}

function safeEqualHex(a: string, b: string): boolean {
  try {
    const bufA = Buffer.from(a, "hex");
    const bufB = Buffer.from(b, "hex");
    if (bufA.length !== bufB.length) return false;
    return timingSafeEqual(bufA, bufB);
  } catch {
    return false;
  }
}

/* ---------------------------------------------------------------------------
 * Customer + tokenized payment-method helpers
 * ------------------------------------------------------------------------- */

export type RzpToken = {
  id: string;
  method?: string; // "card" | "upi" | ...
  card?: {
    last4?: string;
    network?: string;
    type?: string;
    issuer?: string;
    expiry_month?: number;
    expiry_year?: number;
  } | null;
  vpa?: { username?: string; handle?: string } | null;
  expired_at?: number | null;
  used_at?: number | null;
};

/** Normalise a Razorpay token entity into our saved_payment_methods shape. */
export function mapRzpToken(token: RzpToken, customerId: string, userId: string) {
  const isUpi = token.method === "upi" || !!token.vpa;
  const upiVpa = token.vpa
    ? [token.vpa.username, token.vpa.handle].filter(Boolean).join("@")
    : null;
  return {
    user_id: userId,
    razorpay_customer_id: customerId,
    razorpay_token_id: token.id,
    provider: "razorpay",
    payment_type: isUpi ? "upi" : "card",
    brand: token.card?.network ?? null,
    last4: token.card?.last4 ?? null,
    expiry_month: token.card?.expiry_month ?? null,
    expiry_year: token.card?.expiry_year ?? null,
    upi_vpa: upiVpa,
  };
}

/* ---------------------------------------------------------------------------
 * Account diagnostics — mode + enabled payment methods
 * ------------------------------------------------------------------------- */

export type RazorpayMode = "test" | "live" | "unknown";

/** Derive the account mode from the public key prefix (rzp_test_ / rzp_live_). */
export function getRazorpayMode(): RazorpayMode {
  const id = process.env.RAZORPAY_KEY_ID ?? "";
  if (id.startsWith("rzp_test")) return "test";
  if (id.startsWith("rzp_live")) return "live";
  return "unknown";
}

export type RazorpayMethodAvailability = {
  upi: boolean;
  card: boolean;
  credit_card: boolean;
  debit_card: boolean;
  netbanking: boolean;
  wallet: boolean;
  wallets: string[];
  emi: boolean;
  paylater: boolean;
  paylater_providers: string[];
  cardless_emi: boolean;
  cod: boolean;
  gpay: boolean;
};

export type RazorpayDiagnostics = {
  mode: RazorpayMode;
  activated: boolean;
  blocked: boolean;
  accountCountry: string | null;
  methods: RazorpayMethodAvailability;
  fetchedAt: string;
};

function objHasEnabled(o: unknown): { on: boolean; keys: string[] } {
  if (!o || typeof o !== "object") return { on: false, keys: [] };
  const keys = Object.entries(o as Record<string, unknown>)
    .filter(([, v]) => v === true || (v && typeof v === "object"))
    .map(([k]) => k);
  return { on: keys.length > 0, keys };
}

/**
 * Read the public checkout "preferences" for the configured key. This is the
 * same source Razorpay Checkout uses to decide which methods to render, so it
 * is the authoritative list of what a customer will actually see.
 */
export async function fetchRazorpayDiagnostics(): Promise<RazorpayDiagnostics> {
  const { keyId } = getRazorpayCreds();
  const res = await fetch(
    `https://api.razorpay.com/v1/preferences?key_id=${encodeURIComponent(keyId)}`,
  );
  const json: any = await res.json().catch(() => null);
  const m = (json?.methods ?? {}) as Record<string, unknown>;

  const wallet = objHasEnabled(m.wallet);
  const paylater = objHasEnabled(m.paylater);
  const netbanking = objHasEnabled(m.netbanking);
  const cardlessEmi = objHasEnabled(m.cardless_emi);

  return {
    mode: getRazorpayMode(),
    activated: !!json?.activated,
    blocked: !!json?.blocked,
    accountCountry: json?.client?.country_iso ?? json?.client?.country ?? null,
    methods: {
      upi: m.upi === true,
      card: m.card === true,
      credit_card: m.credit_card === true,
      debit_card: m.debit_card === true,
      netbanking: netbanking.on,
      wallet: wallet.on,
      wallets: wallet.keys,
      emi: m.emi === true,
      paylater: paylater.on,
      paylater_providers: paylater.keys,
      cardless_emi: cardlessEmi.on,
      cod: m.cod === true,
      gpay: m.gpay === true,
    },
    fetchedAt: new Date().toISOString(),
  };
}
