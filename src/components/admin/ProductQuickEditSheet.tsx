import { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import { useServerFn } from "@tanstack/react-start";
import { motion, AnimatePresence } from "framer-motion";
import { toast } from "sonner";
import { X, Loader2, ShieldCheck, Save, ExternalLink } from "lucide-react";
import { useNavigate } from "@tanstack/react-router";
import type { Product, ProductStatus } from "@/lib/products";
import { resolveImage } from "@/lib/products";
import { adminUpdateProduct } from "@/lib/admin-products.functions";
import { invalidateProducts } from "@/lib/use-products";
import { ProductBadgeManager } from "@/components/admin/ProductBadgeManager";
import { cn } from "@/lib/utils";

const STATUSES: ProductStatus[] = [
  "draft",
  "published",
  "hidden",
  "archived",
  "scheduled",
  "preorder",
  "out_of_stock",
];

type Form = {
  name: string;
  status: ProductStatus;
  priceInr: string;
  priceUsd: string;
  stockQuantity: string;
  inStock: boolean;
  featured: boolean;
  trending: boolean;
  bestseller: boolean;
  flashDeal: boolean;
};

function toForm(p: Product): Form {
  return {
    name: p.name,
    status: p.status,
    priceInr: p.priceInr != null ? String(p.priceInr) : "",
    priceUsd: p.priceUsd != null ? String(p.priceUsd) : "",
    stockQuantity: String(p.stockQuantity ?? 0),
    inStock: p.inStock,
    featured: p.featured,
    trending: p.trending,
    bestseller: p.bestseller,
    flashDeal: p.flashDeal,
  };
}

/**
 * Compact inline mini-editor for a single product, opened from the card
 * quick-action menu. Edits the highest-frequency fields (title, status,
 * regional price, stock) without leaving the storefront. Every save runs
 * through the staff-gated adminUpdateProduct server function, so this is a
 * pure UX surface — RLS + role checks remain the source of truth.
 */
export function ProductQuickEditSheet({
  product,
  open,
  onClose,
}: {
  product: Product;
  open: boolean;
  onClose: () => void;
}) {
  const update = useServerFn(adminUpdateProduct);
  const navigate = useNavigate();
  const [form, setForm] = useState<Form>(() => toForm(product));
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (open) setForm(toForm(product));
  }, [open, product]);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, onClose]);

  function set<K extends keyof Form>(key: K, value: Form[K]) {
    setForm((f) => ({ ...f, [key]: value }));
  }

  async function save() {
    setSaving(true);
    try {
      const priceInr = form.priceInr.trim() === "" ? null : Number(form.priceInr);
      const priceUsd = form.priceUsd.trim() === "" ? null : Number(form.priceUsd);
      if (priceInr != null && (!Number.isFinite(priceInr) || priceInr < 0))
        throw new Error("INR price must be a positive number.");
      if (priceUsd != null && (!Number.isFinite(priceUsd) || priceUsd < 0))
        throw new Error("USD price must be a positive number.");
      const stockQuantity = Math.max(0, Math.floor(Number(form.stockQuantity) || 0));

      await update({
        data: {
          slug: product.slug,
          name: form.name.trim() || product.name,
          status: form.status,
          priceInr,
          priceUsd,
          stockQuantity,
          inStock: form.inStock,
          featured: form.featured,
          trending: form.trending,
          bestseller: form.bestseller,
          flashDeal: form.flashDeal,
        },
      });
      await invalidateProducts();
      toast.success("Product updated");
      onClose();
    } catch (e) {
      toast.error("Save failed", {
        description: e instanceof Error ? e.message : "Try again.",
      });
    } finally {
      setSaving(false);
    }
  }

  if (typeof document === "undefined") return null;

  return createPortal(
    <AnimatePresence>
      {open && (
        <div className="fixed inset-0 z-[120] flex items-end justify-center sm:items-center print:hidden">
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="absolute inset-0 bg-background/70 backdrop-blur-sm"
            onClick={onClose}
          />
          <motion.div
            initial={{ opacity: 0, y: 24, scale: 0.98 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 24, scale: 0.98 }}
            transition={{ type: "spring", stiffness: 280, damping: 28 }}
            className="relative z-10 w-full max-w-md overflow-hidden rounded-t-3xl border border-accent/25 bg-background/95 backdrop-blur-2xl shadow-[0_30px_80px_-20px_oklch(0.74_0.19_49/0.5)] sm:rounded-3xl"
          >
            {/* Header */}
            <div className="flex items-center gap-3 border-b border-border/60 px-4 py-3">
              <div className="size-11 shrink-0 overflow-hidden rounded-xl border border-border bg-card">
                {product.image && (
                  <img loading="lazy" decoding="async" src={resolveImage(product.image)} alt="" className="size-full object-cover" />
                )}
              </div>
              <div className="min-w-0 flex-1">
                <p className="flex items-center gap-1.5 text-[9px] font-mono uppercase tracking-[0.25em] text-accent">
                  <ShieldCheck className="size-3" /> Quick edit
                </p>
                <p className="truncate text-sm font-medium">{product.name}</p>
              </div>
              <button
                onClick={onClose}
                aria-label="Close"
                className="grid size-8 shrink-0 place-items-center rounded-full text-muted-foreground hover:bg-white/5 hover:text-foreground"
              >
                <X className="size-4" />
              </button>
            </div>

            {/* Body */}
            <div className="max-h-[60vh] space-y-4 overflow-y-auto px-4 py-4">
              <Field label="Title">
                <input
                  value={form.name}
                  onChange={(e) => set("name", e.target.value)}
                  className="quick-input"
                />
              </Field>

              <Field label="Status">
                <div className="flex flex-wrap gap-1.5">
                  {STATUSES.map((s) => (
                    <button
                      key={s}
                      onClick={() => set("status", s)}
                      className={cn(
                        "rounded-lg border px-2.5 py-1 text-[11px] font-mono uppercase tracking-wider transition-colors",
                        form.status === s
                          ? "border-accent/60 bg-accent/15 text-accent"
                          : "border-border bg-card text-muted-foreground hover:text-foreground",
                      )}
                    >
                      {s.replace("_", " ")}
                    </button>
                  ))}
                </div>
              </Field>

              <div className="grid grid-cols-2 gap-3">
                <Field label="Price (INR ₹)">
                  <input
                    inputMode="decimal"
                    value={form.priceInr}
                    onChange={(e) => set("priceInr", e.target.value)}
                    placeholder="—"
                    className="quick-input"
                  />
                </Field>
                <Field label="Price (USD $)">
                  <input
                    inputMode="decimal"
                    value={form.priceUsd}
                    onChange={(e) => set("priceUsd", e.target.value)}
                    placeholder="—"
                    className="quick-input"
                  />
                </Field>
              </div>

              <Field label="Stock quantity">
                <input
                  inputMode="numeric"
                  value={form.stockQuantity}
                  onChange={(e) => set("stockQuantity", e.target.value)}
                  className="quick-input"
                />
              </Field>

              <Toggle label="In stock" value={form.inStock} onChange={(v) => set("inStock", v)} />


              <Field label="Collection badges">
                <div className="grid grid-cols-2 gap-3">
                  <Toggle label="Trending" value={form.trending} onChange={(v) => set("trending", v)} />
                  <Toggle label="Best seller" value={form.bestseller} onChange={(v) => set("bestseller", v)} />
                  <Toggle label="Flash deal (Active)" value={form.flashDeal} onChange={(v) => set("flashDeal", v)} />
                  <Toggle label="Featured" value={form.featured} onChange={(v) => set("featured", v)} />
                </div>
              </Field>

              <Field label="Badges">
                <ProductBadgeManager slug={product.slug} />
              </Field>
            </div>

            {/* Footer */}
            <div className="flex items-center gap-2 border-t border-border/60 px-4 py-3">
              <button
                onClick={() => {
                  onClose();
                  navigate({ to: "/products/$slug", params: { slug: product.slug } });
                }}
                className="inline-flex items-center gap-1.5 rounded-xl border border-border px-3 py-2.5 text-xs text-muted-foreground transition-colors hover:text-foreground"
              >
                <ExternalLink className="size-3.5" /> Full editor
              </button>
              <button
                onClick={save}
                disabled={saving}
                className="ml-auto inline-flex items-center gap-2 rounded-xl bg-accent px-4 py-2.5 text-xs font-semibold text-accent-foreground transition-all hover:brightness-110 disabled:opacity-60"
              >
                {saving ? <Loader2 className="size-3.5 animate-spin" /> : <Save className="size-3.5" />}
                Save changes
              </button>
            </div>
          </motion.div>

          <style>{`
            .quick-input {
              width: 100%;
              border-radius: 0.625rem;
              border: 1px solid hsl(var(--border, 0 0% 20%));
              background: color-mix(in oklab, var(--card) 80%, transparent);
              padding: 0.55rem 0.7rem;
              font-size: 0.8125rem;
              color: var(--foreground);
              outline: none;
              transition: border-color 0.2s;
            }
            .quick-input:focus { border-color: color-mix(in oklab, var(--accent) 55%, transparent); }
          `}</style>
        </div>
      )}
    </AnimatePresence>,
    document.body,
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="block">
      <span className="mb-1.5 block text-[10px] font-mono uppercase tracking-widest text-muted-foreground">
        {label}
      </span>
      {children}
    </label>
  );
}

function Toggle({
  label,
  value,
  onChange,
}: {
  label: string;
  value: boolean;
  onChange: (v: boolean) => void;
}) {
  return (
    <button
      onClick={() => onChange(!value)}
      className={cn(
        "flex items-center justify-between rounded-xl border px-3 py-2.5 transition-all",
        value ? "border-accent/50 bg-accent/15" : "border-border bg-card hover:border-accent/30",
      )}
    >
      <span className="text-xs font-medium text-foreground">{label}</span>
      <span
        className={cn("relative h-5 w-9 rounded-full transition-colors", value ? "bg-accent" : "bg-white/15")}
        aria-hidden
      >
        <span
          className={cn(
            "absolute top-0.5 size-4 rounded-full bg-white transition-transform",
            value ? "translate-x-[1.125rem]" : "translate-x-0.5",
          )}
        />
      </span>
    </button>
  );
}
