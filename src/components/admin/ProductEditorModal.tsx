import { useMemo, useRef, useState } from "react";
import { motion } from "framer-motion";
import {
  X, Upload, Loader2, Package, IndianRupee, DollarSign, AlertTriangle,
  Truck, Percent, RotateCcw, Eye, Sparkles, Boxes, Tag, HelpCircle,
} from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { logActivity } from "@/components/admin/AdminShell";
import { CollapsibleModule } from "@/components/admin/CollapsibleModule";
import { ProductFaqManager } from "@/components/admin/ProductFaqManager";
import { useStoreSettings } from "@/lib/use-store-settings";

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

type Category = { slug: string; name: string };

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

export function ProductEditorModal({ row, categories, nextSort, onClose, onSaved }: {
  row: ProductEditorRow | null; categories: Category[]; nextSort?: number; onClose: () => void; onSaved: () => void;
}) {
  const { settings } = useStoreSettings();
  const [saving, setSaving] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);

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

  async function save(e: React.FormEvent) {
    e.preventDefault();
    if (validation.length) { setError(validation[0]); return; }
    setSaving(true); setError(null);
    const payload = {
      slug: form.slug.trim() || slugify(form.name), name: form.name.trim(),
      tagline: form.tagline.trim() || null, category: form.category,
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
    setSaving(false);
    if (err) { setError(err.message); return; }
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
        <div className="flex justify-between items-center sticky top-0 z-10 -mx-4 sm:-mx-5 px-4 sm:px-5 py-2 bg-background/80 backdrop-blur">
          <h2 className="text-lg font-display">{row?.id ? "Edit product" : "New product"}</h2>
          <button type="button" onClick={onClose} className="size-8 grid place-items-center rounded-full hover:bg-white/5"><X className="size-4" /></button>
        </div>

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
              <label className="block text-[9px] font-mono uppercase tracking-[0.2em] text-muted-foreground mb-1.5">Category</label>
              <select value={form.category} onChange={(e) => set({ category: e.target.value })} className="filter-select">
                {categories.map((c) => <option key={c.slug} value={c.slug} className="bg-background">{c.name}</option>)}
              </select>
            </div>
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
          <div className="grid grid-cols-2 gap-3">
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
            <div className="col-span-2 flex flex-wrap gap-4 rounded-xl border border-white/10 bg-white/[0.02] p-3">
              <Toggle checked={form.in_stock} onChange={(v) => set({ in_stock: v })} label="Active / In stock" />
            </div>
          </div>
        </CollapsibleModule>

        {/* Shipping */}
        <CollapsibleModule eyebrow="Step 4" title="Shipping" badge={<Truck className="size-3.5 text-accent" />}>
          <div className="grid grid-cols-2 gap-3">
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
            <p className="col-span-2 text-[10px] text-muted-foreground">Free-shipping thresholds are global and managed in Store Settings → keeps a single source of truth across the platform.</p>
            <EField label="Weight (kg)" type="number" value={form.weight} onChange={(v) => set({ weight: v })} />
            <EField label="Shipping Class" value={form.shipping_class} onChange={(v) => set({ shipping_class: v })} />
            <EField label="Length (cm)" type="number" value={form.length} onChange={(v) => set({ length: v })} />
            <EField label="Width (cm)" type="number" value={form.width} onChange={(v) => set({ width: v })} />
            <EField label="Height (cm)" type="number" value={form.height} onChange={(v) => set({ height: v })} className="col-span-2" />
            <div className="col-span-2 flex flex-wrap gap-4 rounded-xl border border-white/10 bg-white/[0.02] p-3">
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
            </div>
          </div>
        </CollapsibleModule>

        {/* Media */}
        <CollapsibleModule eyebrow="Optional" title="Media" badge={<Sparkles className="size-3.5 text-accent" />} defaultOpen={false}>
          <div className="grid grid-cols-1 gap-3">
            <EField label="Product Video URL" value={form.video_url} onChange={(v) => set({ video_url: v })} />
            <EField label="Product Demo URL" value={form.demo_url} onChange={(v) => set({ demo_url: v })} />
          </div>
        </CollapsibleModule>


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

        {row?.slug && (
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
