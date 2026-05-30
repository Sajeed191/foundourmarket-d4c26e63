import { useEffect, useState } from "react";
import { motion } from "framer-motion";
import { LayoutGrid, MousePointerClick, Eye, Percent, Loader2 } from "lucide-react";
import { fetchSectionAnalytics, type SectionStat } from "@/lib/section-analytics";

const EASE = [0.16, 1, 0.3, 1] as const;

const SECTION_LABELS: Record<string, string> = {
  trending: "Trending Products",
  recommended: "Recommended",
  new_arrivals: "New Arrivals",
};

function label(key: string) {
  return SECTION_LABELS[key] ?? key.replace(/_/g, " ");
}

export function SectionAnalyticsPanel({ days }: { days: number }) {
  const [rows, setRows] = useState<SectionStat[] | null>(null);

  useEffect(() => {
    let alive = true;
    setRows(null);
    fetchSectionAnalytics(days).then((r) => { if (alive) setRows(r); });
    return () => { alive = false; };
  }, [days]);

  const maxImp = Math.max(1, ...(rows ?? []).map((r) => r.impressions));

  return (
    <motion.div
      initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.6, ease: EASE }}
      className="card-ambient rounded-2xl p-5 mb-6"
    >
      <div className="flex items-center justify-between mb-4">
        <h2 className="text-sm font-medium flex items-center gap-2">
          <LayoutGrid className="size-4 text-accent" /> Homepage section performance
        </h2>
        <span className="text-[10px] font-mono uppercase tracking-widest text-muted-foreground">CTR by section</span>
      </div>

      {rows === null ? (
        <div className="grid place-items-center py-10"><Loader2 className="size-5 animate-spin text-accent" /></div>
      ) : rows.length === 0 ? (
        <p className="py-8 text-center text-xs text-muted-foreground">
          No section engagement recorded yet — data appears as visitors browse the homepage.
        </p>
      ) : (
        <div className="space-y-3">
          {rows.map((r, i) => (
            <div key={r.section} className="rounded-xl bg-background/30 px-3 py-3">
              <div className="flex items-center justify-between mb-2">
                <span className="text-sm font-medium capitalize">{label(r.section)}</span>
                <span className="inline-flex items-center gap-1 text-xs font-mono tabular-nums text-accent">
                  <Percent className="size-3" /> {r.ctr.toFixed(1)}% CTR
                </span>
              </div>
              <div className="h-2 rounded-full bg-white/5 overflow-hidden mb-2">
                <motion.div
                  initial={{ width: 0 }} animate={{ width: `${(r.impressions / maxImp) * 100}%` }}
                  transition={{ duration: 0.8, ease: EASE, delay: i * 0.06 }}
                  className="h-full rounded-full bg-accent"
                />
              </div>
              <div className="flex items-center gap-4 text-[11px] font-mono text-muted-foreground">
                <span className="inline-flex items-center gap-1"><Eye className="size-3" /> {r.impressions.toLocaleString()} views</span>
                <span className="inline-flex items-center gap-1"><MousePointerClick className="size-3" /> {r.clicks.toLocaleString()} clicks</span>
              </div>
            </div>
          ))}
        </div>
      )}
    </motion.div>
  );
}
