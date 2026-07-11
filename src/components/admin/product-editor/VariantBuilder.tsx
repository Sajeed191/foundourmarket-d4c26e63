import { useEffect, useMemo, useRef, useState } from "react";
import { Layers, Loader2, Plus, Trash2, Save, Wand2, AlertTriangle, Check, Upload } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { invalidateProducts } from "@/lib/use-products";
import {
  fetchAdminVariants,
  fetchHasVariants,
  setHasVariants,
  saveVariants,
  variantLabel,
  COMMON_SIZES,
  COMMON_COLORS,
  type AdminVariant,
} from "@/lib/product-variants";

/**
 * Self-contained Size/Colour variant builder for a single product `slug`.
 *
 * This is the SAME builder used by the full-page editor route
 * (`/admin-product/$slug/variants`); it is extracted here so the inline
 * Product Editor modal (Add / Edit Product) can render it without duplicating
 * any of the persistence logic in `@/lib/product-variants`.
 *
 * Variants require an existing product row (they reference the product by
 * slug), so callers must only mount this once the product has been saved.
 */

type Row = Omit<AdminVariant, "productSlug">;

function blankRow(size: string | null, color: string | null, colorHex: string | null): Row {
  return {
    id: `new-${Math.random().toString(36).slice(2, 9)}`,
    name: variantLabel(size, color),
    sku: null, size, color, colorHex,
    imageUrl: null, priceAdjustment: 0, comparePrice: null,
    barcode: null, weight: null, stockQuantity: 0, lowStockThreshold: 5,
    active: true, sortOrder: 0, version: 1,
  };
}
const isNew = (id: string) => id.startsWith("new-");

export function VariantBuilder({ slug }: { slug: string }) {
  const [loading, setLoading] = useState(true);
  const [enabled, setEnabled] = useState(false);
  const [rows, setRows] = useState<Row[]>([]);
  const [saving, setSaving] = useState(false);

  // Combination generator inputs
  const [selSizes, setSelSizes] = useState<string[]>([]);
  const [customSize, setCustomSize] = useState("");
  const [selColors, setSelColors] = useState<{ name: string; hex: string }[]>([]);
  const [customColor, setCustomColor] = useState("");
  const [customHex, setCustomHex] = useState("#111111");

  useEffect(() => {
    let active = true;
    setLoading(true);
    (async () => {
      const [hv, vars] = await Promise.all([fetchHasVariants(slug), fetchAdminVariants(slug)]);
      if (!active) return;
      setEnabled(hv);
      setRows(vars.map(({ productSlug: _p, ...r }) => r));
      setLoading(false);
    })().catch(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, [slug]);

  const toggleSize = (s: string) =>
    setSelSizes((p) => (p.includes(s) ? p.filter((x) => x !== s) : [...p, s]));
  const toggleColor = (c: { name: string; hex: string }) =>
    setSelColors((p) => (p.some((x) => x.name === c.name) ? p.filter((x) => x.name !== c.name) : [...p, c]));

  function addCustomSize() {
    const s = customSize.trim();
    if (s && !selSizes.includes(s)) setSelSizes((p) => [...p, s]);
    setCustomSize("");
  }
  function addCustomColor() {
    const name = customColor.trim();
    if (name && !selColors.some((c) => c.name === name)) setSelColors((p) => [...p, { name, hex: customHex }]);
    setCustomColor("");
  }

  function generate() {
    const sizes = selSizes.length ? selSizes : [null];
    const colors = selColors.length ? selColors : [null];
    if (selSizes.length === 0 && selColors.length === 0) {
      toast.error("Pick at least one size or colour first");
      return;
    }
    const existing = new Set(rows.map((r) => `${r.size ?? ""}|${r.color ?? ""}`));
    const additions: Row[] = [];
    for (const c of colors) {
      for (const s of sizes) {
        const key = `${(s as string) ?? ""}|${(c as any)?.name ?? ""}`;
        if (existing.has(key)) continue;
        existing.add(key);
        additions.push(blankRow(s as string | null, (c as any)?.name ?? null, (c as any)?.hex ?? null));
      }
    }
    if (!additions.length) { toast.info("All those combinations already exist"); return; }
    setRows((p) => [...p, ...additions]);
    toast.success(`${additions.length} combination${additions.length === 1 ? "" : "s"} added`);
  }

  function updateRow(id: string, patch: Partial<Row>) {
    setRows((p) => p.map((r) => (r.id === id ? { ...r, ...patch } : r)));
  }
  function removeRow(id: string) {
    setRows((p) => p.filter((r) => r.id !== id));
  }
  function duplicateRow(id: string) {
    setRows((p) => {
      const src = p.find((r) => r.id === id);
      if (!src) return p;
      return [...p, { ...src, id: `new-${Math.random().toString(36).slice(2, 9)}`, sku: null }];
    });
  }

  async function onToggleEnabled(v: boolean) {
    setEnabled(v);
    try {
      await setHasVariants(slug, v);
      invalidateProducts();
      toast.success(v ? "Variants enabled" : "Variants disabled");
    } catch (e: any) {
      setEnabled(!v);
      toast.error("Could not update", { description: e?.message });
    }
  }

  const dupWarning = useMemo(() => {
    const seen = new Set<string>();
    for (const r of rows) {
      const k = `${r.size ?? ""}|${r.color ?? ""}`;
      if (seen.has(k)) return true;
      seen.add(k);
    }
    return false;
  }, [rows]);

  async function save() {
    if (dupWarning) { toast.error("Remove duplicate Size + Colour combinations first"); return; }
    setSaving(true);
    try {
      await saveVariants(
        slug,
        rows.map((r) => ({ ...r, id: isNew(r.id) ? undefined : r.id })),
      );
      const fresh = await fetchAdminVariants(slug);
      setRows(fresh.map(({ productSlug: _p, ...r }) => r));
      invalidateProducts();
      toast.success("Variants saved");
    } catch (e: any) {
      toast.error("Save failed", { description: e?.message });
    } finally {
      setSaving(false);
    }
  }

  if (loading) {
    return <div className="grid place-items-center py-12"><Loader2 className="size-5 animate-spin text-accent" /></div>;
  }

  return (
    <div className="space-y-4">
      {/* Enable toggle */}
      <div className="card-premium rounded-2xl p-4">
        <div className="flex items-center gap-2 mb-3">
          <Layers className="size-4 text-accent" />
          <h3 className="text-sm font-medium">Product Variants</h3>
        </div>
        <label className="flex items-start gap-3 cursor-pointer">
          <input type="checkbox" checked={enabled} onChange={(e) => onToggleEnabled(e.target.checked)} className="mt-0.5 accent-[var(--accent)]" />
          <span>
            <span className="block text-sm">Enable variants for this product</span>
            <span className="block text-xs text-muted-foreground mt-0.5">When off, this product is sold as a single item with no size/colour options. Existing catalog, cart and checkout are unaffected.</span>
          </span>
        </label>
      </div>

      {enabled && (
        <>
          {/* Combination generator */}
          <div className="card-premium rounded-2xl p-4 space-y-4">
            <div className="flex items-center gap-2">
              <Wand2 className="size-4 text-accent" />
              <h3 className="text-sm font-medium">Build combinations</h3>
            </div>

            <div>
              <p className="text-[9px] font-mono uppercase tracking-[0.2em] text-muted-foreground mb-2">Sizes</p>
              <div className="flex flex-wrap gap-2">
                {COMMON_SIZES.map((s) => (
                  <Chip key={s} active={selSizes.includes(s)} onClick={() => toggleSize(s)}>{s}</Chip>
                ))}
                {selSizes.filter((s) => !COMMON_SIZES.includes(s as any)).map((s) => (
                  <Chip key={s} active onClick={() => toggleSize(s)}>{s}</Chip>
                ))}
              </div>
              <div className="flex gap-2 mt-2">
                <input value={customSize} onChange={(e) => setCustomSize(e.target.value)}
                  onKeyDown={(e) => e.key === "Enter" && (e.preventDefault(), addCustomSize())}
                  placeholder="Custom size" className="flex-1 bg-white/[0.03] border border-white/10 rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-accent/40" />
                <button type="button" onClick={addCustomSize} className="rounded-lg border border-white/12 px-3 text-xs hover:border-white/25">Add</button>
              </div>
            </div>

            <div>
              <p className="text-[9px] font-mono uppercase tracking-[0.2em] text-muted-foreground mb-2">Colours</p>
              <div className="flex flex-wrap gap-2">
                {COMMON_COLORS.map((c) => (
                  <SwatchChip key={c.name} active={selColors.some((x) => x.name === c.name)} hex={c.hex} onClick={() => toggleColor(c)}>{c.name}</SwatchChip>
                ))}
                {selColors.filter((c) => !COMMON_COLORS.some((x) => x.name === c.name)).map((c) => (
                  <SwatchChip key={c.name} active hex={c.hex} onClick={() => toggleColor(c)}>{c.name}</SwatchChip>
                ))}
              </div>
              <div className="flex gap-2 mt-2">
                <input type="color" value={customHex} onChange={(e) => setCustomHex(e.target.value)}
                  className="h-9 w-11 rounded-lg border border-white/10 bg-transparent p-0.5" aria-label="Custom colour swatch" />
                <input value={customColor} onChange={(e) => setCustomColor(e.target.value)}
                  onKeyDown={(e) => e.key === "Enter" && (e.preventDefault(), addCustomColor())}
                  placeholder="Custom colour name" className="flex-1 bg-white/[0.03] border border-white/10 rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-accent/40" />
                <button type="button" onClick={addCustomColor} className="rounded-lg border border-white/12 px-3 text-xs hover:border-white/25">Add</button>
              </div>
            </div>

            <button type="button" onClick={generate}
              className="inline-flex items-center gap-2 rounded-full bg-accent px-4 py-2 text-xs font-semibold text-accent-foreground hover:brightness-110">
              <Plus className="size-3.5" /> Generate combinations
            </button>
          </div>

          {dupWarning && (
            <div className="flex items-center gap-2 rounded-lg border border-amber-500/30 bg-amber-500/10 px-3 py-2 text-xs text-amber-300">
              <AlertTriangle className="size-3.5 shrink-0" /> Duplicate Size + Colour combinations exist — remove them before saving.
            </div>
          )}

          {/* Variant rows */}
          <div className="space-y-3">
            {rows.length === 0 && (
              <div className="card-premium rounded-2xl p-8 text-center text-sm text-muted-foreground">
                No variants yet. Pick sizes/colours above and generate combinations, or
                <button type="button" onClick={() => setRows((p) => [...p, blankRow(null, null, null)])} className="ml-1 text-accent hover:underline">add one manually</button>.
              </div>
            )}
            {rows.map((r) => (
              <VariantCard key={r.id} r={r} onChange={(p) => updateRow(r.id, p)} onRemove={() => removeRow(r.id)} onDuplicate={() => duplicateRow(r.id)} />
            ))}
          </div>

          {/* Save */}
          <div className="flex items-center gap-2">
            <span className="text-xs text-muted-foreground">{rows.length} variant{rows.length === 1 ? "" : "s"}</span>
            <button type="button" onClick={save} disabled={saving || dupWarning}
              className="ml-auto inline-flex items-center gap-2 rounded-lg bg-accent px-5 py-2.5 text-sm font-semibold text-accent-foreground hover:brightness-110 disabled:opacity-50">
              {saving ? <Loader2 className="size-4 animate-spin" /> : <Save className="size-4" />} Save variants
            </button>
          </div>
        </>
      )}
    </div>
  );
}

function Chip({ active, onClick, children }: { active: boolean; onClick: () => void; children: React.ReactNode }) {
  return (
    <button type="button" onClick={onClick}
      className={`rounded-lg px-3 py-1.5 text-xs font-medium border transition-colors ${active ? "bg-accent/15 text-accent border-accent/40" : "border-white/12 text-muted-foreground hover:border-white/25"}`}>
      {children}
    </button>
  );
}

function SwatchChip({ active, hex, onClick, children }: { active: boolean; hex: string; onClick: () => void; children: React.ReactNode }) {
  return (
    <button type="button" onClick={onClick}
      className={`inline-flex items-center gap-1.5 rounded-lg px-2.5 py-1.5 text-xs font-medium border transition-colors ${active ? "bg-accent/15 text-accent border-accent/40" : "border-white/12 text-muted-foreground hover:border-white/25"}`}>
      <span className="size-3.5 rounded-full border border-white/20" style={{ background: hex }} />
      {children}
      {active && <Check className="size-3" />}
    </button>
  );
}

function VField({ label, value, onChange, type = "text", hint, className }: {
  label: string; value: string; onChange: (v: string) => void; type?: string; hint?: string; className?: string;
}) {
  return (
    <div className={className}>
      <label className="block text-[9px] font-mono uppercase tracking-[0.2em] text-muted-foreground mb-1.5">{label}</label>
      <input type={type} value={value} onChange={(e) => onChange(e.target.value)}
        className="w-full bg-white/[0.03] border border-white/10 rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-accent/40" />
      {hint && <p className="mt-1 text-[10px] text-muted-foreground">{hint}</p>}
    </div>
  );
}

function VariantCard({ r, onChange, onRemove, onDuplicate }: {
  r: Row; onChange: (p: Partial<Row>) => void; onRemove: () => void; onDuplicate: () => void;
}) {
  const low = r.stockQuantity <= r.lowStockThreshold;
  const fileRef = useRef<HTMLInputElement>(null);
  const [uploading, setUploading] = useState(false);

  async function uploadImage(file: File) {
    setUploading(true);
    try {
      const ext = file.name.split(".").pop() ?? "jpg";
      const path = `variants/${Date.now()}-${Math.random().toString(36).slice(2, 8)}.${ext}`;
      const { error } = await supabase.storage.from("product-images").upload(path, file, { contentType: file.type });
      if (error) throw error;
      const { data } = supabase.storage.from("product-images").getPublicUrl(path);
      onChange({ imageUrl: data.publicUrl });
      toast.success("Variant image uploaded");
    } catch (e: any) {
      toast.error("Upload failed", { description: e?.message });
    } finally {
      setUploading(false);
    }
  }
  return (
    <div className="card-premium rounded-2xl p-4">
      <div className="flex items-center justify-between gap-2 mb-3">
        <div className="flex items-center gap-2 min-w-0">
          {r.colorHex && <span className="size-4 rounded-full border border-white/20 shrink-0" style={{ background: r.colorHex }} />}
          <span className="text-sm font-medium truncate">{variantLabel(r.size, r.color)}</span>
          {!r.active && <span className="rounded-full bg-white/10 px-2 py-0.5 text-[10px] text-muted-foreground">inactive</span>}
          {r.active && low && <span className="rounded-full bg-amber-500/15 px-2 py-0.5 text-[10px] text-amber-400">low stock</span>}
        </div>
        <div className="flex items-center gap-1 shrink-0">
          <button type="button" onClick={onDuplicate} title="Duplicate" className="grid size-8 place-items-center rounded-lg border border-white/10 text-muted-foreground hover:text-foreground hover:border-white/25">
            <Plus className="size-3.5" />
          </button>
          <button type="button" onClick={onRemove} title="Remove" className="grid size-8 place-items-center rounded-lg border border-white/10 text-muted-foreground hover:text-destructive hover:border-destructive/40">
            <Trash2 className="size-3.5" />
          </button>
        </div>
      </div>

      <div className="grid grid-cols-2 gap-3">
        <VField label="Size" value={r.size ?? ""} onChange={(v) => onChange({ size: v || null })} />
        <VField label="Colour" value={r.color ?? ""} onChange={(v) => onChange({ color: v || null })} />
        <div>
          <label className="block text-[9px] font-mono uppercase tracking-[0.2em] text-muted-foreground mb-1.5">Swatch</label>
          <div className="flex gap-2">
            <input type="color" value={r.colorHex ?? "#111111"} onChange={(e) => onChange({ colorHex: e.target.value })}
              className="h-9 w-11 rounded-lg border border-white/10 bg-transparent p-0.5" aria-label="Variant swatch" />
            <input value={r.colorHex ?? ""} onChange={(e) => onChange({ colorHex: e.target.value || null })} placeholder="#hex"
              className="flex-1 bg-white/[0.03] border border-white/10 rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-accent/40" />
          </div>
        </div>
        <VField label="SKU" value={r.sku ?? ""} onChange={(v) => onChange({ sku: v || null })} />
        <VField label="Stock" type="number" value={String(r.stockQuantity)} onChange={(v) => onChange({ stockQuantity: Number(v) || 0 })} />
        <VField label="Low-stock alert" type="number" value={String(r.lowStockThreshold)} onChange={(v) => onChange({ lowStockThreshold: Number(v) || 0 })} />
        <VField label="Price adjustment" type="number" value={String(r.priceAdjustment)} onChange={(v) => onChange({ priceAdjustment: Number(v) || 0 })} hint="Added to the base price (can be negative)" />
        <VField label="Compare price" type="number" value={r.comparePrice != null ? String(r.comparePrice) : ""} onChange={(v) => onChange({ comparePrice: v.trim() === "" ? null : Number(v) })} />
        <VField label="Barcode" value={r.barcode ?? ""} onChange={(v) => onChange({ barcode: v || null })} />
        <VField label="Weight" type="number" value={r.weight != null ? String(r.weight) : ""} onChange={(v) => onChange({ weight: v.trim() === "" ? null : Number(v) })} />
        <div className="col-span-2">
          <label className="block text-[9px] font-mono uppercase tracking-[0.2em] text-muted-foreground mb-1.5">Variant image (optional)</label>
          <div className="flex items-center gap-2">
            {r.imageUrl ? (
              <img src={r.imageUrl} alt="Variant" className="size-11 shrink-0 rounded-lg object-cover border border-white/10" />
            ) : (
              <div className="size-11 shrink-0 rounded-lg border border-dashed border-white/15 grid place-items-center text-muted-foreground"><Upload className="size-4" /></div>
            )}
            <input value={r.imageUrl ?? ""} onChange={(e) => onChange({ imageUrl: e.target.value || null })} placeholder="Paste image URL or upload"
              className="flex-1 bg-white/[0.03] border border-white/10 rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-accent/40" />
            <input ref={fileRef} type="file" accept="image/*" className="hidden"
              onChange={(e) => { const f = e.target.files?.[0]; if (f) uploadImage(f); e.currentTarget.value = ""; }} />
            <button type="button" onClick={() => fileRef.current?.click()} disabled={uploading}
              className="shrink-0 inline-flex items-center gap-1.5 rounded-lg border border-white/12 px-3 py-2 text-xs hover:border-white/25 disabled:opacity-50">
              {uploading ? <Loader2 className="size-3.5 animate-spin" /> : <Upload className="size-3.5" />} Upload
            </button>
          </div>
        </div>
      </div>

      <div className="mt-3">
        <label className="flex items-center gap-2 text-sm">
          <input type="checkbox" checked={r.active} onChange={(e) => onChange({ active: e.target.checked })} className="accent-[var(--accent)]" />
          Active
        </label>
        <p className="mt-1 text-[10px] text-muted-foreground">Inactive variants are hidden from customers but kept for records.</p>
      </div>
    </div>
  );
}
