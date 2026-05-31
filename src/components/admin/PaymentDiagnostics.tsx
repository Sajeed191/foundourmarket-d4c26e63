import { useEffect, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { motion } from "framer-motion";
import {
  Globe2, RefreshCw, Loader2, IndianRupee, DollarSign, ShieldCheck, ShieldAlert,
  Activity, TrendingUp, TrendingDown, Wallet, CreditCard, Landmark, Smartphone, CheckCircle2, XCircle,
} from "lucide-react";
import { getCheckoutRegionDebug } from "@/lib/region.functions";
import { getRazorpayDiagnostics, getPaymentHealth } from "@/lib/razorpay.functions";

type RegionDebug = {
  detectedCountry: string | null;
  timezone: string | null;
  market: "india" | "international";
  currency: "INR" | "USD";
  pricingSource: string;
  confidence: number;
  profileLocked: boolean;
};

type Diagnostics = {
  mode: "test" | "live" | "unknown";
  activated: boolean;
  blocked: boolean;
  accountCountry: string | null;
  methods: {
    upi: boolean; card: boolean; credit_card: boolean; debit_card: boolean;
    netbanking: boolean; wallet: boolean; wallets: string[]; emi: boolean;
    paylater: boolean; paylater_providers: string[]; cardless_emi: boolean;
    cod: boolean; gpay: boolean;
  };
  fetchedAt: string;
};

type Health = {
  totals: {
    attempts: number; succeeded: number; failed: number;
    successRate: number; failureRate: number; revenue: number; avgOrderValue: number;
  };
  usage: { upi: number; card: number; netbanking: number; wallet: number; emi: number; paylater: number };
  revenueByMethod: Record<string, number>;
  countByMethod: Record<string, number>;
  recent: {
    id: string; orderId: string; method: string; rawMethod: string;
    status: string; amount: number; currency: string; demo: boolean; createdAt: string;
  }[];
};

const fmtMoney = (v: number, c = "INR") =>
  new Intl.NumberFormat("en-IN", { style: "currency", currency: c || "INR", maximumFractionDigits: 0 }).format(Number(v) || 0);
const when = (s: string) => new Date(s).toLocaleString("en-IN", { dateStyle: "short", timeStyle: "short" });

export function PaymentDiagnostics() {
  const fetchRegion = useServerFn(getCheckoutRegionDebug);
  const fetchDiag = useServerFn(getRazorpayDiagnostics);
  const fetchHealth = useServerFn(getPaymentHealth);

  const [region, setRegion] = useState<RegionDebug | null>(null);
  const [diag, setDiag] = useState<Diagnostics | null>(null);
  const [health, setHealth] = useState<Health | null>(null);
  const [loading, setLoading] = useState(true);

  async function load() {
    setLoading(true);
    const [r, d, h] = await Promise.allSettled([fetchRegion(), fetchDiag(), fetchHealth()]);
    if (r.status === "fulfilled") setRegion(r.value as RegionDebug);
    if (d.status === "fulfilled") setDiag(d.value as Diagnostics);
    if (h.status === "fulfilled") setHealth(h.value as Health);
    setLoading(false);
  }

  useEffect(() => {
    void load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <motion.div
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      className="rounded-2xl border border-border/60 bg-card/60 p-4 backdrop-blur-xl space-y-5"
    >
      <div className="flex items-center justify-between gap-2">
        <div className="flex items-center gap-2 text-sm font-semibold text-foreground">
          <Activity className="size-4 text-accent" />
          Payment Diagnostics & Health
        </div>
        <button
          onClick={() => void load()}
          className="inline-flex items-center gap-1.5 rounded-lg border border-border/60 px-2.5 py-1 text-xs text-muted-foreground hover:text-foreground"
        >
          {loading ? <Loader2 className="size-3.5 animate-spin" /> : <RefreshCw className="size-3.5" />}
          Refresh
        </button>
      </div>

      {/* Account mode + region */}
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <Stat
          label="Account Mode"
          value={(diag?.mode ?? "—").toUpperCase()}
          highlight={diag?.mode === "live" ? "ok" : "warn"}
        />
        <Stat
          label="Activation"
          value={
            <span className="inline-flex items-center gap-1">
              {diag?.activated ? <ShieldCheck className="size-3.5" /> : <ShieldAlert className="size-3.5" />}
              {diag ? (diag.activated ? "Activated" : "Pending") : "—"}
            </span>
          }
          highlight={diag?.activated ? "ok" : "warn"}
        />
        <Stat label="Account Country" value={diag?.accountCountry ?? "—"} />
        <Stat
          label="Order Currency"
          value={
            <span className="inline-flex items-center gap-1">
              {region?.currency === "INR" ? <IndianRupee className="size-3.5" /> : <DollarSign className="size-3.5" />}
              {region?.currency ?? "—"}
            </span>
          }
          highlight={region?.currency === "INR" ? "ok" : "neutral"}
        />
        <Stat label="Detected Country" value={region?.detectedCountry ?? "—"} />
        <Stat label="Region" value={(region?.market ?? "—").toUpperCase()} />
        <Stat label="Price Source" value={region?.pricingSource ?? "—"} />
        <Stat label="Profile Locked" value={region?.profileLocked ? "Yes" : "No"} />
      </div>

      {/* Available methods returned by Razorpay */}
      <div>
        <div className="mb-2 flex items-center gap-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
          <Globe2 className="size-3.5" /> Available Methods (from Razorpay account)
        </div>
        <div className="flex flex-wrap gap-2">
          {diag ? (
            <>
              <MethodChip on={diag.methods.upi} label="UPI" />
              <MethodChip on={diag.methods.gpay || diag.methods.upi} label="Google Pay" />
              <MethodChip on={diag.methods.upi} label="PhonePe" />
              <MethodChip on={diag.methods.upi} label="Paytm UPI" />
              <MethodChip on={diag.methods.upi} label="BHIM" />
              <MethodChip on={diag.methods.netbanking} label="Net Banking" />
              <MethodChip on={diag.methods.credit_card || diag.methods.card} label="Credit Cards" />
              <MethodChip on={diag.methods.debit_card || diag.methods.card} label="Debit Cards" />
              <MethodChip on={diag.methods.wallet} label={`Wallets${diag.methods.wallets.length ? ` (${diag.methods.wallets.length})` : ""}`} />
              <MethodChip on={diag.methods.emi} label="EMI" />
              <MethodChip on={diag.methods.paylater} label="Pay Later" />
              <MethodChip on={diag.methods.cod} label="COD" />
            </>
          ) : (
            <span className="text-sm text-muted-foreground">Loading methods…</span>
          )}
        </div>
      </div>

      {/* Health KPIs */}
      {health && (
        <div className="space-y-3">
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
            <Kpi label="Success Rate" value={`${health.totals.successRate}%`} icon={<TrendingUp className="size-3.5" />} tone="ok" />
            <Kpi label="Failure Rate" value={`${health.totals.failureRate}%`} icon={<TrendingDown className="size-3.5" />} tone="bad" />
            <Kpi label="Avg Order Value" value={fmtMoney(health.totals.avgOrderValue)} icon={<CreditCard className="size-3.5" />} />
            <Kpi label="Revenue" value={fmtMoney(health.totals.revenue)} icon={<IndianRupee className="size-3.5" />} />
          </div>
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6">
            <UsageBar label="UPI" pct={health.usage.upi} icon={<Smartphone className="size-3.5" />} />
            <UsageBar label="Cards" pct={health.usage.card} icon={<CreditCard className="size-3.5" />} />
            <UsageBar label="Net Banking" pct={health.usage.netbanking} icon={<Landmark className="size-3.5" />} />
            <UsageBar label="Wallets" pct={health.usage.wallet} icon={<Wallet className="size-3.5" />} />
            <UsageBar label="EMI" pct={health.usage.emi} icon={<CreditCard className="size-3.5" />} />
            <UsageBar label="Pay Later" pct={health.usage.paylater} icon={<CreditCard className="size-3.5" />} />
          </div>

          {/* Last 20 attempts */}
          <div>
            <div className="mb-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
              Last {health.recent.length} Payment Attempts
            </div>
            <div className="overflow-hidden rounded-xl border border-border/50">
              <table className="w-full text-left text-xs">
                <thead className="bg-background/50 text-muted-foreground">
                  <tr>
                    <th className="px-3 py-2 font-medium">When</th>
                    <th className="px-3 py-2 font-medium">Method</th>
                    <th className="px-3 py-2 font-medium">Amount</th>
                    <th className="px-3 py-2 font-medium">Status</th>
                  </tr>
                </thead>
                <tbody>
                  {health.recent.map((p) => (
                    <tr key={p.id} className="border-t border-border/40">
                      <td className="px-3 py-2 text-muted-foreground">{when(p.createdAt)}</td>
                      <td className="px-3 py-2 capitalize">{p.method}{p.demo ? " (demo)" : ""}</td>
                      <td className="px-3 py-2">{fmtMoney(p.amount, p.currency)}</td>
                      <td className="px-3 py-2">
                        <span className={`inline-flex items-center gap-1 ${p.status === "succeeded" ? "text-emerald-400" : "text-red-400"}`}>
                          {p.status === "succeeded" ? <CheckCircle2 className="size-3.5" /> : <XCircle className="size-3.5" />}
                          {p.status}
                        </span>
                      </td>
                    </tr>
                  ))}
                  {!health.recent.length && (
                    <tr><td colSpan={4} className="px-3 py-4 text-center text-muted-foreground">No payment attempts yet.</td></tr>
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}

      <p className="text-[11px] leading-relaxed text-muted-foreground">
        Methods reflect the live Razorpay account capabilities (preferences API). No client-side
        method filter is applied at checkout — INR orders surface every enabled Indian method.
      </p>
    </motion.div>
  );
}

function Stat({ label, value, highlight = "neutral" }: { label: string; value: React.ReactNode; highlight?: "ok" | "warn" | "neutral" }) {
  const tone = highlight === "ok" ? "text-emerald-400" : highlight === "warn" ? "text-amber-400" : "text-foreground";
  return (
    <div className="rounded-xl border border-border/50 bg-background/40 p-3">
      <div className="text-[11px] uppercase tracking-wide text-muted-foreground">{label}</div>
      <div className={`mt-1 text-sm font-semibold ${tone}`}>{value}</div>
    </div>
  );
}

function MethodChip({ on, label }: { on: boolean; label: string }) {
  return (
    <span
      className={`inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-xs ${
        on ? "border-emerald-500/30 bg-emerald-500/10 text-emerald-400" : "border-border/50 bg-background/40 text-muted-foreground line-through"
      }`}
    >
      {on ? <CheckCircle2 className="size-3" /> : <XCircle className="size-3" />}
      {label}
    </span>
  );
}

function Kpi({ label, value, icon, tone = "neutral" }: { label: string; value: string; icon: React.ReactNode; tone?: "ok" | "bad" | "neutral" }) {
  const t = tone === "ok" ? "text-emerald-400" : tone === "bad" ? "text-red-400" : "text-foreground";
  return (
    <div className="rounded-xl border border-border/50 bg-background/40 p-3">
      <div className="flex items-center gap-1.5 text-[11px] uppercase tracking-wide text-muted-foreground">{icon}{label}</div>
      <div className={`mt-1 text-base font-bold ${t}`}>{value}</div>
    </div>
  );
}

function UsageBar({ label, pct, icon }: { label: string; pct: number; icon: React.ReactNode }) {
  return (
    <div className="rounded-xl border border-border/50 bg-background/40 p-3">
      <div className="flex items-center gap-1.5 text-[11px] text-muted-foreground">{icon}{label}</div>
      <div className="mt-1 text-sm font-semibold text-foreground">{pct}%</div>
      <div className="mt-1.5 h-1.5 overflow-hidden rounded-full bg-border/40">
        <div className="h-full rounded-full bg-accent" style={{ width: `${Math.min(100, pct)}%` }} />
      </div>
    </div>
  );
}
