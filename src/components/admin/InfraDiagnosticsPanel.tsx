import { useEffect, useState } from "react";
import { Activity, HardDrive, RefreshCw, Zap, ShieldCheck, PackageOpen, Trash2 } from "lucide-react";
import { readDiagnostics, type SWDiagnostics } from "@/lib/infra/sw-diagnostics";
import { killServiceWorker, sendToSW } from "@/lib/infra/sw-controller";

function bytes(n: number): string {
  if (!n) return "0 B";
  const u = ["B", "KB", "MB", "GB"];
  let i = 0;
  while (n >= 1024 && i < u.length - 1) { n /= 1024; i++; }
  return `${n.toFixed(n < 10 ? 1 : 0)} ${u[i]}`;
}

function tsAgo(t: number): string {
  if (!t) return "never";
  const s = Math.round((Date.now() - t) / 1000);
  if (s < 60) return `${s}s ago`;
  if (s < 3600) return `${Math.round(s / 60)}m ago`;
  return `${Math.round(s / 3600)}h ago`;
}

export function InfraDiagnosticsPanel() {
  const [d, setD] = useState<SWDiagnostics | null>(null);
  const [busy, setBusy] = useState(false);

  async function refresh() { setBusy(true); try { setD(await readDiagnostics()); } finally { setBusy(false); } }

  useEffect(() => { void refresh(); const t = window.setInterval(refresh, 15_000); return () => window.clearInterval(t); }, []);

  const health = d?.health.status ?? "unknown";
  const healthColor = health === "healthy" ? "text-emerald-500" : health === "degraded" ? "text-amber-500" : "text-muted-foreground";

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2 text-sm text-muted-foreground">
          <ShieldCheck className={`size-4 ${healthColor}`} />
          <span className="font-mono uppercase tracking-widest text-[10px]">{health}</span>
          <span>·</span>
          <span>{d?.ok ? "SW active" : "SW inactive"}</span>
          <span>·</span>
          <span>checked {tsAgo(d?.health.lastCheckAt ?? 0)}</span>
        </div>
        <div className="flex items-center gap-2">
          <button onClick={refresh} disabled={busy} className="text-xs inline-flex items-center gap-1.5 rounded-full border border-border/60 px-3 py-1.5 hover:bg-muted/50">
            <RefreshCw className={`size-3.5 ${busy ? "animate-spin" : ""}`} /> Refresh
          </button>
          <button onClick={async () => { await sendToSW({ type: "ROLLBACK" }); void refresh(); }} className="text-xs inline-flex items-center gap-1.5 rounded-full border border-border/60 px-3 py-1.5 hover:bg-muted/50">
            <PackageOpen className="size-3.5" /> Rollback candidate
          </button>
          <button onClick={async () => { if (!confirm("Unregister the Service Worker and wipe caches?")) return; await killServiceWorker(); void refresh(); }} className="text-xs inline-flex items-center gap-1.5 rounded-full border border-destructive/40 text-destructive px-3 py-1.5 hover:bg-destructive/5">
            <Trash2 className="size-3.5" /> Reset infrastructure
          </button>
        </div>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
        <Kpi icon={<Activity className="size-4 text-accent" />} label="Deployment checks" value={String(d?.deployment.checks ?? 0)} sub={`${d?.deployment.detected ?? 0} detected`} />
        <Kpi icon={<Zap className="size-4 text-accent" />} label="Chunk recoveries" value={String(d?.chunk.repaired ?? 0)} sub={`${d?.chunk.attempted ?? 0} attempted · ${d?.chunk.failed ?? 0} failed`} />
        <Kpi icon={<PackageOpen className="size-4 text-accent" />} label="Activations" value={String(d?.deployment.activated ?? 0)} sub={`${d?.deployment.rollbacks ?? 0} rollbacks`} />
        <Kpi icon={<HardDrive className="size-4 text-accent" />} label="Cache size" value={bytes(d?.totalBytes ?? 0)} sub={`${d?.buckets.length ?? 0} buckets`} />
      </div>

      <div className="card-premium rounded-2xl p-4">
        <div className="text-xs uppercase tracking-widest text-muted-foreground mb-3">Cache buckets</div>
        {(!d || d.buckets.length === 0) ? (
          <div className="text-sm text-muted-foreground">No caches yet.</div>
        ) : (
          <div className="divide-y divide-border/40 -mx-4">
            {d.buckets.map((b) => (
              <div key={b.name} className="px-4 py-2.5 flex items-center gap-4 text-sm">
                <span className="font-mono text-xs">{b.name}</span>
                <span className="text-muted-foreground ml-auto">{b.entries} entries</span>
                <span className="text-muted-foreground w-20 text-right">{bytes(b.approxBytes)}</span>
              </div>
            ))}
          </div>
        )}
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
        <div className="card-premium rounded-2xl p-4 space-y-1.5 text-sm">
          <div className="text-xs uppercase tracking-widest text-muted-foreground mb-2">Deployment</div>
          <Row k="Active cache" v={d?.active ?? "—"} />
          <Row k="Pending candidate" v={d?.deployment.pending ?? "—"} />
          <Row k="Last activation" v={tsAgo(d?.deployment.lastDeploymentAt ?? 0)} />
        </div>
        <div className="card-premium rounded-2xl p-4 space-y-1.5 text-sm">
          <div className="text-xs uppercase tracking-widest text-muted-foreground mb-2">Runtime</div>
          <Row k="Network tier" v={d?.network.tier ?? "—"} />
          <Row k="Save-Data" v={d?.network.saveData ? "on" : "off"} />
          <Row k="Queue depth" v={String(d?.queueDepth ?? 0)} />
        </div>
      </div>
    </div>
  );
}

function Kpi({ icon, label, value, sub }: { icon: React.ReactNode; label: string; value: string; sub?: string }) {
  return (
    <div className="card-premium rounded-2xl p-4">
      <div className="flex items-center gap-2 text-xs uppercase tracking-widest text-muted-foreground">{icon}<span>{label}</span></div>
      <div className="mt-2 text-2xl font-semibold tabular-nums">{value}</div>
      {sub && <div className="text-xs text-muted-foreground mt-0.5">{sub}</div>}
    </div>
  );
}
function Row({ k, v }: { k: string; v: string }) {
  return <div className="flex items-center justify-between"><span className="text-muted-foreground">{k}</span><span className="font-mono text-xs">{v}</span></div>;
}
