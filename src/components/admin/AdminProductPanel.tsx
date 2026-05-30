import { useState, useEffect } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import {
  Pencil,
  IndianRupee,
  DollarSign,
  Boxes,
  Sparkles,
  Eye,
  EyeOff,
  X,
  Save,
  Settings2,
  Loader2,
  ShieldCheck,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { cn } from "@/lib/utils";
import type { Product } from "@/lib/products";
import { adminUpdateProduct } from "@/lib/admin-products.functions";
import { invalidateProducts } from "@/lib/use-products";

type Patch = {
  name?: string;
  tagline?: string;
  description?: string;
  category?: string;
  sku?: string | null;
  stockQuantity?: number;
  lowStockThreshold?: number;
  priceInr?: number | null;
  comparePriceInr?: number | null;
  priceUsd?: number | null;
  comparePriceUsd?: number | null;
  indiaVisible?: boolean;
  internationalVisible?: boolean;
  featured?: boolean;
  inStock?: boolean;
  rating?: number;
  reviews?: number;
  warranty?: string;
  returnEligible?: boolean;
  replacementEligible?: boolean;
  codEnabled?: boolean;
  pickupSupported?: boolean;
  internationalShipping?: boolean;
  fragile?: boolean;
  returnWindowDays?: number;
};

const numOrNull = (v: string): number | null => {
  const t = v.trim();
  if (t === "") return null;
  const n = Number(t);
  return Number.isFinite(n) ? n : null;
};

/**
 * Hidden admin editing layer for the product page. Rendered only for staff
 * (the parent gates on useIsAdmin). All writes go through the role-protected
 * adminUpdateProduct server function — the panel is purely a UX surface.
 */
export function AdminProductPanel({ product }: { product: Product }) {
  const update = useServerFn(adminUpdateProduct);
  const [open, setOpen] = useState(false);
  const [saving, setSaving] = useState(false);

  // form state
  const [f, setF] = useState(() => toForm(product));
  useEffect(() => setF(toForm(product)), [product.slug]);

  function toForm(p: Product) {
    return {
      name: p.name,
      tagline: p.tagline,
      description: p.description,
      category: p.category,
      sku: p.sku ?? "",
      stockQuantity: String(p.stockQuantity),
      lowStockThreshold: String(p.lowStockThreshold),
      priceInr: p.priceInr != null ? String(p.priceInr) : "",
      comparePriceInr: p.comparePriceInr != null ? String(p.comparePriceInr) : "",
      priceUsd: p.priceUsd != null ? String(p.priceUsd) : "",
      comparePriceUsd: p.comparePriceUsd != null ? String(p.comparePriceUsd) : "",
      indiaVisible: p.indiaVisible,
      internationalVisible: p.internationalVisible,
      featured: p.featured,
      inStock: p.inStock,
      rating: String(p.rating),
      reviews: String(p.reviews),
      warranty: p.warranty ?? "12 months",
      returnEligible: p.returnEligible,
      replacementEligible: p.replacementEligible,
      codEnabled: p.codEnabled,
      pickupSupported: p.pickupSupported,
      internationalShipping: p.internationalShipping,
      fragile: p.fragile,
      returnWindowDays: String(p.returnWindowDays ?? 7),
    };
  }

  async function save(patch: Patch, label = "Saved") {
    setSaving(true);
    try {
      await update({ data: { slug: product.slug, ...patch } });
      await invalidateProducts();
      toast.success(label, {
        description: "Published — your edits are now live for all customers.",
      });
    } catch (e) {
      toast.error("Save failed", {
        description: e instanceof Error ? e.message : "Try again.",
      });
    } finally {
      setSaving(false);
    }
  }

  async function saveAll() {
    await save(
      {
        name: f.name,
        tagline: f.tagline,
        description: f.description,
        category: f.category,
        sku: f.sku || null,
        stockQuantity: Math.max(0, Math.round(Number(f.stockQuantity) || 0)),
        lowStockThreshold: Math.max(0, Math.round(Number(f.lowStockThreshold) || 0)),
        priceInr: numOrNull(f.priceInr),
        comparePriceInr: numOrNull(f.comparePriceInr),
        priceUsd: numOrNull(f.priceUsd),
        comparePriceUsd: numOrNull(f.comparePriceUsd),
        indiaVisible: f.indiaVisible,
        internationalVisible: f.internationalVisible,
        featured: f.featured,
        inStock: f.inStock,
        rating: Math.min(5, Math.max(0, Number(f.rating) || 0)),
        reviews: Math.max(0, Math.round(Number(f.reviews) || 0)),
        warranty: f.warranty.trim() || "12 months",
        returnEligible: f.returnEligible,
        replacementEligible: f.replacementEligible,
        codEnabled: f.codEnabled,
        pickupSupported: f.pickupSupported,
        internationalShipping: f.internationalShipping,
        fragile: f.fragile,
        returnWindowDays: Math.max(0, Math.min(365, Math.round(Number(f.returnWindowDays) || 0))),
      },
      "Product updated",
    );
    setOpen(false);
  }

  return (
    <>
      {/* Admin price cards — always visible to staff on the product page */}
      <div className="mb-6 grid grid-cols-1 sm:grid-cols-2 gap-3">
        <PriceCard
          tone="india"
          icon={<span className="text-lg">🇮🇳</span>}
          title="India price"
          currency="₹"
          price={f.priceInr}
          compare={f.comparePriceInr}
          visible={f.indiaVisible}
          onPrice={(v) => setF({ ...f, priceInr: v })}
          onCompare={(v) => setF({ ...f, comparePriceInr: v })}
          onVisible={(v) => setF({ ...f, indiaVisible: v })}
          onSave={() =>
            save(
              {
                priceInr: numOrNull(f.priceInr),
                comparePriceInr: numOrNull(f.comparePriceInr),
                indiaVisible: f.indiaVisible,
              },
              "INR price updated",
            )
          }
          saving={saving}
        />
        <PriceCard
          tone="intl"
          icon={<span className="text-lg">🌍</span>}
          title="International price"
          currency="$"
          price={f.priceUsd}
          compare={f.comparePriceUsd}
          visible={f.internationalVisible}
          onPrice={(v) => setF({ ...f, priceUsd: v })}
          onCompare={(v) => setF({ ...f, comparePriceUsd: v })}
          onVisible={(v) => setF({ ...f, internationalVisible: v })}
          onSave={() =>
            save(
              {
                priceUsd: numOrNull(f.priceUsd),
                comparePriceUsd: numOrNull(f.comparePriceUsd),
                internationalVisible: f.internationalVisible,
              },
              "USD price updated",
            )
          }
          saving={saving}
        />
      </div>

      {/* Floating admin toolbar */}
      <div className="fixed bottom-[calc(10.75rem+env(safe-area-inset-bottom))] left-1/2 z-40 w-[calc(100vw-1.5rem)] max-w-[420px] -translate-x-1/2 sm:bottom-6 sm:w-auto">
        <div className="flex flex-wrap items-center justify-center gap-1 rounded-3xl border border-accent/30 bg-background/70 px-2 py-1.5 backdrop-blur-2xl shadow-[0_10px_40px_-10px_oklch(0.74_0.19_49/0.5)] sm:flex-nowrap sm:rounded-full">
          <span className="flex items-center gap-1.5 pl-2 pr-1 text-[10px] font-mono uppercase tracking-widest text-accent">
            <ShieldCheck className="size-3.5" /> Admin
          </span>
          <ToolbarBtn icon={Pencil} label="Edit" onClick={() => setOpen(true)} />
          <ToolbarBtn
            icon={f.featured ? Sparkles : Sparkles}
            label={f.featured ? "Featured" : "Feature"}
            active={f.featured}
            onClick={() => {
              const next = !f.featured;
              setF({ ...f, featured: next });
              save({ featured: next }, next ? "Marked featured" : "Removed featured");
            }}
          />
          <ToolbarBtn
            icon={f.inStock ? Eye : EyeOff}
            label={f.inStock ? "Live" : "Hidden"}
            active={f.inStock}
            onClick={() => {
              const next = !f.inStock;
              setF({ ...f, inStock: next });
              save({ inStock: next }, next ? "Published" : "Archived");
            }}
          />
          <ToolbarBtn icon={Settings2} label="Manage" onClick={() => setOpen(true)} />
        </div>
      </div>

      {/* Full inline editor sheet */}
      <AnimatePresence>
        {open && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-50 bg-black/70 backdrop-blur-sm"
            onClick={() => setOpen(false)}
          >
            <motion.div
              initial={{ x: "100%" }}
              animate={{ x: 0 }}
              exit={{ x: "100%" }}
              transition={{ type: "spring", damping: 30, stiffness: 280 }}
              onClick={(e) => e.stopPropagation()}
              className="absolute right-0 top-0 h-full w-full max-w-md overflow-y-auto border-l border-accent/20 bg-background/95 p-5 backdrop-blur-2xl"
            >
              <div className="mb-4 flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <span className="grid size-9 place-items-center rounded-xl border border-accent/30 bg-accent/10 text-accent">
                    <Pencil className="size-4" />
                  </span>
                  <div>
                    <h2 className="font-display font-semibold leading-tight">Inline editor</h2>
                    <p className="text-[10px] font-mono uppercase tracking-widest text-muted-foreground">
                      {product.slug}
                    </p>
                  </div>
                </div>
                <button
                  onClick={() => setOpen(false)}
                  className="grid size-8 place-items-center rounded-full border border-white/10 text-muted-foreground hover:text-foreground"
                >
                  <X className="size-4" />
                </button>
              </div>

              <div className="space-y-4">
                <Field label="Title">
                  <Input value={f.name} onChange={(e) => setF({ ...f, name: e.target.value })} />
                </Field>
                <Field label="Short description / tagline">
                  <Input value={f.tagline} onChange={(e) => setF({ ...f, tagline: e.target.value })} />
                </Field>
                <Field label="Description">
                  <Textarea
                    rows={5}
                    value={f.description}
                    onChange={(e) => setF({ ...f, description: e.target.value })}
                  />
                </Field>
                <div className="grid grid-cols-2 gap-3">
                  <Field label="Category">
                    <Input value={f.category} onChange={(e) => setF({ ...f, category: e.target.value })} />
                  </Field>
                  <Field label="SKU">
                    <Input value={f.sku} onChange={(e) => setF({ ...f, sku: e.target.value })} />
                  </Field>
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <Field label="Stock quantity">
                    <Input
                      type="number"
                      value={f.stockQuantity}
                      onChange={(e) => setF({ ...f, stockQuantity: e.target.value })}
                    />
                  </Field>
                  <Field label="Low-stock threshold">
                    <Input
                      type="number"
                      value={f.lowStockThreshold}
                      onChange={(e) => setF({ ...f, lowStockThreshold: e.target.value })}
                    />
                  </Field>
                </div>

                <div className="grid grid-cols-3 gap-3">
                  <Field label="Rating (0–5)">
                    <Input
                      type="number"
                      step="0.1"
                      value={f.rating}
                      onChange={(e) => setF({ ...f, rating: e.target.value })}
                    />
                  </Field>
                  <Field label="Reviews">
                    <Input
                      type="number"
                      value={f.reviews}
                      onChange={(e) => setF({ ...f, reviews: e.target.value })}
                    />
                  </Field>
                  <Field label="Warranty">
                    <Input
                      value={f.warranty}
                      onChange={(e) => setF({ ...f, warranty: e.target.value })}
                    />
                  </Field>
                </div>

                <div className="grid grid-cols-2 gap-3">
                  <Field label="₹ India price">
                    <Input value={f.priceInr} onChange={(e) => setF({ ...f, priceInr: e.target.value })} />
                  </Field>
                  <Field label="₹ Compare at">
                    <Input
                      value={f.comparePriceInr}
                      onChange={(e) => setF({ ...f, comparePriceInr: e.target.value })}
                    />
                  </Field>
                  <Field label="$ Intl price">
                    <Input value={f.priceUsd} onChange={(e) => setF({ ...f, priceUsd: e.target.value })} />
                  </Field>
                  <Field label="$ Compare at">
                    <Input
                      value={f.comparePriceUsd}
                      onChange={(e) => setF({ ...f, comparePriceUsd: e.target.value })}
                    />
                  </Field>
                </div>

                <div className="grid grid-cols-2 gap-2">
                  <Toggle label="Visible in India" on={f.indiaVisible} onClick={() => setF({ ...f, indiaVisible: !f.indiaVisible })} />
                  <Toggle label="Visible globally" on={f.internationalVisible} onClick={() => setF({ ...f, internationalVisible: !f.internationalVisible })} />
                  <Toggle label="Featured" on={f.featured} onClick={() => setF({ ...f, featured: !f.featured })} />
                  <Toggle label="In stock / live" on={f.inStock} onClick={() => setF({ ...f, inStock: !f.inStock })} />
                </div>

                {/* Eligibility & policies */}
                <div className="rounded-2xl border border-accent/20 bg-white/[0.02] p-3.5">
                  <p className="mb-2.5 flex items-center gap-1.5 text-[10px] font-mono uppercase tracking-widest text-accent">
                    <ShieldCheck className="size-3.5" /> Return &amp; refund eligibility
                  </p>
                  <div className="grid grid-cols-2 gap-2">
                    <Toggle label="Return eligible" on={f.returnEligible} onClick={() => setF({ ...f, returnEligible: !f.returnEligible })} />
                    <Toggle label="Replacement eligible" on={f.replacementEligible} onClick={() => setF({ ...f, replacementEligible: !f.replacementEligible })} />
                    <Toggle label="Cash on delivery" on={f.codEnabled} onClick={() => setF({ ...f, codEnabled: !f.codEnabled })} />
                    <Toggle label="Pickup supported" on={f.pickupSupported} onClick={() => setF({ ...f, pickupSupported: !f.pickupSupported })} />
                    <Toggle label="International shipping" on={f.internationalShipping} onClick={() => setF({ ...f, internationalShipping: !f.internationalShipping })} />
                    <Toggle label="Fragile item" on={f.fragile} onClick={() => setF({ ...f, fragile: !f.fragile })} />
                  </div>
                  <div className="mt-3">
                    <Field label="Return / refund window (days)">
                      <Input
                        type="number"
                        value={f.returnWindowDays}
                        onChange={(e) => setF({ ...f, returnWindowDays: e.target.value })}
                      />
                    </Field>
                  </div>
                </div>
              </div>

              <div className="sticky bottom-0 mt-6 -mx-5 border-t border-white/10 bg-background/95 px-5 py-3">
                <Button className="w-full" disabled={saving} onClick={saveAll}>
                  {saving ? <Loader2 className="size-4 animate-spin" /> : <Save className="size-4" />}
                  Save all changes
                </Button>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </>
  );
}

function PriceCard(props: {
  tone: "india" | "intl";
  icon: React.ReactNode;
  title: string;
  currency: string;
  price: string;
  compare: string;
  visible: boolean;
  onPrice: (v: string) => void;
  onCompare: (v: string) => void;
  onVisible: (v: boolean) => void;
  onSave: () => void;
  saving: boolean;
}) {
  return (
    <div className="rounded-2xl border border-accent/20 bg-white/[0.02] p-3.5 backdrop-blur-xl">
      <div className="mb-2.5 flex items-center justify-between">
        <div className="flex items-center gap-2 text-xs font-mono uppercase tracking-widest text-muted-foreground">
          {props.icon} {props.title}
        </div>
        <button
          onClick={() => props.onVisible(!props.visible)}
          className={cn(
            "grid size-6 place-items-center rounded-md border text-[10px]",
            props.visible
              ? "border-accent/40 bg-accent/10 text-accent"
              : "border-white/10 text-muted-foreground/60",
          )}
          aria-label="Toggle region visibility"
        >
          {props.visible ? <Eye className="size-3" /> : <EyeOff className="size-3" />}
        </button>
      </div>
      <div className="grid grid-cols-2 gap-2">
        <label className="text-[9px] font-mono uppercase tracking-widest text-muted-foreground/70">
          Price
          <div className="mt-1 flex items-center rounded-lg border border-white/10 bg-black/20 px-2">
            <span className="text-sm text-accent">{props.currency}</span>
            <input
              value={props.price}
              onChange={(e) => props.onPrice(e.target.value)}
              inputMode="decimal"
              className="w-full bg-transparent py-1.5 pl-1 text-sm text-foreground outline-none"
            />
          </div>
        </label>
        <label className="text-[9px] font-mono uppercase tracking-widest text-muted-foreground/70">
          Compare
          <div className="mt-1 flex items-center rounded-lg border border-white/10 bg-black/20 px-2">
            <span className="text-sm text-muted-foreground">{props.currency}</span>
            <input
              value={props.compare}
              onChange={(e) => props.onCompare(e.target.value)}
              inputMode="decimal"
              className="w-full bg-transparent py-1.5 pl-1 text-sm text-foreground outline-none"
            />
          </div>
        </label>
      </div>
      <Button size="sm" variant="outline" className="mt-2.5 h-8 w-full text-xs" disabled={props.saving} onClick={props.onSave}>
        {props.saving ? <Loader2 className="size-3.5 animate-spin" /> : <Save className="size-3.5" />}
        Save {props.currency} price
      </Button>
    </div>
  );
}

function ToolbarBtn({
  icon: Icon,
  label,
  onClick,
  active,
}: {
  icon: typeof Pencil;
  label: string;
  onClick: () => void;
  active?: boolean;
}) {
  return (
    <button
      onClick={onClick}
      className={cn(
        "flex items-center gap-1.5 rounded-full px-3 py-1.5 text-xs font-medium transition-all",
        active ? "bg-accent/20 text-accent" : "text-muted-foreground hover:bg-white/5 hover:text-foreground",
      )}
    >
      <Icon className="size-3.5" />
      <span>{label}</span>
    </button>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="block">
      <span className="mb-1 block text-[10px] font-mono uppercase tracking-widest text-muted-foreground">
        {label}
      </span>
      {children}
    </label>
  );
}

function Toggle({ label, on, onClick }: { label: string; on: boolean; onClick: () => void }) {
  return (
    <button
      onClick={onClick}
      className={cn(
        "flex items-center justify-between rounded-lg border px-3 py-2 text-xs transition-all",
        on ? "border-accent/40 bg-accent/10 text-accent" : "border-white/10 text-muted-foreground",
      )}
    >
      {label}
      <span className={cn("size-2 rounded-full", on ? "bg-accent" : "bg-muted-foreground/40")} />
    </button>
  );
}
