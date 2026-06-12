// ============================================================
// Product media fields — premium gallery + video uploaders that
// replace the legacy URL inputs. Backend logic is preserved:
// images live in product_images (+ products.image as primary),
// video uploads to storage and the public URL is written to the
// product's video_url column via the section form.
// ============================================================
import { useCallback, useEffect, useRef, useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { toast } from "sonner";
import {
  ImagePlus, Camera, Trash2, Star, Loader2, ArrowLeft, ArrowRight,
  Film, Play, UploadCloud, X, RefreshCw,
} from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { cn } from "@/lib/utils";
import { resolveImage, fetchProductImages, type ProductImage } from "@/lib/products";
import { invalidateProducts } from "@/lib/use-products";
import {
  processAndUpload, validateFile, logMediaEvent, xhrUpload,
} from "@/lib/media-engine";

const SUPABASE_KEY = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY as string;
const MAX_IMAGES = 10;

/* ============================ Image Gallery ============================ */

export function ProductMediaGallery({
  slug, name, primaryUrl, onPrimaryChange, onCountChange,
}: {
  slug: string;
  name: string;
  primaryUrl: string | null;
  onPrimaryChange: (url: string) => void;
  onCountChange?: (count: number) => void;
}) {
  const [images, setImages] = useState<ProductImage[]>([]);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [dragging, setDragging] = useState(false);
  const [uploads, setUploads] = useState<{ id: string; name: string; progress: number; error?: string }[]>([]);
  const fileRef = useRef<HTMLInputElement>(null);
  const cameraRef = useRef<HTMLInputElement>(null);

  const refresh = useCallback(async () => {
    const next = await fetchProductImages(slug);
    setImages(next);
    onCountChange?.(next.length);
  }, [slug, onCountChange]);

  useEffect(() => {
    let on = true;
    fetchProductImages(slug).then((rows) => {
      if (!on) return;
      setImages(rows);
      onCountChange?.(rows.length);
      setLoading(false);
    });
    return () => { on = false; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [slug]);

  async function handleFiles(list: FileList | File[]) {
    const files = Array.from(list);
    const room = MAX_IMAGES - images.length;
    if (room <= 0) { toast.error(`Maximum ${MAX_IMAGES} images reached`); return; }
    const batch = files.slice(0, room);
    if (files.length > room) toast.warning(`Only ${room} more image${room === 1 ? "" : "s"} can be added`);

    setBusy(true);
    for (const file of batch) {
      const err = validateFile(file);
      if (err) { toast.error(err); continue; }
      const uid = crypto.randomUUID();
      setUploads((u) => [...u, { id: uid, name: file.name, progress: 0 }]);
      try {
        const res = await processAndUpload(file, {
          entityType: "product",
          entityRef: slug,
          alt: name,
          onProgress: (p) => setUploads((u) => u.map((x) => x.id === uid ? { ...x, progress: p.total ? p.loaded / p.total : 0 } : x)),
        });
        const url = res.variants.medium_url || res.variants.url;
        const { error } = await supabase.from("product_images").insert({
          product_slug: slug, url, alt: name, sort_order: images.length,
        });
        if (error) throw new Error(error.message);
        // First image auto-becomes the primary.
        if (!primaryUrl) {
          await supabase.from("products").update({ image: url, updated_at: new Date().toISOString() }).eq("slug", slug);
          onPrimaryChange(url);
        }
        setUploads((u) => u.map((x) => x.id === uid ? { ...x, progress: 1 } : x));
      } catch (e) {
        setUploads((u) => u.map((x) => x.id === uid ? { ...x, error: e instanceof Error ? e.message : "Upload failed" } : x));
      }
    }
    await refresh();
    await invalidateProducts();
    setBusy(false);
    setTimeout(() => setUploads((u) => u.filter((x) => x.error)), 1200);
  }

  async function setPrimary(img: ProductImage) {
    setBusy(true);
    const { error } = await supabase.from("products").update({ image: img.url, updated_at: new Date().toISOString() }).eq("slug", slug);
    setBusy(false);
    if (error) { toast.error("Could not set primary", { description: error.message }); return; }
    onPrimaryChange(img.url);
    await invalidateProducts();
    void logMediaEvent("thumbnail_change", { entityType: "product", entityRef: slug, meta: { url: img.url } });
    toast.success("Primary image updated");
  }

  async function remove(img: ProductImage) {
    setBusy(true);
    try {
      const { error } = await supabase.from("product_images").delete().eq("id", img.id);
      if (error) throw new Error(error.message);
      await supabase.from("media_assets").delete().eq("url", img.url);
      const remaining = images.filter((i) => i.id !== img.id);
      // If we removed the primary, promote the first remaining image.
      if (img.url === primaryUrl) {
        const nextPrimary = remaining[0]?.url ?? null;
        await supabase.from("products").update({ image: nextPrimary, updated_at: new Date().toISOString() }).eq("slug", slug);
        onPrimaryChange(nextPrimary ?? "");
      }
      await refresh();
      await invalidateProducts();
      void logMediaEvent("delete", { entityType: "product", entityRef: slug, meta: { url: img.url } });
      toast.success("Image removed");
    } catch (e) {
      toast.error("Remove failed", { description: e instanceof Error ? e.message : "Try again." });
    } finally { setBusy(false); }
  }

  async function move(index: number, dir: -1 | 1) {
    const target = index + dir;
    if (target < 0 || target >= images.length) return;
    const next = [...images];
    const [item] = next.splice(index, 1);
    next.splice(target, 0, item);
    setImages(next);
    setBusy(true);
    try {
      await Promise.all(next.map((img, i) => supabase.from("product_images").update({ sort_order: i }).eq("id", img.id)));
      await invalidateProducts();
    } catch {
      toast.error("Reorder failed");
      await refresh();
    } finally { setBusy(false); }
  }

  const atLimit = images.length >= MAX_IMAGES;

  return (
    <div className="space-y-3">
      <input ref={fileRef} type="file" accept="image/jpeg,image/png,image/webp" multiple className="hidden"
        onChange={(e) => { if (e.target.files) handleFiles(e.target.files); e.target.value = ""; }} />
      <input ref={cameraRef} type="file" accept="image/*" capture="environment" className="hidden"
        onChange={(e) => { if (e.target.files) handleFiles(e.target.files); e.target.value = ""; }} />

      <div className="flex items-center justify-between gap-2">
        <div className="flex items-center gap-2 text-[10px] font-mono uppercase tracking-[0.2em] text-muted-foreground">
          <span>{images.length}/{MAX_IMAGES} images</span>
        </div>
        <div className="flex gap-2">
          <button type="button" disabled={atLimit || busy} onClick={() => cameraRef.current?.click()}
            className="inline-flex items-center gap-1.5 rounded-full border border-white/10 bg-white/[0.03] px-3 py-1.5 text-xs font-medium text-muted-foreground transition-all hover:text-foreground hover:border-white/20 active:scale-[0.97] disabled:opacity-40">
            <Camera className="size-3.5" /> Camera
          </button>
          <button type="button" disabled={atLimit || busy} onClick={() => fileRef.current?.click()}
            className="inline-flex items-center gap-1.5 rounded-full bg-accent px-3.5 py-1.5 text-xs font-semibold text-accent-foreground transition-all hover:brightness-110 active:scale-[0.97] disabled:opacity-40">
            <ImagePlus className="size-3.5" /> Add Images
          </button>
        </div>
      </div>

      {/* Drop zone */}
      <div
        onDragOver={(e) => { e.preventDefault(); setDragging(true); }}
        onDragLeave={() => setDragging(false)}
        onDrop={(e) => { e.preventDefault(); setDragging(false); if (!atLimit && e.dataTransfer.files?.length) handleFiles(e.dataTransfer.files); }}
        onClick={() => !atLimit && fileRef.current?.click()}
        className={cn(
          "rounded-2xl border-2 border-dashed p-5 text-center transition-all cursor-pointer",
          dragging ? "border-accent bg-accent/10" : "border-white/12 bg-white/[0.02] hover:border-accent/40",
          atLimit && "opacity-40 pointer-events-none",
        )}
      >
        <div className="flex flex-col items-center gap-2">
          <span className="grid size-11 place-items-center rounded-2xl border border-accent/30 bg-accent/10 text-accent">
            <UploadCloud className="size-5" />
          </span>
          <p className="text-sm font-medium">Drag & drop or tap to upload</p>
          <p className="text-[11px] text-muted-foreground">JPG · PNG · WEBP · auto-compressed · up to {MAX_IMAGES}</p>
        </div>
      </div>

      {/* Upload progress */}
      <AnimatePresence>
        {uploads.map((u) => (
          <motion.div key={u.id} initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, height: 0 }}
            className="rounded-xl border border-white/10 bg-white/[0.02] p-2.5">
            <div className="flex items-center justify-between gap-2 text-[11px]">
              <span className="truncate">{u.name}</span>
              <span className={u.error ? "text-destructive" : "text-muted-foreground"}>{u.error ? "Failed" : `${Math.round(u.progress * 100)}%`}</span>
            </div>
            <div className="mt-1 h-1.5 overflow-hidden rounded-full bg-white/10">
              <div className={cn("h-full rounded-full transition-all", u.error ? "bg-destructive" : "bg-accent")} style={{ width: `${Math.round(u.progress * 100)}%` }} />
            </div>
          </motion.div>
        ))}
      </AnimatePresence>

      {/* Grid */}
      {loading ? (
        <div className="grid place-items-center py-10"><Loader2 className="size-5 animate-spin text-accent" /></div>
      ) : images.length === 0 ? (
        <p className="rounded-xl border border-dashed border-white/10 px-4 py-6 text-center text-xs text-muted-foreground">
          No images yet — the first image you upload becomes the primary.
        </p>
      ) : (
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
          {images.map((img, i) => {
            const isPrimary = img.url === primaryUrl;
            return (
              <div key={img.id} className={cn(
                "group relative overflow-hidden rounded-xl border bg-white/[0.02]",
                isPrimary ? "border-accent/60 ring-1 ring-accent/40" : "border-white/10",
              )}>
                <div className="aspect-square w-full overflow-hidden bg-white/5">
                  <img src={resolveImage(img.url)} alt={img.alt || name} loading="lazy" className="size-full object-cover" />
                </div>
                {isPrimary && (
                  <span className="absolute left-1.5 top-1.5 inline-flex items-center gap-1 rounded-full bg-accent px-2 py-0.5 text-[9px] font-mono uppercase tracking-widest text-accent-foreground">
                    <Star className="size-2.5 fill-current" /> Primary
                  </span>
                )}
                <div className="absolute inset-x-0 bottom-0 flex items-center justify-between gap-1 bg-gradient-to-t from-black/80 to-transparent p-1.5">
                  <div className="flex gap-1">
                    <GalleryBtn label="Move left" disabled={busy || i === 0} onClick={() => move(i, -1)}><ArrowLeft className="size-3.5" /></GalleryBtn>
                    <GalleryBtn label="Move right" disabled={busy || i === images.length - 1} onClick={() => move(i, 1)}><ArrowRight className="size-3.5" /></GalleryBtn>
                  </div>
                  <div className="flex gap-1">
                    <GalleryBtn label="Set primary" disabled={busy || isPrimary} onClick={() => setPrimary(img)} active={isPrimary}>
                      <Star className={cn("size-3.5", isPrimary && "fill-current")} />
                    </GalleryBtn>
                    <GalleryBtn label="Delete" disabled={busy} onClick={() => remove(img)} danger><Trash2 className="size-3.5" /></GalleryBtn>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

function GalleryBtn({ children, label, onClick, disabled, danger, active }: {
  children: React.ReactNode; label: string; onClick: () => void; disabled?: boolean; danger?: boolean; active?: boolean;
}) {
  return (
    <button type="button" aria-label={label} title={label} onClick={onClick} disabled={disabled}
      className={cn(
        "grid size-7 place-items-center rounded-md border border-white/15 bg-black/40 text-white/80 backdrop-blur transition-all disabled:opacity-30",
        danger ? "hover:border-destructive/60 hover:text-destructive" : "hover:border-accent/60 hover:text-accent",
        active && "border-accent/60 text-accent",
      )}>
      {children}
    </button>
  );
}

/* ============================ Video Uploader ============================ */

const MAX_VIDEO_MB = 100;
const VIDEO_TYPES = ["video/mp4", "video/webm"];

export function ProductVideoUploader({
  slug, value, onChange,
}: {
  slug: string;
  value: string;
  onChange: (url: string) => void;
}) {
  const [progress, setProgress] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  async function handleFile(file: File | null) {
    if (!file) return;
    setError(null);
    if (!VIDEO_TYPES.includes(file.type)) { setError("Only MP4 or WEBM videos are supported"); return; }
    if (file.size > MAX_VIDEO_MB * 1024 * 1024) { setError(`Video exceeds ${MAX_VIDEO_MB}MB`); return; }
    setProgress(0);
    try {
      const ext = file.type === "video/webm" ? "webm" : "mp4";
      const path = `product-video/${slug}/${crypto.randomUUID()}.${ext}`;
      const token = (await supabase.auth.getSession()).data.session?.access_token ?? SUPABASE_KEY;
      await xhrUpload("media", path, file, token, (p) => setProgress(p.total ? p.loaded / p.total : 0));
      const { data } = supabase.storage.from("media").getPublicUrl(path);
      onChange(data.publicUrl);
      void logMediaEvent("upload", { entityType: "product", entityRef: slug, meta: { kind: "video", size: file.size } });
      toast.success("Video uploaded — save to apply");
    } catch (e) {
      setError(e instanceof Error ? e.message : "Upload failed");
    } finally {
      setProgress(null);
    }
  }

  const uploading = progress !== null;

  return (
    <div className="space-y-3">
      <input ref={fileRef} type="file" accept="video/mp4,video/webm" capture="environment" className="hidden"
        onChange={(e) => { handleFile(e.target.files?.[0] ?? null); e.target.value = ""; }} />

      {value ? (
        <div className="overflow-hidden rounded-2xl border border-white/10 bg-black">
          <video src={resolveImage(value)} controls preload="metadata" className="aspect-video w-full bg-black" />
          <div className="flex items-center justify-between gap-2 border-t border-white/10 bg-white/[0.02] p-2.5">
            <span className="inline-flex items-center gap-1.5 text-[11px] text-muted-foreground">
              <Play className="size-3.5 text-accent" /> Product video attached
            </span>
            <div className="flex gap-2">
              <button type="button" onClick={() => fileRef.current?.click()} disabled={uploading}
                className="inline-flex items-center gap-1.5 rounded-full border border-white/10 px-3 py-1.5 text-xs font-medium text-muted-foreground hover:text-foreground hover:border-white/20 disabled:opacity-40">
                <RefreshCw className="size-3.5" /> Replace
              </button>
              <button type="button" onClick={() => onChange("")} disabled={uploading}
                className="inline-flex items-center gap-1.5 rounded-full border border-white/10 px-3 py-1.5 text-xs font-medium text-muted-foreground hover:text-destructive hover:border-destructive/40 disabled:opacity-40">
                <Trash2 className="size-3.5" /> Remove
              </button>
            </div>
          </div>
        </div>
      ) : (
        <button type="button" onClick={() => fileRef.current?.click()} disabled={uploading}
          className="flex w-full flex-col items-center gap-2 rounded-2xl border-2 border-dashed border-white/12 bg-white/[0.02] p-6 text-center transition-all hover:border-accent/40 disabled:opacity-60">
          <span className="grid size-11 place-items-center rounded-2xl border border-accent/30 bg-accent/10 text-accent">
            <Film className="size-5" />
          </span>
          <span className="text-sm font-medium">Upload product video</span>
          <span className="text-[11px] text-muted-foreground">MP4 · WEBM · up to {MAX_VIDEO_MB}MB · camera supported</span>
        </button>
      )}

      {uploading && (
        <div className="rounded-xl border border-white/10 bg-white/[0.02] p-2.5">
          <div className="flex items-center justify-between gap-2 text-[11px] text-muted-foreground">
            <span className="inline-flex items-center gap-1.5"><Loader2 className="size-3.5 animate-spin text-accent" /> Uploading…</span>
            <span>{Math.round((progress ?? 0) * 100)}%</span>
          </div>
          <div className="mt-1 h-1.5 overflow-hidden rounded-full bg-white/10">
            <div className="h-full rounded-full bg-accent transition-all" style={{ width: `${Math.round((progress ?? 0) * 100)}%` }} />
          </div>
        </div>
      )}

      {error && (
        <p className="flex items-center gap-1.5 rounded-lg border border-destructive/30 bg-destructive/10 px-3 py-2 text-xs text-destructive">
          <X className="size-3.5 shrink-0" /> {error}
        </p>
      )}
    </div>
  );
}
