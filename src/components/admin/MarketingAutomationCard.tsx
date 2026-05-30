import { useEffect, useState } from "react";
import { Link } from "@tanstack/react-router";
import { motion } from "framer-motion";
import {
  Megaphone, Rocket, Plus, BarChart3, Activity, AlertTriangle, TrendingUp, Loader2,
} from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import {
  fetchMarketingIntel, computeKpis, detectMarketingAlerts, upcomingCampaigns,
  fmtCurrency, fmtNum, pct, type MarketingIntel, type DashboardKpis,
} from "@/lib/marketing-automation";

/**
 * Dashboard summary card for the Marketing Automation engine. Realtime via the
 * existing marketing_campaigns / marketing_automations tables. Pure read layer —
 * every linked destination is itself RLS + role protected.
 */
export function MarketingAutomationCard() {
  const [intel, setIntel] = useState<MarketingIntel | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let alive = true;
    const load = async () => {
      const data = await fetchMarketingIntel();
      if (!alive) return;
      setIntel(data);
      setLoading(false);
    };
    load();
    const ch = supabase
      .channel("mkt-card-rt")
      .on("postgres_changes", { event: "*", schema: "public", table: "marketing_campaigns" }, load)
      .on("postgres_changes", { event: "*", schema: "public", table: "marketing_automations" }, load)
      .subscribe();
    return () => { alive = false; supabase.removeChannel(ch); };
  }, []);

  const kpis: DashboardKpis | null = intel ? computeKpis(intel) : null;
  const alerts = intel ? detectMarketingAlerts(intel) : [];
  const upcoming = intel ? upcomingCampaigns(intel.campaigns, 3) : [];
  const activeCampaigns = intel ? intel.campaigns.filter((c) => c.status === "active").length : 0;
  const automations = intel?.automations ?? [];
  const activeAutomations = automations.filter((a) => a.enabled && a.status === "active").length;
  const healthPct = automations.length ? activeAutomations / automations.length : 0;

  return (
    <motion.div
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.4, ease: [0.16, 1, 0.3, 1] }}
      className="card-premium rounded-2xl p-5"
    >
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-2">
          <span className="grid place-items-center size-9 rounded-xl bg-accent/10 text-accent">
            <Megaphone className="size-4" />
          </span>
          <div>
            <h2 className="text-sm font-medium">Marketing Automation</h2>
            <p className="text-[10px] font-mono uppercase tracking-widest text-muted-foreground">
              Campaigns · ROI · Automation health
            </p>
          </div>
        </div>
        <Link to="/admin-marketing-automation" className="text-[10px] font-mono uppercase tracking-widest text-accent hover:underline">
          Open →
        </Link>
      </div>

      {loading || !kpis ? (
        <div className="h-28 grid place-items-center text-muted-foreground">
          <Loader2 className="size-4 animate-spin" />
        </div>
      ) : (
        <>
          <div className="grid grid-cols-2 sm:grid-cols-3 gap-2.5 mb-4">
            <Stat icon={<Rocket className="size-3.5" />} label="Active campaigns" value={fmtNum(activeCampaigns)} />
            <Stat icon={<TrendingUp className="size-3.5" />} label="Revenue" value={fmtCurrency(kpis.revenue)} />
            <Stat icon={<BarChart3 className="size-3.5" />} label="ROI" value={`${(kpis.roi * 100).toFixed(0)}%`} />
            <Stat icon={<Activity className="size-3.5" />} label="Conversion" value={pct(kpis.conversionRate)} />
            <Stat icon={<Megaphone className="size-3.5" />} label="Automations" value={fmtNum(activeAutomations)} />
            <Stat icon={<Activity className="size-3.5" />} label="Health" value={`${(healthPct * 100).toFixed(0)}%`} />
          </div>

          {(alerts.length > 0 || upcoming.length > 0) && (
            <div className="space-y-1.5 mb-4">
              {alerts.slice(0, 2).map((a) => (
                <div key={a.id} className="flex items-center gap-2 rounded-xl border border-amber-400/20 bg-amber-400/5 px-3 py-2">
                  <AlertTriangle className="size-3.5 text-amber-400 shrink-0" />
                  <span className="text-[11px] text-foreground/90 truncate">{a.title}</span>
                </div>
              ))}
              {upcoming.slice(0, 1).map((c) => (
                <div key={c.id} className="flex items-center gap-2 rounded-xl border border-white/5 bg-white/[0.02] px-3 py-2">
                  <Rocket className="size-3.5 text-accent shrink-0" />
                  <span className="text-[11px] text-muted-foreground truncate">Upcoming · {c.name}</span>
                </div>
              ))}
            </div>
          )}

          <div className="grid grid-cols-3 gap-2">
            <Quick to="/admin-marketing-automation?action=create" icon={<Plus className="size-3.5" />} label="Launch" />
            <Quick to="/admin-marketing-automation?tab=automations" icon={<Activity className="size-3.5" />} label="Automate" />
            <Quick to="/admin-marketing-automation?action=analytics" icon={<BarChart3 className="size-3.5" />} label="Analytics" />
          </div>
        </>
      )}
    </motion.div>
  );
}

function Stat({ icon, label, value }: { icon: React.ReactNode; label: string; value: string }) {
  return (
    <div className="rounded-xl border border-white/5 bg-white/[0.02] px-3 py-2.5">
      <span className="flex items-center gap-1 text-muted-foreground mb-1">
        <span className="text-accent">{icon}</span>
        <span className="text-[9px] font-mono uppercase tracking-widest truncate">{label}</span>
      </span>
      <p className="text-base font-display font-semibold tabular-nums truncate">{value}</p>
    </div>
  );
}

function Quick({ to, icon, label }: { to: string; icon: React.ReactNode; label: string }) {
  const [pathname, qs] = to.split("?");
  const search = qs ? Object.fromEntries(new URLSearchParams(qs)) : undefined;
  return (
    <Link
      to={pathname as never}
      search={search as never}
      className="group flex flex-col items-center gap-1 rounded-xl border border-white/5 bg-white/[0.02] px-1.5 py-2.5 text-center transition-all hover:border-accent/40 hover:bg-accent/10"
    >
      <span className="text-muted-foreground transition-colors group-hover:text-accent">{icon}</span>
      <span className="text-[9px] font-medium text-muted-foreground group-hover:text-foreground">{label}</span>
    </Link>
  );
}
