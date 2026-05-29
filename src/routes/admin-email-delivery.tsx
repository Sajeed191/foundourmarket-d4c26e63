import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { useQuery } from "@tanstack/react-query";
import {
  AlertTriangle, Loader2, RefreshCw, Search, Mail, PackageCheck,
} from "lucide-react";
import { AdminShell } from "@/components/admin/AdminShell";
import { getOrderEmailDelivery } from "@/lib/email-admin.functions";

export const Route = createFileRoute("/admin-email-delivery")({
  head: () => ({ meta: [{ title: "Email delivery — Admin" }] }),
  component: EmailDeliveryPage,
});

const RANGES = [
  { id: "24h" as const, label: "24h" },
  { id: "7d" as const, label: "7 days" },
  { id: "30d" as const, label: "30 days" },
  { id: "all" as const, label: "All" },
];

type Status = "sent" | "pending" | "failed" | "suppressed" | "not_sent";

const STATUS_STYLE: Record<Status, string> = {
  sent: "text-emerald-400 bg-emerald-400/10 ring-emerald-400/20",
  pending: "text-sky-400 bg-sky-400/10 ring-sky-400/20",
  failed: "text-destructive bg-destructive/10 ring-destructive/20",
  suppressed: "text-amber-400 bg-amber-400/10 ring-amber-400/20",
  not_sent: "text-muted-foreground bg-white/5 ring-white/10",
};

const STATUS_LABEL: Record<Status, string> = {
  sent: "Sent",
  pending: "Pending",
  failed: "Failed",
  suppressed: "Suppressed",
  not_sent: "—",
};

function StatusDot({ status, label, error }: { status: Status; label: string; error: string | null }) {
  return (
    <div
      title={error ? `${label}: ${error}` : `${label}: ${STATUS_LABEL[status]}`}
      className={`flex flex-col items-center gap-1 rounded-lg px-2 py-1.5 ring-1 ring-inset ${STATUS_STYLE[status]}`}
    >
      <span className="text-[9px] font-mono uppercase tracking-widest leading-none">{STATUS_LABEL[status]}</span>
    </div>
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

function EmailDeliveryPage() {
  const fetchDelivery = useServerFn(getOrderEmailDelivery);
  const [range, setRange] = useState<"24h" | "7d" | "30d" | "all">("30d");
  const [searchInput, setSearchInput] = useState("");
  const [search, setSearch] = useState<string | null>(null);

  const { data, isLoading, isFetching, refetch, isError, error } = useQuery({
    queryKey: ["order-email-delivery", range, search],
    queryFn: () => fetchDelivery({ data: { range, search, limit: 40 } }),
  }) as any;

  const totals = data?.totals;
  const events: { event: string; label: string }[] = data?.events ?? [];
  const orders = data?.orders ?? [];

  return (
    <AdminShell
      title="Email delivery"
      subtitle="Per-order transactional email status"
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
        <section className="card-premium rounded-2xl p-5">
          <div className="flex items-center gap-2 mb-1">
            <Mail className="size-4 text-accent" />
            <h2 className="text-sm font-medium">Delivery overview</h2>
          </div>
          <p className="text-[11px] text-muted-foreground mb-4">
            Status of each lifecycle email — order confirmed, payment verified, shipped, out for delivery, delivered and refund — per order.
          </p>

          {totals && (
            <div className="grid grid-cols-2 sm:grid-cols-5 gap-2.5 mb-5">
              <StatCard label="Sent" value={totals.sent} color="text-emerald-400" />
              <StatCard label="Pending" value={totals.pending} color="text-sky-400" />
              <StatCard label="Failed" value={totals.failed} color="text-destructive" />
              <StatCard label="Suppressed" value={totals.suppressed} color="text-amber-400" />
              <StatCard label="Not sent" value={totals.not_sent} color="text-muted-foreground" />
            </div>
          )}

          <form
            onSubmit={(e) => {
              e.preventDefault();
              setSearch(searchInput.trim() || null);
            }}
            className="flex items-center gap-2 mb-4"
          >
            <div className="relative flex-1 max-w-sm">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 size-3.5 text-muted-foreground" />
              <input
                value={searchInput}
                onChange={(e) => setSearchInput(e.target.value)}
                placeholder="Order ID or recipient email"
                className="w-full rounded-full border border-border/60 bg-white/[0.02] pl-9 pr-3 py-1.5 text-[12px] text-foreground placeholder:text-muted-foreground/60 focus:outline-none focus:ring-1 focus:ring-accent/40"
              />
            </div>
            <button
              type="submit"
              className="rounded-full border border-border/60 bg-white/[0.03] px-3 py-1.5 text-[11px] font-mono uppercase tracking-widest text-muted-foreground hover:text-foreground transition-colors"
            >
              Search
            </button>
            {search && (
              <button
                type="button"
                onClick={() => { setSearch(null); setSearchInput(""); }}
                className="text-[11px] font-mono uppercase tracking-widest text-muted-foreground hover:text-foreground"
              >
                Clear
              </button>
            )}
          </form>

          {isLoading ? (
            <div className="py-10 grid place-items-center"><Loader2 className="size-4 animate-spin text-muted-foreground" /></div>
          ) : isError ? (
            <div className="py-8 flex items-center justify-center gap-2 text-sm text-destructive">
              <AlertTriangle className="size-4" /> {String(error?.message ?? "Failed to load")}
            </div>
          ) : orders.length === 0 ? (
            <div className="py-10 flex flex-col items-center gap-2 text-muted-foreground">
              <PackageCheck className="size-5" />
              <p className="text-sm">No orders found for this range.</p>
            </div>
          ) : (
            <div className="overflow-x-auto -mx-1 px-1">
              <table className="w-full border-separate border-spacing-y-1.5">
                <thead>
                  <tr className="text-left">
                    <th className="px-2 py-1 text-[9px] font-mono uppercase tracking-[0.2em] text-muted-foreground">Order</th>
                    {events.map((ev) => (
                      <th key={ev.event} className="px-2 py-1 text-[9px] font-mono uppercase tracking-[0.15em] text-muted-foreground text-center">
                        {ev.label}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {orders.map((o: any) => (
                    <tr key={o.id} className="bg-white/[0.02]">
                      <td className="px-2 py-2 rounded-l-lg align-top">
                        <p className="text-[12px] font-mono text-foreground">#{o.number}</p>
                        <p className="text-[10px] text-muted-foreground truncate max-w-[160px]">{o.recipient ?? "no email"}</p>
                        <p className="text-[9px] text-muted-foreground/70 mt-0.5">{new Date(o.createdAt).toLocaleDateString()}</p>
                      </td>
                      {o.events.map((e: any, i: number) => (
                        <td key={e.event} className={`px-1.5 py-2 align-middle ${i === o.events.length - 1 ? "rounded-r-lg" : ""}`}>
                          <StatusDot status={e.status as Status} label={e.label} error={e.error} />
                        </td>
                      ))}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </section>
      </div>
    </AdminShell>
  );
}
