import { createFileRoute } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { motion } from "framer-motion";
import {
  Store, Power, Loader2, Users, Package, BarChart3, Percent, Banknote,
  LifeBuoy, ShieldCheck, Lock, Radio,
} from "lucide-react";
import { AdminShell } from "@/components/admin/AdminShell";
import { useMarketplace } from "@/lib/use-marketplace";

export const Route = createFileRoute("/admin-vendors")({
  head: () => ({
    meta: [
      { title: "Marketplace — FoundOurMarket™" },
      { name: "description", content: "Dormant multi-vendor marketplace architecture." },
    ],
  }),
  component: VendorsPage,
});

function VendorsPage() {
  return (
    <AdminShell
      title="Marketplace"
      subtitle="Multi-vendor architecture · super admin only"
      allow={["super_admin"]}
    >
      <VendorsInner />
    </AdminShell>
  );
}

type Tab = "vendors" | "products" | "analytics" | "commissions" | "payouts" | "support";

const money = (v: number, c = "INR") =>
  new Intl.NumberFormat("en-IN", { style: "currency", currency: c, maximumFractionDigits: 0 }).format(Number(v) || 0);

function VendorsInner() {
  const m = useMarketplace();
  const [tab, setTab] = useState<Tab>("vendors");
  const [busy, setBusy] = useState(false);

  const enabled = !!m.settings?.enabled;

  const stats = useMemo(() => ({
    vendors: m.vendors.length,
    active: m.vendors.filter((v) => v.status === "active").length,
    products: m.products.length,
    commissionDue: m.commissions
      .filter((c) => c.status === "pending")
      .reduce((s, c) => s + Number(c.amount), 0),
    payoutsPending: m.payouts
      .filter((p) => p.status === "pending")
      .reduce((s, p) => s + Number(p.amount), 0),
    openTickets: m.tickets.filter((t) => t.status === "open").length,
  }), [m]);

  async function toggle() {
    setBusy(true);
    await m.setMarketplaceEnabled(!enabled);
    setBusy(false);
  }

  if (m.loading) {
    return <div className="min-h-[40vh] grid place-items-center"><Loader2 className="size-5 animate-spin text-accent" /></div>;
  }

  const tabs: { id: Tab; label: string; icon: typeof Users; count: number }[] = [
    { id: "vendors", label: "Vendors", icon: Users, count: m.vendors.length },
    { id: "products", label: "Products", icon: Package, count: m.products.length },
    { id: "analytics", label: "Analytics", icon: BarChart3, count: m.analytics.length },
    { id: "commissions", label: "Commissions", icon: Percent, count: m.commissions.length },
    { id: "payouts", label: "Payouts", icon: Banknote, count: m.payouts.length },
    { id: "support", label: "Support", icon: LifeBuoy, count: m.tickets.length },
  ];

  return (
    <div className="space-y-6">
      {/* Master switch */}
      <motion.div
        initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.4, ease: [0.16, 1, 0.3, 1] }}
        className="glass border border-white/10 rounded-2xl p-5 flex flex-wrap items-center gap-4"
      >
        <div className={`size-12 grid place-items-center rounded-xl ring-1 ring-inset ${enabled ? "bg-emerald-500/10 ring-emerald-500/30 text-emerald-400" : "bg-white/[0.03] ring-white/10 text-muted-foreground"}`}>
          <Store className="size-5" />
        </div>
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2">
            <h2 className="font-display text-lg">Marketplace</h2>
            <span className={`inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-[10px] font-mono uppercase tracking-widest ${enabled ? "text-emerald-400 border-emerald-500/30 bg-emerald-500/10" : "text-amber-400 border-amber-500/30 bg-amber-500/10"}`}>
              {enabled ? <Radio className="size-3" /> : <Lock className="size-3" />}
              {enabled ? "Live" : "Dormant"}
            </span>
          </div>
          <p className="text-xs text-muted-foreground mt-1">
            {enabled
              ? "Vendor features are active. Vendor onboarding and storefront exposure can be wired on top of this layer."
              : "Architecture is prepared but disabled. Nothing is exposed publicly. Flip the switch when you're ready to expand into a marketplace."}
          </p>
        </div>
        <button
          onClick={toggle}
          disabled={busy}
          className={`inline-flex items-center gap-2 rounded-full px-4 py-2 text-xs font-semibold transition-colors disabled:opacity-50 ${enabled ? "bg-white/5 border border-white/10 hover:bg-white/10 text-foreground" : "bg-accent text-accent-foreground hover:opacity-90"}`}
        >
          {busy ? <Loader2 className="size-4 animate-spin" /> : <Power className="size-4" />}
          {enabled ? "Disable marketplace" : "Enable marketplace"}
        </button>
      </motion.div>

      {/* Governance note */}
      <div className="flex items-center gap-2 text-[11px] text-muted-foreground">
        <ShieldCheck className="size-3.5 text-accent" />
        Restricted to super admins · RLS-protected · realtime · audited
      </div>

      {/* KPIs */}
      <div className="grid grid-cols-2 lg:grid-cols-6 gap-3">
        <Kpi icon={Users} label="Vendors" value={String(stats.vendors)} />
        <Kpi icon={ShieldCheck} label="Active" value={String(stats.active)} />
        <Kpi icon={Package} label="Listings" value={String(stats.products)} />
        <Kpi icon={Percent} label="Commission due" value={money(stats.commissionDue)} />
        <Kpi icon={Banknote} label="Payouts pending" value={money(stats.payoutsPending)} />
        <Kpi icon={LifeBuoy} label="Open tickets" value={String(stats.openTickets)} />
      </div>

      {/* Tabs */}
      <div className="flex flex-wrap gap-1 rounded-full border border-white/10 p-1 w-fit">
        {tabs.map((t) => (
          <button key={t.id} onClick={() => setTab(t.id)}
            className={`inline-flex items-center gap-1.5 px-3.5 py-1.5 rounded-full text-xs transition-colors ${tab === t.id ? "bg-accent text-accent-foreground font-semibold" : "text-muted-foreground hover:text-foreground"}`}>
            <t.icon className="size-3.5" /> {t.label}
            <span className="text-[10px] opacity-70">{t.count}</span>
          </button>
        ))}
      </div>

      {/* Panels */}
      <div className="glass border border-white/10 rounded-2xl overflow-hidden">
        {tab === "vendors" && (
          <Table
            empty="No vendors yet. Vendor accounts will appear here once the marketplace is live."
            head={["Business", "Status", "Country", "Commission", "Created"]}
            rows={m.vendors.map((v) => [
              v.business_name,
              <Pill key="s" value={v.status} />,
              v.country ?? "—",
              v.commission_rate != null ? `${v.commission_rate}%` : "default",
              new Date(v.created_at).toLocaleDateString(),
            ])}
          />
        )}
        {tab === "products" && (
          <Table
            empty="No vendor listings yet."
            head={["Vendor", "Product", "SKU", "Price", "Active"]}
            rows={m.products.map((p) => [
              vendorName(m.vendors, p.vendor_id),
              p.product_slug,
              p.vendor_sku ?? "—",
              p.vendor_price != null ? money(Number(p.vendor_price)) : "—",
              p.active ? "Yes" : "No",
            ])}
          />
        )}
        {tab === "analytics" && (
          <Table
            empty="No vendor analytics snapshots yet."
            head={["Vendor", "Day", "Orders", "Units", "Revenue", "Commission"]}
            rows={m.analytics.map((a) => [
              vendorName(m.vendors, a.vendor_id),
              a.day,
              String(a.orders),
              String(a.units),
              money(Number(a.revenue)),
              money(Number(a.commission)),
            ])}
          />
        )}
        {tab === "commissions" && (
          <Table
            empty="No commissions recorded yet."
            head={["Vendor", "Amount", "Rate", "Status", "Created"]}
            rows={m.commissions.map((c) => [
              vendorName(m.vendors, c.vendor_id),
              money(Number(c.amount), c.currency),
              c.rate != null ? `${c.rate}%` : "—",
              <Pill key="s" value={c.status} />,
              new Date(c.created_at).toLocaleDateString(),
            ])}
          />
        )}
        {tab === "payouts" && (
          <Table
            empty="No payouts yet."
            head={["Vendor", "Amount", "Method", "Status", "Created"]}
            rows={m.payouts.map((p) => [
              vendorName(m.vendors, p.vendor_id),
              money(Number(p.amount), p.currency),
              p.method ?? "—",
              <Pill key="s" value={p.status} />,
              new Date(p.created_at).toLocaleDateString(),
            ])}
          />
        )}
        {tab === "support" && (
          <Table
            empty="No vendor support tickets yet."
            head={["Vendor", "Subject", "Priority", "Status", "Created"]}
            rows={m.tickets.map((t) => [
              vendorName(m.vendors, t.vendor_id),
              t.subject,
              t.priority,
              <Pill key="s" value={t.status} />,
              new Date(t.created_at).toLocaleDateString(),
            ])}
          />
        )}
      </div>
    </div>
  );
}

function vendorName(vendors: { id: string; business_name: string }[], id: string) {
  return vendors.find((v) => v.id === id)?.business_name ?? id.slice(0, 8);
}

function Kpi({ icon: Icon, label, value }: { icon: typeof Users; label: string; value: string }) {
  return (
    <div className="glass border border-white/10 rounded-2xl p-4">
      <Icon className="size-4 text-accent mb-2" />
      <p className="text-lg font-display leading-none truncate">{value}</p>
      <p className="text-[9px] font-mono uppercase tracking-[0.18em] text-muted-foreground/80 mt-2">{label}</p>
    </div>
  );
}

function Pill({ value }: { value: string }) {
  const map: Record<string, string> = {
    active: "text-emerald-400 border-emerald-500/30 bg-emerald-500/10",
    paid: "text-emerald-400 border-emerald-500/30 bg-emerald-500/10",
    closed: "text-emerald-400 border-emerald-500/30 bg-emerald-500/10",
    pending: "text-amber-400 border-amber-500/30 bg-amber-500/10",
    open: "text-amber-400 border-amber-500/30 bg-amber-500/10",
    suspended: "text-destructive border-destructive/30 bg-destructive/10",
    rejected: "text-destructive border-destructive/30 bg-destructive/10",
    failed: "text-destructive border-destructive/30 bg-destructive/10",
  };
  return (
    <span className={`inline-flex items-center rounded-full border px-2 py-0.5 text-[10px] font-mono uppercase tracking-widest ${map[value] ?? "text-muted-foreground border-white/10 bg-white/5"}`}>
      {value}
    </span>
  );
}

function Table({ head, rows, empty }: { head: string[]; rows: React.ReactNode[][]; empty: string }) {
  if (!rows.length) {
    return (
      <div className="p-10 text-center">
        <Store className="size-6 text-muted-foreground/50 mx-auto mb-3" />
        <p className="text-sm text-muted-foreground max-w-md mx-auto">{empty}</p>
      </div>
    );
  }
  return (
    <div className="overflow-x-auto">
      <table className="w-full text-sm">
        <thead>
          <tr className="border-b border-white/10 text-[10px] font-mono uppercase tracking-widest text-muted-foreground">
            {head.map((h) => <th key={h} className="text-left p-3 whitespace-nowrap">{h}</th>)}
          </tr>
        </thead>
        <tbody>
          {rows.map((r, i) => (
            <tr key={i} className="border-b border-white/5 hover:bg-white/[0.02]">
              {r.map((cell, j) => <td key={j} className="p-3 whitespace-nowrap">{cell}</td>)}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
