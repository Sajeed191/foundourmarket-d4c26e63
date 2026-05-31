import { useState } from "react";
import { Bell, Ticket, Megaphone, Download, Loader2, Play, Users } from "lucide-react";
import { toast } from "sonner";
import {
  activateSegment, type SegmentKey, type SegmentAction, type ActivateSegmentResult,
} from "@/lib/revenue-engine";

export type ExecRow = {
  id: string; run_id: string | null; trigger_key: string | null; status: string;
  matched_count: number | null; action_taken: string | null; summary: string | null;
  details: Record<string, unknown> | null; campaign_id: string | null;
  triggered_by: string | null; created_at: string;
};

const fmtN = (n: number) => new Intl.NumberFormat().format(Math.round(n || 0));
const fmtM = (n: number) => "$" + new Intl.NumberFormat(undefined, { maximumFractionDigits: 0 }).format(Math.round(n || 0));

export type SegDef = { key: SegmentKey; label: string; count: number | null; estRevenue: number | null };

const ACTIONS: { k: SegmentAction; label: string; icon: React.ReactNode }[] = [
  { k: "notify", label: "Notify", icon: <Bell className="size-3.5" /> },
  { k: "coupon", label: "Coupon", icon: <Ticket className="size-3.5" /> },
  { k: "campaign", label: "Campaign", icon: <Megaphone className="size-3.5" /> },
  { k: "export", label: "Export", icon: <Download className="size-3.5" /> },
];

function lastRunFor(key: string, execs: ExecRow[]): ExecRow | null {
  return execs.find((e) => e.trigger_key === `segment:${key}`) ?? null;
}

export function SegmentActivationCenter({
  segments, execs, onActivated,
}: { segments: SegDef[]; execs: ExecRow[]; onActivated: () => void }) {
  const [busy, setBusy] = useState<string | null>(null);

  async function run(seg: SegDef, action: SegmentAction) {
    const id = `${seg.key}:${action}`;
    setBusy(id);
    try {
      const label = action === "campaign" ? `${seg.label} Activation` : undefined;
      const res: ActivateSegmentResult = await activateSegment({
        segment: seg.key, action,
        label, value: action === "coupon" ? 10 : undefined, kind: "percent",
      });
      if (action === "export") {
        const audience = (res.result as { length?: number } | unknown) as unknown[];
        const rows = Array.isArray(audience) ? audience : [];
        if (!rows.length) { toast.error("No audience to export"); return; }
        const headers = Object.keys(rows[0] as Record<string, unknown>);
        const csv = [headers.join(","), ...rows.map((r) =>
          headers.map((h) => {
            const v = (r as Record<string, unknown>)[h] ?? "";
            const s = String(v).replace(/"/g, '""');
            return /[",\n]/.test(s) ? `"${s}"` : s;
          }).join(",")),
        ].join("\n");
        const url = URL.createObjectURL(new Blob([csv], { type: "text/csv" }));
        const a = document.createElement("a");
        a.href = url; a.download = `${seg.key}-audience-${new Date().toISOString().slice(0, 10)}.csv`;
        a.click(); URL.revokeObjectURL(url);
        toast.success(`Exported ${rows.length} customers`);
      } else if (action === "coupon") {
        toast.success(`Coupon ${String(res.result?.code ?? "")} created for ${fmtN(res.matched)} customers`);
      } else if (action === "campaign") {
        toast.success(`Campaign created · ${fmtN(res.matched)} in audience`);
      } else {
        toast.success(`Notified ${fmtN(res.matched)} customers`);
      }
      onActivated();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Activation failed");
    } finally {
      setBusy(null);
    }
  }

  return (
    <div className="space-y-3">
      <h2 className="text-sm font-medium flex items-center gap-2"><Play className="size-4 text-accent" /> Segment activation center</h2>
      <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
        {segments.map((seg) => {
          const last = lastRunFor(seg.key, execs);
          return (
            <div key={seg.key} className="card-premium rounded-2xl p-4">
              <div className="flex items-start justify-between gap-3">
                <div>
                  <div className="text-sm font-medium">{seg.label}</div>
                  <div className="text-[11px] text-muted-foreground mt-0.5 flex items-center gap-1">
                    <Users className="size-3" />
                    {seg.count != null ? `${fmtN(seg.count)} customers` : "Resolved at run"}
                    {seg.estRevenue != null && seg.estRevenue > 0 && <span>· est. {fmtM(seg.estRevenue)} LTV</span>}
                  </div>
                </div>
                <div className="text-right text-[10px] font-mono uppercase tracking-widest text-muted-foreground">
                  {last ? (
                    <>
                      <div>Last run</div>
                      <div className="text-foreground/80">{new Date(last.created_at).toLocaleDateString()}</div>
                      <div>{fmtN(last.matched_count ?? 0)} matched</div>
                    </>
                  ) : <div>Never run</div>}
                </div>
              </div>
              <div className="flex flex-wrap gap-1.5 mt-3">
                {ACTIONS.map((a) => {
                  const id = `${seg.key}:${a.k}`;
                  return (
                    <button key={a.k} disabled={busy !== null} onClick={() => run(seg, a.k)}
                      className="inline-flex items-center gap-1.5 text-[11px] px-2.5 py-1.5 rounded-full bg-white/5 hover:bg-white/10 disabled:opacity-40 transition-colors">
                      {busy === id ? <Loader2 className="size-3.5 animate-spin" /> : a.icon}
                      {a.label}
                    </button>
                  );
                })}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
