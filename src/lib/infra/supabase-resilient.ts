/**
 * Infrastructure v1.5 — Supabase / API resilient write helpers.
 *
 * Wraps Supabase mutations and same-origin JSON POSTs so that transient
 * failures (offline / network error / 5xx / timeout) are automatically
 * queued via the frozen Phase-1 request queue and replayed later.
 *
 * NEVER use for payments, auth, or security-sensitive operations.
 */

import type { PostgrestSingleResponse, PostgrestResponse } from "@supabase/supabase-js";
import { supabase } from "@/integrations/supabase/client";
import { enqueue, type QueueKind } from "./request-queue";

type SbResult = PostgrestSingleResponse<unknown> | PostgrestResponse<unknown>;

const SUPABASE_URL: string =
  (typeof import.meta !== "undefined" && (import.meta as unknown as { env?: Record<string, string> }).env?.VITE_SUPABASE_URL) || "";
const SUPABASE_KEY: string =
  (typeof import.meta !== "undefined" && (import.meta as unknown as { env?: Record<string, string> }).env?.VITE_SUPABASE_PUBLISHABLE_KEY) || "";

function isTransientPgError(err: { message?: string; code?: string } | null | undefined): boolean {
  if (!err) return false;
  if (typeof navigator !== "undefined" && navigator.onLine === false) return true;
  const msg = err.message ?? "";
  if (/network|fetch|timeout|failed to fetch|load failed/i.test(msg)) return true;
  const code = err.code ?? "";
  if (code === "PGRST002" || code === "PGRST103") return true;
  return false;
}

function isTransientHttpStatus(status: number): boolean {
  return status === 408 || status === 429 || status === 502 || status === 503 || status === 504;
}

function isTransientThrown(err: unknown): boolean {
  if (typeof navigator !== "undefined" && navigator.onLine === false) return true;
  const msg = err instanceof Error ? err.message : String(err);
  return /network|fetch|timeout|aborted|failed to fetch|load failed/i.test(msg);
}

function restUrl(table: string, filters?: Record<string, string | number | boolean>): string {
  if (!SUPABASE_URL) return "";
  const base = `${SUPABASE_URL.replace(/\/$/, "")}/rest/v1/${table}`;
  if (!filters || Object.keys(filters).length === 0) return base;
  const qs = Object.entries(filters)
    .map(([k, v]) => `${encodeURIComponent(k)}=eq.${encodeURIComponent(String(v))}`)
    .join("&");
  return `${base}?${qs}`;
}

function restHeaders(): Record<string, string> {
  return {
    apikey: SUPABASE_KEY,
    Prefer: "return=minimal",
  };
}

/** Resilient INSERT — runs the supabase insert, enqueues on transient failure. */
export async function resilientInsert(
  kind: QueueKind,
  table: string,
  row: Record<string, unknown>,
  dedupeKey?: string,
): Promise<{ ok: boolean; queued: boolean; error?: unknown }> {
  try {
    const res = (await supabase.from(table as never).insert(row as never)) as SbResult;
    if (!res.error) return { ok: true, queued: false };
    if (!isTransientPgError(res.error)) return { ok: false, queued: false, error: res.error };
  } catch (err) {
    if (!isTransientThrown(err)) return { ok: false, queued: false, error: err };
  }
  if (!SUPABASE_URL) return { ok: false, queued: false };
  await enqueue({
    kind,
    endpoint: restUrl(table),
    method: "POST",
    body: row,
    headers: restHeaders(),
    dedupeKey,
    requiresAuth: true,
  });
  return { ok: true, queued: true };
}

/** Resilient UPDATE — filters by exact-eq fields. */
export async function resilientUpdate(
  kind: QueueKind,
  table: string,
  filters: Record<string, string | number | boolean>,
  patch: Record<string, unknown>,
  dedupeKey?: string,
): Promise<{ ok: boolean; queued: boolean; error?: unknown }> {
  try {
    let q = supabase.from(table as never).update(patch as never) as unknown as {
      eq: (col: string, val: unknown) => typeof q;
      then: PromiseLike<SbResult>["then"];
    };
    for (const [k, v] of Object.entries(filters)) q = q.eq(k, v);
    const res = (await (q as unknown as PromiseLike<SbResult>)) as SbResult;
    if (!res.error) return { ok: true, queued: false };
    if (!isTransientPgError(res.error)) return { ok: false, queued: false, error: res.error };
  } catch (err) {
    if (!isTransientThrown(err)) return { ok: false, queued: false, error: err };
  }
  if (!SUPABASE_URL) return { ok: false, queued: false };
  await enqueue({
    kind,
    endpoint: restUrl(table, filters),
    method: "PATCH",
    body: patch,
    headers: restHeaders(),
    dedupeKey,
    requiresAuth: true,
  });
  return { ok: true, queued: true };
}

/** Resilient DELETE — filters by exact-eq fields. */
export async function resilientDelete(
  kind: QueueKind,
  table: string,
  filters: Record<string, string | number | boolean>,
  dedupeKey?: string,
): Promise<{ ok: boolean; queued: boolean; error?: unknown }> {
  try {
    let q = supabase.from(table as never).delete() as unknown as {
      eq: (col: string, val: unknown) => typeof q;
      then: PromiseLike<SbResult>["then"];
    };
    for (const [k, v] of Object.entries(filters)) q = q.eq(k, v);
    const res = (await (q as unknown as PromiseLike<SbResult>)) as SbResult;
    if (!res.error) return { ok: true, queued: false };
    if (!isTransientPgError(res.error)) return { ok: false, queued: false, error: res.error };
  } catch (err) {
    if (!isTransientThrown(err)) return { ok: false, queued: false, error: err };
  }
  if (!SUPABASE_URL) return { ok: false, queued: false };
  await enqueue({
    kind,
    endpoint: restUrl(table, filters),
    method: "DELETE",
    body: undefined,
    headers: restHeaders(),
    dedupeKey,
    requiresAuth: true,
  });
  return { ok: true, queued: true };
}

/** Resilient same-origin JSON POST — for /api/public/* endpoints. */
export async function resilientFetch(input: {
  kind: QueueKind;
  endpoint: string;
  body: Record<string, unknown>;
  headers?: Record<string, string>;
  dedupeKey?: string;
  timeoutMs?: number;
}): Promise<{ ok: boolean; queued: boolean; status?: number; data?: unknown; error?: unknown }> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), input.timeoutMs ?? 12000);
  try {
    const res = await fetch(input.endpoint, {
      method: "POST",
      headers: { "Content-Type": "application/json", ...(input.headers ?? {}) },
      body: JSON.stringify(input.body),
      signal: controller.signal,
      credentials: "same-origin",
    });
    clearTimeout(timer);
    if (res.ok) {
      let data: unknown = undefined;
      try { data = await res.json(); } catch { /* non-JSON */ }
      return { ok: true, queued: false, status: res.status, data };
    }
    if (isTransientHttpStatus(res.status)) {
      await enqueue({
        kind: input.kind,
        endpoint: input.endpoint,
        method: "POST",
        body: input.body,
        headers: input.headers,
        dedupeKey: input.dedupeKey,
        requiresAuth: false,
      });
      return { ok: true, queued: true, status: res.status };
    }
    let data: unknown = undefined;
    try { data = await res.json(); } catch { /* ignore */ }
    return { ok: false, queued: false, status: res.status, data };
  } catch (err) {
    clearTimeout(timer);
    if (isTransientThrown(err)) {
      await enqueue({
        kind: input.kind,
        endpoint: input.endpoint,
        method: "POST",
        body: input.body,
        headers: input.headers,
        dedupeKey: input.dedupeKey,
        requiresAuth: false,
      });
      return { ok: true, queued: true, error: err };
    }
    return { ok: false, queued: false, error: err };
  }
}

/**
 * Resilient RPC — invokes a Supabase Postgres function, and on transient
 * failure enqueues an equivalent `/rest/v1/rpc/<fn>` POST for later replay.
 * Callers that need the RPC's returned value should handle `queued=true`
 * as an accepted-for-later signal (no data available yet).
 */
export async function resilientRpc(
  kind: QueueKind,
  fn: string,
  args: Record<string, unknown>,
  dedupeKey?: string,
): Promise<{ ok: boolean; queued: boolean; data?: unknown; error?: unknown }> {
  try {
    const res = await (supabase as any).rpc(fn, args);
    if (!res.error) return { ok: true, queued: false, data: res.data };
    if (!isTransientPgError(res.error)) return { ok: false, queued: false, error: res.error };
  } catch (err) {
    if (!isTransientThrown(err)) return { ok: false, queued: false, error: err };
  }
  if (!SUPABASE_URL) return { ok: false, queued: false };
  await enqueue({
    kind,
    endpoint: `${SUPABASE_URL}/rest/v1/rpc/${fn}`,
    method: "POST",
    body: args,
    headers: restHeaders(),
    dedupeKey,
    requiresAuth: true,
  });
  return { ok: true, queued: true };
}

