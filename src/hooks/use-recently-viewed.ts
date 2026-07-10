import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { supabase } from "@/integrations/supabase/client";

const KEY = "fom_recently_viewed";
const KEY_TS = "fom_recently_viewed_ts";
const MAX = 30;

export type RecentlyViewedEntry = { slug: string; at: number };

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
  const userIdRef = useRef<string | null>(null);

  const load = useCallback(async () => {
    const { data } = await supabase.auth.getUser();
    const user = data.user;
    userIdRef.current = user?.id ?? null;
    if (user) {
      setEntries(await fetchAccountViews(user.id));
    } else {
      setEntries(localEntries());
    }
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

  /**
   * Record a view. For guests we persist to localStorage; for signed-in users
   * the DB row is written by `recordEvent({ type: 'view' })` on the product
   * page, so here we only update local UI state optimistically.
   */
  const record = useCallback((slug: string) => {
    if (!slug) return;
    const now = Date.now();
    setEntries((prev) => [{ slug, at: now }, ...prev.filter((e) => e.slug !== slug)].slice(0, MAX));
    if (!userIdRef.current) {
      writeLocal([slug, ...readLocal().filter((s) => s !== slug)].slice(0, MAX));
      writeLocalTs({ ...readLocalTs(), [slug]: now });
    }
  }, []);

  /** Remove a single product from view history. */
  const remove = useCallback(async (slug: string) => {
    setEntries((prev) => prev.filter((e) => e.slug !== slug));
    const userId = userIdRef.current;
    if (userId) {
      try {
        await supabase
          .from("recommendation_events")
          .delete()
          .eq("user_id", userId)
          .eq("event_type", "view")
          .eq("product_slug", slug);
      } catch {
        /* ignore */
      }
    } else {
      writeLocal(readLocal().filter((s) => s !== slug));
      const ts = readLocalTs();
      delete ts[slug];
      writeLocalTs(ts);
    }
  }, []);

  const clear = useCallback(async () => {
    setEntries([]);
    const userId = userIdRef.current;
    if (userId) {
      try {
        await supabase
          .from("recommendation_events")
          .delete()
          .eq("user_id", userId)
          .eq("event_type", "view");
      } catch {
        /* ignore */
      }
    } else {
      writeLocal([]);
      writeLocalTs({});
    }
  }, []);

  const slugs = useMemo(() => entries.map((e) => e.slug), [entries]);

  return { slugs, entries, record, remove, clear, loading };
}
