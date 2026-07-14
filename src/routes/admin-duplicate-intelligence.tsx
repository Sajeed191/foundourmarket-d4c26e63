import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { AdminShell, logActivity } from "@/components/admin/AdminShell";
import { supabase } from "@/integrations/supabase/client";
import { cn } from "@/lib/utils";
import {
  ShieldCheck,
  GitMerge,
  EyeOff,
  Copy,
  ImageIcon,
  TrendingUp,
  Loader2,
} from "lucide-react";

export const Route = createFileRoute("/admin-duplicate-intelligence")({
  head: () => ({
    meta: [
      { title: "Duplicate Intelligence — FoundOurMarket™" },
      { name: "description", content: "AI duplicate detection analytics — duplicate rate, merge rate, ignored warnings, top duplicate categories and brands, and image-duplicate trends." },
      { name: "robots", content: "noindex, nofollow" },
    ],
  }),
  component: DuplicateIntelligencePage,
});

type Event = {
  id: string;
  draft_name: string | null;
  draft_brand: string | null;
  draft_category: string | null;
  candidate_slug: string | null;
  candidate_name: string | null;
  candidate_category: string | null;
  candidate_brand: string | null;
  action: string;
  score: number;
  verdict: string | null;
  signals: { key: string; matched: boolean }[] | null;
  created_at: string;
};

function DuplicateIntelligencePage() {
  const [events, setEvents] = useState<Event[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    logActivity("duplicate_intelligence_open", "duplicate_intelligence");
    (async () => {
      const { data } = await supabase
        .from("duplicate_detection_events")
        .select("*")
        .order("created_at", { ascending: false })
        .limit(1000);
      setEvents((data as unknown as Event[]) ?? []);
      setLoading(false);
    })();
  }, []);

  const stats = useMemo(() => {
    const total = events.length;
    const merged = events.filter((e) => e.action === "merged").length;
    const ignored = events.filter((e) => e.action === "ignored").length;
    const confirmed = events.filter((e) => e.action === "confirmed").length;
    const createdAnyway = events.filter((e) => e.action === "created_anyway").length;
    const realDuplicates = merged + confirmed;
    const imageDupes = events.filter((e) => (e.signals ?? []).some((s) => s.key === "image" && s.matched)).length;

    const byCat = new Map<string, number>();
    const byBrand = new Map<string, number>();
    for (const e of events) {
      if (e.candidate_category) byCat.set(e.candidate_category, (byCat.get(e.candidate_category) ?? 0) + 1);
      if (e.candidate_brand) byBrand.set(e.candidate_brand, (byBrand.get(e.candidate_brand) ?? 0) + 1);
    }
    const top = (m: Map<string, number>) =>
      Array.from(m.entries()).sort((a, b) => b[1] - a[1]).slice(0, 6);

    return {
      total,
      merged,
      ignored,
      confirmed,
      createdAnyway,
      realDuplicates,
      imageDupes,
      duplicateRate: total ? Math.round((realDuplicates / total) * 100) : 0,
      mergeRate: total ? Math.round((merged / total) * 100) : 0,
      falsePositiveRate: total ? Math.round((ignored / total) * 100) : 0,
      topCategories: top(byCat),
      topBrands: top(byBrand),
    };
  }, [events]);

  return (
    <AdminShell
      title="Duplicate Intelligence"
      subtitle="How the AI duplicate engine is performing — caught, merged, ignored, and why."
      allow={["admin", "super_admin", "manager"]}
    >
      {loading ? (
        <div className="grid place-items-center py-24 text-muted-foreground">
          <Loader2 className="size-6 animate-spin" />
        </div>
      ) : (
        <div className="space-y-6">
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6">
            <Kpi icon={Copy} label="Total attempts" value={stats.total} tone="text-sky-400" />
            <Kpi icon={ShieldCheck} label="Duplicate rate" value={`${stats.duplicateRate}%`} tone="text-red-400" />
            <Kpi icon={GitMerge} label="Merge rate" value={`${stats.mergeRate}%`} tone="text-accent" />
            <Kpi icon={EyeOff} label="Ignored" value={stats.ignored} tone="text-amber-400" />
            <Kpi icon={ImageIcon} label="Image dupes" value={stats.imageDupes} tone="text-violet-400" />
            <Kpi icon={TrendingUp} label="False positive" value={`${stats.falsePositiveRate}%`} tone="text-emerald-400" />
          </div>

          <div className="grid gap-4 lg:grid-cols-2">
            <RankCard title="Top duplicate categories" rows={stats.topCategories} empty="No category data yet" />
            <RankCard title="Top duplicate brands" rows={stats.topBrands} empty="No brand data yet" />
          </div>

          <div className="rounded-2xl border border-border/70 bg-card/40 p-4">
            <h3 className="mb-3 text-sm font-semibold">Recent duplicate attempts</h3>
            {events.length === 0 ? (
              <p className="py-8 text-center text-sm text-muted-foreground">
                No duplicate events recorded yet. They'll appear as admins ignore, merge, or create-anyway from the
                editor's intelligence panel.
              </p>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-left text-xs">
                  <thead className="text-[10px] font-mono uppercase tracking-wider text-muted-foreground">
                    <tr className="border-b border-border/50">
                      <th className="py-2 pr-3">Draft</th>
                      <th className="py-2 pr-3">Matched</th>
                      <th className="py-2 pr-3">Score</th>
                      <th className="py-2 pr-3">Action</th>
                      <th className="py-2 pr-3">When</th>
                    </tr>
                  </thead>
                  <tbody>
                    {events.slice(0, 60).map((e) => (
                      <tr key={e.id} className="border-b border-border/30">
                        <td className="max-w-[160px] truncate py-2 pr-3 font-medium">{e.draft_name || "—"}</td>
                        <td className="max-w-[160px] truncate py-2 pr-3 text-muted-foreground">{e.candidate_name || "—"}</td>
                        <td className="py-2 pr-3 font-mono tabular-nums">{e.score}%</td>
                        <td className="py-2 pr-3">
                          <ActionPill action={e.action} />
                        </td>
                        <td className="py-2 pr-3 text-muted-foreground">
                          {new Date(e.created_at).toLocaleDateString()}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </div>
      )}
    </AdminShell>
  );
}

function Kpi({
  icon: Icon,
  label,
  value,
  tone,
}: {
  icon: React.ComponentType<{ className?: string }>;
  label: string;
  value: string | number;
  tone: string;
}) {
  return (
    <div className="rounded-2xl border border-border/70 bg-card/40 p-3.5">
      <Icon className={cn("size-4", tone)} />
      <p className="mt-2 text-2xl font-bold tabular-nums">{value}</p>
      <p className="text-[10px] font-mono uppercase tracking-wider text-muted-foreground">{label}</p>
    </div>
  );
}

function RankCard({ title, rows, empty }: { title: string; rows: [string, number][]; empty: string }) {
  const max = rows[0]?.[1] ?? 1;
  return (
    <div className="rounded-2xl border border-border/70 bg-card/40 p-4">
      <h3 className="mb-3 text-sm font-semibold">{title}</h3>
      {rows.length === 0 ? (
        <p className="py-6 text-center text-xs text-muted-foreground">{empty}</p>
      ) : (
        <ul className="space-y-2">
          {rows.map(([name, count]) => (
            <li key={name} className="flex items-center gap-2 text-xs">
              <span className="w-28 truncate capitalize">{name.replace(/-/g, " ")}</span>
              <span className="h-2 flex-1 overflow-hidden rounded-full bg-border/40">
                <span className="block h-full rounded-full bg-accent" style={{ width: `${(count / max) * 100}%` }} />
              </span>
              <span className="w-6 text-right font-mono tabular-nums">{count}</span>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

function ActionPill({ action }: { action: string }) {
  const map: Record<string, string> = {
    merged: "bg-accent/15 text-accent",
    ignored: "bg-amber-500/15 text-amber-400",
    confirmed: "bg-red-500/15 text-red-400",
    created_anyway: "bg-sky-500/15 text-sky-400",
  };
  return (
    <span className={cn("rounded-md px-1.5 py-0.5 text-[10px] font-medium capitalize", map[action] ?? "bg-muted")}>
      {action.replace("_", " ")}
    </span>
  );
}
