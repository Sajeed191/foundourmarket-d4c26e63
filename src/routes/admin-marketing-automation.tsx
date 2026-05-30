import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import {
  Megaphone, Zap, Rocket, Loader2, RefreshCw, Plus, Play, Pause, CheckCircle2,
  Trash2, Calendar, Users, TrendingUp, DollarSign, Target, MousePointerClick,
  MailOpen, Percent, Globe, Sparkles, Lightbulb, AlertTriangle, X, Crown,
  Boxes, Package, ChevronRight,
} from "lucide-react";
import { AdminShell, logActivity } from "@/components/admin/AdminShell";
import { KpiCard } from "@/components/admin/KpiCard";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import {
  fetchMarketingIntel, computeKpis, buildAudiences, buildMarketingRecommendations,
  detectMarketingAlerts, topCampaigns, upcomingCampaigns, campaignRates,
  CAMPAIGN_TEMPLATES, TEMPLATE_BY_KEY, createCampaign, launchCampaign, pauseCampaign,
  completeCampaign, deleteCampaign, createAutomation, toggleAutomation, deleteAutomation,
  fmtCurrency, fmtNum, pct, STATUS_COLOR,
  type MarketingIntel, type Campaign, type RegionScope, type AudienceRow,
} from "@/lib/marketing-automation";

export const Route = createFileRoute("/admin-marketing-automation")({
  head: () => ({ meta: [{ title: "Marketing Automation — Admin" }] }),
  validateSearch: (s: Record<string, unknown>) => ({
    action: typeof s.action === "string" ? s.action : undefined,
    template: typeof s.template === "string" ? s.template : undefined,
    tab: typeof s.tab === "string" ? s.tab : undefined,
    campaign: typeof s.campaign === "string" ? s.campaign : undefined,
  }),
  component: MarketingAutomationPage,
});

type Tab = "dashboard" | "campaigns" | "automations" | "recommendations";

const REGION_LABEL: Record<RegionScope, string> = { all: "All regions", india: "India", international: "International" };
const MKT_ROLES = ["admin", "super_admin", "manager", "editor"] as unknown as Parameters<typeof AdminShell>[0]["allow"];

function MarketingAutomationPage() {
  const nav = useNavigate();
  const { action, template, tab: tabParam, campaign: campaignParam } = Route.useSearch();
  const [intel, setIntel] = useState<MarketingIntel | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [tab, setTab] = useState<Tab>("dashboard");
  const [creating, setCreating] = useState<null | { templateKey?: string }>(null);
  const [region, setRegion] = useState<RegionScope>("all");

  async function load() {
    const data = await fetchMarketingIntel();
    setIntel(data);
    setLoading(false);
    setRefreshing(false);
  }

  useEffect(() => {
    load();
    logActivity("marketing_automation_dashboard_open", "marketing", undefined, {});
    const ch = supabase.channel("mkt-auto-rt")
      .on("postgres_changes", { event: "*", schema: "public", table: "marketing_campaigns" }, () => load())
      .on("postgres_changes", { event: "*", schema: "public", table: "marketing_automations" }, () => load())
      .subscribe();
    return () => { supabase.removeChannel(ch); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // deep-link actions from command center
  useEffect(() => {
    if (loading) return;
    if (action === "create") setCreating({ templateKey: template });
    else if (template) { setCreating({ templateKey: template }); }
    if (action === "analytics") setTab("dashboard");
    const tabs: Tab[] = ["dashboard", "campaigns", "automations", "recommendations"];
    if (tabParam && (tabs as string[]).includes(tabParam)) setTab(tabParam as Tab);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [action, template, tabParam, loading]);

  const filteredCampaigns = useMemo(() => {
    if (!intel) return [];
    return region === "all" ? intel.campaigns : intel.campaigns.filter((c) => c.region === region || c.region === "all");
  }, [intel, region]);

  const kpis = useMemo(() => intel ? computeKpis({ ...intel, campaigns: filteredCampaigns }) : null, [intel, filteredCampaigns]);
  const audiences = useMemo(() => intel ? buildAudiences(intel.customers) : [], [intel]);
  const recs = useMemo(() => intel ? buildMarketingRecommendations(intel) : [], [intel]);
  const alerts = useMemo(() => intel ? detectMarketingAlerts(intel) : [], [intel]);
  const tops = useMemo(() => topCampaigns(filteredCampaigns), [filteredCampaigns]);
  const upcoming = useMemo(() => upcomingCampaigns(filteredCampaigns), [filteredCampaigns]);

  async function refresh() { setRefreshing(true); await load(); }

  if (loading || !intel || !kpis) {
    return (
      <AdminShell title="Marketing Automation" subtitle="Loading…" allow={MKT_ROLES}>
        <div className="grid place-items-center py-32 text-muted-foreground">
          <Loader2 className="size-6 animate-spin" />
        </div>
      </AdminShell>
    );
  }

  return (
    <AdminShell title="Marketing Automation" subtitle="Data-driven campaigns" allow={MKT_ROLES}>
      <div className="space-y-6">
        {/* header */}
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h1 className="text-xl sm:text-2xl font-display font-semibold flex items-center gap-2">
              <Megaphone className="size-5 text-accent" /> Marketing Automation
            </h1>
            <p className="text-xs text-muted-foreground mt-1">Data-driven campaigns powered by Customer, Inventory &amp; Financial intelligence.</p>
          </div>
          <div className="flex items-center gap-2">
            <select value={region} onChange={(e) => setRegion(e.target.value as RegionScope)}
              className="h-9 rounded-xl bg-card border border-border px-3 text-xs">
              {(["all", "india", "international"] as RegionScope[]).map((r) => <option key={r} value={r}>{REGION_LABEL[r]}</option>)}
            </select>
            <button onClick={refresh} className="h-9 px-3 rounded-xl bg-card border border-border text-xs inline-flex items-center gap-2 hover:border-accent/40">
              <RefreshCw className={`size-3.5 ${refreshing ? "animate-spin" : ""}`} /> Refresh
            </button>
            <button onClick={() => setCreating({})} className="h-9 px-3 rounded-xl bg-accent text-accent-foreground text-xs font-medium inline-flex items-center gap-2">
              <Plus className="size-3.5" /> New campaign
            </button>
          </div>
        </div>

        {/* tabs */}
        <div className="flex gap-1 overflow-x-auto pb-1">
          {([["dashboard", "Dashboard"], ["campaigns", "Campaigns"], ["automations", "Automations"], ["recommendations", "AI Recommendations"]] as [Tab, string][]).map(([k, l]) => (
            <button key={k} onClick={() => setTab(k)}
              className={`h-8 px-3.5 rounded-full text-xs whitespace-nowrap transition-colors ${tab === k ? "bg-accent text-accent-foreground" : "bg-card border border-border text-muted-foreground hover:text-foreground"}`}>
              {l}{k === "recommendations" && recs.length ? ` (${recs.length})` : ""}
            </button>
          ))}
        </div>

        {tab === "dashboard" && (
          <DashboardTab kpis={kpis} alerts={alerts} tops={tops} upcoming={upcoming} audiences={audiences} region={region} onSelectTemplate={(k) => setCreating({ templateKey: k })} />
        )}
        {tab === "campaigns" && (
          <CampaignsTab campaigns={filteredCampaigns} onChanged={load} />
        )}
        {tab === "automations" && (
          <AutomationsTab intel={intel} onChanged={load} />
        )}
        {tab === "recommendations" && (
          <RecommendationsTab recs={recs} onAct={(k) => setCreating({ templateKey: k })} navCustomers={() => nav({ to: "/admin-customer-intelligence" })} navInventory={() => nav({ to: "/admin-inventory-intelligence" })} />
        )}
      </div>

      {creating && (
        <CreateCampaignSheet
          templateKey={creating.templateKey}
          audiences={audiences}
          defaultRegion={region}
          onClose={() => setCreating(null)}
          onCreated={() => { setCreating(null); setTab("campaigns"); load(); }}
        />
      )}
    </AdminShell>
  );
}

/* ----------------------------------------------------------- dashboard */

function DashboardTab({ kpis, alerts, tops, upcoming, audiences, region, onSelectTemplate }: {
  kpis: ReturnType<typeof computeKpis>;
  alerts: ReturnType<typeof detectMarketingAlerts>;
  tops: Campaign[];
  upcoming: Campaign[];
  audiences: AudienceRow[];
  region: RegionScope;
  onSelectTemplate: (k: string) => void;
}) {
  return (
    <div className="space-y-6">
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        <KpiCard label="Active automations" value={fmtNum(kpis.activeAutomations)} icon={<Zap className="size-4" />} />
        <KpiCard label="Scheduled" value={fmtNum(kpis.scheduledCampaigns)} icon={<Calendar className="size-4" />} />
        <KpiCard label="Campaign revenue" value={fmtCurrency(kpis.revenue, region)} icon={<DollarSign className="size-4" />} />
        <KpiCard label="Campaign profit" value={fmtCurrency(kpis.profit, region)} icon={<TrendingUp className="size-4" />} />
        <KpiCard label="Customer reach" value={fmtNum(kpis.reach)} icon={<Users className="size-4" />} />
        <KpiCard label="Open rate" value={pct(kpis.openRate)} icon={<MailOpen className="size-4" />} />
        <KpiCard label="Click rate" value={pct(kpis.clickRate)} icon={<MousePointerClick className="size-4" />} />
        <KpiCard label="Conversion" value={pct(kpis.conversionRate)} icon={<Target className="size-4" />} />
        <KpiCard label="ROI" value={`${kpis.roi.toFixed(2)}×`} icon={<Percent className="size-4" />} />
      </div>

      {/* alerts */}
      {alerts.length > 0 && (
        <section className="card-premium rounded-2xl p-5">
          <h2 className="text-sm font-medium flex items-center gap-2 mb-3"><AlertTriangle className="size-4 text-amber-400" /> Campaign alerts</h2>
          <div className="space-y-2">
            {alerts.slice(0, 8).map((a) => (
              <div key={a.id} className="flex items-start gap-3 rounded-xl bg-card/60 border border-border px-3 py-2">
                <span className={`mt-0.5 size-2 rounded-full ${a.severity === "high" ? "bg-destructive" : a.severity === "medium" ? "bg-amber-400" : "bg-emerald-400"}`} />
                <div className="min-w-0">
                  <p className="text-xs font-medium">{a.title}</p>
                  <p className="text-[11px] text-muted-foreground">{a.detail}</p>
                </div>
              </div>
            ))}
          </div>
        </section>
      )}

      <div className="grid lg:grid-cols-2 gap-4">
        {/* top campaigns */}
        <section className="card-premium rounded-2xl p-5">
          <h2 className="text-sm font-medium flex items-center gap-2 mb-3"><TrendingUp className="size-4 text-accent" /> Top campaigns</h2>
          {tops.length === 0 ? <Empty text="No campaign revenue yet." /> : (
            <div className="space-y-2">
              {tops.map((c) => {
                const r = campaignRates(c);
                return (
                  <div key={c.id} className="flex items-center justify-between gap-3 rounded-xl bg-card/60 border border-border px-3 py-2">
                    <div className="min-w-0">
                      <p className="text-xs font-medium truncate">{c.name}</p>
                      <p className="text-[11px] text-muted-foreground">{fmtCurrency(c.metrics.revenue, c.region)} · ROI {r.roi.toFixed(1)}×</p>
                    </div>
                    <span className={`text-[10px] px-2 py-0.5 rounded-full ring-1 ring-inset ${STATUS_COLOR[c.status]}`}>{c.status}</span>
                  </div>
                );
              })}
            </div>
          )}
        </section>

        {/* upcoming */}
        <section className="card-premium rounded-2xl p-5">
          <h2 className="text-sm font-medium flex items-center gap-2 mb-3"><Calendar className="size-4 text-sky-400" /> Upcoming campaigns</h2>
          {upcoming.length === 0 ? <Empty text="Nothing scheduled." /> : (
            <div className="space-y-2">
              {upcoming.map((c) => (
                <div key={c.id} className="flex items-center justify-between gap-3 rounded-xl bg-card/60 border border-border px-3 py-2">
                  <div className="min-w-0">
                    <p className="text-xs font-medium truncate">{c.name}</p>
                    <p className="text-[11px] text-muted-foreground">{new Date(c.scheduled_at!).toLocaleString()}</p>
                  </div>
                  <span className="text-[10px] text-muted-foreground">{REGION_LABEL[c.region]}</span>
                </div>
              ))}
            </div>
          )}
        </section>
      </div>

      {/* audiences */}
      <section className="card-premium rounded-2xl p-5">
        <h2 className="text-sm font-medium flex items-center gap-2 mb-3"><Users className="size-4 text-accent" /> Customer audiences <span className="text-[10px] text-muted-foreground">(live)</span></h2>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          {audiences.map((a) => (
            <button key={a.key} onClick={() => onSelectTemplate(audienceTemplate(a.key))}
              className="text-left rounded-xl bg-card/60 border border-border p-3 hover:border-accent/40 transition-colors">
              <p className="text-[10px] uppercase tracking-wider text-muted-foreground">{a.label}</p>
              <p className="text-lg font-display font-semibold tabular-nums mt-1">{fmtNum(a.count)}</p>
              <p className="text-[11px] text-muted-foreground">{fmtCurrency(a.revenue)} LTV</p>
            </button>
          ))}
        </div>
      </section>

      {/* quick templates */}
      <section className="card-premium rounded-2xl p-5">
        <h2 className="text-sm font-medium flex items-center gap-2 mb-3"><Sparkles className="size-4 text-accent" /> Launch a campaign</h2>
        <div className="flex flex-wrap gap-2">
          {CAMPAIGN_TEMPLATES.slice(0, 14).map((t) => (
            <button key={t.key} onClick={() => onSelectTemplate(t.key)}
              className="h-8 px-3 rounded-full bg-card border border-border text-xs hover:border-accent/40">{t.label}</button>
          ))}
        </div>
      </section>
    </div>
  );
}

function audienceTemplate(key: string): string {
  const map: Record<string, string> = {
    vip: "vip_rewards", loyal: "loyal_thanks", at_risk: "at_risk_save",
    dormant: "dormant_revive", new: "new_welcome", refund_heavy: "refund_heavy",
    support_heavy: "support_heavy", high_value: "high_value",
  };
  return map[key] ?? "winback";
}

/* ----------------------------------------------------------- campaigns */

function CampaignsTab({ campaigns, onChanged }: { campaigns: Campaign[]; onChanged: () => void }) {
  const [busy, setBusy] = useState<string | null>(null);
  async function act(id: string, fn: () => Promise<{ error?: string }>, label: string) {
    setBusy(id);
    const { error } = await fn();
    setBusy(null);
    if (error) toast.error(error); else { toast.success(label); onChanged(); }
  }
  if (campaigns.length === 0) return <Empty text="No campaigns yet — create one from a template." />;
  return (
    <div className="space-y-3">
      {campaigns.map((c) => {
        const r = campaignRates(c);
        return (
          <div key={c.id} className="card-premium rounded-2xl p-4">
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div className="min-w-0">
                <div className="flex items-center gap-2">
                  <p className="text-sm font-medium truncate">{c.name}</p>
                  <span className={`text-[10px] px-2 py-0.5 rounded-full ring-1 ring-inset ${STATUS_COLOR[c.status]}`}>{c.status}</span>
                  <span className="text-[10px] text-muted-foreground inline-flex items-center gap-1"><Globe className="size-3" />{REGION_LABEL[c.region]}</span>
                </div>
                <p className="text-[11px] text-muted-foreground mt-0.5">{TEMPLATE_BY_KEY[c.campaign_type]?.label ?? c.campaign_type}{c.segment ? ` · ${c.segment}` : ""} · {fmtNum(c.audience_size)} reach target</p>
              </div>
              <div className="flex items-center gap-1.5">
                {(c.status === "draft" || c.status === "scheduled" || c.status === "paused") && (
                  <IconBtn busy={busy === c.id} onClick={() => act(c.id, () => launchCampaign(c.id), "Campaign launched")} title="Launch"><Play className="size-3.5" /></IconBtn>
                )}
                {c.status === "active" && (
                  <>
                    <IconBtn busy={busy === c.id} onClick={() => act(c.id, () => pauseCampaign(c.id), "Campaign paused")} title="Pause"><Pause className="size-3.5" /></IconBtn>
                    <IconBtn busy={busy === c.id} onClick={() => act(c.id, () => completeCampaign(c.id), "Campaign completed")} title="Complete"><CheckCircle2 className="size-3.5" /></IconBtn>
                  </>
                )}
                <IconBtn busy={busy === c.id} onClick={() => act(c.id, () => deleteCampaign(c.id), "Campaign deleted")} title="Delete" danger><Trash2 className="size-3.5" /></IconBtn>
              </div>
            </div>
            <div className="grid grid-cols-3 sm:grid-cols-6 gap-2 mt-3">
              <Metric label="Revenue" value={fmtCurrency(c.metrics.revenue, c.region)} />
              <Metric label="Profit" value={fmtCurrency(c.metrics.profit, c.region)} />
              <Metric label="Orders" value={fmtNum(c.metrics.orders)} />
              <Metric label="Open" value={pct(r.openRate)} />
              <Metric label="Click" value={pct(r.clickRate)} />
              <Metric label="ROI" value={`${r.roi.toFixed(1)}×`} />
            </div>
          </div>
        );
      })}
    </div>
  );
}

/* --------------------------------------------------------- automations */

function AutomationsTab({ intel, onChanged }: { intel: MarketingIntel; onChanged: () => void }) {
  const [busy, setBusy] = useState<string | null>(null);
  const [adding, setAdding] = useState(false);
  async function act(id: string, fn: () => Promise<{ error?: string }>, label: string) {
    setBusy(id);
    const { error } = await fn();
    setBusy(null);
    if (error) toast.error(error); else { toast.success(label); onChanged(); }
  }
  return (
    <div className="space-y-4">
      <div className="flex justify-between items-center">
        <p className="text-xs text-muted-foreground">{intel.automations.length} automation rule(s)</p>
        <button onClick={() => setAdding(true)} className="h-8 px-3 rounded-xl bg-accent text-accent-foreground text-xs inline-flex items-center gap-2"><Plus className="size-3.5" /> New rule</button>
      </div>
      {intel.automations.length === 0 ? <Empty text="No automation rules yet." /> : (
        <div className="space-y-2">
          {intel.automations.map((a) => (
            <div key={a.id} className="card-premium rounded-2xl p-4 flex flex-wrap items-center justify-between gap-3">
              <div className="min-w-0">
                <div className="flex items-center gap-2">
                  <p className="text-sm font-medium truncate">{a.name}</p>
                  <span className="text-[10px] px-2 py-0.5 rounded-full ring-1 ring-inset bg-card text-muted-foreground">{a.automation_type}</span>
                  <span className={`text-[10px] px-2 py-0.5 rounded-full ring-1 ring-inset ${a.enabled ? STATUS_COLOR.active : STATUS_COLOR.paused}`}>{a.enabled ? "active" : "paused"}</span>
                </div>
                <p className="text-[11px] text-muted-foreground mt-0.5">{a.description || `${a.trigger_key} → ${a.channel}`} · {REGION_LABEL[a.region]} · priority {a.priority}</p>
              </div>
              <div className="flex items-center gap-1.5">
                <IconBtn busy={busy === a.id} onClick={() => act(a.id, () => toggleAutomation(a.id, !a.enabled), a.enabled ? "Paused" : "Resumed")} title={a.enabled ? "Pause" : "Resume"}>
                  {a.enabled ? <Pause className="size-3.5" /> : <Play className="size-3.5" />}
                </IconBtn>
                <IconBtn busy={busy === a.id} onClick={() => act(a.id, () => deleteAutomation(a.id), "Rule deleted")} title="Delete" danger><Trash2 className="size-3.5" /></IconBtn>
              </div>
            </div>
          ))}
        </div>
      )}
      {adding && <CreateAutomationSheet onClose={() => setAdding(false)} onCreated={() => { setAdding(false); onChanged(); }} />}
    </div>
  );
}

/* ----------------------------------------------------- recommendations */

function RecommendationsTab({ recs, onAct, navCustomers, navInventory }: {
  recs: ReturnType<typeof buildMarketingRecommendations>;
  onAct: (k: string) => void;
  navCustomers: () => void;
  navInventory: () => void;
}) {
  const ICON: Record<string, React.ReactNode> = {
    target: <Crown className="size-4 text-amber-400" />,
    promote: <TrendingUp className="size-4 text-emerald-400" />,
    discount: <Boxes className="size-4 text-sky-400" />,
    feature: <Package className="size-4 text-violet-400" />,
    reengage: <Users className="size-4 text-accent" />,
    timing: <Calendar className="size-4 text-muted-foreground" />,
  };
  if (recs.length === 0) return <Empty text="No recommendations — not enough data yet." />;
  return (
    <div className="space-y-3">
      <div className="flex gap-2">
        <button onClick={navCustomers} className="text-[11px] inline-flex items-center gap-1 text-accent hover:underline">Customer Intelligence <ChevronRight className="size-3" /></button>
        <button onClick={navInventory} className="text-[11px] inline-flex items-center gap-1 text-accent hover:underline">Inventory Intelligence <ChevronRight className="size-3" /></button>
      </div>
      {recs.map((r) => (
        <div key={r.id} className="card-premium rounded-2xl p-4 flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-start gap-3 min-w-0">
            <span className="mt-0.5">{ICON[r.kind] ?? <Lightbulb className="size-4 text-accent" />}</span>
            <div className="min-w-0">
              <p className="text-sm font-medium">{r.title}</p>
              <p className="text-[11px] text-muted-foreground">{r.reason}</p>
            </div>
          </div>
          {r.templateKey && (
            <button onClick={() => onAct(r.templateKey!)} className="h-8 px-3 rounded-xl bg-accent text-accent-foreground text-xs inline-flex items-center gap-2 shrink-0">
              <Rocket className="size-3.5" /> Create
            </button>
          )}
        </div>
      ))}
    </div>
  );
}

/* --------------------------------------------------------------- sheets */

function CreateCampaignSheet({ templateKey, audiences, defaultRegion, onClose, onCreated }: {
  templateKey?: string;
  audiences: AudienceRow[];
  defaultRegion: RegionScope;
  onClose: () => void;
  onCreated: () => void;
}) {
  const tpl = templateKey ? TEMPLATE_BY_KEY[templateKey] : undefined;
  const [key, setKey] = useState(templateKey ?? CAMPAIGN_TEMPLATES[0].key);
  const t = TEMPLATE_BY_KEY[key];
  const aud = audiences.find((a) => audienceTemplate(a.key) === key);
  const [name, setName] = useState(tpl ? `${tpl.label} — ${new Date().toLocaleDateString()}` : "");
  const [region, setRegion] = useState<RegionScope>(defaultRegion);
  const [schedule, setSchedule] = useState("");
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    setName(`${TEMPLATE_BY_KEY[key].label} — ${new Date().toLocaleDateString()}`);
  }, [key]);

  async function submit() {
    if (!name.trim()) { toast.error("Name required"); return; }
    setBusy(true);
    const { error } = await createCampaign({
      name: name.trim(),
      campaign_type: key,
      region,
      segment: t.segment ?? null,
      audience_size: aud?.count ?? 0,
      scheduled_at: schedule ? new Date(schedule).toISOString() : null,
      status: schedule ? "scheduled" : "draft",
      config: { template: key, channel: t.channel },
    });
    setBusy(false);
    if (error) toast.error(error); else { toast.success("Campaign created"); onCreated(); }
  }

  return (
    <Overlay onClose={onClose} title="New campaign">
      <div className="space-y-4">
        <Field label="Template">
          <select value={key} onChange={(e) => setKey(e.target.value)} className="w-full h-10 rounded-xl bg-card border border-border px-3 text-sm">
            {CAMPAIGN_TEMPLATES.map((ct) => <option key={ct.key} value={ct.key}>{ct.label}</option>)}
          </select>
          <p className="text-[11px] text-muted-foreground mt-1">{t.description}</p>
        </Field>
        <Field label="Campaign name">
          <input value={name} onChange={(e) => setName(e.target.value)} className="w-full h-10 rounded-xl bg-card border border-border px-3 text-sm" />
        </Field>
        <div className="grid grid-cols-2 gap-3">
          <Field label="Region">
            <select value={region} onChange={(e) => setRegion(e.target.value as RegionScope)} className="w-full h-10 rounded-xl bg-card border border-border px-3 text-sm">
              {(["all", "india", "international"] as RegionScope[]).map((r) => <option key={r} value={r}>{REGION_LABEL[r]}</option>)}
            </select>
          </Field>
          <Field label="Schedule (optional)">
            <input type="datetime-local" value={schedule} onChange={(e) => setSchedule(e.target.value)} className="w-full h-10 rounded-xl bg-card border border-border px-3 text-sm" />
          </Field>
        </div>
        {aud && (
          <div className="rounded-xl bg-accent/10 border border-accent/30 px-3 py-2 text-xs">
            Targets <strong>{fmtNum(aud.count)}</strong> {aud.label.toLowerCase()} · {fmtCurrency(aud.revenue)} combined LTV
          </div>
        )}
        <button disabled={busy} onClick={submit} className="w-full h-10 rounded-xl bg-accent text-accent-foreground text-sm font-medium inline-flex items-center justify-center gap-2 disabled:opacity-60">
          {busy ? <Loader2 className="size-4 animate-spin" /> : <Rocket className="size-4" />} Create campaign
        </button>
      </div>
    </Overlay>
  );
}

function CreateAutomationSheet({ onClose, onCreated }: { onClose: () => void; onCreated: () => void }) {
  const [name, setName] = useState("");
  const [key, setKey] = useState(CAMPAIGN_TEMPLATES[0].key);
  const t = TEMPLATE_BY_KEY[key];
  const [region, setRegion] = useState<RegionScope>("all");
  const [priority, setPriority] = useState(0);
  const [busy, setBusy] = useState(false);

  async function submit() {
    if (!name.trim()) { toast.error("Name required"); return; }
    setBusy(true);
    const { error } = await createAutomation({
      name: name.trim(),
      automation_type: t.automationType,
      trigger_key: t.trigger,
      channel: t.channel,
      region,
      priority,
      action_config: { template: key },
      status: "active",
      enabled: true,
    });
    setBusy(false);
    if (error) toast.error(error); else { toast.success("Automation created"); onCreated(); }
  }

  return (
    <Overlay onClose={onClose} title="New automation rule">
      <div className="space-y-4">
        <Field label="Rule name">
          <input value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g. Auto VIP rewards" className="w-full h-10 rounded-xl bg-card border border-border px-3 text-sm" />
        </Field>
        <Field label="Trigger / template">
          <select value={key} onChange={(e) => setKey(e.target.value)} className="w-full h-10 rounded-xl bg-card border border-border px-3 text-sm">
            {CAMPAIGN_TEMPLATES.map((ct) => <option key={ct.key} value={ct.key}>{ct.label} ({ct.group})</option>)}
          </select>
          <p className="text-[11px] text-muted-foreground mt-1">{t.description}</p>
        </Field>
        <div className="grid grid-cols-2 gap-3">
          <Field label="Region">
            <select value={region} onChange={(e) => setRegion(e.target.value as RegionScope)} className="w-full h-10 rounded-xl bg-card border border-border px-3 text-sm">
              {(["all", "india", "international"] as RegionScope[]).map((r) => <option key={r} value={r}>{REGION_LABEL[r]}</option>)}
            </select>
          </Field>
          <Field label="Priority">
            <input type="number" value={priority} onChange={(e) => setPriority(Number(e.target.value))} className="w-full h-10 rounded-xl bg-card border border-border px-3 text-sm" />
          </Field>
        </div>
        <button disabled={busy} onClick={submit} className="w-full h-10 rounded-xl bg-accent text-accent-foreground text-sm font-medium inline-flex items-center justify-center gap-2 disabled:opacity-60">
          {busy ? <Loader2 className="size-4 animate-spin" /> : <Zap className="size-4" />} Create rule
        </button>
      </div>
    </Overlay>
  );
}

/* ----------------------------------------------------------- primitives */

function Overlay({ title, children, onClose }: { title: string; children: React.ReactNode; onClose: () => void }) {
  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/60 backdrop-blur-sm p-0 sm:p-4" onClick={onClose}>
      <div className="w-full sm:max-w-md bg-card border border-border rounded-t-3xl sm:rounded-2xl p-5 max-h-[90vh] overflow-y-auto" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between mb-4">
          <h3 className="text-sm font-medium">{title}</h3>
          <button onClick={onClose} className="text-muted-foreground hover:text-foreground"><X className="size-4" /></button>
        </div>
        {children}
      </div>
    </div>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <label className="text-[10px] uppercase tracking-wider text-muted-foreground">{label}</label>
      <div className="mt-1">{children}</div>
    </div>
  );
}

function Metric({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-lg bg-card/60 border border-border px-2 py-1.5">
      <p className="text-[9px] uppercase tracking-wider text-muted-foreground">{label}</p>
      <p className="text-xs font-medium tabular-nums mt-0.5">{value}</p>
    </div>
  );
}

function IconBtn({ children, onClick, title, busy, danger }: { children: React.ReactNode; onClick: () => void; title: string; busy?: boolean; danger?: boolean }) {
  return (
    <button title={title} disabled={busy} onClick={onClick}
      className={`size-8 grid place-items-center rounded-lg border border-border bg-card disabled:opacity-50 ${danger ? "hover:border-destructive/50 hover:text-destructive" : "hover:border-accent/40"}`}>
      {busy ? <Loader2 className="size-3.5 animate-spin" /> : children}
    </button>
  );
}

function Empty({ text }: { text: string }) {
  return <div className="rounded-xl border border-dashed border-border py-10 text-center text-xs text-muted-foreground">{text}</div>;
}
