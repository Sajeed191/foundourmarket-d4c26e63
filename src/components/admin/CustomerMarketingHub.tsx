import { useEffect, useMemo, useState, useCallback } from "react";
import { toast } from "sonner";
import {
  Megaphone, Loader2, Rocket, Crown, Users, Gem, AlertTriangle, Moon, UserPlus,
  RotateCcw, LifeBuoy, Repeat, Sparkles, Zap, X, Gauge, Check, Ban, Download,
  ChevronRight, Globe, Calendar, Copy, TrendingUp, TrendingDown, Minus,
} from "lucide-react";
import type { CustomerIntel } from "@/lib/customer-intelligence";
import { downloadCSV } from "@/lib/admin-queries";
import { supabase } from "@/integrations/supabase/client";
import {
  buildCustomerAudiences, buildCustomerRecommendations, buildCustomerMarketingAnalytics,
  scoreCustomer, campaignsForAudience, fetchCustomerCampaigns, createCustomerCampaign,
  pauseAudiencePromotions, duplicateCustomerCampaign, exportAudience, rejectCustomerRecommendation,
  fmtC, AUD_TONE, REC_TONE,
  type CustomerAudience, type AudienceKey, type CustomerRecommendation, type Campaign,
} from "@/lib/customer-marketing";

const AUD_ICON: Record<AudienceKey, React.ReactNode> = {
  vip: <Crown className="size-4 text-emerald-400" />,
  loyal: <Repeat className="size-4 text-emerald-400" />,
  high_value: <Gem className="size-4 text-emerald-400" />,
  at_risk: <AlertTriangle className="size-4 text-amber-400" />,
  dormant: <Moon className="size-4 text-destructive" />,
  new: <UserPlus className="size-4 text-cyan-400" />,
  refund_heavy: <RotateCcw className="size-4 text-destructive" />,
  support_heavy: <LifeBuoy className="size-4 text-amber-400" />,
  repeat: <Repeat className="size-4 text-emerald-400" />,
  big_spenders: <Gem className="size-4 text-emerald-400" />,
};

function growthIcon(g: CustomerAudience["growth"]) {
  if (g === "up") return <TrendingUp className="size-3 text-emerald-400" />;
  if (g === "down") return <TrendingDown className="size-3 text-destructive" />;
  return <Minus className="size-3 text-muted-foreground" />;
}

export function CustomerMarketingHub({ rows }: { rows: CustomerIntel[] }) {
  const [campaigns, setCampaigns] = useState<Campaign[]>([]);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState<string | null>(null);
  const [dismissed, setDismissed] = useState<Set<string>>(new Set());
  const [focus, setFocus] = useState<CustomerAudience | null>(null);

  const load = useCallback(async () => {
    setCampaigns(await fetchCustomerCampaigns());
    setLoading(false);
  }, []);

  useEffect(() => { void load(); }, [load]);

  // Realtime: campaigns change → audience analytics refresh.
  useEffect(() => {
    const ch = supabase
      .channel("customer-marketing-rt")
      .on("postgres_changes", { event: "*", schema: "public", table: "marketing_campaigns" }, () => void load())
      .subscribe();
    return () => { void supabase.removeChannel(ch); };
  }, [load]);

  const audiences = useMemo(() => buildCustomerAudiences(rows), [rows]);
  const audByKey = useMemo(() => new Map(audiences.map((a) => [a.key, a])), [audiences]);
  const recs = useMemo(
    () => buildCustomerRecommendations(audiences).filter((r) => !dismissed.has(r.id)),
    [audiences, dismissed],
  );
  const analytics = useMemo(
    () => buildCustomerMarketingAnalytics(rows, audiences, campaigns),
    [rows, audiences, campaigns],
  );

  const run = useCallback(async (key: string, fn: () => Promise<{ error?: string }>, ok: string) => {
    setBusy(key);
    try {
      const res = await fn();
      if (res.error) toast.error("Action failed", { description: res.error });
      else { toast.success(ok); await load(); }
    } finally { setBusy(null); }
  }, [load]);

  const acceptRec = useCallback((rec: CustomerRecommendation, launch: boolean) => {
    const aud = audByKey.get(rec.audienceKey);
    if (!aud) return;
    const key = `rec-${rec.id}-${launch}`;
    void run(key, () => createCustomerCampaign({
      template: rec.template, audience: aud, recommendationId: rec.id, launch,
    }), launch ? "Campaign launched" : "Draft campaign created");
  }, [run, audByKey]);

  const doExport = useCallback((aud: CustomerAudience) => {
    const data = exportAudience(aud);
    downloadCSV(`audience-${aud.key}-${Date.now()}.csv`, data);
    toast.success(`Exported ${data.length} customers`);
  }, []);

  if (loading) {
    return (
      <section id="ci-marketing" className="mt-6 scroll-mt-20">
        <Header />
        <div className="card-premium rounded-2xl px-5 py-10 grid place-items-center">
          <Loader2 className="size-5 animate-spin text-accent" />
        </div>
      </section>
    );
  }

  return (
    <section id="ci-marketing" className="mt-6 scroll-mt-20">
      <Header />

      {/* Analytics */}
      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-3 mb-5">
        <Kpi label="Audience revenue" value={fmtC(analytics.audienceRevenue)} />
        <Kpi label="Audience profit" value={fmtC(analytics.audienceProfit)} accent />
        <Kpi label="Campaign revenue" value={fmtC(analytics.campaignRevenue)} accent />
        <Kpi label="Campaign ROI" value={`${(analytics.campaignRoi * 100).toFixed(0)}%`} />
        <Kpi label="Retention" value={`${(analytics.retentionRate * 100).toFixed(0)}%`} />
        <Kpi label="Reachable" value={analytics.reachableCustomers.toLocaleString()} />
      </div>

      {/* Recommendations */}
      <div className="flex items-center gap-2 mb-3">
        <Sparkles className="size-4 text-accent" />
        <h3 className="text-sm font-medium">Targeting recommendations</h3>
        <span className="text-[10px] font-mono uppercase tracking-widest text-muted-foreground">· {recs.length} opportunities</span>
      </div>
      {recs.length === 0 ? (
        <div className="card-premium rounded-2xl px-5 py-8 text-center text-xs text-muted-foreground mb-6">
          No customer targeting opportunities right now.
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-2.5 mb-6">
          {recs.map((r) => (
            <div key={r.id} className={`rounded-xl border px-4 py-3 ${REC_TONE[r.tone]}`}>
              <div className="flex items-start gap-2.5">
                <Rocket className="size-3.5 text-accent mt-0.5 shrink-0" />
                <div className="min-w-0 flex-1">
                  <p className="text-xs font-medium">{r.title}</p>
                  <p className="text-[11px] text-muted-foreground mt-0.5">{r.detail}</p>
                  <div className="flex flex-wrap items-center gap-1.5 mt-2.5">
                    <ActBtn busy={busy === `rec-${r.id}-true`} primary onClick={() => acceptRec(r, true)} icon={<Zap className="size-3" />}>
                      Launch
                    </ActBtn>
                    <ActBtn busy={busy === `rec-${r.id}-false`} onClick={() => acceptRec(r, false)} icon={<Check className="size-3" />}>
                      Draft
                    </ActBtn>
                    <button
                      onClick={() => { rejectCustomerRecommendation(r); setDismissed((s) => new Set(s).add(r.id)); }}
                      className="inline-flex items-center gap-1 border border-border px-2.5 py-1 rounded-full text-[10px] uppercase tracking-widest font-mono hover:bg-white/5 text-muted-foreground"
                    >
                      <Ban className="size-3" /> Dismiss
                    </button>
                  </div>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Audiences */}
      <div className="flex items-center gap-2 mb-3">
        <Users className="size-4 text-accent" />
        <h3 className="text-sm font-medium">Marketing audiences</h3>
        <span className="text-[10px] font-mono uppercase tracking-widest text-muted-foreground">· {audiences.length} segments</span>
      </div>
      <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-3">
        {audiences.map((a) => (
          <AudienceCard
            key={a.key} a={a} busy={busy}
            active={campaignsForAudience(a.key, campaigns).filter((c) => c.status === "active").length}
            onOpen={setFocus}
            onLaunch={() => a.template && void run(`aud-${a.key}`, () => createCustomerCampaign({ template: a.template!, audience: a, launch: true }), "Campaign launched")}
            onExport={() => doExport(a)}
          />
        ))}
        {audiences.length === 0 && (
          <div className="card-premium rounded-2xl px-5 py-8 text-center text-xs text-muted-foreground col-span-full">
            No targetable audiences yet.
          </div>
        )}
      </div>

      {focus && (
        <AudiencePanel
          a={focus} rows={rows} campaigns={campaigns} busy={busy}
          onClose={() => setFocus(null)}
          onCreate={(launch, scheduledAt) => focus.template && void run(`panel-${focus.key}-${launch}`,
            () => createCustomerCampaign({ template: focus.template!, audience: focus, launch, scheduledAt }),
            launch ? "Campaign launched" : scheduledAt ? "Campaign scheduled" : "Draft created")}
          onPause={() => void run(`panel-pause-${focus.key}`, async () => { await pauseAudiencePromotions(focus.key, campaigns); return {}; }, "Campaigns paused")}
          onDuplicate={(c) => void run(`panel-dup-${c.id}`, async () => { await duplicateCustomerCampaign(c); return {}; }, "Campaign duplicated")}
          onExport={() => doExport(focus)}
        />
      )}
    </section>
  );
}

function Header() {
  return (
    <div className="flex items-center gap-2 mb-4">
      <Megaphone className="size-4 text-accent" />
      <h2 className="text-sm font-display font-semibold">Marketing Opportunities</h2>
      <span className="text-[10px] font-mono uppercase tracking-widest text-muted-foreground">· turn insights into campaigns</span>
    </div>
  );
}

function Kpi({ label, value, accent, danger }: { label: string; value: string; accent?: boolean; danger?: boolean }) {
  return (
    <div className="card-premium rounded-2xl p-3.5">
      <p className="text-[10px] font-mono uppercase tracking-widest text-muted-foreground mb-1">{label}</p>
      <p className={`font-display text-lg ${accent ? "text-emerald-400" : danger ? "text-destructive" : ""}`}>{value}</p>
    </div>
  );
}

function ActBtn({ children, onClick, busy, primary, icon }: {
  children: React.ReactNode; onClick: () => void; busy?: boolean; primary?: boolean; icon?: React.ReactNode;
}) {
  return (
    <button
      disabled={busy}
      onClick={onClick}
      className={`inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-[10px] uppercase tracking-widest font-mono disabled:opacity-50 ${
        primary ? "bg-accent/15 text-accent border border-accent/30 hover:bg-accent/25" : "border border-border hover:bg-white/5"
      }`}
    >
      {busy ? <Loader2 className="size-3 animate-spin" /> : icon}
      {children}
    </button>
  );
}

function AudienceCard({ a, busy, active, onOpen, onLaunch, onExport }: {
  a: CustomerAudience; busy: string | null; active: number;
  onOpen: (a: CustomerAudience) => void; onLaunch: () => void; onExport: () => void;
}) {
  return (
    <div className={`card-premium rounded-2xl overflow-hidden ring-1 ${AUD_TONE[a.tone]}`}>
      <button onClick={() => onOpen(a)} className="w-full px-4 py-3 border-b border-border flex items-center gap-2 text-left hover:bg-white/[0.02]">
        {AUD_ICON[a.key]}
        <h4 className="text-sm font-medium flex-1">{a.label}</h4>
        {active > 0 && <span className="rounded-full bg-emerald-400/10 text-emerald-400 px-1.5 py-0.5 text-[9px] font-mono">{active} live</span>}
        <span className="text-[10px] font-mono text-muted-foreground">{a.count}</span>
      </button>
      <div className="px-4 py-2.5 grid grid-cols-3 gap-2 text-center border-b border-border/40">
        <Stat label="Revenue" value={fmtC(a.revenue)} />
        <Stat label="LTV" value={fmtC(a.ltv)} />
        <Stat label="AOV" value={fmtC(a.aov)} />
        <Stat label="Profit" value={fmtC(a.profit)} tone="text-emerald-400" />
        <Stat label="Orders" value={a.orders.toLocaleString()} />
        <Stat label="Growth" value={`${(a.growthPct * 100).toFixed(0)}%`} icon={growthIcon(a.growth)} />
      </div>
      <div className="px-4 py-2 flex items-center gap-2 text-[10px] font-mono text-muted-foreground border-b border-border/40">
        <Globe className="size-3" />
        {a.regions.map((r) => (
          <span key={r.region} className="capitalize">{r.region.slice(0, 3)} {r.count}</span>
        ))}
      </div>
      <div className="px-4 py-2.5 flex items-center gap-1.5">
        {a.template && (
          <ActBtn busy={busy === `aud-${a.key}`} primary onClick={onLaunch} icon={<Zap className="size-3" />}>
            Launch
          </ActBtn>
        )}
        <ActBtn onClick={onExport} icon={<Download className="size-3" />}>Export</ActBtn>
        <button onClick={() => onOpen(a)} className="ml-auto inline-flex items-center gap-1 text-accent text-[11px] hover:underline">
          Details <ChevronRight className="size-3" />
        </button>
      </div>
    </div>
  );
}

function Stat({ label, value, tone, icon }: { label: string; value: string; tone?: string; icon?: React.ReactNode }) {
  return (
    <div>
      <p className="text-[9px] font-mono uppercase tracking-widest text-muted-foreground">{label}</p>
      <p className={`text-xs font-display tabular-nums flex items-center justify-center gap-1 ${tone ?? ""}`}>{icon}{value}</p>
    </div>
  );
}

/* ---------------------------------------------- audience detail panel */

function AudiencePanel({ a, rows, campaigns, busy, onClose, onCreate, onPause, onDuplicate, onExport }: {
  a: CustomerAudience; rows: CustomerIntel[]; campaigns: Campaign[]; busy: string | null;
  onClose: () => void; onCreate: (launch: boolean, scheduledAt?: string | null) => void;
  onPause: () => void; onDuplicate: (c: Campaign) => void; onExport: () => void;
}) {
  const maxSpend = useMemo(() => Math.max(1, ...rows.map((c) => c.lifetimeSpend)), [rows]);
  const avgScore = useMemo(() => {
    if (!a.members.length) return null;
    const acc = { loyalty: 0, retention: 0, engagement: 0, spend: 0, growth: 0, churnRisk: 0, referral: 0 };
    a.members.forEach((c) => {
      const s = scoreCustomer(c, maxSpend);
      (Object.keys(acc) as (keyof typeof acc)[]).forEach((k) => { acc[k] += s[k]; });
    });
    (Object.keys(acc) as (keyof typeof acc)[]).forEach((k) => { acc[k] = Math.round(acc[k] / a.members.length); });
    return acc;
  }, [a.members, maxSpend]);

  const current = campaignsForAudience(a.key, campaigns);
  const scoreDefs: { key: keyof NonNullable<typeof avgScore>; label: string }[] = [
    { key: "loyalty", label: "Loyalty" }, { key: "retention", label: "Retention" },
    { key: "engagement", label: "Engagement" }, { key: "spend", label: "Spend" },
    { key: "growth", label: "Growth" }, { key: "churnRisk", label: "Churn Risk" },
    { key: "referral", label: "Referral" },
  ];

  return (
    <div className="fixed inset-0 z-50 flex items-end md:items-center justify-center">
      <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" onClick={onClose} />
      <div className="relative w-full md:max-w-lg max-h-[88vh] overflow-y-auto card-premium rounded-t-3xl md:rounded-3xl border border-border p-5">
        <div className="flex items-start justify-between mb-4">
          <div className="min-w-0">
            <p className="text-[10px] font-mono uppercase tracking-widest text-accent mb-1">Customer audience</p>
            <h3 className="text-base font-medium truncate flex items-center gap-2">{AUD_ICON[a.key]} {a.label}</h3>
            <p className="text-[11px] text-muted-foreground mt-0.5">{a.description}</p>
          </div>
          <button onClick={onClose} className="p-1.5 rounded-full hover:bg-white/5 shrink-0"><X className="size-4" /></button>
        </div>

        <div className="grid grid-cols-3 gap-2 mb-4">
          <Field label="Customers" value={a.count.toLocaleString()} />
          <Field label="Revenue" value={fmtC(a.revenue)} />
          <Field label="Profit" value={fmtC(a.profit)} />
          <Field label="Orders" value={a.orders.toLocaleString()} />
          <Field label="AOV" value={fmtC(a.aov)} />
          <Field label="LTV" value={fmtC(a.ltv)} />
        </div>

        {/* region split */}
        <p className="text-[10px] font-mono uppercase tracking-widest text-muted-foreground mb-2">Region split</p>
        <div className="grid grid-cols-2 gap-2 mb-4">
          {a.regions.map((r) => (
            <div key={r.region} className="rounded-xl border border-border bg-white/[0.02] px-3 py-2.5">
              <p className="text-[10px] font-mono uppercase tracking-widest text-muted-foreground mb-1 capitalize">{r.region}</p>
              <p className="text-sm font-display">{r.count} · {fmtC(r.revenue, r.region)}</p>
            </div>
          ))}
        </div>

        {/* scores */}
        {avgScore && (
          <>
            <p className="text-[10px] font-mono uppercase tracking-widest text-muted-foreground mb-2">Average marketing scores</p>
            <div className="grid grid-cols-3 gap-2 mb-4">
              {scoreDefs.map((s) => (
                <div key={s.key} className="rounded-xl border border-border bg-white/[0.02] px-3 py-2.5">
                  <div className="flex items-center gap-1 mb-1.5"><Gauge className="size-3 text-accent" /><span className="text-[9px] font-mono uppercase tracking-widest text-muted-foreground">{s.label}</span></div>
                  <p className="font-display text-lg leading-none">{avgScore[s.key]}</p>
                  <div className="mt-1.5 h-1 rounded-full bg-white/5 overflow-hidden">
                    <div className={`h-full rounded-full ${s.key === "churnRisk" ? "bg-destructive/70" : "bg-gradient-to-r from-accent to-primary"}`} style={{ width: `${avgScore[s.key]}%` }} />
                  </div>
                </div>
              ))}
            </div>
          </>
        )}

        {/* current campaigns */}
        <p className="text-[10px] font-mono uppercase tracking-widest text-muted-foreground mb-2">Audience campaigns</p>
        {current.length === 0 ? (
          <p className="text-xs text-muted-foreground mb-4">No active campaigns for this audience.</p>
        ) : (
          <ul className="space-y-1.5 mb-4">
            {current.map((c) => (
              <li key={c.id} className="flex items-center gap-2 rounded-xl border border-border bg-white/[0.02] px-3 py-2">
                <span className="text-xs flex-1 truncate">{c.name}</span>
                <span className="text-[10px] font-mono text-muted-foreground">{c.status}</span>
                <button disabled={busy === `panel-dup-${c.id}`} onClick={() => onDuplicate(c)} className="p-1 rounded hover:bg-white/5" title="Duplicate">
                  {busy === `panel-dup-${c.id}` ? <Loader2 className="size-3 animate-spin" /> : <Copy className="size-3 text-muted-foreground" />}
                </button>
              </li>
            ))}
          </ul>
        )}

        {/* actions */}
        <div className="flex flex-wrap items-center gap-1.5">
          {a.template && (
            <>
              <ActBtn busy={busy === `panel-${a.key}-true`} primary onClick={() => onCreate(true)} icon={<Zap className="size-3" />}>Launch</ActBtn>
              <ActBtn busy={busy === `panel-${a.key}-false`} onClick={() => onCreate(false)} icon={<Check className="size-3" />}>Draft</ActBtn>
              <ActBtn busy={busy === `panel-${a.key}-false`} onClick={() => onCreate(false, new Date(Date.now() + 86_400_000).toISOString())} icon={<Calendar className="size-3" />}>Schedule</ActBtn>
            </>
          )}
          <ActBtn busy={busy === `panel-pause-${a.key}`} onClick={onPause} icon={<Ban className="size-3" />}>Pause</ActBtn>
          <ActBtn onClick={onExport} icon={<Download className="size-3" />}>Export</ActBtn>
        </div>
      </div>
    </div>
  );
}

function Field({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-xl border border-border bg-white/[0.02] px-3 py-2.5">
      <p className="text-[9px] font-mono uppercase tracking-widest text-muted-foreground mb-1">{label}</p>
      <p className="text-sm font-display tabular-nums">{value}</p>
    </div>
  );
}
