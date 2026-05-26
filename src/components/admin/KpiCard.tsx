import type { ReactNode } from "react";
import { ArrowUpRight, ArrowDownRight } from "lucide-react";

export function KpiCard({ label, value, icon, delta, sub }: {
  label: string; value: ReactNode; icon?: ReactNode; delta?: number | null; sub?: ReactNode;
}) {
  return (
    <div className="bg-card border border-border rounded-2xl p-5">
      <div className="flex items-center gap-2 text-muted-foreground mb-3">
        {icon}
        <span className="text-[10px] font-mono uppercase tracking-[0.3em]">{label}</span>
      </div>
      <p className="text-2xl font-display font-semibold">{value}</p>
      {delta != null && (
        <p className={`mt-1 inline-flex items-center gap-1 text-[10px] font-mono uppercase tracking-widest ${delta >= 0 ? "text-accent" : "text-destructive"}`}>
          {delta >= 0 ? <ArrowUpRight className="size-3" /> : <ArrowDownRight className="size-3" />}
          {Math.abs(delta).toFixed(1)}%
        </p>
      )}
      {sub && <div className="mt-1">{sub}</div>}
    </div>
  );
}
