/**
 * Infrastructure v2.0 — Smart Deployment Recovery.
 *
 * Strategy:
 *   1. On idle+visible, fetch "/" as text (no-store) and hash the response.
 *   2. If the hash differs from the last-seen hash, treat it as a new
 *      deployment. Parse referenced JS/CSS URLs from the HTML.
 *   3. Ask the SW to PREFETCH those URLs into a candidate cache. If any
 *      asset fails, the SW discards the candidate — no partial promotion.
 *   4. Wait for a "safe activation window" (see isSafeToActivate) and then
 *      ask the SW to PROMOTE the candidate to active.
 *   5. Emit "infra:deployment-activated". No reload is forced — the next
 *      natural navigation picks up the new assets from the active cache.
 *
 * Never runs during checkout, auth, an active support conversation, when a
 * form is focused, or when the user is actively interacting.
 *
 * No polling. Triggered only by visibilitychange + requestIdleCallback,
 * with a 20-minute floor between checks.
 */

import { emit, on } from "./event-bus";
import { sendToSW } from "./sw-controller";

const MIN_INTERVAL_MS = 20 * 60 * 1000; // 20 minutes
const ACTIVATION_RETRY_MS = 60 * 1000;   // recheck safe window every minute

let lastCheckAt = 0;
let lastHash: string | null = null;
let pendingCandidate: { version: string; urls: string[] } | null = null;
let activationTimer: number | null = null;

const stats = {
  checks: 0,
  detected: 0,
  prefetched: 0,
  activated: 0,
  rollbacks: 0,
  lastDeploymentAt: 0 as number,
};

export function getDeploymentStats() { return { ...stats, pending: pendingCandidate?.version ?? null }; }

async function hashString(s: string): Promise<string> {
  if (typeof crypto !== "undefined" && crypto.subtle) {
    try {
      const bytes = new TextEncoder().encode(s);
      const digest = await crypto.subtle.digest("SHA-256", bytes);
      return Array.from(new Uint8Array(digest)).map((b) => b.toString(16).padStart(2, "0")).join("").slice(0, 16);
    } catch { /* fall through */ }
  }
  // Cheap fallback — good enough to detect deployment changes.
  let h = 0;
  for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) | 0;
  return `nb_${(h >>> 0).toString(16)}`;
}

function extractAssetUrls(html: string): string[] {
  const urls = new Set<string>();
  const re = /(?:src|href)\s*=\s*["']([^"']+\.(?:js|mjs|css)(?:\?[^"']*)?)["']/gi;
  let m: RegExpExecArray | null;
  while ((m = re.exec(html))) {
    const raw = m[1];
    try {
      const u = new URL(raw, window.location.origin);
      if (u.origin === window.location.origin) urls.add(u.pathname + u.search);
    } catch { /* ignore */ }
  }
  return Array.from(urls);
}

function isFormBusy(): boolean {
  try {
    const el = document.activeElement as HTMLElement | null;
    if (!el) return false;
    const tag = el.tagName;
    if (tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT") return true;
    if (el.isContentEditable) return true;
  } catch { /* ignore */ }
  return false;
}

function isUnsafeRoute(): boolean {
  const p = window.location.pathname;
  return (
    p.startsWith("/checkout") ||
    p.startsWith("/auth") ||
    p.startsWith("/payment") ||
    /^\/account\/support\/ticket\//.test(p)
  );
}

function isRecentlyActive(): boolean {
  try {
    const ua = (navigator as unknown as { userActivation?: { isActive: boolean } }).userActivation;
    if (ua && ua.isActive) return true;
  } catch { /* ignore */ }
  return false;
}

function isSafeToActivate(): boolean {
  if (typeof document === "undefined") return false;
  if (document.visibilityState !== "visible") return true; // idle background = safe
  if (isUnsafeRoute()) return false;
  if (isFormBusy()) return false;
  if (isRecentlyActive()) return false;
  return true;
}

async function tryActivate(): Promise<void> {
  if (!pendingCandidate) return;
  if (!isSafeToActivate()) {
    // Keep retrying — the candidate stays parked in the SW.
    if (activationTimer !== null) return;
    activationTimer = window.setTimeout(() => {
      activationTimer = null;
      void tryActivate();
    }, ACTIVATION_RETRY_MS);
    return;
  }
  const { version } = pendingCandidate;
  const res = await sendToSW<{ ok: boolean; active?: string }>({ type: "PROMOTE", version }, 10_000);
  if (res && res.ok) {
    stats.activated += 1;
    stats.lastDeploymentAt = Date.now();
    pendingCandidate = null;
    emit("infra:deployment-activated", { version, active: res.active });
  } else {
    // Rollback candidate silently — the active cache is untouched.
    await sendToSW({ type: "ROLLBACK" });
    stats.rollbacks += 1;
    pendingCandidate = null;
  }
}

async function runCheck(): Promise<void> {
  const now = Date.now();
  if (now - lastCheckAt < MIN_INTERVAL_MS) return;
  if (typeof document === "undefined" || document.visibilityState !== "visible") return;
  lastCheckAt = now;
  stats.checks += 1;
  try {
    const res = await fetch("/", { cache: "no-store", credentials: "same-origin" });
    if (!res || !res.ok) return;
    const text = await res.text();
    const hash = await hashString(text);
    if (lastHash === null) { lastHash = hash; return; }
    if (hash === lastHash) return;

    // New deployment detected.
    stats.detected += 1;
    const version = hash;
    const urls = extractAssetUrls(text);
    if (urls.length === 0) { lastHash = hash; return; }

    const pre = await sendToSW<{ ok: boolean }>({ type: "PREFETCH", version, urls }, 30_000);
    if (!pre || !pre.ok) {
      // Integrity failed — leave the active cache untouched, don't update
      // lastHash so we retry on the next idle tick.
      stats.rollbacks += 1;
      return;
    }
    stats.prefetched += 1;
    lastHash = hash;
    pendingCandidate = { version, urls };
    emit("infra:deployment-detected", { version });
    void tryActivate();
  } catch { /* silent — retry next idle */ }
}

function scheduleIdle(cb: () => void): void {
  const w = window as unknown as { requestIdleCallback?: (cb: () => void, opts?: { timeout?: number }) => void };
  if (typeof w.requestIdleCallback === "function") w.requestIdleCallback(cb, { timeout: 5_000 });
  else window.setTimeout(cb, 2_500);
}

let started = false;

export function startDeploymentRecovery(): void {
  if (started || typeof window === "undefined") return;
  started = true;
  // Initial: capture the current hash so first real change is what
  // triggers a candidate build.
  scheduleIdle(() => { void runCheck(); });
  document.addEventListener("visibilitychange", () => {
    if (document.visibilityState === "visible") scheduleIdle(() => { void runCheck(); });
  });
  // React to unrelated network signals so we don't re-check on every ping.
  on("queue:drained", () => scheduleIdle(() => { void runCheck(); }));
}
