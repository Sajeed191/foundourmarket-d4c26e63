import { useEffect, useMemo, useRef, useState } from "react";
import { useDuplicateDetection } from "@/hooks/use-duplicate-detection";
import { computeImagePhash, logDuplicateEvent, invalidateDetectionIndex } from "@/lib/duplicate-detection";
import { useNavigate } from "@tanstack/react-router";
import { ProductGuardBanner, GUARD_THRESHOLD } from "@/components/admin/duplicate/ProductGuardBanner";
import { MarketplaceAssistantPanel } from "@/components/admin/duplicate/MarketplaceAssistantPanel";
import { ProductInlineRecommendation } from "@/components/admin/ProductInlineRecommendation";
import { useImageIntelligence } from "@/hooks/use-image-intelligence";
import { classifyRelationship, isDuplicateRisk, RELATIONSHIP_LABEL } from "@/lib/catalog-intelligence";
import { resolveImage } from "@/lib/products";
import { motion } from "framer-motion";
import {
  X, Upload, Loader2, Package, IndianRupee, DollarSign, AlertTriangle,
  Truck, Percent, RotateCcw, Eye, Sparkles, Boxes, Tag, HelpCircle,
  Smartphone, Monitor, ShoppingCart, Star, Plus, Trash2,
} from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { logActivity } from "@/components/admin/AdminShell";
import { CollapsibleModule } from "@/components/admin/CollapsibleModule";
import { ProductFaqManager } from "@/components/admin/ProductFaqManager";
import { ProductBadgeManager } from "@/components/admin/ProductBadgeManager";
import { assignBadge, assignNewBadge, useProductBadges } from "@/lib/use-product-badges";
import { createFaq } from "@/lib/product-faqs";
import { useStoreSettings } from "@/lib/use-store-settings";
// Preview badges come from the live Badge Manager assignment set below —
// no computed fallbacks. Badge Manager is the single source of truth.
import { ProductMediaGallery, ProductVideoUploader } from "@/components/admin/product-editor/media-fields";
import {
  FeaturesBuilder, KeyValueBuilder, RichTextEditor, kvToArray, arrayToKv,
} from "@/components/admin/product-editor/field-builders";
import type { KV } from "@/components/admin/product-editor/field-builders";
import { ListChecks, Layers } from "lucide-react";
import { VariantBuilder } from "@/components/admin/product-editor/VariantBuilder";
import type { Product } from "@/lib/products";

const RATING_SOURCES = [
  { value: "customer_reviews", label: "Customer" },
  { value: "imported_supplier", label: "Supplier" },
  { value: "marketplace_imported", label: "Marketplace" },
] as const;

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
/** Auto-generate a readable SKU from name + category, e.g. ELE-WIRELESS-EARB-4821. */
function makeSku(name: string, category: string): string {
  const cat = (category || "GEN").replace(/[^a-zA-Z]/g, "").slice(0, 3).toUpperCase() || "GEN";
  const base = name.trim().replace(/[^a-zA-Z0-9]+/g, "-").replace(/^-+|-+$/g, "").toUpperCase().slice(0, 14) || "ITEM";
  const rand = Math.floor(1000 + Math.random() * 9000);
  return `${cat}-${base}-${rand}`;
}
/** Auto SEO title from brand + name, trimmed to a search-friendly length. */
function makeSeoTitle(name: string, brand: string): string {
  const b = brand.trim();
  const n = name.trim();
  const title = b && !n.toLowerCase().includes(b.toLowerCase()) ? `${n} — ${b}` : n;
  return title.slice(0, 60);
}
/** Auto SEO keywords from name, brand, category and tags. */
function makeKeywords(name: string, brand: string, category: string, tags: string): string[] {
  const words = name.toLowerCase().split(/[^a-z0-9]+/).filter((w) => w.length > 2);
  const out = new Set<string>([...words]);
  if (brand.trim()) out.add(brand.trim().toLowerCase());
  if (category.trim()) out.add(category.replace(/-/g, " ").trim().toLowerCase());
  for (const t of parseList(tags)) out.add(t.toLowerCase());
  return Array.from(out).slice(0, 12);
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

export function ProductEditorModal({ row, categories, nextSort, onClose, onSaved, onRefresh }: {
  row: ProductEditorRow | null; categories: Category[]; nextSort?: number;
  onClose: () => void; onSaved: () => void;
  /** Refresh the product list WITHOUT closing the modal (used after a create so
   *  the admin stays on the same product to add variants). */
  onRefresh?: () => void;
}) {
  const { settings } = useStoreSettings();
  const navigate = useNavigate();
  const [saving, setSaving] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState<string | null>(null);
   const fileRef = useRef<HTMLInputElement>(null);
   // Only close on a backdrop click whose press *started* on the backdrop.
   // Prevents ghost/synthetic clicks (e.g. after a native file/video picker
   // closes on mobile) from accidentally dismissing the editor.
  const backdropDownRef = useRef(false);
  const formRef = useRef<HTMLFormElement>(null);
  // Pending badge assignments for a not-yet-saved product (flushed after insert).
  const [pendingBadges, setPendingBadges] = useState<string[]>([]);
  const [pendingFaqs, setPendingFaqs] = useState<{ question: string; answer: string }[]>([]);
  const [faqQ, setFaqQ] = useState("");
  const [faqA, setFaqA] = useState("");
  const [previewDevice, setPreviewDevice] = useState<"mobile" | "desktop">("mobile");
  const [tab, setTab] = useState<"basic" | "merch" | "seo" | "related" | "variants" | "analytics" | "preview">("basic");

  // After a successful CREATE we keep the modal open and remember the new
  // product's id/slug so the Variants tab unlocks immediately — no re-open.
  const [savedProduct, setSavedProduct] = useState<{ id: string; slug: string } | null>(null);
  const effectiveId = row?.id ?? savedProduct?.id ?? null;
  const effectiveSlug = row?.slug ?? savedProduct?.slug ?? null;



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

  // ---- Additional categories (a product can live in several categories) ----
  const initialExtra = ((row as any)?.categories as string[] | undefined ?? []).filter(
    (s) => s && s !== (row?.category ?? ""),
  );
  const [extraCategories, setExtraCategories] = useState<string[]>(initialExtra);
  const [extraMain, setExtraMain] = useState("");
  const [extraSub, setExtraSub] = useState("");
  const extraMainObj = categories.find((c) => c.slug === extraMain);
  const extraSubs = extraMainObj ? categories.filter((c) => c.parent_id === extraMainObj.id) : [];
  const allCategorySlugs = useMemo(() => {
    const set = new Set<string>([effectiveCategory, ...extraCategories].filter(Boolean));
    return [...set];
  }, [effectiveCategory, extraCategories]);
  const catName = (slug: string) => categories.find((c) => c.slug === slug)?.name ?? slug;

  const [form, setForm] = useState({
    slug: row?.slug ?? "", name: row?.name ?? "", tagline: row?.tagline ?? "",
    category: row?.category ?? categories[0]?.slug ?? "",
    price: row?.price != null ? String(row.price) : "0",
    cost: row?.cost != null ? String(row.cost) : "0",
    discount: row?.discount ?? (null as number | null),
    image: row?.image ?? "", description: row?.description ?? "",
    in_stock: row?.in_stock ?? true, featured: row?.featured ?? false,
    sku: row?.sku ?? "", stock_quantity: row?.stock_quantity ?? 0,
    barcode: (row as any)?.barcode ?? "",
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
    cod_enabled: row?.cod_enabled ?? false,
    pickup_supported: row?.pickup_supported ?? false,
    international_shipping: row?.international_shipping ?? true,
    fragile: row?.fragile ?? false,
    return_eligible: row?.return_eligible ?? true,
    replacement_eligible: row?.replacement_eligible ?? true,
    return_window_days: row?.return_window_days ?? 4,
    warranty: row?.warranty ?? "No",
    rating: row?.rating != null ? String(row.rating) : "",
    reviews: row?.reviews != null ? String(row.reviews) : "",
    initial_rating: (row as any)?.initial_rating != null ? String((row as any).initial_rating) : "",
    rating_source: (row as any)?.rating_source ?? "imported_supplier",
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

  // Dedicated state for structured builders so empty/partial rows persist while
  // editing (deriving them from text on every keystroke dropped new rows).
  const [featuresList, setFeaturesList] = useState<string[]>(row?.features ?? []);
  const [specsRows, setSpecsRows] = useState<KV[]>(kvToArray(row?.specifications));
  const [attrsRows, setAttrsRows] = useState<KV[]>(kvToArray(row?.attributes));
  // Stable slug used to group media (images/video) before the row is saved.
  const mediaSlug = form.slug.trim() || slugify(form.name);
  // Live Badge Manager assignments for the preview card (empty for unsaved products).
  const previewAssignedBadges = useProductBadges(mediaSlug);

  // ---- Duplicate Detection (Marketplace Intelligence) ----
  // Perceptual hash of the primary image, recomputed when the image changes.
  const [draftPhash, setDraftPhash] = useState<string | null>(null);
  useEffect(() => {
    const src = form.image.trim();
    if (!src) { setDraftPhash(null); return; }
    let cancelled = false;
    computeImagePhash(resolveImage(src)).then((fp) => { if (!cancelled) setDraftPhash(fp); });
    return () => { cancelled = true; };
  }, [form.image]);

  const specsObj = useMemo(() => arrayToKv(specsRows), [specsRows]);
  const attrsObj = useMemo(() => arrayToKv(attrsRows), [attrsRows]);
  const duplicateDraft = useMemo(
    () => ({
      slug: form.slug.trim() || slugify(form.name),
      name: form.name,
      brand: form.brand || null,
      category: form.category || null,
      categories: extraCategories,
      sku: form.sku || null,
      barcode: form.barcode || null,
      image: form.image || null,
      imagePhash: draftPhash,
      description: form.description || null,
      specifications: specsObj as Record<string, string>,
      attributes: attrsObj as Record<string, string>,
      priceInr: form.price_inr ? Number(form.price_inr) : null,
      priceUsd: form.price_usd ? Number(form.price_usd) : null,
      variantKeys: [
        ...Object.values(attrsObj as Record<string, string>),
        ...specsRows.filter((r) => /colou?r|size/i.test(r.k)).map((r) => r.v),
      ].filter(Boolean),
    }),
    [form.slug, form.name, form.brand, form.category, extraCategories, form.sku, form.barcode, form.image, draftPhash, form.description, specsObj, attrsObj, form.price_inr, form.price_usd, specsRows],
  );
  const duplicateResult = useDuplicateDetection(duplicateDraft);
  const [dupTick, setDupTick] = useState(0);


  // ---- AI Product Guard: publish protection + smart action handlers ----
  // The top, non-ignored match that clears the warning threshold.
  const topGuardMatch = useMemo(() => {
    const m = duplicateResult.matches.find((x) => !x.ignored);
    return m && m.score >= GUARD_THRESHOLD ? m : null;
  }, [duplicateResult.matches]);

  // Once the admin explicitly chooses "Publish Anyway" we don't re-prompt.
  const [publishAck, setPublishAck] = useState(false);
  const [guardConfirm, setGuardConfirm] = useState<typeof topGuardMatch>(null);

  // Switch to the Variants tab (create the variant instead of a new product).
  const onCreateVariant = () => {
    setTab("variants");
    setGuardConfirm(null);
    toast.message("Add this as a variant", {
      description: savedProduct || effectiveId
        ? "Add the differing colour/size/storage as a variant of the existing product."
        : "Save the base product first, then add colour/size/storage variants here.",
    });
  };

  // Link the matched product into the appropriate relationship field.
  const onLinkRelated = (
    match: { product: { slug: string } },
    relation: "related" | "accessory" | "successor" | "bundle",
  ) => {
    const slug = match.product.slug;
    const field = relation === "successor" ? "upsell_products" : "related_products";
    const current = (form[field] || "").split(",").map((s: string) => s.trim()).filter(Boolean);
    if (!current.includes(slug)) current.push(slug);
    set({ [field]: current.join(", ") } as Partial<typeof form>);
    setGuardConfirm(null);
    toast.success("Linked", { description: `Added "${slug}" — open the Related tab to review.` });
  };


  const galleryUrls = useMemo(
    () => (form.image ? [resolveImage(form.image)] : []),
    [form.image],
  );
  const imageQuality = useImageIntelligence(galleryUrls, tab === "basic");

  const healthInput = useMemo(
    () => ({
      name: form.name,
      description: form.description || null,
      seoTitle: form.seo_title || null,
      seoDescription: form.seo_description || null,
      keywords: form.meta_keywords || null,
      imageCount: galleryUrls.length,
      hasVideo: !!form.video_url?.trim(),
      specCount: specsRows.filter((r) => r.k && r.v).length,
      variantCount: Object.values(attrsObj as Record<string, string>).filter(Boolean).length,
      priceInr: form.price_inr ? Number(form.price_inr) : null,
      priceUsd: form.price_usd ? Number(form.price_usd) : null,
      comparePriceInr: form.compare_price_inr ? Number(form.compare_price_inr) : null,
      stockQuantity: Number(form.stock_quantity) || 0,
    }),
    [form.name, form.description, form.seo_title, form.seo_description, form.meta_keywords, galleryUrls.length, form.video_url, specsRows, attrsObj, form.price_inr, form.price_usd, form.compare_price_inr, form.stock_quantity],
  );

  // SEO advisory input for the Marketplace AI Assistant (reuses SEO engine).
  const assistantSeoDraft = useMemo(
    () => ({
      name: form.name,
      seoTitle: form.seo_title || null,
      seoDescription: form.seo_description || null,
      description: form.description || null,
      keywords: form.meta_keywords || null,
      imageAlt: form.name || null,
      category: effectiveCategory || null,
      hasFaq: pendingFaqs.length > 0,
      hasRelated: !!(form.related_products || form.cross_sell_products || form.upsell_products),
      hasImage: !!form.image.trim(),
    }),
    [form.name, form.seo_title, form.seo_description, form.description, form.meta_keywords, effectiveCategory, pendingFaqs.length, form.related_products, form.cross_sell_products, form.upsell_products, form.image],
  );

  // ---- Inline Recommendation input (Catalog Intelligence 2.0 embedding) ----
  const inlineRecInput = useMemo(
    () => ({
      slug: form.slug.trim() || slugify(form.name),
      name: form.name,
      category: effectiveCategory || null,
      description: form.description || null,
      seoTitle: form.seo_title || null,
      seoDescription: form.seo_description || null,
      metaKeywords: form.meta_keywords ?? null,
      imageCount: galleryUrls.length,
      imageQuality: imageQuality.images.length ? imageQuality.score : null,
      hasVideo: !!form.video_url?.trim(),
      attributes: attrsObj as Record<string, unknown>,
      specifications: specsObj as Record<string, unknown>,
      variants: [],
      priceInr: form.price_inr ? Number(form.price_inr) : null,
      priceUsd: form.price_usd ? Number(form.price_usd) : null,
      comparePriceInr: form.compare_price_inr ? Number(form.compare_price_inr) : null,
      comparePriceUsd: form.compare_price_usd ? Number(form.compare_price_usd) : null,
      costInr: form.cost_price_inr ? Number(form.cost_price_inr) : null,
      costUsd: form.cost_price_usd ? Number(form.cost_price_usd) : null,
      stockQuantity: Number(form.stock_quantity) || 0,
    }),
    [form.slug, form.name, effectiveCategory, form.description, form.seo_title, form.seo_description, form.meta_keywords, galleryUrls.length, imageQuality.images.length, imageQuality.score, form.video_url, attrsObj, specsObj, form.price_inr, form.price_usd, form.compare_price_inr, form.compare_price_usd, form.cost_price_inr, form.cost_price_usd, form.stock_quantity],
  );




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
    // AI Product Guard — never blocks, but confirms before creating an obvious
    // duplicate. Only prompts for genuine duplicate risk, and only once.
    if (!publishAck && topGuardMatch) {
      const rel = classifyRelationship(duplicateDraft, topGuardMatch);
      if (isDuplicateRisk(rel.kind) || topGuardMatch.score >= 90) {
        setGuardConfirm(topGuardMatch);
        return;
      }
    }
    setSaving(true); setError(null);
    const finalSlug = form.slug.trim() || slugify(form.name);
    // Auto SKU / SEO — generated automatically when left blank.
    const autoSku = form.sku.trim() || makeSku(form.name, effectiveCategory);
    const autoSeoTitle = form.seo_title.trim() || makeSeoTitle(form.name, form.brand);
    const autoSeoDesc =
      form.seo_description.trim() ||
      (form.description.trim() || form.tagline.trim() || form.name.trim()).slice(0, 160);
    const autoKeywords =
      form.meta_keywords.trim()
        ? parseList(form.meta_keywords)
        : makeKeywords(form.name, form.brand, effectiveCategory, form.tags);
    const ratingNum = numOrNull(form.rating);
    const reviewsNum = numOrNull(form.reviews);
    const initialRatingNum = numOrNull(form.initial_rating);
    const payload = {
      slug: finalSlug, name: form.name.trim(),
      tagline: form.tagline.trim() || null, category: effectiveCategory,
      categories: allCategorySlugs,
      price: Number(form.price) || 0, cost: Number(form.cost) || 0,
      discount: form.discount ? Number(form.discount) : null,
      image: form.image.trim() || null, description: form.description.trim() || null,
      in_stock: form.in_stock, featured: form.featured, sku: autoSku,
      barcode: form.barcode.trim() || null, image_phash: draftPhash,
      rating: ratingNum ?? undefined, reviews: reviewsNum != null ? Math.round(reviewsNum) : undefined,
      initial_rating: initialRatingNum ?? undefined, rating_source: form.rating_source,
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
      tags: parseList(form.tags), features: featuresList.map((f) => f.trim()).filter(Boolean), meta_keywords: autoKeywords,
      seo_title: autoSeoTitle || null, seo_description: autoSeoDesc || null,
      specifications: arrayToKv(specsRows), attributes: arrayToKv(attrsRows),
      admin_notes: form.admin_notes.trim() || null,
      scheduled_publish_at: form.scheduled_publish_at ? new Date(form.scheduled_publish_at).toISOString() : null,
    };
    const existingId = effectiveId;
    const { data: savedRow, error: err } = existingId
      ? await supabase.from("products").update(payload).eq("id", existingId).select("id, slug").single()
      : await supabase.from("products").insert(payload).select("id, slug").single();
    if (err) { setSaving(false); setError(err.message); return; }
    // Newly created product: auto-assign the "New" badge, then flush any
    // pending manual badge assignments (in priority order).
    if (!existingId) {
      try { await assignNewBadge(payload.slug); }
      catch { /* non-fatal: badge can be added manually in the editor */ }
      if (pendingBadges.length) {
        try {
          for (const id of pendingBadges) await assignBadge(payload.slug, id);
        } catch { /* non-fatal: product is saved, badges can be retried in editor */ }
      }
    }
    // Flush pending FAQs for a newly created product (in display order).
    if (!existingId && pendingFaqs.length) {
      try {
        let i = 0;
        for (const faq of pendingFaqs) {
          await createFaq({ productSlug: payload.slug, question: faq.question, answer: faq.answer, sortOrder: i++ });
        }
      } catch { /* non-fatal: product is saved, FAQs can be added in editor */ }
    }
    setSaving(false);
    if (existingId) {
      logActivity("product_updated", "product", existingId, { slug: payload.slug });
      toast.success("Product updated");
      onSaved();
      return;
    }
    // CREATE succeeded: stay open, unlock variants, refresh list in background.
    logActivity("product_created", "product", savedRow?.id, { slug: payload.slug });
    setSavedProduct({ id: savedRow!.id, slug: savedRow!.slug });
    setPendingBadges([]);
    setPendingFaqs([]);
    onRefresh?.();
    setTab("variants");
    toast.success("Product created successfully. You can now add Size & Color variants.");
  }

  return (
     <div
      className="fixed inset-0 z-50 grid place-items-end sm:place-items-center bg-black/70 backdrop-blur-sm p-0 sm:p-4"
      onPointerDown={(e) => { backdropDownRef.current = e.target === e.currentTarget; }}
      onClick={(e) => { if (e.target === e.currentTarget && backdropDownRef.current) onClose(); backdropDownRef.current = false; }}
    >
      <motion.form
        ref={formRef}
        initial={{ y: 40, opacity: 0 }} animate={{ y: 0, opacity: 1 }}
        onSubmit={save} onClick={(e) => e.stopPropagation()}
        className="w-full max-w-2xl glass-strong border border-white/10 rounded-t-3xl sm:rounded-3xl p-4 sm:p-5 max-h-[94vh] overflow-y-auto space-y-3"
      >
        <div className="sticky top-0 z-20 -mx-4 sm:-mx-5 px-4 sm:px-5 pt-2 pb-2 bg-background/90 backdrop-blur space-y-2">
          <div className="flex justify-between items-center">
            <h2 className="text-lg font-display">{effectiveId ? "Edit product" : "New product"}</h2>
            <button type="button" onClick={onClose} className="size-8 grid place-items-center rounded-full hover:bg-white/5"><X className="size-4" /></button>
          </div>
          <div className="flex gap-1 overflow-x-auto -mx-1 px-1">
            {([
              ["basic", "Basic Information"],
              ["merch", "Merchandising"],
              ["seo", "SEO & FAQs"],
              ["related", "Related"],
              ["variants", "Variants"],
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

        {/* AI Product Guard — sticky, cross-tab real-time duplicate warning */}
        <ProductGuardBanner
          draft={duplicateDraft}
          result={duplicateResult}
          draftPhash={draftPhash}
          onCreateVariant={onCreateVariant}
          onLinkRelated={onLinkRelated}
          onIgnored={() => setDupTick((t) => t + 1)}
        />

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

        {/* Inline Recommendation — one message, one action (Platform v1.0 embedding) */}
        {tab === "basic" && (
          <ProductInlineRecommendation
            input={inlineRecInput}
            onGoToTab={(t) => setTab(t)}
          />
        )}

        {/* Marketplace AI Assistant — unified live intelligence (never blocks) */}
        {tab === "basic" && (
          <MarketplaceAssistantPanel
            key={dupTick}
            draft={duplicateDraft}
            result={duplicateResult}
            draftPhash={draftPhash}
            healthInput={healthInput}
            imageQuality={imageQuality}
            seoDraft={assistantSeoDraft}
            variantRows={[]}
            onCreateVariant={onCreateVariant}
            onLinkRelated={onLinkRelated}
            onIgnored={() => setDupTick((t) => t + 1)}
          />
        )}



        {tab === "basic" && (<>
        {/* Images — multiple, drag to reorder, first = primary */}
        <CollapsibleModule eyebrow="Step 0" title="Product Images" badge={<Sparkles className="size-3.5 text-accent" />}>
          {mediaSlug ? (
            <ProductMediaGallery
              slug={mediaSlug}
              name={form.name}
              primaryUrl={form.image || null}
              onPrimaryChange={(url) => set({ image: url })}
            />
          ) : (
            <p className="rounded-lg border border-amber-500/30 bg-amber-500/10 px-3 py-3 text-xs text-amber-300">
              Enter a product name first — images are organised under the product's slug.
            </p>
          )}
        </CollapsibleModule>
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
            const badges = previewAssignedBadges.map((b) => ({
              key: b.badgeKey,
              label: b.label,
              emoji: b.emoji,
              backgroundColor: b.backgroundColor || b.color,
              textColor: b.textColor,
              borderColor: b.borderColor,
            }));
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
                        ? <img loading="lazy" decoding="async" src={form.image} alt={form.name} className="w-full h-full object-cover" />
                        : <Package className="size-8 text-muted-foreground" />}
                      <div className="absolute top-2 left-2 flex flex-col gap-1 items-start">
                        {badges.map((b) => (
                          <span
                            key={b.key}
                            className="inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[9px] font-semibold"
                            style={{
                              backgroundColor: b.backgroundColor,
                              color: b.textColor,
                              border: b.borderColor ? `1px solid ${b.borderColor}` : undefined,
                            }}
                          >
                            {b.emoji && <span>{b.emoji}</span>}{b.label}
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
            <div className="col-span-2">
              <label className="block text-[9px] font-mono uppercase tracking-[0.2em] text-muted-foreground mb-1.5">
                Additional Categories
              </label>
              <div className="grid grid-cols-2 gap-2">
                <select value={extraMain} onChange={(e) => { setExtraMain(e.target.value); setExtraSub(""); }} className="filter-select">
                  <option value="" className="bg-background">Main category…</option>
                  {mains.map((c) => (
                    <option key={c.slug} value={c.slug} className="bg-background">{c.name}</option>
                  ))}
                </select>
                <select value={extraSub} disabled={!extraMain} onChange={(e) => setExtraSub(e.target.value)} className="filter-select disabled:opacity-50">
                  <option value="" className="bg-background">
                    {!extraMain ? "Select main first" : extraSubs.length ? "Use main / pick sub…" : "No sub categories"}
                  </option>
                  {extraSubs.map((c) => (
                    <option key={c.slug} value={c.slug} className="bg-background">{c.name}</option>
                  ))}
                </select>
              </div>
              <button type="button"
                disabled={!extraMain}
                onClick={() => {
                  const slug = extraSub || extraMain;
                  if (slug) { setExtraCategories((p) => [...new Set([...p, slug])]); setExtraMain(""); setExtraSub(""); }
                }}
                className="mt-2 px-3 py-2 rounded-lg border border-accent/40 bg-accent/10 text-[10px] font-mono uppercase tracking-widest hover:bg-accent/20 disabled:opacity-40">
                Add category
              </button>
              {allCategorySlugs.length > 0 && (
                <div className="mt-2 flex flex-wrap gap-2">
                  {allCategorySlugs.map((slug, i) => (
                    <span key={slug}
                      className={`inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-xs ${i === 0 ? "border-accent/40 bg-accent/10" : "border-white/10 bg-white/[0.03] text-muted-foreground"}`}>
                      <span className="capitalize">{catName(slug)}{i === 0 ? " · primary" : ""}</span>
                      {i !== 0 && (
                        <button type="button" onClick={() => setExtraCategories((p) => p.filter((s) => s !== slug))}
                          aria-label={`Remove ${slug}`} className="opacity-60 hover:opacity-100">×</button>
                      )}
                    </span>
                  ))}
                </div>
              )}
            </div>
            <EField label="SKU (auto if blank)" value={form.sku} onChange={(v) => set({ sku: v })} />
            <EField label="Brand" value={form.brand} onChange={(v) => set({ brand: v })} />
            <EField label="Barcode / UPC / EAN" value={form.barcode} onChange={(v) => set({ barcode: v })} />
            <EField label="Product Type" value={form.product_type} onChange={(v) => set({ product_type: v })} />
            <EField label="Product Tags (comma separated)" value={form.tags} onChange={(v) => set({ tags: v })} className="col-span-2" />
            <div className="col-span-2">
              <label className="block text-[9px] font-mono uppercase tracking-[0.2em] text-muted-foreground mb-1.5">Description — rich text (headings, bold & lists)</label>
              <RichTextEditor value={form.description} onChange={(v) => set({ description: v })} rows={5} />
            </div>
          </div>
        </CollapsibleModule>

        {/* Features */}
        <CollapsibleModule eyebrow="Step 1b" title="Features" badge={<ListChecks className="size-3.5 text-accent" />} defaultOpen={false}>
          <p className="mb-2 text-[11px] text-muted-foreground">Key selling points buyers care about — shown on the product page.</p>
          <FeaturesBuilder value={featuresList} onChange={setFeaturesList} />
        </CollapsibleModule>

        {/* Specifications */}
        <CollapsibleModule eyebrow="Step 1c" title="Specifications" badge={<Layers className="size-3.5 text-accent" />} defaultOpen={false}>
          <p className="mb-2 text-[11px] text-muted-foreground">Technical key/value details — shown as a spec table to customers.</p>
          <KeyValueBuilder
            rows={specsRows}
            onChange={setSpecsRows}
            keyPlaceholder="e.g. Material"
            valuePlaceholder="e.g. Aluminium alloy"
            addLabel="Add Specification"
          />
        </CollapsibleModule>

        {/* Attributes */}
        <CollapsibleModule eyebrow="Step 1d" title="Attributes" badge={<Tag className="size-3.5 text-accent" />} defaultOpen={false}>
          <p className="mb-2 text-[11px] text-muted-foreground">Variant &amp; buyer-facing attributes (e.g. Color, Size).</p>
          <KeyValueBuilder
            rows={attrsRows}
            onChange={setAttrsRows}
            keyPlaceholder="e.g. Color"
            valuePlaceholder="e.g. Matte Black"
            addLabel="Add Attribute"
          />
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
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <EField label="Return window (days)" type="number" value={String(form.return_window_days)} onChange={(v) => set({ return_window_days: Number(v) || 0 })} />
            <EField label="Warranty" value={form.warranty} onChange={(v) => set({ warranty: v })} />
            <div className="sm:col-span-2 flex flex-wrap gap-4 rounded-xl border border-white/10 bg-white/[0.02] p-3">
              <Toggle checked={form.return_eligible} onChange={(v) => set({ return_eligible: v })} label="Return eligible" />
              <Toggle checked={form.replacement_eligible} onChange={(v) => set({ replacement_eligible: v })} label="Replacement eligible" />
            </div>
          </div>
        </CollapsibleModule>

        {/* Rating Management */}
        <CollapsibleModule eyebrow="Step 5b" title="Rating Management" badge={<Star className="size-3.5 text-accent" />} defaultOpen={false}>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div className="sm:col-span-2 flex flex-wrap items-center gap-1">
              {[1, 2, 3, 4, 5].map((s) => {
                const r = Number(form.rating) || 0;
                return (
                  <button key={s} type="button" onClick={() => set({ rating: String(s) })} aria-label={`${s} stars`}
                    className="p-0.5">
                    <Star className={`size-6 transition-colors ${s <= Math.round(r) ? "fill-amber-400 text-amber-400" : "text-muted-foreground/40"}`} />
                  </button>
                );
              })}
              <span className="ml-2 text-sm text-muted-foreground">{form.rating ? `${Number(form.rating).toFixed(1)} / 5` : "No rating"}</span>
            </div>
            <EField label="Rating (0-5)" type="number" value={form.rating} onChange={(v) => set({ rating: v })} />
            <EField label="Reviews count" type="number" value={form.reviews} onChange={(v) => set({ reviews: v })} />
            <EField label="Initial / seed rating" type="number" value={form.initial_rating} onChange={(v) => set({ initial_rating: v })} />
            <div>
              <label className="block text-[9px] font-mono uppercase tracking-[0.2em] text-muted-foreground mb-1.5">Rating Source</label>
              <select value={form.rating_source} onChange={(e) => set({ rating_source: e.target.value })} className="filter-select w-full">
                {RATING_SOURCES.map((r) => <option key={r.value} value={r.value} className="bg-background">{r.label}</option>)}
              </select>
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

        {tab === "variants" && (<>
        <CollapsibleModule eyebrow="Options" title="Product Variants" badge={<Layers className="size-3.5 text-accent" />}>
          {effectiveId && effectiveSlug ? (
            <VariantBuilder slug={effectiveSlug} />
          ) : (
            <div className="rounded-2xl border border-white/10 bg-white/[0.02] px-4 py-6 text-center opacity-70">
              <Layers className="mx-auto mb-2 size-5 text-muted-foreground" />
              <p className="text-sm font-medium">Save the product first, then add variants.</p>
              <p className="mt-1 text-xs text-muted-foreground">
                Size / Colour combinations attach to a saved product. Fill in the basics and save — the full Variant Builder unlocks here automatically.
              </p>
            </div>
          )}
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
        {/* Media — product video upload + demo link */}
        <CollapsibleModule eyebrow="Optional" title="Media" badge={<Sparkles className="size-3.5 text-accent" />} defaultOpen={false}>
          <div className="grid grid-cols-1 gap-4">
            <div>
              <label className="block text-[9px] font-mono uppercase tracking-[0.2em] text-muted-foreground mb-1.5">Product Video</label>
              {mediaSlug ? (
                <ProductVideoUploader slug={mediaSlug} value={form.video_url} onChange={(v) => set({ video_url: v })} />
              ) : (
                <p className="rounded-lg border border-amber-500/30 bg-amber-500/10 px-3 py-3 text-xs text-amber-300">
                  Enter a product name first to upload a video.
                </p>
              )}
            </div>
            <EField label="Product Video URL (or paste a link)" value={form.video_url} onChange={(v) => set({ video_url: v })} />
            <EField label="Product Demo URL" value={form.demo_url} onChange={(v) => set({ demo_url: v })} />
          </div>
        </CollapsibleModule>
        </>)}



        {tab === "seo" && (<>
        {/* Advanced */}
        <CollapsibleModule eyebrow="Optional" title="Advanced (SEO & specs)" badge={<Sparkles className="size-3.5 text-accent" />} defaultOpen={false}>
          <div className="grid grid-cols-1 gap-3">
            <p className="text-[10px] text-muted-foreground">SEO title, description and keywords are generated automatically from the product name, brand and tags when left blank.</p>
            <EField label="SEO title (auto if blank)" value={form.seo_title} onChange={(v) => set({ seo_title: v })} />
            <div>
              <label className="block text-[9px] font-mono uppercase tracking-[0.2em] text-muted-foreground mb-1.5">SEO description</label>
              <textarea value={form.seo_description} onChange={(e) => set({ seo_description: e.target.value })} rows={2}
                className="w-full bg-white/[0.03] border border-white/10 rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-accent/40" />
            </div>
            <EField label="Meta keywords (comma separated)" value={form.meta_keywords} onChange={(v) => set({ meta_keywords: v })} />
            <p className="text-[10px] text-muted-foreground">Features, specifications &amp; attributes are now edited in the Basics tab.</p>

          </div>
        </CollapsibleModule>
        </>)}

        {tab === "seo" && (
          <CollapsibleModule eyebrow="Content" title="Product FAQs" badge={<HelpCircle className="size-3.5 text-accent" />} defaultOpen={true}>
            {row?.slug ? (
              <ProductFaqManager productSlug={row.slug} />
            ) : (
              <div className="space-y-3">
                <p className="text-[11px] text-muted-foreground">
                  Add buyer FAQs now — they’ll be saved with the product when you create it.
                </p>
                <div className="space-y-2">
                  <input value={faqQ} onChange={(e) => setFaqQ(e.target.value)} placeholder="Question"
                    className="w-full bg-white/[0.03] border border-white/10 rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-accent/40" />
                  <textarea value={faqA} onChange={(e) => setFaqA(e.target.value)} placeholder="Answer" rows={2}
                    className="w-full bg-white/[0.03] border border-white/10 rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-accent/40" />
                  <button type="button"
                    disabled={!faqQ.trim() || !faqA.trim()}
                    onClick={() => {
                      setPendingFaqs((p) => [...p, { question: faqQ.trim(), answer: faqA.trim() }]);
                      setFaqQ(""); setFaqA("");
                    }}
                    className="inline-flex items-center gap-1.5 px-3 py-2 rounded-lg border border-accent/40 bg-accent/10 text-[10px] font-mono uppercase tracking-widest hover:bg-accent/20 disabled:opacity-40">
                    <Plus className="size-3.5" /> Add FAQ
                  </button>
                </div>
                {pendingFaqs.length > 0 && (
                  <ul className="space-y-2">
                    {pendingFaqs.map((faq, i) => (
                      <li key={i} className="rounded-lg border border-white/10 bg-white/[0.02] p-2.5">
                        <div className="flex items-start justify-between gap-2">
                          <div className="min-w-0">
                            <p className="text-xs font-medium truncate">{faq.question}</p>
                            <p className="text-[11px] text-muted-foreground line-clamp-2">{faq.answer}</p>
                          </div>
                          <button type="button" onClick={() => setPendingFaqs((p) => p.filter((_, idx) => idx !== i))}
                            aria-label="Remove FAQ" className="shrink-0 text-muted-foreground hover:text-foreground">
                            <Trash2 className="size-3.5" />
                          </button>
                        </div>
                      </li>
                    ))}
                  </ul>
                )}
              </div>
            )}
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
            {saving ? <Loader2 className="size-4 animate-spin" /> : null} {effectiveId ? "Save changes" : "Create product"}
          </button>
        </div>

        {/* Publish Protection — never blocks; the admin always decides. */}
        {guardConfirm && (() => {
          const gc = guardConfirm;
          const rel = classifyRelationship(duplicateDraft, gc);
          const proceed = () => {
            setPublishAck(true);
            setGuardConfirm(null);
            // Re-submit now that the admin acknowledged the duplicate.
            setTimeout(() => formRef.current?.requestSubmit(), 0);
          };
          return (
            <div
              className="fixed inset-0 z-[60] grid place-items-center bg-black/70 p-4 backdrop-blur-sm"
              onClick={(e) => { if (e.target === e.currentTarget) setGuardConfirm(null); }}
            >
              <div className="w-full max-w-md glass-strong border border-red-500/30 rounded-3xl p-5 space-y-3">
                <div className="flex items-center gap-2">
                  <AlertTriangle className="size-5 text-red-400" />
                  <h3 className="text-base font-display font-semibold">This product may already exist</h3>
                </div>
                <div className="flex items-center gap-3 rounded-2xl border border-white/10 bg-background/40 p-3">
                  {gc.product.image
                    ? <img loading="lazy" decoding="async" src={resolveImage(gc.product.image)} alt={gc.product.name} className="size-14 shrink-0 rounded-xl object-cover" />
                    : <div className="grid size-14 shrink-0 place-items-center rounded-xl bg-white/5"><Package className="size-5 text-muted-foreground" /></div>}
                  <div className="min-w-0">
                    <p className="truncate text-sm font-medium">{gc.product.name}</p>
                    <p className="text-xs text-muted-foreground">{RELATIONSHIP_LABEL[rel.kind]} · {gc.product.brand || "—"}</p>
                    <p className="font-mono text-sm font-bold text-red-400">Confidence {gc.score}%</p>
                  </div>
                </div>
                <p className="text-xs text-muted-foreground">{rel.message} You decide what happens next.</p>
                <ul className="space-y-0.5">
                  {gc.signals.filter((s) => s.matched).slice(0, 4).map((s) => (
                    <li key={s.key} className="flex items-center gap-1.5 text-[11px] text-muted-foreground">
                      <span className="text-emerald-400">✓</span> {s.reason}
                    </li>
                  ))}
                </ul>
                <div className="grid grid-cols-2 gap-2 pt-1">
                  <button type="button" onClick={() => navigate({ to: "/admin-product/$slug", params: { slug: gc.product.slug } })}
                    className="rounded-xl border border-white/15 px-3 py-2 text-xs font-medium hover:bg-white/5">Open Existing</button>
                  <button type="button" onClick={async () => {
                      await logDuplicateEvent({ draft: duplicateDraft, match: gc, action: "merged" });
                      invalidateDetectionIndex();
                      setGuardConfirm(null);
                      navigate({ to: "/admin-product/$slug", params: { slug: gc.product.slug } });
                    }}
                    className="rounded-xl border border-white/15 px-3 py-2 text-xs font-medium hover:bg-white/5">Merge</button>
                  <button type="button" onClick={onCreateVariant}
                    className="rounded-xl border border-emerald-500/40 bg-emerald-500/10 px-3 py-2 text-xs font-medium text-emerald-300 hover:bg-emerald-500/20">Convert to Variant</button>
                  <button type="button" onClick={async () => {
                      await logDuplicateEvent({ draft: duplicateDraft, match: gc, action: "ignored" });
                      gc.ignored = true;
                      setDupTick((t) => t + 1);
                      setGuardConfirm(null);
                    }}
                    className="rounded-xl border border-white/15 px-3 py-2 text-xs font-medium hover:bg-white/5">Ignore</button>
                  <button type="button" onClick={proceed}
                    className="col-span-2 rounded-xl bg-gradient-to-r from-accent to-primary px-3 py-2 text-xs font-semibold text-accent-foreground hover:brightness-110">
                    Publish Anyway
                  </button>
                </div>
              </div>
            </div>
          );
        })()}
      </motion.form>

    </div>
  );
}
