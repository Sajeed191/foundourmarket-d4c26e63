import { createFileRoute } from "@tanstack/react-router";
import { useCallback, useEffect, useState } from "react";

import { useServerFn } from "@tanstack/react-start";
import { motion, AnimatePresence } from "framer-motion";
import {
  Wallet, Search, Download, RotateCcw, Loader2, CheckCircle2, XCircle,
  Radio, Webhook, ShieldCheck, ShieldAlert, X, IndianRupee, ToggleLeft, ToggleRight, ChevronLeft, ChevronRight,

} from "lucide-react";
import { AdminShell } from "@/components/admin/AdminShell";
import { supabase } from "@/integrations/supabase/client";
import { createRazorpayRefund } from "@/lib/razorpay.functions";
import { VirtualTable } from "@/components/admin/VirtualTable";
import { PaymentGatewayStatusCenter } from "@/components/admin/PaymentGatewayStatusCenter";
import { CheckoutRegionDebug } from "@/components/admin/CheckoutRegionDebug";

export const Route = createFileRoute("/admin-payments")({
  head: () => ({
    meta: [
      { title: "Payments — FoundOurMarket™" },
      { name: "description", content: "Realtime transactions, refunds and webhook monitoring." },
    ],
  }),
  component: PaymentsPage,
});

type Payment = {
  id: string; order_id: string; user_id: string; method: string; status: string;
  amount: number; currency: string; transaction_id: string;
  razorpay_payment_id: string | null; razorpay_order_id: string | null;
  fee: number; demo: boolean; created_at: string;
};
type Refund = {
  id: string; order_id: string; amount: number; currency: string;
  reason: string | null; status: string; razorpay_refund_id: string | null; created_at: string;
};
type WebhookLog = {
  id: string; event: string; signature_valid: boolean; status: string;
  error: string | null; created_at: string;
};

const inr = (v: number, c = "INR") =>
  new Intl.NumberFormat("en-IN", { style: "currency", currency: c, maximumFractionDigits: 0 }).format(Number(v) || 0);
const when = (s: string) => new Date(s).toLocaleString("en-IN", { dateStyle: "medium", timeStyle: "short" });

function downloadCsv(name: string, rows: Record<string, unknown>[]) {
  if (!rows.length) return;
  const headers = Object.keys(rows[0]);
  const esc = (v: unknown) => `"${String(v ?? "").replace(/"/g, '""')}"`;
  const csv = [headers.join(","), ...rows.map((r) => headers.map((h) => esc(r[h])).join(","))].join("\n");
  const url = URL.createObjectURL(new Blob([csv], { type: "text/csv" }));
  const a = document.createElement("a");
  a.href = url; a.download = `${name}-${new Date().toISOString().slice(0, 10)}.csv`; a.click();
  URL.revokeObjectURL(url);
}

function StatusPill({ status }: { status: string }) {
  const map: Record<string, string> = {
    succeeded: "text-emerald-400 border-emerald-500/30 bg-emerald-500/10",
    processed: "text-emerald-400 border-emerald-500/30 bg-emerald-500/10",
    pending: "text-amber-400 border-amber-500/30 bg-amber-500/10",
    failed: "text-destructive border-destructive/30 bg-destructive/10",
    rejected: "text-destructive border-destructive/30 bg-destructive/10",
    received: "text-sky-400 border-sky-500/30 bg-sky-500/10",
    error: "text-destructive border-destructive/30 bg-destructive/10",
  };
  return (
    <span className={`inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-[10px] font-mono uppercase tracking-widest ${map[status] ?? "text-muted-foreground border-white/10 bg-white/5"}`}>
      {status}
    </span>
  );
}

function PaymentsPage() {
  return (
    <AdminShell title="Payments" subtitle="Realtime transactions, refunds & webhooks" allow={["admin", "super_admin", "manager", "support"]}>
      <PaymentsInner />
    </AdminShell>
  );
}

const PAGE_SIZE = 100;

function PaymentsInner() {
  const [tab, setTab] = useState<"transactions" | "refunds" | "webhooks">("transactions");
  const [payments, setPayments] = useState<Payment[]>([]);
  const [refunds, setRefunds] = useState<Refund[]>([]);
  const [logs, setLogs] = useState<WebhookLog[]>([]);
  const [loading, setLoading] = useState(true);
  const [tableLoading, setTableLoading] = useState(false);
  const [query, setQuery] = useState("");
  const [searchTerm, setSearchTerm] = useState("");
  const [statusFilter, setStatusFilter] = useState<string>("all");
  const [page, setPage] = useState(0);
  const [totalCount, setTotalCount] = useState(0);
  const [drawer, setDrawer] = useState<Payment | null>(null);
  const [pulse, setPulse] = useState(false);
  const [cod, setCod] = useState<boolean | null>(null);
  const [stats, setStats] = useState({ gross: 0, count: 0, refunded: 0, failed: 0 });

  const refundFn = useServerFn(createRazorpayRefund);
  const [refundBusy, setRefundBusy] = useState<string | null>(null);
  const [refundMsg, setRefundMsg] = useState<string | null>(null);

  // Debounce search input → server query
  useEffect(() => {
    const t = setTimeout(() => setSearchTerm(query), 300);
    return () => clearTimeout(t);
  }, [query]);

  // Reset to first page whenever filters change
  useEffect(() => { setPage(0); }, [searchTerm, statusFilter]);

  // Paginated transactions fetch (server-side range + count)
  const loadPayments = useCallback(async () => {
    setTableLoading(true);
    let qb = supabase
      .from("payments")
      .select("*", { count: "exact" })
      .order("created_at", { ascending: false });
    if (statusFilter !== "all") qb = qb.eq("status", statusFilter);
    const term = searchTerm.trim();
    if (term) {
      const safe = term.replace(/[%,()]/g, "");
      if (safe) {
        qb = qb.or(
          `transaction_id.ilike.%${safe}%,razorpay_payment_id.ilike.%${safe}%,method.ilike.%${safe}%`,
        );
      }
    }
    const from = page * PAGE_SIZE;
    qb = qb.range(from, from + PAGE_SIZE - 1);
    const { data, count } = await qb;
    setPayments((data as Payment[]) ?? []);
    setTotalCount(count ?? 0);
    setTableLoading(false);
  }, [statusFilter, searchTerm, page]);

  // Aggregate KPIs + refunds/webhooks/settings (independent of pagination)
  const loadAux = useCallback(async () => {
    const [succ, fail, r, w, s] = await Promise.all([
      supabase.from("payments").select("amount").eq("status", "succeeded"),
      supabase.from("payments").select("id", { count: "exact", head: true }).eq("status", "failed"),
      supabase.from("refunds").select("*").order("created_at", { ascending: false }).limit(500),
      supabase.from("webhook_logs").select("id,event,signature_valid,status,error,created_at").order("created_at", { ascending: false }).limit(200),
      supabase.from("store_settings").select("cod_enabled").limit(1).maybeSingle(),
    ]);
    const succeeded = (succ.data as { amount: number }[]) ?? [];
    const refundRows = (r.data as Refund[]) ?? [];
    setRefunds(refundRows);
    setLogs((w.data as WebhookLog[]) ?? []);
    setCod(s.data ? !!s.data.cod_enabled : false);
    setStats({
      gross: succeeded.reduce((sum, p) => sum + Number(p.amount), 0),
      count: succeeded.length,
      failed: fail.count ?? 0,
      refunded: refundRows.filter((rf) => rf.status !== "failed").reduce((sum, rf) => sum + Number(rf.amount), 0),
    });
  }, []);

  useEffect(() => { loadPayments(); }, [loadPayments]);
  useEffect(() => { loadAux().finally(() => setLoading(false)); }, [loadAux]);

  // Realtime sync across payments / refunds / webhooks
  useEffect(() => {
    const ping = () => { setPulse(true); setTimeout(() => setPulse(false), 1200); loadPayments(); loadAux(); };
    const ch = supabase
      .channel("admin-payments-live")
      .on("postgres_changes", { event: "*", schema: "public", table: "payments" }, ping)
      .on("postgres_changes", { event: "*", schema: "public", table: "refunds" }, ping)
      .on("postgres_changes", { event: "*", schema: "public", table: "webhook_logs" }, ping)
      .subscribe();
    return () => { supabase.removeChannel(ch); };
  }, [loadPayments, loadAux]);

  async function toggleCod() {
    if (cod === null) return;
    const next = !cod;
    setCod(next);
    const { data: existing } = await supabase.from("store_settings").select("cod_enabled").limit(1).maybeSingle();
    if (existing) {
      await supabase.from("store_settings").update({ cod_enabled: next, updated_at: new Date().toISOString() }).neq("cod_enabled", next);
    }
  }

  async function doRefund(p: Payment) {
    setRefundBusy(p.id); setRefundMsg(null);
    try {
      await refundFn({ data: { paymentId: p.id, reason: "admin_initiated" } });
      setRefundMsg(`Refund initiated for ${p.transaction_id}.`);
      setDrawer(null);
    } catch (e: any) {
      setRefundMsg(e?.message ?? "Refund failed.");
    } finally {
      setRefundBusy(null);
    }
  }

  // Server already filtered + paginated; render rows as-is.
  const filteredPayments = payments;
  const pageCount = Math.max(1, Math.ceil(totalCount / PAGE_SIZE));


  if (loading) {
    return <div className="min-h-[40vh] grid place-items-center"><Loader2 className="size-5 animate-spin text-accent" /></div>;
  }

  return (
    <div className="space-y-6">
      {/* Admin-only checkout region / currency debug */}
      <CheckoutRegionDebug />

      {/* International payment gateway status */}
      <PaymentGatewayStatusCenter />

      {/* KPIs */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        <Kpi icon={IndianRupee} label="Gross collected" value={inr(stats.gross)} />
        <Kpi icon={CheckCircle2} label="Successful" value={String(stats.count)} />
        <Kpi icon={RotateCcw} label="Refunded" value={inr(stats.refunded)} />
        <Kpi icon={XCircle} label="Failed" value={String(stats.failed)} />

      </div>

      {/* Controls */}
      <div className="flex flex-wrap items-center gap-2">
        <div className="inline-flex items-center gap-1.5 text-[10px] font-mono uppercase tracking-widest text-emerald-400">
          <Radio className={`size-3 ${pulse ? "text-accent animate-ping" : ""}`} /> Live
        </div>
        <div className="ml-auto inline-flex items-center gap-2">
          <button onClick={toggleCod}
            className="inline-flex items-center gap-1.5 rounded-full border border-white/10 px-3 py-1.5 text-[10px] font-mono uppercase tracking-widest hover:bg-white/5">
            {cod ? <ToggleRight className="size-4 text-emerald-400" /> : <ToggleLeft className="size-4 text-muted-foreground" />}
            COD {cod ? "on" : "off"}
          </button>
          <button onClick={() => downloadCsv("transactions", filteredPayments as any)}
            className="inline-flex items-center gap-1.5 rounded-full border border-white/10 px-3 py-1.5 text-[10px] font-mono uppercase tracking-widest hover:bg-white/5">
            <Download className="size-3.5" /> Export
          </button>
        </div>
      </div>

      {/* Tabs */}
      <div className="flex gap-1 rounded-full border border-white/10 p-1 w-fit">
        {(["transactions", "refunds", "webhooks"] as const).map((t) => (
          <button key={t} onClick={() => setTab(t)}
            className={`px-4 py-1.5 rounded-full text-xs capitalize transition-colors ${tab === t ? "bg-accent text-accent-foreground font-semibold" : "text-muted-foreground hover:text-foreground"}`}>
            {t}
          </button>
        ))}
      </div>

      {refundMsg && <p className="text-xs text-accent">{refundMsg}</p>}

      {tab === "transactions" && (
        <>
          <div className="flex flex-wrap gap-2">
            <div className="relative flex-1 min-w-[180px]">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 size-3.5 text-muted-foreground" />
              <input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Search payment / order ID…"
                className="w-full bg-white/[0.03] border border-white/10 rounded-xl pl-9 pr-3 py-2 text-xs focus:outline-none focus:border-accent/40" />
            </div>
            <select value={statusFilter} onChange={(e) => setStatusFilter(e.target.value)}
              className="bg-white/[0.03] border border-white/10 rounded-xl px-3 py-2 text-xs focus:outline-none focus:border-accent/40">
              {["all", "succeeded", "pending", "failed"].map((s) => <option key={s} value={s} className="bg-background">{s}</option>)}
            </select>
          </div>

          {/* Desktop table / mobile cards */}
          <div className="glass border border-white/10 rounded-2xl overflow-hidden">
            {/* Desktop: virtualized rows */}
            <div className="hidden md:block">
              <VirtualTable
                rows={filteredPayments}
                rowKey={(p) => p.id}
                estimateSize={52}
                gridTemplate="1.4fr 0.9fr 0.9fr 0.8fr 0.9fr 1fr 0.8fr"
                empty="No transactions found."
                header={
                  <>
                    <div className="p-3 text-left">Payment</div><div className="p-3 text-left">Order</div>
                    <div className="p-3 text-left">Amount</div><div className="p-3 text-left">Method</div>
                    <div className="p-3 text-left">Status</div><div className="p-3 text-left">Time</div><div className="p-3" />
                  </>
                }
                renderRow={(p) => (
                  <div className="contents cursor-pointer [&>div]:hover:bg-white/[0.02]" onClick={() => setDrawer(p)}>
                    <div className="p-3 font-mono text-xs truncate">{p.transaction_id?.slice(0, 16)}</div>
                    <div className="p-3 font-mono text-xs">#{p.order_id.slice(0, 8)}</div>
                    <div className="p-3 font-mono">{inr(p.amount, p.currency)}</div>
                    <div className="p-3 capitalize text-xs">{p.method}</div>
                    <div className="p-3"><StatusPill status={p.status} /></div>
                    <div className="p-3 text-xs text-muted-foreground">{when(p.created_at)}</div>
                    <div className="p-3 text-right">
                      {p.status === "succeeded" && !p.demo && (
                        <button onClick={(e) => { e.stopPropagation(); doRefund(p); }} disabled={refundBusy === p.id}
                          className="inline-flex items-center gap-1 rounded-full border border-white/10 px-2.5 py-1 text-[10px] uppercase tracking-widest hover:bg-white/5 disabled:opacity-50">
                          {refundBusy === p.id ? <Loader2 className="size-3 animate-spin" /> : <RotateCcw className="size-3" />} Refund
                        </button>
                      )}
                    </div>
                  </div>
                )}
              />
            </div>
            {/* Mobile: virtualized compact cards */}
            <div className="md:hidden">
              <VirtualTable
                rows={filteredPayments}
                rowKey={(p) => p.id}
                estimateSize={84}
                empty="No transactions found."
                renderRow={(p) => (
                  <button onClick={() => setDrawer(p)} className="w-full text-left p-4 active:bg-white/[0.03]">
                    <div className="flex items-center justify-between mb-1">
                      <span className="font-mono text-xs">#{p.order_id.slice(0, 8)}</span>
                      <StatusPill status={p.status} />
                    </div>
                    <div className="flex items-center justify-between">
                      <span className="font-mono text-base">{inr(p.amount, p.currency)}</span>
                      <span className="text-[10px] text-muted-foreground capitalize">{p.method}</span>
                    </div>
                    <p className="text-[10px] text-muted-foreground mt-1">{when(p.created_at)}</p>
                  </button>
                )}
              />
            </div>
          </div>

          {/* Pagination */}
          <div className="flex flex-wrap items-center justify-between gap-3 text-[10px] font-mono uppercase tracking-widest text-muted-foreground">
            <span className="inline-flex items-center gap-2">
              {tableLoading && <Loader2 className="size-3 animate-spin text-accent" />}
              {totalCount > 0
                ? `${page * PAGE_SIZE + 1}–${Math.min((page + 1) * PAGE_SIZE, totalCount)} of ${totalCount}`
                : "0 results"}
            </span>
            <div className="inline-flex items-center gap-2">
              <button
                onClick={() => setPage((p) => Math.max(0, p - 1))}
                disabled={page === 0 || tableLoading}
                className="inline-flex items-center gap-1 rounded-full border border-white/10 px-3 py-1.5 hover:bg-white/5 disabled:opacity-40 disabled:cursor-not-allowed"
              >
                <ChevronLeft className="size-3.5" /> Prev
              </button>
              <span className="tabular-nums">Page {page + 1} / {pageCount}</span>
              <button
                onClick={() => setPage((p) => (p + 1 < pageCount ? p + 1 : p))}
                disabled={page + 1 >= pageCount || tableLoading}
                className="inline-flex items-center gap-1 rounded-full border border-white/10 px-3 py-1.5 hover:bg-white/5 disabled:opacity-40 disabled:cursor-not-allowed"
              >
                Next <ChevronRight className="size-3.5" />
              </button>
            </div>
          </div>


        </>
      )}

      {tab === "refunds" && (
        <div className="glass border border-white/10 rounded-2xl overflow-hidden">
          <div className="flex justify-end p-3 border-b border-white/10">
            <button onClick={() => downloadCsv("refunds", refunds as any)}
              className="inline-flex items-center gap-1.5 rounded-full border border-white/10 px-3 py-1.5 text-[10px] font-mono uppercase tracking-widest hover:bg-white/5">
              <Download className="size-3.5" /> Export refunds
            </button>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead><tr className="border-b border-white/10 text-[10px] font-mono uppercase tracking-widest text-muted-foreground">
                <th className="text-left p-3">Order</th><th className="text-left p-3">Amount</th>
                <th className="text-left p-3">Reason</th><th className="text-left p-3">Status</th><th className="text-left p-3">Time</th>
              </tr></thead>
              <tbody>
                {refunds.map((r) => (
                  <tr key={r.id} className="border-b border-white/5">
                    <td className="p-3 font-mono text-xs">#{r.order_id.slice(0, 8)}</td>
                    <td className="p-3 font-mono">{inr(r.amount, r.currency)}</td>
                    <td className="p-3 text-xs text-muted-foreground">{r.reason ?? "—"}</td>
                    <td className="p-3"><StatusPill status={r.status} /></td>
                    <td className="p-3 text-xs text-muted-foreground">{when(r.created_at)}</td>
                  </tr>
                ))}
                {!refunds.length && <tr><td colSpan={5} className="p-8 text-center text-sm text-muted-foreground">No refunds yet.</td></tr>}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {tab === "webhooks" && (
        <div className="glass border border-white/10 rounded-2xl overflow-hidden">
          <div className="flex items-center gap-2 p-3 border-b border-white/10">
            <Webhook className="size-4 text-accent" />
            <span className="text-xs font-mono uppercase tracking-widest text-muted-foreground">Razorpay webhook events</span>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead><tr className="border-b border-white/10 text-[10px] font-mono uppercase tracking-widest text-muted-foreground">
                <th className="text-left p-3">Event</th><th className="text-left p-3">Signature</th>
                <th className="text-left p-3">Status</th><th className="text-left p-3">Time</th>
              </tr></thead>
              <tbody>
                {logs.map((l) => (
                  <tr key={l.id} className="border-b border-white/5">
                    <td className="p-3 font-mono text-xs">{l.event}</td>
                    <td className="p-3">
                      {l.signature_valid
                        ? <span className="inline-flex items-center gap-1 text-emerald-400 text-[10px]"><ShieldCheck className="size-3" /> Valid</span>
                        : <span className="inline-flex items-center gap-1 text-destructive text-[10px]"><ShieldAlert className="size-3" /> Invalid</span>}
                    </td>
                    <td className="p-3"><StatusPill status={l.status} /></td>
                    <td className="p-3 text-xs text-muted-foreground">{when(l.created_at)}</td>
                  </tr>
                ))}
                {!logs.length && <tr><td colSpan={4} className="p-8 text-center text-sm text-muted-foreground">No webhook events received yet.</td></tr>}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Detail drawer */}
      <AnimatePresence>
        {drawer && (
          <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
            className="fixed inset-0 z-50 bg-black/60 backdrop-blur-sm" onClick={() => setDrawer(null)}>
            <motion.div initial={{ x: "100%" }} animate={{ x: 0 }} exit={{ x: "100%" }} transition={{ type: "spring", stiffness: 320, damping: 34 }}
              onClick={(e) => e.stopPropagation()}
              className="absolute right-0 top-0 bottom-0 w-full max-w-md glass-strong border-l border-white/10 p-6 overflow-y-auto">
              <div className="flex items-center justify-between mb-6">
                <h3 className="text-lg font-display font-semibold">Transaction</h3>
                <button onClick={() => setDrawer(null)} className="size-8 grid place-items-center rounded-full hover:bg-white/5"><X className="size-4" /></button>
              </div>
              <div className="space-y-3">
                <Detail label="Payment ID" value={drawer.transaction_id} />
                <Detail label="Razorpay payment" value={drawer.razorpay_payment_id ?? "—"} />
                <Detail label="Razorpay order" value={drawer.razorpay_order_id ?? "—"} />
                <Detail label="Order" value={`#${drawer.order_id.slice(0, 8)}`} />
                <Detail label="Amount" value={inr(drawer.amount, drawer.currency)} />
                <Detail label="Gateway fee" value={inr(drawer.fee, drawer.currency)} />
                <Detail label="Method" value={drawer.method} />
                <Detail label="Status" value={drawer.status} />
                <Detail label="Created" value={when(drawer.created_at)} />
              </div>
              {drawer.status === "succeeded" && !drawer.demo && (
                <button onClick={() => doRefund(drawer)} disabled={refundBusy === drawer.id}
                  className="w-full mt-6 inline-flex items-center justify-center gap-2 bg-destructive/10 text-destructive border border-destructive/30 font-bold py-3 rounded-full text-xs uppercase tracking-widest hover:bg-destructive/20 disabled:opacity-50">
                  {refundBusy === drawer.id ? <Loader2 className="size-3.5 animate-spin" /> : <RotateCcw className="size-3.5" />} Issue full refund
                </button>
              )}
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

function Kpi({ icon: Icon, label, value }: { icon: typeof Wallet; label: string; value: string }) {
  return (
    <div className="glass border border-white/10 rounded-2xl p-4">
      <Icon className="size-4 text-accent mb-2" />
      <p className="text-lg font-display tabular-nums">{value}</p>
      <p className="text-[10px] font-mono uppercase tracking-widest text-muted-foreground mt-1">{label}</p>
    </div>
  );
}

function Detail({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-start justify-between gap-3 border-b border-white/5 pb-2">
      <span className="text-[10px] font-mono uppercase tracking-widest text-muted-foreground shrink-0">{label}</span>
      <span className="font-mono text-xs text-right break-all">{value}</span>
    </div>
  );
}
