import { Link } from "@tanstack/react-router";
import { ShieldAlert, ShieldCheck, Lock, ChevronRight } from "lucide-react";
import { useFraudSummary } from "@/lib/use-fraud-intelligence";
import { FRAUD_META, SEVERITY_META, type FraudType, type Severity } from "@/lib/fraud-intelligence";

/**
 * Compact Fraud & Security summary embedded in Executive Dashboard and the
 * AI Operations center. Reads persisted fraud_alerts (realtime).
 */
export function SecuritySummaryCard() {
  const { open, critical, high, lockedAccounts, total, loading } = useFraudSummary();
  if (loading) return null;

  const clean = total === 0 && lockedAccounts === 0;

  return (
    <Link
      to="/admin-security"
      className="block rounded-2xl glass p-4 border border-white/[0.08] hover:border-accent/30 transition-all"
    >
      <div className="flex items-center justify-between gap-3">
        <div className="flex items-center gap-2 min-w-0">
          {clean ? <ShieldCheck className="size-4 text-emerald-400" /> : <ShieldAlert className="size-4 text-rose-400" />}
          <span className="text-[10px] font-mono uppercase tracking-[0.2em] text-muted-foreground/80">Fraud & Security</span>
        </div>
        <ChevronRight className="size-3.5 text-muted-foreground" />
      </div>

      {clean ? (
        <p className="mt-2 text-sm text-muted-foreground">No active threats detected. All systems clear.</p>
      ) : (
        <>
          <div className="mt-2 flex flex-wrap items-center gap-2">
            <Stat label="Open" value={total} />
            <Stat label="Critical" value={critical} tone="text-rose-300" />
            <Stat label="High" value={high} tone="text-amber-300" />
            <Stat label="Locked" value={lockedAccounts} icon={<Lock className="size-3" />} />
          </div>
          <div className="mt-3 space-y-1.5">
            {open.slice(0, 3).map((a) => {
              const meta = FRAUD_META[a.fraud_type as FraudType] ?? { label: a.fraud_type, dot: "bg-rose-400", tone: "" };
              const sev = SEVERITY_META[a.severity as Severity] ?? SEVERITY_META.medium;
              return (
                <div key={a.id} className="flex items-center gap-2 text-xs">
                  <span className={`size-1.5 rounded-full ${meta.dot}`} />
                  <span className="truncate flex-1">{a.title}</span>
                  <span className={`rounded-full border px-1.5 py-0.5 text-[9px] ${sev.tone}`}>{sev.label}</span>
                </div>
              );
            })}
          </div>
        </>
      )}
    </Link>
  );
}

function Stat({ label, value, tone, icon }: { label: string; value: number; tone?: string; icon?: React.ReactNode }) {
  return (
    <div className="inline-flex items-center gap-1.5 rounded-full bg-white/[0.04] border border-white/[0.08] px-2.5 py-1">
      {icon}
      <span className={`text-sm font-semibold tabular-nums ${tone ?? ""}`}>{value}</span>
      <span className="text-[10px] text-muted-foreground">{label}</span>
    </div>
  );
}
