import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { supabase } from "@/integrations/supabase/client";

const KEY = "fom_recently_viewed";
const KEY_TS = "fom_recently_viewed_ts";
const MAX = 100;

export type RecentlyViewedEntry = { slug: string; at: number };

/** Result of a destructive history operation: what was removed + success flag. */
export type RemovalResult = { removed: RecentlyViewedEntry[]; ok: boolean };

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
  const { data } = await supabase
    .from("recommendation_events")
    .select("product_slug, created_at")
    .eq("user_id", userId)
    .eq("event_type", "view")
    .not("product_slug", "is", null)
    .order("created_at", { ascending: false })
    .limit(300);
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
  // Insert oldest-first so newest stays newest after merge.
  const rows = [...local].reverse().map((slug) => ({
    user_id: userId,
    event_type: "view",
    product_slug: slug,
    weight: 1,
  }));
  try {
    await (supabase.from as any)("recommendation_events").insert(rows);
  } catch {
    /* ignore */
  }
  writeLocal([]);
  writeLocalTs({});
}

export function useRecentlyViewed() {
  const [entries, setEntries] = useState<RecentlyViewedEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [accountUserId, setAccountUserId] = useState<string | null>(null);
  const userIdRef = useRef<string | null>(null);
  // Always-fresh mirror of `entries` so destructive ops can return exactly what
  // was removed (for Undo) without depending on stale closures.
  const entriesRef = useRef<RecentlyViewedEntry[]>([]);
  useEffect(() => { entriesRef.current = entries; }, [entries]);

  const load = useCallback(async () => {
    const { data } = await supabase.auth.getUser();
    const user = data.user;
    userIdRef.current = user?.id ?? null;
    setAccountUserId(user?.id ?? null);
    let next: RecentlyViewedEntry[];
    if (user) {
      next = await fetchAccountViews(user.id);
    } else {
      next = localEntries();
    }
    entriesRef.current = next;
    setEntries(next);
    setLoading(false);
  }, []);

  useEffect(() => {
    void load();
    const { data: { subscription } } = supabase.auth.onAuthStateChange((event, session) => {
      if (event === "SIGNED_IN" && session?.user) {
        void mergeGuestHistory(session.user.id).then(load);
      } else if (event === "SIGNED_OUT") {
        void load();
      }
    });
    return () => subscription.unsubscribe();
  }, [load]);

  // Keep signed-in history synchronized across open tabs/devices without
  // refetching the product catalog. Only view-history records are refreshed.
  useEffect(() => {
    if (!accountUserId) return;
    const channel = supabase
      .channel(`recently-viewed-${accountUserId}`)
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "recommendation_events", filter: `user_id=eq.${accountUserId}` },
        () => { void load(); },
      )
      .subscribe();
    return () => { void supabase.removeChannel(channel); };
  }, [accountUserId, load]);

  /**
   * Record a view. For guests we persist to localStorage; for signed-in users
   * the DB row is written by `recordEvent({ type: 'view' })` on the product
   * page, so here we only update local UI state optimistically.
   */
  const record = useCallback((slug: string) => {
    if (!slug) return;
    const now = Date.now();
    setEntries((prev) => {
      const next = [{ slug, at: now }, ...prev.filter((e) => e.slug !== slug)].slice(0, MAX);
      entriesRef.current = next;
      return next;
    });
    if (!userIdRef.current) {
      writeLocal([slug, ...readLocal().filter((s) => s !== slug)].slice(0, MAX));
      writeLocalTs({ ...readLocalTs(), [slug]: now });
    }
  }, []);

  /**
   * Remove a single product from view history. Optimistically updates local
   * state, then persists. On a server error the optimistic change is rolled
   * back and `ok: false` is returned so the caller can surface an error.
   */
  const remove = useCallback(async (slug: string): Promise<RemovalResult> => {
    const snapshot = entriesRef.current;
    const removed = snapshot.filter((e) => e.slug === slug);
    if (removed.length === 0) return { removed: [], ok: true };
    const next = snapshot.filter((e) => e.slug !== slug);
    entriesRef.current = next;
    setEntries(next);
    const userId = userIdRef.current;
    if (userId) {
      try {
        const { error } = await supabase
          .from("recommendation_events")
          .delete()
          .eq("user_id", userId)
          .eq("event_type", "view")
          .eq("product_slug", slug);
        if (error) throw error;
      } catch {
        entriesRef.current = snapshot;
        setEntries(snapshot); // rollback
        return { removed: [], ok: false };
      }
    } else {
      writeLocal(readLocal().filter((s) => s !== slug));
      const ts = readLocalTs();
      delete ts[slug];
      writeLocalTs(ts);
    }
    return { removed, ok: true };
  }, []);

  const clear = useCallback(async (): Promise<RemovalResult> => {
    const snapshot = entriesRef.current;
    const removed = snapshot;
    if (removed.length === 0) return { removed: [], ok: true };
    entriesRef.current = [];
    setEntries([]);
    const userId = userIdRef.current;
    if (userId) {
      try {
        const { error } = await supabase
          .from("recommendation_events")
          .delete()
          .eq("user_id", userId)
          .eq("event_type", "view");
        if (error) throw error;
      } catch {
        entriesRef.current = snapshot;
        setEntries(snapshot); // rollback
        return { removed: [], ok: false };
      }
    } else {
      writeLocal([]);
      writeLocalTs({});
    }
    return { removed, ok: true };
  }, []);

  /**
   * Remove products whose latest view is at or after `cutoffTs`. The page is
   * product-based, so all view rows for those products are deleted; otherwise
   * older rows would make the same card reappear after the next sync/reload.
   * Returns the removed entries so the caller can offer Undo, plus an `ok` flag.
   */
  const clearSince = useCallback(async (cutoffTs: number): Promise<RemovalResult> => {
    const snapshot = entriesRef.current;
    const removed = snapshot.filter((e) => e.at >= cutoffTs);
    if (removed.length === 0) return { removed: [], ok: true };
    const removedSlugs = new Set(removed.map((e) => e.slug));
    const next = snapshot.filter((e) => e.at < cutoffTs);
    entriesRef.current = next;
    setEntries(next);
    const userId = userIdRef.current;
    if (userId) {
      try {
        const { error } = await supabase
          .from("recommendation_events")
          .delete()
          .eq("user_id", userId)
          .eq("event_type", "view")
          .in("product_slug", [...removedSlugs]);
        if (error) throw error;
      } catch {
        entriesRef.current = snapshot;
        setEntries(snapshot); // rollback
        return { removed: [], ok: false };
      }
    } else {
      writeLocal(readLocal().filter((s) => !removedSlugs.has(s)));
      const ts = readLocalTs();
      for (const s of removedSlugs) delete ts[s];
      writeLocalTs(ts);
    }
    return { removed, ok: true };
  }, []);

  /** Re-insert previously-removed entries, preserving their timestamps (Undo). */
  const restore = useCallback(async (toRestore: RecentlyViewedEntry[]) => {
    if (!toRestore.length) return;
    setEntries((prev) => {
      const seen = new Set(prev.map((e) => e.slug));
      const merged = [...prev, ...toRestore.filter((e) => !seen.has(e.slug))];
      merged.sort((a, b) => b.at - a.at);
      const next = merged.slice(0, MAX);
      entriesRef.current = next;
      return next;
    });
    const userId = userIdRef.current;
    if (userId) {
      const rows = toRestore.map((e) => ({
        user_id: userId,
        event_type: "view",
        product_slug: e.slug,
        weight: 1,
        created_at: new Date(e.at).toISOString(),
      }));
      try {
        await (supabase.from as any)("recommendation_events").insert(rows);
      } catch {
        /* ignore */
      }
    } else {
      const restoreSlugs = toRestore.map((e) => e.slug);
      writeLocal([...new Set([...restoreSlugs, ...readLocal()])].slice(0, MAX));
      const ts = readLocalTs();
      for (const e of toRestore) ts[e.slug] = e.at;
      writeLocalTs(ts);
    }
  }, []);

  const slugs = useMemo(() => entries.map((e) => e.slug), [entries]);

  return { slugs, entries, record, remove, clear, clearSince, restore, loading };
}
