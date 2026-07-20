import { createFileRoute, Link, useRouter } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import {
  FileText, IndianRupee, Boxes, Truck, RotateCcw, Search, Sparkles, BarChart3, Eye, ChevronRight,
  TrendingUp, ShoppingCart, Heart, CheckCircle2, AlertCircle, Loader2, Activity,
  Copy, Archive, Trash2, Send, EyeOff, ExternalLink, ShieldCheck, DollarSign,
  Globe, Hash, Wand2, Download, Image as ImageIcon, ChevronDown, Pencil, Package,
} from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { ReadOnlySection, PRODUCT_SECTIONS, inr, usd, useNavigate } from "@/components/admin/product-editor/kit";
import { logActivity } from "@/components/admin/AdminShell";
import { invalidateProducts } from "@/lib/use-products";
import { adminGenerateSkus } from "@/lib/admin-sku.functions";
import { resolveImage } from "@/lib/products";

const STAT_COLS = [
  "id", "name", "slug", "image", "status", "category", "sku", "description",
  "seo_title", "seo_description", "meta_keywords", "brand", "product_type", "video_url",
  "price", "price_inr", "compare_price_inr", "price_usd", "compare_price_usd",
  "cost_price_inr", "cost_price_usd",
  "stock_quantity", "low_stock_threshold", "in_stock", "weight", "shipping_fee_inr",
  "return_eligible", "return_window_days", "warranty", "related_products",
  "views_count", "orders_count", "revenue", "wishlist_count",
  "featured", "trending", "bestseller", "new_arrival", "flash_deal", "staff_pick",
  "recommended", "homepage_hero", "editors_choice", "premium", "fast_selling",
  "india_visible", "international_visible", "hide_from_search",
];

const MERCH_FLAGS = [
  "featured", "trending", "bestseller", "new_arrival", "flash_deal", "staff_pick",
  "recommended", "homepage_hero", "editors_choice", "premium", "fast_selling",
] as const;

export const Route = createFileRoute("/admin-product/$slug/")({
  component: OverviewPage,
});

const ICONS: Record<string, any> = {
  details: FileText, pricing: IndianRupee, inventory: Boxes, variants: Package, shipping: Truck,
  returns: RotateCcw, seo: Search, merchandising: Sparkles, analytics: BarChart3, preview: Eye,
};

const DESC: Record<string, string> = {
  details: "Name, description, media & attributes",
  pricing: "Regional prices, cost & margins",
  inventory: "Stock levels, SKU & availability",
  variants: "Optional Size / Colour combinations",
  shipping: "Dimensions, fees & delivery options",
  returns: "Return window, replacements & warranty",
  seo: "Search title, description & keywords",
  merchandising: "Badges, placement & priority",
  analytics: "Views, ratings & performance",
  preview: "See exactly how buyers view it",
};

const FIX_TO = {
  details: "/admin-product/$slug/details",
  pricing: "/admin-product/$slug/pricing",
  inventory: "/admin-product/$slug/inventory",
  seo: "/admin-product/$slug/seo",
  analytics: "/admin-product/$slug/analytics",
} as const;
type FixKey = keyof typeof FIX_TO;

function OverviewPage() {
  const { slug } = Route.useParams();
  return (
    <ReadOnlySection slug={slug} sectionKey="" title="Product Command Center" icon={<FileText className="size-4" />} cols={STAT_COLS}>
      {(r) => <CommandCenter r={r} slug={slug} />}
    </ReadOnlySection>
  );
}

/* ----------------------------- health model ----------------------------- */

type HealthItem = { key: string; ok: boolean; fix?: string };
type HealthCategory = { name: string; icon: any; items: HealthItem[] };

function buildHealth(r: Record<string, any>): HealthCategory[] {
  const sellInr = r.price_inr ?? (Number(r.price) || 0);
  const hasImages = !!r.image;
  const hasVideo = !!r.video_url;
  const hasCost = (r.cost_price_inr != null && Number(r.cost_price_inr) > 0) || (r.cost_price_usd != null && Number(r.cost_price_usd) > 0);
  const hasMeta = Array.isArray(r.meta_keywords) ? r.meta_keywords.length > 0 : !!r.meta_keywords;
  return [
    {
      name: "Content", icon: FileText, items: [
        { key: "Product name", ok: !!(r.name && String(r.name).trim()) , fix: "details" },
        { key: "Rich description", ok: !!(r.description && String(r.description).trim().length > 40), fix: "details" },
        { key: "Category set", ok: !!r.category && r.category !== "Uncategorized", fix: "details" },
        { key: "Brand / type", ok: !!(r.brand || r.product_type), fix: "details" },
      ],
    },
    {
      name: "SEO", icon: Search, items: [
        { key: "SEO title", ok: !!r.seo_title, fix: "seo" },
        { key: "Meta description", ok: !!r.seo_description, fix: "seo" },
        { key: "Metadata keywords", ok: hasMeta, fix: "seo" },
      ],
    },
    {
      name: "Inventory", icon: Boxes, items: [
        { key: "SKU assigned", ok: !!(r.sku && String(r.sku).trim()), fix: "inventory" },
        { key: "Stock available", ok: Number(r.stock_quantity ?? 0) > 0 || r.status === "preorder", fix: "inventory" },
        { key: "Low-stock threshold", ok: Number(r.low_stock_threshold ?? 0) > 0, fix: "inventory" },
      ],
    },
    {
      name: "Media", icon: ImageIcon, items: [
        { key: "Primary image", ok: hasImages, fix: "details" },
        { key: "Product video", ok: hasVideo, fix: "details" },
      ],
    },
    {
      name: "Pricing", icon: IndianRupee, items: [
        { key: "Selling price", ok: sellInr > 0, fix: "pricing" },
        { key: "Cost price", ok: hasCost, fix: "pricing" },
        { key: "Compare-at price", ok: Number(r.compare_price_inr ?? 0) > 0 || Number(r.compare_price_usd ?? 0) > 0, fix: "pricing" },
      ],
    },
  ];
}

/* ----------------------------- order performance ----------------------------- */

type PerfBucket = { revenue: number; orders: number; units: number; returns: number };
type Perf = {
  loading: boolean;
  india: PerfBucket; intl: PerfBucket;
  windows: { today: PerfBucket; d7: PerfBucket; d30: PerfBucket };
};

const VALID_STATUSES = new Set(["paid", "processing", "fulfilled", "shipped", "delivered", "completed"]);
const emptyBucket = (): PerfBucket => ({ revenue: 0, orders: 0, units: 0, returns: 0 });

function useOrderPerformance(slug: string): Perf {
  const [perf, setPerf] = useState<Perf>({
    loading: true,
    india: emptyBucket(), intl: emptyBucket(),
    windows: { today: emptyBucket(), d7: emptyBucket(), d30: emptyBucket() },
  });

  useEffect(() => {
    let active = true;
    (async () => {
      const india = emptyBucket(); const intl = emptyBucket();
      const today = emptyBucket(); const d7 = emptyBucket(); const d30 = emptyBucket();
      const now = Date.now();
      const dayMs = 86_400_000;

      const { data: items } = await supabase
        .from("order_items")
        .select("quantity,line_total,orders!inner(market_region,status,created_at)")
        .eq("product_slug", slug)
        .limit(5000);

      const seenOrders = { india: new Set<string>(), intl: new Set<string>(), today: new Set<string>(), d7: new Set<string>(), d30: new Set<string>() };
      for (const it of (items as any[]) ?? []) {
        const o = it.orders;
        if (!o || !VALID_STATUSES.has(String(o.status))) continue;
        const rev = Number(it.line_total ?? 0);
        const qty = Number(it.quantity ?? 0);
        const region = String(o.market_region ?? "").toLowerCase();
        const isIndia = region.includes("india") || region === "in";
        const b = isIndia ? india : intl;
        const ord = (isIndia ? seenOrders.india : seenOrders.intl);
        b.revenue += rev; b.units += qty;
        const oid = String(o.created_at) + region;
        if (!ord.has(oid)) { b.orders += 1; ord.add(oid); }

        const age = now - new Date(o.created_at).getTime();
        const apply = (w: PerfBucket, set: Set<string>) => {
          w.revenue += rev; w.units += qty;
          if (!set.has(oid)) { w.orders += 1; set.add(oid); }
        };
        if (age <= dayMs) apply(today, seenOrders.today);
        if (age <= 7 * dayMs) apply(d7, seenOrders.d7);
        if (age <= 30 * dayMs) apply(d30, seenOrders.d30);
      }

      // Returns split by region + time window.
      const { data: rets } = await supabase
        .from("return_items")
        .select("quantity,created_at,returns!inner(order_id,orders!inner(market_region))")
        .eq("product_slug", slug)
        .limit(5000);
      for (const ri of (rets as any[]) ?? []) {
        const region = String(ri.returns?.orders?.market_region ?? "").toLowerCase();
        const qty = Number(ri.quantity ?? 0);
        const isIndia = region.includes("india") || region === "in";
        (isIndia ? india : intl).returns += qty;
        const age = now - new Date(ri.created_at).getTime();
        if (age <= dayMs) today.returns += qty;
        if (age <= 7 * dayMs) d7.returns += qty;
        if (age <= 30 * dayMs) d30.returns += qty;
      }

      if (active) setPerf({ loading: false, india, intl, windows: { today, d7, d30 } });
    })().catch(() => { if (active) setPerf((p) => ({ ...p, loading: false })); });
    return () => { active = false; };
  }, [slug]);

  return perf;
}

/* ----------------------------- SKU stats ----------------------------- */

function useSkuStats(refreshKey: number) {
  const [stats, setStats] = useState<{ loading: boolean; total: number; missing: number; duplicates: number; rows: { slug: string; name: string; sku: string | null }[] }>(
    { loading: true, total: 0, missing: 0, duplicates: 0, rows: [] },
  );
  useEffect(() => {
    let active = true;
    supabase.from("products").select("slug,name,sku").is("deleted_at", null).limit(50_000)
      .then(({ data }) => {
        if (!active) return;
        const rows = (data as any[]) ?? [];
        let missing = 0;
        const counts = new Map<string, number>();
        for (const r of rows) {
          const sku = String(r.sku ?? "").trim();
          if (!sku) { missing += 1; continue; }
          const k = sku.toUpperCase();
          counts.set(k, (counts.get(k) ?? 0) + 1);
        }
        let duplicates = 0;
        counts.forEach((c) => { if (c > 1) duplicates += c; });
        setStats({ loading: false, total: rows.length, missing, duplicates, rows });
      });
    return () => { active = false; };
  }, [refreshKey]);
  return stats;
}

/* ----------------------------- command center ----------------------------- */

function CommandCenter({ r, slug }: { r: Record<string, any>; slug: string }) {
  const navigate = useNavigate();
  const router = useRouter();
  const [busy, setBusy] = useState<string | null>(null);
  const [status, setStatus] = useState<string>(r.status ?? "draft");
  const [skuRefresh, setSkuRefresh] = useState(0);
  const [showAnalytics, setShowAnalytics] = useState(false);

  const generateSkus = useServerFn(adminGenerateSkus);

  const views = Number(r.views_count ?? 0);
  const orders = Number(r.orders_count ?? 0);
  const revenue = Number(r.revenue ?? 0);
  const wishlist = Number(r.wishlist_count ?? 0);
  const conv = views > 0 ? (orders / views) * 100 : 0;
  const stock = Number(r.stock_quantity ?? 0);
  const lowThreshold = Number(r.low_stock_threshold ?? 5);
  const sellInr = r.price_inr ?? (Number(r.price) || 0);

  const categories = buildHealth(r);
  const allItems = categories.flatMap((c) => c.items);
  const okCount = allItems.filter((i) => i.ok).length;
  const score = Math.round((okCount / allItems.length) * 100);
  const missingItems = allItems.filter((i) => !i.ok);

  const placements = MERCH_FLAGS.filter((f) => !!r[f]);
  const visible = status === "published" && !r.hide_from_search && (r.india_visible || r.international_visible);

  const health =
    score >= 85 && stock > 0 ? { label: "Excellent", tone: "text-emerald-400", bg: "bg-emerald-500/15 border-emerald-500/30" }
    : score >= 65 ? { label: "Good", tone: "text-sky-400", bg: "bg-sky-500/15 border-sky-500/30" }
    : score >= 40 ? { label: "Needs Attention", tone: "text-amber-400", bg: "bg-amber-500/15 border-amber-500/30" }
    : { label: "Critical", tone: "text-destructive", bg: "bg-destructive/15 border-destructive/30" };

  const perf = useOrderPerformance(slug);
  const skuStats = useSkuStats(skuRefresh);
  const coverage = skuStats.total > 0 ? Math.round(((skuStats.total - skuStats.missing) / skuStats.total) * 100) : 100;

  async function setStatusAction(next: string, verb: string) {
    setBusy(verb);
    const { error } = await supabase.from("products").update({ status: next, updated_at: new Date().toISOString() }).eq("slug", slug);
    setBusy(null);
    if (error) { toast.error(`${verb} failed`, { description: error.message }); return; }
    setStatus(next);
    logActivity(`product_${verb.toLowerCase()}`, "product", r.id, { slug });
    invalidateProducts();
    toast.success(`Product ${verb.toLowerCase()}d`);
  }

  async function duplicate() {
    setBusy("Duplicate");
    const { data: full, error: readErr } = await supabase.from("products").select("*").eq("slug", slug).maybeSingle();
    if (readErr || !full) { setBusy(null); toast.error("Duplicate failed", { description: readErr?.message }); return; }
    const copy: Record<string, any> = { ...full };
    delete copy.id; delete copy.created_at; delete copy.updated_at; delete copy.search_vector;
    const newSlug = `${slug}-copy-${Math.random().toString(36).slice(2, 7)}`;
    copy.slug = newSlug;
    copy.name = `${full.name} (Copy)`;
    copy.status = "draft";
    copy.sku = null; // auto SKU system assigns a fresh unique SKU
    const { error } = await supabase.from("products").insert(copy);
    setBusy(null);
    if (error) { toast.error("Duplicate failed", { description: error.message }); return; }
    logActivity("product_duplicated", "product", r.id, { slug, newSlug });
    invalidateProducts();
    toast.success("Product duplicated");
    navigate({ to: "/admin-product/$slug", params: { slug: newSlug } });
  }

  async function softDelete() {
    if (!window.confirm("Delete this product? It will be archived and hidden from the storefront.")) return;
    setBusy("Delete");
    const { error } = await supabase.from("products")
      .update({ status: "archived", deleted_at: new Date().toISOString(), updated_at: new Date().toISOString() })
      .eq("slug", slug);
    setBusy(null);
    if (error) { toast.error("Delete failed", { description: error.message }); return; }
    logActivity("product_deleted", "product", r.id, { slug });
    invalidateProducts();
    toast.success("Product archived");
    navigate({ to: "/admin-products" });
  }

  async function generateThisSku() {
    setBusy("SKU");
    try {
      const res: any = await generateSkus({ data: { slugs: [slug] } });
      toast.success(res?.generated ? "SKU generated" : "SKU already assigned");
      setSkuRefresh((k) => k + 1);
      invalidateProducts();
      router.invalidate();
    } catch (e: any) {
      toast.error("SKU generation failed", { description: e?.message });
    } finally { setBusy(null); }
  }

  async function generateAllSkus() {
    setBusy("SKU-ALL");
    try {
      const res: any = await generateSkus({ data: {} });
      toast.success(`${res?.generated ?? 0} SKUs generated`);
      setSkuRefresh((k) => k + 1);
      invalidateProducts();
    } catch (e: any) {
      toast.error("SKU generation failed", { description: e?.message });
    } finally { setBusy(null); }
  }

  function exportSkuReport() {
    const header = "slug,name,sku\n";
    const body = skuStats.rows.map((row) =>
      [row.slug, `"${String(row.name ?? "").replace(/"/g, '""')}"`, row.sku ?? ""].join(","),
    ).join("\n");
    const blob = new Blob([header + body], { type: "text/csv" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url; a.download = `sku-report-${new Date().toISOString().slice(0, 10)}.csv`;
    a.click();
    URL.revokeObjectURL(url);
    toast.success("SKU report exported");
  }

  return (
    <div className="space-y-4">
      {/* COMMAND HEADER */}
      <div className="card-premium rounded-2xl p-4 sm:p-5">
        <div className="flex flex-col sm:flex-row sm:items-start gap-4">
          <div className="size-20 sm:size-24 rounded-2xl overflow-hidden bg-white/5 border border-white/10 shrink-0 grid place-items-center">
            {r.image ? <img loading="lazy" decoding="async" src={resolveImage(r.image)} alt={r.name} className="size-full object-cover" /> : <Package className="size-7 text-muted-foreground" />}
          </div>
          <div className="min-w-0 flex-1">
            <div className="flex flex-wrap items-center gap-2">
              <h1 className="text-lg sm:text-xl font-display font-semibold truncate">{r.name || "Untitled product"}</h1>
              <span className={`shrink-0 rounded-full border px-2.5 py-0.5 text-[10px] font-mono uppercase tracking-widest ${health.bg} ${health.tone}`}>
                {health.label} · {score}
              </span>
            </div>
            <div className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1 text-[11px] text-muted-foreground">
              <span className="font-mono">SKU: {r.sku || "—"}</span>
              <StatusChip label="Status" value={String(status).replace(/_/g, " ")} />
              <StatusChip label="Visibility" value={visible ? "Public" : "Limited"} tone={visible ? "text-emerald-400" : "text-amber-400"} />
            </div>
            {/* Header metrics */}
            <div className="mt-3 grid grid-cols-2 sm:grid-cols-4 gap-2">
              <HeaderStat icon={<Boxes className="size-3.5" />} label="Stock" value={stock.toLocaleString()} tone={stock > lowThreshold ? undefined : "text-amber-400"} />
              <HeaderStat icon={<IndianRupee className="size-3.5" />} label="Price" value={inr(sellInr)} />
              <HeaderStat icon={<DollarSign className="size-3.5" />} label="Revenue" value={inr(revenue)} />
              <HeaderStat icon={<ShoppingCart className="size-3.5" />} label="Orders" value={orders.toLocaleString()} />
            </div>
          </div>
        </div>

        {/* Quick actions */}
        <div className="mt-4 flex flex-wrap gap-2">
          <Link to={FIX_TO.details} params={{ slug }}
            className="inline-flex items-center gap-1.5 rounded-full bg-accent px-3.5 py-2 text-xs font-semibold text-accent-foreground hover:brightness-110 active:scale-[0.98] transition-all">
            <Pencil className="size-3.5" /> Edit
          </Link>
          <ActionBtn icon={<Copy className="size-3.5" />} label="Duplicate" busy={busy === "Duplicate"} onClick={duplicate} />
          {status !== "hidden" ? (
            <ActionBtn icon={<EyeOff className="size-3.5" />} label="Hide" busy={busy === "Hide"} onClick={() => setStatusAction("hidden", "Hide")} />
          ) : (
            <ActionBtn icon={<Send className="size-3.5" />} label="Publish" busy={busy === "Publish"} onClick={() => setStatusAction("published", "Publish")} />
          )}
          <ActionBtn icon={<Archive className="size-3.5" />} label="Archive" busy={busy === "Archive"} onClick={() => setStatusAction("archived", "Archive")} />
          <Link to="/products/$slug" params={{ slug }} target="_blank"
            className="inline-flex items-center gap-1.5 rounded-full border border-white/10 px-3.5 py-2 text-xs font-medium text-muted-foreground hover:text-foreground hover:border-white/20">
            <ExternalLink className="size-3.5" /> View Storefront
          </Link>
          <Link to={FIX_TO.seo} params={{ slug }}
            className="inline-flex items-center gap-1.5 rounded-full border border-white/10 px-3.5 py-2 text-xs font-medium text-muted-foreground hover:text-foreground hover:border-white/20">
            <Search className="size-3.5" /> Preview SEO
          </Link>
          <ActionBtn icon={<Trash2 className="size-3.5" />} label="Delete" busy={busy === "Delete"} onClick={softDelete} danger />
        </div>
      </div>

      {/* SKU OPERATIONS */}
      <div className="card-premium rounded-2xl p-4">
        <div className="flex items-center justify-between gap-2 mb-3">
          <p className="text-sm font-medium flex items-center gap-2"><Hash className="size-4 text-accent" /> SKU Operations</p>
          {!r.sku && (
            <ActionBtn icon={<Wand2 className="size-3.5" />} label="Assign SKU" busy={busy === "SKU"} onClick={generateThisSku} primary />
          )}
        </div>
        <div className="grid grid-cols-3 gap-2 mb-3">
          <Mini icon={<AlertCircle className="size-3.5" />} label="Missing" value={skuStats.loading ? "…" : skuStats.missing.toLocaleString()} />
          <Mini icon={<ShieldCheck className="size-3.5" />} label="Coverage" value={skuStats.loading ? "…" : `${coverage}%`} />
          <Mini icon={<Copy className="size-3.5" />} label="Duplicates" value={skuStats.loading ? "…" : skuStats.duplicates.toLocaleString()} />
        </div>
        <div className="flex flex-wrap gap-2">
          <ActionBtn icon={<Wand2 className="size-3.5" />} label="Generate Missing SKUs" busy={busy === "SKU-ALL"} onClick={generateAllSkus} disabled={skuStats.missing === 0} />
          <ActionBtn icon={<Download className="size-3.5" />} label="Export SKU Report" onClick={exportSkuReport} disabled={skuStats.loading} />
        </div>
      </div>

      {/* MARKET PERFORMANCE */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        <RegionCard title="India" flag="🇮🇳" currency="inr" bucket={perf.india} views={views} loading={perf.loading} />
        <RegionCard title="International" flag="🌍" currency="usd" bucket={perf.intl} views={views} loading={perf.loading} />
      </div>

      {/* PRODUCT HEALTH CENTER */}
      <div className="card-premium rounded-2xl p-4">
        <div className="flex items-center justify-between mb-3">
          <p className="text-sm font-medium flex items-center gap-2"><ShieldCheck className="size-4 text-accent" /> Product Health Center</p>
          <span className="text-lg font-display font-semibold tabular-nums">{score}<span className="text-xs text-muted-foreground">/100</span></span>
        </div>
        <div className="h-2 rounded-full bg-white/10 overflow-hidden mb-4">
          <div className="h-full rounded-full bg-gradient-to-r from-accent to-amber-400 transition-all" style={{ width: `${score}%` }} />
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
          {categories.map((cat) => {
            const ok = cat.items.filter((i) => i.ok).length;
            const pct = Math.round((ok / cat.items.length) * 100);
            const Icon = cat.icon;
            return (
              <div key={cat.name} className="rounded-xl border border-white/10 bg-white/[0.02] p-3">
                <div className="flex items-center justify-between mb-2">
                  <span className="text-xs font-medium flex items-center gap-1.5"><Icon className="size-3.5 text-accent" /> {cat.name}</span>
                  <span className={`text-[11px] font-mono ${pct === 100 ? "text-emerald-400" : "text-amber-400"}`}>{pct}%</span>
                </div>
                <div className="space-y-1">
                  {cat.items.map((it) => (
                    <div key={it.key} className="flex items-center justify-between gap-2 text-[11px]">
                      <span className="flex items-center gap-1.5">
                        {it.ok ? <CheckCircle2 className="size-3 text-emerald-400 shrink-0" /> : <AlertCircle className="size-3 text-amber-400 shrink-0" />}
                        <span className={it.ok ? "text-muted-foreground" : "text-foreground"}>{it.key}</span>
                      </span>
                      {!it.ok && it.fix && (
                        <Link to={FIX_TO[it.fix as FixKey]} params={{ slug }} className="text-accent hover:underline shrink-0">Fix</Link>
                      )}
                    </div>
                  ))}
                </div>
              </div>
            );
          })}
        </div>
        {missingItems.length > 0 && (
          <p className="mt-3 text-[11px] text-amber-400">Action needed: {missingItems.map((m) => m.key).join(", ")}</p>
        )}
      </div>

      {/* PERFORMANCE SNAPSHOT */}
      <PerformanceSnapshot perf={perf} views={views} />

      {/* PRODUCT CONFIGURATION */}
      <div>
        <p className="text-[9px] font-mono uppercase tracking-[0.25em] text-muted-foreground mb-2 px-1">Product Configuration</p>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
          {PRODUCT_SECTIONS.filter((s) => s.key !== "analytics" && s.key !== "preview").map((s) => {
            const Icon = ICONS[s.key] ?? FileText;
            return (
              <Link key={s.key} to={s.to} params={{ slug }}
                className="group card-premium rounded-2xl p-4 hover:border-accent/40 transition-colors">
                <div className="flex items-start justify-between">
                  <span className="size-9 grid place-items-center rounded-xl bg-accent/10 text-accent"><Icon className="size-4" /></span>
                  <ChevronRight className="size-4 text-muted-foreground group-hover:text-accent transition-colors" />
                </div>
                <p className="mt-3 text-sm font-medium">{s.label}</p>
                <p className="text-[11px] text-muted-foreground mt-0.5">{DESC[s.key]}</p>
              </Link>
            );
          })}
        </div>
      </div>

      {/* ANALYTICS — collapsed by default at the bottom */}
      <div className="card-premium rounded-2xl overflow-hidden">
        <button onClick={() => setShowAnalytics((v) => !v)}
          className="w-full flex items-center justify-between gap-2 p-4 text-left">
          <span className="text-sm font-medium flex items-center gap-2"><BarChart3 className="size-4 text-accent" /> Analytics & Activity</span>
          <ChevronDown className={`size-4 text-muted-foreground transition-transform ${showAnalytics ? "rotate-180" : ""}`} />
        </button>
        {showAnalytics && (
          <div className="px-4 pb-4 space-y-4">
            <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
              <Mini icon={<Eye className="size-3.5" />} label="Views" value={views.toLocaleString()} />
              <Mini icon={<ShoppingCart className="size-3.5" />} label="Orders" value={orders.toLocaleString()} />
              <Mini icon={<IndianRupee className="size-3.5" />} label="Revenue" value={inr(revenue)} />
              <Mini icon={<TrendingUp className="size-3.5" />} label="Conversion" value={`${conv.toFixed(1)}%`} />
              <Mini icon={<Heart className="size-3.5" />} label="Wishlist" value={wishlist.toLocaleString()} />
              <Mini icon={<Boxes className="size-3.5" />} label="Placements" value={String(placements.length)} />
            </div>
            <Link to={FIX_TO.analytics} params={{ slug }}
              className="inline-flex items-center gap-1.5 rounded-full border border-white/10 px-3.5 py-2 text-xs font-medium text-muted-foreground hover:text-foreground hover:border-white/20">
              <BarChart3 className="size-3.5" /> Full Analytics
            </Link>
            <ProductTimeline productId={r.id} />
          </div>
        )}
      </div>
    </div>
  );
}

/* ----------------------------- performance snapshot ----------------------------- */

function PerformanceSnapshot({ perf, views }: { perf: Perf; views: number }) {
  const [win, setWin] = useState<"today" | "d7" | "d30">("d7");
  const b = perf.windows[win];
  const conv = views > 0 ? (b.orders / views) * 100 : 0;
  return (
    <div className="card-premium rounded-2xl p-4">
      <div className="flex items-center justify-between gap-2 mb-3">
        <p className="text-sm font-medium flex items-center gap-2"><Activity className="size-4 text-accent" /> Performance Snapshot</p>
        <div className="flex gap-1 rounded-full border border-white/10 p-0.5">
          {([["today", "Today"], ["d7", "7 Days"], ["d30", "30 Days"]] as const).map(([k, label]) => (
            <button key={k} onClick={() => setWin(k)}
              className={`rounded-full px-2.5 py-1 text-[11px] font-medium transition-colors ${win === k ? "bg-accent text-accent-foreground" : "text-muted-foreground hover:text-foreground"}`}>
              {label}
            </button>
          ))}
        </div>
      </div>
      {perf.loading ? (
        <div className="grid place-items-center py-6"><Loader2 className="size-4 animate-spin text-accent" /></div>
      ) : (
        <div className="grid grid-cols-2 sm:grid-cols-5 gap-2">
          <Mini icon={<IndianRupee className="size-3.5" />} label="Revenue" value={inr(b.revenue)} />
          <Mini icon={<ShoppingCart className="size-3.5" />} label="Orders" value={b.orders.toLocaleString()} />
          <Mini icon={<Eye className="size-3.5" />} label="Views" value={views.toLocaleString()} />
          <Mini icon={<TrendingUp className="size-3.5" />} label="Conversion" value={`${conv.toFixed(1)}%`} />
          <Mini icon={<RotateCcw className="size-3.5" />} label="Returns" value={b.returns.toLocaleString()} />
        </div>
      )}
    </div>
  );
}

/* ----------------------------- region card ----------------------------- */

function RegionCard({ title, flag, currency, bucket, views, loading }: {
  title: string; flag: string; currency: "inr" | "usd"; bucket: PerfBucket; views: number; loading: boolean;
}) {
  const fmt = currency === "inr" ? inr : usd;
  const conv = views > 0 ? (bucket.orders / views) * 100 : 0;
  const returnRate = bucket.units > 0 ? (bucket.returns / bucket.units) * 100 : 0;
  return (
    <div className="card-premium rounded-2xl p-4">
      <p className="text-sm font-medium flex items-center gap-2 mb-3"><span className="text-base">{flag}</span> {title} <Globe className="size-3.5 text-muted-foreground" /></p>
      {loading ? (
        <div className="grid place-items-center py-6"><Loader2 className="size-4 animate-spin text-accent" /></div>
      ) : (
        <div className="grid grid-cols-2 gap-2">
          <Mini icon={<DollarSign className="size-3.5" />} label="Revenue" value={fmt(bucket.revenue)} />
          <Mini icon={<ShoppingCart className="size-3.5" />} label="Orders" value={bucket.orders.toLocaleString()} />
          <Mini icon={<TrendingUp className="size-3.5" />} label="Conversion" value={`${conv.toFixed(1)}%`} />
          <Mini icon={<RotateCcw className="size-3.5" />} label="Returns" value={`${bucket.returns} (${returnRate.toFixed(0)}%)`} />
        </div>
      )}
    </div>
  );
}

/* ----------------------------- timeline ----------------------------- */

const ACTION_LABEL: Record<string, string> = {
  product_created: "Created", product_updated: "Edited", product_publish: "Published",
  product_publishd: "Published", product_unpublish: "Unpublished", product_unpublishd: "Unpublished",
  product_hide: "Hidden", product_hidd: "Hidden", product_archive: "Archived", product_archived: "Archived",
  product_duplicated: "Duplicated", product_deleted: "Deleted",
};

function ProductTimeline({ productId }: { productId: string }) {
  const [rows, setRows] = useState<any[] | null>(null);

  useEffect(() => {
    let active = true;
    supabase.from("admin_activity_logs")
      .select("id, action, created_at, metadata")
      .eq("entity_type", "product").eq("entity_id", productId)
      .order("created_at", { ascending: false }).limit(20)
      .then(({ data }) => { if (active) setRows(data ?? []); });
    return () => { active = false; };
  }, [productId]);

  return (
    <div className="rounded-2xl border border-white/10 bg-white/[0.02] p-4">
      <p className="text-sm font-medium flex items-center gap-2 mb-3"><Activity className="size-4 text-accent" /> Product Timeline</p>
      {rows === null ? (
        <div className="grid place-items-center py-6"><Loader2 className="size-4 animate-spin text-accent" /></div>
      ) : rows.length === 0 ? (
        <p className="text-xs text-muted-foreground">No activity recorded yet.</p>
      ) : (
        <ol className="relative border-l border-white/10 pl-4 space-y-3">
          {rows.map((e) => {
            const section = (e.metadata && (e.metadata.section as string)) || null;
            const label = ACTION_LABEL[e.action] || String(e.action).replace(/_/g, " ");
            return (
              <li key={e.id} className="relative">
                <span className="absolute -left-[1.31rem] top-1 size-2 rounded-full bg-accent" />
                <div className="flex items-center justify-between gap-2">
                  <p className="text-xs font-medium">
                    {label}{section ? <span className="text-muted-foreground"> · {section}</span> : null}
                  </p>
                  <span className="text-[10px] text-muted-foreground shrink-0">{new Date(e.created_at).toLocaleString()}</span>
                </div>
              </li>
            );
          })}
        </ol>
      )}
    </div>
  );
}

/* ----------------------------- small bits ----------------------------- */

function StatusChip({ label, value, tone }: { label: string; value: string; tone?: string }) {
  return (
    <span className="inline-flex items-center gap-1">
      <span className="text-muted-foreground/60">{label}:</span>
      <span className={`capitalize font-medium ${tone ?? "text-foreground"}`}>{value}</span>
    </span>
  );
}

function HeaderStat({ icon, label, value, tone }: { icon: React.ReactNode; label: string; value: string; tone?: string }) {
  return (
    <div className="rounded-xl border border-white/10 bg-white/[0.02] p-2.5">
      <div className="flex items-center gap-1.5 text-muted-foreground mb-0.5">
        <span className="text-accent">{icon}</span>
        <span className="text-[8px] font-mono uppercase tracking-[0.2em]">{label}</span>
      </div>
      <p className={`text-sm font-semibold tabular-nums ${tone ?? ""}`}>{value}</p>
    </div>
  );
}

function ActionBtn({ icon, label, onClick, busy, primary, danger, disabled }: {
  icon: React.ReactNode; label: string; onClick: () => void; busy?: boolean; primary?: boolean; danger?: boolean; disabled?: boolean;
}) {
  const base = "inline-flex items-center gap-1.5 rounded-full px-3.5 py-2 text-xs font-semibold transition-all disabled:opacity-50 active:scale-[0.98]";
  const variant = primary
    ? "bg-accent text-accent-foreground hover:brightness-110"
    : danger
    ? "border border-destructive/40 text-destructive hover:bg-destructive/10"
    : "border border-white/10 text-muted-foreground hover:text-foreground hover:border-white/20";
  return (
    <button onClick={onClick} disabled={busy || disabled} className={`${base} ${variant}`}>
      {busy ? <Loader2 className="size-3.5 animate-spin" /> : icon} {label}
    </button>
  );
}

function Mini({ icon, label, value }: { icon: React.ReactNode; label: string; value: string }) {
  return (
    <div className="rounded-xl border border-white/10 bg-white/[0.02] p-2.5">
      <div className="flex items-center gap-1.5 text-muted-foreground mb-1">
        <span className="text-accent">{icon}</span>
        <span className="text-[8px] font-mono uppercase tracking-[0.2em]">{label}</span>
      </div>
      <p className="text-sm font-semibold tabular-nums">{value}</p>
    </div>
  );
}
