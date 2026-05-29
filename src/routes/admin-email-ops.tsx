import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { useQuery } from "@tanstack/react-query";
import {
  AlertTriangle, Loader2, RefreshCw, ShieldBan, RotateCcw, Mail, Ban,
} from "lucide-react";
import { AdminShell } from "@/components/admin/AdminShell";
import { getEmailOps } from "@/lib/email-admin.functions";

export const Route = createFileRoute("/admin-email-ops")({
  head: () => ({ meta: [{ title: "Email operations — Admin" }] }),
  component: EmailOpsPage,
});

const RANGES = [
  { id: "24h" as const, label: "24h" },
  { id: "7d" as const, label: "7 days" },
  { id: "30d" as const, label: "30 days" },
];

function StatusBadge({ value }: { value: string }) {
  const map: Record<string, string> = {
    sent: "text-emerald-400 bg-emerald-400/10 ring-emerald-400/20",
    failed: "text-destructive bg-destructive/10 ring-destructive/20",
    dlq: "text-destructive bg-destructive/10 ring-destructive/20",
    bounced: "text-destructive bg-destructive/10 ring-destructive/20",
    complained: "text-destructive bg-destructive/10 ring-destructive/20",
    unsubscribe: "text-amber-400 bg-amber-400/10 ring-amber-400/20",
    bounce: "text-destructive bg-destructive/10 ring-destructive/20",
    complaint: "text-destructive bg-destructive/10 ring-destructive/20",
  };
  const cls = map[value] ?? "text-muted-foreground bg-white/5 ring-white/10";
  return (
    <span className={`inline-flex items-center rounded-full px-2 py-0.5 text-[10px] font-mono uppercase tracking-widest ring-1 ring-inset ${cls}`}>
      {value}
    </span>
  );
}

function StatCard({ label, value, color }: { label: string; value: number; color: string }) {
  return (
    <div className="rounded-xl border border-border/40 bg-white/[0.02] px-3 py-2.5">
      <p className={`text-xl font-display ${color}`}>{value}</p>
      <p className="text-[9px] font-mono uppercase tracking-[0.2em] text-muted-foreground mt-1">{label}</p>
    </div>
  );
}

function EmailOpsPage() {
  const fetchOps = useServerFn(getEmailOps);
  const [range, setRange] = useState<"24h" | "7d" | "30d">("7d");

  const { data, isLoading, isFetching, refetch, isError, error } = useQuery({
    queryKey: ["email-ops", range],
    queryFn: () => fetchOps({ data: { range, limit: 100 } }),
  }) as any;

  const fs = data?.failureStats;
  const ss = data?.suppressionStats;
  const failed = data?.failed ?? [];
  const suppressed = data?.suppressed ?? [];

  return (
    <AdminShell
      title="Email operations"
      subtitle="Failed send retries & suppression list"
      allow={["admin", "super_admin", "manager"]}
      actions={
        <div className="flex items-center gap-2">
          <div className="inline-flex rounded-full border border-border/60 bg-white/[0.02] p-0.5">
            {RANGES.map((r) => (
              <button
                key={r.id}
                onClick={() => setRange(r.id)}
                className={`px-2.5 py-1 rounded-full text-[10px] font-mono uppercase tracking-widest transition-colors ${
                  range === r.id ? "bg-accent/15 text-accent" : "text-muted-foreground hover:text-foreground"
                }`}
              >
                {r.label}
              </button>
            ))}
          </div>
          <button
            onClick={() => refetch()}
            className="inline-flex items-center gap-1.5 rounded-full border border-border/60 bg-white/[0.03] px-3 py-1.5 text-[11px] font-mono uppercase tracking-widest text-muted-foreground hover:text-foreground transition-colors"
          >
            <RefreshCw className={`size-3 ${isFetching ? "animate-spin" : ""}`} /> Refresh
          </button>
        </div>
      }
    >
      <div className="space-y-6">
        {/* Failed send retries */}
        <section className="card-premium rounded-2xl p-5">
          <div className="flex items-center gap-2 mb-1">
            <RotateCcw className="size-4 text-accent" />
            <h2 className="text-sm font-medium">Failed send retries</h2>
          </div>
          <p className="text-[11px] text-muted-foreground mb-4">
            Emails that exhausted automatic retries and landed in the dead-letter queue, or were rejected by the recipient.
          </p>

          {fs && (
            <div className="grid grid-cols-2 sm:grid-cols-5 gap-2.5 mb-4">
              <StatCard label="Total failed" value={fs.total} color="text-destructive" />
              <StatCard label="Dead-letter" value={fs.dlq} color="text-destructive" />
              <StatCard label="Failed" value={fs.failed} color="text-destructive" />
              <StatCard label="Bounced" value={fs.bounced} color="text-amber-400" />
              <StatCard label="Complaints" value={fs.complained} color="text-amber-400" />
            </div>
          )}

          {isLoading ? (
            <div className="py-10 grid place-items-center"><Loader2 className="size-4 animate-spin text-muted-foreground" /></div>
          ) : isError ? (
            <div className="py-8 flex items-center justify-center gap-2 text-sm text-destructive">
              <AlertTriangle className="size-4" /> {String(error?.message ?? "Failed to load")}
            </div>
          ) : failed.length === 0 ? (
            <p className="py-8 text-center text-sm text-muted-foreground">No failed sends in this period — everything delivered cleanly.</p>
          ) : (
            <div className="rounded-xl border border-border/40 divide-y divide-border/40 overflow-hidden">
              {failed.map((l: any) => (
                <div key={l.id} className="px-4 py-3 flex items-center gap-3">
                  <Mail className="size-3.5 text-muted-foreground shrink-0" />
                  <div className="min-w-0 flex-1">
                    <p className="text-[13px] truncate">{l.recipient_email}</p>
                    <p className="text-[10px] font-mono text-muted-foreground truncate">
                      {l.template_name}
                      {l.error_message && <span className="text-destructive"> · {l.error_message}</span>}
                    </p>
                  </div>
                  <StatusBadge value={l.status} />
                  <p className="text-[10px] font-mono text-muted-foreground shrink-0 hidden sm:block">
                    {new Date(l.created_at).toLocaleString()}
                  </p>
                </div>
              ))}
            </div>
          )}
        </section>

        {/* Suppression list */}
        <section className="card-premium rounded-2xl p-5">
          <div className="flex items-center gap-2 mb-1">
            <ShieldBan className="size-4 text-accent" />
            <h2 className="text-sm font-medium">Suppression list</h2>
          </div>
          <p className="text-[11px] text-muted-foreground mb-4">
            Blocked recipients. These addresses are skipped on every send to protect sender reputation.
          </p>

          {ss && (
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5 mb-4">
              <StatCard label="Total blocked" value={ss.total} color="text-foreground" />
              <StatCard label="Unsubscribed" value={ss.unsubscribe} color="text-amber-400" />
              <StatCard label="Bounces" value={ss.bounce} color="text-destructive" />
              <StatCard label="Complaints" value={ss.complaint} color="text-destructive" />
            </div>
          )}

          {isLoading ? (
            <div className="py-10 grid place-items-center"><Loader2 className="size-4 animate-spin text-muted-foreground" /></div>
          ) : isError ? (
            <div className="py-8 flex items-center justify-center gap-2 text-sm text-destructive">
              <AlertTriangle className="size-4" /> {String(error?.message ?? "Failed to load")}
            </div>
          ) : suppressed.length === 0 ? (
            <p className="py-8 text-center text-sm text-muted-foreground">No suppressed recipients yet.</p>
          ) : (
            <div className="rounded-xl border border-border/40 divide-y divide-border/40 overflow-hidden">
              {suppressed.map((s: any) => (
                <div key={s.id} className="px-4 py-3 flex items-center gap-3">
                  <Ban className="size-3.5 text-destructive/70 shrink-0" />
                  <div className="min-w-0 flex-1">
                    <p className="text-[13px] truncate">{s.email}</p>
                    <p className="text-[10px] font-mono text-muted-foreground truncate">Blocked recipient</p>
                  </div>
                  <StatusBadge value={s.reason} />
                  <p className="text-[10px] font-mono text-muted-foreground shrink-0 hidden sm:block">
                    {new Date(s.created_at).toLocaleString()}
                  </p>
                </div>
              ))}
            </div>
          )}
        </section>
      </div>
    </AdminShell>
  );
}
