import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import {
  Users, Search, Radio, Loader2, ChevronLeft, ChevronRight,
  IndianRupee, ShieldAlert, Crown, Activity, ShoppingBag, Mail, Phone, Clock,
} from "lucide-react";
import { AdminShell } from "@/components/admin/AdminShell";
import { supabase } from "@/integrations/supabase/client";
import { getCustomerCenterFn, type CustomerRow, type CustomerKpis } from "@/lib/customer-center.functions";
import {
  computeTier, computeHealth, matchesSegment, riskLevel, initialsOf,
  SEGMENTS, type SegmentKey, type TierMeta,
} from "@/lib/customer-tiers";

export const Route = createFileRoute("/admin-customers")({
  head: () => ({
    meta: [
      { title: "Customer Intelligence — FoundOurMarket™" },
      { name: "description", content: "Customer 360° — tiers, health, orders, payments, shipments, refunds, support & fraud." },
    ],
  }),
  component: CustomersPage,
});

const money = (v: number | null | undefined, c = "INR") =>
  new Intl.NumberFormat("en-IN", { style: "currency", currency: c, maximumFractionDigits: 0 }).format(Number(v) || 0);
const dateOnly = (s: string | null) => (s ? new Date(s).toLocaleDateString("en-IN", { dateStyle: "medium" }) : "—");

function Avatar({ url, name, email, tier }: { url: string | null; name: string | null; email: string | null; tier: TierMeta }) {
  return (
    <span className="relative shrink-0">
      {url ? (
        <img src={url} alt="" className="size-10 rounded-full object-cover border border-white/10" loading="lazy" />
      ) : (
        <span className="size-10 rounded-full grid place-items-center bg-accent/15 text-accent text-xs font-bold border border-accent/20">
          {initialsOf(name, email)}
        </span>
      )}
      <span className={`absolute -bottom-0.5 -right-0.5 size-3 rounded-full border-2 border-background ${tier.dot}`} />
    </span>
  );
}

function TierBadge({ tier }: { tier: TierMeta }) {
  return (
    <span className={`inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-[10px] font-semibold ${tier.className}`}>
      <span aria-hidden>{tier.emoji}</span> {tier.label}
    </span>
  );
}

function Kpi({ icon: Icon, label, value, tone }: { icon: typeof Users; label: string; value: string; tone?: string }) {
  return (
    <div className="card-premium rounded-2xl p-3">
      <div className="flex items-center gap-2 text-[10px] uppercase tracking-widest text-muted-foreground">
        <Icon className={`size-3.5 ${tone ?? "text-accent"}`} /> {label}
      </div>
      <p className="mt-1 text-lg font-bold tabular-nums">{value}</p>
    </div>
  );
}

const PAGE_SIZE = 50;

type Enriched = CustomerRow & {
  tier: TierMeta;
  health: ReturnType<typeof computeHealth>;
};

function CustomersPage() {
  return (
    <AdminShell
      title="Customer Intelligence"
      subtitle="Customer 360° · tiers · health · value · risk · fraud"
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
  const [segment, setSegment] = useState<SegmentKey>("all");
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

  // Enrich every row with tier + health (pure, memoised).
  const enriched: Enriched[] = useMemo(
    () =>
      rows.map((c) => {
        const tier = computeTier(c.total_orders, c.lifetime_spend);
        const health = computeHealth({
          totalOrders: c.total_orders,
          lifetimeRevenue: c.lifetime_spend,
          refundCount: c.refund_count,
          openTickets: c.open_tickets,
          riskScore: c.risk_score,
          lastActive: c.last_active,
        });
        return { ...c, tier, health };
      }),
    [rows],
  );

  const visible = useMemo(
    () =>
      enriched.filter((c) =>
        matchesSegment(segment, {
          totalOrders: c.total_orders,
          lifetimeRevenue: c.lifetime_spend,
          riskScore: c.risk_score,
          lastActive: c.last_active,
          tier: c.tier.key,
          health: c.health.score,
        }),
      ),
    [enriched, segment],
  );

  // Intelligence KPIs (page-scoped derived metrics + global totals).
  const intel = useMemo(() => {
    const active = enriched.filter((c) =>
      matchesSegment("active", { totalOrders: c.total_orders, lifetimeRevenue: c.lifetime_spend, riskScore: c.risk_score, lastActive: c.last_active, tier: c.tier.key, health: c.health.score }),
    ).length;
    const vip = enriched.filter((c) => c.tier.key === "vip" || c.tier.key === "elite").length;
    const returning = enriched.filter((c) => c.total_orders >= 2).length;
    const atRisk = enriched.filter((c) => c.risk_score >= 35 || c.health.score < 35).length;
    const totalCustomers = kpis?.total_customers ?? enriched.length;
    const revPerCustomer = totalCustomers > 0 ? (kpis?.total_revenue ?? 0) / totalCustomers : 0;
    return { active, vip, returning, atRisk, totalCustomers, revPerCustomer };
  }, [enriched, kpis]);

  const pageCount = Math.max(1, Math.ceil(total / PAGE_SIZE));
  const open = (id: string) => nav({ to: "/admin-customers/$customerId", params: { customerId: id } });

  return (
    <div className="space-y-5">
      {/* Intelligence KPIs */}
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3">
        <Kpi icon={Users} label="Total Customers" value={String(intel.totalCustomers)} />
        <Kpi icon={Activity} tone="text-emerald-400" label="Active" value={String(intel.active)} />
        <Kpi icon={Crown} tone="text-accent" label="VIP" value={String(intel.vip)} />
        <Kpi icon={ShoppingBag} tone="text-sky-400" label="Returning" value={String(intel.returning)} />
        <Kpi icon={IndianRupee} label="Revenue / Customer" value={money(intel.revPerCustomer)} />
        <Kpi icon={ShieldAlert} tone="text-destructive" label="At Risk" value={String(intel.atRisk)} />
      </div>

      {/* Search + live */}
      <div className="flex flex-wrap items-center gap-2 sticky top-2 z-20">
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

      {/* Segment filters */}
      <div className="flex items-center gap-2 overflow-x-auto scrollbar-none -mx-1 px-1 pb-1">
        {SEGMENTS.map((s) => (
          <button
            key={s.key}
            onClick={() => setSegment(s.key)}
            className={`shrink-0 rounded-full border px-3 py-1.5 text-xs font-medium transition-colors ${
              segment === s.key
                ? "border-accent/50 bg-accent/15 text-accent"
                : "border-white/10 text-muted-foreground hover:bg-white/5"
            }`}
          >
            {s.label}
          </button>
        ))}
      </div>

      {/* Customer cards grid */}
      <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-3">
        {visible.map((c) => {
          const risk = riskLevel(c.risk_score);
          return (
            <button
              key={c.id}
              onClick={() => open(c.id)}
              className="card-premium rounded-2xl p-3.5 text-left hover:border-accent/30 transition-colors"
            >
              <div className="flex items-start gap-3">
                <Avatar url={c.avatar_url} name={c.full_name} email={c.email} tier={c.tier} />
                <div className="min-w-0 flex-1">
                  <div className="flex items-center justify-between gap-2">
                    <span className="text-sm font-semibold truncate">{c.full_name || c.email || "Customer"}</span>
                    <TierBadge tier={c.tier} />
                  </div>
                  {c.email && (
                    <div className="mt-0.5 flex items-center gap-1 text-[11px] text-muted-foreground truncate">
                      <Mail className="size-3 shrink-0" /> <span className="truncate">{c.email}</span>
                    </div>
                  )}
                  {c.phone && (
                    <div className="mt-0.5 flex items-center gap-1 text-[11px] text-muted-foreground">
                      <Phone className="size-3 shrink-0" /> {c.phone}
                    </div>
                  )}
                </div>
              </div>

              <div className="mt-3 grid grid-cols-3 gap-2 text-center">
                <div className="rounded-xl border border-white/10 bg-white/[0.02] py-1.5">
                  <p className="text-[9px] uppercase tracking-widest text-muted-foreground">Orders</p>
                  <p className="text-sm font-bold tabular-nums">{c.total_orders}</p>
                </div>
                <div className="rounded-xl border border-white/10 bg-white/[0.02] py-1.5">
                  <p className="text-[9px] uppercase tracking-widest text-muted-foreground">Lifetime</p>
                  <p className="text-sm font-bold tabular-nums text-accent">{money(c.lifetime_spend)}</p>
                </div>
                <div className="rounded-xl border border-white/10 bg-white/[0.02] py-1.5">
                  <p className="text-[9px] uppercase tracking-widest text-muted-foreground">Health</p>
                  <p className={`text-sm font-bold tabular-nums ${c.health.className}`}>{c.health.score}</p>
                </div>
              </div>

              <div className="mt-2.5 flex items-center justify-between gap-2 text-[10px]">
                <span className="inline-flex items-center gap-1 text-muted-foreground">
                  <Clock className="size-3" /> {dateOnly(c.last_order ?? c.last_active)}
                </span>
                <span className={`inline-flex items-center rounded-full border px-2 py-0.5 font-mono ${risk.className}`}>
                  <ShieldAlert className="size-3 mr-1" />{risk.label}
                </span>
              </div>
            </button>
          );
        })}
      </div>

      {loading && <div className="p-6 grid place-items-center"><Loader2 className="size-5 animate-spin text-accent" /></div>}
      {!loading && visible.length === 0 && (
        <div className="card-premium rounded-2xl p-10 text-center">
          <Users className="size-6 text-muted-foreground mx-auto mb-2" />
          <p className="text-sm text-muted-foreground">No customers in this segment.</p>
          {segment !== "all" && (
            <button onClick={() => setSegment("all")} className="mt-3 rounded-xl border border-white/10 px-3 py-1.5 text-xs hover:bg-white/5">
              View all customers
            </button>
          )}
        </div>
      )}

      {/* Pagination */}
      <div className="flex items-center justify-between text-xs text-muted-foreground">
        <span>{total} customer{total === 1 ? "" : "s"}{segment !== "all" ? ` · ${visible.length} shown` : ""}</span>
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
