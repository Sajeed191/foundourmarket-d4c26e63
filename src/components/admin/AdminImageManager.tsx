import { useRef, useState } from "react";
import { motion, AnimatePresence, Reorder } from "framer-motion";
import { toast } from "sonner";
import { useServerFn } from "@tanstack/react-start";
import {
  Trash2,
  ChevronsUp,
  ChevronsDown,
  ArrowUp,
  ArrowDown,
  Star,
  X,
  ImageIcon,
  Replace,
  GripVertical,
} from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { cn } from "@/lib/utils";
import type { Product, ProductImage } from "@/lib/products";
import { fetchProductImages } from "@/lib/products";
import { adminUpdateProduct } from "@/lib/admin-products.functions";
import { invalidateProducts } from "@/lib/use-products";
import { MediaUploader } from "@/components/admin/MediaUploader";
import {
  logMediaEvent,
  processAndUpload,
  validateFile,
} from "@/lib/media-engine";

/**
 * Admin-only gallery manager powered by the shared media engine.
 * Uploads are auto-optimized (thumb/medium/large/original), recorded in the
 * media library, audit-logged, and support drag reorder, replace, and cleanup.
 */
export function AdminImageManager({
  product,
  images,
  onChanged,
}: {
  product: Product;
  images: ProductImage[];
  onChanged: (next: ProductImage[]) => void;
}) {
  const update = useServerFn(adminUpdateProduct);
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const replaceRef = useRef<HTMLInputElement>(null);
  const replaceTarget = useRef<ProductImage | null>(null);

  async function refresh() {
    const next = await fetchProductImages(product.slug);
    onChanged(next);
    await invalidateProducts();
  }

  async function handleUploaded(variants: { url: string; medium_url: string }) {
    // record gallery row at the end of the current order
    const order = images.length;
    const { error } = await supabase.from("product_images").insert({
      product_slug: product.slug,
      url: variants.medium_url || variants.url,
      alt: product.name,
      sort_order: order,
    });
    if (error) {
      toast.error("Could not attach image", { description: error.message });
      return;
    }
    await refresh();
  }

  async function remove(img: ProductImage) {
    setBusy(true);
    try {
      const { error } = await supabase.from("product_images").delete().eq("id", img.id);
      if (error) throw new Error(error.message);
      // storage cleanup for media-engine assets sharing this url
      await supabase.from("media_assets").delete().eq("url", img.url);
      await logMediaEvent("delete", {
        entityType: "product",
        entityRef: product.slug,
        meta: { url: img.url },
      });
      await refresh();
      toast.success("Image removed");
    } catch (e) {
      toast.error("Remove failed", {
        description: e instanceof Error ? e.message : "Try again.",
      });
    } finally {
      setBusy(false);
    }
  }

  async function persistOrder(ordered: ProductImage[]) {
    setBusy(true);
    try {
      await Promise.all(
        ordered.map((img, i) =>
          supabase.from("product_images").update({ sort_order: i }).eq("id", img.id),
        ),
      );
      await logMediaEvent("reorder", {
        entityType: "product",
        entityRef: product.slug,
        meta: { order: ordered.map((i) => i.id) },
      });
      await refresh();
    } catch (e) {
      toast.error("Reorder failed", {
        description: e instanceof Error ? e.message : "Try again.",
      });
    } finally {
      setBusy(false);
    }
  }

  function moveTo(index: number, target: number) {
    if (target < 0 || target >= images.length || target === index) return;
    const next = [...images];
    const [item] = next.splice(index, 1);
    next.splice(target, 0, item);
    onChanged(next);
    void persistOrder(next);
  }

  async function setCover(img: ProductImage) {
    setBusy(true);
    try {
      await update({ data: { slug: product.slug, image: img.url } });
      await invalidateProducts();
      await logMediaEvent("thumbnail_change", {
        entityType: "product",
        entityRef: product.slug,
        meta: { url: img.url },
      });
      toast.success("Primary image updated");
    } catch (e) {
      toast.error("Update failed", {
        description: e instanceof Error ? e.message : "Try again.",
      });
    } finally {
      setBusy(false);
    }
  }

  async function handleReplaceFile(file: File | null) {
    const img = replaceTarget.current;
    if (!file || !img) return;
    const err = validateFile(file);
    if (err) {
      toast.error(err);
      return;
    }
    setBusy(true);
    try {
      const res = await processAndUpload(file, {
        entityType: "product",
        entityRef: product.slug,
      });
      const newUrl = res.variants.medium_url || res.variants.url;
      // keep the same row + position + metadata; swap the url only
      const { error } = await supabase
        .from("product_images")
        .update({ url: newUrl })
        .eq("id", img.id);
      if (error) throw new Error(error.message);
      if (img.url === product.image) {
        await update({ data: { slug: product.slug, image: newUrl } });
      }
      await logMediaEvent("replace", {
        entityType: "product",
        entityRef: product.slug,
        meta: { from: img.url, to: newUrl },
      });
      await refresh();
      toast.success("Image replaced");
    } catch (e) {
      toast.error("Replace failed", {
        description: e instanceof Error ? e.message : "Try again.",
      });
    } finally {
      setBusy(false);
      replaceTarget.current = null;
      if (replaceRef.current) replaceRef.current.value = "";
    }
  }

  return (
    <>
      <button
        onClick={() => setOpen(true)}
        className="absolute bottom-4 left-4 z-20 flex items-center gap-1.5 rounded-full border border-accent/40 bg-background/70 px-3 py-1.5 text-[10px] font-mono uppercase tracking-widest text-accent backdrop-blur-xl shadow-[0_8px_30px_-8px_oklch(0.74_0.19_49/0.5)] transition-all hover:bg-accent/10"
      >
        <ImageIcon className="size-3.5" /> Edit images ({images.length})
      </button>

      <input
        ref={replaceRef}
        type="file"
        accept="image/*"
        className="hidden"
        onChange={(e) => handleReplaceFile(e.target.files?.[0] ?? null)}
      />

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
                    <ImageIcon className="size-4" />
                  </span>
                  <div>
                    <h2 className="font-display font-semibold leading-tight">Image manager</h2>
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

              <div className="mb-4">
                <MediaUploader
                  entityType="product"
                  entityRef={product.slug}
                  compact
                  onComplete={(done) => handleUploaded(done.variants)}
                />
              </div>

              {images.length === 0 ? (
                <p className="rounded-xl border border-dashed border-white/10 px-4 py-8 text-center text-xs text-muted-foreground">
                  No gallery images yet. Upload to build the gallery.
                </p>
              ) : (
                <Reorder.Group
                  axis="y"
                  values={images}
                  onReorder={onChanged}
                  className="space-y-2"
                >
                  {images.map((img, i) => {
                    const isCover = img.url === product.image;
                    return (
                      <Reorder.Item
                        key={img.id}
                        value={img}
                        onDragEnd={() => persistOrder(images)}
                        className="flex items-center gap-2 rounded-xl border border-white/10 bg-white/[0.02] p-2"
                      >
                        <GripVertical className="size-4 shrink-0 cursor-grab text-muted-foreground" />
                        <img
                          src={img.url}
                          alt={img.alt || product.name}
                          loading="lazy"
                          className="size-14 shrink-0 rounded-lg object-cover"
                        />
                        <div className="min-w-0 flex-1">
                          <p className="truncate text-xs text-foreground">{img.alt || "—"}</p>
                          {isCover && (
                            <span className="mt-1 inline-flex items-center gap-1 text-[9px] font-mono uppercase tracking-widest text-accent">
                              <Star className="size-2.5 fill-accent" /> Primary
                            </span>
                          )}
                        </div>
                        <div className="grid shrink-0 grid-cols-3 gap-1">
                          <IconBtn label="Move first" disabled={busy || i === 0} onClick={() => moveTo(i, 0)}>
                            <ChevronsUp className="size-3.5" />
                          </IconBtn>
                          <IconBtn label="Move up" disabled={busy || i === 0} onClick={() => moveTo(i, i - 1)}>
                            <ArrowUp className="size-3.5" />
                          </IconBtn>
                          <IconBtn label="Set primary" disabled={busy || isCover} onClick={() => setCover(img)}>
                            <Star className={cn("size-3.5", isCover && "fill-accent text-accent")} />
                          </IconBtn>
                          <IconBtn label="Move last" disabled={busy || i === images.length - 1} onClick={() => moveTo(i, images.length - 1)}>
                            <ChevronsDown className="size-3.5" />
                          </IconBtn>
                          <IconBtn label="Move down" disabled={busy || i === images.length - 1} onClick={() => moveTo(i, i + 1)}>
                            <ArrowDown className="size-3.5" />
                          </IconBtn>
                          <IconBtn
                            label="Replace"
                            disabled={busy}
                            onClick={() => {
                              replaceTarget.current = img;
                              replaceRef.current?.click();
                            }}
                          >
                            <Replace className="size-3.5" />
                          </IconBtn>
                        </div>
                        <IconBtn label="Delete" disabled={busy} onClick={() => remove(img)} danger>
                          <Trash2 className="size-3.5" />
                        </IconBtn>
                      </Reorder.Item>
                    );
                  })}
                </Reorder.Group>
              )}
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </>
  );
}

function IconBtn({
  children,
  label,
  onClick,
  disabled,
  danger,
}: {
  children: React.ReactNode;
  label: string;
  onClick: () => void;
  disabled?: boolean;
  danger?: boolean;
}) {
  return (
    <button
      aria-label={label}
      title={label}
      onClick={onClick}
      disabled={disabled}
      className={cn(
        "grid size-7 place-items-center rounded-md border border-white/10 text-muted-foreground transition-all disabled:opacity-30",
        danger ? "hover:border-destructive/50 hover:text-destructive" : "hover:border-accent/40 hover:text-accent",
      )}
    >
      {children}
    </button>
  );
}
