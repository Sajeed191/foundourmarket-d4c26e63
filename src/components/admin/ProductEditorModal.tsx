import { useMemo, useRef, useState } from "react";
import { motion } from "framer-motion";
import {
  X, Upload, Loader2, Package, IndianRupee, DollarSign, AlertTriangle,
  Truck, Percent, RotateCcw, Eye, Sparkles, Boxes, Tag, HelpCircle,
  Smartphone, Monitor, ShoppingCart, Star,
} from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { logActivity } from "@/components/admin/AdminShell";
import { CollapsibleModule } from "@/components/admin/CollapsibleModule";
import { ProductFaqManager } from "@/components/admin/ProductFaqManager";
import { ProductBadgeManager } from "@/components/admin/ProductBadgeManager";
import { assignBadge } from "@/lib/use-product-badges";
import { useStoreSettings } from "@/lib/use-store-settings";
import { computeBadges, DEFAULT_BADGE_SETTINGS, MAX_CARD_BADGES } from "@/lib/badges";
import type { Product } from "@/lib/products";

/** Permissive snake_case row accepted from both /admin and /admin-products. */
export type ProductEditorRow = {
  id?: string; slug?: string; name?: string; tagline?: string | null; category?: string;
  price?: number | string; cost?: number | string; discount?: number | null;
  image?: string | null; description?: string | null; in_stock?: boolean; featured?: boolean;
  sku?: string | null; stock_quantity?: number; reserved_quantity?: number; low_stock_threshold?: number;
  rating?: number | string; reviews?: number; sort_order?: number;
  price_inr?: number | null; compare_price_inr?: number | null;
  price_usd?: number | null; compare_price_usd?: number | null;
  india_visible?: boolean; international_visible?: boolean;
  status?: string | null; tags?: string[] | null; features?: string[] | null;
  meta_keywords?: string[] | null; seo_title?: string | null; seo_description?: string | null;
  specifications?: Record<string, string> | null; attributes?: Record<string, string> | null;
  admin_notes?: string | null; bestseller?: boolean; trending?: boolean;
  scheduled_publish_at?: string | null;
  cost_price_inr?: number | null; cost_price_usd?: number | null;
  shipping_fee_inr?: number | null; shipping_fee_usd?: number | null;
  cod_enabled?: boolean; pickup_supported?: boolean; international_shipping?: boolean; fragile?: boolean;
  return_eligible?: boolean; replacement_eligible?: boolean; return_window_days?: number;
  warranty?: string | null;
  brand?: string | null; product_type?: string | null;
  weight?: number | null; length?: number | null; width?: number | null; height?: number | null;
  shipping_class?: string | null; video_url?: string | null; demo_url?: string | null;
  new_arrival?: boolean;
};

type Category = { slug: string; name: string; id?: string; parent_id?: string | null };

const inr = (v: number) =>
  new Intl.NumberFormat("en-IN", { style: "currency", currency: "INR", maximumFractionDigits: 0 }).format(v);
const usd = (v: number) =>
  new Intl.NumberFormat("en-US", { style: "currency", currency: "USD", maximumFractionDigits: 2 }).format(v);

function slugify(name: string) {
  return name.toLowerCase().trim().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "");
}
function parseList(text: string): string[] {
  return text.split(/[\n,]/).map((s) => s.trim()).filter(Boolean);
}
function kvToText(obj: Record<string, string> | null | undefined): string {
  if (!obj) return "";
  return Object.entries(obj).map(([k, v]) => `${k}: ${v}`).join("\n");
}
function textToKv(text: string): Record<string, string> {
  const out: Record<string, string> = {};
  for (const line of text.split("\n")) {
    const i = line.indexOf(":");
    if (i === -1) continue;
    const k = line.slice(0, i).trim();
    const v = line.slice(i + 1).trim();
    if (k) out[k] = v;
  }
  return out;
}

function EField({ label, value, onChange, type = "text", required, className }: {
  label: string; value: string; onChange: (v: string) => void; type?: string; required?: boolean; className?: string;
}) {
  return (
    <div className={className}>
      <label className="block text-[9px] font-mono uppercase tracking-[0.2em] text-muted-foreground mb-1.5">{label}{required && " *"}</label>
      <input type={type} value={value} required={required} onChange={(e) => onChange(e.target.value)}
        className="w-full bg-white/[0.03] border border-white/10 rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-accent/40" />
    </div>
  );
}

function Toggle({ checked, onChange, label }: { checked: boolean; onChange: (v: boolean) => void; label: string }) {
  return (
    <label className="flex items-center gap-2 text-sm">
      <input type="checkbox" checked={checked} onChange={(e) => onChange(e.target.checked)} className="accent-[var(--accent)]" />
      {label}
    </label>
  );
}

const COLLECTION_SUGGESTIONS = [
  "Electronics Collection", "Gaming Collection", "Summer Collection",
  "Gift Collection", "Fitness Collection", "Home & Living Collection",
  "Office Collection", "Travel Collection",
];

function CollectionsField({ value, onChange }: { value: string[]; onChange: (v: string[]) => void }) {
  const [query, setQuery] = useState("");
  const add = (c: string) => {
    const v = c.trim();
    if (!v || value.includes(v)) return;
    onChange([...value, v]);
    setQuery("");
  };
  const remove = (c: string) => onChange(value.filter((x) => x !== c));
  const matches = COLLECTION_SUGGESTIONS.filter(
    (c) => !value.includes(c) && c.toLowerCase().includes(query.toLowerCase()),
  );
  return (
    <div>
      <label className="block text-[9px] font-mono uppercase tracking-[0.2em] text-muted-foreground mb-1.5">Collections</label>
      {value.length > 0 && (
        <div className="flex flex-wrap gap-1.5 mb-2">
          {value.map((c) => (
            <span key={c} className="inline-flex items-center gap-1 rounded-full border border-accent/40 bg-accent/10 px-2.5 py-1 text-[11px] text-accent">
              {c}
              <button type="button" onClick={() => remove(c)} className="hover:text-foreground"><X className="size-3" /></button>
            </span>
          ))}
        </div>
      )}
      <input
        value={query}
        onChange={(e) => setQuery(e.target.value)}
        onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); add(query); } }}
        placeholder="Search or add a collection, press Enter…"
        className="w-full bg-white/[0.03] border border-white/10 rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-accent/40"
      />
      {query && matches.length > 0 && (
        <div className="mt-1.5 flex flex-wrap gap-1.5">
          {matches.map((c) => (
            <button key={c} type="button" onClick={() => add(c)}
              className="rounded-full border border-white/10 px-2.5 py-1 text-[11px] text-muted-foreground hover:border-accent/40 hover:text-accent">
              + {c}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

export function ProductEditorModal({ row, categories, nextSort, onClose, onSaved }: {
  row: ProductEditorRow | null; categories: Category[]; nextSort?: number; onClose: () => void; onSaved: () => void;
}) {
  const { settings } = useStoreSettings();
  const [saving, setSaving] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  // Pending badge assignments for a not-yet-saved product (flushed after insert).
  const [pendingBadges, setPendingBadges] = useState<string[]>([]);
  const [previewDevice, setPreviewDevice] = useState<"mobile" | "desktop">("mobile");
  const [tab, setTab] = useState<"basic" | "merch" | "seo" | "related" | "analytics" | "preview">("basic");



  // ---- Main category / subcategory hierarchy ----
  const initialCat = categories.find((c) => c.slug === (row?.category ?? ""));
  const initialMain = initialCat?.parent_id
    ? categories.find((c) => c.id === initialCat.parent_id)?.slug ?? ""
    : initialCat?.slug ?? "";
  const initialSub = initialCat?.parent_id ? initialCat.slug : "";
  const [mainCat, setMainCat] = useState(
    initialMain || categories.find((c) => !c.parent_id)?.slug || "",
  );
  const [subCat, setSubCat] = useState(initialSub);
  const mains = categories.filter((c) => !c.parent_id);
  const mainObj = categories.find((c) => c.slug === mainCat);
  const subs = mainObj ? categories.filter((c) => c.parent_id === mainObj.id) : [];
  const effectiveCategory = subCat || mainCat;

  const [form, setForm] = useState({
    slug: row?.slug ?? "", name: row?.name ?? "", tagline: row?.tagline ?? "",
    category: row?.category ?? categories[0]?.slug ?? "",
    price: row?.price != null ? String(row.price) : "0",
    cost: row?.cost != null ? String(row.cost) : "0",
    discount: row?.discount ?? (null as number | null),
    image: row?.image ?? "", description: row?.description ?? "",
    in_stock: row?.in_stock ?? true, featured: row?.featured ?? false,
    sku: row?.sku ?? "", stock_quantity: row?.stock_quantity ?? 0,
    low_stock_threshold: row?.low_stock_threshold ?? 5, sort_order: row?.sort_order ?? nextSort ?? 0,
    price_inr: row?.price_inr != null ? String(row.price_inr) : "",
    compare_price_inr: row?.compare_price_inr != null ? String(row.compare_price_inr) : "",
    price_usd: row?.price_usd != null ? String(row.price_usd) : "",
    compare_price_usd: row?.compare_price_usd != null ? String(row.compare_price_usd) : "",
    cost_price_inr: row?.cost_price_inr != null ? String(row.cost_price_inr) : "",
    cost_price_usd: row?.cost_price_usd != null ? String(row.cost_price_usd) : "",
    shipping_fee_inr: String(row?.shipping_fee_inr ?? 0),
    shipping_fee_usd: String(row?.shipping_fee_usd ?? 0),
    india_visible: row?.india_visible ?? true,
    international_visible: row?.international_visible ?? true,
    cod_enabled: row?.cod_enabled ?? true,
    pickup_supported: row?.pickup_supported ?? false,
    international_shipping: row?.international_shipping ?? true,
    fragile: row?.fragile ?? false,
    return_eligible: row?.return_eligible ?? true,
    replacement_eligible: row?.replacement_eligible ?? true,
    return_window_days: row?.return_window_days ?? 7,
    warranty: row?.warranty ?? "",
    status: row?.status ?? "published",
    bestseller: row?.bestseller ?? false,
    trending: row?.trending ?? false,
    new_arrival: row?.new_arrival ?? false,
    flash_deal: (row as any)?.flash_deal ?? false,
    staff_pick: (row as any)?.staff_pick ?? false,
    recommended: (row as any)?.recommended ?? false,
    homepage_hero: (row as any)?.homepage_hero ?? false,
    gift_idea: (row as any)?.gift_idea ?? false,
    premium: (row as any)?.premium ?? false,
    fast_selling: (row as any)?.fast_selling ?? false,
    editors_choice: (row as any)?.editors_choice ?? false,
    priority_score: (row as any)?.priority_score != null ? String((row as any).priority_score) : "",
    collections: ((row as any)?.collections ?? []) as string[],
    homepage_section: (row as any)?.homepage_section ?? "none",
    is_category_banner: (row as any)?.is_category_banner ?? false,
    hide_from_search: (row as any)?.hide_from_search ?? false,
    hide_from_recommendations: (row as any)?.hide_from_recommendations ?? false,
    homepage_position: (row as any)?.homepage_position != null ? String((row as any).homepage_position) : "",
    category_position: (row as any)?.category_position != null ? String((row as any).category_position) : "",
    featured_until: (row as any)?.featured_until
      ? new Date(new Date((row as any).featured_until).getTime() - new Date().getTimezoneOffset() * 60000)
          .toISOString().slice(0, 16)
      : "",
    scheduled_expiry_at: (row as any)?.scheduled_expiry_at
      ? new Date(new Date((row as any).scheduled_expiry_at).getTime() - new Date().getTimezoneOffset() * 60000)
          .toISOString().slice(0, 16)
      : "",
    related_products: ((row as any)?.related_products ?? []).join(", "),
    cross_sell_products: ((row as any)?.cross_sell_products ?? []).join(", "),
    upsell_products: ((row as any)?.upsell_products ?? []).join(", "),
    brand: row?.brand ?? "",
    product_type: row?.product_type ?? "",
    weight: row?.weight != null ? String(row.weight) : "",
    length: row?.length != null ? String(row.length) : "",
    width: row?.width != null ? String(row.width) : "",
    height: row?.height != null ? String(row.height) : "",
    shipping_class: row?.shipping_class ?? "",
    video_url: row?.video_url ?? "",
    demo_url: row?.demo_url ?? "",
    tags: (row?.tags ?? []).join(", "),
    features: (row?.features ?? []).join("\n"),
    meta_keywords: (row?.meta_keywords ?? []).join(", "),
    seo_title: row?.seo_title ?? "",
    seo_description: row?.seo_description ?? "",
    specifications: kvToText(row?.specifications),
    attributes: kvToText(row?.attributes),
    admin_notes: row?.admin_notes ?? "",
    scheduled_publish_at: row?.scheduled_publish_at
      ? new Date(new Date(row.scheduled_publish_at).getTime() - new Date().getTimezoneOffset() * 60000)
          .toISOString().slice(0, 16)
      : "",
  });

  const set = (patch: Partial<typeof form>) => setForm((f) => ({ ...f, ...patch }));

  async function uploadImage(file: File) {
    setUploading(true); setError(null);
    const ext = file.name.split(".").pop() ?? "jpg";
    const path = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}.${ext}`;
    const { error: upErr } = await supabase.storage.from("product-images").upload(path, file, { contentType: file.type });
    if (upErr) { setError(upErr.message); setUploading(false); return; }
    const { data } = supabase.storage.from("product-images").getPublicUrl(path);
    set({ image: data.publicUrl });
    setUploading(false);
  }

  const numOrNull = (v: string) => (v.trim() === "" ? null : Number(v));
  const priceInr = numOrNull(form.price_inr);
  const cmpInr = numOrNull(form.compare_price_inr);
  const priceUsd = numOrNull(form.price_usd);
  const cmpUsd = numOrNull(form.compare_price_usd);
  const costInr = numOrNull(form.cost_price_inr);
  const costUsd = numOrNull(form.cost_price_usd);

  const profitInr = priceInr != null && costInr != null ? priceInr - costInr : null;
  const marginInr = priceInr != null && priceInr > 0 && costInr != null ? Math.round(((priceInr - costInr) / priceInr) * 100) : null;
  const profitUsd = priceUsd != null && costUsd != null ? priceUsd - costUsd : null;
  const marginUsd = priceUsd != null && priceUsd > 0 && costUsd != null ? Math.round(((priceUsd - costUsd) / priceUsd) * 100) : null;

  const validation = useMemo(() => {
    const errs: string[] = [];
    if (form.india_visible && (priceInr == null || priceInr <= 0)) errs.push("India is visible but the INR price is missing or zero.");
    if (form.international_visible && (priceUsd == null || priceUsd <= 0)) errs.push("International is visible but the USD price is missing or zero.");
    if (!form.india_visible && !form.international_visible) errs.push("Product is hidden in both regions — it won't appear in any storefront.");
    if (cmpInr != null && priceInr != null && cmpInr <= priceInr) errs.push("INR compare-at price must be higher than the selling price.");
    if (cmpUsd != null && priceUsd != null && cmpUsd <= priceUsd) errs.push("USD compare-at price must be higher than the selling price.");
    return errs;
  }, [form.india_visible, form.international_visible, priceInr, cmpInr, priceUsd, cmpUsd]);

  // ---- Product Health (Phase 3) ----
  const health = useMemo(() => {
    const checks: { label: string; ok: boolean }[] = [
      { label: "Images", ok: !!form.image.trim() },
      { label: "Description", ok: form.description.trim().length >= 20 },
      { label: "SEO", ok: !!form.seo_title.trim() && !!form.seo_description.trim() },
      { label: "Pricing", ok: (priceInr ?? 0) > 0 || (priceUsd ?? 0) > 0 || Number(form.price) > 0 },
      { label: "Inventory", ok: Number(form.stock_quantity) > 0 || form.status === "preorder" },
      { label: "Category", ok: !!effectiveCategory },
      {
        label: "Storefront Placement",
        ok:
          form.featured || form.trending || form.bestseller || form.new_arrival ||
          form.flash_deal || form.staff_pick || form.recommended || form.homepage_hero ||
          form.premium || form.fast_selling || form.editors_choice ||
          (form.homepage_section !== "none" && !!form.homepage_section),
      },
    ];
    const score = Math.round((checks.filter((c) => c.ok).length / checks.length) * 100);
    const status =
      score >= 90 ? "Excellent" : score >= 70 ? "Good" : score >= 50 ? "Needs Attention" : "Critical";
    const tone =
      score >= 90 ? "text-emerald-400 border-emerald-400/40 bg-emerald-400/10"
        : score >= 70 ? "text-accent border-accent/40 bg-accent/10"
        : score >= 50 ? "text-amber-400 border-amber-400/40 bg-amber-400/10"
        : "text-destructive border-destructive/40 bg-destructive/10";
    return { checks, score, status, tone };
  }, [
    form.image, form.description, form.seo_title, form.seo_description, form.price,
    form.stock_quantity, form.status, effectiveCategory, priceInr, priceUsd,
    form.featured, form.trending, form.bestseller, form.new_arrival, form.flash_deal,
    form.staff_pick, form.recommended, form.homepage_hero, form.premium, form.fast_selling,
    form.editors_choice, form.homepage_section,
  ]);

  async function save(e: React.FormEvent) {
    e.preventDefault();
    if (validation.length) { setError(validation[0]); return; }
    if (!mainCat) { setError("Select a main category."); return; }
    if (subs.length > 0 && !subCat) { setError("This category has subcategories — selecting a subcategory is required."); return; }
    setSaving(true); setError(null);
    const payload = {
      slug: form.slug.trim() || slugify(form.name), name: form.name.trim(),
      tagline: form.tagline.trim() || null, category: effectiveCategory,
      price: Number(form.price) || 0, cost: Number(form.cost) || 0,
      discount: form.discount ? Number(form.discount) : null,
      image: form.image.trim() || null, description: form.description.trim() || null,
      in_stock: form.in_stock, featured: form.featured, sku: form.sku.trim() || null,
      stock_quantity: Number(form.stock_quantity) || 0, low_stock_threshold: Number(form.low_stock_threshold) || 0,
      sort_order: Number(form.sort_order) || 0,
      price_inr: priceInr, compare_price_inr: cmpInr, price_usd: priceUsd, compare_price_usd: cmpUsd,
      cost_price_inr: costInr, cost_price_usd: costUsd,
      shipping_fee_inr: Number(form.shipping_fee_inr) || 0, shipping_fee_usd: Number(form.shipping_fee_usd) || 0,
      india_visible: form.india_visible, international_visible: form.international_visible,
      cod_enabled: form.cod_enabled, pickup_supported: form.pickup_supported,
      international_shipping: form.international_shipping, fragile: form.fragile,
      return_eligible: form.return_eligible, replacement_eligible: form.replacement_eligible,
      return_window_days: Number(form.return_window_days) || 0, warranty: form.warranty.trim(),
      status: form.status, bestseller: form.bestseller, trending: form.trending,
      new_arrival: form.new_arrival,
      flash_deal: form.flash_deal, staff_pick: form.staff_pick, recommended: form.recommended,
      homepage_hero: form.homepage_hero, gift_idea: form.gift_idea,
      premium: form.premium, fast_selling: form.fast_selling, editors_choice: form.editors_choice,
      priority_score: numOrNull(form.priority_score),
      collections: form.collections,
      homepage_section: form.homepage_section === "none" ? null : form.homepage_section,
      is_category_banner: form.is_category_banner,
      hide_from_search: form.hide_from_search, hide_from_recommendations: form.hide_from_recommendations,
      homepage_position: numOrNull(form.homepage_position),
      category_position: numOrNull(form.category_position),
      featured_until: form.featured_until ? new Date(form.featured_until).toISOString() : null,
      scheduled_expiry_at: form.scheduled_expiry_at ? new Date(form.scheduled_expiry_at).toISOString() : null,
      related_products: parseList(form.related_products),
      cross_sell_products: parseList(form.cross_sell_products),
      upsell_products: parseList(form.upsell_products),
      brand: form.brand.trim() || null, product_type: form.product_type.trim() || null,
      weight: numOrNull(form.weight), length: numOrNull(form.length),
      width: numOrNull(form.width), height: numOrNull(form.height),
      shipping_class: form.shipping_class.trim() || null,
      video_url: form.video_url.trim() || null, demo_url: form.demo_url.trim() || null,
      tags: parseList(form.tags), features: parseList(form.features), meta_keywords: parseList(form.meta_keywords),
      seo_title: form.seo_title.trim() || null, seo_description: form.seo_description.trim() || null,
      specifications: textToKv(form.specifications), attributes: textToKv(form.attributes),
      admin_notes: form.admin_notes.trim() || null,
      scheduled_publish_at: form.scheduled_publish_at ? new Date(form.scheduled_publish_at).toISOString() : null,
    };
    const { error: err } = row?.id
      ? await supabase.from("products").update(payload).eq("id", row.id)
      : await supabase.from("products").insert(payload);
    if (err) { setSaving(false); setError(err.message); return; }
    // Flush pending badge assignments for a newly created product (in priority order).
    if (!row?.id && pendingBadges.length) {
      try {
        for (const id of pendingBadges) await assignBadge(payload.slug, id);
      } catch { /* non-fatal: product is saved, badges can be retried in editor */ }
    }
    setSaving(false);
    logActivity(row?.id ? "product_updated" : "product_created", "product", row?.id, { slug: payload.slug });
    toast.success(row?.id ? "Product updated" : "Product created");
    onSaved();
  }

  return (
    <div className="fixed inset-0 z-50 grid place-items-end sm:place-items-center bg-black/70 backdrop-blur-sm p-0 sm:p-4" onClick={onClose}>
      <motion.form
        initial={{ y: 40, opacity: 0 }} animate={{ y: 0, opacity: 1 }}
        onSubmit={save} onClick={(e) => e.stopPropagation()}
        className="w-full max-w-2xl glass-strong border border-white/10 rounded-t-3xl sm:rounded-3xl p-4 sm:p-5 max-h-[94vh] overflow-y-auto space-y-3"
      >
        <div className="sticky top-0 z-20 -mx-4 sm:-mx-5 px-4 sm:px-5 pt-2 pb-2 bg-background/90 backdrop-blur space-y-2">
          <div className="flex justify-between items-center">
            <h2 className="text-lg font-display">{row?.id ? "Edit product" : "New product"}</h2>
            <button type="button" onClick={onClose} className="size-8 grid place-items-center rounded-full hover:bg-white/5"><X className="size-4" /></button>
          </div>
          <div className="flex gap-1 overflow-x-auto -mx-1 px-1">
            {([
              ["basic", "Basic Information"],
              ["merch", "Merchandising"],
              ["seo", "SEO"],
              ["related", "Related"],
              ["analytics", "Analytics"],
              ["preview", "Preview"],
            ] as const).map(([id, label]) => (
              <button key={id} type="button" onClick={() => setTab(id)}
                className={`shrink-0 whitespace-nowrap rounded-lg px-3 py-1.5 text-xs font-medium transition-colors ${tab === id ? "bg-accent/15 text-accent border border-accent/40" : "text-muted-foreground border border-transparent hover:bg-white/5"}`}>
                {label}
              </button>
            ))}
          </div>
        </div>

        {/* Product Health (Phase 3) */}
        <div className={`rounded-2xl border p-3 flex items-center gap-4 ${health.tone}`}>
          <div className="flex flex-col items-center justify-center shrink-0 pr-3 border-r border-white/10">
            <span className="text-2xl font-display font-semibold tabular-nums leading-none">{health.score}%</span>
            <span className="mt-1 text-[9px] font-mono uppercase tracking-[0.2em]">{health.status}</span>
          </div>
          <div className="flex flex-wrap gap-1.5">
            {health.checks.map((c) => (
              <span key={c.label} className={`inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-[10px] ${c.ok ? "border-emerald-400/40 text-emerald-300" : "border-white/10 text-muted-foreground"}`}>
                <span className={`size-1.5 rounded-full ${c.ok ? "bg-emerald-400" : "bg-muted-foreground/40"}`} />{c.label}
              </span>
            ))}
          </div>
        </div>

        {tab === "basic" && (<>
        {/* Image */}
        <div className="flex gap-3 items-start">
          <div className="size-20 rounded-xl overflow-hidden bg-white/5 border border-white/10 shrink-0 grid place-items-center">
            {form.image ? <img src={form.image} alt="" className="w-full h-full object-cover" /> : <Package className="size-5 text-muted-foreground" />}
          </div>
          <div className="flex-1 space-y-2">
            <input value={form.image} onChange={(e) => set({ image: e.target.value })} placeholder="Image URL or upload"
              className="w-full bg-white/[0.03] border border-white/10 rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-accent/40" />
            <button type="button" onClick={() => fileRef.current?.click()} disabled={uploading}
              className="inline-flex items-center gap-2 px-3 py-2 rounded-lg border border-white/10 text-[10px] font-mono uppercase tracking-widest hover:bg-white/5 disabled:opacity-50">
              {uploading ? <Loader2 className="size-3 animate-spin" /> : <Upload className="size-3" />} {uploading ? "Uploading…" : "Upload"}
            </button>
            <input ref={fileRef} type="file" accept="image/*" className="hidden" onChange={(e) => { const f = e.target.files?.[0]; if (f) uploadImage(f); }} />
          </div>
        </div>
        </>)}

        {tab === "preview" && (<>
        {/* Live Storefront Preview */}
        <CollapsibleModule eyebrow="Live" title="Storefront Preview" badge={<Eye className="size-3.5 text-accent" />}>
          {(() => {
            const sell = priceInr ?? (Number(form.price) || 0);
            const compare = cmpInr;
            const pctOff = compare != null && compare > sell && sell > 0
              ? Math.round(((compare - sell) / compare) * 100)
              : (form.discount ? Number(form.discount) : 0);
            const fmt = (v: number) => inr(v);
            const previewProduct = {
              slug: form.slug, name: form.name, image: form.image,
              price: sell, priceInr: sell, comparePriceInr: compare,
              discount: pctOff || undefined,
              rating: Number((row as any)?.rating ?? 4.8),
              reviews: Number((row as any)?.reviews ?? 0),
              stockQuantity: Number(form.stock_quantity) || 0,
              createdAt: (row as any)?.created_at ?? new Date().toISOString(),
              soldCount: Number((row as any)?.sold_count ?? 0),
              viewsCount: Number((row as any)?.views_count ?? 0),
              wishlistCount: Number((row as any)?.wishlist_count ?? 0),
              trending: form.trending, bestseller: form.bestseller, newArrival: form.new_arrival,
              hotDeal: false, flashDeal: form.flash_deal, staffPick: form.staff_pick,
              giftIdea: form.gift_idea, recommended: form.recommended, homepageHero: form.homepage_hero,
              premium: false, fastSelling: false, editorsChoice: false,
            } as unknown as Product;
            const badges = computeBadges(previewProduct, DEFAULT_BADGE_SETTINGS, MAX_CARD_BADGES);
            const cardWidth = previewDevice === "mobile" ? "w-44" : "w-64";

            return (
              <div className="space-y-3">
                <div className="flex items-center gap-2">
                  <button type="button" onClick={() => setPreviewDevice("mobile")}
                    className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg border text-[10px] font-mono uppercase tracking-widest ${previewDevice === "mobile" ? "border-accent/40 bg-accent/10 text-accent" : "border-white/10 text-muted-foreground hover:bg-white/5"}`}>
                    <Smartphone className="size-3" /> Mobile
                  </button>
                  <button type="button" onClick={() => setPreviewDevice("desktop")}
                    className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg border text-[10px] font-mono uppercase tracking-widest ${previewDevice === "desktop" ? "border-accent/40 bg-accent/10 text-accent" : "border-white/10 text-muted-foreground hover:bg-white/5"}`}>
                    <Monitor className="size-3" /> Desktop
                  </button>
                  <span className="ml-auto text-[10px] text-muted-foreground">Exactly as buyers see it</span>
                </div>

                <div className="grid place-items-center rounded-2xl border border-white/10 bg-gradient-to-b from-white/[0.04] to-transparent p-5">
                  <div className={`${cardWidth} max-w-full rounded-2xl overflow-hidden border border-white/10 bg-card shadow-[var(--shadow-ember)]`}>
                    <div className="relative aspect-square bg-white/5 grid place-items-center overflow-hidden">
                      {form.image
                        ? <img src={form.image} alt={form.name} className="w-full h-full object-cover" />
                        : <Package className="size-8 text-muted-foreground" />}
                      <div className="absolute top-2 left-2 flex flex-col gap-1 items-start">
                        {badges.map((b) => (
                          <span key={b.key} className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[9px] font-semibold ${b.className}`}>
                            <span>{b.emoji}</span>{b.label}
                          </span>
                        ))}
                      </div>
                      {pctOff > 0 && (
                        <span className="absolute top-2 right-2 rounded-full bg-destructive px-2 py-0.5 text-[10px] font-bold text-destructive-foreground">
                          -{pctOff}%
                        </span>
                      )}
                    </div>
                    <div className="p-3 space-y-1.5">
                      <h4 className="text-sm font-medium leading-tight line-clamp-2">{form.name || "Product name"}</h4>
                      <div className="flex items-center gap-1 text-[10px] text-muted-foreground">
                        <Star className="size-3 fill-amber-400 text-amber-400" />
                        {Number((row as any)?.rating ?? 4.8).toFixed(1)}
                        <span>·</span>
                        <span>{Number((row as any)?.reviews ?? 0)} reviews</span>
                      </div>
                      <div className="flex items-baseline gap-2">
                        <span className="text-base font-semibold text-foreground">{fmt(sell)}</span>
                        {compare != null && compare > sell && (
                          <span className="text-xs text-muted-foreground line-through">{fmt(compare)}</span>
                        )}
                      </div>
                      <button type="button" disabled
                        className="w-full mt-1 inline-flex items-center justify-center gap-1.5 rounded-xl bg-gradient-to-r from-accent to-primary text-accent-foreground text-xs font-medium py-2">
                        <ShoppingCart className="size-3.5" /> Add to Cart
                      </button>
                    </div>
                  </div>
                </div>
              </div>
            );
          })()}
        </CollapsibleModule>
        </>)}



        {tab === "basic" && (<>
        {/* Product Basics */}
        <CollapsibleModule eyebrow="Step 1" title="Product Basics" badge={<Tag className="size-3.5 text-accent" />}>
          <div className="grid grid-cols-2 gap-3">
            <EField label="Name" required value={form.name} onChange={(v) => set({ name: v, slug: form.slug || slugify(v) })} className="col-span-2" />
            <div className="col-span-2 flex gap-2">
              <div className="flex-1"><EField label="Slug" value={form.slug} onChange={(v) => set({ slug: v })} /></div>
              <button type="button" onClick={() => set({ slug: slugify(form.name) })} className="self-end mb-0.5 px-3 py-2 rounded-lg border border-white/10 text-[10px] font-mono uppercase tracking-widest hover:bg-white/5">Auto</button>
            </div>
            <EField label="Tagline" value={form.tagline} onChange={(v) => set({ tagline: v })} className="col-span-2" />
            <div>
              <label className="block text-[9px] font-mono uppercase tracking-[0.2em] text-muted-foreground mb-1.5">Main Category</label>
              <select value={mainCat} onChange={(e) => { setMainCat(e.target.value); setSubCat(""); }} className="filter-select">
                {mains.map((c) => <option key={c.slug} value={c.slug} className="bg-background">{c.name}</option>)}
              </select>
            </div>
            {subs.length > 0 && (
              <div>
                <label className="block text-[9px] font-mono uppercase tracking-[0.2em] text-muted-foreground mb-1.5">
                  Subcategory <span className="text-accent">*</span>
                </label>
                <select value={subCat} onChange={(e) => setSubCat(e.target.value)} className="filter-select">
                  <option value="" className="bg-background">Select subcategory…</option>
                  {subs.map((c) => <option key={c.slug} value={c.slug} className="bg-background">{c.name}</option>)}
                </select>
              </div>
            )}
            <EField label="SKU" value={form.sku} onChange={(v) => set({ sku: v })} />
            <EField label="Brand" value={form.brand} onChange={(v) => set({ brand: v })} />
            <EField label="Product Type" value={form.product_type} onChange={(v) => set({ product_type: v })} />
            <EField label="Product Tags (comma separated)" value={form.tags} onChange={(v) => set({ tags: v })} className="col-span-2" />
            <div className="col-span-2">
              <label className="block text-[9px] font-mono uppercase tracking-[0.2em] text-muted-foreground mb-1.5">Description</label>
              <textarea value={form.description} onChange={(e) => set({ description: e.target.value })} rows={3}
                className="w-full bg-white/[0.03] border border-white/10 rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-accent/40" />
            </div>
          </div>
        </CollapsibleModule>

        {/* Pricing & Margins */}
        <CollapsibleModule eyebrow="Step 2" title="Pricing & Margins" badge={<Percent className="size-3.5 text-accent" />}>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            {/* India */}
            <div className={`rounded-2xl border p-3.5 space-y-3 ${form.india_visible ? "border-accent/30 bg-accent/[0.04]" : "border-white/10 bg-white/[0.02] opacity-70"}`}>
              <span className="inline-flex items-center gap-1.5 text-sm font-display"><IndianRupee className="size-3.5 text-accent" /> India · INR</span>
              <div className="grid grid-cols-2 gap-2">
                <EField label="Selling Price ₹" type="number" value={form.price_inr} onChange={(v) => set({ price_inr: v })} />
                <EField label="Compare At ₹" type="number" value={form.compare_price_inr} onChange={(v) => set({ compare_price_inr: v })} />
                <EField label="Cost Price ₹" type="number" value={form.cost_price_inr} onChange={(v) => set({ cost_price_inr: v })} className="col-span-2" />
              </div>
              <div className="flex items-center justify-between text-[11px] font-mono">
                <span className="text-muted-foreground">Profit: <span className="text-foreground">{profitInr != null ? inr(profitInr) : "—"}</span></span>
                <span className={marginInr != null && marginInr < 0 ? "text-destructive" : "text-emerald-400"}>Margin: {marginInr != null ? `${marginInr}%` : "—"}</span>
              </div>
            </div>
            {/* International */}
            <div className={`rounded-2xl border p-3.5 space-y-3 ${form.international_visible ? "border-accent/30 bg-accent/[0.04]" : "border-white/10 bg-white/[0.02] opacity-70"}`}>
              <span className="inline-flex items-center gap-1.5 text-sm font-display"><DollarSign className="size-3.5 text-accent" /> International · USD</span>
              <div className="grid grid-cols-2 gap-2">
                <EField label="Selling Price $" type="number" value={form.price_usd} onChange={(v) => set({ price_usd: v })} />
                <EField label="Compare At $" type="number" value={form.compare_price_usd} onChange={(v) => set({ compare_price_usd: v })} />
                <EField label="Cost Price $" type="number" value={form.cost_price_usd} onChange={(v) => set({ cost_price_usd: v })} className="col-span-2" />
              </div>
              <div className="flex items-center justify-between text-[11px] font-mono">
                <span className="text-muted-foreground">Profit: <span className="text-foreground">{profitUsd != null ? usd(profitUsd) : "—"}</span></span>
                <span className={marginUsd != null && marginUsd < 0 ? "text-destructive" : "text-emerald-400"}>Margin: {marginUsd != null ? `${marginUsd}%` : "—"}</span>
              </div>
            </div>
          </div>
        </CollapsibleModule>

        {/* Inventory */}
        <CollapsibleModule eyebrow="Step 3" title="Inventory" badge={<Boxes className="size-3.5 text-accent" />}>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <EField label="Stock qty" type="number" value={String(form.stock_quantity)} onChange={(v) => set({ stock_quantity: Number(v) || 0 })} />
            <EField label="Low stock threshold" type="number" value={String(form.low_stock_threshold)} onChange={(v) => set({ low_stock_threshold: Number(v) || 0 })} />
            <EField label="Sort order" type="number" value={String(form.sort_order)} onChange={(v) => set({ sort_order: Number(v) || 0 })} />
            <div>
              <label className="block text-[9px] font-mono uppercase tracking-[0.2em] text-muted-foreground mb-1.5">Status</label>
              <select value={form.status} onChange={(e) => set({ status: e.target.value })} className="filter-select">
                {["published", "draft", "hidden", "archived", "scheduled", "preorder", "out_of_stock"].map((s) => (
                  <option key={s} value={s} className="bg-background">{s.replace(/_/g, " ")}</option>
                ))}
              </select>
            </div>
            <div className="sm:col-span-2 flex flex-wrap gap-4 rounded-xl border border-white/10 bg-white/[0.02] p-3">
              <Toggle checked={form.in_stock} onChange={(v) => set({ in_stock: v })} label="Active / In stock" />
            </div>
          </div>
        </CollapsibleModule>

        {/* Shipping */}
        <CollapsibleModule eyebrow="Step 4" title="Shipping" badge={<Truck className="size-3.5 text-accent" />}>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <EField label="India Shipping Charge ₹" type="number" value={form.shipping_fee_inr} onChange={(v) => set({ shipping_fee_inr: v })} />
            <EField label="International Shipping Charge $" type="number" value={form.shipping_fee_usd} onChange={(v) => set({ shipping_fee_usd: v })} />
            <div className="rounded-lg border border-white/10 bg-white/[0.02] px-3 py-2">
              <p className="text-[9px] font-mono uppercase tracking-[0.2em] text-muted-foreground">Free Shipping Above (India)</p>
              <p className="text-sm mt-1">{settings.free_shipping_threshold_inr != null ? inr(settings.free_shipping_threshold_inr) : "Not set"}</p>
            </div>
            <div className="rounded-lg border border-white/10 bg-white/[0.02] px-3 py-2">
              <p className="text-[9px] font-mono uppercase tracking-[0.2em] text-muted-foreground">Free Shipping Above (Intl)</p>
              <p className="text-sm mt-1">{settings.free_shipping_threshold_usd != null ? usd(settings.free_shipping_threshold_usd) : "Not set"}</p>
            </div>
            <p className="sm:col-span-2 text-[10px] text-muted-foreground">Free-shipping thresholds are global and managed in Store Settings → keeps a single source of truth across the platform.</p>
            <EField label="Weight (kg)" type="number" value={form.weight} onChange={(v) => set({ weight: v })} />
            <EField label="Shipping Class" value={form.shipping_class} onChange={(v) => set({ shipping_class: v })} />
            <EField label="Length (cm)" type="number" value={form.length} onChange={(v) => set({ length: v })} />
            <EField label="Width (cm)" type="number" value={form.width} onChange={(v) => set({ width: v })} />
            <EField label="Height (cm)" type="number" value={form.height} onChange={(v) => set({ height: v })} className="sm:col-span-2" />
            <div className="sm:col-span-2 flex flex-wrap gap-4 rounded-xl border border-white/10 bg-white/[0.02] p-3">
              <Toggle checked={form.cod_enabled} onChange={(v) => set({ cod_enabled: v })} label="COD" />
              <Toggle checked={form.pickup_supported} onChange={(v) => set({ pickup_supported: v })} label="Pickup" />
              <Toggle checked={form.international_shipping} onChange={(v) => set({ international_shipping: v })} label="International Shipping" />
              <Toggle checked={form.fragile} onChange={(v) => set({ fragile: v })} label="Fragile Product" />
            </div>
          </div>
        </CollapsibleModule>

        {/* Returns & Warranty */}
        <CollapsibleModule eyebrow="Step 5" title="Returns & Warranty" badge={<RotateCcw className="size-3.5 text-accent" />} defaultOpen={false}>
          <div className="grid grid-cols-2 gap-3">
            <EField label="Return window (days)" type="number" value={String(form.return_window_days)} onChange={(v) => set({ return_window_days: Number(v) || 0 })} />
            <EField label="Warranty" value={form.warranty} onChange={(v) => set({ warranty: v })} />
            <div className="col-span-2 flex flex-wrap gap-4 rounded-xl border border-white/10 bg-white/[0.02] p-3">
              <Toggle checked={form.return_eligible} onChange={(v) => set({ return_eligible: v })} label="Return eligible" />
              <Toggle checked={form.replacement_eligible} onChange={(v) => set({ replacement_eligible: v })} label="Replacement eligible" />
            </div>
          </div>
        </CollapsibleModule>
        </>)}

        {tab === "merch" && (<>
        {/* Visibility & Merchandising */}
        <CollapsibleModule eyebrow="Step 6" title="Visibility & Merchandising" badge={<Eye className="size-3.5 text-accent" />}>
          <div className="space-y-3">
            <div className="flex flex-wrap gap-4 rounded-xl border border-white/10 bg-white/[0.02] p-3">
              <Toggle checked={form.india_visible} onChange={(v) => set({ india_visible: v })} label="India Visibility" />
              <Toggle checked={form.international_visible} onChange={(v) => set({ international_visible: v })} label="International Visibility" />
              <Toggle checked={form.featured} onChange={(v) => set({ featured: v })} label="Featured" />
              <Toggle checked={form.status === "hidden"} onChange={(v) => set({ status: v ? "hidden" : "published" })} label="Hidden" />
              <Toggle checked={form.bestseller} onChange={(v) => set({ bestseller: v })} label="Bestseller" />
              <Toggle checked={form.trending} onChange={(v) => set({ trending: v })} label="Trending" />
              <Toggle checked={form.new_arrival} onChange={(v) => set({ new_arrival: v })} label="New Arrival" />
              <Toggle checked={form.flash_deal} onChange={(v) => set({ flash_deal: v })} label="Flash Deal" />
              <Toggle checked={form.staff_pick} onChange={(v) => set({ staff_pick: v })} label="Staff Pick" />
              <Toggle checked={form.recommended} onChange={(v) => set({ recommended: v })} label="Recommended" />
              <Toggle checked={form.gift_idea} onChange={(v) => set({ gift_idea: v })} label="Gift Idea" />
            </div>
            <p className="text-[10px] text-muted-foreground">Premium and Fast Selling labels are generated automatically from analytics and pricing.</p>
          </div>
        </CollapsibleModule>

        {/* Storefront Placement */}
        <CollapsibleModule eyebrow="Step 6b" title="Storefront Placement" badge={<Sparkles className="size-3.5 text-accent" />}>
          <div className="space-y-3">
            <p className="text-[10px] text-muted-foreground">
              Manual toggles act as a <span className="text-accent font-medium">Force On</span> override — when enabled the product
              appears in that section regardless of analytics. Automatic calculation stays active for products left off.
            </p>
            <div className="grid grid-cols-2 gap-3 rounded-xl border border-white/10 bg-white/[0.02] p-3 sm:grid-cols-3">
              <Toggle checked={form.featured} onChange={(v) => set({ featured: v })} label="Featured" />
              <Toggle checked={form.trending} onChange={(v) => set({ trending: v })} label="Trending" />
              <Toggle checked={form.bestseller} onChange={(v) => set({ bestseller: v })} label="Best Seller" />
              <Toggle checked={form.new_arrival} onChange={(v) => set({ new_arrival: v })} label="New Arrival" />
              <Toggle checked={form.premium} onChange={(v) => set({ premium: v })} label="Premium" />
              <Toggle checked={form.fast_selling} onChange={(v) => set({ fast_selling: v })} label="Fast Selling" />
              <Toggle checked={form.editors_choice} onChange={(v) => set({ editors_choice: v })} label="Editor's Choice" />
              <Toggle checked={form.flash_deal} onChange={(v) => set({ flash_deal: v })} label="Flash Deal" />
              <Toggle checked={form.staff_pick} onChange={(v) => set({ staff_pick: v })} label="Staff Pick" />
              <Toggle checked={form.recommended} onChange={(v) => set({ recommended: v })} label="Recommended" />
              <Toggle checked={form.homepage_hero} onChange={(v) => set({ homepage_hero: v })} label="Homepage Hero" />
            </div>

            {/* Homepage section + priority */}
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              <div>
                <label className="block text-[9px] font-mono uppercase tracking-[0.2em] text-muted-foreground mb-1.5">Homepage Section</label>
                <select value={form.homepage_section} onChange={(e) => set({ homepage_section: e.target.value })} className="filter-select w-full">
                  <option value="none">None</option>
                  <option value="featured">Featured Products</option>
                  <option value="trending">Trending Products</option>
                  <option value="bestseller">Best Sellers</option>
                  <option value="new_arrival">New Arrivals</option>
                  <option value="staff_pick">Staff Picks</option>
                  <option value="flash_deal">Flash Deals</option>
                  <option value="recommended">Recommended</option>
                  <option value="home_hero">Home Hero</option>
                  <option value="category_banner">Category Banner</option>
                </select>
              </div>
              <div>
                <EField label="Priority Score (1-100)" type="number" value={form.priority_score} onChange={(v) => set({ priority_score: v })} />
                <p className="mt-1 text-[10px] text-muted-foreground">Higher priority products appear before lower priority products within the same section.</p>
              </div>
            </div>

            {/* Collections searchable multi-select */}
            <CollectionsField value={form.collections} onChange={(v) => set({ collections: v })} />

            <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
              <EField label="Homepage Position" type="number" value={form.homepage_position} onChange={(v) => set({ homepage_position: v })} />
              <EField label="Category Position" type="number" value={form.category_position} onChange={(v) => set({ category_position: v })} />
              <EField label="Featured Until" type="datetime-local" value={form.featured_until} onChange={(v) => set({ featured_until: v })} />
            </div>
            <div className="flex flex-wrap gap-4 rounded-xl border border-white/10 bg-white/[0.02] p-3">
              <Toggle checked={form.is_category_banner} onChange={(v) => set({ is_category_banner: v })} label="Category Banner" />
              <Toggle checked={form.hide_from_search} onChange={(v) => set({ hide_from_search: v })} label="Hide From Search" />
              <Toggle checked={form.hide_from_recommendations} onChange={(v) => set({ hide_from_recommendations: v })} label="Hide From Recommendations" />
            </div>
          </div>
        </CollapsibleModule>

        {/* Publishing */}
        <CollapsibleModule eyebrow="Step 6c" title="Publishing" badge={<Eye className="size-3.5 text-accent" />} defaultOpen={false}>
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
            <div>
              <label className="block text-[9px] font-mono uppercase tracking-[0.2em] text-muted-foreground mb-1.5">Status</label>
              <select value={form.status} onChange={(e) => set({ status: e.target.value })} className="filter-select w-full">
                <option value="draft">Draft</option>
                <option value="published">Active</option>
                <option value="scheduled">Scheduled</option>
                <option value="out_of_stock">Out Of Stock</option>
                <option value="archived">Archived</option>
              </select>
            </div>
            <EField label="Publish Date" type="datetime-local" value={form.scheduled_publish_at} onChange={(v) => set({ scheduled_publish_at: v })} />
            <EField label="Expiry Date" type="datetime-local" value={form.scheduled_expiry_at} onChange={(v) => set({ scheduled_expiry_at: v })} />
          </div>
        </CollapsibleModule>

        </>)}

        {tab === "related" && (<>
        {/* Related products */}
        <CollapsibleModule eyebrow="Step 6d" title="Related Product Management" badge={<Tag className="size-3.5 text-accent" />} defaultOpen={false}>
          <div className="space-y-3">
            <EField label="Related Products (comma-separated slugs)" value={form.related_products} onChange={(v) => set({ related_products: v })} />
            <EField label="Cross Sell Products (comma-separated slugs)" value={form.cross_sell_products} onChange={(v) => set({ cross_sell_products: v })} />
            <EField label="Upsell Products (comma-separated slugs)" value={form.upsell_products} onChange={(v) => set({ upsell_products: v })} />
          </div>
        </CollapsibleModule>
        </>)}

        {tab === "merch" && (<>
        {/* Product Labels */}
        <CollapsibleModule eyebrow="Step 6e" title="Product Labels" badge={<Tag className="size-3.5 text-accent" />} defaultOpen={false}>
          <div className="space-y-3">
            <div className="flex flex-wrap gap-4 rounded-xl border border-white/10 bg-white/[0.02] p-3">
              <Toggle checked={form.gift_idea} onChange={(v) => set({ gift_idea: v })} label="Gift Idea" />
            </div>
            {(() => {
              const rating = Number((row as any)?.rating ?? 0);
              const reviews = Number((row as any)?.reviews ?? 0);
              const priceRef = Number((row as any)?.price_inr ?? (row as any)?.price ?? 0);
              const premiumAuto = (rating >= 4.7 && reviews >= 25) || priceRef >= 9999;
              const sold = Number((row as any)?.sold_count ?? 0);
              const created = (row as any)?.created_at ? new Date((row as any).created_at).getTime() : Date.now();
              const ageDays = Math.max(1, (Date.now() - created) / 86_400_000);
              const fastAuto = sold / ageDays >= 3;
              const pill = (label: string, on: boolean) => (
                <span key={label} className={`inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-[11px] font-mono uppercase tracking-widest ${on ? "border-accent/40 bg-accent/10 text-accent" : "border-white/10 text-muted-foreground"}`}>
                  <span className={`size-1.5 rounded-full ${on ? "bg-accent" : "bg-muted-foreground/40"}`} />{label} {on ? "Active" : "Off"}
                </span>
              );
              return (
                <div className="space-y-2">
                  <div className="flex flex-wrap gap-2">
                    {pill("Premium", premiumAuto)}
                    {pill("Fast Selling", fastAuto)}
                  </div>
                  <p className="text-[10px] text-muted-foreground">Premium and Fast Selling are computed automatically from rating, pricing and sales velocity — they cannot be toggled manually.</p>
                </div>
              );
            })()}
          </div>
        </CollapsibleModule>
        </>)}

        {tab === "analytics" && (<>
        {/* Analytics (read-only) */}
        <CollapsibleModule eyebrow="Insights" title="Product Analytics" badge={<Sparkles className="size-3.5 text-accent" />} defaultOpen={false}>
          <div className="grid grid-cols-2 gap-2 sm:grid-cols-5">
            {(() => {
              const views = (row as any)?.views_count ?? 0;
              const orders = (row as any)?.orders_count ?? (row as any)?.sold_count ?? 0;
              const conv = views > 0 ? ((orders / views) * 100).toFixed(1) + "%" : "—";
              const stats: [string, string | number][] = [
                ["Total Views", views],
                ["Wishlist", (row as any)?.wishlist_count ?? 0],
                ["Orders", orders],
                ["Revenue", inr(Number((row as any)?.revenue ?? 0))],
                ["Conversion", conv],
              ];
              return stats.map(([label, val]) => (
                <div key={label} className="rounded-xl border border-white/10 bg-white/[0.02] p-3">
                  <div className="text-[9px] font-mono uppercase tracking-[0.2em] text-muted-foreground">{label}</div>
                  <div className="mt-1 text-sm font-semibold tabular-nums">{val}</div>
                </div>
              ));
            })()}
          </div>
        </CollapsibleModule>
        </>)}

        {tab === "merch" && (<>
        {/* Product Badges */}
        <CollapsibleModule eyebrow="Step 7" title="Product Badges" badge={<Tag className="size-3.5 text-accent" />}>
          {row?.slug ? (
            <ProductBadgeManager slug={row.slug} />
          ) : (
            <ProductBadgeManager selectedIds={pendingBadges} onChange={setPendingBadges} />
          )}
        </CollapsibleModule>
        </>)}

        {tab === "basic" && (<>
        {/* Media */}
        <CollapsibleModule eyebrow="Optional" title="Media" badge={<Sparkles className="size-3.5 text-accent" />} defaultOpen={false}>
          <div className="grid grid-cols-1 gap-3">
            <EField label="Product Video URL" value={form.video_url} onChange={(v) => set({ video_url: v })} />
            <EField label="Product Demo URL" value={form.demo_url} onChange={(v) => set({ demo_url: v })} />
          </div>
        </CollapsibleModule>
        </>)}


        {tab === "seo" && (<>
        {/* Advanced */}
        <CollapsibleModule eyebrow="Optional" title="Advanced (SEO & specs)" badge={<Sparkles className="size-3.5 text-accent" />} defaultOpen={false}>
          <div className="grid grid-cols-1 gap-3">
            <EField label="SEO title" value={form.seo_title} onChange={(v) => set({ seo_title: v })} />
            <div>
              <label className="block text-[9px] font-mono uppercase tracking-[0.2em] text-muted-foreground mb-1.5">SEO description</label>
              <textarea value={form.seo_description} onChange={(e) => set({ seo_description: e.target.value })} rows={2}
                className="w-full bg-white/[0.03] border border-white/10 rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-accent/40" />
            </div>
            <EField label="Meta keywords (comma separated)" value={form.meta_keywords} onChange={(v) => set({ meta_keywords: v })} />
            <div>
              <label className="block text-[9px] font-mono uppercase tracking-[0.2em] text-muted-foreground mb-1.5">Feature highlights (one per line)</label>
              <textarea value={form.features} onChange={(e) => set({ features: e.target.value })} rows={3}
                className="w-full bg-white/[0.03] border border-white/10 rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-accent/40" />
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div>
                <label className="block text-[9px] font-mono uppercase tracking-[0.2em] text-muted-foreground mb-1.5">Specifications (key: value)</label>
                <textarea value={form.specifications} onChange={(e) => set({ specifications: e.target.value })} rows={4}
                  className="w-full bg-white/[0.03] border border-white/10 rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-accent/40" />
              </div>
              <div>
                <label className="block text-[9px] font-mono uppercase tracking-[0.2em] text-muted-foreground mb-1.5">Custom attributes (key: value)</label>
                <textarea value={form.attributes} onChange={(e) => set({ attributes: e.target.value })} rows={4}
                  className="w-full bg-white/[0.03] border border-white/10 rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-accent/40" />
              </div>
            </div>
          </div>
        </CollapsibleModule>
        </>)}

        {row?.slug && tab === "seo" && (
          <CollapsibleModule eyebrow="Content" title="Product FAQs" badge={<HelpCircle className="size-3.5 text-accent" />} defaultOpen={false}>
            <ProductFaqManager productSlug={row.slug} />
          </CollapsibleModule>
        )}



        {validation.length > 0 && (
          <div className="rounded-2xl border border-amber-500/30 bg-amber-500/10 p-3 space-y-1.5">
            {validation.map((v) => (
              <p key={v} className="flex items-start gap-2 text-[11px] text-amber-300"><AlertTriangle className="size-3.5 shrink-0 mt-px" /> {v}</p>
            ))}
          </div>
        )}
        {error && <p className="text-xs text-destructive">{error}</p>}

        <div className="sticky bottom-0 -mx-4 sm:-mx-5 px-4 sm:px-5 py-3 bg-background/85 backdrop-blur flex gap-3">
          <button type="button" onClick={onClose} className="flex-1 py-3 rounded-xl border border-white/10 text-sm hover:bg-white/5">Cancel</button>
          <button type="submit" disabled={saving} className="flex-1 py-3 rounded-xl bg-gradient-to-r from-accent to-primary text-accent-foreground text-sm font-medium disabled:opacity-50 inline-flex items-center justify-center gap-2">
            {saving ? <Loader2 className="size-4 animate-spin" /> : null} {row?.id ? "Save changes" : "Create product"}
          </button>
        </div>
      </motion.form>
    </div>
  );
}
