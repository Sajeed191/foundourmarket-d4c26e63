import { useCallback, useEffect, useMemo, useState } from "react";
import { toast } from "sonner";
import {
  Megaphone, Loader2, Rocket, Sparkles, Zap, Check, Ban, Gauge, TrendingUp,
  TrendingDown, Pause, Copy, Crown, Globe, Package, Users, AlertTriangle, ChevronRight,
} from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import type { FinancialMarketingData } from "@/lib/financial-marketing";
import {
  computeProfitAnalytics, campaignProfitability, customerProfitability,
  productProfitabilityReport, regionalProfitability, financialMarketingScore,
  buildFinancialRecommendations, detectFinancialMarketingAlerts, executiveKpis,
  scaleCampaign, pauseFinancialCampaign, duplicateFinancialCampaign,
  launchProfitCampaign, rejectFinancialRecommendation,
  fmt, REC_TONE,
  type FinancialRecommendation, type CampaignProfit,
} from "@/lib/financial-marketing";

export function FinancialMarketingHub({ data }: { data: FinancialMarketingData | null }) {
  const [live, setLive] = useState<FinancialMarketingData | null>(data);
  const [busy, setBusy] = useState<string | null>(null);
  const [dismissed, setDismissed] = useState<Set<string>>(new Set());

  useEffect(() => { setLive(data); }, [data]);

  const reload = useCallback(async () => {
    const { fetchFinancialMarketing } = await import("@/lib/financial-marketing");
    setLive(await fetchFinancialMarketing(365));
  }, []);

  // Realtime: campaign / order / return changes refresh profit + ROI.
  useEffect(() => {
    const ch = supabase
      .channel("financial-marketing-rt")
      .on("postgres_changes", { event: "*", schema: "public", table: "marketing_campaigns" }, () => void reload())
      .subscribe();
    return () => { void supabase.removeChannel(ch); };
  }, [reload]);

  const model = useMemo(() => {
    if (!live) return null;
    const pa = computeProfitAnalytics(live);
    const camps = campaignProfitability(live.campaigns);
    const cust = customerProfitability(live.customers);
    const prod = productProfitabilityReport(live);
    const regions = regionalProfitability(live);
    return {
      pa, camps, cust, prod, regions,
      score: financialMarketingScore(pa, camps, live),
      recs: buildFinancialRecommendations(live, camps, prod, cust).filter((r) => !dismissed.has(r.id)),
      alerts: detectFinancialMarketingAlerts(pa, camps, regions),
      kpis: executiveKpis(pa, camps, prod, cust),
    };
  }, [live, dismissed]);

  const run = useCallback(async (key: string, fn: () => Promise<{ error?: string }>, ok: string) => {
    setBusy(key);
    try {
      const res = await fn();
      if (res.error) toast.error("Action failed", { description: res.error });
      else { toast.success(ok); await reload(); }
    } finally { setBusy(null); }
  }, [reload]);

  const acceptRec = useCallback((rec: FinancialRecommendation, launch: boolean) => {
    const key = `rec-${rec.id}-${launch}`;
    if (rec.campaignId && rec.action === "pause")
      return void run(key, () => pauseFinancialCampaign(rec.campaignId!), "Campaign paused");
    if (rec.campaignId && rec.action === "scale") {
      const cp = model?.camps.find((c) => c.id === rec.campaignId);
      if (cp) return void run(key, () => scaleCampaign(cp), "Budget scaled");
    }
    if (rec.template)
      return void run(key, () => launchProfitCampaign({ template: rec.template!, recommendationId: rec.id, slugs: rec.slugs, launch }), launch ? "Campaign launched" : "Draft created");
    toast.info("Reviewed", { description: rec.title });
  }, [run, model]);

  if (!model) {
    return (
      <section id="fin-marketing" className="mt-6 scroll-mt-24">
        <Header />
        <div className="rounded-2xl glass px-5 py-10 grid place-items-center"><Loader2 className="size-5 animate-spin text-accent" /></div>
      </section>
    );
  }

  const { pa, camps, cust, prod, regions, score, recs, alerts, kpis } = model;

  return (
    <section id="fin-marketing" className="mt-6 scroll-mt-24">
      <Header />

      {/* Executive KPI bar */}
      <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-7 gap-2.5 mb-5">
        <Kpi label="Total Revenue" value={fmt(kpis.totalRevenue)} />
        <Kpi label="Total Profit" value={fmt(kpis.totalProfit)} accent={kpis.totalProfit >= 0} danger={kpis.totalProfit < 0} />
        <Kpi label="Net Margin" value={`${kpis.netMargin.toFixed(1)}%`} accent={kpis.netMargin >= 0} danger={kpis.netMargin < 0} />
        <Kpi label="Campaign Profit" value={fmt(kpis.campaignProfit)} accent={kpis.campaignProfit >= 0} />
        <Kpi label="Top Campaign" value={kpis.topCampaign ? trunc(kpis.topCampaign.name) : "—"} small />
        <Kpi label="Top Product" value={kpis.topProduct ? trunc(kpis.topProduct.name) : "—"} small />
        <Kpi label="Top Segment" value={kpis.topSegment ? trunc(kpis.topSegment.segment) : "—"} small />
      </div>

      {/* Alerts */}
      {alerts.length > 0 && (
        <div className="grid gap-2 sm:grid-cols-2 mb-5">
          {alerts.map((a) => (
            <div key={a.id} className={`flex items-start gap-2.5 rounded-xl glass px-3 py-2.5 border-l-2 ${a.severity === "high" ? "border-rose-400" : a.severity === "medium" ? "border-amber-400" : "border-sky-400"}`}>
              <AlertTriangle className={`size-3.5 mt-0.5 shrink-0 ${a.severity === "high" ? "text-rose-300" : a.severity === "medium" ? "text-amber-300" : "text-sky-300"}`} />
              <div className="min-w-0"><p className="text-xs font-medium">{a.title}</p><p className="text-[11px] text-muted-foreground leading-snug">{a.detail}</p></div>
            </div>
          ))}
        </div>
      )}

      {/* Profit analytics */}
      <SubHead icon={<Sparkles className="size-4 text-accent" />} title="Profit analytics" />
      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-5 gap-2.5 mb-5">
        <Kpi label="Gross Margin" value={`${pa.grossMargin.toFixed(1)}%`} />
        <Kpi label="Marketing Spend" value={fmt(pa.marketingSpend)} />
        <Kpi label="Refund Costs" value={fmt(pa.refundCosts)} danger />
        <Kpi label="Return Costs" value={fmt(pa.returnCosts)} danger />
        <Kpi label="Campaign Costs" value={fmt(pa.campaignCosts)} />
        <Kpi label="Net Contribution" value={fmt(pa.netContribution)} accent={pa.netContribution >= 0} danger={pa.netContribution < 0} />
        <Kpi label="Support Load" value={`${pa.supportTickets} tickets`} small />
        <Kpi label="COGS" value={fmt(pa.cogs)} />
        <Kpi label="Shipping" value={fmt(pa.shipping)} />
        <Kpi label="Tax" value={fmt(pa.tax)} />
      </div>

      {/* Financial marketing score */}
      <SubHead icon={<Gauge className="size-4 text-accent" />} title="Financial marketing score" />
      <div className="grid grid-cols-3 md:grid-cols-7 gap-2 mb-5">
        {([
          ["profit", "Profit"], ["margin", "Margin"], ["roi", "ROI"], ["roas", "ROAS"],
          ["efficiency", "Efficiency"], ["growth", "Growth"], ["risk", "Risk"],
        ] as const).map(([k, label]) => (
          <div key={k} className="rounded-xl border border-border bg-white/[0.02] px-3 py-2.5">
            <p className="text-[9px] font-mono uppercase tracking-widest text-muted-foreground mb-1">{label}</p>
            <p className="font-display text-lg leading-none">{score[k]}</p>
            <div className="mt-1.5 h-1 rounded-full bg-white/5 overflow-hidden">
              <div className={`h-full rounded-full ${k === "risk" ? "bg-destructive/70" : "bg-gradient-to-r from-accent to-primary"}`} style={{ width: `${score[k]}%` }} />
            </div>
          </div>
        ))}
      </div>

      {/* Recommendations */}
      <SubHead icon={<Sparkles className="size-4 text-accent" />} title="Profit recommendations" sub={`${recs.length} opportunities`} />
      {recs.length === 0 ? (
        <div className="rounded-2xl glass px-5 py-8 text-center text-xs text-muted-foreground mb-6">No profit optimisations right now.</div>
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
                    <ActBtn busy={busy === `rec-${r.id}-true`} primary onClick={() => acceptRec(r, true)} icon={<Zap className="size-3" />}>{r.action === "pause" ? "Pause" : r.action === "scale" ? "Scale" : "Launch"}</ActBtn>
                    {r.template && r.action !== "pause" && r.action !== "scale" && (
                      <ActBtn busy={busy === `rec-${r.id}-false`} onClick={() => acceptRec(r, false)} icon={<Check className="size-3" />}>Draft</ActBtn>
                    )}
                    <button onClick={() => { rejectFinancialRecommendation(r); setDismissed((s) => new Set(s).add(r.id)); }} className="inline-flex items-center gap-1 border border-border px-2.5 py-1 rounded-full text-[10px] uppercase tracking-widest font-mono hover:bg-white/5 text-muted-foreground"><Ban className="size-3" /> Dismiss</button>
                  </div>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Campaign profitability */}
      <SubHead icon={<Megaphone className="size-4 text-accent" />} title="Campaign profitability" sub={`${camps.length} campaigns`} />
      <div className="overflow-x-auto no-scrollbar rounded-2xl glass mb-6">
        <table className="w-full text-sm min-w-[640px]">
          <thead className="text-[9px] font-mono uppercase tracking-[0.18em] text-muted-foreground/80 border-b border-white/[0.07]">
            <tr>
              <th className="py-2.5 px-3 text-left">Campaign</th><th className="px-3 text-right">Revenue</th>
              <th className="px-3 text-right">Profit</th><th className="px-3 text-right">ROI</th>
              <th className="px-3 text-right">ROAS</th><th className="px-3 text-right">Margin</th>
              <th className="px-3 text-right">Conv.</th><th className="px-3 text-right">Actions</th>
            </tr>
          </thead>
          <tbody>
            {camps.map((c) => (
              <tr key={c.id} className="border-b border-white/[0.04] last:border-0 hover:bg-white/[0.02]">
                <td className="px-3 py-2 text-[11px] truncate max-w-[160px]">{c.name}</td>
                <td className="px-3 py-2 text-right font-mono text-xs">{fmt(c.revenue)}</td>
                <td className={`px-3 py-2 text-right font-mono text-xs ${c.profit >= 0 ? "text-emerald-300" : "text-rose-300"}`}>{fmt(c.profit)}</td>
                <td className={`px-3 py-2 text-right font-mono text-xs ${c.roi >= 1 ? "text-emerald-300" : c.roi < 0 ? "text-rose-300" : ""}`}>{c.roi.toFixed(2)}×</td>
                <td className="px-3 py-2 text-right font-mono text-xs">{c.roas.toFixed(2)}×</td>
                <td className="px-3 py-2 text-right font-mono text-xs">{c.margin.toFixed(0)}%</td>
                <td className="px-3 py-2 text-right font-mono text-xs">{(c.conversionRate * 100).toFixed(1)}%</td>
                <td className="px-3 py-2">
                  <div className="flex items-center justify-end gap-1">
                    {c.status === "active" && <IconBtn busy={busy === `c-pause-${c.id}`} title="Pause" onClick={() => void run(`c-pause-${c.id}`, () => pauseFinancialCampaign(c.id), "Paused")}><Pause className="size-3" /></IconBtn>}
                    {c.roi >= 1.5 && <IconBtn busy={busy === `c-scale-${c.id}`} title="Scale budget" onClick={() => void run(`c-scale-${c.id}`, () => scaleCampaign(c), "Scaled")}><TrendingUp className="size-3" /></IconBtn>}
                    <IconBtn busy={busy === `c-dup-${c.id}`} title="Duplicate" onClick={() => void run(`c-dup-${c.id}`, async () => { await duplicateFinancialCampaign(c); return {}; }, "Duplicated")}><Copy className="size-3" /></IconBtn>
                  </div>
                </td>
              </tr>
            ))}
            {camps.length === 0 && <tr><td colSpan={8} className="py-8 text-center text-sm text-muted-foreground">No campaign performance yet.</td></tr>}
          </tbody>
        </table>
      </div>

      {/* Customer + Product + Regional profitability */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-3">
        <Card icon={<Users className="size-4 text-accent" />} title="Customer profitability">
          <ListRow label="VIP profit" value={`${fmt(cust.vipProfit)} · ${cust.vipShare.toFixed(0)}%`} tone="text-emerald-300" />
          {cust.mostProfitableSegments.map((s) => <ListRow key={`mp-${s.segment}`} label={s.segment} value={fmt(s.profit)} />)}
          {cust.leastProfitableSegments.slice(0, 1).map((s) => <ListRow key={`lp-${s.segment}`} label={`${s.segment} (lowest)`} value={fmt(s.profit)} tone="text-rose-300" />)}
          <ListRow label="Refund-heavy" value={`${cust.refundHeavy.length}`} />
          <ListRow label="Support-heavy" value={`${cust.supportHeavy.length}`} />
        </Card>

        <Card icon={<Package className="size-4 text-accent" />} title="Product profitability">
          <ListRow label="Profit / order" value={fmt(prod.profitPerOrder)} />
          <ListRow label="Profit / customer" value={fmt(prod.profitPerCustomer)} />
          {prod.mostProfitable.slice(0, 3).map((p) => <ListRow key={`top-${p.slug}`} label={trunc(p.name)} value={fmt(p.profit)} tone="text-emerald-300" />)}
          {prod.lowestMargin.slice(0, 2).map((p) => <ListRow key={`low-${p.slug}`} label={trunc(p.name)} value={`${p.margin.toFixed(0)}%`} tone="text-rose-300" />)}
        </Card>

        <Card icon={<Globe className="size-4 text-accent" />} title="Regional profitability">
          {regions.map((r) => (
            <div key={r.region} className="rounded-xl border border-border bg-white/[0.02] px-3 py-2.5 mb-2 last:mb-0">
              <div className="flex items-center justify-between mb-1">
                <span className="text-xs font-medium capitalize">{r.region}</span>
                <span className={`text-[11px] font-mono ${r.margin >= 0 ? "text-emerald-300" : "text-rose-300"}`}>{r.margin.toFixed(0)}% margin</span>
              </div>
              <div className="grid grid-cols-2 gap-x-3 gap-y-0.5 text-[11px] text-muted-foreground font-mono">
                <span>Rev {fmt(r.revenue)}</span><span>Profit {fmt(r.profit)}</span>
                <span>{r.orders} orders</span><span>{r.customers} cust.</span>
                <span>ROI {r.campaignRoi.toFixed(2)}×</span>
              </div>
            </div>
          ))}
        </Card>
      </div>
    </section>
  );
}

function trunc(s: string, n = 18) { return s.length > n ? s.slice(0, n - 1) + "…" : s; }

function Header() {
  return (
    <div className="flex items-center gap-2 mb-4">
      <Megaphone className="size-4 text-accent" />
      <h2 className="text-sm font-display font-semibold">Financial Marketing Intelligence</h2>
      <span className="text-[10px] font-mono uppercase tracking-widest text-muted-foreground">· profit-driven marketing</span>
    </div>
  );
}

function SubHead({ icon, title, sub }: { icon: React.ReactNode; title: string; sub?: string }) {
  return (
    <div className="flex items-center gap-2 mb-3">
      {icon}
      <h3 className="text-sm font-medium">{title}</h3>
      {sub && <span className="text-[10px] font-mono uppercase tracking-widest text-muted-foreground">· {sub}</span>}
    </div>
  );
}

function Kpi({ label, value, accent, danger, small }: { label: string; value: string; accent?: boolean; danger?: boolean; small?: boolean }) {
  return (
    <div className="rounded-2xl glass p-3.5">
      <p className="text-[10px] font-mono uppercase tracking-widest text-muted-foreground mb-1">{label}</p>
      <p className={`font-display ${small ? "text-sm" : "text-lg"} truncate ${danger ? "text-destructive" : accent ? "text-emerald-400" : ""}`}>{value}</p>
    </div>
  );
}

function Card({ icon, title, children }: { icon: React.ReactNode; title: string; children: React.ReactNode }) {
  return (
    <div className="rounded-2xl glass p-4">
      <div className="flex items-center gap-2 mb-3">{icon}<h4 className="text-sm font-medium">{title}</h4></div>
      <div className="space-y-1">{children}</div>
    </div>
  );
}

function ListRow({ label, value, tone }: { label: string; value: string; tone?: string }) {
  return (
    <div className="flex items-center justify-between gap-2 py-1 border-b border-white/[0.04] last:border-0">
      <span className="text-[11px] text-muted-foreground truncate">{label}</span>
      <span className={`text-[11px] font-mono tabular-nums shrink-0 ${tone ?? ""}`}>{value}</span>
    </div>
  );
}

function ActBtn({ children, onClick, busy, primary, icon }: { children: React.ReactNode; onClick: () => void; busy?: boolean; primary?: boolean; icon?: React.ReactNode }) {
  return (
    <button disabled={busy} onClick={onClick} className={`inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-[10px] uppercase tracking-widest font-mono disabled:opacity-50 ${primary ? "bg-accent/15 text-accent border border-accent/30 hover:bg-accent/25" : "border border-border hover:bg-white/5"}`}>
      {busy ? <Loader2 className="size-3 animate-spin" /> : icon}{children}
    </button>
  );
}

function IconBtn({ children, onClick, busy, title }: { children: React.ReactNode; onClick: () => void; busy?: boolean; title: string }) {
  return (
    <button disabled={busy} title={title} onClick={onClick} className="size-6 grid place-items-center rounded-lg border border-border hover:bg-white/5 disabled:opacity-50">
      {busy ? <Loader2 className="size-3 animate-spin" /> : children}
    </button>
  );
}
