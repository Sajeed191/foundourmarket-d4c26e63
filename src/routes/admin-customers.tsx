import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import {
  Users, Search, Radio, Loader2, ChevronLeft, ChevronRight,
  IndianRupee, ShieldAlert, LifeBuoy, UserPlus, ShoppingBag,
} from "lucide-react";
import { AdminShell } from "@/components/admin/AdminShell";
import { supabase } from "@/integrations/supabase/client";
import { getCustomerCenterFn, type CustomerRow, type CustomerKpis } from "@/lib/customer-center.functions";

export const Route = createFileRoute("/admin-customers")({
  head: () => ({
    meta: [
      { title: "Customer Intelligence — FoundOurMarket™" },
      { name: "description", content: "Customer 360° — orders, payments, shipments, refunds, support & fraud." },
    ],
  }),
  component: CustomersPage,
});

const money = (v: number | null | undefined, c = "INR") =>
  new Intl.NumberFormat("en-IN", { style: "currency", currency: c, maximumFractionDigits: 0 }).format(Number(v) || 0);
const dateOnly = (s: string | null) => (s ? new Date(s).toLocaleDateString("en-IN", { dateStyle: "medium" }) : "—");

function riskTone(score: number) {
  if (score >= 70) return "text-destructive border-destructive/30 bg-destructive/10";
  if (score >= 35) return "text-amber-400 border-amber-500/30 bg-amber-500/10";
  return "text-emerald-400 border-emerald-500/30 bg-emerald-500/10";
}

function Kpi({ icon: Icon, label, value, tone }: { icon: typeof Users; label: string; value: string; tone?: string }) {
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

function CustomersPage() {
  return (
    <AdminShell
      title="Customer Intelligence"
      subtitle="Customer 360° · orders · payments · shipments · refunds · fraud"
      allow={["admin", "super_admin", "manager"]}
    >
      <CustomersInner />
    </AdminShell>
  );
}

function CustomersInner() {
  const centerFn = useServerFn(getCustomerCenterFn);
  const nav = useNavigate();
  const [query, setQuery] = useState("");
  const [search, setSearch] = useState("");
  const [page, setPage] = useState(0);
  const [rows, setRows] = useState<CustomerRow[]>([]);
  const [kpis, setKpis] = useState<CustomerKpis | null>(null);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [pulse, setPulse] = useState(false);
  const reqId = useRef(0);

  useEffect(() => { const t = setTimeout(() => setSearch(query), 300); return () => clearTimeout(t); }, [query]);
  useEffect(() => { setPage(0); }, [search]);

  const load = useCallback(async () => {
    const id = ++reqId.current;
    setLoading(true);
    try {
      const res = await centerFn({ data: { search: search || undefined, page, pageSize: PAGE_SIZE } });
      if (id !== reqId.current) return;
      setRows(res.rows ?? []);
      setKpis(res.kpis ?? null);
      setTotal(res.total ?? 0);
    } catch {
      if (id === reqId.current) { setRows([]); setTotal(0); }
    } finally {
      if (id === reqId.current) setLoading(false);
    }
  }, [centerFn, search, page]);

  useEffect(() => { load(); }, [load]);

  // Realtime: refresh when relevant tables change.
  useEffect(() => {
    const ping = () => { setPulse(true); setTimeout(() => setPulse(false), 1000); load(); };
    const ch = supabase
      .channel("admin-customer-center")
      .on("postgres_changes", { event: "*", schema: "public", table: "orders" }, ping)
      .on("postgres_changes", { event: "*", schema: "public", table: "payments" }, ping)
      .on("postgres_changes", { event: "*", schema: "public", table: "support_tickets" }, ping)
      .on("postgres_changes", { event: "*", schema: "public", table: "profiles" }, ping)
      .subscribe();
    return () => { supabase.removeChannel(ch); };
  }, [load]);

  const pageCount = Math.max(1, Math.ceil(total / PAGE_SIZE));
  const open = (id: string) => nav({ to: "/admin-customers/$customerId", params: { customerId: id } });
  const k = useMemo(() => kpis, [kpis]);

  return (
    <div className="space-y-5">
      {/* KPI bar */}
      <div className="grid grid-cols-2 lg:grid-cols-5 gap-3">
        <Kpi icon={Users} label="Customers" value={String(k?.total_customers ?? 0)} />
        <Kpi icon={ShoppingBag} tone="text-emerald-400" label="Paying" value={String(k?.paying_customers ?? 0)} />
        <Kpi icon={IndianRupee} label="Lifetime Revenue" value={money(k?.total_revenue)} />
        <Kpi icon={LifeBuoy} tone="text-amber-400" label="Open Tickets" value={String(k?.open_tickets ?? 0)} />
        <Kpi icon={UserPlus} tone="text-sky-400" label="New Today" value={String(k?.new_today ?? 0)} />
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
            placeholder="Search name, email, phone, order / payment ID, tracking, address…"
            className="w-full bg-white/[0.03] border border-white/10 rounded-xl pl-9 pr-3 py-2 text-xs focus:outline-none focus:border-accent/40"
          />
        </div>
      </div>

      {/* Table */}
      <div className="glass border border-white/10 rounded-2xl overflow-hidden">
        <div className="hidden md:block overflow-x-auto">
          <table className="w-full text-xs">
            <thead>
              <tr className="text-left text-[10px] uppercase tracking-widest text-muted-foreground border-b border-white/10">
                <th className="px-3 py-2.5">Customer</th>
                <th className="px-3 py-2.5">Phone</th>
                <th className="px-3 py-2.5">Country</th>
                <th className="px-3 py-2.5">Orders</th>
                <th className="px-3 py-2.5">Lifetime</th>
                <th className="px-3 py-2.5">Paid</th>
                <th className="px-3 py-2.5">Refunds</th>
                <th className="px-3 py-2.5">Tickets</th>
                <th className="px-3 py-2.5">Risk</th>
                <th className="px-3 py-2.5">Last Active</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((c) => (
                <tr key={c.id} onClick={() => open(c.id)} className="border-b border-white/5 hover:bg-white/[0.03] cursor-pointer">
                  <td className="px-3 py-2.5">
                    <div className="truncate max-w-[180px] font-medium">{c.full_name || "—"}</div>
                    <div className="text-[10px] text-muted-foreground truncate max-w-[180px]">{c.email || ""}</div>
                  </td>
                  <td className="px-3 py-2.5 font-mono">{c.phone || "—"}</td>
                  <td className="px-3 py-2.5">{c.country || "—"}</td>
                  <td className="px-3 py-2.5 tabular-nums">{c.total_orders}</td>
                  <td className="px-3 py-2.5 font-mono">{money(c.lifetime_spend)}</td>
                  <td className="px-3 py-2.5 tabular-nums">{c.successful_payments}</td>
                  <td className="px-3 py-2.5 tabular-nums">{c.refund_count}</td>
                  <td className="px-3 py-2.5 tabular-nums">{c.open_tickets}</td>
                  <td className="px-3 py-2.5">
                    <span className={`inline-flex items-center rounded-full border px-2 py-0.5 text-[10px] font-mono ${riskTone(c.risk_score)}`}>
                      {c.risk_score}
                    </span>
                  </td>
                  <td className="px-3 py-2.5 whitespace-nowrap text-muted-foreground">{dateOnly(c.last_active)}</td>
                </tr>
              ))}
              {!loading && rows.length === 0 && (
                <tr><td colSpan={10} className="px-3 py-10 text-center text-muted-foreground">No customers found.</td></tr>
              )}
            </tbody>
          </table>
        </div>

        {/* Mobile cards */}
        <div className="md:hidden divide-y divide-white/5">
          {rows.map((c) => (
            <button key={c.id} onClick={() => open(c.id)} className="w-full text-left p-3 hover:bg-white/[0.03]">
              <div className="flex items-center justify-between gap-2">
                <span className="text-sm font-semibold truncate">{c.full_name || c.email || "Customer"}</span>
                <span className={`inline-flex items-center rounded-full border px-2 py-0.5 text-[10px] font-mono ${riskTone(c.risk_score)}`}>
                  <ShieldAlert className="size-3 mr-1" />{c.risk_score}
                </span>
              </div>
              <div className="mt-1 flex items-center justify-between gap-2 text-[11px] text-muted-foreground">
                <span className="truncate">{c.email || c.phone || ""}</span>
                <span className="font-mono">{money(c.lifetime_spend)}</span>
              </div>
              <p className="mt-1 text-[10px] text-muted-foreground">
                {c.total_orders} orders · {c.open_tickets} open tickets · {dateOnly(c.last_active)}
              </p>
            </button>
          ))}
          {!loading && rows.length === 0 && <p className="p-10 text-center text-muted-foreground text-xs">No customers found.</p>}
        </div>

        {loading && <div className="p-6 grid place-items-center"><Loader2 className="size-5 animate-spin text-accent" /></div>}
      </div>

      {/* Pagination */}
      <div className="flex items-center justify-between text-xs text-muted-foreground">
        <span>{total} customer{total === 1 ? "" : "s"}</span>
        <div className="flex items-center gap-2">
          <button disabled={page === 0} onClick={() => setPage((p) => Math.max(0, p - 1))}
            className="rounded-full border border-white/10 p-1.5 hover:bg-white/5 disabled:opacity-40"><ChevronLeft className="size-4" /></button>
          <span>{page + 1} / {pageCount}</span>
          <button disabled={page + 1 >= pageCount} onClick={() => setPage((p) => p + 1)}
            className="rounded-full border border-white/10 p-1.5 hover:bg-white/5 disabled:opacity-40"><ChevronRight className="size-4" /></button>
        </div>
      </div>
    </div>
  );
}
