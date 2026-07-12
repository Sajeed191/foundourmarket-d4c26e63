// ============================================================
// VariantImagesSection — per-COLOUR image galleries inside the
// Variant Builder. Each colour manages its own gallery: bulk
// upload (responsive WebP variants), drag & drop reorder, delete,
// replace, set-as-thumbnail, live counter, and a configurable
// per-product maximum. Saving a colour syncs its first image into
// every variant of that colour (cart/checkout/order thumbnail).
// ============================================================
import { useEffect, useRef, useState } from "react";
import { Images, Loader2, Trash2, Star, GripVertical, Save, Check } from "lucide-react";
import { toast } from "sonner";
import { MediaUploader } from "@/components/admin/MediaUploader";
import {
  fetchAdminColorGalleries,
  fetchVariantImageMax,
  setVariantImageMax,
  saveColorGallery,
  newImgId,
  type VariantImageDraft,
} from "@/lib/variant-images";

type ColorInfo = { color: string; hex: string | null };

export function VariantImagesSection({
  slug,
  colors,
}: {
  slug: string;
  colors: ColorInfo[];
}) {
  const [loading, setLoading] = useState(true);
  const [galleries, setGalleries] = useState<Record<string, VariantImageDraft[]>>({});
  const [max, setMax] = useState<number | null>(null);
  const [maxInput, setMaxInput] = useState("");

  useEffect(() => {
    let active = true;
    setLoading(true);
    (async () => {
      const [g, m] = await Promise.all([fetchAdminColorGalleries(slug), fetchVariantImageMax(slug)]);
      if (!active) return;
      setGalleries(g);
      setMax(m);
      setMaxInput(m == null ? "" : String(m));
      setLoading(false);
    })().catch(() => active && setLoading(false));
    return () => {
      active = false;
    };
  }, [slug]);

  async function commitMax() {
    const trimmed = maxInput.trim();
    const next = trimmed === "" ? null : Math.max(1, Math.trunc(Number(trimmed) || 0));
    setMax(next);
    setMaxInput(next == null ? "" : String(next));
    try {
      await setVariantImageMax(slug, next);
      toast.success(next == null ? "Image limit removed" : `Max ${next} images per colour`);
    } catch (e: any) {
      toast.error("Could not save limit", { description: e?.message });
    }
  }

  if (colors.length === 0) return null;

  return (
    <div className="card-premium rounded-2xl p-4 space-y-4">
      <div className="flex flex-wrap items-center gap-2">
        <Images className="size-4 text-accent" />
        <h3 className="text-sm font-medium">Variant Images</h3>
        <span className="text-[11px] text-muted-foreground">Each colour has its own gallery</span>
        <div className="ml-auto flex items-center gap-2">
          <label className="text-[10px] font-mono uppercase tracking-widest text-muted-foreground">
            Max / colour
          </label>
          <input
            value={maxInput}
            onChange={(e) => setMaxInput(e.target.value.replace(/[^\d]/g, ""))}
            onBlur={commitMax}
            onKeyDown={(e) => e.key === "Enter" && (e.currentTarget as HTMLInputElement).blur()}
            placeholder="∞"
            inputMode="numeric"
            className="w-16 bg-white/[0.03] border border-white/10 rounded-lg px-2 py-1.5 text-sm text-center focus:outline-none focus:border-accent/40"
          />
        </div>
      </div>

      {loading ? (
        <div className="grid place-items-center py-8">
          <Loader2 className="size-5 animate-spin text-accent" />
        </div>
      ) : (
        <div className="space-y-4">
          {colors.map((c) => (
            <ColorGallery
              key={c.color}
              slug={slug}
              color={c.color}
              hex={c.hex}
              max={max}
              initial={galleries[c.color] ?? []}
            />
          ))}
        </div>
      )}
    </div>
  );
}

function ColorGallery({
  slug,
  color,
  hex,
  max,
  initial,
}: {
  slug: string;
  color: string;
  hex: string | null;
  max: number | null;
  initial: VariantImageDraft[];
}) {
  const [images, setImages] = useState<VariantImageDraft[]>(initial);
  const [dirty, setDirty] = useState(false);
  const [saving, setSaving] = useState(false);
  const dragIndex = useRef<number | null>(null);

  const atMax = max != null && images.length >= max;

  function onUploaded(url: string, thumbUrl: string | null, mediumUrl: string | null) {
    setImages((prev) => {
      if (max != null && prev.length >= max) {
        toast.error(`Limit reached — max ${max} images for ${color}`);
        return prev;
      }
      return [...prev, { id: newImgId(), url, thumbUrl, mediumUrl }];
    });
    setDirty(true);
  }

  function remove(id: string) {
    setImages((prev) => prev.filter((i) => i.id !== id));
    setDirty(true);
  }

  function makeThumbnail(id: string) {
    setImages((prev) => {
      const idx = prev.findIndex((i) => i.id === id);
      if (idx <= 0) return prev;
      const next = [...prev];
      const [item] = next.splice(idx, 1);
      next.unshift(item);
      return next;
    });
    setDirty(true);
  }

  function reorder(from: number, to: number) {
    if (from === to) return;
    setImages((prev) => {
      const next = [...prev];
      const [item] = next.splice(from, 1);
      next.splice(to, 0, item);
      return next;
    });
    setDirty(true);
  }

  async function save() {
    setSaving(true);
    try {
      await saveColorGallery(slug, color, images);
      setDirty(false);
      toast.success(`${color} gallery saved`);
    } catch (e: any) {
      toast.error("Save failed", { description: e?.message });
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="rounded-xl border border-white/10 bg-white/[0.02] p-3 space-y-3">
      <div className="flex items-center gap-2">
        <span className="size-4 rounded-full border border-white/20 shrink-0" style={{ background: hex ?? "#111111" }} />
        <span className="text-sm font-medium">{color}</span>
        <span className="rounded-full bg-white/10 px-2 py-0.5 text-[10px] text-muted-foreground">
          {images.length}{max != null ? ` / ${max}` : ""} image{images.length === 1 ? "" : "s"}
        </span>
        {dirty && (
          <button
            type="button"
            onClick={save}
            disabled={saving}
            className="ml-auto inline-flex items-center gap-1.5 rounded-lg bg-accent px-3 py-1.5 text-xs font-semibold text-accent-foreground hover:brightness-110 disabled:opacity-50"
          >
            {saving ? <Loader2 className="size-3.5 animate-spin" /> : <Save className="size-3.5" />} Save
          </button>
        )}
        {!dirty && images.length > 0 && (
          <span className="ml-auto inline-flex items-center gap-1 text-[11px] text-emerald-400">
            <Check className="size-3.5" /> Saved
          </span>
        )}
      </div>

      {images.length > 0 && (
        <div className="grid grid-cols-3 sm:grid-cols-4 gap-2">
          {images.map((img, i) => (
            <div
              key={img.id}
              draggable
              onDragStart={() => (dragIndex.current = i)}
              onDragOver={(e) => e.preventDefault()}
              onDrop={() => {
                if (dragIndex.current != null) reorder(dragIndex.current, i);
                dragIndex.current = null;
              }}
              className={`group relative aspect-square overflow-hidden rounded-lg border ${
                i === 0 ? "border-accent/60 ring-1 ring-accent/40" : "border-white/10"
              } bg-black/20`}
            >
              <img
                src={img.thumbUrl ?? img.url}
                alt={`${color} ${i + 1}`}
                loading="lazy"
                className="size-full object-cover"
              />
              {i === 0 && (
                <span className="absolute left-1 top-1 inline-flex items-center gap-0.5 rounded bg-accent px-1.5 py-0.5 text-[9px] font-semibold text-accent-foreground">
                  <Star className="size-2.5 fill-current" /> Thumb
                </span>
              )}
              <span className="absolute right-1 top-1 grid size-5 place-items-center rounded bg-black/50 text-white/70 opacity-0 group-hover:opacity-100 cursor-grab">
                <GripVertical className="size-3" />
              </span>
              <div className="absolute inset-x-0 bottom-0 flex justify-between gap-1 bg-gradient-to-t from-black/70 to-transparent p-1 opacity-0 transition-opacity group-hover:opacity-100">
                {i !== 0 && (
                  <button
                    type="button"
                    onClick={() => makeThumbnail(img.id)}
                    title="Set as thumbnail"
                    className="grid size-6 place-items-center rounded bg-white/15 text-white hover:bg-accent hover:text-accent-foreground"
                  >
                    <Star className="size-3" />
                  </button>
                )}
                <button
                  type="button"
                  onClick={() => remove(img.id)}
                  title="Delete image"
                  className="ml-auto grid size-6 place-items-center rounded bg-white/15 text-white hover:bg-destructive"
                >
                  <Trash2 className="size-3" />
                </button>
              </div>
            </div>
          ))}
        </div>
      )}

      {atMax ? (
        <p className="text-[11px] text-muted-foreground">
          Maximum of {max} images reached for {color}. Delete one to add more.
        </p>
      ) : (
        <MediaUploader
          entityType="product"
          entityRef={slug}
          compact
          label={`Add ${color} images`}
          onComplete={(done) =>
            onUploaded(
              done.variants.large_url || done.variants.url,
              done.variants.thumb_url,
              done.variants.medium_url,
            )
          }
        />
      )}
    </div>
  );
}
