import { createFileRoute } from "@tanstack/react-router";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  Loader2, RefreshCw, Download, Users, ShoppingCart, Ticket, Package,
  Sparkles, Bell, TrendingUp, AlertTriangle, Rocket, Megaphone, Zap,
} from "lucide-react";
import { AdminShell } from "@/components/admin/AdminShell";
import { supabase } from "@/integrations/supabase/client";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import {
  getMarketingIntelligenceFn, logMarketingExportFn, type MarketingIntelligence,
} from "@/lib/marketing-center.functions";
import { getRevenueAttribution, type RevenueAttribution, type SegmentKey } from "@/lib/revenue-engine";
import { SegmentActivationCenter, type SegDef, type ExecRow } from "@/components/admin/SegmentActivationCenter";
import { AutomationMonitor } from "@/components/admin/AutomationMonitor";

export const Route = createFileRoute("/admin-marketing-growth")({
  head: () => ({ meta: [{ title: "Growth Center — Admin" }] }),
  component: GrowthCenterPage,
});

const fmtN = (n: number) => new Intl.NumberFormat().format(Math.round(n || 0));
const fmtM = (n: number) => "$" + new Intl.NumberFormat(undefined, { maximumFractionDigits: 0 }).format(Math.round(n || 0));
const pct = (a: number, b: number) => (b > 0 ? ((a / b) * 100).toFixed(1) + "%" : "0%");

type Insight = { tone: "warn" | "good" | "info"; title: string; detail: string };

function buildInsights(d: MarketingIntelligence): Insight[] {
  const out: Insight[] = [];
  const s = d.segments, a = d.abandoned, p = d.products;
  if (a.value_at_risk > 0)
    out.push({ tone: "warn", title: "Abandoned cart revenue at risk", detail: `${fmtM(a.value_at_risk)} sitting in ${a.total_carts} idle carts. Trigger a recovery flow.` });
  if (a.recovery_sent > 0)
    out.push({ tone: "good", title: "Cart recovery working", detail: `${fmtN(a.recovered_orders)} orders recovered (${fmtM(a.recovered_revenue)}) from ${fmtN(a.recovery_sent)} reminders.` });
  if (s.dormant > 0)
    out.push({ tone: "warn", title: "Dormant customers to win back", detail: `${fmtN(s.dormant)} buyers inactive 90+ days. Launch a win-back campaign with an incentive.` });
  if (s.vip > 0)
    out.push({ tone: "info", title: "VIP tier opportunity", detail: `${fmtN(s.vip)} VIPs (spend ≥ ${fmtM(s.vip_threshold)}). Offer early access / loyalty perks.` });
  if (p.most_wishlisted.length)
    out.push({ tone: "info", title: "Wishlist demand to convert", detail: `"${p.most_wishlisted[0].name}" is wishlisted ${fmtN(p.most_wishlisted[0].wishes)}×. A price-drop alert could close sales.` });
  if (p.needs_promotion.length)
    out.push({ tone: "warn", title: "High-view, zero-sale products", detail: `${p.needs_promotion.length} products get traffic but no sales — test a discount or better imagery.` });
  if (p.dead.length)
    out.push({ tone: "warn", title: "Dead inventory", detail: `${p.dead.length} published products have no sales at all. Consider bundling or clearance.` });
  if (s.refund_risk > 0)
    out.push({ tone: "warn", title: "Refund-risk customers", detail: `${fmtN(s.refund_risk)} customers have refunds on record — exclude from aggressive upsell.` });
  if (out.length === 0) out.push({ tone: "good", title: "All healthy", detail: "No urgent growth risks detected from current data." });
  return out;
}

function Stat({ icon, label, value, sub }: { icon: React.ReactNode; label: string; value: string; sub?: string }) {
  return (
    <div className="card-premium rounded-2xl p-4">
      <div className="flex items-center gap-2 text-muted-foreground mb-2">{icon}<span className="text-[10px] font-mono uppercase tracking-widest">{label}</span></div>
      <div className="text-2xl font-semibold tabular-nums">{value}</div>
      {sub && <div className="text-[11px] text-muted-foreground mt-1">{sub}</div>}
    </div>
  );
}

type Tab = "overview" | "segments" | "revenue" | "automations" | "carts" | "coupons" | "products" | "campaigns" | "channels";

const SEG_DEFS: { key: SegmentKey; label: string; count: (d: MarketingIntelligence) => number | null; buyer: boolean }[] = [
  { key: "vip", label: "VIP", count: (d) => d.segments.vip, buyer: true },
  { key: "high_value", label: "High Value", count: (d) => d.segments.vip, buyer: true },
  { key: "high_ltv", label: "High LTV", count: (d) => d.segments.high_ltv, buyer: true },
  { key: "frequent", label: "Frequent Buyers", count: (d) => d.segments.frequent, buyer: true },
  { key: "dormant", label: "Dormant", count: (d) => d.segments.dormant, buyer: true },
  { key: "winback", label: "Winback", count: (d) => d.segments.dormant, buyer: true },
  { key: "new", label: "New Customers", count: (d) => d.segments.new, buyer: false },
  { key: "refund_risk", label: "Refund Risk", count: (d) => d.segments.refund_risk, buyer: false },
  { key: "abandoned_cart", label: "Abandoned Cart", count: (d) => d.segments.abandoned_cart, buyer: false },
  { key: "wishlist", label: "Wishlist", count: () => null, buyer: false },
  { key: "coupon_hunters", label: "Coupon Hunters", count: () => null, buyer: false },
];

function GrowthCenterPage() {
  const fetchIntel = useServerFn(getMarketingIntelligenceFn);
  const logExport = useServerFn(logMarketingExportFn);
  const [d, setD] = useState<MarketingIntelligence | null>(null);
  const [loading, setLoading] = useState(true);
  const [tab, setTab] = useState<Tab>("overview");
  const [execs, setExecs] = useState<ExecRow[]>([]);
  const [attr, setAttr] = useState<RevenueAttribution | null>(null);
  const [attrLoading, setAttrLoading] = useState(false);
  const tRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const load = useCallback(async (silent = false) => {
    if (!silent) setLoading(true);
    try {
      setD(await fetchIntel());
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Failed to load growth data");
    } finally {
      setLoading(false);
    }
  }, [fetchIntel]);

  const loadExecs = useCallback(async () => {
    const { data } = await supabase
      .from("automation_executions")
      .select("id, run_id, trigger_key, status, matched_count, action_taken, summary, details, campaign_id, triggered_by, created_at")
      .order("created_at", { ascending: false })
      .limit(200);
    setExecs((data ?? []) as unknown as ExecRow[]);
  }, []);

  const loadAttr = useCallback(async () => {
    setAttrLoading(true);
    try {
      setAttr(await getRevenueAttribution());
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Failed to load revenue data");
    } finally {
      setAttrLoading(false);
    }
  }, []);

  useEffect(() => { void load(); void loadExecs(); }, [load, loadExecs]);
  useEffect(() => {
    if ((tab === "revenue" || tab === "overview") && !attr) void loadAttr();
  }, [tab, attr, loadAttr]);

  // Realtime — debounced refresh on any growth-relevant change.
  useEffect(() => {
    const bump = () => {
      if (tRef.current) clearTimeout(tRef.current);
      tRef.current = setTimeout(() => { void load(true); void loadExecs(); void loadAttr(); }, 1500);
    };
    const bumpExecs = () => { void loadExecs(); };
    const ch = supabase
      .channel("rt-growth-center")
      .on("postgres_changes", { event: "*", schema: "public", table: "orders" }, bump)
      .on("postgres_changes", { event: "*", schema: "public", table: "carts" }, bump)
      .on("postgres_changes", { event: "*", schema: "public", table: "cart_items" }, bump)
      .on("postgres_changes", { event: "*", schema: "public", table: "wishlist" }, bump)
      .on("postgres_changes", { event: "*", schema: "public", table: "payments" }, bump)
      .on("postgres_changes", { event: "*", schema: "public", table: "notifications" }, bump)
      .on("postgres_changes", { event: "*", schema: "public", table: "marketing_campaigns" }, bump)
      .on("postgres_changes", { event: "*", schema: "public", table: "promo_codes" }, bump)
      .on("postgres_changes", { event: "*", schema: "public", table: "automation_executions" }, bumpExecs)
      .subscribe();
    return () => { supabase.removeChannel(ch); if (tRef.current) clearTimeout(tRef.current); };
  }, [load, loadExecs, loadAttr]);

  const insights = useMemo(() => (d ? buildInsights(d) : []), [d]);

  async function exportCsv(report: string, rows: Record<string, unknown>[]) {
    if (!rows.length) { toast.error("Nothing to export"); return; }
    try { await logExport({ data: { format: "csv", report } }); } catch { /* audit best-effort */ }
    const headers = Object.keys(rows[0]);
    const csv = [
      headers.join(","),
      ...rows.map((r) => headers.map((h) => {
        const v = r[h] ?? "";
        const s = String(v).replace(/"/g, '""');
        return /[",\n]/.test(s) ? `"${s}"` : s;
      }).join(",")),
    ].join("\n");
    const url = URL.createObjectURL(new Blob([csv], { type: "text/csv" }));
    const link = document.createElement("a");
    link.href = url; link.download = `${report}-${new Date().toISOString().slice(0, 10)}.csv`;
    link.click(); URL.revokeObjectURL(url);
    toast.success("Export ready");
  }

  const TABS: { k: Tab; label: string }[] = [
    { k: "overview", label: "Overview" }, { k: "segments", label: "Segments" },
    { k: "carts", label: "Abandoned carts" }, { k: "coupons", label: "Coupons" },
    { k: "products", label: "Products" }, { k: "campaigns", label: "Campaigns" },
    { k: "channels", label: "Channels" },
  ];

  return (
    <AdminShell title="Growth Center" subtitle="Segments, recovery, coupons, product marketing & automation intelligence — live data" allow={["admin", "super_admin", "manager"]}>
      <div className="flex items-center justify-between gap-3 mb-5 flex-wrap">
        <div className="flex gap-1 overflow-x-auto border-b border-border">
          {TABS.map((t) => (
            <button key={t.k} onClick={() => setTab(t.k)}
              className={`px-4 py-2.5 text-xs uppercase tracking-widest font-mono border-b-2 -mb-px whitespace-nowrap ${tab === t.k ? "border-accent text-foreground" : "border-transparent text-muted-foreground hover:text-foreground"}`}>
              {t.label}
            </button>
          ))}
        </div>
        <button onClick={() => load()} className="inline-flex items-center gap-2 text-xs px-3 py-2 rounded-full hover:bg-white/5 text-muted-foreground">
          <RefreshCw className="size-3.5" /> Refresh
        </button>
      </div>

      {loading || !d ? (
        <div className="grid place-items-center py-32"><Loader2 className="size-6 animate-spin text-muted-foreground" /></div>
      ) : (
        <>
          {tab === "overview" && (
            <div className="space-y-6">
              <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                <Stat icon={<Users className="size-3.5" />} label="Customers" value={fmtN(d.segments.total_customers)} sub={`${fmtN(d.segments.buyers)} buyers`} />
                <Stat icon={<TrendingUp className="size-3.5" />} label="Returning" value={fmtN(d.segments.returning)} sub={`${fmtN(d.segments.vip)} VIP`} />
                <Stat icon={<ShoppingCart className="size-3.5" />} label="At-risk carts" value={fmtM(d.abandoned.value_at_risk)} sub={`${fmtN(d.abandoned.total_carts)} carts`} />
                <Stat icon={<Megaphone className="size-3.5" />} label="Campaigns" value={fmtN(d.campaigns.total)} sub={`${fmtN(d.campaigns.active)} active`} />
              </div>
              <section>
                <h2 className="text-sm font-medium flex items-center gap-2 mb-3"><Sparkles className="size-4 text-accent" /> AI growth insights</h2>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                  {insights.map((i, idx) => (
                    <div key={idx} className="card-premium rounded-2xl p-4 flex gap-3">
                      <span className={`size-8 grid place-items-center rounded-full shrink-0 ${i.tone === "warn" ? "bg-amber-500/15 text-amber-400" : i.tone === "good" ? "bg-emerald-500/15 text-emerald-400" : "bg-accent/15 text-accent"}`}>
                        {i.tone === "warn" ? <AlertTriangle className="size-4" /> : i.tone === "good" ? <Rocket className="size-4" /> : <Sparkles className="size-4" />}
                      </span>
                      <div><p className="text-sm font-medium">{i.title}</p><p className="text-xs text-muted-foreground mt-1">{i.detail}</p></div>
                    </div>
                  ))}
                </div>
              </section>
            </div>
          )}

          {tab === "segments" && (
            <div className="space-y-6">
              <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                {([
                  ["New", d.segments.new], ["Returning", d.segments.returning], ["Frequent (4+)", d.segments.frequent],
                  ["VIP", d.segments.vip], ["High LTV", d.segments.high_ltv], ["Dormant 90d+", d.segments.dormant],
                  ["Refund risk", d.segments.refund_risk], ["High return", d.segments.high_return],
                  ["Abandoned cart", d.segments.abandoned_cart], ["Newsletter", d.segments.newsletter],
                ] as [string, number][]).map(([k, v]) => (
                  <div key={k} className="card-premium rounded-2xl p-4">
                    <div className="text-[10px] font-mono uppercase tracking-widest text-muted-foreground">{k}</div>
                    <div className="text-2xl font-semibold tabular-nums mt-1">{fmtN(v)}</div>
                  </div>
                ))}
              </div>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <Table title="By country" cols={["Country", "Customers", "Revenue"]} rows={d.segments_by_country.map((r) => [r.k, fmtN(r.customers), fmtM(r.revenue)])}
                  onExport={() => exportCsv("segments-by-country", d.segments_by_country)} />
                <Table title="By city" cols={["City", "Orders"]} rows={d.segments_by_city.map((r) => [r.k, fmtN(r.orders)])}
                  onExport={() => exportCsv("segments-by-city", d.segments_by_city)} />
              </div>
            </div>
          )}

          {tab === "carts" && (
            <div className="space-y-6">
              <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                <Stat icon={<ShoppingCart className="size-3.5" />} label="Idle 30m–24h" value={fmtN(d.abandoned.bucket_30m)} />
                <Stat icon={<ShoppingCart className="size-3.5" />} label="Idle 1–3 days" value={fmtN(d.abandoned.bucket_24h)} />
                <Stat icon={<ShoppingCart className="size-3.5" />} label="Idle 3+ days" value={fmtN(d.abandoned.bucket_3d)} />
                <Stat icon={<TrendingUp className="size-3.5" />} label="Recovery rate" value={pct(d.abandoned.recovered_orders, d.abandoned.recovery_sent)} sub={`${fmtM(d.abandoned.recovered_revenue)} recovered`} />
              </div>
              <Table title="Top at-risk carts" cols={["Customer", "Value", "Items", "Idle (h)"]}
                rows={d.top_carts.map((c) => [c.name, fmtM(c.value), fmtN(c.item_count), c.hours_idle.toFixed(1)])}
                onExport={() => exportCsv("at-risk-carts", d.top_carts)} />
            </div>
          )}

          {tab === "coupons" && (
            <Table title="Coupon intelligence" cols={["Code", "Type", "Uses", "Orders", "Revenue", "Discount", "Status"]}
              rows={d.coupons.map((c) => [
                c.code, `${c.kind} ${c.value}`, `${c.uses}${c.max_uses ? "/" + c.max_uses : ""}`,
                fmtN(c.order_count), fmtM(c.revenue), fmtM(c.discount_given),
                c.expired ? "Expired" : c.active ? (c.order_count === 0 ? "Unused" : "Active") : "Off",
              ])}
              onExport={() => exportCsv("coupons", d.coupons)} />
          )}

          {tab === "products" && (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <Table title="Most viewed" cols={["Product", "Views"]} rows={d.products.most_viewed.map((p) => [p.name, fmtN(p.views_count)])} />
              <Table title="Most wishlisted" cols={["Product", "Wishes"]} rows={d.products.most_wishlisted.map((p) => [p.name, fmtN(p.wishes)])} />
              <Table title="Trending (14d)" cols={["Product", "Units", "Revenue"]} rows={d.products.trending.map((p) => [p.name, fmtN(p.units), fmtM(p.revenue)])} />
              <Table title="Needs promotion" cols={["Product", "Views", "Stock"]} rows={d.products.needs_promotion.map((p) => [p.name, fmtN(p.views_count), fmtN(p.stock_quantity)])} />
              <Table title="Dead products" cols={["Product", "Views", "Stock"]} rows={d.products.dead.map((p) => [p.name, fmtN(p.views_count), fmtN(p.stock_quantity)])} />
            </div>
          )}

          {tab === "campaigns" && (
            <div className="space-y-6">
              <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                <Stat icon={<Megaphone className="size-3.5" />} label="Total" value={fmtN(d.campaigns.total)} />
                <Stat icon={<Rocket className="size-3.5" />} label="Active" value={fmtN(d.campaigns.active)} sub={`${fmtN(d.campaigns.scheduled)} scheduled`} />
                <Stat icon={<Download className="size-3.5" />} label="Spend" value={fmtM(d.campaigns.spend)} />
                <Stat icon={<Zap className="size-3.5" />} label="Automations" value={fmtN(d.automations.total)} sub={`${fmtN(d.automations.enabled)} on`} />
              </div>
              <Table title="Campaigns" cols={["Name", "Type", "Status", "Audience", "Spend"]}
                rows={d.campaigns.list.map((c) => [c.name, c.campaign_type, c.status, fmtN(c.audience_size), fmtM(c.spend)])}
                onExport={() => exportCsv("campaigns", d.campaigns.list)} />
              <Table title="Automation flows" cols={["Name", "Trigger", "Channel", "Runs", "Status"]}
                rows={d.automations.list.map((a) => [a.name, a.trigger_key, a.channel, fmtN(a.runs), a.enabled ? "Enabled" : "Off"])}
                onExport={() => exportCsv("automations", d.automations.list)} />
            </div>
          )}

          {tab === "channels" && (
            <div className="space-y-6">
              <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                <Stat icon={<MailOpenIcon />} label="Email opens" value={fmtN(d.engagement.opens)} />
                <Stat icon={<TrendingUp className="size-3.5" />} label="Clicks" value={fmtN(d.engagement.clicks)} sub={pct(d.engagement.clicks, d.engagement.opens) + " CTR"} />
                <Stat icon={<Bell className="size-3.5" />} label="Notifs (30d)" value={fmtN(d.engagement.notifications_30d)} />
                <Stat icon={<Bell className="size-3.5" />} label="Read rate" value={pct(d.engagement.notifications_read, d.engagement.notifications_30d)} />
              </div>
              <Table title="Notification delivery by type (90d)" cols={["Type", "Sent", "Read", "Read rate"]}
                rows={d.engagement.by_type.map((t) => [t.k, fmtN(t.n), fmtN(t.read), pct(t.read, t.n)])}
                onExport={() => exportCsv("notification-channels", d.engagement.by_type)} />
            </div>
          )}

          <p className="text-[10px] font-mono uppercase tracking-widest text-muted-foreground mt-8">
            Live data · generated {new Date(d.generated_at).toLocaleString()}
          </p>
        </>
      )}
    </AdminShell>
  );
}

function MailOpenIcon() { return <Package className="size-3.5" />; }

function Table({ title, cols, rows, onExport }: { title: string; cols: string[]; rows: (string | number)[][]; onExport?: () => void }) {
  return (
    <div className="card-premium rounded-2xl overflow-hidden">
      <div className="flex items-center justify-between px-5 py-3 border-b border-border">
        <h3 className="text-sm font-medium flex items-center gap-2"><Ticket className="size-3.5 text-muted-foreground" /> {title}</h3>
        {onExport && <button onClick={onExport} className="inline-flex items-center gap-1.5 text-[10px] uppercase tracking-widest font-mono text-muted-foreground hover:text-foreground"><Download className="size-3" /> CSV</button>}
      </div>
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead className="text-[10px] font-mono uppercase tracking-widest text-muted-foreground border-b border-border">
            <tr>{cols.map((c, i) => <th key={c} className={`px-5 py-2.5 ${i === 0 ? "text-left" : "text-right"}`}>{c}</th>)}</tr>
          </thead>
          <tbody>
            {rows.map((r, ri) => (
              <tr key={ri} className="border-b border-border/40 last:border-0">
                {r.map((cell, ci) => <td key={ci} className={`px-5 py-2.5 ${ci === 0 ? "text-left truncate max-w-[200px]" : "text-right tabular-nums"}`}>{cell}</td>)}
              </tr>
            ))}
            {rows.length === 0 && <tr><td colSpan={cols.length} className="px-5 py-8 text-center text-sm text-muted-foreground">No data yet.</td></tr>}
          </tbody>
        </table>
      </div>
    </div>
  );
}
