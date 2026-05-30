import { useEffect, useRef } from "react";
import { track } from "@/lib/analytics";
import { supabase } from "@/integrations/supabase/client";

/**
 * Fire a one-time `section_impression` event when the referenced element
 * scrolls into view. Returns a ref to attach to the section wrapper.
 */
export function useSectionImpression<T extends HTMLElement>(sectionKey: string) {
  const ref = useRef<T>(null);
  const fired = useRef(false);

  useEffect(() => {
    const el = ref.current;
    if (!el || fired.current) return;
    const io = new IntersectionObserver(
      (entries) => {
        for (const e of entries) {
          if (e.isIntersecting && !fired.current) {
            fired.current = true;
            track("section_impression", { metadata: { section: sectionKey } });
            io.disconnect();
          }
        }
      },
      { threshold: 0.3 },
    );
    io.observe(el);
    return () => io.disconnect();
  }, [sectionKey]);

  return ref;
}

/** Fire a `section_click` event (optionally with the product that was clicked). */
export function trackSectionClick(sectionKey: string, productSlug?: string) {
  track("section_click", { productSlug, metadata: { section: sectionKey } });
}

export type SectionStat = {
  section: string;
  impressions: number;
  clicks: number;
  ctr: number;
};

/** Aggregate section impressions/clicks over the last `days` days. */
export async function fetchSectionAnalytics(days: number): Promise<SectionStat[]> {
  const since = new Date(Date.now() - days * 86_400_000).toISOString();
  const includeSeed = await includeSeedInAnalytics();
  let query = supabase
    .from("analytics_events")
    .select("event,metadata")
    .in("event", ["section_impression", "section_click"])
    .gte("created_at", since)
    .limit(10000);
  if (!includeSeed) query = query.eq("is_seeded", false);
  const { data, error } = await query;
  if (error || !data) return [];


  const map = new Map<string, { impressions: number; clicks: number }>();
  for (const row of data as { event: string; metadata: Record<string, unknown> | null }[]) {
    const section = String(row.metadata?.section ?? "").trim();
    if (!section) continue;
    const cur = map.get(section) ?? { impressions: 0, clicks: 0 };
    if (row.event === "section_impression") cur.impressions += 1;
    else if (row.event === "section_click") cur.clicks += 1;
    map.set(section, cur);
  }

  return [...map.entries()]
    .map(([section, v]) => ({
      section,
      impressions: v.impressions,
      clicks: v.clicks,
      ctr: v.impressions > 0 ? (v.clicks / v.impressions) * 100 : 0,
    }))
    .sort((a, b) => b.impressions - a.impressions);
}
