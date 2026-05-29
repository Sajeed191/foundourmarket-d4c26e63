import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { useQuery } from "@tanstack/react-query";
import {
  AlertTriangle, Loader2, RefreshCw, Mail, Inbox, Send, Timer, Archive, Skull,
} from "lucide-react";
import { AdminShell } from "@/components/admin/AdminShell";
import { getEmailActivity, getEmailQueueStatus } from "@/lib/email-admin.functions";

export const Route = createFileRoute("/admin-email-queue")({
  head: () => ({ meta: [{ title: "Email queue — Admin" }] }),
  component: EmailQueuePage,
});

const RANGES = [
  { id: "24h" as const, label: "24h" },
  { id: "7d" as const, label: "7 days" },
  { id: "30d" as const, label: "30 days" },
];

const STATUS_FILTERS = [
  { id: "" as const, label: "All" },
  { id: "sent" as const, label: "Sent" },
  { id: "pending" as const, label: "Pending" },
  { id: "failed" as const, label: "Failed" },
  { id: "suppressed" as const, label: "Suppressed" },
];

function StatusBadge({ value }: { value: string }) {
  const map: Record<string, string> = {
    sent: "text-emerald-400 bg-emerald-400/10 ring-emerald-400/20",
    pending: "text-sky-400 bg-sky-400/10 ring-sky-400/20",
    failed: "text-destructive bg-destructive/10 ring-destructive/20",
    dlq: "text-destructive bg-destructive/10 ring-destructive/20",
    bounced: "text-amber-400 bg-amber-400/10 ring-amber-400/20",
    complained: "text-amber-400 bg-amber-400/10 ring-amber-400/20",
    suppressed: "text-amber-400 bg-amber-400/10 ring-amber-400/20",
  };
  const cls = map[value] ?? "text-muted-foreground bg-white/5 ring-white/10";
  return (
    <span className={`inline-flex items-center rounded-full px-2 py-0.5 text-[10px] font-mono uppercase tracking-widest ring-1 ring-inset ${cls}`}>
      {value}
    </span>
  );
}

function QueueStat({ icon: Icon, label, value, color }: { icon: any; label: string; value: number; color: string }) {
  return (
    <div className="rounded-xl border border-border/40 bg-white/[0.02] px-3 py-2.5">
      <div className="flex items-center gap-1.5">
        <Icon className={`size-3.5 ${color}`} />
        <p className={`text-xl font-display ${color}`}>{value}</p>
      </div>
      <p className="text-[9px] font-mono uppercase tracking-[0.2em] text-muted-foreground mt-1">{label}</p>
    </div>
  );
}

function prettyQueue(name: string) {
  return name.replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());
}

function EmailQueuePage() {
  const fetchQueue = useServerFn(getEmailQueueStatus);
  const fetchActivity = useServerFn(getEmailActivity);

  const [range, setRange] = useState<"24h" | "7d" | "30d">("7d");
  const [template, setTemplate] = useState<string>("");
  const [status, setStatus] = useState<string>("");

  const queueQ = useQuery({
    queryKey: ["email-queue-status"],
    queryFn: () => fetchQueue(),
    refetchInterval: 15000,
  }) as any;

  const logQ = useQuery({
    queryKey: ["email-activity", range, template, status],
    queryFn: () =>
      fetchActivity({
        data: { range, template: template || null, status: status || null, limit: 100 },
      }),
  }) as any;

  const queues = queueQ.data?.queues ?? [];
  const totals = queueQ.data?.totals;

  const stats = logQ.data?.stats;
  const templates: string[] = logQ.data?.templates ?? [];
  const logs = logQ.data?.logs ?? [];

  return (
    <AdminShell
      title="Email queue"
      subtitle="notify.foundourmarket.com · queue health & send logs"
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
            onClick={() => {
              queueQ.refetch();
              logQ.refetch();
            }}
            className="inline-flex items-center gap-1.5 rounded-full border border-border/60 bg-white/[0.03] px-3 py-1.5 text-[11px] font-mono uppercase tracking-widest text-muted-foreground hover:text-foreground transition-colors"
          >
            <RefreshCw className={`size-3 ${queueQ.isFetching || logQ.isFetching ? "animate-spin" : ""}`} /> Refresh
          </button>
        </div>
      }
    >
      <div className="space-y-6">
        {/* Queue status */}
        <section className="card-premium rounded-2xl p-5">
          <div className="flex items-center gap-2 mb-1">
            <Inbox className="size-4 text-accent" />
            <h2 className="text-sm font-medium">Live queue status</h2>
          </div>
          <p className="text-[11px] text-muted-foreground mb-4">
            Real-time depth of the email send queues. Auto-refreshes every 15s. The dispatcher drains auth emails first, then transactional.
          </p>

          {totals && (
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5 mb-5">
              <QueueStat icon={Send} label="Queued (all)" value={totals.queued} color="text-foreground" />
              <QueueStat icon={Timer} label="In-flight (all)" value={totals.in_flight} color="text-sky-400" />
              <QueueStat icon={Skull} label="Dead-letter (all)" value={totals.dlq} color="text-destructive" />
              <QueueStat icon={Archive} label="Archived (all)" value={totals.archived} color="text-muted-foreground" />
            </div>
          )}

          {queueQ.isLoading ? (
            <div className="py-10 grid place-items-center"><Loader2 className="size-4 animate-spin text-muted-foreground" /></div>
          ) : queueQ.isError ? (
            <div className="py-8 flex items-center justify-center gap-2 text-sm text-destructive">
              <AlertTriangle className="size-4" /> {String(queueQ.error?.message ?? "Failed to load queue status")}
            </div>
          ) : queues.length === 0 ? (
            <p className="py-8 text-center text-sm text-muted-foreground">No email queues found yet.</p>
          ) : (
            <div className="grid gap-3 sm:grid-cols-2">
              {queues.map((q: any) => (
                <div key={q.queue} className="rounded-xl border border-border/40 bg-white/[0.02] p-4">
                  <p className="text-[13px] font-medium mb-3">{prettyQueue(q.queue)}</p>
                  <div className="grid grid-cols-4 gap-2 text-center">
                    <div>
                      <p className="text-lg font-display">{q.queued}</p>
                      <p className="text-[9px] font-mono uppercase tracking-wider text-muted-foreground">Queued</p>
                    </div>
                    <div>
                      <p className="text-lg font-display text-sky-400">{q.in_flight}</p>
                      <p className="text-[9px] font-mono uppercase tracking-wider text-muted-foreground">In-flight</p>
                    </div>
                    <div>
                      <p className={`text-lg font-display ${q.dlq > 0 ? "text-destructive" : ""}`}>{q.dlq}</p>
                      <p className="text-[9px] font-mono uppercase tracking-wider text-muted-foreground">DLQ</p>
                    </div>
                    <div>
                      <p className="text-lg font-display text-muted-foreground">{q.archived}</p>
                      <p className="text-[9px] font-mono uppercase tracking-wider text-muted-foreground">Archived</p>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </section>

        {/* Send logs */}
        <section className="card-premium rounded-2xl p-5">
          <div className="flex items-center gap-2 mb-1">
            <Mail className="size-4 text-accent" />
            <h2 className="text-sm font-medium">Send logs</h2>
          </div>
          <p className="text-[11px] text-muted-foreground mb-4">
            Deduplicated send history (latest status per email) for the selected period.
          </p>

          {stats && (
            <div className="grid grid-cols-2 sm:grid-cols-5 gap-2.5 mb-4">
              <QueueStat icon={Mail} label="Total" value={stats.total} color="text-foreground" />
              <QueueStat icon={Send} label="Sent" value={stats.sent} color="text-emerald-400" />
              <QueueStat icon={Timer} label="Pending" value={stats.pending} color="text-sky-400" />
              <QueueStat icon={Skull} label="Failed" value={stats.failed} color="text-destructive" />
              <QueueStat icon={Archive} label="Suppressed" value={stats.suppressed} color="text-amber-400" />
            </div>
          )}

          {/* Filters */}
          <div className="flex flex-wrap items-center gap-2 mb-4">
            <select
              value={template}
              onChange={(e) => setTemplate(e.target.value)}
              className="rounded-full border border-border/60 bg-white/[0.02] px-3 py-1.5 text-[11px] font-mono text-foreground focus:outline-none focus:ring-1 focus:ring-accent/40"
            >
              <option value="">All templates</option>
              {templates.map((t) => (
                <option key={t} value={t}>{t}</option>
              ))}
            </select>
            <div className="inline-flex rounded-full border border-border/60 bg-white/[0.02] p-0.5">
              {STATUS_FILTERS.map((s) => (
                <button
                  key={s.id || "all"}
                  onClick={() => setStatus(s.id)}
                  className={`px-2.5 py-1 rounded-full text-[10px] font-mono uppercase tracking-widest transition-colors ${
                    status === s.id ? "bg-accent/15 text-accent" : "text-muted-foreground hover:text-foreground"
                  }`}
                >
                  {s.label}
                </button>
              ))}
            </div>
          </div>

          {logQ.isLoading ? (
            <div className="py-10 grid place-items-center"><Loader2 className="size-4 animate-spin text-muted-foreground" /></div>
          ) : logQ.isError ? (
            <div className="py-8 flex items-center justify-center gap-2 text-sm text-destructive">
              <AlertTriangle className="size-4" /> {String(logQ.error?.message ?? "Failed to load logs")}
            </div>
          ) : logs.length === 0 ? (
            <p className="py-8 text-center text-sm text-muted-foreground">No emails match these filters in this period.</p>
          ) : (
            <div className="rounded-xl border border-border/40 divide-y divide-border/40 overflow-hidden">
              {logs.map((l: any) => (
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
      </div>
    </AdminShell>
  );
}
