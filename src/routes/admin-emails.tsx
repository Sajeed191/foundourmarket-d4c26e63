import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { useQuery } from "@tanstack/react-query";
import {
  Mail, ShieldCheck, Globe, AtSign, CheckCircle2, Clock, AlertTriangle,
  Loader2, RefreshCw, ListFilter, Send,
} from "lucide-react";
import { AdminShell } from "@/components/admin/AdminShell";
import { getEmailActivity } from "@/lib/email-admin.functions";

export const Route = createFileRoute("/admin-emails")({
  head: () => ({ meta: [{ title: "Email settings — Admin" }] }),
  component: EmailsPage,
});

const SENDER_DOMAIN = "notify.foundourmarket.com";
const ROOT_DOMAIN = "foundourmarket.com";

const DNS_CHECKLIST = [
  { record: "NS", name: SENDER_DOMAIN, value: "ns3.lovable.cloud / ns4.lovable.cloud", purpose: "Delegation" },
  { record: "SPF", name: SENDER_DOMAIN, value: "v=spf1 include:lovable.cloud ~all", purpose: "Sender authorization" },
  { record: "DKIM", name: `*._domainkey.${SENDER_DOMAIN}`, value: "Managed key (auto-rotated)", purpose: "Signature" },
  { record: "DMARC", name: `_dmarc.${SENDER_DOMAIN}`, value: "v=DMARC1; p=quarantine; rua=…", purpose: "Policy & reporting" },
  { record: "MX", name: SENDER_DOMAIN, value: "Managed mail exchanger", purpose: "Routing" },
];

const SENDER_IDENTITIES = [
  { address: `orders@${ROOT_DOMAIN}`, label: "Order & shipping updates", purpose: "Transactional" },
  { address: `support@${ROOT_DOMAIN}`, label: "Customer support", purpose: "Reply-to" },
  { address: `no-reply@${ROOT_DOMAIN}`, label: "Account & auth emails", purpose: "System" },
];

const RANGES = [
  { id: "24h" as const, label: "24h" },
  { id: "7d" as const, label: "7 days" },
  { id: "30d" as const, label: "30 days" },
];

function StatusBadge({ status }: { status: string }) {
  const map: Record<string, string> = {
    sent: "text-emerald-400 bg-emerald-400/10 ring-emerald-400/20",
    pending: "text-amber-400 bg-amber-400/10 ring-amber-400/20",
    suppressed: "text-amber-400 bg-amber-400/10 ring-amber-400/20",
    failed: "text-destructive bg-destructive/10 ring-destructive/20",
    dlq: "text-destructive bg-destructive/10 ring-destructive/20",
    bounced: "text-destructive bg-destructive/10 ring-destructive/20",
    complained: "text-destructive bg-destructive/10 ring-destructive/20",
  };
  const cls = map[status] ?? "text-muted-foreground bg-white/5 ring-white/10";
  return (
    <span className={`inline-flex items-center rounded-full px-2 py-0.5 text-[10px] font-mono uppercase tracking-widest ring-1 ring-inset ${cls}`}>
      {status}
    </span>
  );
}

function EmailsPage() {
  const fetchActivity = useServerFn(getEmailActivity);
  const [range, setRange] = useState<"24h" | "7d" | "30d">("7d");
  const [template, setTemplate] = useState<string>("");
  const [status, setStatus] = useState<string>("");

  const { data, isLoading, isFetching, refetch, isError, error } = useQuery({
    queryKey: ["email-activity", range, template, status],
    queryFn: () =>
      fetchActivity({
        data: {
          range,
          template: template || null,
          status: status || null,
          limit: 100,
        },
      }),
  }) as any;

  const stats = data?.stats;
  const templates: string[] = data?.templates ?? [];
  const logs = data?.logs ?? [];

  return (
    <AdminShell
      title="Email settings"
      subtitle="Sender domain, deliverability & activity"
      allow={["admin", "super_admin", "manager"]}
      actions={
        <button
          onClick={() => refetch()}
          className="inline-flex items-center gap-1.5 rounded-full border border-border/60 bg-white/[0.03] px-3 py-1.5 text-[11px] font-mono uppercase tracking-widest text-muted-foreground hover:text-foreground transition-colors"
        >
          <RefreshCw className={`size-3 ${isFetching ? "animate-spin" : ""}`} /> Refresh
        </button>
      }
    >
      <div className="space-y-6">
        {/* Domain verification status */}
        <section className="card-premium rounded-2xl p-5">
          <div className="flex items-start justify-between gap-4 flex-wrap">
            <div className="flex items-center gap-3">
              <div className="size-10 rounded-xl bg-accent/10 ring-1 ring-inset ring-accent/20 grid place-items-center">
                <Globe className="size-4 text-accent" />
              </div>
              <div>
                <p className="text-sm font-medium">{SENDER_DOMAIN}</p>
                <p className="text-[11px] text-muted-foreground">Verified sender subdomain · root {ROOT_DOMAIN}</p>
              </div>
            </div>
            <span className="inline-flex items-center gap-1.5 rounded-full bg-amber-400/10 ring-1 ring-inset ring-amber-400/20 px-3 py-1 text-[11px] font-mono uppercase tracking-widest text-amber-400">
              <Clock className="size-3" /> Verifying DNS
            </span>
          </div>
          <p className="mt-4 text-xs text-muted-foreground leading-relaxed">
            DNS authentication records are provisioned and managed automatically through Lovable's nameservers.
            Verification can take up to 72 hours to propagate. Once active, transactional and auth emails send from
            your branded domain.
          </p>
        </section>

        {/* DNS checklist + Sender identities */}
        <div className="grid gap-6 lg:grid-cols-2">
          <section className="card-premium rounded-2xl p-5">
            <div className="flex items-center gap-2 mb-4">
              <ShieldCheck className="size-4 text-accent" />
              <h2 className="text-sm font-medium">DNS checklist</h2>
            </div>
            <div className="space-y-2.5">
              {DNS_CHECKLIST.map((d) => (
                <div key={d.record} className="flex items-start gap-3 rounded-xl border border-border/40 bg-white/[0.02] px-3 py-2.5">
                  <CheckCircle2 className="size-4 text-emerald-400/80 shrink-0 mt-0.5" />
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2">
                      <span className="font-mono text-[11px] uppercase tracking-widest text-accent">{d.record}</span>
                      <span className="text-[10px] text-muted-foreground">· {d.purpose}</span>
                    </div>
                    <p className="font-mono text-[11px] text-foreground/80 truncate">{d.name}</p>
                    <p className="font-mono text-[10px] text-muted-foreground truncate">{d.value}</p>
                  </div>
                </div>
              ))}
            </div>
            <p className="mt-3 text-[10px] text-muted-foreground">Records are auto-managed — nothing to copy or paste manually.</p>
          </section>

          <section className="card-premium rounded-2xl p-5">
            <div className="flex items-center gap-2 mb-4">
              <AtSign className="size-4 text-accent" />
              <h2 className="text-sm font-medium">Sender identities</h2>
            </div>
            <div className="space-y-2.5">
              {SENDER_IDENTITIES.map((s) => (
                <div key={s.address} className="flex items-center gap-3 rounded-xl border border-border/40 bg-white/[0.02] px-3 py-2.5">
                  <div className="size-8 rounded-lg bg-accent/[0.08] grid place-items-center shrink-0">
                    <Send className="size-3.5 text-accent" />
                  </div>
                  <div className="min-w-0 flex-1">
                    <p className="text-[13px] font-medium truncate">{s.address}</p>
                    <p className="text-[11px] text-muted-foreground truncate">{s.label}</p>
                  </div>
                  <span className="text-[9px] font-mono uppercase tracking-widest text-muted-foreground/70">{s.purpose}</span>
                </div>
              ))}
            </div>
          </section>
        </div>

        {/* Activity logs */}
        <section className="card-premium rounded-2xl p-5">
          <div className="flex items-center justify-between gap-3 flex-wrap mb-4">
            <div className="flex items-center gap-2">
              <Mail className="size-4 text-accent" />
              <h2 className="text-sm font-medium">Email activity</h2>
            </div>
            <div className="flex items-center gap-2 flex-wrap">
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
              <div className="inline-flex items-center gap-1.5 rounded-full border border-border/60 bg-white/[0.02] px-2.5 py-1">
                <ListFilter className="size-3 text-muted-foreground" />
                <select
                  value={template}
                  onChange={(e) => setTemplate(e.target.value)}
                  className="bg-transparent text-[11px] focus:outline-none text-muted-foreground"
                >
                  <option value="">All templates</option>
                  {templates.map((t) => (
                    <option key={t} value={t} className="bg-card">{t}</option>
                  ))}
                </select>
              </div>
              <select
                value={status}
                onChange={(e) => setStatus(e.target.value)}
                className="rounded-full border border-border/60 bg-white/[0.02] px-2.5 py-1 text-[11px] focus:outline-none text-muted-foreground"
              >
                <option value="">All status</option>
                <option value="sent" className="bg-card">Sent</option>
                <option value="pending" className="bg-card">Pending</option>
                <option value="failed" className="bg-card">Failed</option>
                <option value="suppressed" className="bg-card">Suppressed</option>
              </select>
            </div>
          </div>

          {/* Summary stats */}
          {stats && (
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5 mb-4">
              {[
                { label: "Total", value: stats.total, color: "text-foreground" },
                { label: "Sent", value: stats.sent, color: "text-emerald-400" },
                { label: "Failed", value: stats.failed, color: "text-destructive" },
                { label: "Suppressed", value: stats.suppressed, color: "text-amber-400" },
              ].map((s) => (
                <div key={s.label} className="rounded-xl border border-border/40 bg-white/[0.02] px-3 py-2.5">
                  <p className={`text-xl font-display ${s.color}`}>{s.value}</p>
                  <p className="text-[9px] font-mono uppercase tracking-[0.2em] text-muted-foreground mt-1">{s.label}</p>
                </div>
              ))}
            </div>
          )}

          {isLoading ? (
            <div className="py-10 grid place-items-center">
              <Loader2 className="size-4 animate-spin text-muted-foreground" />
            </div>
          ) : isError ? (
            <div className="py-8 flex items-center justify-center gap-2 text-sm text-destructive">
              <AlertTriangle className="size-4" /> {String(error?.message ?? "Failed to load")}
            </div>
          ) : logs.length === 0 ? (
            <p className="py-8 text-center text-sm text-muted-foreground">No emails sent in this period yet.</p>
          ) : (
            <div className="rounded-xl border border-border/40 divide-y divide-border/40 overflow-hidden">
              {logs.map((l: any) => (
                <div key={l.id} className="px-4 py-3 flex items-center gap-3">
                  <div className="min-w-0 flex-1">
                    <p className="text-[13px] truncate">{l.recipient_email}</p>
                    <p className="text-[10px] font-mono text-muted-foreground truncate">
                      {l.template_name}
                      {l.error_message && <span className="text-destructive"> · {l.error_message}</span>}
                    </p>
                  </div>
                  <StatusBadge status={l.status} />
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
