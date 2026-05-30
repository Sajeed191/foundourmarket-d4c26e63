import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, PieChart, Pie, Cell, Legend } from "recharts";
import { Globe, Users, Eye, MousePointerClick, Loader2 } from "lucide-react";
import { AdminShell } from "@/components/admin/AdminShell";
import { KpiCard } from "@/components/admin/KpiCard";
import { supabase } from "@/integrations/supabase/client";
import { includeSeedInAnalytics } from "@/lib/seed-filter";


export const Route = createFileRoute("/admin-traffic")({
  head: () => ({ meta: [{ title: "Traffic — Admin" }] }),
  component: TrafficPage,
});

const COLORS = ["#a3e635", "#22d3ee", "#a78bfa", "#f59e0b", "#f43f5e"];

type PV = { path: string; created_at: string; session_id: string | null; referrer: string | null; device: string | null };
type Sess = { session_id: string; started_at: string; last_seen: string; page_views: number; device: string | null; referrer: string | null; landing_path: string | null };

function TrafficPage() {
  const [pv, setPv] = useState<PV[] | null>(null);
  const [sessions, setSessions] = useState<Sess[] | null>(null);
  const [live, setLive] = useState(0);
  const [days, setDays] = useState<7 | 14 | 30>(14);

  useEffect(() => {
    const since = new Date(Date.now() - days * 24 * 3600 * 1000).toISOString();
    includeSeedInAnalytics().then((includeSeed: boolean) => {
      let pvQuery = supabase.from("page_views").select("path,created_at,session_id,referrer,device").gte("created_at", since).order("created_at", { ascending: false }).limit(5000);
      if (!includeSeed) pvQuery = pvQuery.eq("is_seeded", false);
      pvQuery.then(({ data }) => setPv((data as PV[]) ?? []));
    });
    supabase.from("visitor_sessions").select("*").gte("started_at", since).order("started_at", { ascending: false }).limit(2000)
      .then(({ data }) => setSessions((data as Sess[]) ?? []));
  }, [days]);


  useEffect(() => {
    async function refresh() {
      const since = new Date(Date.now() - 5 * 60 * 1000).toISOString();
      const { count } = await supabase.from("visitor_sessions").select("*", { count: "exact", head: true }).gte("last_seen", since);
      setLive(count ?? 0);
    }
    refresh();
    const t = setInterval(refresh, 15000);
    return () => clearInterval(t);
  }, []);

  const stats = useMemo(() => {
    const list = pv ?? [];
    const byDay = new Map<string, { date: string; views: number; uniq: Set<string> }>();
    for (const v of list) {
      const k = v.created_at.slice(0, 10);
      const rec = byDay.get(k) ?? { date: k, views: 0, uniq: new Set() };
      rec.views += 1;
      if (v.session_id) rec.uniq.add(v.session_id);
      byDay.set(k, rec);
    }
    const daily = [...byDay.values()].sort((a, b) => a.date.localeCompare(b.date)).map((d) => ({ date: d.date, views: d.views, visitors: d.uniq.size }));
    const topPages = [...list.reduce((m, v) => m.set(v.path, (m.get(v.path) ?? 0) + 1), new Map<string, number>()).entries()].sort((a, b) => b[1] - a[1]).slice(0, 12);
    const refs = [...list.reduce((m, v) => { const r = (v.referrer ?? "Direct").replace(/^https?:\/\//, "").split("/")[0] || "Direct"; return m.set(r, (m.get(r) ?? 0) + 1); }, new Map<string, number>()).entries()].sort((a, b) => b[1] - a[1]).slice(0, 8);
    const devices = [...list.reduce((m, v) => m.set(v.device ?? "unknown", (m.get(v.device ?? "unknown") ?? 0) + 1), new Map<string, number>()).entries()].map(([name, value]) => ({ name, value }));
    const sList = sessions ?? [];
    const avgPV = sList.length ? sList.reduce((s, x) => s + x.page_views, 0) / sList.length : 0;
    const bounceRate = sList.length ? (sList.filter((x) => x.page_views <= 1).length / sList.length) * 100 : 0;
    const avgDur = sList.length ? sList.reduce((s, x) => s + (new Date(x.last_seen).getTime() - new Date(x.started_at).getTime()), 0) / sList.length / 1000 : 0;
    return { daily, topPages, refs, devices, totalViews: list.length, totalSessions: sList.length, avgPV, bounceRate, avgDur };
  }, [pv, sessions]);

  return (
    <AdminShell title="Traffic" subtitle="First-party visitor and pageview analytics" allow={["admin","super_admin","manager"]} actions={
      <>
        <span className="inline-flex items-center gap-1.5 text-[10px] font-mono uppercase tracking-widest text-accent">
          <span className="size-1.5 rounded-full bg-accent animate-pulse" /> Live · {live}
        </span>
        <div className="inline-flex rounded-full border border-border bg-card p-0.5">
          {([7, 14, 30] as const).map((p) => (
            <button key={p} onClick={() => setDays(p)} className={`px-2.5 py-1 text-[10px] font-mono uppercase tracking-widest rounded-full ${days === p ? "bg-accent text-accent-foreground" : "text-muted-foreground"}`}>{p}d</button>
          ))}
        </div>
      </>
    }>
      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-5 gap-3 mb-6">
        <KpiCard label="Page views" value={stats.totalViews} icon={<Eye className="size-4" />} />
        <KpiCard label="Sessions" value={stats.totalSessions} icon={<Users className="size-4" />} />
        <KpiCard label="Avg PV / session" value={stats.avgPV.toFixed(1)} icon={<MousePointerClick className="size-4" />} />
        <KpiCard label="Bounce rate" value={`${stats.bounceRate.toFixed(0)}%`} />
        <KpiCard label="Avg session" value={`${Math.round(stats.avgDur)}s`} />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-5 mb-6">
        <div className="lg:col-span-2 card-premium rounded-2xl p-5">
          <h2 className="text-sm font-medium mb-4">Visitors & views</h2>
          {pv === null ? <Loader2 className="size-4 animate-spin text-muted-foreground" /> :
            <ResponsiveContainer width="100%" height={260}>
              <AreaChart data={stats.daily}>
                <defs>
                  <linearGradient id="v" x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stopColor="#a3e635" stopOpacity={0.4} /><stop offset="100%" stopColor="#a3e635" stopOpacity={0} /></linearGradient>
                  <linearGradient id="u" x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stopColor="#22d3ee" stopOpacity={0.4} /><stop offset="100%" stopColor="#22d3ee" stopOpacity={0} /></linearGradient>
                </defs>
                <CartesianGrid stroke="rgba(255,255,255,0.06)" />
                <XAxis dataKey="date" stroke="rgba(255,255,255,0.4)" fontSize={10} />
                <YAxis stroke="rgba(255,255,255,0.4)" fontSize={10} />
                <Tooltip contentStyle={{ background: "#0a0a0a", border: "1px solid rgba(255,255,255,0.1)" }} />
                <Area type="monotone" dataKey="views" stroke="#a3e635" fill="url(#v)" />
                <Area type="monotone" dataKey="visitors" stroke="#22d3ee" fill="url(#u)" />
              </AreaChart>
            </ResponsiveContainer>
          }
        </div>
        <div className="card-premium rounded-2xl p-5">
          <h2 className="text-sm font-medium mb-4">Devices</h2>
          <ResponsiveContainer width="100%" height={260}>
            <PieChart>
              <Pie data={stats.devices} dataKey="value" nameKey="name" outerRadius={90} innerRadius={50} paddingAngle={3}>
                {stats.devices.map((_, i) => <Cell key={i} fill={COLORS[i % COLORS.length]} />)}
              </Pie>
              <Tooltip contentStyle={{ background: "#0a0a0a", border: "1px solid rgba(255,255,255,0.1)" }} />
              <Legend wrapperStyle={{ fontSize: 10, fontFamily: "monospace", textTransform: "uppercase" }} />
            </PieChart>
          </ResponsiveContainer>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
        <div className="card-premium rounded-2xl p-5">
          <h2 className="text-sm font-medium mb-4 flex items-center gap-2"><Eye className="size-4 text-muted-foreground" /> Top pages</h2>
          <ul className="space-y-2">
            {stats.topPages.map(([path, n]) => (
              <li key={path} className="flex items-center justify-between text-xs">
                <Link to={path} className="font-mono truncate hover:text-accent">{path}</Link>
                <span className="font-mono text-accent ml-2">{n}</span>
              </li>
            ))}
            {stats.topPages.length === 0 && <p className="text-xs text-muted-foreground">No page views yet.</p>}
          </ul>
        </div>
        <div className="card-premium rounded-2xl p-5">
          <h2 className="text-sm font-medium mb-4 flex items-center gap-2"><Globe className="size-4 text-muted-foreground" /> Referrers</h2>
          <ul className="space-y-2">
            {stats.refs.map(([r, n]) => (
              <li key={r} className="flex items-center justify-between text-xs">
                <span className="font-mono truncate">{r}</span>
                <span className="font-mono text-accent ml-2">{n}</span>
              </li>
            ))}
            {stats.refs.length === 0 && <p className="text-xs text-muted-foreground">No referrers tracked.</p>}
          </ul>
        </div>
      </div>
    </AdminShell>
  );
}
