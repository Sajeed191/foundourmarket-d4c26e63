/**
 * Infrastructure v2.0 — Chunk Recovery v2.
 *
 * Layered on top of the existing src/lib/chunk-recovery.ts (which handles
 * the final hard-reload fallback). v2 sits BEFORE that layer:
 *
 *   1. Detect ChunkLoadError / "Failed to fetch dynamically imported module"
 *   2. Extract the failing URL from the error text
 *   3. Ask the SW to REPAIR the asset (bypass cache, refetch, re-populate)
 *   4. Emit "infra:chunk-recovered" and let downstream retry (React lazy /
 *      Suspense will naturally retry on the next render tick)
 *   5. Fall through to v1 (silent retry + one hard reload) when SW isn't
 *      available or repair fails
 *
 * Never shows a customer-facing error page. Never runs in preview / dev
 * (bootInfra gates the whole subsystem).
 */

import { emit } from "./event-bus";
import { sendToSW } from "./sw-controller";

const RECOVERED = new Set<string>();
let stats = { attempted: 0, repaired: 0, failed: 0 };

export function getChunkRecoveryStats() {
  return { ...stats };
}

const URL_RE = /(https?:\/\/[^\s'")]+\.(?:js|mjs|css)(?:\?[^\s'")]*)?)/i;
const CHUNK_ERR_RE = /(ChunkLoadError|Loading chunk|Loading CSS chunk|Failed to fetch dynamically imported module|Importing a module script failed)/i;

function extractUrl(msg: string | undefined | null): string | null {
  if (!msg) return null;
  const m = msg.match(URL_RE);
  return m ? m[1] : null;
}

async function attemptRepair(url: string): Promise<boolean> {
  if (RECOVERED.has(url)) return false; // already tried this session
  RECOVERED.add(url);
  stats.attempted += 1;
  try {
    const res = await sendToSW<{ ok: boolean }>({ type: "REPAIR", url }, 6_000);
    if (res && res.ok) {
      stats.repaired += 1;
      emit("infra:chunk-recovered", { url });
      return true;
    }
  } catch { /* ignore */ }
  stats.failed += 1;
  return false;
}

function handleError(ev: ErrorEvent | PromiseRejectionEvent): void {
  const reason: unknown =
    (ev as PromiseRejectionEvent).reason !== undefined
      ? (ev as PromiseRejectionEvent).reason
      : (ev as ErrorEvent).error ?? (ev as ErrorEvent).message;
  const msg = typeof reason === "string"
    ? reason
    : reason && typeof (reason as { message?: string }).message === "string"
      ? (reason as { message: string }).message
      : String(reason ?? "");
  if (!CHUNK_ERR_RE.test(msg)) return;
  const url = extractUrl(msg);
  if (!url) return;
  // Fire and forget — the v1 fallback in src/lib/chunk-recovery.ts already
  // owns the final hard reload if this repair never succeeds.
  void attemptRepair(url);
}

let started = false;

export function startChunkRecoveryV2(): void {
  if (started || typeof window === "undefined") return;
  started = true;
  window.addEventListener("error", handleError, { capture: true });
  window.addEventListener("unhandledrejection", handleError as EventListener, { capture: true });
}
