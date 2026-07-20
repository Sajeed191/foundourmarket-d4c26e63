import { createFileRoute } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import {
  FileText, ImageIcon, Film, Tag, Layers, ListChecks, Search, Activity,
  ChevronDown, Sparkles, CheckCircle2, AlertTriangle, Send, EyeOff,
  Package, Star, HelpCircle,
} from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { invalidateProducts } from "@/lib/use-products";
import { resolveImage } from "@/lib/products";
import { SectionEditor, Field, parseList, useNavigate } from "@/components/admin/product-editor/kit";
import { ProductMediaGallery, ProductVideoUploader } from "@/components/admin/product-editor/media-fields";
import { CategorySelector } from "@/components/admin/product-editor/category-selector";
import { ProductFaqManager } from "@/components/admin/ProductFaqManager";
import {
  FeaturesBuilder, KeyValueBuilder, RichTextEditor, kvToArray, arrayToKv, type KV,
} from "@/components/admin/product-editor/field-builders";

export const Route = createFileRoute("/admin-product/$slug/details")({ component: DetailsPage });

const COLS = [
  "name", "slug", "description", "image", "brand", "product_type", "category", "categories", "tags",
  "features", "specifications", "attributes", "video_url",
  "seo_title", "seo_description", "meta_keywords",
  "price", "price_inr", "stock_quantity",
  "rating", "reviews", "rating_source",
];

type Form = {
  name: string; brand: string; product_type: string; category: string; categories: string[]; tags: string;
  description: string;
  features: string[];
  specs: KV[];
  attrs: KV[];
  video_url: string;
  seo_title: string; seo_description: string; keywords: string;
  rating: number; reviews: number; rating_source: string;
};

function DetailsPage() {
  const { slug } = Route.useParams();
  return (
    <SectionEditor<Form>
      slug={slug} sectionKey="details" title="Product Details" icon={<FileText className="size-4" />} cols={COLS}
      toForm={(r) => ({
        name: r.name ?? "", brand: r.brand ?? "", product_type: r.product_type ?? "",
        category: r.category ?? "",
        categories: ((r.categories ?? []) as string[]).length
          ? ((r.categories ?? []) as string[])
          : (r.category ? [r.category] : []),
        tags: (r.tags ?? []).join(", "),
        description: r.description ?? "",
        features: (r.features ?? []) as string[],
        specs: kvToArray(r.specifications), attrs: kvToArray(r.attributes),
        video_url: r.video_url ?? "",
        seo_title: r.seo_title ?? "", seo_description: r.seo_description ?? "",
        keywords: (r.meta_keywords ?? []).join(", "),
        rating: Number(r.rating) || 0,
        reviews: Number(r.reviews) || 0,
        rating_source: r.rating_source ?? "imported_supplier",
      })}
      toPatch={(f) => ({
        name: f.name.trim(),
        brand: f.brand.trim() || null,
        product_type: f.product_type.trim() || null,
        category: (f.categories[0] ?? f.category.trim()) || null,
        categories: f.categories,
        tags: parseList(f.tags),
        description: f.description.trim() || null,
        features: f.features.map((x) => x.trim()).filter(Boolean),
        specifications: arrayToKv(f.specs),
        attributes: arrayToKv(f.attrs),
        video_url: f.video_url.trim() || null,
        seo_title: f.seo_title.trim() || null,
        seo_description: f.seo_description.trim() || null,
        meta_keywords: parseList(f.keywords),
        rating: Math.max(0, Math.min(5, Number(f.rating) || 0)),
        reviews: Math.max(0, Math.floor(Number(f.reviews) || 0)),
        rating_source: f.rating_source || "imported_supplier",
      })}
      validate={(f) => (f.name.trim() ? null : "Product name is required.")}
    >
      {(f, set, row) => <CommandCenter slug={slug} f={f} set={set} row={row} />}
    </SectionEditor>
  );
}

/* ----------------------------- shell pieces ----------------------------- */

function SummaryStat({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-lg border border-white/10 bg-white/[0.02] px-2 py-1.5 text-center">
      <p className="text-[8px] font-mono uppercase tracking-[0.15em] text-muted-foreground">{label}</p>
      <p className="mt-0.5 truncate text-sm font-semibold">{value}</p>
    </div>
  );
}


function Collapsible({ title, icon, desc, defaultOpen = true, badge, children }: {
  title: string; icon: React.ReactNode; desc?: string; defaultOpen?: boolean;
  badge?: React.ReactNode; children: React.ReactNode;
}) {
  const [open, setOpen] = useState(defaultOpen);
  return (
    <section className="rounded-2xl border border-white/10 bg-white/[0.02]">
      <button type="button" onClick={() => setOpen((o) => !o)}
        className="flex w-full items-center gap-3 px-4 py-3.5 text-left">
        <span className="grid size-9 shrink-0 place-items-center rounded-xl border border-accent/30 bg-accent/10 text-accent">{icon}</span>
        <span className="min-w-0 flex-1">
          <span className="flex items-center gap-2">
            <span className="text-sm font-semibold">{title}</span>
            {badge}
          </span>
          {desc && <span className="mt-0.5 block truncate text-[11px] text-muted-foreground">{desc}</span>}
        </span>
        <ChevronDown className={`size-4 shrink-0 text-muted-foreground transition-transform ${open ? "rotate-180" : ""}`} />
      </button>
      {open && <div className="border-t border-white/10 p-4">{children}</div>}
    </section>
  );
}

/* ----------------------------- rating manager ----------------------------- */

// Allowed values must match the DB check constraint products_rating_source_check.
const RATING_SOURCES: { value: string; label: string; hint: string }[] = [
  { value: "customer_reviews", label: "Customer", hint: "Rating reflects real customer reviews on this product." },
  { value: "imported_supplier", label: "Supplier", hint: "Rating imported from the supplier / source listing." },
  { value: "marketplace_imported", label: "Marketplace", hint: "Rating imported from an external marketplace." },
];

const DEFAULT_RATING_SOURCE = "imported_supplier";

function RatingManager({ f, set }: {
  f: Form; set: (patch: Partial<Form>) => void;
}) {
  const rating = Number(f.rating) || 0;
  const reviews = Number(f.reviews) || 0;
  const [hover, setHover] = useState<number | null>(null);
  const display = hover ?? rating;

  function setStar(value: number) {
    // click on same star toggles half / full for fine control
    set({ rating: value });
  }


  return (
    <div className="space-y-4">
      {/* Interactive star picker (supports half steps) */}
      <div>
        <label className="mb-2 block text-[9px] font-mono uppercase tracking-[0.2em] text-muted-foreground">Star Rating</label>
        <div className="flex items-center gap-3">
          <div className="flex items-center gap-1" onMouseLeave={() => setHover(null)}>
            {[1, 2, 3, 4, 5].map((i) => {
              const filled = display >= i;
              const half = !filled && display >= i - 0.5;
              return (
                <div key={i} className="relative">
                  <Star className={`size-7 ${filled ? "fill-amber-400 text-amber-400" : "text-white/20"}`} />
                  {half && (
                    <Star className="absolute inset-0 size-7 fill-amber-400 text-amber-400"
                      style={{ clipPath: "inset(0 50% 0 0)" }} />
                  )}
                  {/* left half hit area = i-0.5, right half = i */}
                  <button type="button" aria-label={`${i - 0.5} stars`}
                    className="absolute inset-y-0 left-0 w-1/2"
                    onMouseEnter={() => setHover(i - 0.5)} onClick={() => setStar(i - 0.5)} />
                  <button type="button" aria-label={`${i} stars`}
                    className="absolute inset-y-0 right-0 w-1/2"
                    onMouseEnter={() => setHover(i)} onClick={() => setStar(i)} />
                </div>
              );
            })}
          </div>
          <span className="text-lg font-bold text-amber-400 tabular-nums">{rating.toFixed(1)}</span>
          <span className="text-xs text-muted-foreground">/ 5.0</span>
        </div>
      </div>

      {/* Manual numeric controls */}
      <div className="grid grid-cols-2 gap-3">
        <Field label="Rating (0–5)" type="number" value={String(rating)}
          onChange={(v) => set({ rating: Math.max(0, Math.min(5, Number(v) || 0)) })}
          hint="Supports decimals e.g. 4.5" />
        <Field label="Review Count" type="number" value={String(reviews)}
          onChange={(v) => set({ reviews: Math.max(0, Math.floor(Number(v) || 0)) })}
          hint="Total number of reviews" />
      </div>

      {/* Source */}
      <div>
        <label className="mb-1.5 block text-[9px] font-mono uppercase tracking-[0.2em] text-muted-foreground">Rating Source</label>
        <div className="grid grid-cols-3 gap-2">
          {RATING_SOURCES.map((src) => (
            <button key={src.value} type="button" onClick={() => set({ rating_source: src.value })}
              className={`rounded-lg border px-2 py-2 text-[11px] font-semibold transition-all active:scale-[0.98] ${
                f.rating_source === src.value
                  ? "border-accent/40 bg-accent/15 text-accent"
                  : "border-white/10 bg-white/[0.02] text-muted-foreground hover:text-foreground"
              }`}>
              {src.label}
            </button>
          ))}
        </div>
        <p className="mt-2 text-[10px] text-muted-foreground">
          {RATING_SOURCES.find((s) => s.value === f.rating_source)?.hint
            ?? "Choose where this product's rating comes from."}
        </p>
      </div>


      {/* Quick presets */}
      <div className="flex flex-wrap gap-1.5">
        {[5, 4.5, 4, 3.5, 0].map((preset) => (
          <button key={preset} type="button"
            onClick={() => set({ rating: preset })}
            className="rounded-full border border-white/10 bg-white/[0.02] px-2.5 py-1 text-[10px] font-medium text-muted-foreground transition-all hover:text-foreground active:scale-95">
            {preset === 0 ? "Reset" : `${preset}★`}
          </button>
        ))}
      </div>
    </div>
  );
}

/* ----------------------------- command center ----------------------------- */


function CommandCenter({ slug, f, set, row }: {
  slug: string; f: Form; set: (patch: Partial<Form>) => void; row: Record<string, any>;
}) {
  const navigate = useNavigate();
  const [primaryUrl, setPrimaryUrl] = useState<string>(row.image ?? "");
  const [imageCount, setImageCount] = useState<number>(row.image ? 1 : 0);
  const [status, setStatus] = useState<string>(row.status ?? "draft");
  const [pubBusy, setPubBusy] = useState(false);

  const sellPrice = Number(row.price_inr ?? row.price ?? 0);
  const stock = Number(row.stock_quantity ?? 0);

  const checks = useMemo(() => [
    { key: "Images", ok: imageCount > 0, icon: ImageIcon },
    { key: "Pricing", ok: sellPrice > 0, icon: Tag },
    { key: "Inventory", ok: stock > 0, icon: Package },
    { key: "SEO", ok: !!(f.seo_title.trim() && f.seo_description.trim()), icon: Search },
    { key: "Video", ok: !!f.video_url.trim(), icon: Film },
    { key: "SKU", ok: !!(row.sku && String(row.sku).trim()), icon: Layers },
    { key: "Category", ok: !!(f.category.trim() && f.category.trim() !== "Uncategorized"), icon: Tag },
    { key: "Specifications", ok: f.specs.some((s) => s.k.trim()), icon: ListChecks },
  ], [imageCount, sellPrice, stock, f.seo_title, f.seo_description, f.video_url, row.sku, f.category, f.specs]);

  const okCount = checks.filter((c) => c.ok).length;
  const score = Math.round((okCount / checks.length) * 100);
  const warnings = checks.filter((c) => !c.ok);

  const tone = score >= 85 ? { t: "text-emerald-400", b: "bg-emerald-500", r: "stroke-emerald-400" }
    : score >= 60 ? { t: "text-accent", b: "bg-accent", r: "stroke-accent" }
    : score >= 40 ? { t: "text-amber-400", b: "bg-amber-500", r: "stroke-amber-400" }
    : { t: "text-destructive", b: "bg-destructive", r: "stroke-destructive" };

  async function togglePublish() {
    const next = status === "published" ? "draft" : "published";
    setPubBusy(true);
    const { error } = await supabase.from("products").update({ status: next, updated_at: new Date().toISOString() }).eq("slug", slug);
    setPubBusy(false);
    if (error) { toast.error("Update failed", { description: error.message }); return; }
    setStatus(next);
    await invalidateProducts();
    toast.success(next === "published" ? "Product published" : "Moved to draft");
  }

  function generateSeo() {
    const title = f.seo_title.trim() || `${f.name.trim()}${f.brand.trim() ? ` by ${f.brand.trim()}` : ""}`.slice(0, 60);
    const plain = f.description.replace(/[#*_>`-]/g, "").replace(/\s+/g, " ").trim();
    const desc = f.seo_description.trim() || (plain ? plain.slice(0, 155) : `Shop ${f.name.trim()} on FoundOurMarket.`);
    const kw = f.keywords.trim() || parseList([f.name, f.brand, f.category, f.product_type, f.tags].filter(Boolean).join(", ")).join(", ");
    set({ seo_title: title, seo_description: desc, keywords: kw });
    toast.success("SEO content generated — review & save");
  }

  const canonical = `https://foundourmarket.com/products/${slug}`;
  const seoOk = !!(f.seo_title.trim() && f.seo_description.trim() && f.keywords.trim());
  const seoScore = [f.seo_title, f.seo_description, f.keywords].filter((x) => x.trim()).length;

  return (
    <div className="space-y-4">
      {/* Compact summary + health card */}
      <div className="card-premium rounded-2xl p-3.5">
        <div className="flex items-center gap-3">
          <div className="size-14 shrink-0 overflow-hidden rounded-xl border border-white/10 bg-white/5 grid place-items-center">
            {primaryUrl ? <img loading="lazy" decoding="async" src={resolveImage(primaryUrl)} alt={f.name} className="size-full object-cover" /> : <Package className="size-6 text-muted-foreground" />}
          </div>
          <div className="min-w-0 flex-1">
            <p className="truncate text-sm font-semibold">{f.name || "Untitled product"}</p>
            <div className="mt-0.5 flex items-center gap-2 text-[10px] text-muted-foreground">
              <span className="font-mono truncate">SKU {row.sku || "—"}</span>
              <span className={`inline-flex items-center rounded-full px-1.5 py-0.5 font-mono uppercase tracking-wider ${status === "published" ? "bg-emerald-500/15 text-emerald-400" : "bg-amber-500/15 text-amber-400"}`}>
                {status.replace(/_/g, " ")}
              </span>
            </div>
          </div>
          {/* Health ring */}
          <div className="relative size-16 shrink-0">
            <svg viewBox="0 0 36 36" className="size-full -rotate-90">
              <circle cx="18" cy="18" r="15.5" className="fill-none stroke-white/10" strokeWidth="3" />
              <circle cx="18" cy="18" r="15.5" className={`fill-none ${tone.r}`} strokeWidth="3" strokeLinecap="round"
                strokeDasharray={`${(score / 100) * 97.4} 97.4`} />
            </svg>
            <div className="absolute inset-0 grid place-content-center text-center">
              <span className={`text-base font-bold leading-none ${tone.t}`}>{score}%</span>
              <span className="text-[7px] font-mono uppercase tracking-widest text-muted-foreground">Complete</span>
            </div>
          </div>
        </div>
        <div className="mt-3 grid grid-cols-3 gap-1.5">
          <SummaryStat label="Stock" value={String(stock)} />
          <SummaryStat label="Price" value={sellPrice > 0 ? `₹${sellPrice.toLocaleString("en-IN")}` : "—"} />
          <SummaryStat label="Images" value={String(imageCount)} />
        </div>
        <div className="mt-2 flex items-center gap-2">
          <button type="button" onClick={togglePublish} disabled={pubBusy}
            className={`inline-flex items-center gap-1.5 rounded-full px-3.5 py-1.5 text-xs font-semibold transition-all active:scale-[0.97] disabled:opacity-50 ${status === "published" ? "border border-white/15 text-muted-foreground hover:text-foreground" : "bg-accent text-accent-foreground hover:brightness-110"}`}>
            {status === "published" ? <><EyeOff className="size-3.5" /> Unpublish</> : <><Send className="size-3.5" /> Publish</>}
          </button>
        </div>
      </div>


      {/* Media Center — images first, then video, with live health checks */}
      <Collapsible title="Media Center" icon={<ImageIcon className="size-4" />}
        desc={`${imageCount} Image${imageCount === 1 ? "" : "s"} • ${primaryUrl ? "Hero Set" : "No Hero"} • ${f.video_url.trim() ? "Video" : "No Video"}`}
        badge={
          <span className="flex items-center gap-1">
            <span className={`rounded-full px-1.5 py-0.5 text-[9px] font-mono uppercase tracking-wider ${primaryUrl ? "bg-accent/15 text-accent" : "bg-amber-500/15 text-amber-400"}`}>HERO</span>
            <span className={`rounded-full px-1.5 py-0.5 text-[9px] font-mono uppercase tracking-wider ${f.video_url.trim() ? "bg-emerald-500/15 text-emerald-400" : "bg-amber-500/15 text-amber-400"}`}>VID</span>
          </span>
        }>

        <div className="space-y-5">
          {/* Health checks */}
          <div className="grid grid-cols-2 gap-2">
            <span className={`inline-flex items-center gap-1.5 rounded-lg border px-2.5 py-2 text-[11px] ${imageCount > 0 ? "border-emerald-500/20 bg-emerald-500/5 text-emerald-400" : "border-amber-500/20 bg-amber-500/5 text-amber-400"}`}>
              {imageCount > 0 ? <CheckCircle2 className="size-3.5 shrink-0" /> : <AlertTriangle className="size-3.5 shrink-0" />}
              {imageCount > 0 ? "Images Added" : "Missing Images"}
            </span>
            <span className={`inline-flex items-center gap-1.5 rounded-lg border px-2.5 py-2 text-[11px] ${f.video_url.trim() ? "border-emerald-500/20 bg-emerald-500/5 text-emerald-400" : "border-amber-500/20 bg-amber-500/5 text-amber-400"}`}>
              {f.video_url.trim() ? <CheckCircle2 className="size-3.5 shrink-0" /> : <AlertTriangle className="size-3.5 shrink-0" />}
              {f.video_url.trim() ? "Video Added" : "Missing Video"}
            </span>
          </div>

          {/* 1. Product Images */}
          <div>
            <div className="mb-2 flex items-center gap-2 text-[10px] font-mono uppercase tracking-[0.2em] text-muted-foreground">
              <ImageIcon className="size-3.5 text-accent" /> Product Images
            </div>
            <ProductMediaGallery slug={slug} name={f.name} primaryUrl={primaryUrl}
              onPrimaryChange={(u) => setPrimaryUrl(u)} onCountChange={setImageCount} />
          </div>

          {/* 2. Product Video */}
          <div>
            <div className="mb-2 flex items-center gap-2 text-[10px] font-mono uppercase tracking-[0.2em] text-muted-foreground">
              <Film className="size-3.5 text-accent" /> Product Video
            </div>
            <ProductVideoUploader slug={slug} value={f.video_url} onChange={(u) => set({ video_url: u })} />
          </div>
        </div>
      </Collapsible>


      {/* Product information */}
      <Collapsible title="Product Information" icon={<Tag className="size-4" />} desc="Name, brand, type, category & tags">
        <div className="space-y-3">
          <Field label="Product Name" value={f.name} onChange={(v) => set({ name: v })} />
          <div className="grid grid-cols-2 gap-3">
            <Field label="Brand" value={f.brand} onChange={(v) => set({ brand: v })} />
            <Field label="Product Type" value={f.product_type} onChange={(v) => set({ product_type: v })} />
          </div>
          <CategorySelector value={f.categories} onChange={(v) => set({ categories: v, category: v[0] ?? "" })} />
          <Field label="Tags (comma separated)" value={f.tags} onChange={(v) => set({ tags: v })} />
        </div>
      </Collapsible>

      {/* Description */}
      <Collapsible title="Description" icon={<FileText className="size-4" />} desc="Rich text — headings, bold & lists">
        <RichTextEditor value={f.description} onChange={(v) => set({ description: v })} rows={7} />
      </Collapsible>

      {/* Features */}
      <Collapsible title="Features" icon={<ListChecks className="size-4" />} desc="Key selling points">
        <FeaturesBuilder value={f.features} onChange={(v) => set({ features: v })} />
      </Collapsible>

      {/* Specifications */}
      <Collapsible title="Specifications" icon={<Layers className="size-4" />} desc="Technical key/value details">
        <KeyValueBuilder rows={f.specs} onChange={(v) => set({ specs: v })}
          keyPlaceholder="e.g. Weight" valuePlaceholder="e.g. 150g" addLabel="Add Specification" />
      </Collapsible>

      {/* Attributes */}
      <Collapsible title="Attributes" icon={<Tag className="size-4" />} desc="Variant & buyer-facing attributes">
        <KeyValueBuilder rows={f.attrs} onChange={(v) => set({ attrs: v })}
          keyPlaceholder="e.g. Color" valuePlaceholder="e.g. Black" addLabel="Add Attribute" />
      </Collapsible>

      {/* FAQs */}
      <Collapsible title="Product FAQs" icon={<HelpCircle className="size-4" />} defaultOpen={false}
        desc="Add, edit, reorder & toggle buyer FAQs">
        <ProductFaqManager productSlug={slug} />
      </Collapsible>

      {/* Rating management */}
      <Collapsible title="Rating Management" icon={<Star className="size-4" />}
        desc="Star rating, review count & source"
        badge={
          <span className="inline-flex items-center gap-1 rounded-full bg-amber-500/15 px-1.5 py-0.5 text-[9px] font-mono uppercase tracking-wider text-amber-400">
            <Star className="size-2.5 fill-current" /> {(Number(f.rating) || 0).toFixed(1)}
          </span>
        }>
        <RatingManager f={f} set={set} />
      </Collapsible>



      {/* SEO center */}
      <Collapsible title="SEO Center" icon={<Search className="size-4" />} defaultOpen={false}
        desc="Search title, meta & keywords"
        badge={<span className={`rounded-full px-1.5 py-0.5 text-[9px] font-mono uppercase tracking-wider ${seoOk ? "bg-emerald-500/15 text-emerald-400" : "bg-amber-500/15 text-amber-400"}`}>{seoScore}/3</span>}>
        <div className="space-y-3">
          <button type="button" onClick={generateSeo}
            className="inline-flex items-center gap-1.5 rounded-full border border-accent/40 bg-accent/10 px-3.5 py-1.5 text-xs font-semibold text-accent transition-all hover:bg-accent/20 active:scale-[0.97]">
            <Sparkles className="size-3.5" /> Auto-generate SEO
          </button>
          <Field label="SEO Title" value={f.seo_title} onChange={(v) => set({ seo_title: v })} hint={`${f.seo_title.length}/60 characters`} />
          <div>
            <label className="mb-1.5 block text-[9px] font-mono uppercase tracking-[0.2em] text-muted-foreground">Meta Description</label>
            <textarea value={f.seo_description} rows={3} onChange={(e) => set({ seo_description: e.target.value })}
              className="w-full resize-y rounded-lg border border-white/10 bg-white/[0.03] px-3 py-2 text-sm focus:border-accent/40 focus:outline-none" />
            <p className="mt-1 text-[10px] text-muted-foreground">{f.seo_description.length}/160 characters</p>
          </div>
          <Field label="Keywords (comma separated)" value={f.keywords} onChange={(v) => set({ keywords: v })} />
          <div>
            <label className="mb-1.5 block text-[9px] font-mono uppercase tracking-[0.2em] text-muted-foreground">Canonical URL</label>
            <p className="truncate rounded-lg border border-white/10 bg-white/[0.02] px-3 py-2 text-xs text-muted-foreground">{canonical}</p>
          </div>
        </div>
      </Collapsible>

      {/* Health center */}
      <Collapsible title="Product Health Center" icon={<Activity className="size-4" />}
        desc={`${okCount}/${checks.length} checks passing`}
        badge={<span className={`rounded-full px-1.5 py-0.5 text-[9px] font-mono uppercase tracking-wider ${tone.t} bg-white/5`}>{score}%</span>}>
        <div className="space-y-3">
          <div className="h-2 w-full overflow-hidden rounded-full bg-white/5">
            <div className={`h-full rounded-full transition-all duration-500 ${tone.b}`} style={{ width: `${score}%` }} />
          </div>
          {warnings.length === 0 ? (
            <p className="flex items-center gap-2 rounded-lg border border-emerald-500/20 bg-emerald-500/5 px-3 py-2.5 text-xs text-emerald-400">
              <CheckCircle2 className="size-4" /> All health checks passing — this product is fully optimized.
            </p>
          ) : (
            <div className="space-y-1.5">
              {warnings.map((w) => (
                <div key={w.key} className="flex items-center gap-2 rounded-lg border border-amber-500/20 bg-amber-500/5 px-3 py-2 text-xs text-amber-300">
                  <AlertTriangle className="size-3.5 shrink-0" /> Missing {w.key}
                </div>
              ))}
            </div>
          )}
        </div>
      </Collapsible>
    </div>
  );
}
