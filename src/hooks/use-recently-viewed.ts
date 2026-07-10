import { useCallback, useMemo, useSyncExternalStore } from "react";
import { supabase } from "@/integrations/supabase/client";

const KEY = "fom_recently_viewed";
const KEY_TS = "fom_recently_viewed_ts";
const MAX = 100;

export type RecentlyViewedEntry = { slug: string; at: number };

/** Result of a destructive history operation: what was removed + success flag. */
export type RemovalResult = { removed: RecentlyViewedEntry[]; ok: boolean };

type HistoryState = {
  entries: RecentlyViewedEntry[];
  loading: boolean;
  userId: string | null;
};

const EMPTY_STATE: HistoryState = { entries: [], loading: true, userId: null };

/**
 * Recently-viewed history is ACCOUNT-based and DB-backed.
 *
 * - Signed-in users: the source of truth is `recommendation_events`
 *   (event_type = 'view'), scoped to their own `user_id` via RLS. This keeps
 *   history isolated per account and consistent across every device.
 * - Guests: a temporary localStorage cache is used. The instant a guest signs
 *   in, that cache is merged into their account history and then cleared, so
 *   the next account on the same device never inherits it.
 *
 * Never returns random / trending / recommended products — only real views.
 */

function readLocal(): string[] {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed.filter((s) => typeof s === "string") : [];
  } catch {
    return [];
  }
}

function writeLocal(slugs: string[]) {
  try {
    localStorage.setItem(KEY, JSON.stringify(slugs));
  } catch {
    /* storage full or disabled */
  }
}

function readLocalTs(): Record<string, number> {
  try {
    const raw = localStorage.getItem(KEY_TS);
    if (!raw) return {};
    const parsed = JSON.parse(raw);
    return parsed && typeof parsed === "object" ? parsed : {};
  } catch {
    return {};
  }
}

function writeLocalTs(map: Record<string, number>) {
  try {
    localStorage.setItem(KEY_TS, JSON.stringify(map));
  } catch {
    /* ignore */
  }
}

/** Build newest-first, de-duplicated entries with view timestamps. */
function dedupeEntries(rows: { product_slug: string | null; created_at?: string | null }[]): RecentlyViewedEntry[] {
  const seen = new Set<string>();
  const out: RecentlyViewedEntry[] = [];
  for (const r of rows) {
    const s = r.product_slug ?? "";
    if (s && !seen.has(s)) {
      seen.add(s);
      out.push({ slug: s, at: r.created_at ? Date.parse(r.created_at) : Date.now() });
      if (out.length >= MAX) break;
    }
  }
  return out;
}

async function fetchAccountViews(userId: string): Promise<RecentlyViewedEntry[]> {
  const { data, error } = await supabase
    .from("recommendation_events")
    .select("product_slug, created_at")
    .eq("user_id", userId)
    .eq("event_type", "view")
    .not("product_slug", "is", null)
    .order("created_at", { ascending: false })
    .limit(300);
  if (error) throw error;
  return dedupeEntries((data ?? []) as { product_slug: string | null; created_at: string | null }[]);
}

function localEntries(): RecentlyViewedEntry[] {
  const slugs = readLocal();
  const ts = readLocalTs();
  return slugs.map((slug) => ({ slug, at: ts[slug] ?? Date.now() }));
}

/** Merge any guest localStorage views into the signed-in account, then clear. */
async function mergeGuestHistory(userId: string) {
  const local = readLocal();
  if (!local.length) return;
  const ts = readLocalTs();
  // Insert oldest-first so newest stays newest after merge.
  const rows = [...local].reverse().map((slug) => ({
    user_id: userId,
    event_type: "view",
    product_slug: slug,
    weight: 1,
    created_at: new Date(ts[slug] ?? Date.now()).toISOString(),
  }));
  try {
    await (supabase.from as any)("recommendation_events").insert(rows);
  } catch {
    /* ignore */
  }
  writeLocal([]);
  writeLocalTs({});
}

let historyState: HistoryState = EMPTY_STATE;
let started = false;
let loadingRun = 0;
let realtimeUserId: string | null = null;
let realtimeChannel: ReturnType<typeof supabase.channel> | null = null;
const listeners = new Set<() => void>();

function publish(next: Partial<HistoryState>) {
  historyState = { ...historyState, ...next };
  for (const listener of listeners) listener();
}

function setRealtimeUser(userId: string | null) {
  if (realtimeUserId === userId) return;
  if (realtimeChannel) void supabase.removeChannel(realtimeChannel);
  realtimeChannel = null;
  realtimeUserId = userId;
  if (!userId) return;
  realtimeChannel = supabase
    .channel(`recently-viewed-${userId}`)
    .on(
      "postgres_changes",
      { event: "*", schema: "public", table: "recommendation_events", filter: `user_id=eq.${userId}` },
      () => { void loadHistory({ silent: true }); },
    )
    .subscribe();
}

async function loadHistory(opts: { silent?: boolean } = {}) {
  const run = ++loadingRun;
  if (!opts.silent) publish({ loading: true });
  try {
    const { data } = await supabase.auth.getUser();
    const user = data.user;
    if (user) await mergeGuestHistory(user.id);
    const next = user ? await fetchAccountViews(user.id) : localEntries();
    if (run !== loadingRun) return;
    setRealtimeUser(user?.id ?? null);
    publish({ entries: next, userId: user?.id ?? null, loading: false });
  } catch {
    if (run === loadingRun) publish({ loading: false });
  }
}

function ensureHistoryStarted() {
  if (started || typeof window === "undefined") return;
  started = true;
  void loadHistory();
  supabase.auth.onAuthStateChange((event, session) => {
    if (event === "SIGNED_IN" && session?.user) {
      void mergeGuestHistory(session.user.id).then(() => loadHistory({ silent: true }));
    } else if (event === "SIGNED_OUT") {
      setRealtimeUser(null);
      void loadHistory({ silent: true });
    }
  });
  window.addEventListener("storage", (event) => {
    if (event.key === KEY || event.key === KEY_TS) {
      void loadHistory({ silent: true });
    }
  });
}

function subscribe(listener: () => void) {
  ensureHistoryStarted();
  listeners.add(listener);
  return () => listeners.delete(listener);
}

function getSnapshot() {
  return historyState;
}

function getServerSnapshot() {
  return EMPTY_STATE;
}

function saveGuestEntries(entries: RecentlyViewedEntry[]) {
  writeLocal(entries.map((e) => e.slug));
  const ts: Record<string, number> = {};
  for (const e of entries) ts[e.slug] = e.at;
  writeLocalTs(ts);
}

function optimisticEntries(next: RecentlyViewedEntry[]) {
  publish({ entries: next });
}

function recordHistory(slug: string) {
  if (!slug) return;
  const now = Date.now();
  const next = [{ slug, at: now }, ...historyState.entries.filter((e) => e.slug !== slug)].slice(0, MAX);
  optimisticEntries(next);
  if (!historyState.userId) saveGuestEntries(next);
}

async function removeSlugs(slugs: Iterable<string>): Promise<RemovalResult> {
  const targets = new Set([...slugs].filter(Boolean));
  if (targets.size === 0) return { removed: [], ok: true };
  const snapshot = historyState.entries;
  const removed = snapshot.filter((e) => targets.has(e.slug));
  if (removed.length === 0) return { removed: [], ok: true };
  const next = snapshot.filter((e) => !targets.has(e.slug));
  optimisticEntries(next);
  const userId = historyState.userId;
  if (userId) {
    try {
      const { error } = await supabase
        .from("recommendation_events")
        .delete()
        .eq("user_id", userId)
        .eq("event_type", "view")
        .in("product_slug", [...targets]);
      if (error) throw error;
    } catch {
      optimisticEntries(snapshot);
      return { removed: [], ok: false };
    }
  } else {
    saveGuestEntries(next);
  }
  return { removed, ok: true };
}

async function clearHistory(): Promise<RemovalResult> {
  const snapshot = historyState.entries;
  if (snapshot.length === 0) return { removed: [], ok: true };
  optimisticEntries([]);
  const userId = historyState.userId;
  if (userId) {
    try {
      const { error } = await supabase
        .from("recommendation_events")
        .delete()
        .eq("user_id", userId)
        .eq("event_type", "view");
      if (error) throw error;
    } catch {
      optimisticEntries(snapshot);
      return { removed: [], ok: false };
    }
  } else {
    writeLocal([]);
    writeLocalTs({});
  }
  return { removed: snapshot, ok: true };
}

async function clearSinceHistory(cutoffTs: number): Promise<RemovalResult> {
  const removed = historyState.entries.filter((e) => e.at >= cutoffTs);
  return removeSlugs(removed.map((e) => e.slug));
}

async function restoreHistory(toRestore: RecentlyViewedEntry[]) {
  if (!toRestore.length) return;
  const snapshot = historyState.entries;
  const seen = new Set(snapshot.map((e) => e.slug));
  const merged = [...snapshot, ...toRestore.filter((e) => !seen.has(e.slug))]
    .sort((a, b) => b.at - a.at)
    .slice(0, MAX);
  optimisticEntries(merged);
  const userId = historyState.userId;
  if (userId) {
    const rows = toRestore.map((e) => ({
      user_id: userId,
      event_type: "view",
      product_slug: e.slug,
      weight: 1,
      created_at: new Date(e.at).toISOString(),
    }));
    try {
      const { error } = await (supabase.from as any)("recommendation_events").insert(rows);
      if (error) throw error;
    } catch {
      optimisticEntries(snapshot);
    }
  } else {
    saveGuestEntries(merged);
  }
}

export function useRecentlyViewed() {
  const { entries, loading } = useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);

  /**
   * Record a view. For guests we persist to localStorage; for signed-in users
   * the DB row is written by `recordEvent({ type: 'view' })` on the product
   * page, so here we only update local UI state optimistically.
   */
  const record = useCallback((slug: string) => {
    recordHistory(slug);
  }, []);

  /**
   * Remove a single product from view history. Optimistically updates local
   * state, then persists. On a server error the optimistic change is rolled
   * back and `ok: false` is returned so the caller can surface an error.
   */
  const remove = useCallback(async (slug: string): Promise<RemovalResult> => {
    return removeSlugs([slug]);
  }, []);

  const removeMany = useCallback(async (slugs: string[]): Promise<RemovalResult> => {
    return removeSlugs(slugs);
  }, []);

  const clear = useCallback(async (): Promise<RemovalResult> => {
    return clearHistory();
  }, []);

  /**
   * Remove products whose latest view is at or after `cutoffTs`. The page is
   * product-based, so all view rows for those products are deleted; otherwise
   * older rows would make the same card reappear after the next sync/reload.
   * Returns the removed entries so the caller can offer Undo, plus an `ok` flag.
   */
  const clearSince = useCallback(async (cutoffTs: number): Promise<RemovalResult> => {
    return clearSinceHistory(cutoffTs);
  }, []);

  /** Re-insert previously-removed entries, preserving their timestamps (Undo). */
  const restore = useCallback(async (toRestore: RecentlyViewedEntry[]) => {
    await restoreHistory(toRestore);
  }, []);

  const slugs = useMemo(() => entries.map((e) => e.slug), [entries]);

  return { slugs, entries, record, remove, removeMany, clear, clearSince, restore, loading };
}
