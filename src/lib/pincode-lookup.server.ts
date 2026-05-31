/**
 * Resilient Indian PIN-code resolver (server-only).
 *
 * Root cause of the historical "Could not verify delivery" bug: the previous
 * implementation called `https://api.postalpincode.in`, which is UNREACHABLE
 * from the Cloudflare Worker runtime (the TLS handshake fails → HTTP 000), so
 * every valid PIN fell into the generic catch block and was reported as
 * "delivery unavailable".
 *
 * This resolver uses `api.zippopotam.us` (reachable over HTTPS from the Worker)
 * as the primary source, applies a hard timeout, and — critically —
 * distinguishes a genuinely non-existent PIN from a transient service outage so
 * callers never show a false "delivery unavailable" message.
 */

export type PinResolution =
  | {
      ok: true;
      pincode: string;
      city: string | null;
      state: string | null;
      areas: string[];
      latitude: number | null;
      longitude: number | null;
    }
  /** PIN is malformed (not 6 digits) — user input error. */
  | { ok: false; reason: "invalid" }
  /** PIN is well-formed but does not exist in postal records. */
  | { ok: false; reason: "not_found" }
  /** Lookup service is unreachable / timed out — DO NOT block the customer. */
  | { ok: false; reason: "service_down" };

const TIMEOUT_MS = 4000;

async function fetchJsonWithTimeout(url: string, ms: number): Promise<{ status: number; json: any } | null> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), ms);
  try {
    const res = await fetch(url, {
      headers: { Accept: "application/json" },
      signal: controller.signal,
    });
    // 404 is a meaningful "not found", not a network failure.
    if (res.status === 404) return { status: 404, json: null };
    if (!res.ok) return { status: res.status, json: null };
    return { status: res.status, json: await res.json() };
  } catch {
    return null; // network error / timeout / abort
  } finally {
    clearTimeout(timer);
  }
}

/**
 * Resolve an Indian PIN code to its locality, district/city, and state.
 * Retries the primary source once on transient failure before giving up.
 */
export async function resolveIndianPincode(raw: string): Promise<PinResolution> {
  const pincode = (raw ?? "").trim();
  if (!/^\d{6}$/.test(pincode)) return { ok: false, reason: "invalid" };

  let sawNetworkFailure = false;

  // Primary: zippopotam (HTTPS, Worker-reachable). One retry on transient fail.
  for (let attempt = 0; attempt < 2; attempt++) {
    const result = await fetchJsonWithTimeout(
      `https://api.zippopotam.us/in/${pincode}`,
      TIMEOUT_MS,
    );
    if (result === null) {
      sawNetworkFailure = true;
      continue; // retry once
    }
    if (result.status === 404) return { ok: false, reason: "not_found" };
    const places: any[] = Array.isArray(result.json?.places) ? result.json.places : [];
    if (!places.length) return { ok: false, reason: "not_found" };

    const first = places[0];
    const areas = Array.from(
      new Set(places.map((p) => p["place name"]).filter(Boolean)),
    ).slice(0, 12) as string[];

    return {
      ok: true,
      pincode,
      city: first["place name"] ?? null,
      state: first["state"] ?? null,
      areas,
      latitude: first["latitude"] ? Number(first["latitude"]) : null,
      longitude: first["longitude"] ? Number(first["longitude"]) : null,
    };
  }

  // Both attempts hit a network/timeout failure — service is down, not the PIN.
  return { ok: false, reason: sawNetworkFailure ? "service_down" : "not_found" };
}
