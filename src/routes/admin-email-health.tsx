import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { useQuery } from "@tanstack/react-query";
import {
  AlertTriangle, Loader2, RefreshCw, MailWarning, ShieldAlert, CheckCircle2,
  Send, Inbox, XCircle, Layers,
} from "lucide-react";
import {
  ResponsiveContainer, AreaChart, Area, LineChart, Line, XAxis, YAxis,
  CartesianGrid, Tooltip, Legend,
} from "recharts";
import { AdminShell } from "@/components/admin/AdminShell";
import { getEmailDeliverability, getEmailQueueStatus } from "@/lib/email-admin.functions";

export const Route = createFileRoute("/admin-email-health")({
  head: () => ({ meta: [{ title: "Email health — Admin" }] }),
  component: EmailHealthPage,
});

const RANGES = [
  { id: "7d" as const, label: "7 days" },
  { id: "30d" as const, label: "30 days" },
  { id: "90d" as const, label: "90 days" },
];

function StatCard({
  label, value, suffix, color, icon: Icon, hint,
}: {
  label: string; value: number | string; suffix?: string; color: string;
  icon: React.ComponentType<{ className?: string }>; hint?: string;
}) {
  return (
    <div className="rounded-xl border border-border/40 bg-white/[0.02] px-4 py-3">
      <div className="flex items-center justify-between">
        <p className="text-[9px] font-mono uppercase tracking-[0.2em] text-muted-foreground">{label}</p>
        <Icon className={`h-3.5 w-3.5 ${color}`} />
      </div>
      <p className={`mt-1.5 text-2xl font-display ${color}`}>
        {value}
        {suffix && <span className="text-sm">{suffix}</span>}
      </p>
      {hint && <p className="text-[10px] text-muted-foreground mt-0.5">{hint}</p>}
    </div>
  );
}

const tooltipStyle = {
  background: "hsl(var(--popover))",
  border: "1px solid hsl(var(--border))",
  borderRadius: 12,
  fontSize: 12,
} as const;

function EmailHealthPage() {
  const fetchHealth = useServerFn(getEmailDeliverability);
  const [range, setRange] = useState<"7d" | "30d" | "90d">("30d");

  const { data, isLoading, isFetching, refetch, isError, error } = useQuery({
    queryKey: ["email-deliverability", range],
    queryFn: () => fetchHealth({ data: { range } }),
  }) as any;

  const totals = data?.totals;
  const series = data?.series ?? [];

  return (
    <AdminShell
      title="Email health"
      subtitle="Bounce, complaint & delivery rates over time for transactional emails"
      allow={["admin", "super_admin", "manager"]}
      actions={
        <div className="flex items-center gap-2">
          <div className="flex rounded-lg border border-border/40 bg-white/[0.02] p-0.5">
            {RANGES.map((r) => (
              <button
                key={r.id}
                onClick={() => setRange(r.id)}
                className={`rounded-md px-3 py-1.5 text-xs font-mono transition-colors ${
                  range === r.id ? "bg-primary/15 text-primary" : "text-muted-foreground hover:text-foreground"
                }`}
              >
                {r.label}
              </button>
            ))}
          </div>
          <button
            onClick={() => refetch()}
            className="rounded-lg border border-border/40 bg-white/[0.02] p-2 text-muted-foreground hover:text-foreground"
            title="Refresh"
          >
            <RefreshCw className={`h-4 w-4 ${isFetching ? "animate-spin" : ""}`} />
          </button>
        </div>
      }
    >
      <div className="space-y-5">


        {isLoading ? (
          <div className="flex items-center justify-center py-20 text-muted-foreground">
            <Loader2 className="h-5 w-5 animate-spin mr-2" /> Loading deliverability…
          </div>
        ) : isError ? (
          <div className="flex items-center gap-2 rounded-xl border border-destructive/30 bg-destructive/10 px-4 py-3 text-sm text-destructive">
            <AlertTriangle className="h-4 w-4" />
            {String(error?.message ?? "Failed to load email health.")}
          </div>
        ) : (
          <>
            <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
              <StatCard
                label="Delivery rate" value={totals.deliveryRate} suffix="%"
                color="text-emerald-400" icon={CheckCircle2}
                hint={`${totals.sent} of ${totals.attempted} sent`}
              />
              <StatCard
                label="Bounce rate" value={totals.bounceRate} suffix="%"
                color="text-amber-400" icon={MailWarning}
                hint={`${totals.bounced} bounced`}
              />
              <StatCard
                label="Complaint rate" value={totals.complaintRate} suffix="%"
                color="text-destructive" icon={ShieldAlert}
                hint={`${totals.complained} complaints`}
              />
              <StatCard
                label="Failure rate" value={totals.failureRate} suffix="%"
                color="text-rose-400" icon={AlertTriangle}
                hint={`${totals.failed} failed`}
              />
            </div>

            {series.length === 0 ? (
              <div className="rounded-xl border border-border/40 bg-white/[0.02] px-4 py-16 text-center text-sm text-muted-foreground">
                No email activity in this period.
              </div>
            ) : (
              <>
                <div className="rounded-xl border border-border/40 bg-white/[0.02] p-4">
                  <p className="text-[10px] font-mono uppercase tracking-[0.2em] text-muted-foreground mb-3">
                    Delivery success ({data.bucket})
                  </p>
                  <ResponsiveContainer width="100%" height={240}>
                    <AreaChart data={series} margin={{ top: 4, right: 8, left: -16, bottom: 0 }}>
                      <defs>
                        <linearGradient id="deliv" x1="0" y1="0" x2="0" y2="1">
                          <stop offset="0%" stopColor="hsl(var(--primary))" stopOpacity={0.4} />
                          <stop offset="100%" stopColor="hsl(var(--primary))" stopOpacity={0} />
                        </linearGradient>
                      </defs>
                      <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" opacity={0.3} />
                      <XAxis dataKey="date" tick={{ fontSize: 10 }} stroke="hsl(var(--muted-foreground))" />
                      <YAxis domain={[0, 100]} tick={{ fontSize: 10 }} stroke="hsl(var(--muted-foreground))" unit="%" />
                      <Tooltip contentStyle={tooltipStyle} />
                      <Area
                        type="monotone" dataKey="deliveryRate" name="Delivery %"
                        stroke="hsl(var(--primary))" fill="url(#deliv)" strokeWidth={2}
                      />
                    </AreaChart>
                  </ResponsiveContainer>
                </div>

                <div className="rounded-xl border border-border/40 bg-white/[0.02] p-4">
                  <p className="text-[10px] font-mono uppercase tracking-[0.2em] text-muted-foreground mb-3">
                    Bounce & complaint rate ({data.bucket})
                  </p>
                  <ResponsiveContainer width="100%" height={240}>
                    <LineChart data={series} margin={{ top: 4, right: 8, left: -16, bottom: 0 }}>
                      <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" opacity={0.3} />
                      <XAxis dataKey="date" tick={{ fontSize: 10 }} stroke="hsl(var(--muted-foreground))" />
                      <YAxis tick={{ fontSize: 10 }} stroke="hsl(var(--muted-foreground))" unit="%" />
                      <Tooltip contentStyle={tooltipStyle} />
                      <Legend wrapperStyle={{ fontSize: 11 }} />
                      <Line type="monotone" dataKey="bounceRate" name="Bounce %" stroke="#fbbf24" strokeWidth={2} dot={false} />
                      <Line type="monotone" dataKey="complaintRate" name="Complaint %" stroke="hsl(var(--destructive))" strokeWidth={2} dot={false} />
                    </LineChart>
                  </ResponsiveContainer>
                </div>
              </>
            )}
          </>
        )}
      </div>
    </AdminShell>
  );
}
