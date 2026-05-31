import { Activity, CheckCircle2, XCircle, Clock, Loader2, Download } from "lucide-react";
import type { ExecRow } from "./SegmentActivationCenter";

const fmtN = (n: number) => new Intl.NumberFormat().format(Math.round(n || 0));

const STATUS_META: Record<string, { label: string; cls: string; icon: React.ReactNode }> = {
  queued: { label: "Queued", cls: "bg-sky-500/15 text-sky-400", icon: <Clock className="size-4" /> },
  running: { label: "Running", cls: "bg-amber-500/15 text-amber-400", icon: <Loader2 className="size-4 animate-spin" /> },
  success: { label: "Completed", cls: "bg-emerald-500/15 text-emerald-400", icon: <CheckCircle2 className="size-4" /> },
  skipped: { label: "Skipped", cls: "bg-muted/40 text-muted-foreground", icon: <Clock className="size-4" /> },
  failed: { label: "Failed", cls: "bg-rose-500/15 text-rose-400", icon: <XCircle className="size-4" /> },
};

function MonitorCard({ label, value, cls, icon }: { label: string; value: number; cls: string; icon: React.ReactNode }) {
  return (
    <div className="card-premium rounded-2xl p-4">
      <div className={`inline-flex items-center gap-2 px-2 py-1 rounded-full text-[10px] font-mono uppercase tracking-widest ${cls}`}>{icon}{label}</div>
      <div className="text-2xl font-semibold tabular-nums mt-2">{fmtN(value)}</div>
    </div>
  );
}

export function AutomationMonitor({ execs, onExport }: { execs: ExecRow[]; onExport: () => void }) {
  const counts = {
    queued: execs.filter((e) => e.status === "queued").length,
    running: execs.filter((e) => e.status === "running").length,
    completed: execs.filter((e) => e.status === "success").length,
    failed: execs.filter((e) => e.status === "failed").length,
  };

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <MonitorCard label="Queued" value={counts.queued} cls={STATUS_META.queued.cls} icon={STATUS_META.queued.icon} />
        <MonitorCard label="Running" value={counts.running} cls={STATUS_META.running.cls} icon={STATUS_META.running.icon} />
        <MonitorCard label="Completed" value={counts.completed} cls={STATUS_META.success.cls} icon={STATUS_META.success.icon} />
        <MonitorCard label="Failed" value={counts.failed} cls={STATUS_META.failed.cls} icon={STATUS_META.failed.icon} />
      </div>

      <div className="card-premium rounded-2xl overflow-hidden">
        <div className="flex items-center justify-between px-5 py-3 border-b border-border">
          <h3 className="text-sm font-medium flex items-center gap-2"><Activity className="size-4 text-accent" /> Execution history</h3>
          <button onClick={onExport} className="inline-flex items-center gap-1.5 text-[10px] uppercase tracking-widest font-mono text-muted-foreground hover:text-foreground">
            <Download className="size-3" /> CSV
          </button>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="text-[10px] font-mono uppercase tracking-widest text-muted-foreground border-b border-border">
              <tr>
                <th className="px-5 py-2.5 text-left">Trigger</th>
                <th className="px-5 py-2.5 text-left">Action</th>
                <th className="px-5 py-2.5 text-right">Audience</th>
                <th className="px-5 py-2.5 text-left">Source</th>
                <th className="px-5 py-2.5 text-left">Status</th>
                <th className="px-5 py-2.5 text-right">When</th>
              </tr>
            </thead>
            <tbody>
              {execs.map((e) => {
                const m = STATUS_META[e.status] ?? { label: e.status, cls: "bg-muted/40 text-muted-foreground", icon: null };
                return (
                  <tr key={e.id} className="border-b border-border/40 last:border-0">
                    <td className="px-5 py-2.5 text-left truncate max-w-[180px]">{e.trigger_key ?? "—"}</td>
                    <td className="px-5 py-2.5 text-left capitalize">{e.action_taken ?? "—"}</td>
                    <td className="px-5 py-2.5 text-right tabular-nums">{fmtN(e.matched_count ?? 0)}</td>
                    <td className="px-5 py-2.5 text-left capitalize text-muted-foreground">{e.triggered_by ?? "—"}</td>
                    <td className="px-5 py-2.5 text-left">
                      <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-mono uppercase tracking-widest ${m.cls}`}>{m.label}</span>
                    </td>
                    <td className="px-5 py-2.5 text-right tabular-nums text-muted-foreground">{new Date(e.created_at).toLocaleString()}</td>
                  </tr>
                );
              })}
              {execs.length === 0 && <tr><td colSpan={6} className="px-5 py-8 text-center text-sm text-muted-foreground">No automation runs yet. Activate a segment to begin.</td></tr>}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
