import { useCallback, useEffect, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { ShieldCheck, ShieldAlert, Loader2, RefreshCw, ChevronDown } from "lucide-react";
import { getOrderIntegrityFn, runOrderIntegrityScanFn } from "@/lib/admin-ops.functions";

type ScanSummary = {
  scanned_at?: string;
  invalid_total?: number;
  delivered_with_failed_payment?: unknown[];
  shipped_with_failed_payment?: unknown[];
  refunded_with_active_shipment?: unknown[];
  cancelled_marked_delivered?: unknown[];
};

type Integrity = {
  last_scan: ScanSummary | null;
  last_scan_at: string | null;
  live_invalid_count: number;
};

const fmt = (s: string | null | undefined) =>
  s ? new Date(s).toLocaleString() : "Never";

export function OrderIntegrityMonitor() {
  const load = useServerFn(getOrderIntegrityFn);
  const scan = useServerFn(runOrderIntegrityScanFn);
  const [data, setData] = useState<Integrity | null>(null);
  const [loading, setLoading] = useState(true);
  const [scanning, setScanning] = useState(false);
  const [open, setOpen] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    try {
      setErr(null);
      const res = (await load()) as Integrity;
      setData(res);
    } catch (e) {
      setErr(e instanceof Error ? e.message : "Failed to load");
    } finally {
      setLoading(false);
    }
  }, [load]);

  useEffect(() => { void refresh(); }, [refresh]);

  const runScan = async () => {
    setScanning(true);
    try {
      await scan();
      await refresh();
    } catch (e) {
      setErr(e instanceof Error ? e.message : "Scan failed");
    } finally {
      setScanning(false);
    }
  };

  const invalid = data?.live_invalid_count ?? 0;
  const healthy = invalid === 0;
  const summary = data?.last_scan ?? null;

  return (
    <div className={`card-premium rounded-2xl p-5 ${healthy ? "" : "border border-destructive/40"}`}>
      <div className="flex items-center justify-between mb-3">
        <h2 className="text-sm font-medium flex items-center gap-2">
          {healthy ? <ShieldCheck className="size-4 text-emerald-400" /> : <ShieldAlert className="size-4 text-destructive" />}
          Order Integrity Monitor
        </h2>
        <button onClick={runScan} disabled={scanning}
          className="inline-flex items-center gap-1.5 text-xs px-3 py-1.5 rounded-lg border border-border hover:border-accent/40 disabled:opacity-50">
          {scanning ? <Loader2 className="size-3.5 animate-spin" /> : <RefreshCw className="size-3.5" />} Run scan
        </button>
      </div>

      {loading ? (
        <div className="flex items-center gap-2 text-[11px] text-muted-foreground"><Loader2 className="size-3 animate-spin" /> Loading…</div>
      ) : err ? (
        <p className="text-[11px] text-destructive">{err}</p>
      ) : (
        <>
          <div className="grid grid-cols-2 gap-3">
            <div className="rounded-xl bg-muted/30 p-3">
              <p className="text-[10px] uppercase tracking-widest text-muted-foreground">Invalid orders</p>
              <p className={`text-2xl font-semibold ${healthy ? "text-emerald-400" : "text-destructive"}`}>{invalid}</p>
            </div>
            <div className="rounded-xl bg-muted/30 p-3">
              <p className="text-[10px] uppercase tracking-widest text-muted-foreground">Last scan</p>
              <p className="text-sm font-medium">{fmt(data?.last_scan_at)}</p>
            </div>
          </div>

          <p className="text-[11px] text-muted-foreground mt-3">
            {healthy
              ? "No delivered/shipped order exists with a failed, cancelled or refunded payment."
              : "Some orders are in a fulfillment state without a completed payment. Review details."}
          </p>

          {summary && (
            <button onClick={() => setOpen((v) => !v)}
              className="mt-2 inline-flex items-center gap-1 text-[11px] text-accent">
              <ChevronDown className={`size-3 transition-transform ${open ? "rotate-180" : ""}`} /> View details
            </button>
          )}

          {open && summary && (
            <div className="mt-2 space-y-1 text-[11px] text-muted-foreground">
              <div>Delivered + failed payment: <span className="text-foreground">{summary.delivered_with_failed_payment?.length ?? 0}</span></div>
              <div>Shipped/processing + invalid payment: <span className="text-foreground">{summary.shipped_with_failed_payment?.length ?? 0}</span></div>
              <div>Refunded + active shipment: <span className="text-foreground">{summary.refunded_with_active_shipment?.length ?? 0}</span></div>
              <div>Cancelled marked delivered: <span className="text-foreground">{summary.cancelled_marked_delivered?.length ?? 0}</span></div>
              <pre className="mt-2 max-h-48 overflow-auto rounded-lg bg-muted/30 p-2 text-[10px] text-foreground/80">{JSON.stringify(summary, null, 2)}</pre>
            </div>
          )}
        </>
      )}
    </div>
  );
}
