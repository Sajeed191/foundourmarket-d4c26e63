import { useCallback, useEffect, useMemo, useState } from "react";
import {
  Star, Loader2, TrendingUp, Clock, Gauge, ThumbsDown, MessageSquare,
  RotateCcw, CheckCircle2, User, Calendar,
} from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { cn } from "@/lib/utils";
import { toast } from "sonner";

type Rating = {
  id: string;
  ticket_id: string;
  customer_id: string;
  rating: number;
  comment: string | null;
  rated_at: string;
  category: string | null;
  priority: string | null;
  assigned_agent: string | null;
  resolution_time_ms: number | null;
  reviewed: boolean;
};

type TicketLite = {
  id: string;
  ticket_number: string | null;
  category: string;
  status: string;
  assigned_to: string | null;
  user_id: string;
  created_at: string;
  first_response_at: string | null;
  resolved_at: string | null;
  closed_at: string | null;
};

const durLabel = (ms: number | null) => {
  if (ms == null || ms < 0) return "—";
  const m = Math.round(ms / 60000);
  if (m < 60) return `${m}m`;
  const h = m / 60;
  if (h < 48) return `${h.toFixed(1)}h`;
  return `${Math.round(m / 1440)}d`;
};
const avg = (arr: number[]) => (arr.length ? arr.reduce((a, b) => a + b, 0) / arr.length : 0);

function Stars({ n, size = "size-3" }: { n: number; size?: string }) {
  return (
    <span className="inline-flex">
      {[1, 2, 3, 4, 5].map((i) => (
        <Star key={i} className={cn(size, i <= Math.round(n) ? "fill-accent text-accent" : "text-muted-foreground/30")} />
      ))}
    </span>
  );
}

export function SupportSatisfactionPanel({
  currentUserId,
  onOpenThread,
}: {
  currentUserId: string;
  onOpenThread: (ticketId: string) => void;
}) {
  const [ratings, setRatings] = useState<Rating[]>([]);
  const [tickets, setTickets] = useState<TicketLite[]>([]);
  const [names, setNames] = useState<Map<string, string>>(new Map());
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState<string | null>(null);

  const load = useCallback(async () => {
    const [{ data: r }, { data: t }] = await Promise.all([
      supabase.from("support_ticket_ratings").select("id,ticket_id,customer_id,rating,comment,rated_at,category,priority,assigned_agent,resolution_time_ms,reviewed").order("rated_at", { ascending: false }).limit(2000),
      supabase.from("support_tickets").select("id,ticket_number,category,status,assigned_to,user_id,created_at,first_response_at,resolved_at,closed_at").order("created_at", { ascending: false }).limit(2000),
    ]);
    const rRows = (r as Rating[]) ?? [];
    const tRows = (t as TicketLite[]) ?? [];
    setRatings(rRows);
    setTickets(tRows);

    const ids = new Set<string>();
    for (const x of rRows) { ids.add(x.customer_id); if (x.assigned_agent) ids.add(x.assigned_agent); }
    for (const x of tRows) { ids.add(x.user_id); if (x.assigned_to) ids.add(x.assigned_to); }
    if (ids.size) {
      const { data: pf } = await supabase.from("profiles").select("id,full_name").in("id", [...ids]);
      setNames(new Map(((pf as { id: string; full_name: string | null }[]) ?? []).map((p) => [p.id, p.full_name ?? "—"])));
    }
    setLoading(false);
  }, []);

  useEffect(() => {
    void load();
    const ch = supabase
      .channel("support-satisfaction")
      .on("postgres_changes", { event: "*", schema: "public", table: "support_ticket_ratings" }, () => void load())
      .subscribe();
    return () => { supabase.removeChannel(ch); };
  }, [load]);

  const nameOf = (id: string | null | undefined) => (id ? names.get(id) ?? `Agent ${id.slice(0, 6)}` : "Unassigned");
  const ticketOf = (id: string) => tickets.find((t) => t.id === id);

  const stats = useMemo(() => {
    const all = ratings.map((r) => r.rating);
    const now = new Date();
    const monthly = ratings.filter((r) => {
      const d = new Date(r.rated_at);
      return d.getFullYear() === now.getFullYear() && d.getMonth() === now.getMonth();
    });
    const dist = [5, 4, 3, 2, 1].map((star) => ({ star, count: ratings.filter((r) => r.rating === star).length }));
    const csat = all.length ? (ratings.filter((r) => r.rating >= 4).length / all.length) * 100 : 0;

    const firstResp = tickets.filter((t) => t.first_response_at).map((t) => +new Date(t.first_response_at!) - +new Date(t.created_at));
    const resolution = tickets
      .map((t) => {
        const end = t.resolved_at ?? t.closed_at;
        return end ? +new Date(end) - +new Date(t.created_at) : null;
      })
      .filter((v): v is number => v != null);


    return {
      average: avg(all),
      total: all.length,
      monthly: avg(monthly.map((r) => r.rating)),
      monthlyCount: monthly.length,
      dist,
      maxDist: Math.max(1, ...dist.map((d) => d.count)),
      csat,
      avgFirst: firstResp.length ? avg(firstResp) : null,
      avgResolution: resolution.length ? avg(resolution) : null,
    };
  }, [ratings, tickets]);

  const agents = useMemo(() => {
    const map = new Map<string, { id: string; handled: number; resp: number[]; res: number[]; sat: number[] }>();
    for (const t of tickets) {
      if (!t.assigned_to) continue;
      const a = map.get(t.assigned_to) ?? { id: t.assigned_to, handled: 0, resp: [], res: [], sat: [] };
      a.handled += 1;
      if (t.first_response_at) a.resp.push(+new Date(t.first_response_at) - +new Date(t.created_at));
      const end = t.resolved_at ?? t.closed_at;
      if (end) a.res.push(+new Date(end) - +new Date(t.created_at));
      map.set(t.assigned_to, a);
    }
    for (const r of ratings) {
      if (!r.assigned_agent) continue;
      const a = map.get(r.assigned_agent) ?? { id: r.assigned_agent, handled: 0, resp: [], res: [], sat: [] };
      a.sat.push(r.rating);
      map.set(r.assigned_agent, a);
    }
    return [...map.values()]
      .map((a) => ({
        id: a.id,
        name: nameOf(a.id),
        handled: a.handled,
        avgResp: a.resp.length ? avg(a.resp) : null,
        avgRes: a.res.length ? avg(a.res) : null,
        avgSat: a.sat.length ? avg(a.sat) : null,
        satCount: a.sat.length,
      }))
      .sort((x, y) => y.handled - x.handled);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tickets, ratings, names]);

  const negative = useMemo(
    () =>
      ratings
        .filter((r) => r.rating <= 2)
        .sort((a, b) => Number(a.reviewed) - Number(b.reviewed) || +new Date(b.rated_at) - +new Date(a.rated_at)),
    [ratings],
  );

  async function markReviewed(id: string) {
    setBusy(id);
    try {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { error } = await (supabase.from("support_ticket_ratings") as any)
        .update({ reviewed: true, reviewed_by: currentUserId, reviewed_at: new Date().toISOString() })
        .eq("id", id);
      if (error) throw error;
      toast.success("Marked as reviewed");
      void load();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Failed");
    } finally {
      setBusy(null);
    }
  }

  async function reopen(ticketId: string) {
    setBusy(ticketId);
    try {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { error } = await (supabase.from("support_tickets") as any).update({ status: "open" }).eq("id", ticketId);
      if (error) throw error;
      toast.success("Ticket reopened");
      void load();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Failed");
    } finally {
      setBusy(null);
    }
  }

  if (loading) return <div className="grid place-items-center py-20"><Loader2 className="size-5 animate-spin text-accent" /></div>;

  return (
    <div className="space-y-5">
      {/* Headline metrics */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        <MetricCard icon={<Star className="size-3.5" />} label="Average rating">
          <div className="flex items-center gap-2">
            <span className="text-2xl font-bold tabular-nums">{stats.average.toFixed(2)}</span>
            <Stars n={stats.average} />
          </div>
        </MetricCard>
        <MetricCard icon={<Calendar className="size-3.5" />} label="This month">
          <div className="flex items-center gap-2">
            <span className="text-2xl font-bold tabular-nums">{stats.monthly ? stats.monthly.toFixed(2) : "—"}</span>
            <span className="text-[11px] text-muted-foreground">{stats.monthlyCount} rated</span>
          </div>
        </MetricCard>
        <MetricCard icon={<TrendingUp className="size-3.5" />} label="Total ratings">
          <span className="text-2xl font-bold tabular-nums">{stats.total}</span>
        </MetricCard>
        <MetricCard icon={<Gauge className="size-3.5" />} label="CSAT score">
          <span className="text-2xl font-bold tabular-nums">{stats.csat.toFixed(0)}%</span>
        </MetricCard>
      </div>

      {/* Distribution + trust metrics */}
      <div className="grid lg:grid-cols-2 gap-3">
        <div className="rounded-2xl border border-border/60 bg-card/50 p-4">
          <p className="text-[11px] font-mono uppercase tracking-widest text-muted-foreground mb-3">Rating distribution</p>
          <div className="space-y-2">
            {stats.dist.map((d) => (
              <div key={d.star} className="flex items-center gap-2">
                <span className="inline-flex items-center gap-0.5 w-20 shrink-0">
                  {Array.from({ length: d.star }).map((_, i) => <Star key={i} className="size-2.5 fill-accent text-accent" />)}
                  {Array.from({ length: 5 - d.star }).map((_, i) => <Star key={`e${i}`} className="size-2.5 text-muted-foreground/25" />)}
                </span>
                <div className="flex-1 h-2 rounded-full bg-white/[0.05] overflow-hidden">
                  <div className="h-full bg-accent rounded-full transition-all" style={{ width: `${(d.count / stats.maxDist) * 100}%` }} />
                </div>
                <span className="w-8 text-right text-xs tabular-nums text-muted-foreground">{d.count}</span>
              </div>
            ))}
          </div>
        </div>

        <div className="rounded-2xl border border-border/60 bg-card/50 p-4">
          <p className="text-[11px] font-mono uppercase tracking-widest text-muted-foreground mb-3">Trust metrics</p>
          <div className="grid grid-cols-1 gap-2">
            <TrustRow icon={<Clock className="size-3.5" />} label="Avg first response time" value={durLabel(stats.avgFirst)} />
            <TrustRow icon={<Clock className="size-3.5" />} label="Avg resolution time" value={durLabel(stats.avgResolution)} />
            <TrustRow icon={<Gauge className="size-3.5" />} label="Customer satisfaction (CSAT)" value={`${stats.csat.toFixed(0)}%`} />
          </div>
        </div>
      </div>

      {/* Agent performance */}
      <div className="rounded-2xl border border-border/60 bg-card/50 p-4">
        <p className="text-[11px] font-mono uppercase tracking-widest text-muted-foreground mb-3 flex items-center gap-1.5"><User className="size-3.5" />Agent performance</p>
        {agents.length === 0 ? (
          <p className="text-xs text-muted-foreground py-2">No assigned tickets yet.</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-xs min-w-[480px]">
              <thead>
                <tr className="text-[10px] uppercase tracking-widest text-muted-foreground text-left">
                  <th className="py-1.5 font-medium">Agent</th>
                  <th className="py-1.5 font-medium text-right">Handled</th>
                  <th className="py-1.5 font-medium text-right">Avg response</th>
                  <th className="py-1.5 font-medium text-right">Avg resolution</th>
                  <th className="py-1.5 font-medium text-right">Satisfaction</th>
                </tr>
              </thead>
              <tbody>
                {agents.map((a) => (
                  <tr key={a.id} className="border-t border-border/40">
                    <td className="py-2 font-medium truncate max-w-[140px]">{a.name}</td>
                    <td className="py-2 text-right tabular-nums">{a.handled}</td>
                    <td className="py-2 text-right tabular-nums">{durLabel(a.avgResp)}</td>
                    <td className="py-2 text-right tabular-nums">{durLabel(a.avgRes)}</td>
                    <td className="py-2 text-right">
                      {a.avgSat != null ? (
                        <span className="inline-flex items-center gap-1 justify-end">
                          <span className="tabular-nums">{a.avgSat.toFixed(1)}</span>
                          <Star className="size-3 fill-accent text-accent" />
                          <span className="text-muted-foreground">({a.satCount})</span>
                        </span>
                      ) : "—"}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Negative feedback queue */}
      <div className="rounded-2xl border border-destructive/30 bg-destructive/[0.03] p-4">
        <p className="text-[11px] font-mono uppercase tracking-widest text-destructive mb-3 flex items-center gap-1.5"><ThumbsDown className="size-3.5" />Negative feedback queue · {negative.filter((n) => !n.reviewed).length} open</p>
        {negative.length === 0 ? (
          <p className="text-xs text-muted-foreground py-2">No negative feedback. Great work! 🎉</p>
        ) : (
          <div className="space-y-2.5">
            {negative.map((r) => {
              const tk = ticketOf(r.ticket_id);
              return (
                <div key={r.id} className={cn("rounded-xl border p-3", r.reviewed ? "border-border/50 bg-white/[0.02] opacity-70" : "border-destructive/30 bg-white/[0.02]")}>
                  <div className="flex items-start justify-between gap-2 flex-wrap">
                    <div className="min-w-0">
                      <div className="flex items-center gap-2">
                        <Stars n={r.rating} />
                        <span className="font-mono text-[11px] text-accent">{tk?.ticket_number ?? `#${r.ticket_id.slice(0, 8)}`}</span>
                        {r.reviewed && <span className="text-[10px] uppercase tracking-widest text-emerald-400">Reviewed</span>}
                      </div>
                      <p className="text-sm font-medium mt-1 truncate">{nameOf(r.customer_id)}</p>
                    </div>
                    <div className="text-right text-[10px] text-muted-foreground shrink-0">
                      <p>Agent: {nameOf(r.assigned_agent)}</p>
                      {(tk?.resolved_at ?? tk?.closed_at) && <p>Resolved {new Date((tk!.resolved_at ?? tk!.closed_at)!).toLocaleDateString()}</p>}
                    </div>
                  </div>
                  {r.comment && <p className="text-xs text-muted-foreground mt-2 italic">“{r.comment}”</p>}
                  <div className="mt-3 flex flex-wrap gap-1.5">
                    <ActionBtn icon={<MessageSquare className="size-3" />} onClick={() => onOpenThread(r.ticket_id)}>Review</ActionBtn>
                    <ActionBtn icon={<RotateCcw className="size-3" />} disabled={busy === r.ticket_id} onClick={() => reopen(r.ticket_id)}>Reopen Ticket</ActionBtn>
                    <ActionBtn icon={<MessageSquare className="size-3" />} onClick={() => onOpenThread(r.ticket_id)}>Contact Customer</ActionBtn>
                    {!r.reviewed && (
                      <ActionBtn icon={<CheckCircle2 className="size-3" />} tone="emerald" disabled={busy === r.id} onClick={() => markReviewed(r.id)}>Mark Reviewed</ActionBtn>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}

function MetricCard({ icon, label, children }: { icon: React.ReactNode; label: string; children: React.ReactNode }) {
  return (
    <div className="rounded-2xl border border-border/60 bg-card/50 p-4">
      <p className="text-[10px] uppercase tracking-widest text-muted-foreground flex items-center gap-1.5 mb-1.5">{icon}{label}</p>
      {children}
    </div>
  );
}

function TrustRow({ icon, label, value }: { icon: React.ReactNode; label: string; value: string }) {
  return (
    <div className="flex items-center justify-between rounded-lg bg-white/[0.03] px-3 py-2">
      <span className="text-xs text-muted-foreground flex items-center gap-1.5">{icon}{label}</span>
      <span className="text-sm font-semibold tabular-nums">{value}</span>
    </div>
  );
}

function ActionBtn({ icon, children, tone, disabled, onClick }: { icon: React.ReactNode; children: React.ReactNode; tone?: "emerald"; disabled?: boolean; onClick: () => void }) {
  return (
    <button disabled={disabled} onClick={onClick}
      className={cn("inline-flex items-center gap-1 rounded-lg border px-2.5 py-1.5 text-[11px] font-medium transition-colors disabled:opacity-50",
        tone === "emerald" ? "border-emerald-400/30 text-emerald-400 hover:bg-emerald-400/10" : "border-border text-foreground hover:border-accent/40 hover:text-accent")}>
      {icon}{children}
    </button>
  );
}
