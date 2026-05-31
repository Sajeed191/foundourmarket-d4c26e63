import { createFileRoute } from "@tanstack/react-router";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import {
  Wallet, Search, Radio, Loader2, ChevronLeft, ChevronRight,
  CheckCircle2, Clock, XCircle, RotateCcw, IndianRupee, TrendingUp, ShoppingBag,
} from "lucide-react";
import { AdminShell } from "@/components/admin/AdminShell";
import { supabase } from "@/integrations/supabase/client";
import { getPaymentCenterFn, type PaymentRow, type PaymentCenterKpis } from "@/lib/payment-center.functions";
import { PaymentIntelDrawer } from "@/components/admin/PaymentIntelDrawer";

export const Route = createFileRoute("/admin-payments")({
  head: () => ({
    meta: [
      { title: "Payment Intelligence — FoundOurMarket™" },
      { name: "description", content: "Centralized payment, customer, shipment, refund & fraud intelligence." },
    ],
  }),
  component: PaymentsPage,
});

const money = (v: number | null | undefined, c = "INR") =>
  new Intl.NumberFormat("en-IN", { style: "currency", currency: c, maximumFractionDigits: 0 }).format(Number(v) || 0);
const when = (s: string) => new Date(s).toLocaleString("en-IN", { dateStyle: "medium", timeStyle: "short" });

function StatusPill({ status }: { status: string | null }) {
  const s = status ?? "—";
  const map: Record<string, string> = {
    succeeded: "text-emerald-400 border-emerald-500/30 bg-emerald-500/10",
    paid: "text-emerald-400 border-emerald-500/30 bg-emerald-500/10",
    pending: "text-amber-400 border-amber-500/30 bg-amber-500/10",
    failed: "text-destructive border-destructive/30 bg-destructive/10",
    refunded: "text-sky-400 border-sky-500/30 bg-sky-500/10",
  };
  return (
    <span className={`inline-flex items-center rounded-full border px-2 py-0.5 text-[10px] font-mono uppercase tracking-widest ${map[s] ?? "text-muted-foreground border-white/10 bg-white/5"}`}>
      {s}
    </span>
  );
}

function Kpi({ icon: Icon, label, value, tone }: { icon: typeof Wallet; label: string; value: string; tone?: string }) {
  return (
    <div className="glass border border-white/10 rounded-2xl p-3">
      <div className="flex items-center gap-2 text-[10px] uppercase tracking-widest text-muted-foreground">
        <Icon className={`size-3.5 ${tone ?? "text-accent"}`} /> {label}
      </div>
      <p className="mt-1 text-lg font-bold tabular-nums">{value}</p>
    </div>
  );
}

const PAGE_SIZE = 50;

function PaymentsPage() {
  return (
    <AdminShell
      title="Payment Intelligence"
      subtitle="Orders · customers · payments · shipments · refunds · fraud"
      allow={["admin", "super_admin", "manager"]}
    >
      <PaymentsInner />
    </AdminShell>
  );
}

function PaymentsInner() {
  const centerFn = useServerFn(getPaymentCenterFn);
  const [query, setQuery] = useState("");
  const [search, setSearch] = useState("");
  const [status, setStatus] = useState<"all" | "succeeded" | "pending" | "failed">("all");
  const [page, setPage] = useState(0);
  const [rows, setRows] = useState<PaymentRow[]>([]);
  const [kpis, setKpis] = useState<PaymentCenterKpis | null>(null);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [pulse, setPulse] = useState(false);
  const [drawer, setDrawer] = useState<PaymentRow | null>(null);
  const reqId = useRef(0);

  useEffect(() => { const t = setTimeout(() => setSearch(query), 300); return () => clearTimeout(t); }, [query]);
  useEffect(() => { setPage(0); }, [search, status]);

  const load = useCallback(async () => {
    const id = ++reqId.current;
    setLoading(true);
    try {
      const res = await centerFn({ data: { search: search || undefined, status, page, pageSize: PAGE_SIZE } });
      if (id !== reqId.current) return;
      setRows(res.rows ?? []);
      setKpis(res.kpis ?? null);
      setTotal(res.total ?? 0);
    } catch {
      if (id === reqId.current) { setRows([]); setTotal(0); }
    } finally {
      if (id === reqId.current) setLoading(false);
    }
  }, [centerFn, search, status, page]);

  useEffect(() => { load(); }, [load]);

  // Realtime: refresh list/KPIs when relevant tables change.
  useEffect(() => {
    const ping = () => { setPulse(true); setTimeout(() => setPulse(false), 1000); load(); };
    const ch = supabase
      .channel("admin-payment-center")
      .on("postgres_changes", { event: "*", schema: "public", table: "payments" }, ping)
      .on("postgres_changes", { event: "*", schema: "public", table: "orders" }, ping)
      .on("postgres_changes", { event: "*", schema: "public", table: "shipments" }, ping)
      .on("postgres_changes", { event: "*", schema: "public", table: "refunds" }, ping)
      .on("postgres_changes", { event: "*", schema: "public", table: "support_tickets" }, ping)
      .on("postgres_changes", { event: "*", schema: "public", table: "notifications" }, ping)
      .subscribe();
    return () => { supabase.removeChannel(ch); };
  }, [load]);

  const pageCount = Math.max(1, Math.ceil(total / PAGE_SIZE));
  const kpiCards = useMemo(() => kpis, [kpis]);

  return (
    <div className="space-y-5">
      {/* KPI bar */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        <Kpi icon={CheckCircle2} tone="text-emerald-400" label="Successful" value={String(kpiCards?.succeeded_count ?? 0)} />
        <Kpi icon={Clock} tone="text-amber-400" label="Pending" value={String(kpiCards?.pending_count ?? 0)} />
        <Kpi icon={XCircle} tone="text-destructive" label="Failed" value={String(kpiCards?.failed_count ?? 0)} />
        <Kpi icon={RotateCcw} tone="text-sky-400" label="Refunded" value={String(kpiCards?.refunded_count ?? 0)} />
        <Kpi icon={IndianRupee} label="Total Revenue" value={money(kpiCards?.total_revenue)} />
        <Kpi icon={RotateCcw} tone="text-sky-400" label="Refund Value" value={money(kpiCards?.refund_value)} />
        <Kpi icon={TrendingUp} tone="text-emerald-400" label="Today's Revenue" value={money(kpiCards?.today_revenue)} />
        <Kpi icon={ShoppingBag} label="Today's Orders" value={String(kpiCards?.today_orders ?? 0)} />
      </div>

      {/* Controls */}
      <div className="flex flex-wrap items-center gap-2">
        <div className="inline-flex items-center gap-1.5 text-[10px] font-mono uppercase tracking-widest text-emerald-400">
          <Radio className={`size-3 ${pulse ? "text-accent animate-ping" : ""}`} /> Live
        </div>
        <div className="relative flex-1 min-w-[220px]">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 size-3.5 text-muted-foreground" />
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search order / payment ID, txn, name, email, phone, tracking…"
            className="w-full bg-white/[0.03] border border-white/10 rounded-xl pl-9 pr-3 py-2 text-xs focus:outline-none focus:border-accent/40"
          />
        </div>
        <select value={status} onChange={(e) => setStatus(e.target.value as typeof status)}
          className="bg-white/[0.03] border border-white/10 rounded-xl px-3 py-2 text-xs focus:outline-none focus:border-accent/40">
          {["all", "succeeded", "pending", "failed"].map((s) => <option key={s} value={s} className="bg-background">{s}</option>)}
        </select>
      </div>

      {/* Table */}
      <div className="glass border border-white/10 rounded-2xl overflow-hidden">
        {/* Desktop */}
        <div className="hidden md:block overflow-x-auto">
          <table className="w-full text-xs">
            <thead>
              <tr className="text-left text-[10px] uppercase tracking-widest text-muted-foreground border-b border-white/10">
                <th className="px-3 py-2.5">Order</th>
                <th className="px-3 py-2.5">Customer</th>
                <th className="px-3 py-2.5">Phone</th>
                <th className="px-3 py-2.5">Amount</th>
                <th className="px-3 py-2.5">Method</th>
                <th className="px-3 py-2.5">Status</th>
                <th className="px-3 py-2.5">Txn / Razorpay</th>
                <th className="px-3 py-2.5">Date</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((p) => (
                <tr key={p.id} onClick={() => setDrawer(p)}
                  className="border-b border-white/5 hover:bg-white/[0.03] cursor-pointer">
                  <td className="px-3 py-2.5 font-mono">{p.order_id?.slice(0, 8) ?? "—"}</td>
                  <td className="px-3 py-2.5">
                    <div className="truncate max-w-[160px]">{p.customer_name || "—"}</div>
                    <div className="text-[10px] text-muted-foreground truncate max-w-[160px]">{p.customer_email || ""}</div>
                  </td>
                  <td className="px-3 py-2.5 font-mono">{p.customer_phone || "—"}</td>
                  <td className="px-3 py-2.5 font-mono">{money(p.amount, p.currency ?? "INR")}</td>
                  <td className="px-3 py-2.5 capitalize">{p.method || "—"}</td>
                  <td className="px-3 py-2.5"><StatusPill status={p.status} /></td>
                  <td className="px-3 py-2.5 font-mono">
                    <div className="truncate max-w-[160px]">{p.razorpay_payment_id || p.transaction_id || "—"}</div>
                  </td>
                  <td className="px-3 py-2.5 whitespace-nowrap text-muted-foreground">{when(p.created_at)}</td>
                </tr>
              ))}
              {!loading && rows.length === 0 && (
                <tr><td colSpan={8} className="px-3 py-10 text-center text-muted-foreground">No payments found.</td></tr>
              )}
            </tbody>
          </table>
        </div>

        {/* Mobile cards */}
        <div className="md:hidden divide-y divide-white/5">
          {rows.map((p) => (
            <button key={p.id} onClick={() => setDrawer(p)} className="w-full text-left p-3 hover:bg-white/[0.03]">
              <div className="flex items-center justify-between gap-2">
                <span className="text-sm font-semibold truncate">{p.customer_name || p.customer_email || "Customer"}</span>
                <span className="font-mono text-sm">{money(p.amount, p.currency ?? "INR")}</span>
              </div>
              <div className="mt-1 flex items-center justify-between gap-2">
                <span className="text-[11px] text-muted-foreground font-mono">{p.order_id?.slice(0, 8)} · {p.method || "—"}</span>
                <StatusPill status={p.status} />
              </div>
              <p className="mt-1 text-[10px] text-muted-foreground">{p.customer_phone || ""} · {when(p.created_at)}</p>
            </button>
          ))}
          {!loading && rows.length === 0 && <p className="p-10 text-center text-muted-foreground text-xs">No payments found.</p>}
        </div>

        {loading && <div className="p-6 grid place-items-center"><Loader2 className="size-5 animate-spin text-accent" /></div>}
      </div>

      {/* Pagination */}
      <div className="flex items-center justify-between text-xs text-muted-foreground">
        <span>{total} payment{total === 1 ? "" : "s"}</span>
        <div className="flex items-center gap-2">
          <button disabled={page === 0} onClick={() => setPage((p) => Math.max(0, p - 1))}
            className="rounded-full border border-white/10 p-1.5 hover:bg-white/5 disabled:opacity-40"><ChevronLeft className="size-4" /></button>
          <span>{page + 1} / {pageCount}</span>
          <button disabled={page + 1 >= pageCount} onClick={() => setPage((p) => p + 1)}
            className="rounded-full border border-white/10 p-1.5 hover:bg-white/5 disabled:opacity-40"><ChevronRight className="size-4" /></button>
        </div>
      </div>

      <PaymentIntelDrawer payment={drawer} onClose={() => setDrawer(null)} />
    </div>
  );
}
