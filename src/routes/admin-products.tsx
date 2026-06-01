import { createFileRoute, Link } from "@tanstack/react-router";
import { ExecutiveSummaryPanel } from "@/components/admin/ExecutiveSummaryPanel";
import { FinancialInsightsPanel } from "@/components/admin/FinancialInsightsPanel";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import {
  Package, Search, Plus, Minus, Loader2, Download, Radio, Star, StarOff,
  Eye, EyeOff, Copy, ExternalLink, Link2, Trash2, Pencil, Boxes,
  TrendingUp, AlertTriangle, CheckCircle2, X, SlidersHorizontal, BarChart3,
  Layers, IndianRupee, Flame, Upload, ShoppingCart,
} from "lucide-react";
import { toast } from "sonner";
import { AdminShell, logActivity } from "@/components/admin/AdminShell";
import { VirtualTable } from "@/components/admin/VirtualTable";
import { BulkActionBar } from "@/components/admin/BulkActionBar";
import { supabase } from "@/integrations/supabase/client";
import { resolveImage } from "@/lib/products";
import { invalidateProducts } from "@/lib/use-products";
import { ProductEditorModal } from "@/components/admin/ProductEditorModal";
import { useProductBadges, badgeAnimationClass } from "@/lib/use-product-badges";

export const Route = createFileRoute("/admin-products")({
  head: () => ({
    meta: [
      { title: "Products — FoundOurMarket™" },
      { name: "description", content: "Realtime catalog management, inventory and product analytics." },
    ],
  }),
  component: ProductsPage,
});

type Product = {
  id: string; slug: string; name: string; tagline: string | null; category: string;
  price: number; cost: number; discount: number | null; image: string | null;
  description: string | null; in_stock: boolean; featured: boolean;
  stock_quantity: number; reserved_quantity: number; low_stock_threshold: number;
  views_count: number; sku: string | null; rating: number; reviews: number;
  sort_order: number; created_at: string;
  price_inr: number | null; compare_price_inr: number | null;
  price_usd: number | null; compare_price_usd: number | null;
  india_visible: boolean; international_visible: boolean;
  status?: string | null;
  tags?: string[] | null; features?: string[] | null; meta_keywords?: string[] | null;
  seo_title?: string | null; seo_description?: string | null;
  specifications?: Record<string, string> | null; attributes?: Record<string, string> | null;
  admin_notes?: string | null; bestseller?: boolean; trending?: boolean;
  scheduled_publish_at?: string | null;
  deleted_at?: string | null;
};

type Category = { slug: string; name: string };
type Stat = { units: number; revenue: number; orders: number };

const inr = (v: number) =>
  new Intl.NumberFormat("en-IN", { style: "currency", currency: "INR", maximumFractionDigits: 0 }).format(Number(v) || 0);
const usd = (v: number) =>
  new Intl.NumberFormat("en-US", { style: "currency", currency: "USD", maximumFractionDigits: 2 }).format(Number(v) || 0);

type StockHealth = "oos" | "critical" | "low" | "ok";
function health(p: Product): StockHealth {
  if (p.stock_quantity <= 0) return "oos";
  if (p.stock_quantity <= Math.max(1, Math.floor(p.low_stock_threshold / 2))) return "critical";
  if (p.stock_quantity <= p.low_stock_threshold) return "low";
  return "ok";
}
const healthMeta: Record<StockHealth, { label: string; cls: string }> = {
  oos: { label: "Out of stock", cls: "text-destructive border-destructive/30 bg-destructive/10" },
  critical: { label: "Critical", cls: "text-red-400 border-red-500/30 bg-red-500/10" },
  low: { label: "Low stock", cls: "text-amber-400 border-amber-500/30 bg-amber-500/10" },
  ok: { label: "Healthy", cls: "text-emerald-400 border-emerald-500/30 bg-emerald-500/10" },
};

function ProductsPage() {
  return (
    <AdminShell title="Products" subtitle="Realtime catalog, inventory & performance" allow={["admin", "super_admin", "manager", "warehouse_staff", "editor"]}>
      <ProductsInner />
      {/* FINANCIAL PRODUCT INSIGHTS */}
      <div className="mt-8 space-y-6">
        <ExecutiveSummaryPanel source="product" compact />
        <FinancialInsightsPanel module="product" />
      </div>
    </AdminShell>
  );
}

type SortKey = "newest" | "oldest" | "revenue" | "stock" | "views" | "conversion" | "price";
type StockFilter = "all" | "ok" | "low" | "critical" | "oos";
type StateFilter = "all" | "active" | "inactive" | "featured";

function ProductsInner() {
  const [products, setProducts] = useState<Product[] | null>(null);
  const [categories, setCategories] = useState<Category[]>([]);
  const [stats, setStats] = useState<Record<string, Stat>>({});
  const [revenueToday, setRevenueToday] = useState(0);
  const [ordersToday, setOrdersToday] = useState(0);
  const [pulse, setPulse] = useState(false);
  const [query, setQuery] = useState("");
  const [searchTerm, setSearchTerm] = useState("");
  const [cat, setCat] = useState("all");
  const [stock, setStock] = useState<StockFilter>("all");
  const [state, setState] = useState<StateFilter>("all");
  const [sort, setSort] = useState<SortKey>("newest");
  const [showFilters, setShowFilters] = useState(false);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [view, setView] = useState<"active" | "recycle">("active");
  const [editing, setEditing] = useState<Product | "new" | null>(null);
  const [busy, setBusy] = useState<string | null>(null);

  useEffect(() => {
    const t = setTimeout(() => setSearchTerm(query.trim().toLowerCase()), 250);
    return () => clearTimeout(t);
  }, [query]);

  const loadProducts = useCallback(async () => {
    const { data } = await supabase.from("products").select("*").order("created_at", { ascending: false });
    setProducts((data as Product[]) ?? []);
  }, []);

  const loadCategories = useCallback(async () => {
    const { data } = await supabase.from("categories").select("slug,name").order("sort_order");
    setCategories((data as Category[]) ?? []);
  }, []);

  const loadStats = useCallback(async () => {
    const since = new Date(Date.now() - 90 * 24 * 3600 * 1000).toISOString();
    const { data } = await supabase
      .from("orders")
      .select("total,created_at,payment_status,status,order_items(product_slug,quantity,line_total)")
      .gte("created_at", since)
      .limit(1000);
    const rows = (data as { total: number; created_at: string; payment_status: string; status: string; order_items: { product_slug: string; quantity: number; line_total: number }[] }[]) ?? [];
    const map: Record<string, Stat> = {};
    const todayKey = new Date().toISOString().slice(0, 10);
    let today = 0;
    let ordersTodayCount = 0;
    for (const o of rows) {
      const paid = o.payment_status === "paid" || o.status === "paid" || o.status === "fulfilled";
      if (o.created_at.slice(0, 10) === todayKey) {
        ordersTodayCount += 1;
        if (paid) today += Number(o.total) || 0;
      }
      for (const it of o.order_items ?? []) {
        if (!it.product_slug) continue;
        const s = (map[it.product_slug] ??= { units: 0, revenue: 0, orders: 0 });
        s.units += it.quantity || 0;
        s.revenue += Number(it.line_total) || 0;
        s.orders += 1;
      }
    }
    setStats(map);
    setRevenueToday(today);
    setOrdersToday(ordersTodayCount);
  }, []);

  const reloadAll = useCallback(() => {
    setPulse(true);
    setTimeout(() => setPulse(false), 1000);
    loadProducts();
    loadStats();
  }, [loadProducts, loadStats]);

  useEffect(() => { loadProducts(); loadCategories(); loadStats(); }, [loadProducts, loadCategories, loadStats]);

  // Realtime catalog + order sync
  useEffect(() => {
    const ch = supabase
      .channel("admin-products-live")
      .on("postgres_changes", { event: "*", schema: "public", table: "products" }, reloadAll)
      .on("postgres_changes", { event: "*", schema: "public", table: "orders" }, () => loadStats())
      .on("postgres_changes", { event: "*", schema: "public", table: "inventory_logs" }, () => loadProducts())
      .subscribe();
    return () => { supabase.removeChannel(ch); };
  }, [reloadAll, loadStats, loadProducts]);

  // ---- Optimistic helpers ----
  const patchLocal = useCallback((id: string, patch: Partial<Product>) => {
    setProducts((prev) => prev?.map((p) => (p.id === id ? { ...p, ...patch } : p)) ?? prev);
  }, []);

  async function toggleActive(p: Product) {
    const next = !p.in_stock;
    patchLocal(p.id, { in_stock: next });
    const { error } = await supabase.from("products").update({ in_stock: next }).eq("id", p.id);
    if (error) { patchLocal(p.id, { in_stock: p.in_stock }); toast.error("Failed to update status"); return; }
    invalidateProducts();
    logActivity(next ? "product_activated" : "product_deactivated", "product", p.id, { slug: p.slug });
    toast.success(`${p.name} ${next ? "activated" : "deactivated"}`);
  }

  async function toggleFeatured(p: Product) {
    const next = !p.featured;
    patchLocal(p.id, { featured: next });
    const { error } = await supabase.from("products").update({ featured: next }).eq("id", p.id);
    if (error) { patchLocal(p.id, { featured: p.featured }); toast.error("Failed to update"); return; }
    invalidateProducts();
    toast.success(next ? "Marked as featured" : "Removed from featured");
  }

  async function adjustStock(p: Product, delta: number) {
    const next = Math.max(0, p.stock_quantity + delta);
    if (next === p.stock_quantity) return;
    patchLocal(p.id, { stock_quantity: next });
    const { error } = await supabase.from("products").update({ stock_quantity: next, in_stock: next > 0 ? p.in_stock : false }).eq("id", p.id);
    if (error) { patchLocal(p.id, { stock_quantity: p.stock_quantity }); toast.error("Stock update failed"); return; }
    await supabase.from("inventory_logs").insert({ product_slug: p.slug, change: next - p.stock_quantity, reason: "manual_adjust", notes: "Quick edit from products console" });
    invalidateProducts();
    toast.success(`Stock → ${next}`);
  }

  async function setStockValue(p: Product, value: number) {
    const next = Math.max(0, Math.floor(value));
    if (next === p.stock_quantity) return;
    const change = next - p.stock_quantity;
    patchLocal(p.id, { stock_quantity: next });
    const { error } = await supabase.from("products").update({ stock_quantity: next }).eq("id", p.id);
    if (error) { patchLocal(p.id, { stock_quantity: p.stock_quantity }); toast.error("Stock update failed"); return; }
    await supabase.from("inventory_logs").insert({ product_slug: p.slug, change, reason: "manual_adjust", notes: "Set value from products console" });
    invalidateProducts();
    toast.success(`Stock set to ${next}`);
  }

  async function duplicate(p: Product) {
    setBusy(p.id);
    const base = p.slug.replace(/-copy(-\d+)?$/, "");
    const slug = `${base}-copy-${Math.random().toString(36).slice(2, 6)}`;
    const { error } = await supabase.from("products").insert({
      slug, name: `${p.name} (Copy)`, tagline: p.tagline, category: p.category, price: p.price,
      cost: p.cost, discount: p.discount, image: p.image, description: p.description,
      in_stock: false, featured: false, stock_quantity: 0, low_stock_threshold: p.low_stock_threshold,
      sku: p.sku ? `${p.sku}-COPY` : null, rating: 0, reviews: 0, sort_order: p.sort_order + 1,
    });
    setBusy(null);
    if (error) { toast.error(error.message); return; }
    logActivity("product_duplicated", "product", p.id, { from: p.slug, to: slug });
    invalidateProducts();
    toast.success("Product duplicated as draft");
    loadProducts();
  }

  async function remove(p: Product) {
    if (!confirm(`Delete "${p.name}"? This cannot be undone.`)) return;
    setBusy(p.id);
    const prev = products;
    setProducts((list) => list?.filter((x) => x.id !== p.id) ?? list);
    const { error } = await supabase.from("products").delete().eq("id", p.id);
    setBusy(null);
    if (error) { setProducts(prev); toast.error(error.message); return; }
    logActivity("product_deleted", "product", p.id, { slug: p.slug });
    invalidateProducts();
    toast.success("Product deleted");
  }

  function copyLink(p: Product) {
    const url = `${window.location.origin}/products/${p.slug}`;
    navigator.clipboard.writeText(url).then(() => toast.success("Product link copied"));
  }

  // ---- Bulk ----
  function toggleSelect(id: string) {
    setSelected((s) => { const n = new Set(s); n.has(id) ? n.delete(id) : n.add(id); return n; });
  }

  // ---- Derived ----
  const kpis = useMemo(() => {
    const list = products ?? [];
    const oos = list.filter((p) => p.stock_quantity <= 0).length;
    const low = list.filter((p) => p.stock_quantity > 0 && p.stock_quantity <= p.low_stock_threshold).length;
    let best: { name: string; units: number } | null = null;
    let viewed: { name: string; views: number } | null = null;
    for (const p of list) {
      const u = stats[p.slug]?.units ?? 0;
      if (!best || u > best.units) best = { name: p.name, units: u };
      if (!viewed || p.views_count > viewed.views) viewed = { name: p.name, views: p.views_count };
    }
    return {
      total: list.length,
      active: list.filter((p) => p.in_stock).length,
      inactive: list.filter((p) => !p.in_stock).length,
      featured: list.filter((p) => p.featured).length,
      oos, low,
      best: best && best.units > 0 ? best.name : "—",
      mostViewed: viewed && viewed.views > 0 ? viewed.name : "—",
      inventoryValue: list.reduce((s, p) => s + Number(p.price) * p.stock_quantity, 0),
    };
  }, [products, stats]);

  const filtered = useMemo(() => {
    let list = [...(products ?? [])];
    list = view === "recycle" ? list.filter((p) => p.deleted_at) : list.filter((p) => !p.deleted_at);
    if (cat !== "all") list = list.filter((p) => p.category === cat);
    if (state === "active") list = list.filter((p) => p.in_stock);
    else if (state === "inactive") list = list.filter((p) => !p.in_stock);
    else if (state === "featured") list = list.filter((p) => p.featured);
    if (stock !== "all") list = list.filter((p) => health(p) === stock);
    if (searchTerm) {
      list = list.filter((p) =>
        [p.name, p.sku, p.category, p.slug, p.tagline].some((v) => (v ?? "").toLowerCase().includes(searchTerm)));
    }
    const conv = (p: Product) => (p.views_count > 0 ? (stats[p.slug]?.units ?? 0) / p.views_count : 0);
    list.sort((a, b) => {
      switch (sort) {
        case "oldest": return +new Date(a.created_at) - +new Date(b.created_at);
        case "revenue": return (stats[b.slug]?.revenue ?? 0) - (stats[a.slug]?.revenue ?? 0);
        case "stock": return a.stock_quantity - b.stock_quantity;
        case "views": return b.views_count - a.views_count;
        case "conversion": return conv(b) - conv(a);
        case "price": return Number(b.price) - Number(a.price);
        default: return +new Date(b.created_at) - +new Date(a.created_at);
      }
    });
    return list;
  }, [products, cat, state, stock, searchTerm, sort, stats, view]);

  const topSellers = useMemo(() => {
    return [...(products ?? [])]
      .map((p) => ({ p, s: stats[p.slug] ?? { units: 0, revenue: 0, orders: 0 } }))
      .filter((x) => x.s.units > 0)
      .sort((a, b) => b.s.revenue - a.s.revenue)
      .slice(0, 5);
  }, [products, stats]);

  function exportCsv() {
    const rows = filtered.map((p) => ({
      slug: p.slug, name: p.name, sku: p.sku ?? "", category: p.category, price: p.price,
      discount: p.discount ?? "", stock: p.stock_quantity, reserved: p.reserved_quantity,
      active: p.in_stock, featured: p.featured, units_sold: stats[p.slug]?.units ?? 0,
      revenue: (stats[p.slug]?.revenue ?? 0).toFixed(2), views: p.views_count,
    }));
    if (!rows.length) return;
    const headers = Object.keys(rows[0]);
    const esc = (v: unknown) => `"${String(v ?? "").replace(/"/g, '""')}"`;
    const csv = [headers.join(","), ...rows.map((r) => headers.map((h) => esc((r as any)[h])).join(","))].join("\n");
    const url = URL.createObjectURL(new Blob([csv], { type: "text/csv" }));
    const a = document.createElement("a");
    a.href = url; a.download = `products-${new Date().toISOString().slice(0, 10)}.csv`; a.click();
    URL.revokeObjectURL(url);
  }

  if (products === null) {
    return <div className="min-h-[40vh] grid place-items-center"><Loader2 className="size-5 animate-spin text-accent" /></div>;
  }

  const kpiCards = [
    { icon: Package, label: "Total", value: String(kpis.total) },
    { icon: CheckCircle2, label: "Active", value: String(kpis.active) },
    { icon: EyeOff, label: "Inactive", value: String(kpis.inactive) },
    { icon: Star, label: "Featured", value: String(kpis.featured) },
    { icon: AlertTriangle, label: "Low stock", value: String(kpis.low) },
    { icon: X, label: "Out of stock", value: String(kpis.oos) },
    { icon: IndianRupee, label: "Revenue today", value: inr(revenueToday) },
    { icon: ShoppingCart, label: "Orders today", value: String(ordersToday) },
    { icon: Boxes, label: "Inventory value", value: inr(kpis.inventoryValue) },
    { icon: Flame, label: "Best seller", value: kpis.best, wide: true },
    { icon: Eye, label: "Most viewed", value: kpis.mostViewed, wide: true },
  ];

  return (
    <div className="space-y-5 pb-28">
      {/* Live KPI strip — horizontally scrollable */}
      <div className="-mx-1 overflow-x-auto no-scrollbar">
        <div className="flex gap-3 px-1 min-w-max">
          {kpiCards.map((k, i) => (
            <motion.div
              key={k.label}
              initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }}
              transition={{ delay: i * 0.03, ease: [0.16, 1, 0.3, 1] }}
              className={`relative overflow-hidden glass border border-white/10 rounded-2xl p-3.5 ${k.wide ? "min-w-[180px]" : "min-w-[120px]"}`}
            >
              <div className="pointer-events-none absolute -top-6 -right-5 size-16 rounded-full opacity-30" style={{ background: "var(--gradient-ember-soft)", filter: "blur(16px)" }} />
              <k.icon className="size-4 text-accent mb-2" />
              <p className="text-lg font-display tabular-nums leading-none truncate">{k.value}</p>
              <p className="text-[9px] font-mono uppercase tracking-[0.18em] text-muted-foreground mt-1.5">{k.label}</p>
            </motion.div>
          ))}
        </div>
      </div>

      {/* Controls */}
      <div className="sticky top-2 z-20 flex flex-wrap items-center gap-2 glass-strong border border-white/10 rounded-2xl p-2.5">
        <div className="inline-flex items-center gap-1.5 text-[10px] font-mono uppercase tracking-widest text-emerald-400 px-1">
          <Radio className={`size-3 ${pulse ? "text-accent animate-ping" : ""}`} /> Live
        </div>
        <div className="relative flex-1 min-w-[160px]">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 size-3.5 text-muted-foreground" />
          <input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Search name, SKU, category…"
            className="w-full bg-white/[0.03] border border-white/10 rounded-xl pl-9 pr-3 py-2 text-xs focus:outline-none focus:border-accent/40" />
        </div>
        <button onClick={() => setShowFilters((v) => !v)}
          className={`inline-flex items-center gap-1.5 rounded-xl border px-3 py-2 text-[10px] font-mono uppercase tracking-widest transition-colors ${showFilters ? "border-accent/40 text-accent bg-accent/5" : "border-white/10 hover:bg-white/5"}`}>
          <SlidersHorizontal className="size-3.5" /> Filters
        </button>
        <select value={sort} onChange={(e) => setSort(e.target.value as SortKey)}
          className="bg-white/[0.03] border border-white/10 rounded-xl px-3 py-2 text-xs focus:outline-none focus:border-accent/40">
          <option value="newest" className="bg-background">Newest</option>
          <option value="oldest" className="bg-background">Oldest</option>
          <option value="revenue" className="bg-background">Top revenue</option>
          <option value="conversion" className="bg-background">Conversion</option>
          <option value="views" className="bg-background">Most viewed</option>
          <option value="stock" className="bg-background">Low stock first</option>
          <option value="price" className="bg-background">Price</option>
        </select>
        <button onClick={exportCsv}
          className="inline-flex items-center gap-1.5 rounded-xl border border-white/10 px-3 py-2 text-[10px] font-mono uppercase tracking-widest hover:bg-white/5">
          <Download className="size-3.5" /> CSV
        </button>
        <button onClick={() => setEditing("new")}
          className="inline-flex items-center gap-1.5 rounded-xl bg-accent text-accent-foreground font-semibold px-3 py-2 text-[10px] uppercase tracking-widest hover:brightness-110">
          <Plus className="size-3.5" /> New
        </button>
        <button onClick={() => {
            const ids = filtered.map((p) => p.id);
            const all = ids.length > 0 && ids.every((i) => selected.has(i));
            setSelected(all ? new Set() : new Set(ids));
          }}
          className="inline-flex items-center gap-1.5 rounded-xl border border-white/10 px-3 py-2 text-[10px] font-mono uppercase tracking-widest hover:bg-white/5">
          <CheckCircle2 className="size-3.5" /> {filtered.length > 0 && filtered.every((p) => selected.has(p.id)) ? "None" : "All"}
        </button>
        <button onClick={() => { setSelected(new Set()); setView((v) => (v === "recycle" ? "active" : "recycle")); }}
          className={`inline-flex items-center gap-1.5 rounded-xl border px-3 py-2 text-[10px] font-mono uppercase tracking-widest transition-colors ${view === "recycle" ? "border-accent/40 text-accent bg-accent/5" : "border-white/10 hover:bg-white/5"}`}>
          <Trash2 className="size-3.5" /> {view === "recycle" ? "Bin" : "Bin"}
        </button>
      </div>

      {/* Filter drawer */}
      <AnimatePresence>
        {showFilters && (
          <motion.div initial={{ height: 0, opacity: 0 }} animate={{ height: "auto", opacity: 1 }} exit={{ height: 0, opacity: 0 }}
            className="overflow-hidden">
            <div className="glass border border-white/10 rounded-2xl p-4 grid grid-cols-2 md:grid-cols-3 gap-3">
              <FilterGroup label="Category">
                <select value={cat} onChange={(e) => setCat(e.target.value)} className="filter-select">
                  <option value="all" className="bg-background">All categories</option>
                  {categories.map((c) => <option key={c.slug} value={c.slug} className="bg-background">{c.name}</option>)}
                </select>
              </FilterGroup>
              <FilterGroup label="Stock health">
                <select value={stock} onChange={(e) => setStock(e.target.value as StockFilter)} className="filter-select">
                  {(["all", "ok", "low", "critical", "oos"] as StockFilter[]).map((s) => (
                    <option key={s} value={s} className="bg-background">{s === "all" ? "Any" : s === "oos" ? "Out of stock" : healthMeta[s as StockHealth].label}</option>
                  ))}
                </select>
              </FilterGroup>
              <FilterGroup label="State">
                <select value={state} onChange={(e) => setState(e.target.value as StateFilter)} className="filter-select">
                  <option value="all" className="bg-background">All</option>
                  <option value="active" className="bg-background">Active</option>
                  <option value="inactive" className="bg-background">Inactive</option>
                  <option value="featured" className="bg-background">Featured</option>
                </select>
              </FilterGroup>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Catalog list (virtualized) */}
      <div className="text-[10px] font-mono uppercase tracking-widest text-muted-foreground px-1">
        {filtered.length} of {products.length} products
      </div>
      <VirtualTable
        rows={filtered}
        rowKey={(p) => p.id}
        estimateSize={188}
        maxHeight={720}
        empty="No products match your filters."
        renderRow={(p) => (
          <ProductCard
            p={p}
            stat={stats[p.slug] ?? { units: 0, revenue: 0, orders: 0 }}
            selected={selected.has(p.id)}
            busy={busy === p.id}
            onSelect={() => toggleSelect(p.id)}
            onEdit={() => setEditing(p)}
            onDuplicate={() => duplicate(p)}
            onDelete={() => remove(p)}
            onToggleActive={() => toggleActive(p)}
            onToggleFeatured={() => toggleFeatured(p)}
            onAdjust={(d) => adjustStock(p, d)}
            onSetStock={(v) => setStockValue(p, v)}
            onCopyLink={() => copyLink(p)}
          />
        )}
      />

      {/* Product performance analytics */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <div className="glass border border-white/10 rounded-2xl p-4">
          <div className="flex items-center gap-2 mb-3">
            <BarChart3 className="size-4 text-accent" />
            <h3 className="text-sm font-display">Top performers (90d)</h3>
          </div>
          {topSellers.length === 0 ? (
            <p className="text-xs text-muted-foreground py-6 text-center">No sales recorded yet.</p>
          ) : (
            <div className="space-y-2.5">
              {topSellers.map(({ p, s }, i) => {
                const max = topSellers[0].s.revenue || 1;
                return (
                  <div key={p.id} className="flex items-center gap-3">
                    <span className="text-[10px] font-mono text-muted-foreground w-4">{i + 1}</span>
                    <div className="size-8 rounded-lg overflow-hidden bg-white/5 shrink-0">
                      <img src={resolveImage(p.image)} alt="" loading="lazy" className="w-full h-full object-cover" />
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-xs truncate">{p.name}</p>
                      <div className="mt-1 h-1.5 rounded-full bg-white/5 overflow-hidden">
                        <div className="h-full rounded-full bg-gradient-to-r from-accent to-primary" style={{ width: `${(s.revenue / max) * 100}%` }} />
                      </div>
                    </div>
                    <div className="text-right shrink-0">
                      <p className="text-xs font-mono">{inr(s.revenue)}</p>
                      <p className="text-[9px] text-muted-foreground">{s.units} sold</p>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
        <div className="glass border border-white/10 rounded-2xl p-4">
          <div className="flex items-center gap-2 mb-3">
            <Boxes className="size-4 text-accent" />
            <h3 className="text-sm font-display">Inventory intelligence</h3>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <IntelStat label="Units on hand" value={(products.reduce((s, p) => s + p.stock_quantity, 0)).toLocaleString()} />
            <IntelStat label="Reserved" value={(products.reduce((s, p) => s + (p.reserved_quantity ?? 0), 0)).toLocaleString()} />
            <IntelStat label="Stock value" value={inr(products.reduce((s, p) => s + Number(p.price) * p.stock_quantity, 0))} />
            <IntelStat label="At cost" value={inr(products.reduce((s, p) => s + Number(p.cost) * p.stock_quantity, 0))} accent />
          </div>
          <Link to="/admin-inventory" className="mt-4 inline-flex items-center gap-1.5 text-[10px] font-mono uppercase tracking-widest text-accent hover:underline">
            <Layers className="size-3" /> Full inventory console
          </Link>
        </div>
      </div>

      {/* Bulk actions dock — full bulk operations engine */}
      <BulkActionBar
        ids={[...selected].filter((id) => filtered.some((p) => p.id === id))}
        rows={filtered.filter((p) => selected.has(p.id)) as unknown as (Record<string, unknown> & { id: string })[]}
        categories={categories}
        mode={view === "recycle" ? "recycle" : "normal"}
        onClear={() => setSelected(new Set())}
        onDone={() => { setSelected(new Set()); loadProducts(); invalidateProducts(); }}
      />

      {editing && (
        <ProductEditorModal
          row={editing === "new" ? null : editing}
          categories={categories}
          nextSort={(products.length ?? 0) + 1}
          onClose={() => setEditing(null)}
          onSaved={() => { setEditing(null); loadProducts(); invalidateProducts(); }}
        />
      )}
    </div>
  );
}

function FilterGroup({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <label className="block text-[9px] font-mono uppercase tracking-[0.2em] text-muted-foreground mb-1.5">{label}</label>
      {children}
    </div>
  );
}

function IntelStat({ label, value, accent }: { label: string; value: string; accent?: boolean }) {
  return (
    <div className="rounded-xl bg-white/[0.02] border border-white/5 p-3">
      <p className={`text-base font-display tabular-nums ${accent ? "text-accent" : ""}`}>{value}</p>
      <p className="text-[9px] font-mono uppercase tracking-[0.18em] text-muted-foreground mt-1">{label}</p>
    </div>
  );
}

function BulkBtn({ onClick, icon: Icon, label, danger, busy }: { onClick: () => void; icon: typeof Eye; label: string; danger?: boolean; busy?: boolean }) {
  return (
    <button onClick={onClick} disabled={busy}
      className={`shrink-0 inline-flex items-center gap-1.5 rounded-full border px-3 py-1.5 text-[10px] font-mono uppercase tracking-widest transition-colors disabled:opacity-50 ${danger ? "border-destructive/30 text-destructive hover:bg-destructive/10" : "border-white/10 hover:bg-white/5"}`}>
      {busy ? <Loader2 className="size-3 animate-spin" /> : <Icon className="size-3" />} {label}
    </button>
  );
}

function ProductCard({
  p, stat, selected, busy, onSelect, onEdit, onDuplicate, onDelete,
  onToggleActive, onToggleFeatured, onAdjust, onSetStock, onCopyLink,
}: {
  p: Product; stat: Stat; selected: boolean; busy: boolean;
  onSelect: () => void; onEdit: () => void; onDuplicate: () => void; onDelete: () => void;
  onToggleActive: () => void; onToggleFeatured: () => void;
  onAdjust: (d: number) => void; onSetStock: (v: number) => void; onCopyLink: () => void;
}) {
  const h = health(p);
  const hm = healthMeta[h];
  const conv = p.views_count > 0 ? ((stat.units / p.views_count) * 100) : 0;
  const [stockInput, setStockInput] = useState(String(p.stock_quantity));
  useEffect(() => { setStockInput(String(p.stock_quantity)); }, [p.stock_quantity]);

  return (
    <div className={`m-1.5 rounded-2xl glass border p-3 transition-colors ${selected ? "border-accent/50 bg-accent/[0.04]" : "border-white/10"} ${busy ? "opacity-60" : ""}`}>
      <div className="flex gap-3">
        <button onClick={onSelect} className={`shrink-0 size-5 mt-0.5 rounded-md border grid place-items-center transition-colors ${selected ? "bg-accent border-accent text-accent-foreground" : "border-white/20 hover:border-accent/50"}`}>
          {selected && <CheckCircle2 className="size-3.5" />}
        </button>
        <div className="relative size-16 rounded-xl overflow-hidden bg-white/5 shrink-0">
          <img src={resolveImage(p.image)} alt={p.name} loading="lazy" className="w-full h-full object-cover" />
          {!p.in_stock && <div className="absolute inset-0 bg-black/60 grid place-items-center"><EyeOff className="size-4 text-white/70" /></div>}
        </div>
        <div className="flex-1 min-w-0">
          <div className="flex items-start gap-2">
            <div className="min-w-0 flex-1">
              <p className="text-sm font-medium truncate">{p.name}</p>
              <p className="text-[10px] font-mono text-muted-foreground truncate">{p.sku ?? p.slug} · {p.category}</p>
            </div>
            <div className="text-right shrink-0">
              <p className="text-sm font-mono">{inr(p.price)}</p>
              {p.discount ? <p className="text-[10px] text-accent">-{p.discount}%</p> : null}
            </div>
          </div>
          <div className="flex flex-wrap items-center gap-1.5 mt-1.5">
            <span className={`inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-[9px] font-mono uppercase tracking-widest ${hm.cls}`}>
              {hm.label} · {p.stock_quantity}
            </span>
            {p.featured && <span className="inline-flex items-center gap-1 rounded-full border border-accent/30 bg-accent/10 text-accent px-2 py-0.5 text-[9px] font-mono uppercase tracking-widest"><Star className="size-2.5" /> Featured</span>}
            <span className={`inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-[9px] font-mono uppercase tracking-widest ${p.in_stock ? "text-emerald-400 border-emerald-500/30 bg-emerald-500/10" : "text-muted-foreground border-white/10 bg-white/5"}`}>
              {p.in_stock ? "Active" : "Inactive"}
            </span>
          </div>
        </div>
      </div>

      {/* Metrics */}
      <div className="grid grid-cols-4 gap-1.5 mt-3">
        <Metric icon={TrendingUp} label="Sold" value={String(stat.units)} />
        <Metric icon={IndianRupee} label="Revenue" value={inr(stat.revenue)} />
        <Metric icon={Eye} label="Views" value={p.views_count.toLocaleString()} />
        <Metric icon={BarChart3} label="Conv." value={`${conv.toFixed(1)}%`} />
      </div>

      {/* Quick inventory + actions */}
      <div className="flex flex-wrap items-center gap-1.5 mt-3">
        <div className="inline-flex items-center rounded-full border border-white/10 overflow-hidden">
          <button onClick={() => onAdjust(-1)} className="size-7 grid place-items-center hover:bg-white/5"><Minus className="size-3" /></button>
          <input
            value={stockInput}
            onChange={(e) => setStockInput(e.target.value.replace(/[^\d]/g, ""))}
            onBlur={() => onSetStock(Number(stockInput) || 0)}
            onKeyDown={(e) => { if (e.key === "Enter") (e.target as HTMLInputElement).blur(); }}
            className="w-10 bg-transparent text-center text-xs font-mono focus:outline-none"
          />
          <button onClick={() => onAdjust(1)} className="size-7 grid place-items-center hover:bg-white/5"><Plus className="size-3" /></button>
        </div>
        <div className="ml-auto flex items-center gap-1">
          <IconAction onClick={onToggleActive} title={p.in_stock ? "Deactivate" : "Activate"} icon={p.in_stock ? Eye : EyeOff} active={p.in_stock} />
          <IconAction onClick={onToggleFeatured} title="Toggle featured" icon={p.featured ? Star : StarOff} active={p.featured} />
          <IconAction onClick={onEdit} title="Edit" icon={Pencil} />
          <IconAction onClick={onDuplicate} title="Duplicate" icon={Copy} />
          <IconAction onClick={onCopyLink} title="Copy link" icon={Link2} />
          <a href={`/products/${p.slug}`} target="_blank" rel="noreferrer" title="Preview"
            className="size-7 grid place-items-center rounded-full border border-white/10 hover:bg-white/5 text-muted-foreground hover:text-foreground"><ExternalLink className="size-3.5" /></a>
          <IconAction onClick={onDelete} title="Delete" icon={Trash2} danger />
        </div>
      </div>
    </div>
  );
}

function Metric({ icon: Icon, label, value }: { icon: typeof Eye; label: string; value: string }) {
  return (
    <div className="rounded-lg bg-white/[0.02] border border-white/5 px-2 py-1.5">
      <div className="flex items-center gap-1 text-muted-foreground"><Icon className="size-2.5" /><span className="text-[8px] font-mono uppercase tracking-widest">{label}</span></div>
      <p className="text-xs font-mono tabular-nums mt-0.5 truncate">{value}</p>
    </div>
  );
}

function IconAction({ onClick, title, icon: Icon, danger, active }: { onClick: () => void; title: string; icon: typeof Eye; danger?: boolean; active?: boolean }) {
  return (
    <button onClick={onClick} title={title}
      className={`size-7 grid place-items-center rounded-full border transition-colors ${danger ? "border-white/10 text-muted-foreground hover:text-destructive hover:border-destructive/30 hover:bg-destructive/10" : active ? "border-accent/40 text-accent bg-accent/10" : "border-white/10 text-muted-foreground hover:text-foreground hover:bg-white/5"}`}>
      <Icon className="size-3.5" />
    </button>
  );
}

// Legacy inline ProductEditor and its helpers removed — unified into ProductEditorModal.

