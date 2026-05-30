import { useEffect, useMemo, useState } from "react";
import { Link } from "@tanstack/react-router";
import { motion } from "framer-motion";
import { Users, Crown, AlertTriangle, Moon, Gem, Rocket, Megaphone, Loader2 } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import {
  fetchCustomerIntel, buildCustomerIntel, type CustomerIntel,
} from "@/lib/customer-intelligence";
import {
  buildCustomerAudiences, buildCustomerMarketingAnalytics, fetchCustomerCampaigns,
  fmtC, type Campaign,
} from "@/lib/customer-marketing";

/**
 * Dashboard summary card for the Customer ↔ Marketing Integration. All numbers
 * are derived from real CustomerIntel (orders / refunds / support / reviews)
 * and real marketing_campaigns. Realtime via orders / profiles / campaigns.
 */
export function CustomerMarketingCard() {
  const [rows, setRows] = useState<CustomerIntel[] | null>(null);
  const [campaigns, setCampaigns] = useState<Campaign[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let alive = true;
    const load = async () => {
      const [data, camps] = await Promise.all([fetchCustomerIntel(), fetchCustomerCampaigns()]);
      if (!alive) return;
      setRows(buildCustomerIntel(data));
      setCampaigns(camps);
      setLoading(false);
    };
    load();
    const ch = supabase
      .channel("cust-mkt-card-rt")
      .on("postgres_changes", { event: "*", schema: "public", table: "orders" }, load)
      .on("postgres_changes", { event: "*", schema: "public", table: "profiles" }, load)
      .on("postgres_changes", { event: "*", schema: "public", table: "marketing_campaigns" }, load)
      .subscribe();
    return () => { alive = false; supabase.removeChannel(ch); };
  }, []);

  const data = rows ?? [];
  const audiences = useMemo(() => buildCustomerAudiences(data), [data]);
  const analytics = useMemo(() => buildCustomerMarketingAnalytics(data, audiences, campaigns), [data, audiences, campaigns]);
  const byKey = useMemo(() => new Map(audiences.map((a) => [a.key, a.count])), [audiences]);

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
            <Users className="size-4" />
          </span>
          <div>
            <h2 className="text-sm font-medium">Customer Marketing</h2>
            <p className="text-[10px] font-mono uppercase tracking-widest text-muted-foreground">
              Audiences · targeting · revenue
            </p>
          </div>
        </div>
        <Link to="/admin-customer-intelligence" search={{ view: "marketing" } as never} className="text-[10px] font-mono uppercase tracking-widest text-accent hover:underline">
          Open →
        </Link>
      </div>

      {loading ? (
        <div className="h-28 grid place-items-center text-muted-foreground">
          <Loader2 className="size-4 animate-spin" />
        </div>
      ) : (
        <>
          <div className="grid grid-cols-2 sm:grid-cols-3 gap-2.5 mb-4">
            <Stat icon={<Crown className="size-3.5" />} label="VIP" value={(byKey.get("vip") ?? 0).toLocaleString()} />
            <Stat icon={<AlertTriangle className="size-3.5" />} label="At-risk" value={(byKey.get("at_risk") ?? 0).toLocaleString()} />
            <Stat icon={<Moon className="size-3.5" />} label="Dormant" value={(byKey.get("dormant") ?? 0).toLocaleString()} />
            <Stat icon={<Gem className="size-3.5" />} label="High value" value={(byKey.get("high_value") ?? 0).toLocaleString()} />
            <Stat icon={<Megaphone className="size-3.5" />} label="Aud. revenue" value={fmtC(analytics.audienceRevenue)} />
            <Stat icon={<Megaphone className="size-3.5" />} label="Aud. profit" value={fmtC(analytics.audienceProfit)} />
          </div>

          <div className="grid grid-cols-3 gap-2">
            <Quick view="audiences" icon={<Users className="size-3.5" />} label="Audiences" />
            <Quick view="marketing" icon={<Rocket className="size-3.5" />} label="Campaign" />
            <Quick view="vip" icon={<Crown className="size-3.5" />} label="VIP" />
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

function Quick({ view, icon, label }: { view: string; icon: React.ReactNode; label: string }) {
  return (
    <Link
      to="/admin-customer-intelligence"
      search={{ view } as never}
      className="group flex flex-col items-center gap-1 rounded-xl border border-white/5 bg-white/[0.02] px-1.5 py-2.5 text-center transition-all hover:border-accent/40 hover:bg-accent/10"
    >
      <span className="text-muted-foreground transition-colors group-hover:text-accent">{icon}</span>
      <span className="text-[9px] font-medium text-muted-foreground group-hover:text-foreground">{label}</span>
    </Link>
  );
}
