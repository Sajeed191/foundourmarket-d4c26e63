import { useEffect, useRef, useState, type ReactNode } from "react";
import { Link, useNavigate } from "@tanstack/react-router";
import { motion } from "framer-motion";
import { ArrowLeft, Loader2, Save, Package, Check } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { logActivity } from "@/components/admin/AdminShell";
import { AdminShell } from "@/components/admin/AdminShell";
import { resolveImage } from "@/lib/products";
import { invalidateProducts } from "@/lib/use-products";
import { useUnsavedGuard } from "@/hooks/use-unsaved-guard";

type Role = "admin" | "super_admin" | "manager" | "support" | "fulfillment" | "warehouse_staff" | "editor";

/** Columns every section loads so the product header strip can render. */
const HEADER_COLS = ["id", "slug", "name", "image", "sku", "status", "category"] as const;

export type ProductHeaderInfo = {
  id: string; slug: string; name: string; image: string | null;
  sku: string | null; status: string | null; category: string | null;
};

export const inr = (v: number) =>
  new Intl.NumberFormat("en-IN", { style: "currency", currency: "INR", maximumFractionDigits: 0 }).format(Number(v) || 0);
export const usd = (v: number) =>
  new Intl.NumberFormat("en-US", { style: "currency", currency: "USD", maximumFractionDigits: 2 }).format(Number(v) || 0);

export const STATUS_OPTIONS = [
  "draft", "published", "hidden", "archived", "scheduled", "preorder", "out_of_stock",
] as const;

export const numOrNull = (v: string) => (v.trim() === "" ? null : Number(v));
export const parseList = (text: string): string[] => text.split(/[\n,]/).map((s) => s.trim()).filter(Boolean);
export function kvToText(obj: Record<string, string> | null | undefined): string {
  if (!obj) return "";
  return Object.entries(obj).map(([k, v]) => `${k}: ${v}`).join("\n");
}
export function textToKv(text: string): Record<string, string> {
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

/* ----------------------------- small inputs ----------------------------- */

export function Field({ label, value, onChange, type = "text", placeholder, className, hint }: {
  label: string; value: string; onChange: (v: string) => void; type?: string;
  placeholder?: string; className?: string; hint?: string;
}) {
  return (
    <div className={className}>
      <label className="block text-[9px] font-mono uppercase tracking-[0.2em] text-muted-foreground mb-1.5">{label}</label>
      <input type={type} value={value} placeholder={placeholder} onChange={(e) => onChange(e.target.value)}
        className="w-full bg-white/[0.03] border border-white/10 rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-accent/40" />
      {hint && <p className="mt-1 text-[10px] text-muted-foreground">{hint}</p>}
    </div>
  );
}

export function Area({ label, value, onChange, rows = 4, placeholder, hint }: {
  label: string; value: string; onChange: (v: string) => void; rows?: number; placeholder?: string; hint?: string;
}) {
  return (
    <div>
      <label className="block text-[9px] font-mono uppercase tracking-[0.2em] text-muted-foreground mb-1.5">{label}</label>
      <textarea value={value} rows={rows} placeholder={placeholder} onChange={(e) => onChange(e.target.value)}
        className="w-full bg-white/[0.03] border border-white/10 rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-accent/40 resize-y" />
      {hint && <p className="mt-1 text-[10px] text-muted-foreground">{hint}</p>}
    </div>
  );
}

export function Select({ label, value, onChange, options }: {
  label: string; value: string; onChange: (v: string) => void; options: { value: string; label: string }[];
}) {
  return (
    <div>
      <label className="block text-[9px] font-mono uppercase tracking-[0.2em] text-muted-foreground mb-1.5">{label}</label>
      <select value={value} onChange={(e) => onChange(e.target.value)}
        className="w-full bg-white/[0.03] border border-white/10 rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-accent/40">
        {options.map((o) => <option key={o.value} value={o.value} className="bg-background">{o.label}</option>)}
      </select>
    </div>
  );
}

export function Toggle({ checked, onChange, label, hint }: {
  checked: boolean; onChange: (v: boolean) => void; label: string; hint?: string;
}) {
  return (
    <label className="flex items-start gap-2.5 text-sm cursor-pointer rounded-lg border border-white/10 bg-white/[0.02] px-3 py-2.5 hover:border-white/20 transition-colors">
      <input type="checkbox" checked={checked} onChange={(e) => onChange(e.target.checked)} className="mt-0.5 accent-[var(--accent)]" />
      <span className="flex-1">
        <span className="block leading-tight">{label}</span>
        {hint && <span className="block text-[10px] text-muted-foreground mt-0.5">{hint}</span>}
      </span>
    </label>
  );
}

/* ----------------------------- data loading ----------------------------- */

/**
 * Loads ONLY the header columns + the section's editable columns for one
 * product. Each section instantiates this independently — there is no shared
 * product object across sections, so editing one section can never mutate or
 * re-save another.
 */
function useProductRow(slug: string, cols: string[]) {
  const [row, setRow] = useState<Record<string, any> | null>(null);
  const [loading, setLoading] = useState(true);
  const [notFound, setNotFound] = useState(false);

  useEffect(() => {
    let active = true;
    setLoading(true);
    const select = Array.from(new Set([...HEADER_COLS, ...cols])).join(",");
    supabase.from("products").select(select).eq("slug", slug).maybeSingle().then(({ data, error }) => {
      if (!active) return;
      if (error || !data) { setNotFound(true); setLoading(false); return; }
      setRow(data as Record<string, any>);
      setLoading(false);
    });
    return () => { active = false; };
  }, [slug, cols]);

  return { row, loading, notFound };
}

/* ----------------------------- section shell ----------------------------- */

const SECTIONS = [
  { key: "details", to: "/admin-product/$slug/details", label: "Product Details" },
  { key: "pricing", to: "/admin-product/$slug/pricing", label: "Pricing" },
  { key: "inventory", to: "/admin-product/$slug/inventory", label: "Inventory" },
  { key: "shipping", to: "/admin-product/$slug/shipping", label: "Shipping" },
  { key: "returns", to: "/admin-product/$slug/returns", label: "Returns" },
  { key: "seo", to: "/admin-product/$slug/seo", label: "SEO" },
  { key: "merchandising", to: "/admin-product/$slug/merchandising", label: "Merchandising" },
  { key: "analytics", to: "/admin-product/$slug/analytics", label: "Analytics" },
  { key: "preview", to: "/admin-product/$slug/preview", label: "Preview" },
] as const;

export const PRODUCT_SECTIONS = SECTIONS;

function ProductHeaderStrip({ h, active }: { h: ProductHeaderInfo; active?: string }) {
  return (
    <div className="card-premium rounded-2xl p-3 sm:p-4">
      <div className="flex items-center gap-3">
        <Link to="/admin-product/$slug" params={{ slug: h.slug }}
          className="size-14 rounded-xl overflow-hidden bg-white/5 border border-white/10 shrink-0 grid place-items-center">
          {h.image ? <img src={resolveImage(h.image)} alt={h.name} className="size-full object-cover" /> : <Package className="size-5 text-muted-foreground" />}
        </Link>
        <div className="min-w-0 flex-1">
          <p className="text-sm font-medium truncate">{h.name || "Untitled product"}</p>
          <div className="flex flex-wrap items-center gap-x-3 gap-y-0.5 mt-0.5 text-[11px] text-muted-foreground">
            <span className="font-mono">SKU: {h.sku || "—"}</span>
            <span className="capitalize">{(h.status || "draft").replace(/_/g, " ")}</span>
            <span>{h.category || "Uncategorized"}</span>
          </div>
        </div>
      </div>
      {active && (
        <div className="flex gap-1 overflow-x-auto mt-3 -mx-1 px-1">
          {SECTIONS.map((s) => (
            <Link key={s.key} to={`/admin-product/$slug/${s.key}` as string} params={{ slug: h.slug }}
              className={`shrink-0 whitespace-nowrap rounded-lg px-3 py-1.5 text-xs font-medium transition-colors ${
                active === s.key ? "bg-accent/15 text-accent border border-accent/40" : "text-muted-foreground border border-transparent hover:bg-white/5"
              }`}>
              {s.label}
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}

/**
 * Self-contained editor for a single product section.
 *
 * - Loads only `cols` (+ header cols).
 * - Holds isolated local form state, seeded once from the loaded row.
 * - "Save Changes" writes ONLY the columns produced by `toPatch` — unrelated
 *   product fields are never touched.
 * - Detects unsaved changes and warns before leaving.
 */
export function SectionEditor<T extends Record<string, any>>({
  slug, sectionKey, title, icon, cols, toForm, toPatch, validate, allow, children,
}: {
  slug: string;
  sectionKey: string;
  title: string;
  icon: ReactNode;
  cols: string[];
  toForm: (row: Record<string, any>) => T;
  toPatch: (form: T) => Record<string, unknown>;
  validate?: (form: T) => string | null;
  allow?: Role[];
  children: (form: T, set: (patch: Partial<T>) => void, row: Record<string, any>) => ReactNode;
}) {
  const { row, loading, notFound } = useProductRow(slug, cols);
  const [form, setForm] = useState<T | null>(null);
  const [saving, setSaving] = useState(false);
  const baseline = useRef<string>("");

  useEffect(() => {
    if (row) {
      const f = toForm(row);
      setForm(f);
      baseline.current = JSON.stringify(f);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [row]);

  const dirty = form != null && JSON.stringify(form) !== baseline.current;
  useUnsavedGuard(dirty);

  const set = (patch: Partial<T>) => setForm((f) => (f ? { ...f, ...patch } : f));

  async function save() {
    if (!form) return;
    const err = validate?.(form);
    if (err) { toast.error(err); return; }
    setSaving(true);
    const patch = { ...toPatch(form), updated_at: new Date().toISOString() };
    const { error } = await supabase.from("products").update(patch).eq("slug", slug);
    setSaving(false);
    if (error) { toast.error("Save failed", { description: error.message }); return; }
    baseline.current = JSON.stringify(form);
    setForm({ ...form }); // refresh dirty comparison
    logActivity("product_updated", "product", row?.id, { slug, section: sectionKey });
    invalidateProducts();
    toast.success(`${title} saved`);
  }

  const header: ProductHeaderInfo | null = row
    ? { id: row.id, slug: row.slug, name: row.name, image: row.image, sku: row.sku, status: row.status, category: row.category }
    : null;

  return (
    <AdminShell title={title} subtitle="Edit this section in isolation — changes save only when you click Save Changes." allow={allow ?? ["admin", "super_admin", "manager"]}>
      {loading || !form || !header ? (
        notFound ? (
          <div className="card-premium rounded-2xl p-10 text-center">
            <p className="text-sm">Product not found.</p>
            <Link to="/admin-products" className="mt-3 inline-block text-xs text-accent hover:underline">← Back to products</Link>
          </div>
        ) : (
          <div className="grid place-items-center py-24"><Loader2 className="size-5 animate-spin text-accent" /></div>
        )
      ) : (
        <div className="space-y-5 pb-24">
          <ProductHeaderStrip h={header} active={sectionKey} />

          <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }}
            className="card-premium rounded-2xl p-4 sm:p-5">
            <h2 className="text-sm font-medium flex items-center gap-2 mb-4"><span className="text-accent">{icon}</span> {title}</h2>
            {children(form, set, row!)}
          </motion.div>

          {/* Sticky save bar */}
          <div className="fixed bottom-0 inset-x-0 lg:left-[17.5rem] z-30 border-t border-border bg-background/90 backdrop-blur-xl px-4 py-3">
            <div className="max-w-3xl mx-auto flex items-center justify-between gap-3">
              <span className={`text-xs ${dirty ? "text-amber-400" : "text-muted-foreground"}`}>
                {dirty ? "You have unsaved changes." : "All changes saved."}
              </span>
              <button onClick={save} disabled={!dirty || saving}
                className="inline-flex items-center gap-2 rounded-full bg-accent px-5 py-2 text-xs font-semibold text-accent-foreground transition-all hover:brightness-110 disabled:opacity-40 disabled:cursor-not-allowed">
                {saving ? <Loader2 className="size-3.5 animate-spin" /> : dirty ? <Save className="size-3.5" /> : <Check className="size-3.5" />}
                {saving ? "Saving…" : "Save Changes"}
              </button>
            </div>
          </div>
        </div>
      )}
    </AdminShell>
  );
}

/** Read-only section frame (Analytics insights, Preview). */
export function ReadOnlySection({
  slug, sectionKey, title, icon, cols, allow, children,
}: {
  slug: string; sectionKey: string; title: string; icon: ReactNode; cols: string[];
  allow?: Role[]; children: (row: Record<string, any>) => ReactNode;
}) {
  const { row, loading, notFound } = useProductRow(slug, cols);
  const header: ProductHeaderInfo | null = row
    ? { id: row.id, slug: row.slug, name: row.name, image: row.image, sku: row.sku, status: row.status, category: row.category }
    : null;
  return (
    <AdminShell title={title} subtitle="Read-only view — no changes are saved from this page." allow={allow ?? ["admin", "super_admin", "manager"]}>
      {loading || !header ? (
        notFound ? (
          <div className="card-premium rounded-2xl p-10 text-center">
            <p className="text-sm">Product not found.</p>
            <Link to="/admin-products" className="mt-3 inline-block text-xs text-accent hover:underline">← Back to products</Link>
          </div>
        ) : (
          <div className="grid place-items-center py-24"><Loader2 className="size-5 animate-spin text-accent" /></div>
        )
      ) : (
        <div className="space-y-5">
          <ProductHeaderStrip h={header} active={sectionKey} />
          {children(row!)}
        </div>
      )}
    </AdminShell>
  );
}

export function BackToOverview({ slug }: { slug: string }) {
  return (
    <Link to="/admin-product/$slug" params={{ slug }} className="inline-flex items-center gap-1.5 text-xs text-muted-foreground hover:text-accent">
      <ArrowLeft className="size-3.5" /> Overview
    </Link>
  );
}

export { useNavigate };
