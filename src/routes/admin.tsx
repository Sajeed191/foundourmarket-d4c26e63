import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { Fragment, useEffect, useState } from "react";
import { Loader2, ShieldAlert, Package, Plus, Pencil, Trash2, X, Upload, Tag, Ticket, Mail, Download, Truck, RotateCcw, BarChart3, Activity, Wallet, Globe, Search, Boxes, Megaphone, Users, FileText, Gem, Cpu, ChevronDown, ChevronRight } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/lib/auth";
import { invalidateProducts } from "@/lib/use-products";
import { ProductEditorModal } from "@/components/admin/ProductEditorModal";
import { invalidateCategories, type Category } from "@/lib/use-categories";
import { resolveImage } from "@/lib/products";
import { DashboardOverview } from "@/components/admin/DashboardOverview";
import { CategoryAdminSheet } from "@/components/admin/CategoryAdminSheet";
import { MarketingAutomationCard } from "@/components/admin/MarketingAutomationCard";
import { CustomerMarketingCard } from "@/components/admin/CustomerMarketingCard";
import { FinancialMarketingCard } from "@/components/admin/FinancialMarketingCard";
import { ExecutiveSummaryPanel } from "@/components/admin/ExecutiveSummaryPanel";
import { AdminHomeCommandCenter } from "@/components/admin/AdminHomeCommandCenter";
import { ExecutiveQuickCard } from "@/components/admin/ExecutiveQuickCard";
import { SegmentedTabs } from "@/components/admin/SegmentedTabs";
import { AdminCustomersTab } from "@/components/admin/AdminCustomersTab";
import { AdminNavDrawer } from "@/components/admin/AdminNavDrawer";
import { AnimatePresence, motion } from "framer-motion";
import { LayoutDashboard } from "lucide-react";


const VALID_TABS = ["overview", "orders", "customers", "products", "categories", "promos", "subscribers"] as const;

export const Route = createFileRoute("/admin")({
  head: () => ({ meta: [{ title: "Admin — FoundOurMarket™" }, { name: "robots", content: "noindex, nofollow" }] }),
  validateSearch: (search: Record<string, unknown>): { tab?: Tab } => {
    const t = search.tab;
    return typeof t === "string" && (VALID_TABS as readonly string[]).includes(t)
      ? { tab: t as Tab }
      : {};
  },
  component: AdminPage,
});

type Order = {
  id: string; user_id: string; status: string; total: number; currency: string;
  contact_email: string | null; created_at: string;
  paid_at: string | null; fulfilled_at: string | null; cancelled_at: string | null;
  order_items: { name: string; quantity: number; product_slug?: string; unit_price?: number; line_total?: number; variant_name?: string | null; variant_size?: string | null; variant_color?: string | null; variant_sku?: string | null }[];
};

type ProductRow = {
  id: string; slug: string; name: string; tagline: string | null; category: string;
  price: number | string; rating: number | string; reviews: number;
  image: string | null; description: string | null; in_stock: boolean;
  discount: number | null; sort_order: number; featured: boolean;
  sku: string | null; stock_quantity: number; low_stock_threshold: number;
};

type PromoRow = {
  id: string; code: string; kind: "percent" | "fixed"; value: number | string;
  active: boolean; max_uses: number | null; uses: number;
  min_subtotal: number | string; expires_at: string | null;
};

type Subscriber = {
  id: string; email: string; source: string | null; status: string; created_at: string;
};

const STATUSES = ["pending", "processing", "shipped", "delivered", "cancelled"] as const;

// Quick status actions with their associated lifecycle timestamp column.
const QUICK_STATUSES: { value: string; label: string; field: "paid_at" | "fulfilled_at" | "cancelled_at" | null }[] = [
  { value: "pending", label: "Pending", field: null },
  { value: "paid", label: "Paid", field: "paid_at" },
  { value: "fulfilled", label: "Fulfilled", field: "fulfilled_at" },
  { value: "cancelled", label: "Cancelled", field: "cancelled_at" },
];
type Tab = "overview" | "orders" | "customers" | "products" | "categories" | "promos" | "subscribers";

function AdminPage() {
  const { user, loading } = useAuth();
  const nav = useNavigate();
  const [isAdmin, setIsAdmin] = useState<boolean | null>(null);
  const [orders, setOrders] = useState<Order[] | null>(null);
  const [products, setProducts] = useState<ProductRow[] | null>(null);
  const [categories, setCategories] = useState<Category[] | null>(null);
  const { tab: tabParam } = Route.useSearch();
  const [tab, setTab] = useState<Tab>(tabParam ?? "overview");
  useEffect(() => { if (tabParam) setTab(tabParam); }, [tabParam]);
  const [updating, setUpdating] = useState<string | null>(null);
  const [editing, setEditing] = useState<ProductRow | "new" | null>(null);
  const [editingCat, setEditingCat] = useState<Category | "new" | null>(null);
  const [promos, setPromos] = useState<PromoRow[] | null>(null);
  const [editingPromo, setEditingPromo] = useState<PromoRow | "new" | null>(null);
  const [subscribers, setSubscribers] = useState<Subscriber[] | null>(null);
  const [expandedOrder, setExpandedOrder] = useState<string | null>(null);


  useEffect(() => { if (!loading && !user) nav({ to: "/auth" }); }, [loading, user, nav]);

  useEffect(() => {
    if (!user) return;
    supabase.from("user_roles").select("role").eq("user_id", user.id)
      .in("role", ["admin", "super_admin", "manager", "support", "fulfillment", "warehouse_staff", "editor"])
      .then(({ data }) => setIsAdmin(!!data && data.length > 0));
  }, [user]);

  useEffect(() => {
    if (!isAdmin) return;
    supabase.from("orders")
      .select("id,user_id,status,total,currency,contact_email,created_at,paid_at,fulfilled_at,cancelled_at,order_items(name,quantity,product_slug,unit_price,line_total,variant_name,variant_size,variant_color,variant_sku)")
      .order("created_at", { ascending: false }).limit(500)
      .then(({ data }) => setOrders((data as Order[]) ?? []));
    loadProducts();
    loadCategories();
    loadPromos();
    loadSubscribers();
  }, [isAdmin]);

  async function loadProducts() {
    const { data } = await supabase.from("products").select("*").order("sort_order", { ascending: true });
    setProducts((data as ProductRow[]) ?? []);
  }

  async function loadSubscribers() {
    const { data } = await supabase.from("newsletter_subscribers").select("*").order("created_at", { ascending: false });
    setSubscribers((data as Subscriber[]) ?? []);
  }

  async function deleteSubscriber(id: string) {
    if (!confirm("Remove this subscriber?")) return;
    await supabase.from("newsletter_subscribers").delete().eq("id", id);
    setSubscribers((prev) => prev?.filter((s) => s.id !== id) ?? null);
  }

  function exportSubscribersCSV() {
    if (!subscribers?.length) return;
    const rows = [["email", "source", "status", "created_at"]].concat(
      subscribers.map((s) => [s.email, s.source ?? "", s.status, s.created_at])
    );
    const csv = rows.map((r) => r.map((c) => `"${String(c).replace(/"/g, '""')}"`).join(",")).join("\n");
    const blob = new Blob([csv], { type: "text/csv;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url; a.download = `subscribers-${new Date().toISOString().slice(0, 10)}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  }


  async function loadPromos() {
    const { data } = await supabase.from("promo_codes").select("*").order("created_at", { ascending: false });
    setPromos((data as PromoRow[]) ?? []);
  }

  async function loadCategories() {
    const { data } = await supabase.from("categories").select("*").order("sort_order", { ascending: true });
    setCategories((data as Category[]) ?? []);
  }

  async function updateStatus(id: string, status: string) {
    setUpdating(id);
    const field = QUICK_STATUSES.find((s) => s.value === status)?.field ?? null;
    const now = new Date().toISOString();
    const patch: { status: string; paid_at?: string; fulfilled_at?: string; cancelled_at?: string } = { status };
    if (field) patch[field] = now;
    const { error } = await supabase.from("orders").update(patch).eq("id", id);
    if (!error) setOrders((prev) => prev?.map((o) => o.id === id ? { ...o, status, ...(field ? { [field]: now } : {}) } : o) ?? null);
    setUpdating(null);
  }

  async function deleteProduct(id: string) {
    if (!confirm("Delete this product?")) return;
    await supabase.from("products").delete().eq("id", id);
    await loadProducts();
    invalidateProducts();
  }

  async function deleteCategory(id: string) {
    if (!confirm("Delete this category? Products in it will keep their category slug.")) return;
    await supabase.from("categories").delete().eq("id", id);
    await loadCategories();
    invalidateCategories();
  }

  async function deletePromo(id: string) {
    if (!confirm("Delete this promo code?")) return;
    await supabase.from("promo_codes").delete().eq("id", id);
    await loadPromos();
  }



  if (loading || isAdmin === null) {
    return <div className="min-h-[60vh] grid place-items-center"><Loader2 className="size-5 animate-spin text-muted-foreground" /></div>;
  }

  if (!isAdmin) {
    return (
      <div className="min-h-[60vh] grid place-items-center px-6">
        <div className="text-center max-w-md">
          <div className="size-14 mx-auto mb-5 grid place-items-center rounded-full border border-border">
            <ShieldAlert className="size-5 text-accent" />
          </div>
          <h1 className="text-2xl font-display font-semibold mb-2">Admin access required</h1>
          <p className="text-sm text-muted-foreground mb-6">
            Signed in as <span className="text-foreground">{user?.email}</span>. This area requires admin access. Please contact your super-admin to be granted permission.
          </p>
          <Link to="/" className="inline-block mt-6 text-xs uppercase tracking-widest text-accent">← Back to shop</Link>
        </div>
      </div>
    );
  }

  const list = orders ?? [];
  const totalRevenue = list.reduce((s, o) => s + Number(o.total), 0);
  const customerMap = new Map<string, { email: string | null; orders: number; spent: number; last: string }>();
  for (const o of list) {
    const prev = customerMap.get(o.user_id);
    customerMap.set(o.user_id, {
      email: o.contact_email ?? prev?.email ?? null,
      orders: (prev?.orders ?? 0) + 1,
      spent: (prev?.spent ?? 0) + Number(o.total),
      last: prev?.last && prev.last > o.created_at ? prev.last : o.created_at,
    });
  }
  const customers = [...customerMap.entries()].sort((a, b) => b[1].spent - a[1].spent);
  const totalUnits = list.reduce((s, o) => s + o.order_items.reduce((a, i) => a + i.quantity, 0), 0);

  return (
    <div className="relative max-w-7xl mx-auto px-4 sm:px-6 py-10 sm:py-16">
      <AdminNavDrawer />
      {/* Ambient background atmosphere */}
      <div aria-hidden className="pointer-events-none fixed inset-0 -z-10 overflow-hidden">
        <div className="orb absolute -top-32 left-1/2 -translate-x-1/2 size-[40rem] opacity-40" style={{ background: "var(--gradient-ember)" }} />
        <div className="orb absolute top-1/3 -right-40 size-[30rem] opacity-25" style={{ background: "radial-gradient(circle, oklch(0.55 0.18 280 / 0.5), transparent 70%)" }} />
        <div className="orb absolute bottom-0 -left-40 size-[34rem] opacity-25" style={{ background: "var(--gradient-ember-soft)" }} />
        <div className="absolute inset-0 opacity-[0.5]" style={{ background: "radial-gradient(ellipse at 50% 0%, transparent 40%, oklch(0.1 0.01 260 / 0.6) 100%)" }} />
      </div>

      <motion.div
        initial={{ opacity: 0, y: 18, filter: "blur(8px)" }}
        animate={{ opacity: 1, y: 0, filter: "blur(0px)" }}
        transition={{ duration: 0.6, ease: [0.16, 1, 0.3, 1] }}
        className="relative overflow-hidden rounded-[1.75rem] glass-strong glass-reflect noise-layer p-6 md:p-10 mb-8 shadow-[var(--shadow-float),0_40px_120px_-40px_oklch(0.74_0.19_49/0.25)]"
      >
        <div className="orb absolute -top-24 -left-24 size-72 opacity-60 animate-orb" style={{ background: "var(--gradient-ember-soft)" }} />
        <div className="orb absolute -bottom-32 -right-20 size-80 opacity-40 animate-orb" style={{ background: "radial-gradient(circle, oklch(0.55 0.18 280 / 0.5), transparent 70%)" }} />
        <div className="absolute inset-0 opacity-[0.04]" style={{ backgroundImage: "linear-gradient(oklch(1 0 0) 1px, transparent 1px), linear-gradient(90deg, oklch(1 0 0) 1px, transparent 1px)", backgroundSize: "42px 42px", maskImage: "radial-gradient(circle at 50% 30%, black, transparent 75%)" }} />

        <div className="relative flex items-end justify-between flex-wrap gap-6">
          <div>
            <p className="text-[10px] font-mono uppercase tracking-[0.3em] text-accent mb-3 inline-flex items-center gap-2">
              <span className="size-1.5 rounded-full bg-accent shadow-[0_0_10px_var(--accent)] animate-pulse" />
              Operator Console
            </p>
            <h1 className="text-3xl md:text-5xl font-display font-semibold tracking-tight leading-[1.05]">
              Admin <span className="text-gradient-ember">Dashboard</span>
            </h1>
            <p className="text-sm text-muted-foreground mt-3 max-w-md">Real-time operations, catalog, and customer intelligence.</p>
          </div>
          <div className="flex gap-2.5 flex-wrap max-w-2xl justify-end">
            <motion.button
              whileHover={{ y: -2, scale: 1.03 }}
              whileTap={{ scale: 0.96 }}
              transition={{ type: "spring", stiffness: 400, damping: 22 }}
              onClick={() => { setTab("products"); setEditing("new"); }}
              className="inline-flex items-center gap-2 text-xs uppercase tracking-widest bg-gradient-to-b from-accent to-[oklch(0.68_0.19_45)] text-accent-foreground rounded-full px-5 py-2.5 font-bold shadow-[var(--shadow-ember)] ring-1 ring-inset ring-white/20"
            >
              <Plus className="size-3.5" /> New Product
            </motion.button>
            <motion.button
              whileHover={{ y: -2, scale: 1.03 }}
              whileTap={{ scale: 0.96 }}
              transition={{ type: "spring", stiffness: 400, damping: 22 }}
              onClick={() => setTab("categories")}
              className="inline-flex items-center gap-2 text-xs uppercase tracking-widest glass rounded-full px-5 py-2.5 text-accent ring-1 ring-inset ring-accent/30 shadow-[0_8px_30px_-12px_oklch(0.74_0.19_49/0.5)]"
            >
              <Plus className="size-3.5" /> Manage Categories
            </motion.button>
          </div>
        </div>

      </motion.div>



      <div className="sticky top-2 z-30 mb-8">
        <SegmentedTabs
          value={tab}
          onChange={(v) => setTab(v as Tab)}
          items={[
            { value: "overview", label: "Overview", icon: <LayoutDashboard className="size-3.5" /> },
            { value: "orders", label: "Orders", icon: <Truck className="size-3.5" /> },
            { value: "products", label: "Products", icon: <Package className="size-3.5" /> },
            { value: "categories", label: "Categories", icon: <Boxes className="size-3.5" /> },
            { value: "promos", label: "Promos", icon: <Ticket className="size-3.5" /> },
            { value: "customers", label: "Customers", icon: <Users className="size-3.5" /> },
            { value: "subscribers", label: "Subscribers", icon: <Mail className="size-3.5" /> },
          ]}
        />
      </div>

      <AnimatePresence mode="wait">
      <motion.div
        key={tab}
        initial={{ opacity: 0, y: 14, filter: "blur(6px)" }}
        animate={{ opacity: 1, y: 0, filter: "blur(0px)" }}
        exit={{ opacity: 0, y: -10, filter: "blur(6px)" }}
        transition={{ duration: 0.35, ease: [0.16, 1, 0.3, 1] }}
      >
      {tab === "overview" && (
        <>
          <div className="mb-8"><AdminHomeCommandCenter /></div>
          <DashboardOverview orders={orders} products={products} customersCount={customers.length} />
          <div className="my-8"><ExecutiveQuickCard /></div>
          <div className="my-8"><ExecutiveSummaryPanel source="dashboard" /></div>
          <div className="my-8 grid lg:grid-cols-2 xl:grid-cols-3 gap-6"><MarketingAutomationCard /><CustomerMarketingCard /><FinancialMarketingCard /></div>
          <h2 className="text-xl font-medium mb-6">Recent orders</h2>
          {orders === null ? <Loader2 className="size-4 animate-spin text-muted-foreground" /> :
            list.length === 0 ? <p className="text-sm text-muted-foreground">No orders yet.</p> :
            <div className="card-premium rounded-2xl divide-y divide-border/40">
              {list.slice(0, 8).map((o) => (
                <div key={o.id} className="px-5 py-4 flex items-center justify-between">
                  <div>
                    <p className="font-mono text-[11px] text-muted-foreground">#{o.id.slice(0, 8)}</p>
                    <p className="text-sm">{o.contact_email ?? "—"}</p>
                  </div>
                  <div className="text-right">
                    <p className="font-mono text-accent">${Number(o.total).toFixed(2)}</p>
                    <p className="text-[10px] font-mono uppercase tracking-widest text-muted-foreground">{o.status}</p>
                  </div>
                </div>
              ))}
            </div>
          }
          <p className="text-[10px] font-mono uppercase tracking-widest text-muted-foreground mt-4">Units sold: {totalUnits}</p>
        </>
      )}

      {tab === "orders" && (
        orders === null ? <Loader2 className="size-4 animate-spin text-muted-foreground" /> :
        list.length === 0 ? <p className="text-sm text-muted-foreground">No orders yet.</p> :
        <div className="overflow-x-auto card-premium rounded-2xl">
          <table className="w-full text-sm min-w-[800px]">
            <thead className="text-[10px] font-mono uppercase tracking-widest text-muted-foreground border-b border-border">
              <tr><th className="w-8 px-3 py-3" /><th className="text-left px-5 py-3">Order</th><th className="text-left px-5 py-3">Customer</th><th className="text-left px-5 py-3">Items</th><th className="text-left px-5 py-3">Status</th><th className="text-right px-5 py-3">Total</th><th className="text-right px-5 py-3">Date</th></tr>
            </thead>
            <tbody>
              {list.map((o) => {
                const open = expandedOrder === o.id;
                const units = o.order_items.reduce((s, i) => s + i.quantity, 0);
                const cur = o.currency || "USD";
                const fmt = (v: number) => { try { return new Intl.NumberFormat("en-US", { style: "currency", currency: cur, maximumFractionDigits: 2 }).format(v); } catch { return `${cur} ${v.toFixed(2)}`; } };
                return (
                  <Fragment key={o.id}>
                    <tr
                      onClick={() => setExpandedOrder(open ? null : o.id)}
                      className="border-b border-border/40 hover:bg-accent/5 cursor-pointer"
                    >
                      <td className="px-3 py-3 text-muted-foreground">{open ? <ChevronDown className="size-4" /> : <ChevronRight className="size-4" />}</td>
                      <td className="px-5 py-3 font-mono text-[11px]">#{o.id.slice(0, 8)}</td>
                      <td className="px-5 py-3 text-xs truncate max-w-[180px]">{o.contact_email ?? "—"}</td>
                      <td className="px-5 py-3 text-xs text-muted-foreground">{units} unit{units === 1 ? "" : "s"} · {o.order_items.length} item{o.order_items.length === 1 ? "" : "s"}</td>
                      <td className="px-5 py-3" onClick={(e) => e.stopPropagation()}>
                        <div className="flex flex-wrap items-center gap-1.5">
                          {QUICK_STATUSES.map((s) => {
                            const active = o.status === s.value;
                            return (
                              <button
                                key={s.value}
                                type="button"
                                disabled={updating === o.id || active}
                                onClick={() => updateStatus(o.id, s.value)}
                                className={`rounded-md px-2 py-1 text-[10px] font-mono uppercase tracking-widest transition-colors disabled:opacity-60 ${active ? "bg-accent text-accent-foreground border border-accent" : "border border-border text-muted-foreground hover:border-accent hover:text-accent"}`}
                              >
                                {s.label}
                              </button>
                            );
                          })}
                          {updating === o.id ? <Loader2 className="size-3 animate-spin text-muted-foreground" /> : null}
                        </div>
                      </td>
                      <td className="px-5 py-3 text-right font-mono text-accent">{fmt(Number(o.total))}</td>
                      <td className="px-5 py-3 text-right text-[11px] font-mono text-muted-foreground">{new Date(o.created_at).toLocaleDateString()}</td>
                    </tr>
                    {open && (
                      <tr className="border-b border-border/40 bg-white/[0.02]">
                        <td colSpan={7} className="px-5 py-4">
                          <div className="grid gap-4 lg:grid-cols-[1fr_280px]">
                            <div>
                              <p className="text-[10px] font-mono uppercase tracking-widest text-muted-foreground mb-2">Ordered items</p>
                              <div className="rounded-xl border border-white/10 overflow-hidden">
                                <table className="w-full text-xs">
                                  <thead className="text-[10px] font-mono uppercase tracking-widest text-muted-foreground bg-white/[0.02]">
                                    <tr>
                                      <th className="text-left px-3 py-2">Product</th>
                                      <th className="text-right px-3 py-2">Qty</th>
                                      <th className="text-right px-3 py-2">Unit</th>
                                      <th className="text-right px-3 py-2">Line total</th>
                                    </tr>
                                  </thead>
                                  <tbody>
                                    {o.order_items.map((i, idx) => (
                                      <tr key={idx} className="border-t border-white/5">
                                        <td className="px-3 py-2">
                                          <span className="font-medium">{i.name}</span>
                                          {([i.variant_color, i.variant_size].filter(Boolean).join(" · ") || i.variant_name) && (
                                            <span className="block text-[10px] text-accent/90">{[i.variant_color, i.variant_size].filter(Boolean).join(" · ") || i.variant_name}{i.variant_sku ? ` · ${i.variant_sku}` : ""}</span>
                                          )}
                                          {i.product_slug && <span className="block text-[10px] text-muted-foreground font-mono">{i.product_slug}</span>}
                                        </td>
                                        <td className="px-3 py-2 text-right font-mono tabular-nums">{i.quantity}</td>
                                        <td className="px-3 py-2 text-right font-mono">{i.unit_price != null ? fmt(Number(i.unit_price)) : "—"}</td>
                                        <td className="px-3 py-2 text-right font-mono text-accent">{i.line_total != null ? fmt(Number(i.line_total)) : (i.unit_price != null ? fmt(Number(i.unit_price) * i.quantity) : "—")}</td>
                                      </tr>
                                    ))}
                                  </tbody>
                                </table>
                              </div>
                            </div>
                            <div className="space-y-1.5 text-xs">
                              <p className="text-[10px] font-mono uppercase tracking-widest text-muted-foreground mb-1">Order details</p>
                              <div className="flex justify-between gap-3"><span className="text-muted-foreground">Order ID</span><span className="font-mono">{o.id}</span></div>
                              <div className="flex justify-between gap-3"><span className="text-muted-foreground">Customer</span><span className="truncate">{o.contact_email ?? "—"}</span></div>
                              <div className="flex justify-between gap-3"><span className="text-muted-foreground">User ID</span><span className="font-mono truncate max-w-[150px]">{o.user_id}</span></div>
                              <div className="flex justify-between gap-3"><span className="text-muted-foreground">Status</span><span className="uppercase">{o.status}</span></div>
                              <div className="flex justify-between gap-3"><span className="text-muted-foreground">Placed</span><span>{new Date(o.created_at).toLocaleString()}</span></div>
                              {o.paid_at && <div className="flex justify-between gap-3"><span className="text-muted-foreground">Paid</span><span>{new Date(o.paid_at).toLocaleString()}</span></div>}
                              {o.fulfilled_at && <div className="flex justify-between gap-3"><span className="text-muted-foreground">Fulfilled</span><span>{new Date(o.fulfilled_at).toLocaleString()}</span></div>}
                              {o.cancelled_at && <div className="flex justify-between gap-3"><span className="text-muted-foreground">Cancelled</span><span>{new Date(o.cancelled_at).toLocaleString()}</span></div>}
                              <div className="flex justify-between gap-3 border-t border-white/10 pt-1.5 mt-1.5"><span className="text-muted-foreground">Total</span><span className="font-mono text-accent">{fmt(Number(o.total))}</span></div>
                            </div>
                          </div>
                        </td>
                      </tr>
                    )}
                  </Fragment>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      {tab === "products" && (
        <>
          <div className="flex justify-between items-center mb-6">
            <h2 className="text-xl font-medium">Catalog</h2>
            <button onClick={() => setEditing("new")} className="inline-flex items-center gap-2 bg-accent text-accent-foreground px-4 py-2 rounded-full text-xs uppercase tracking-widest font-bold hover:brightness-110 transition-all">
              <Plus className="size-3.5" /> New Product
            </button>
          </div>
          {products === null ? <Loader2 className="size-4 animate-spin text-muted-foreground" /> :
            products.length === 0 ? <p className="text-sm text-muted-foreground">No products yet.</p> :
            <div className="overflow-x-auto card-premium rounded-2xl">
              <table className="w-full text-sm min-w-[720px]">
                <thead className="text-[10px] font-mono uppercase tracking-widest text-muted-foreground border-b border-border">
                  <tr><th className="text-left px-5 py-3">Product</th><th className="text-left px-5 py-3">Category</th><th className="text-right px-5 py-3">Price</th><th className="text-right px-5 py-3">Stock</th><th className="px-5 py-3"></th></tr>
                </thead>
                <tbody>
                  {products.map((p) => (
                    <tr key={p.id} className="border-b border-border/40 last:border-0 hover:bg-accent/5">
                      <td className="px-5 py-3">
                        <div className="flex items-center gap-3">
                          <div className="size-10 rounded-lg overflow-hidden bg-background border border-border shrink-0">
                            {p.image && <img loading="lazy" decoding="async" src={resolveImage(p.image)} alt="" className="w-full h-full object-cover" />}
                          </div>
                          <div>
                            <p className="text-sm">{p.name}</p>
                            <p className="font-mono text-[10px] text-muted-foreground">{p.slug}</p>
                          </div>
                        </div>
                      </td>
                      <td className="px-5 py-3 text-xs text-muted-foreground capitalize">{p.category}</td>
                      <td className="px-5 py-3 text-right font-mono text-accent">${Number(p.price).toFixed(2)}</td>
                      <td className="px-5 py-3 text-right">
                        <div className="flex flex-wrap gap-1 justify-end items-center">
                          {p.featured && <span className="text-[9px] font-mono uppercase tracking-widest bg-foreground/10 text-foreground px-2 py-0.5 rounded-full">Featured</span>}
                          {p.discount && <span className="text-[9px] font-mono uppercase tracking-widest bg-accent/15 text-accent px-2 py-0.5 rounded-full">Sale −{p.discount}%</span>}
                          <span className={`text-[9px] font-mono uppercase tracking-widest px-2 py-0.5 rounded-full ${
                            p.stock_quantity <= 0 ? "bg-muted text-muted-foreground" :
                            p.stock_quantity <= p.low_stock_threshold ? "bg-accent/15 text-accent" :
                            "bg-accent/10 text-accent"
                          }`}>
                            {p.stock_quantity <= 0 ? "Out" : `${p.stock_quantity} in stock`}
                          </span>
                        </div>
                      </td>

                      <td className="px-5 py-3 text-right">
                        <div className="flex justify-end gap-1">
                          <button onClick={() => setEditing(p)} className="size-8 grid place-items-center rounded-full hover:bg-white/5 transition-colors" aria-label="Edit">
                            <Pencil className="size-3.5" />
                          </button>
                          <button onClick={() => deleteProduct(p.id)} className="size-8 grid place-items-center rounded-full hover:bg-white/5 hover:text-accent transition-colors" aria-label="Delete">
                            <Trash2 className="size-3.5" />
                          </button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          }
        </>
      )}

      {tab === "customers" && <AdminCustomersTab />}

      {tab === "categories" && (
        <CategoryAdminSheet
          variant="embedded"
          onClose={() => setTab("overview")}
          onChanged={async () => { await loadCategories(); invalidateCategories(); }}
          productCounts={(products ?? []).reduce<Record<string, number>>((acc, p) => {
            acc[p.category] = (acc[p.category] ?? 0) + 1;
            return acc;
          }, {})}
        />
      )}

      {tab === "promos" && (
        <>
          <div className="flex justify-between items-center mb-6">
            <h2 className="text-xl font-medium">Promo Codes</h2>
            <button onClick={() => setEditingPromo("new")} className="inline-flex items-center gap-2 bg-accent text-accent-foreground px-4 py-2 rounded-full text-xs uppercase tracking-widest font-bold hover:brightness-110 transition-all">
              <Plus className="size-3.5" /> New Code
            </button>
          </div>
          {promos === null ? <Loader2 className="size-4 animate-spin text-muted-foreground" /> :
            promos.length === 0 ? <p className="text-sm text-muted-foreground">No promo codes yet.</p> :
            <div className="overflow-x-auto card-premium rounded-2xl">
              <table className="w-full text-sm min-w-[760px]">
                <thead className="text-[10px] font-mono uppercase tracking-widest text-muted-foreground border-b border-border">
                  <tr>
                    <th className="text-left px-5 py-3">Code</th>
                    <th className="text-left px-5 py-3">Discount</th>
                    <th className="text-right px-5 py-3">Min Subtotal</th>
                    <th className="text-right px-5 py-3">Uses</th>
                    <th className="text-left px-5 py-3">Expires</th>
                    <th className="text-left px-5 py-3">Status</th>
                    <th className="px-5 py-3"></th>
                  </tr>
                </thead>
                <tbody>
                  {promos.map((p) => (
                    <tr key={p.id} className="border-b border-border/40 last:border-0 hover:bg-accent/5">
                      <td className="px-5 py-3">
                        <div className="flex items-center gap-3">
                          <div className="size-9 rounded-lg bg-background border border-border grid place-items-center"><Ticket className="size-4 text-muted-foreground" /></div>
                          <p className="font-mono uppercase tracking-widest text-xs">{p.code}</p>
                        </div>
                      </td>
                      <td className="px-5 py-3 text-xs">{p.kind === "percent" ? `${Number(p.value)}%` : `$${Number(p.value).toFixed(2)}`}</td>
                      <td className="px-5 py-3 text-right font-mono text-xs">${Number(p.min_subtotal).toFixed(2)}</td>
                      <td className="px-5 py-3 text-right font-mono text-xs">{p.uses}{p.max_uses != null ? ` / ${p.max_uses}` : ""}</td>
                      <td className="px-5 py-3 text-[11px] font-mono text-muted-foreground">{p.expires_at ? new Date(p.expires_at).toLocaleDateString() : "—"}</td>
                      <td className="px-5 py-3 text-[11px] font-mono uppercase tracking-widest">
                        <span className={p.active ? "text-accent" : "text-muted-foreground"}>{p.active ? "Active" : "Inactive"}</span>
                      </td>
                      <td className="px-5 py-3 text-right">
                        <div className="flex justify-end gap-1">
                          <button onClick={() => setEditingPromo(p)} className="size-8 grid place-items-center rounded-full hover:bg-white/5 transition-colors" aria-label="Edit"><Pencil className="size-3.5" /></button>
                          <button onClick={() => deletePromo(p.id)} className="size-8 grid place-items-center rounded-full hover:bg-white/5 hover:text-accent transition-colors" aria-label="Delete"><Trash2 className="size-3.5" /></button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          }
        </>
      )}

      {editing && (
        <ProductEditorModal
          row={editing === "new" ? null : editing}
          nextSort={(products?.length ?? 0) + 1}
          categories={categories ?? []}
          onClose={() => setEditing(null)}
          onSaved={async () => { setEditing(null); await loadProducts(); invalidateProducts(); }}
          onRefresh={() => { void loadProducts(); invalidateProducts(); }}
        />
      )}

      {editingCat && (
        <CategoryEditor
          row={editingCat === "new" ? null : editingCat}
          nextSort={(categories?.length ?? 0) + 1}
          onClose={() => setEditingCat(null)}
          onSaved={async () => { setEditingCat(null); await loadCategories(); invalidateCategories(); }}
        />
      )}

      {tab === "subscribers" && (
        <>
          <div className="flex justify-between items-center mb-6 gap-3 flex-wrap">
            <h2 className="text-xl font-medium">Newsletter Subscribers {subscribers && <span className="text-muted-foreground text-sm font-mono">· {subscribers.length}</span>}</h2>
            <button
              onClick={exportSubscribersCSV}
              disabled={!subscribers?.length}
              className="inline-flex items-center gap-2 border border-border px-4 py-2 rounded-full text-xs uppercase tracking-widest font-bold hover:bg-white/5 transition-all disabled:opacity-50"
            >
              <Download className="size-3.5" /> Export CSV
            </button>
          </div>
          {subscribers === null ? <Loader2 className="size-4 animate-spin text-muted-foreground" /> :
            subscribers.length === 0 ? <p className="text-sm text-muted-foreground">No subscribers yet.</p> :
            <div className="overflow-x-auto card-premium rounded-2xl">
              <table className="w-full text-sm min-w-[640px]">
                <thead className="text-[10px] font-mono uppercase tracking-widest text-muted-foreground border-b border-border">
                  <tr>
                    <th className="text-left px-5 py-3">Email</th>
                    <th className="text-left px-5 py-3">Source</th>
                    <th className="text-left px-5 py-3">Status</th>
                    <th className="text-left px-5 py-3">Subscribed</th>
                    <th className="px-5 py-3"></th>
                  </tr>
                </thead>
                <tbody>
                  {subscribers.map((s) => (
                    <tr key={s.id} className="border-b border-border/40 last:border-0 hover:bg-accent/5">
                      <td className="px-5 py-3">
                        <div className="flex items-center gap-3">
                          <div className="size-9 rounded-lg bg-background border border-border grid place-items-center"><Mail className="size-4 text-muted-foreground" /></div>
                          <p className="text-xs">{s.email}</p>
                        </div>
                      </td>
                      <td className="px-5 py-3 text-[11px] font-mono uppercase tracking-widest text-muted-foreground">{s.source ?? "—"}</td>
                      <td className="px-5 py-3 text-[11px] font-mono uppercase tracking-widest">
                        <span className={s.status === "subscribed" ? "text-accent" : "text-muted-foreground"}>{s.status}</span>
                      </td>
                      <td className="px-5 py-3 text-[11px] font-mono text-muted-foreground">{new Date(s.created_at).toLocaleDateString()}</td>
                      <td className="px-5 py-3 text-right">
                        <button onClick={() => deleteSubscriber(s.id)} className="size-8 grid place-items-center rounded-full hover:bg-white/5 hover:text-accent transition-colors" aria-label="Delete"><Trash2 className="size-3.5" /></button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          }
        </>
      )}
      </motion.div>
      </AnimatePresence>



      {editingPromo && (
        <PromoEditor
          row={editingPromo === "new" ? null : editingPromo}
          onClose={() => setEditingPromo(null)}
          onSaved={async () => { setEditingPromo(null); await loadPromos(); }}
        />
      )}
    </div>
  );
}

function PromoEditor({ row, onClose, onSaved }: { row: PromoRow | null; onClose: () => void; onSaved: () => void }) {
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [form, setForm] = useState({
    code: row?.code ?? "",
    kind: (row?.kind ?? "percent") as "percent" | "fixed",
    value: row ? String(row.value) : "10",
    active: row?.active ?? true,
    min_subtotal: row ? String(row.min_subtotal) : "0",
    max_uses: row?.max_uses != null ? String(row.max_uses) : "",
    expires_at: row?.expires_at ? row.expires_at.slice(0, 10) : "",
  });

  async function save(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true); setError(null);
    const payload = {
      code: form.code.trim().toUpperCase(),
      kind: form.kind,
      value: Number(form.value) || 0,
      active: form.active,
      min_subtotal: Number(form.min_subtotal) || 0,
      max_uses: form.max_uses ? Number(form.max_uses) : null,
      expires_at: form.expires_at ? new Date(form.expires_at).toISOString() : null,
    };
    const { error } = row
      ? await supabase.from("promo_codes").update(payload).eq("id", row.id)
      : await supabase.from("promo_codes").insert(payload);
    setSaving(false);
    if (error) { setError(error.message); return; }
    onSaved();
  }

  return (
    <div className="fixed inset-0 z-50 grid place-items-center bg-black/70 backdrop-blur-sm p-4" onClick={onClose}>
      <form onSubmit={save} onClick={(e) => e.stopPropagation()} className="w-full max-w-xl card-premium rounded-2xl p-8 max-h-[90vh] overflow-y-auto">
        <div className="flex justify-between items-center mb-6">
          <h2 className="text-xl font-display">{row ? "Edit Promo Code" : "New Promo Code"}</h2>
          <button type="button" onClick={onClose} className="size-8 grid place-items-center rounded-full hover:bg-white/5"><X className="size-4" /></button>
        </div>
        <div className="grid grid-cols-2 gap-4">
          <Field label="Code" required value={form.code} onChange={(v) => setForm({ ...form, code: v.toUpperCase() })} />
          <div>
            <label className="block text-[10px] font-mono uppercase tracking-widest text-muted-foreground mb-2">Kind</label>
            <select value={form.kind} onChange={(e) => setForm({ ...form, kind: e.target.value as "percent" | "fixed" })}
              className="w-full bg-background border border-border rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-accent">
              <option value="percent">Percent off</option>
              <option value="fixed">Fixed amount (USD)</option>
            </select>
          </div>
          <Field label={form.kind === "percent" ? "Value (%)" : "Value (USD)"} type="number" required value={form.value} onChange={(v) => setForm({ ...form, value: v })} />
          <Field label="Min Subtotal (USD)" type="number" value={form.min_subtotal} onChange={(v) => setForm({ ...form, min_subtotal: v })} />
          <Field label="Max Uses (blank = ∞)" type="number" value={form.max_uses} onChange={(v) => setForm({ ...form, max_uses: v })} />
          <Field label="Expires" type="date" value={form.expires_at} onChange={(v) => setForm({ ...form, expires_at: v })} />
          <label className="flex items-center gap-2 text-sm col-span-2">
            <input type="checkbox" checked={form.active} onChange={(e) => setForm({ ...form, active: e.target.checked })} className="accent-[var(--accent)]" />
            Active
          </label>
        </div>
        {error && <p className="text-xs text-red-400 mt-4">{error}</p>}
        <div className="flex justify-end gap-2 mt-6">
          <button type="button" onClick={onClose} className="px-5 py-2 rounded-full text-xs uppercase tracking-widest border border-border hover:bg-white/5">Cancel</button>
          <button type="submit" disabled={saving} className="px-5 py-2 rounded-full text-xs uppercase tracking-widest font-bold bg-accent text-accent-foreground hover:brightness-110 disabled:opacity-50">
            {saving ? "Saving…" : "Save"}
          </button>
        </div>
      </form>
    </div>
  );
}

// Legacy inline ProductEditor removed — unified into ProductEditorModal.


function GalleryManager({ slug }: { slug: string }) {
  const [images, setImages] = useState<{ id: string; url: string; alt: string | null; sort_order: number }[]>([]);
  const [uploading, setUploading] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  async function load() {
    const { data } = await supabase.from("product_images").select("id,url,alt,sort_order").eq("product_slug", slug).order("sort_order");
    setImages(data ?? []);
  }
  useEffect(() => { load(); }, [slug]);

  async function onUpload(file: File) {
    setUploading(true); setErr(null);
    const ext = file.name.split(".").pop() ?? "jpg";
    const path = `${slug}/${Date.now()}-${Math.random().toString(36).slice(2, 8)}.${ext}`;
    const { error: upErr } = await supabase.storage.from("product-images").upload(path, file, { contentType: file.type });
    if (upErr) { setErr(upErr.message); setUploading(false); return; }
    const { data } = supabase.storage.from("product-images").getPublicUrl(path);
    const { error: insErr } = await supabase.from("product_images").insert({
      product_slug: slug, url: data.publicUrl, sort_order: images.length,
    });
    if (insErr) setErr(insErr.message);
    await load();
    setUploading(false);
  }

  async function remove(id: string) {
    await supabase.from("product_images").delete().eq("id", id);
    load();
  }

  return (
    <div>
      <div className="flex justify-between items-center mb-3">
        <h3 className="text-sm font-medium">Gallery Images <span className="text-muted-foreground font-mono text-[10px]">· {images.length}</span></h3>
        <label className="inline-flex items-center gap-2 cursor-pointer px-3 py-1.5 rounded-lg border border-border text-[10px] font-mono uppercase tracking-widest hover:bg-white/5 transition-colors">
          {uploading ? <Loader2 className="size-3 animate-spin" /> : <Upload className="size-3" />}
          {uploading ? "Uploading…" : "Add Image"}
          <input type="file" accept="image/*" className="hidden" disabled={uploading}
            onChange={(e) => { const f = e.target.files?.[0]; if (f) onUpload(f); }} />
        </label>
      </div>
      {images.length === 0 ? (
        <p className="text-[11px] text-muted-foreground">No gallery images yet. The main image is used as a fallback.</p>
      ) : (
        <div className="grid grid-cols-4 sm:grid-cols-6 gap-2">
          {images.map((img) => (
            <div key={img.id} className="relative group aspect-square rounded-lg overflow-hidden border border-border bg-background">
              <img loading="lazy" decoding="async" src={img.url} alt={img.alt ?? ""} className="w-full h-full object-cover" />
              <button type="button" onClick={() => remove(img.id)} className="absolute top-1 right-1 size-6 grid place-items-center rounded-full bg-black/70 opacity-0 group-hover:opacity-100 transition-opacity" aria-label="Remove image">
                <X className="size-3" />
              </button>
            </div>
          ))}
        </div>
      )}
      {err && <p className="text-xs text-red-400 mt-2">{err}</p>}
    </div>
  );
}

function VariantManager({ slug }: { slug: string }) {
  const [variants, setVariants] = useState<{ id: string; name: string; sku: string | null; price_override: number | string | null; stock_quantity: number; sort_order: number }[]>([]);
  const [draft, setDraft] = useState({ name: "", sku: "", price_override: "", stock_quantity: "0" });
  const [err, setErr] = useState<string | null>(null);

  async function load() {
    const { data } = await supabase.from("product_variants").select("id,name,sku,price_override,stock_quantity,sort_order").eq("product_slug", slug).order("sort_order");
    setVariants(data ?? []);
  }
  useEffect(() => { load(); }, [slug]);

  async function add() {
    if (!draft.name.trim()) return;
    setErr(null);
    const { error } = await supabase.from("product_variants").insert({
      product_slug: slug,
      name: draft.name.trim(),
      sku: draft.sku.trim() || null,
      price_override: draft.price_override ? Number(draft.price_override) : null,
      stock_quantity: Number(draft.stock_quantity) || 0,
      sort_order: variants.length,
    });
    if (error) { setErr(error.message); return; }
    setDraft({ name: "", sku: "", price_override: "", stock_quantity: "0" });
    load();
  }

  async function update(id: string, patch: Record<string, any>) {
    await (supabase.from("product_variants") as any).update(patch).eq("id", id);
    load();
  }

  async function remove(id: string) {
    await supabase.from("product_variants").delete().eq("id", id);
    load();
  }

  return (
    <div>
      <h3 className="text-sm font-medium mb-3">Variants <span className="text-muted-foreground font-mono text-[10px]">· {variants.length}</span></h3>
      {variants.length > 0 && (
        <div className="space-y-2 mb-4">
          {variants.map((v) => (
            <div key={v.id} className="grid grid-cols-12 gap-2 items-center text-sm">
              <input value={v.name} onChange={(e) => setVariants((arr) => arr.map((x) => x.id === v.id ? { ...x, name: e.target.value } : x))}
                onBlur={(e) => update(v.id, { name: e.target.value })}
                className="col-span-4 bg-background border border-border rounded-lg px-2 py-1.5 text-xs focus:outline-none focus:border-accent" />
              <input value={v.sku ?? ""} placeholder="SKU" onChange={(e) => setVariants((arr) => arr.map((x) => x.id === v.id ? { ...x, sku: e.target.value } : x))}
                onBlur={(e) => update(v.id, { sku: e.target.value || null })}
                className="col-span-3 bg-background border border-border rounded-lg px-2 py-1.5 text-xs font-mono focus:outline-none focus:border-accent" />
              <input type="number" value={v.price_override ?? ""} placeholder="Price" onChange={(e) => setVariants((arr) => arr.map((x) => x.id === v.id ? { ...x, price_override: e.target.value } : x))}
                onBlur={(e) => update(v.id, { price_override: e.target.value ? Number(e.target.value) : null })}
                className="col-span-2 bg-background border border-border rounded-lg px-2 py-1.5 text-xs font-mono focus:outline-none focus:border-accent" />
              <input type="number" value={v.stock_quantity} onChange={(e) => setVariants((arr) => arr.map((x) => x.id === v.id ? { ...x, stock_quantity: Number(e.target.value) || 0 } : x))}
                onBlur={(e) => update(v.id, { stock_quantity: Number(e.target.value) || 0 })}
                className="col-span-2 bg-background border border-border rounded-lg px-2 py-1.5 text-xs font-mono focus:outline-none focus:border-accent" />
              <button type="button" onClick={() => remove(v.id)} className="col-span-1 size-7 grid place-items-center rounded-full hover:bg-white/5 hover:text-accent justify-self-end" aria-label="Remove variant">
                <Trash2 className="size-3.5" />
              </button>
            </div>
          ))}
        </div>
      )}
      <div className="grid grid-cols-12 gap-2 items-center">
        <input placeholder="Variant name (e.g. Large / Red)" value={draft.name} onChange={(e) => setDraft({ ...draft, name: e.target.value })}
          className="col-span-4 bg-background border border-border rounded-lg px-2 py-1.5 text-xs focus:outline-none focus:border-accent" />
        <input placeholder="SKU" value={draft.sku} onChange={(e) => setDraft({ ...draft, sku: e.target.value })}
          className="col-span-3 bg-background border border-border rounded-lg px-2 py-1.5 text-xs font-mono focus:outline-none focus:border-accent" />
        <input type="number" placeholder="Price" value={draft.price_override} onChange={(e) => setDraft({ ...draft, price_override: e.target.value })}
          className="col-span-2 bg-background border border-border rounded-lg px-2 py-1.5 text-xs font-mono focus:outline-none focus:border-accent" />
        <input type="number" placeholder="Stock" value={draft.stock_quantity} onChange={(e) => setDraft({ ...draft, stock_quantity: e.target.value })}
          className="col-span-2 bg-background border border-border rounded-lg px-2 py-1.5 text-xs font-mono focus:outline-none focus:border-accent" />
        <button type="button" onClick={add} className="col-span-1 size-7 grid place-items-center rounded-full bg-accent text-accent-foreground justify-self-end" aria-label="Add variant">
          <Plus className="size-3.5" />
        </button>
      </div>
      {err && <p className="text-xs text-red-400 mt-2">{err}</p>}
    </div>
  );
}


function Field({ label, value, onChange, type = "text", required }: { label: string; value: string; onChange: (v: string) => void; type?: string; required?: boolean }) {
  return (
    <div>
      <label className="block text-[10px] font-mono uppercase tracking-widest text-muted-foreground mb-2">{label}</label>
      <input type={type} required={required} value={value} onChange={(e) => onChange(e.target.value)}
        className="w-full bg-background border border-border rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-accent" />
    </div>
  );
}

function Stat({ icon, label, value }: { icon: React.ReactNode; label: string; value: string | number }) {
  return (
    <div className="card-premium rounded-2xl p-5">
      <div className="flex items-center justify-between mb-3 text-muted-foreground">
        <span className="text-[10px] font-mono uppercase tracking-widest">{label}</span>
        <span className="text-accent">{icon}</span>
      </div>
      <p className="text-2xl font-display font-semibold">{value}</p>
    </div>
  );
}

function CategoryEditor({ row, nextSort, onClose, onSaved }: { row: Category | null; nextSort: number; onClose: () => void; onSaved: () => void }) {
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [form, setForm] = useState({
    slug: row?.slug ?? "",
    name: row?.name ?? "",
    description: row?.description ?? "",
    image: row?.image ?? "",
    sort_order: row?.sort_order ?? nextSort,
  });

  async function save(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true); setError(null);
    const payload = {
      slug: form.slug.trim().toLowerCase(),
      name: form.name.trim(),
      description: form.description.trim() || null,
      image: form.image.trim() || null,
      sort_order: Number(form.sort_order) || 0,
    };
    const { error } = row
      ? await supabase.from("categories").update(payload).eq("id", row.id)
      : await supabase.from("categories").insert(payload);
    setSaving(false);
    if (error) { setError(error.message); return; }
    onSaved();
  }

  return (
    <div className="fixed inset-0 z-50 grid place-items-center bg-black/70 backdrop-blur-sm p-4" onClick={onClose}>
      <form onSubmit={save} onClick={(e) => e.stopPropagation()} className="w-full max-w-xl card-premium rounded-2xl p-8 max-h-[90vh] overflow-y-auto">
        <div className="flex justify-between items-center mb-6">
          <h2 className="text-xl font-display">{row ? "Edit Category" : "New Category"}</h2>
          <button type="button" onClick={onClose} className="size-8 grid place-items-center rounded-full hover:bg-white/5"><X className="size-4" /></button>
        </div>
        <div className="grid grid-cols-2 gap-4">
          <Field label="Slug" required value={form.slug} onChange={(v) => setForm({ ...form, slug: v })} />
          <Field label="Name" required value={form.name} onChange={(v) => setForm({ ...form, name: v })} />
          <Field label="Sort Order" type="number" value={String(form.sort_order)} onChange={(v) => setForm({ ...form, sort_order: Number(v) || 0 })} />
          <Field label="Image URL" value={form.image} onChange={(v) => setForm({ ...form, image: v })} />
          <div className="col-span-2">
            <label className="block text-[10px] font-mono uppercase tracking-widest text-muted-foreground mb-2">Description</label>
            <textarea value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} rows={3}
              className="w-full bg-background border border-border rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-accent" />
          </div>
        </div>
        {error && <p className="text-xs text-red-400 mt-4">{error}</p>}
        <div className="flex justify-end gap-2 mt-6">
          <button type="button" onClick={onClose} className="px-5 py-2 rounded-full text-xs uppercase tracking-widest border border-border hover:bg-white/5">Cancel</button>
          <button type="submit" disabled={saving} className="px-5 py-2 rounded-full text-xs uppercase tracking-widest font-bold bg-accent text-accent-foreground hover:brightness-110 disabled:opacity-50">
            {saving ? "Saving…" : "Save"}
          </button>
        </div>
      </form>
    </div>
  );
}
