import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { Search, TrendingUp, AlertCircle, Loader2 } from "lucide-react";
import { AdminShell } from "@/components/admin/AdminShell";
import { supabase } from "@/integrations/supabase/client";

export const Route = createFileRoute("/admin-search")({
  head: () => ({ meta: [{ title: "Search trends — Admin" }] }),
  component: SearchPage,
});

type Row = { query: string; results_count: number; created_at: string; clicked_product_slug: string | null };

function SearchPage() {
  const [rows, setRows] = useState<Row[] | null>(null);
  const [days, setDays] = useState<7 | 30 | 90>(30);

  useEffect(() => {
    const since = new Date(Date.now() - days * 24 * 3600 * 1000).toISOString();
    supabase.from("search_logs").select("query,results_count,created_at,clicked_product_slug").gte("created_at", since).order("created_at", { ascending: false }).limit(5000)
      .then(({ data }) => setRows((data as Row[]) ?? []));
  }, [days]);

  const list = rows ?? [];
  const counts = new Map<string, { q: string; total: number; zero: number; clicks: number }>();
  for (const r of list) {
    const k = r.query.toLowerCase().trim();
    const rec = counts.get(k) ?? { q: r.query, total: 0, zero: 0, clicks: 0 };
    rec.total++;
    if (r.results_count === 0) rec.zero++;
    if (r.clicked_product_slug) rec.clicks++;
    counts.set(k, rec);
  }
  const ranked = [...counts.values()].sort((a, b) => b.total - a.total);
  const topTerms = ranked.slice(0, 20);
  const noResults = ranked.filter((r) => r.zero / r.total > 0.5).slice(0, 20);

  return (
    <AdminShell title="Search trends" subtitle="What customers are looking for" allow={["admin","super_admin","manager"]} actions={
      <div className="inline-flex rounded-full border border-border bg-card p-0.5">
        {([7, 30, 90] as const).map((d) => (
          <button key={d} onClick={() => setDays(d)} className={`px-2.5 py-1 text-[10px] font-mono uppercase tracking-widest rounded-full ${days === d ? "bg-accent text-accent-foreground" : "text-muted-foreground"}`}>{d}d</button>
        ))}
      </div>
    }>
      {rows === null ? <Loader2 className="size-4 animate-spin text-muted-foreground" /> :
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
          <div className="bg-card border border-border rounded-2xl overflow-hidden">
            <div className="px-5 py-3 border-b border-border flex items-center gap-2"><TrendingUp className="size-4 text-muted-foreground" /><h2 className="text-sm font-medium">Most searched</h2></div>
            <ul className="divide-y divide-border/40 max-h-[500px] overflow-y-auto">
              {topTerms.map((r) => {
                const ctr = r.total > 0 ? (r.clicks / r.total) * 100 : 0;
                return (
                  <li key={r.q} className="px-5 py-3 flex items-center justify-between">
                    <div>
                      <p className="text-sm font-mono">{r.q}</p>
                      <p className="text-[10px] font-mono uppercase tracking-widest text-muted-foreground">CTR {ctr.toFixed(0)}%</p>
                    </div>
                    <span className="font-mono text-accent">{r.total}</span>
                  </li>
                );
              })}
              {topTerms.length === 0 && <li className="px-5 py-8 text-center text-xs text-muted-foreground">No searches yet.</li>}
            </ul>
          </div>
          <div className="bg-card border border-border rounded-2xl overflow-hidden">
            <div className="px-5 py-3 border-b border-border flex items-center gap-2"><AlertCircle className="size-4 text-destructive" /><h2 className="text-sm font-medium">Zero-result queries</h2></div>
            <ul className="divide-y divide-border/40 max-h-[500px] overflow-y-auto">
              {noResults.map((r) => (
                <li key={r.q} className="px-5 py-3 flex items-center justify-between">
                  <p className="text-sm font-mono">{r.q}</p>
                  <span className="font-mono text-destructive text-xs">{r.zero}/{r.total}</span>
                </li>
              ))}
              {noResults.length === 0 && <li className="px-5 py-8 text-center text-xs text-muted-foreground"><Search className="size-4 mx-auto mb-2 opacity-30" /> No zero-result queries.</li>}
            </ul>
          </div>
        </div>
      }
    </AdminShell>
  );
}
