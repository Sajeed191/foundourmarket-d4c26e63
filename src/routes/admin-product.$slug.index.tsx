import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import {
  FileText, IndianRupee, Boxes, Truck, RotateCcw, Search, Sparkles, BarChart3, Eye, ChevronRight,
  TrendingUp, ShoppingCart, Heart, CheckCircle2, AlertCircle, Loader2, Activity,
  Globe, Copy, Archive, Trash2, Send, EyeOff, ExternalLink, ShieldCheck, Lightbulb,
} from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { ReadOnlySection, PRODUCT_SECTIONS, inr, useNavigate } from "@/components/admin/product-editor/kit";
import { logActivity } from "@/components/admin/AdminShell";
import { invalidateProducts } from "@/lib/use-products";

const STAT_COLS = [
  "id", "name", "slug", "image", "status", "category", "sku", "description",
  "seo_title", "seo_description", "price", "price_inr", "compare_price_inr",
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
  details: FileText, pricing: IndianRupee, inventory: Boxes, shipping: Truck,
  returns: RotateCcw, seo: Search, merchandising: Sparkles, analytics: BarChart3, preview: Eye,
};

const DESC: Record<string, string> = {
  details: "Name, description, media & attributes",
  pricing: "Regional prices, cost & margins",
  inventory: "Stock levels, SKU & availability",
  shipping: "Dimensions, fees & delivery options",
  returns: "Return window, replacements & warranty",
  seo: "Search title, description & keywords",
  merchandising: "Badges, placement & priority",
  analytics: "Views, ratings & performance",
  preview: "See exactly how buyers view it",
};

function OverviewPage() {
  const { slug } = Route.useParams();
  return (
    <ReadOnlySection slug={slug} sectionKey="" title="Product Overview" icon={<FileText className="size-4" />} cols={STAT_COLS}>
      {(r) => <CommandCenter r={r} slug={slug} />}
    </ReadOnlySection>
  );
}

/* ----------------------------- completeness ----------------------------- */

function buildChecklist(r: Record<string, any>) {
  const sell = r.price_inr ?? (Number(r.price) || 0);
  const hasBadge = MERCH_FLAGS.some((f) => !!r[f]);
  return [
    { key: "Images", ok: !!r.image },
    { key: "Description", ok: !!(r.description && String(r.description).trim().length > 40) },
    { key: "SEO", ok: !!(r.seo_title && r.seo_description) },
    { key: "Pricing", ok: sell > 0 },
    { key: "Inventory", ok: Number(r.stock_quantity ?? 0) > 0 || r.status === "preorder" },
    { key: "Category", ok: !!r.category && r.category !== "Uncategorized" },
    { key: "Shipping", ok: Number(r.weight ?? 0) > 0 && Number(r.shipping_fee_inr ?? 0) >= 0 && !!r.weight },
    { key: "Returns", ok: !!r.return_eligible || Number(r.return_window_days ?? 0) > 0 || !!r.warranty },
    { key: "Badges", ok: hasBadge },
    { key: "Related Products", ok: Array.isArray(r.related_products) && r.related_products.length > 0 },
  ];
}

/* ----------------------------- command center ----------------------------- */

function CommandCenter({ r, slug }: { r: Record<string, any>; slug: string }) {
  const navigate = useNavigate();
  const [busy, setBusy] = useState<string | null>(null);
  const [status, setStatus] = useState<string>(r.status ?? "draft");

  const views = Number(r.views_count ?? 0);
  const orders = Number(r.orders_count ?? 0);
  const revenue = Number(r.revenue ?? 0);
  const wishlist = Number(r.wishlist_count ?? 0);
  const conv = views > 0 ? (orders / views) * 100 : 0;
  const stock = Number(r.stock_quantity ?? 0);
  const lowThreshold = Number(r.low_stock_threshold ?? 5);

  const checklist = buildChecklist(r);
  const completed = checklist.filter((c) => c.ok).length;
  const score = Math.round((completed / checklist.length) * 100);
  const missing = checklist.filter((c) => !c.ok);

  const placements = MERCH_FLAGS.filter((f) => !!r[f]);
  const visible = status === "published" && !r.hide_from_search && (r.india_visible || r.international_visible);

  const health =
    score >= 85 && stock > 0 ? { label: "Excellent", tone: "text-emerald-400", bg: "bg-emerald-500/15 border-emerald-500/30" }
    : score >= 65 ? { label: "Good", tone: "text-sky-400", bg: "bg-sky-500/15 border-sky-500/30" }
    : score >= 40 ? { label: "Needs Attention", tone: "text-amber-400", bg: "bg-amber-500/15 border-amber-500/30" }
    : { label: "Critical", tone: "text-destructive", bg: "bg-destructive/15 border-destructive/30" };

  const insights: { tone: string; text: string }[] = [];
  if (views > 100 && conv < 1) insights.push({ tone: "text-amber-400", text: "High views but low conversion — review pricing or imagery." });
  if (views > 200 && !r.homepage_hero) insights.push({ tone: "text-accent", text: "Eligible for Homepage Hero placement." });
  if (orders > 20 && !r.bestseller) insights.push({ tone: "text-emerald-400", text: "Potential Bestseller — consider adding the Best Seller badge." });
  if (stock <= lowThreshold) insights.push({ tone: "text-destructive", text: "Low inventory risk — restock soon." });
  if (insights.length === 0) insights.push({ tone: "text-muted-foreground", text: "No urgent recommendations — this product looks healthy." });

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
    copy.sku = full.sku ? `${full.sku}-COPY` : null;
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

  return (
    <div className="space-y-4">
      {/* Global status bar */}
      <div className="card-premium rounded-2xl p-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="min-w-0">
            <p className="text-base font-display font-semibold truncate">{r.name || "Untitled product"}</p>
            <div className="flex flex-wrap items-center gap-x-3 gap-y-1 mt-1.5 text-[11px] text-muted-foreground">
              <StatusChip label="Status" value={String(status).replace(/_/g, " ")} />
              <StatusChip label="Visibility" value={visible ? "Public" : "Limited"} tone={visible ? "text-emerald-400" : "text-amber-400"} />
              <StatusChip label="Inventory" value={stock > 0 ? `${stock} in stock` : "Out of stock"} tone={stock > lowThreshold ? "text-emerald-400" : "text-amber-400"} />
              <StatusChip label="Placement" value={placements.length ? `${placements.length} active` : "None"} />
            </div>
          </div>
          <div className={`shrink-0 rounded-xl border px-4 py-2.5 text-center ${health.bg}`}>
            <p className="text-[9px] font-mono uppercase tracking-[0.25em] text-muted-foreground">Health</p>
            <p className={`text-sm font-semibold ${health.tone}`}>{health.label}</p>
          </div>
        </div>
      </div>

      {/* Quick actions */}
      <div className="card-premium rounded-2xl p-4">
        <p className="text-[9px] font-mono uppercase tracking-[0.25em] text-muted-foreground mb-3">Quick Actions</p>
        <div className="flex flex-wrap gap-2">
          {status !== "published" ? (
            <ActionBtn icon={<Send className="size-3.5" />} label="Publish" busy={busy === "Publish"} onClick={() => setStatusAction("published", "Publish")} primary />
          ) : (
            <ActionBtn icon={<EyeOff className="size-3.5" />} label="Unpublish" busy={busy === "Unpublish"} onClick={() => setStatusAction("hidden", "Unpublish")} />
          )}
          <ActionBtn icon={<Copy className="size-3.5" />} label="Duplicate" busy={busy === "Duplicate"} onClick={duplicate} />
          <ActionBtn icon={<Archive className="size-3.5" />} label="Archive" busy={busy === "Archive"} onClick={() => setStatusAction("archived", "Archive")} />
          <ActionBtn icon={<Trash2 className="size-3.5" />} label="Delete" busy={busy === "Delete"} onClick={softDelete} danger />
          <Link to="/products/$slug" params={{ slug }} target="_blank"
            className="inline-flex items-center gap-1.5 rounded-full border border-white/10 px-3.5 py-2 text-xs font-medium text-muted-foreground hover:text-foreground hover:border-white/20">
            <ExternalLink className="size-3.5" /> Preview Storefront
          </Link>
          <Link to="/admin-product/$slug/analytics" params={{ slug }}
            className="inline-flex items-center gap-1.5 rounded-full border border-white/10 px-3.5 py-2 text-xs font-medium text-muted-foreground hover:text-foreground hover:border-white/20">
            <BarChart3 className="size-3.5" /> View Analytics
          </Link>
        </div>
      </div>

      {/* Performance + completeness */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        {/* Completeness */}
        <div className="card-premium rounded-2xl p-4">
          <div className="flex items-center justify-between mb-3">
            <p className="text-sm font-medium flex items-center gap-2"><ShieldCheck className="size-4 text-accent" /> Completeness</p>
            <span className="text-lg font-display font-semibold tabular-nums">{score}<span className="text-xs text-muted-foreground">/100</span></span>
          </div>
          <div className="h-2 rounded-full bg-white/10 overflow-hidden mb-3">
            <div className="h-full rounded-full bg-gradient-to-r from-accent to-amber-400 transition-all" style={{ width: `${score}%` }} />
          </div>
          <div className="grid grid-cols-2 gap-x-4 gap-y-1.5">
            {checklist.map((c) => (
              <div key={c.key} className="flex items-center gap-1.5 text-xs">
                {c.ok ? <CheckCircle2 className="size-3.5 text-emerald-400 shrink-0" /> : <AlertCircle className="size-3.5 text-amber-400 shrink-0" />}
                <span className={c.ok ? "text-muted-foreground" : "text-foreground"}>{c.key}</span>
              </div>
            ))}
          </div>
          {missing.length > 0 && (
            <p className="mt-3 text-[11px] text-amber-400">Missing: {missing.map((m) => m.key).join(", ")}</p>
          )}
        </div>

        {/* Performance */}
        <div className="card-premium rounded-2xl p-4">
          <p className="text-sm font-medium flex items-center gap-2 mb-3"><TrendingUp className="size-4 text-accent" /> Performance Insights</p>
          <div className="grid grid-cols-2 sm:grid-cols-3 gap-3 mb-3">
            <Mini icon={<Eye className="size-3.5" />} label="Views" value={views.toLocaleString()} />
            <Mini icon={<ShoppingCart className="size-3.5" />} label="Orders" value={orders.toLocaleString()} />
            <Mini icon={<IndianRupee className="size-3.5" />} label="Revenue" value={inr(revenue)} />
            <Mini icon={<TrendingUp className="size-3.5" />} label="Conversion" value={`${conv.toFixed(1)}%`} />
            <Mini icon={<Heart className="size-3.5" />} label="Wishlist" value={wishlist.toLocaleString()} />
          </div>
          <div className="space-y-1.5">
            {insights.map((i, idx) => (
              <div key={idx} className="flex items-start gap-1.5 text-[11px]">
                <Lightbulb className={`size-3.5 mt-px shrink-0 ${i.tone}`} />
                <span className={i.tone}>{i.text}</span>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* Management cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
        {PRODUCT_SECTIONS.map((s) => {
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

      {/* Timeline */}
      <ProductTimeline productId={r.id} />
    </div>
  );
}

/* ----------------------------- timeline ----------------------------- */

const ACTION_LABEL: Record<string, string> = {
  product_created: "Created", product_updated: "Edited", product_publish: "Published",
  product_publishd: "Published", product_unpublish: "Unpublished", product_unpublishd: "Unpublished",
  product_archive: "Archived", product_archived: "Archived", product_duplicated: "Duplicated",
  product_deleted: "Deleted",
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
    <div className="card-premium rounded-2xl p-4">
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

function ActionBtn({ icon, label, onClick, busy, primary, danger }: {
  icon: React.ReactNode; label: string; onClick: () => void; busy?: boolean; primary?: boolean; danger?: boolean;
}) {
  const base = "inline-flex items-center gap-1.5 rounded-full px-3.5 py-2 text-xs font-semibold transition-all disabled:opacity-50";
  const variant = primary
    ? "bg-accent text-accent-foreground hover:brightness-110"
    : danger
    ? "border border-destructive/40 text-destructive hover:bg-destructive/10"
    : "border border-white/10 text-muted-foreground hover:text-foreground hover:border-white/20";
  return (
    <button onClick={onClick} disabled={busy} className={`${base} ${variant}`}>
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
